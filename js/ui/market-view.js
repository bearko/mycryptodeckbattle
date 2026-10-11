// マーケット画面（ヒーローの購入・売却・配置）。スマホ1画面に収まるレイアウト。

import { h, img } from "./h.js";
import { compactMaterial, compactUnit, extensionIcon, gumAmount, materialCard, pips, unitCard } from "./components.js";
import { COLUMN_NAMES, materialById, playerById } from "../engine/content.js";
import { MATERIAL_SLOT, WINS_TO_CLEAR, marketOdds, sellValue } from "../engine/balance.js";
import { effectiveRank, rerollCost } from "../engine/market.js";
import { canStartBattle, playerTeam, runMods, targetMaterial } from "../engine/run.js";
import { allUnits, countCopies, mergePreview, mergeProgress } from "../engine/roster.js";

const RARITY_SHORT = ["", "C", "U", "R", "E", "L"];

function stat(label, value, cls = "") {
  return h("div", { class: `stat ${cls}` }, h("small", null, label), h("b", null, value));
}

export function hud(app) {
  const run = app.run;
  const player = playerById(run.playerId);
  return h(
    "header",
    { class: "hud" },
    h(
      "button",
      { class: `hud-avatar ${player.id}`, onClick: () => app.actions.showPlayer(), "aria-label": player.name },
      img(player.images.idle, player.pixelated === false ? "" : "pixel", player.name),
    ),
    stat("ステージ", run.stage),
    stat("ライフ", run.lives, `lives${run.lives <= 3 ? " danger" : ""}`),
    stat("勝利", `${run.wins}/${WINS_TO_CLEAR}`),
    h("div", { class: "hud-gum" }, gumAmount(run.gum, "big")),
    h(
      "div",
      { class: "hud-actions" },
      h("button", { class: "icon-btn", onClick: () => app.actions.showHelp(), "aria-label": "遊び方" }, "?"),
      h("button", { class: "icon-btn", onClick: () => app.actions.toggleSound(), "aria-label": "サウンド" }, app.audio.muted ? "×" : "♪"),
      h("button", { class: "icon-btn", onClick: () => app.actions.confirmQuit(), "aria-label": "メニュー" }, "≡"),
    ),
  );
}

function isSelected(sel, type, a, b) {
  if (!sel || sel.type !== type) return false;
  return type === "offer" ? sel.index === a : sel.zone === a && sel.index === b;
}

/** 選択中のマーケット枠/ヒーローと同じヒーローの defId（合成相手のハイライト用） */
function selectedDefId(app) {
  const sel = app.ui.selected;
  if (sel?.type === "offer") {
    const o = app.run.market.offers[sel.index];
    return o?.type === "hero" ? o.defId : null;
  }
  if (sel?.type === "unit") return app.run[sel.zone][sel.index]?.defId ?? null;
  return null;
}

function unitProgress(run, unit) {
  const p = mergeProgress(run, unit);
  return p ? pips(p.have, p.need) : null;
}

function slotView(app, zone, index) {
  const run = app.run;
  const unit = run[zone][index];
  const sel = app.ui.selected;
  const matchId = selectedDefId(app);
  const targeting = run.pending[0]?.type === "target";
  const classes = ["slot", zone];
  if (!unit) classes.push("empty");
  if (isSelected(sel, "unit", zone, index)) classes.push("selected");
  if (targeting && unit) classes.push("targetable");
  if (sel && !isSelected(sel, "unit", zone, index)) classes.push("droppable");
  if (unit && matchId === unit.defId && !isSelected(sel, "unit", zone, index) && unit.level < 3) classes.push("match");
  if (app.ui.flash?.zone === zone && app.ui.flash?.index === index) classes.push(app.ui.flash.levelUp ? "levelup" : "flash");

  const el = h(
    "div",
    {
      class: classes.join(" "),
      draggable: unit && !targeting ? "true" : null,
      onClick: () => app.actions.clickSlot(zone, index),
      onDragstart: (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "unit", zone, index }));
        e.dataTransfer.effectAllowed = "move";
      },
      onDragover: (e) => {
        e.preventDefault();
        el.classList.add("dragover");
      },
      onDragleave: () => el.classList.remove("dragover"),
      onDrop: (e) => {
        e.preventDefault();
        el.classList.remove("dragover");
        app.actions.drop(e.dataTransfer.getData("text/plain"), { zone, index });
      },
    },
    unit
      ? unitCard(app.db.def(unit.defId), { level: unit.level, extra: unitProgress(run, unit) })
      : zone === "party"
        ? h("span", { class: "slot-label" }, COLUMN_NAMES[index % COLUMN_NAMES.length])
        : null,
    unit && (unit.permMult || unit.cdReduce) ? h("span", { class: "unit-boost" }, "+") : null,
  );
  return el;
}

function boardSection(app) {
  const run = app.run;
  const team = playerTeam(run, app.db);
  return h(
    "section",
    { class: "board" },
    h(
      "div",
      { class: "board-head" },
      h("span", { class: "party-hp", title: "パーティHP" }, img("assets/battle-icons/hp.png", "mini-icon"), team.maxHp),
    ),
    h(
      "div",
      { class: "party-grid" },
      run.party.map((_, i) => slotView(app, "party", i)),
    ),
    h(
      "div",
      { class: "bench-grid" },
      run.bench.map((_, i) => slotView(app, "bench", i)),
    ),
  );
}

function offerView(app, offer, index) {
  const run = app.run;
  if (!offer) return h("div", { class: `offer sold${index === MATERIAL_SLOT ? " material-slot" : ""}` }, "SOLD");
  const merge = offer.type === "hero" ? mergePreview(run, offer.defId) : null;
  const lv1 = offer.type === "hero" ? countCopies(run, offer.defId, 1) : 0;
  let badge = null;
  if (merge) badge = h("span", { class: "merge-badge" }, `Lv${merge}↑`);
  else if (lv1) badge = h("span", { class: "owned-badge" }, pips(lv1, 3));
  return h(
    "div",
    {
      class: `offer${isSelected(app.ui.selected, "offer", index) ? " selected" : ""}${run.gum >= offer.cost ? "" : " expensive"}${
        offer.type === "material" ? " material-slot" : ""
      }${merge ? " merge-ready" : ""}`,
      draggable: "true",
      onClick: () => app.actions.clickOffer(index),
      onDragstart: (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "offer", index }));
        e.dataTransfer.effectAllowed = "copy";
      },
    },
    offer.type === "hero" ? unitCard(app.db.def(offer.defId), { level: 0 }) : materialCard(materialById(offer.id)),
    badge,
    h("div", { class: "price" }, gumAmount(offer.cost)),
  );
}

function marketSection(app) {
  const run = app.run;
  const odds = marketOdds(effectiveRank(run));
  const cost = rerollCost(run);
  const locked = run.market.locked;
  return h(
    "section",
    { class: "market" },
    h(
      "div",
      { class: "market-head" },
      h("span", { class: "rank-chip", title: "マーケットランク" }, "R", h("b", null, effectiveRank(run))),
      h(
        "div",
        { class: "odds" },
        odds.map((w, i) => (w > 0 ? h("span", { class: `odds-item r${i + 1}` }, `${RARITY_SHORT[i + 1]}${w}`) : null)),
      ),
      h(
        "button",
        { class: "btn small reroll-btn", onClick: () => app.actions.reroll(), "aria-label": "ラインナップ更新" },
        "↻ ",
        cost === 0 ? h("span", { class: "free" }, `×${run.freeRerolls}`) : gumAmount(cost),
      ),
      h(
        "button",
        { class: `btn small lock-btn${locked ? " active" : ""}`, onClick: () => app.actions.toggleLock(), "aria-label": "取り置き" },
        locked ? "取置中" : "取置",
      ),
    ),
    h(
      "div",
      { class: `offers${locked ? " locked" : ""}` },
      run.market.offers.map((o, i) => offerView(app, o, i)),
    ),
  );
}

function infoBar(app) {
  const run = app.run;
  const sel = app.ui.selected;
  const ev = run.pending[0];
  let body;
  if (ev?.type === "target") {
    const m = targetMaterial(ev.id);
    body = h(
      "div",
      { class: "compact target" },
      h("div", { class: "compact-art material" }, img(m.image, "", m.name)),
      h(
        "div",
        { class: "compact-body" },
        h("div", { class: "compact-title" }, h("span", { class: "compact-name" }, m.name)),
        h("div", { class: "compact-fx" }, h("span", { class: "fx-chip" }, m.text)),
      ),
      h("div", { class: "compact-actions" }, h("span", { class: "target-hint" }, "対象を選択")),
    );
  } else if (sel?.type === "offer" && run.market.offers[sel.index]) {
    const offer = run.market.offers[sel.index];
    const merge = offer.type === "hero" ? mergePreview(run, offer.defId) : null;
    const buy = h(
      "button",
      { class: `btn primary${merge ? " merge" : ""}`, onClick: () => app.actions.buy(sel.index) },
      merge ? `Lv${merge}↑` : "購入",
      gumAmount(offer.cost),
    );
    if (offer.type === "hero") {
      const def = app.db.def(offer.defId);
      const lv1 = countCopies(run, offer.defId, 1);
      body = compactUnit(def, {
        progress: lv1 ? h("span", { class: "progress-chip" }, pips(Math.min(3, lv1 + 1), 3, "preview"), `→Lv2`) : null,
        actions: [buy, h("button", { class: "btn small info-btn", onClick: () => app.actions.showUnit(offer.defId) }, "詳細")],
      });
    } else {
      body = compactMaterial(materialById(offer.id), [buy]);
    }
  } else if (sel?.type === "unit" && run[sel.zone][sel.index]) {
    const unit = run[sel.zone][sel.index];
    const def = app.db.def(unit.defId);
    const value = sellValue(def, unit.level, runMods(run, app.db).sellBonus);
    const prog = mergeProgress(run, unit);
    body = compactUnit(def, {
      unit,
      progress: prog ? h("span", { class: "progress-chip" }, pips(prog.have, prog.need), `→Lv${prog.next}`) : null,
      actions: [
        h("button", { class: "btn danger", onClick: () => app.actions.sell(sel.zone, sel.index) }, "売却", gumAmount(`+${value}`)),
        h("button", { class: "btn small info-btn", onClick: () => app.actions.showUnit(unit.defId, sel) }, "詳細"),
      ],
    });
  } else {
    const counts = new Map();
    for (const id of run.extensions) counts.set(id, (counts.get(id) || 0) + 1);
    body = h(
      "div",
      { class: "ext-strip" },
      mergeGuide(app),
      h("span", { class: "strip-label" }, "EXT"),
      counts.size
        ? h(
            "div",
            { class: "ext-list" },
            [...counts.entries()].map(([id, n]) => {
              const el = extensionIcon(app.db.ext(id), n);
              el.addEventListener("click", () => app.actions.showExtension(id));
              return el;
            }),
          )
        : h("span", { class: "strip-empty" }, "—"),
    );
  }
  return h("section", { class: "info-bar" }, body);
}

/** 「同じヒーロー3体 → Lv2」の図解。いちばん合成に近いヒーローの絵を使う */
function mergeGuide(app) {
  const run = app.run;
  const units = allUnits(run)
    .map(({ unit }) => unit)
    .filter((u) => u.level === 1)
    .sort((a, b) => countCopies(run, b.defId, 1) - countCopies(run, a.defId, 1));
  const sample = units[0];
  const image = sample ? app.db.def(sample.defId).image : "assets/icons/mch_icon.png";
  const have = sample ? countCopies(run, sample.defId, 1) : 0;
  return h(
    "button",
    { class: "merge-guide", onClick: () => app.actions.showHelp(), "aria-label": "レベルアップの方法" },
    h(
      "span",
      { class: "guide-row" },
      [0, 1, 2].map((i) => img(image, `pixel guide-unit${i < have ? " on" : ""}`)),
      h("span", { class: "guide-arrow" }, "→"),
      h("span", { class: "guide-lv" }, "Lv2"),
    ),
    h("span", { class: "guide-caption" }, "同じヒーロー3体で"),
  );
}

export function marketScreen(app) {
  const check = canStartBattle(app.run);
  return h(
    "div",
    { class: "screen market-screen" },
    hud(app),
    h("main", { class: "market-main" }, boardSection(app), marketSection(app), infoBar(app)),
    h(
      "footer",
      { class: "market-footer" },
      h(
        "button",
        { class: `btn battle-btn${check.ok ? "" : " off"}`, onClick: () => app.actions.startBattle() },
        "バトル開始",
      ),
    ),
  );
}

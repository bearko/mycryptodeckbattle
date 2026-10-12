// マーケット画面（ヒーローの購入・売却・配置）。スマホ1画面に収まるレイアウト。
// 演出用に、各枠には data-uid、マーケット枠には data-offer を付けている（main.js が参照する）。

import { h, img } from "./h.js";
import { compactMaterial, compactUnit, extensionIcon, gumAmount, materialCard, pips, unitCard } from "./components.js";
import { COLUMN_NAMES, materialById, playerById } from "../engine/content.js";
import { MATERIAL_SLOT, WINS_TO_CLEAR, marketOdds, sellValue } from "../engine/balance.js";
import { bestAffordableOffer, effectiveRank, rerollCost } from "../engine/market.js";
import { canStartBattle, playerTeam, runGoal, runMods, targetMaterial } from "../engine/run.js";
import { areaById, stageLabel } from "../engine/world.js";
import { allUnits, canAcquire, countCopies, mergePreview, mergeProgress } from "../engine/roster.js";

const RARITY_SHORT = ["", "C", "U", "R", "E", "L"];

function stat(label, value, cls = "") {
  return h("div", { class: `stat ${cls}` }, h("small", null, label), h("b", { class: "num" }, value));
}

export function winGauge(wins, total = WINS_TO_CLEAR, label = "勝利") {
  return h(
    "div",
    { class: "win-gauge", "aria-label": `${label} ${wins}/${total}` },
    h("small", null, `${label} ${wins}/${total}`),
    h(
      "div",
      { class: "segs" },
      Array.from({ length: total }, (_, i) => h("i", { class: i < wins ? "on" : "" })),
    ),
  );
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
    run.story ? stat("ステージ", stageLabel(areaById(run.story.areaId), run.story.index), "story-stage") : stat("ステージ", run.stage),
    stat("ライフ", run.lives, `lives${run.lives <= (run.story ? 1 : 3) ? " danger" : ""}`),
    run.story ? winGauge(run.wins, runGoal(run), "ウェーブ") : winGauge(run.wins),
    h("div", { class: "hud-gum" }, gumAmount(run.gum, "big")),
    h(
      "div",
      { class: "hud-actions" },
      h("button", { class: "icon-btn", onClick: () => app.actions.showHelp(), "aria-label": "遊び方" }, "?"),
      h("button", { class: "icon-btn", onClick: () => app.actions.showMenu(), "aria-label": "メニュー" }, "≡"),
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
  if (unit && app.ui.arriving?.has(unit.uid)) classes.push("arriving");
  if (app.ui.flash?.zone === zone && app.ui.flash?.index === index) classes.push(app.ui.flash.levelUp ? "levelup" : "flash");

  const el = h(
    "div",
    {
      class: classes.join(" "),
      dataset: { zone, index: String(index), uid: unit ? String(unit.uid) : "" },
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
      ? unitCard(app.db.def(unit.defId), {
          level: unit.level,
          extra: unitProgress(run, unit),
          seed: (zone === "party" ? 0 : 6) + index,
        })
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
      h("span", { class: "sec-label" }, "PARTY"),
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

// 南京錠（取り置き）。閉じている=取り置き中
const LOCK_CLOSED =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0 1 10 0V10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="4" y="10" width="16" height="11" rx="2.5" fill="currentColor"/><circle cx="12" cy="15.5" r="1.8" fill="#10121a"/></svg>';
const LOCK_OPEN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0 1 9.6-2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="4" y="10" width="16" height="11" rx="2.5" fill="currentColor"/><circle cx="12" cy="15.5" r="1.8" fill="#10121a"/></svg>';

export function lockIcon(locked) {
  return h("span", { class: "lock-icon", html: locked ? LOCK_CLOSED : LOCK_OPEN });
}

function offerView(app, offer, index) {
  const run = app.run;
  const deal = app.ui.deal ? " deal" : "";
  const style = { "--d": `${index * 0.06}s` };
  if (!offer) {
    return h("div", { class: `offer sold${deal}${index === MATERIAL_SLOT ? " material-slot" : ""}`, style }, "SOLD");
  }
  const merge = offer.type === "hero" ? mergePreview(run, offer.defId) : null;
  const lv1 = offer.type === "hero" ? countCopies(run, offer.defId, 1) : 0;
  let badge = null;
  if (merge) badge = h("span", { class: "merge-badge" }, `Lv${merge}↑`);
  else if (lv1) badge = h("span", { class: "owned-badge" }, pips(lv1, 3));
  return h(
    "div",
    {
      class: `offer${deal}${isSelected(app.ui.selected, "offer", index) ? " selected" : ""}${run.gum >= offer.cost ? "" : " expensive"}${
        offer.type === "material" ? " material-slot" : ""
      }${merge ? " merge-ready" : ""}${offer.locked ? " locked" : ""}${
        offer.type === "hero" && run.gum >= offer.cost && !merge && canAcquire(run, offer.defId) ? " buyable" : ""
      }`,
      style,
      dataset: { offer: String(index) },
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
    h(
      "button",
      {
        class: `offer-lock${offer.locked ? " on" : ""}`,
        "aria-label": offer.locked ? "取り置きを解除" : "取り置き",
        onClick: (e) => {
          e.stopPropagation();
          app.actions.toggleOfferLock(index);
        },
      },
      lockIcon(offer.locked),
    ),
  );
}

function marketSection(app) {
  const run = app.run;
  const odds = marketOdds(effectiveRank(run));
  const cost = rerollCost(run);
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
        h("span", { class: "spin" }, "↻"),
        cost === 0 ? h("span", { class: "free" }, `×${run.freeRerolls}`) : gumAmount(cost),
      ),
    ),
    h(
      "div",
      { class: "offers" },
      run.market.offers.map((o, i) => offerView(app, o, i)),
    ),
  );
}

function infoContent(app) {
  const run = app.run;
  const sel = app.ui.selected;
  const ev = run.pending[0];
  if (ev?.type === "target") {
    const m = targetMaterial(ev.id);
    return {
      key: `target-${ev.id}`,
      body: h(
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
      ),
    };
  }
  if (sel?.type === "offer" && run.market.offers[sel.index]) {
    const offer = run.market.offers[sel.index];
    const merge = offer.type === "hero" ? mergePreview(run, offer.defId) : null;
    const short = run.gum < offer.cost;
    const buy = h(
      "button",
      { class: `btn ${short ? "short" : "primary"}${merge ? " merge" : ""}`, onClick: () => app.actions.buy(sel.index) },
      merge ? `Lv${merge}↑` : "購入",
      gumAmount(offer.cost),
    );
    const lock = h(
      "button",
      {
        class: `btn small lock-action${offer.locked ? " on" : ""}${short && !offer.locked ? " primary" : ""}`,
        onClick: () => app.actions.toggleOfferLock(sel.index),
      },
      lockIcon(offer.locked),
      offer.locked ? "解除" : "取置",
    );
    if (offer.type === "hero") {
      const def = app.db.def(offer.defId);
      const lv1 = countCopies(run, offer.defId, 1);
      return {
        key: `offer-${sel.index}-${offer.defId}`,
        body: compactUnit(def, {
          progress: lv1 ? h("span", { class: "progress-chip" }, pips(Math.min(3, lv1 + 1), 3, "preview"), "→Lv2") : null,
          actions: [
            buy,
            h(
              "div",
              { class: "action-row" },
              lock,
              h("button", { class: "btn small info-btn", onClick: () => app.actions.showUnit(offer.defId) }, "詳細"),
            ),
          ],
        }),
      };
    }
    return { key: `offer-${sel.index}-${offer.id}`, body: compactMaterial(materialById(offer.id), [buy, lock]) };
  }
  if (sel?.type === "unit" && run[sel.zone][sel.index]) {
    const unit = run[sel.zone][sel.index];
    const def = app.db.def(unit.defId);
    const value = sellValue(def, unit.level, runMods(run, app.db).sellBonus);
    const prog = mergeProgress(run, unit);
    return {
      key: `unit-${unit.uid}`,
      body: compactUnit(def, {
        unit,
        progress: prog ? h("span", { class: "progress-chip" }, pips(prog.have, prog.need), `→Lv${prog.next}`) : null,
        actions: [
          h("button", { class: "btn danger", onClick: () => app.actions.sell(sel.zone, sel.index) }, "売却", gumAmount(`+${value}`)),
          h("button", { class: "btn small info-btn", onClick: () => app.actions.showUnit(unit.defId, sel) }, "詳細"),
        ],
      }),
    };
  }
  const counts = new Map();
  for (const id of run.extensions) counts.set(id, (counts.get(id) || 0) + 1);
  return {
    key: "idle",
    body: h(
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
    ),
  };
}

function infoBar(app) {
  const { key, body } = infoContent(app);
  const turn = app.ui.infoKey !== undefined && app.ui.infoKey !== key;
  app.ui.infoKey = key;
  return h("section", { class: "info-bar panel" }, h("div", { class: `info-page${turn ? " turn" : ""}` }, body));
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
  const player = playerById(app.run.playerId);
  const screen = h(
    "div",
    { class: "screen market-screen" },
    hud(app),
    h("main", { class: "market-main" }, boardSection(app), marketSection(app), infoBar(app)),
    h(
      "footer",
      { class: "market-footer" },
      h(
        "button",
        {
          class: `btn battle-btn${check.ok ? "" : " off"}${check.ok && bestAffordableOffer(app.run) >= 0 ? " wait" : ""}`,
          onClick: () => app.actions.startBattle(),
        },
        "バトル開始",
      ),
    ),
  );
  screen.style.setProperty("--player", player.color);
  return screen;
}

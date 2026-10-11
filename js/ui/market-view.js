// マーケット画面（ヒーローの購入・売却・配置）。

import { h, img } from "./h.js";
import { extensionIcon, gumAmount, materialCard, materialDetail, unitCard, unitDetail } from "./components.js";
import { COLUMN_NAMES, materialById, playerById } from "../engine/content.js";
import { MATERIAL_SLOT, WINS_TO_CLEAR, START_LIVES, marketOdds } from "../engine/balance.js";
import { effectiveRank, rerollCost } from "../engine/market.js";
import { canStartBattle, playerTeam, runMods, targetMaterial } from "../engine/run.js";

const RARITY_SHORT = ["", "C", "U", "R", "E", "L"];

export function hud(app) {
  const run = app.run;
  return h(
    "header",
    { class: "hud" },
    h("div", { class: "hud-item" }, h("span", { class: "hud-label" }, "ステージ"), h("b", null, run.stage)),
    h(
      "div",
      { class: "hud-item lives" },
      h("span", { class: "hud-label" }, "ライフ"),
      h("b", null, run.lives),
      h("small", null, `/${START_LIVES}`),
      run.revived ? h("span", { class: "revived", title: "復活済み" }, img("assets/battle-icons/resurrection.png", "mini-icon")) : null,
    ),
    h(
      "div",
      { class: "hud-item" },
      h("span", { class: "hud-label" }, "勝利"),
      h("b", null, run.wins),
      h("small", null, `/${WINS_TO_CLEAR}`),
    ),
    h("div", { class: "hud-item gum-item" }, gumAmount(run.gum, "big")),
    h("div", { class: "hud-item" }, h("span", { class: "hud-label" }, "マーケットランク"), h("b", null, effectiveRank(run))),
    h(
      "div",
      { class: "hud-actions" },
      h("button", { class: "icon-btn", onClick: () => app.actions.showHelp(), title: "遊び方・用語集" }, "？"),
      h(
        "button",
        { class: "icon-btn", onClick: () => app.actions.toggleSound(), title: "サウンド" },
        app.audio.muted ? "♪×" : "♪",
      ),
      h("button", { class: "icon-btn", onClick: () => app.actions.confirmQuit(), title: "タイトルへ" }, "≡"),
    ),
  );
}

function isSelected(sel, type, a, b) {
  if (!sel || sel.type !== type) return false;
  return type === "offer" ? sel.index === a : sel.zone === a && sel.index === b;
}

function slotView(app, zone, index) {
  const run = app.run;
  const unit = run[zone][index];
  const sel = app.ui.selected;
  const targeting = run.pending[0]?.type === "target";
  const classes = ["slot", zone];
  if (!unit) classes.push("empty");
  if (isSelected(sel, "unit", zone, index)) classes.push("selected");
  if (targeting && unit) classes.push("targetable");
  if (sel && !isSelected(sel, "unit", zone, index) && (sel.type === "unit" || sel.type === "offer")) classes.push("droppable");
  if (app.ui.flash?.zone === zone && app.ui.flash?.index === index) classes.push("flash");

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
    unit ? unitCard(app.db.def(unit.defId), { level: unit.level }) : h("div", { class: "slot-empty" }, zone === "party" ? "" : "控え"),
    unit && (unit.permMult || unit.cdReduce) ? h("span", { class: "unit-boost", title: "マテリアル等で強化済み" }, "+") : null,
  );
  return el;
}

function boardView(app) {
  const run = app.run;
  const team = playerTeam(run, app.db);
  return h(
    "section",
    { class: "panel board-panel" },
    h(
      "div",
      { class: "panel-head" },
      h("h2", null, "パーティ"),
      h("div", { class: "party-hp" }, img("assets/battle-icons/hp.png", "mini-icon"), `パーティHP ${team.maxHp}`),
    ),
    h(
      "div",
      { class: "col-labels" },
      COLUMN_NAMES.map((n) => h("span", null, n)),
    ),
    h(
      "div",
      { class: "grid party-grid" },
      run.party.map((_, i) => slotView(app, "party", i)),
    ),
    h("div", { class: "panel-head sub" }, h("h3", null, "控え"), h("small", null, "控えのヒーローはバトルに参加しません")),
    h(
      "div",
      { class: "grid bench-grid" },
      run.bench.map((_, i) => slotView(app, "bench", i)),
    ),
  );
}

function offerView(app, offer, index) {
  const sel = app.ui.selected;
  const run = app.run;
  if (!offer) {
    return h("div", { class: `offer sold${index === MATERIAL_SLOT ? " material-slot" : ""}` }, h("span", null, "SOLD"));
  }
  const affordable = run.gum >= offer.cost;
  const card =
    offer.type === "hero" ? unitCard(app.db.def(offer.defId), { level: 0 }) : materialCard(materialById(offer.id));
  const owned =
    offer.type === "hero"
      ? [...run.party, ...run.bench].filter((u) => u && u.defId === offer.defId).length
      : 0;
  const el = h(
    "div",
    {
      class: `offer${isSelected(sel, "offer", index) ? " selected" : ""}${affordable ? "" : " expensive"}${
        offer.type === "material" ? " material-slot" : ""
      }`,
      draggable: "true",
      onClick: () => app.actions.clickOffer(index),
      onDragstart: (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "offer", index }));
        e.dataTransfer.effectAllowed = "copy";
      },
    },
    card,
    owned ? h("span", { class: "owned-badge", title: "所持数（3体で合成）" }, `所持${owned}`) : null,
    h("div", { class: "price" }, gumAmount(offer.cost)),
  );
  return el;
}

function marketView(app) {
  const run = app.run;
  const odds = marketOdds(effectiveRank(run));
  const cost = rerollCost(run);
  const locked = run.market.locked;
  return h(
    "section",
    { class: "panel market-panel" },
    h(
      "div",
      { class: "panel-head" },
      h("h2", null, "マーケット"),
      h(
        "div",
        { class: "odds", title: "マーケットランクごとのレアリティ出現率" },
        odds.map((w, i) => (w > 0 ? h("span", { class: `odds-item r${i + 1}` }, `${RARITY_SHORT[i + 1]} ${w}%`) : null)),
      ),
    ),
    h(
      "div",
      { class: `offers${locked ? " locked" : ""}` },
      run.market.offers.map((o, i) => offerView(app, o, i)),
    ),
    h(
      "div",
      { class: "market-actions" },
      h(
        "button",
        { class: "btn", onClick: () => app.actions.reroll(), disabled: run.pending.length ? true : null },
        "ラインナップ更新 ",
        cost === 0 ? h("span", { class: "free" }, `無料 ×${run.freeRerolls}`) : gumAmount(cost),
      ),
      h(
        "button",
        {
          class: `btn${locked ? " active" : ""}`,
          onClick: () => app.actions.toggleLock(),
          title: "取り置きすると、次のステージも同じラインナップになります",
        },
        locked ? "取り置き中" : "取り置き",
      ),
      h("span", { class: "item-uses" }, run.itemUses > 0 ? "マテリアル購入 残り1回" : "マテリアル購入済み"),
    ),
    h("p", { class: "hint market-hint" }, "タップで詳細、もう一度タップで購入。空いている枠へドラッグしても購入できます。"),
  );
}

function detailView(app) {
  const run = app.run;
  const sel = app.ui.selected;
  const mods = runMods(run, app.db);
  let body = h(
    "div",
    { class: "detail-empty" },
    h("p", null, "ヒーローやマテリアルをタップすると詳細が表示されます。"),
    h(
      "ul",
      { class: "tips" },
      h("li", null, "同じヒーローを3体集めるとLv2、Lv2を2体でLv3に合成。合成するとエクステンションを獲得できます。"),
      h("li", null, "パーティのヒーローをタップ → 別の枠をタップで入れ替え。ドラッグでも動かせます。"),
      h("li", null, "スキルの「隣接する味方」は上下左右の枠です（斜めは含みません）。"),
    ),
  );
  if (sel?.type === "offer") {
    const offer = run.market.offers[sel.index];
    if (offer?.type === "hero") {
      body = unitDetail(app.db.def(offer.defId), {
        actions: h("button", { class: "btn primary", onClick: () => app.actions.buy(sel.index) }, "購入する ", gumAmount(offer.cost)),
      });
    } else if (offer?.type === "material") {
      body = materialDetail(
        materialById(offer.id),
        h("button", { class: "btn primary", onClick: () => app.actions.buy(sel.index) }, "購入する ", gumAmount(offer.cost)),
      );
    }
  } else if (sel?.type === "unit") {
    const unit = run[sel.zone][sel.index];
    if (unit) {
      const def = app.db.def(unit.defId);
      body = unitDetail(def, {
        unit,
        sellBonus: mods.sellBonus,
        actions: [
          h("button", { class: "btn danger", onClick: () => app.actions.sell(sel.zone, sel.index) }, "売却する"),
          h("span", { class: "hint" }, "別の枠をタップすると移動します"),
        ],
      });
    }
  }
  return h("section", { class: "panel detail-panel" }, body);
}

function playerPanel(app) {
  const run = app.run;
  const player = playerById(run.playerId);
  const counts = new Map();
  for (const id of run.extensions) counts.set(id, (counts.get(id) || 0) + 1);
  return h(
    "section",
    { class: "panel player-panel" },
    h(
      "div",
      { class: "player-card" },
      h(
        "div",
        { class: `player-portrait ${player.id}` },
        img(player.images.idle, player.pixelated === false ? "" : "pixel", player.name),
      ),
      h(
        "div",
        { class: "player-info" },
        h("div", { class: "player-name" }, player.name),
        h("div", { class: "player-skill" }, h("b", null, `プレイヤースキル「${player.skillName}」`), h("p", null, player.text)),
      ),
    ),
    h(
      "div",
      { class: "ext-list" },
      h("h3", null, "エクステンション"),
      counts.size
        ? h(
            "div",
            { class: "ext-icons" },
            [...counts.entries()].map(([id, n]) => {
              const ext = app.db.ext(id);
              const el = extensionIcon(ext, n);
              el.addEventListener("click", () => app.actions.showExtension(id));
              return el;
            }),
          )
        : h("p", { class: "hint" }, "合成や宝箱で獲得できます"),
    ),
  );
}

function targetBanner(app) {
  const ev = app.run.pending[0];
  if (ev?.type !== "target") return null;
  const m = targetMaterial(ev.id);
  return h(
    "div",
    { class: "target-banner" },
    img(m.image, "mini-icon"),
    h("span", null, `${m.name}：${m.text}。対象のヒーローをタップしてください。`),
  );
}

export function marketScreen(app) {
  const run = app.run;
  const check = canStartBattle(run);
  return h(
    "div",
    { class: "screen market-screen" },
    hud(app),
    targetBanner(app),
    h(
      "main",
      { class: "market-layout" },
      boardView(app),
      marketView(app),
      detailView(app),
      playerPanel(app),
    ),
    h(
      "footer",
      { class: "market-footer" },
      h(
        "button",
        {
          class: "btn battle-btn",
          disabled: check.ok ? null : true,
          title: check.ok ? "" : check.error,
          onClick: () => app.actions.startBattle(),
        },
        "バトル開始",
      ),
      !check.ok ? h("span", { class: "hint" }, check.error) : null,
    ),
  );
}


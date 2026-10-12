// ストーリーの画面: ワールドマップ・ステージ選択・デッキ・ステージ結果。
// 説明文は最小限にし、状態（開放・クリア・パーツ）はアイコンと色で見せる。

import { h, img } from "./h.js";
import { unitCard } from "./components.js";
import { lockIcon } from "./market-view.js";
import {
  AREAS,
  DECK_SIZE,
  ERAS,
  STAGE_WAVES,
  areaById,
  areaName,
  eraById,
  heroId,
  machineByLevel,
  stageKey,
  stageLabel,
} from "../engine/world.js";
import { areaCleared, areaUnlocked, eraUnlocked, isCleared, machineInfo, nextStage, stageUnlocked } from "../engine/story.js";

const bgUrl = (id) => `assets/backgrounds/${id}.webp`;

/** 大陸のおおまかな形（横100×縦70 の座標。地図はこの比率のまま描くので歪まない） */
const CONTINENTS = [
  // 北アメリカ・グリーンランド
  "8,12 14,9 22,8 30,9 34,12 31,15 28,16 30,19 27,24 24,27 22,31 20,33 18,30 15,29 13,25 10,21 6,17",
  "33,5 38,4 40,7 37,10 34,9",
  // 南アメリカ
  "24,36 28,35 33,38 35,42 33,48 30,53 28,60 26,62 25,56 24,48 22,42",
  // ヨーロッパ・イギリス
  "46,10 50,8 54,9 57,11 56,14 53,16 52,19 49,21 47,19 45,20 44,16 46,14",
  "43,11 45,10 46,13 44,14",
  // アフリカ
  "46,24 52,23 57,25 60,30 62,33 59,38 57,44 55,50 52,54 50,52 49,46 47,40 45,34 44,28",
  // アジア・インド・日本
  "57,9 64,6 74,5 84,7 92,10 95,14 91,17 88,22 85,26 81,30 78,34 74,36 71,33 68,36 66,32 63,28 60,24 58,20 56,15",
  "66,30 70,30 69,37 67,35",
  "87,19 89,20 90,24 88,27 86,25",
  // オーストラリア
  "80,46 86,44 92,46 94,52 90,57 84,56 80,52",
];

function header(title, sub, { back, right = null } = {}) {
  return h(
    "header",
    { class: "story-head" },
    back ? h("button", { class: "icon-btn back-btn", onClick: back, "aria-label": "戻る" }, "◀") : h("span"),
    h("div", { class: "story-title" }, h("b", null, title), sub ? h("small", null, sub) : null),
    right ?? h("span"),
  );
}

/** 次の合体ロボのアートを必要数に分割したパーツ（集めた分だけ光る） */
export function partPieces(story, { size = "" } = {}) {
  const info = machineInfo(story);
  if (!info.nextMachine) return h("div", { class: "parts done" }, "MAX");
  const n = info.need;
  return h(
    "div",
    { class: `parts ${size}`, style: { "--n": n }, "aria-label": `パーツ ${info.parts}/${n}` },
    Array.from({ length: n }, (_, i) =>
      h("i", {
        class: `piece${i < info.parts ? " on" : ""}`,
        style: {
          backgroundImage: `url("${info.nextMachine.image}")`,
          backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% 50%`,
        },
      }),
    ),
  );
}

/** タイムマシンの状態（合体ロボのアート・名前・パーツ） */
export function machinePanel(story) {
  const info = machineInfo(story);
  return h(
    "div",
    { class: "machine-panel panel" },
    h("div", { class: `machine-thumb r${info.rarity}` }, img(info.image, "pixel", info.name)),
    h(
      "div",
      { class: "machine-body" },
      h("small", null, `TIME MACHINE Lv${info.level}`),
      h("b", null, info.short),
      h(
        "div",
        { class: "machine-parts" },
        partPieces(story),
        info.nextMachine ? h("span", { class: "num" }, `${info.parts}/${info.need}`) : null,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// ワールドマップ
// ---------------------------------------------------------------------------

export function worldMapScreen(app) {
  const story = app.story;
  const eraId = app.ui.storyEra ?? "kindai";
  const eras = ERAS.filter((e) => e.id !== "hazama" || eraUnlocked(story, "hazama"));
  const areas = AREAS.filter((a) => a.era === eraId);
  return h(
    "div",
    { class: "screen story-screen map-screen" },
    header("ワールドマップ", "TIME MACHINE", {
      back: () => app.actions.toTitle(),
      right: h("button", { class: "btn small deck-btn", onClick: () => app.actions.openDeck("map") }, "デッキ"),
    }),
    h(
      "nav",
      { class: "era-tabs" },
      eras.map((e) => {
        const open = eraUnlocked(story, e.id);
        return h(
          "button",
          {
            class: `era-tab${e.id === eraId ? " active" : ""}${open ? "" : " locked"}`,
            onClick: () => app.actions.selectEra(e.id),
          },
          open ? null : lockIcon(true),
          h("b", null, e.name),
          h("small", null, e.en),
        );
      }),
    ),
    h(
      "div",
      { class: "world-map" },
      h(
        "div",
        { class: "map-canvas" },
        h("div", {
          class: "map-svg",
          html: `<svg viewBox="0 0 100 70" preserveAspectRatio="none">${CONTINENTS.map((pts) => `<polygon points="${pts}" class="land"/>`).join("")}</svg>`,
        }),
        areas.map((area) => mapPin(app, area)),
      ),
      h("div", { class: "map-era-label" }, h("b", null, eraById(eraId).name), h("small", null, eraById(eraId).years)),
    ),
    machinePanel(story),
  );
}

function mapPin(app, area) {
  const story = app.story;
  const open = areaUnlocked(story, area);
  const cleared = areaCleared(story, area);
  const done = area.stages.filter((_, i) => isCleared(story, stageKey(area.id, i))).length;
  const cls = cleared ? "cleared" : open ? "open" : "locked";
  return h(
    "button",
    {
      class: `map-pin ${cls}`,
      style: { left: `${area.map.x}%`, top: `${area.map.y}%`, "--area": area.color },
      onClick: () => app.actions.openArea(area.id),
      "aria-label": `${areaName(area)}${open ? "" : "（未開放）"}`,
    },
    h("span", { class: "pin-dot" }, open ? String(area.no) : lockIcon(true)),
    h(
      "span",
      { class: "pin-label" },
      h("b", null, area.region),
      open ? h("small", { class: "num" }, `${done}/${area.stages.length}`) : h("small", null, `Lv${area.machine}`),
    ),
  );
}

// ---------------------------------------------------------------------------
// ステージ選択（タイルが線でつながった道）
// ---------------------------------------------------------------------------

const NODE_POS = [
  { x: 20, y: 74 },
  { x: 52, y: 48 },
  { x: 80, y: 22 },
];

export function areaScreen(app) {
  const story = app.story;
  const area = areaById(app.ui.storyArea);
  const era = eraById(area.era);
  const selected = app.ui.storyStage ?? nextStage(story, area) ?? area.stages.length - 1;
  const path = NODE_POS.map((p) => `${p.x},${p.y}`).join(" ");
  return h(
    "div",
    { class: "screen story-screen area-screen", style: { "--area": area.color } },
    header(areaName(area), `${era.en} · ${era.years}`, {
      back: () => app.actions.openMap(),
      right: h("button", { class: "btn small deck-btn", onClick: () => app.actions.openDeck("area") }, "デッキ"),
    }),
    h(
      "div",
      { class: "stage-map" },
      h("div", {
        class: "stage-path",
        html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${path}" class="path-under"/><polyline points="${path}" class="path-line"/></svg>`,
      }),
      area.stages.map((stage, i) => stageNode(app, area, i, i === selected)),
    ),
    stageCard(app, area, selected),
  );
}

function stageNode(app, area, index, selected) {
  const story = app.story;
  const key = stageKey(area.id, index);
  const cleared = isCleared(story, key);
  const open = stageUnlocked(story, area, index);
  const def = app.db.def(heroId(area.stages[index].meet));
  const pos = NODE_POS[index];
  return h(
    "button",
    {
      class: `stage-node${cleared ? " cleared" : open ? " open" : " locked"}${selected ? " selected" : ""}`,
      style: { left: `${pos.x}%`, top: `${pos.y}%`, "--d": `${0.1 + index * 0.08}s` },
      onClick: () => app.actions.selectStage(index),
    },
    h("span", { class: "node-meet" }, img(def.image, `pixel${open || cleared ? "" : " silhouette"}`, def.name)),
    h("span", { class: "node-tile" }, h("b", { class: "num" }, stageLabel(area, index)), cleared ? h("i", { class: "node-check" }, "✓") : open ? null : lockIcon(true)),
  );
}

function stageCard(app, area, index) {
  const story = app.story;
  const key = stageKey(area.id, index);
  const stage = area.stages[index];
  const open = stageUnlocked(story, area, index);
  const cleared = isCleared(story, key);
  const def = app.db.def(heroId(stage.meet));
  const joins = new Set([...(stage.meetAtStart ? [stage.meet] : []), ...stage.join]);
  return h(
    "section",
    { class: "stage-card panel" },
    h(
      "div",
      { class: "stage-card-head" },
      h("b", { class: "num stage-no" }, stageLabel(area, index)),
      h("span", { class: "wave-chip num" }, `WAVE ${STAGE_WAVES[index]}`),
      cleared ? h("span", { class: "clear-chip" }, "CLEAR") : null,
    ),
    h(
      "div",
      { class: "stage-card-body" },
      h("div", { class: `meet-art r${def.rarity}` }, img(def.image, `pixel${open || cleared ? "" : " silhouette"}`, def.name)),
      h(
        "div",
        { class: "stage-rewards" },
        h("div", { class: "meet-name" }, open || cleared ? def.name : "？？？"),
        h(
          "div",
          { class: "reward-row" },
          h("span", { class: "reward-chip" }, h("small", null, "仲間"), h("b", { class: "num" }, `+${joins.size}`)),
          !cleared && story.machine < 5 ? h("span", { class: "reward-chip part" }, h("small", null, "パーツ"), h("b", { class: "num" }, "+1")) : null,
        ),
      ),
    ),
    h(
      "div",
      { class: "stage-actions" },
      h("button", { class: "btn deck-mini", onClick: () => app.actions.openDeck("area") }, `デッキ ${story.deck.length}/${DECK_SIZE}`),
      h(
        "button",
        { class: `btn primary big sortie-btn${open ? "" : " disabled"}`, onClick: () => app.actions.sortie(key), disabled: open ? null : "true" },
        open ? "出撃" : "未開放",
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// デッキ
// ---------------------------------------------------------------------------

export function deckScreen(app) {
  const story = app.story;
  const draft = app.ui.deckDraft ?? story.deck;
  const heroes = story.heroes
    .map((id) => app.db.def(id))
    .sort((a, b) => b.rarity - a.rarity || a.mch_id - b.mch_id);
  return h(
    "div",
    { class: "screen story-screen deck-screen" },
    header("デッキ", `${draft.length}/${DECK_SIZE}`, { back: () => app.actions.closeDeck(false) }),
    h(
      "div",
      { class: "deck-slots" },
      Array.from({ length: DECK_SIZE }, (_, i) => {
        const id = draft[i];
        if (!id) return h("div", { class: "deck-slot empty" });
        const def = app.db.def(id);
        return h("button", { class: `deck-slot r${def.rarity}`, onClick: () => app.actions.toggleDeck(id) }, img(def.image, "pixel", def.name));
      }),
    ),
    h(
      "div",
      { class: "collection" },
      heroes.map((def, i) => {
        const inDeck = draft.includes(def.id);
        const card = unitCard(def, { compact: true, seed: i });
        return h("button", { class: `collection-item${inDeck ? " in-deck" : ""}`, onClick: () => app.actions.toggleDeck(def.id) }, card, inDeck ? h("i", { class: "deck-check" }, "✓") : null);
      }),
    ),
    h(
      "div",
      { class: "deck-actions" },
      h("button", { class: "btn primary big", onClick: () => app.actions.closeDeck(true) }, "決定"),
    ),
  );
}

// ---------------------------------------------------------------------------
// ステージ結果（クリア / 撤退）
// ---------------------------------------------------------------------------

export function stageResultScreen(app, info) {
  const story = app.story;
  const area = areaById(info.areaId);
  const label = stageLabel(area, info.index);
  if (!info.cleared) {
    return h(
      "div",
      { class: "screen story-screen stage-result failed" },
      h("div", { class: "result-band story" }, h("span", null, "RETREAT")),
      h("div", { class: "result-figure chris" }, img("assets/characters/chris_sad.png", "pixel", "")),
      h(
        "div",
        { class: "stage-result-panel panel" },
        h("div", { class: "result-stage" }, `${label} 撤退`),
        h(
          "div",
          { class: "stage-result-actions" },
          h("button", { class: "btn primary big", onClick: () => app.actions.sortie(stageKey(area.id, info.index)) }, "もう一度"),
          h("button", { class: "btn", onClick: () => app.actions.openArea(area.id) }, "ステージ選択へ"),
        ),
      ),
    );
  }
  const res = info.result;
  return h(
    "div",
    { class: "screen story-screen stage-result cleared" },
    h("div", { class: "result-band story" }, h("span", null, "CLEAR")),
    h("div", { class: "result-figure chris" }, img("assets/characters/chris_cheer.png", "pixel", "")),
    h(
      "div",
      { class: "stage-result-panel panel" },
      h("div", { class: "result-stage" }, `${label} クリア`),
      res.heroes.length
        ? h(
            "div",
            { class: "joined" },
            h("small", { class: "joined-label" }, `仲間になった +${res.heroes.length}`),
            h(
              "div",
              { class: "joined-list" },
              res.heroes.map((id, i) => h("div", { class: "joined-item", style: { "--i": i } }, unitCard(app.db.def(id), { compact: true, seed: i }))),
            ),
          )
        : null,
      res.part
        ? h(
            "div",
            { class: "part-get" },
            h("small", null, res.upgradedTo ? "パーツがそろった！" : "タイムマシンのパーツ"),
            partPiecesFor(story, res),
          )
        : null,
      h("button", { class: "btn primary big", onClick: () => app.actions.afterStageResult() }, "つぎへ"),
    ),
  );
}

/** 改良した直後は、そろったパーツ（改良前の必要数）を全部光らせて見せる */
function partPiecesFor(story, res) {
  if (!res.upgradedTo) return partPieces(story, { size: "big" });
  const prev = machineByLevel(res.upgradedTo - 1);
  const n = prev.next;
  const next = machineByLevel(res.upgradedTo);
  return h(
    "div",
    { class: "parts big complete", style: { "--n": n } },
    Array.from({ length: n }, (_, i) =>
      h("i", {
        class: "piece on",
        style: { backgroundImage: `url("${next.image}")`, backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% 50%` },
      }),
    ),
  );
}

export const storyBackground = (id) => new URL(bgUrl(id), document.baseURI).href;

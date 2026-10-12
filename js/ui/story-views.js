// ストーリーの画面: ワールドマップ・ステージ選択（ノードの中の道）・デッキ・ステージ結果・パーツ獲得。
// 説明文は最小限にし、状態（開放・クリア・パーツ）はアイコンと色で見せる。

import { h, img } from "./h.js";
import { unitCard } from "./components.js";
import { lockIcon } from "./market-view.js";
import {
  AREAS,
  DECK_SIZE,
  ERAS,
  FIELDS,
  FOES,
  STAGE_KINDS,
  areaById,
  areaName,
  eraById,
  heroId,
  machineByLevel,
  nodeMap,
  parseStageKey,
  stageKey,
  stageLabel,
  stageWaves,
} from "../engine/world.js";
import { FACTIONS, KIND_ICONS, KIND_LABELS } from "../engine/content.js";
import {
  areaCleared,
  areaProgress,
  areaUnlocked,
  foePool,
  deckEmptyShare,
  deckProblem,
  eraUnlocked,
  isCleared,
  machineInfo,
  machineProgress,
  canSortie,
  defaultStage,
  nodeRun,
  sortieOptions,
  stageMatch,
  stageRarityOdds,
  stageUnlocked,
  teamTraits,
} from "../engine/story.js";
import { machineCanvas } from "./machine-reveal.js";

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

/** 次の合体ロボのシルエット（進み具合の分だけ実体化）と割合 */
export function nextMachineProgress(story, { cls = "" } = {}) {
  const prog = machineProgress(story);
  if (!prog.next) return h("div", { class: `next-machine done ${cls}` }, h("b", { class: "num" }, "MAX"));
  return h(
    "div",
    { class: `next-machine ${cls}`, "aria-label": `次の改良まで ${Math.round(prog.ratio * 100)}%` },
    h("div", { class: "next-machine-art" }, machineCanvas(prog.next.image, prog.ratio)),
    h("b", { class: "num" }, `${Math.round(prog.ratio * 100)}%`),
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
      info.nextMachine
        ? h("small", { class: "machine-next-note" }, `次の改良まで あと${info.need - info.parts}ノード`)
        : h("small", { class: "machine-next-note" }, "これ以上は改良できません"),
    ),
    nextMachineProgress(story),
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
      right: deckButton(app, "map"),
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
  const { done, total } = areaProgress(story, area);
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
      open ? h("small", { class: "num" }, `${done}/${total}`) : h("small", null, lockedReason(story, area)),
    ),
  );
}

/** 開いていないノードの、開く条件（短く） */
function lockedReason(story, area) {
  if (story.machine < area.machine) return `Lv${area.machine}`;
  if (area.requiresAll) return "全ノード";
  if (area.after) return `${areaById(area.after).region}の次`;
  return "";
}

// ---------------------------------------------------------------------------
// ステージ選択（参考作 のように、下から上へ進む道。後半は3つのレーンに分かれ、最後はレイドボス）
// ---------------------------------------------------------------------------

/** 道の上の位置（地図の横・縦に対する%）。下の行ほど下、レーンは左・真ん中・右 */
function routePos(rows, row, lane) {
  const top = 7;
  const bottom = 93;
  const y = bottom - (row * (bottom - top)) / Math.max(1, rows - 1);
  const x = lane === null || lane === undefined ? 50 : [20, 50, 80][lane];
  return { x, y };
}

/** 出会うヒーローがいないステージに出すエネミー（そのステージのエネミーの傾向の顔ぶれから） */
function stageEnemy(db, area, stage) {
  const pool = foePool(db, area, stage.foe);
  const tier = Math.min(4, Math.floor(stage.row / 2));
  return db.def(pool[tier * 6 + ((stage.lane ?? 0) + stage.row) % 6] ?? pool[0]);
}

/** ステージのタイルに出す絵（出会うヒーロー・エネミー・補給・レイドボス） */
function stageArt(app, area, stage) {
  if (stage.kind === "boss") return { image: app.db.def(area.boss).image, cls: "", def: app.db.def(area.boss) };
  if (stage.kind === "supply") return { image: "assets/icons/gold_dust.webp", cls: "supply-art" };
  if (stage.meet) {
    const def = app.db.def(heroId(stage.meet));
    return { image: def.image, cls: "", def };
  }
  const def = stageEnemy(app.db, area, stage);
  return { image: def.image, cls: "enemy-art", def };
}

const keyOf = (area, st) => stageKey(area.id, st.row, st.lane);

export function areaScreen(app) {
  const story = app.story;
  const area = areaById(app.ui.storyArea);
  const era = eraById(area.era);
  const route = nodeMap(area);
  const selectedKey = app.ui.storyStage ?? defaultStage(story, area);
  const run = nodeRun(story, area.id);
  // 通ってきた道（いまのチームで進んだレーン）
  const walked = (r, lane) => r < run.next && (run.path[r] ?? null) === (lane ?? null);
  const lines = [];
  route.next.forEach((links, r) =>
    links.forEach((targets, i) =>
      targets.forEach((j) => {
        const from = route.rows[r][i];
        const to = route.rows[r + 1][j];
        const a = routePos(route.rows.length, r, from.lane);
        const b = routePos(route.rows.length, r + 1, to.lane);
        const cls = walked(r, from.lane) && (walked(r + 1, to.lane) || (r + 1 === run.next && canSortie(story, area, r + 1, to.lane))) ? "path-line walked" : "path-line";
        lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="path-under"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${cls}"/>`);
      }),
    ),
  );
  return h(
    "div",
    { class: "screen story-screen area-screen route-screen", style: { "--area": area.color } },
    header(areaName(area), `${era.en} · ${era.years}`, {
      back: () => app.actions.openMap(),
      right: deckButton(app, "area"),
    }),
    h(
      "div",
      { class: "stage-map route-map" },
      h("div", { class: "stage-path", html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines.join("")}</svg>` }),
      route.rows.flat().map((st) => stageNode(app, area, st, keyOf(area, st) === selectedKey, walked(st.row, st.lane))),
    ),
    stageCard(app, area, parseStageKey(selectedKey)?.stage ?? route.rows[0][0]),
  );
}

/** デッキのボタン。新しく仲間になったヒーローがデッキの外にいると数を出す */
function deckButton(app, from) {
  const fresh = (app.story.fresh ?? []).filter((id) => !app.story.deck.includes(id)).length;
  return h(
    "button",
    { class: `btn small deck-btn${fresh ? " has-new" : ""}`, onClick: () => app.actions.openDeck(from) },
    "デッキ",
    fresh ? h("i", { class: "new-count num" }, String(fresh)) : null,
  );
}

function stageNode(app, area, stage, selected, walked) {
  const story = app.story;
  const key = keyOf(area, stage);
  const cleared = isCleared(story, key);
  const next = canSortie(story, area, stage.row, stage.lane);
  const known = stageUnlocked(story, area, stage.row, stage.lane);
  const pos = routePos(nodeMap(area).rows.length, stage.row, stage.lane);
  const art = stageArt(app, area, stage);
  const field = stage.field ? FIELDS[stage.field] : null;
  return h(
    "button",
    {
      class: `route-node kind-${stage.kind}${cleared ? " cleared" : ""}${next ? " next" : ""}${walked ? " walked" : ""}${selected ? " selected" : ""}${
        known || next || stage.kind !== "battle" ? "" : " far"
      }`,
      style: { left: `${pos.x}%`, top: `${pos.y}%`, "--d": `${0.05 + stage.row * 0.04}s` },
      onClick: () => app.actions.selectStage(key),
      dataset: { key },
      "aria-label": `${stageLabel(area, stage.row, stage.lane)} ${STAGE_KINDS[stage.kind].name}`,
    },
    h("span", { class: `route-art ${art.cls}` }, img(art.image, `pixel${art.cls === "enemy-art" ? " flip" : ""}`, "")),
    field ? h("span", { class: "route-field" }, fieldIcon(field)) : null,
    stage.kind === "elite" ? h("span", { class: "route-kind" }, "強") : null,
    stage.kind === "boss" ? h("span", { class: "boss-tag" }, "BOSS") : null,
    cleared ? h("i", { class: "node-check" }, "✓") : null,
    next ? h("span", { class: "next-tag" }, "NEXT") : null,
  );
}

/** 地形のアイコン（スキルの種類・勢力・列） */
function fieldIcon(field) {
  if (field.kinds) return img(KIND_ICONS[field.kinds[0]], "field-icon", field.name);
  if (field.faction) return h("i", { class: "field-faction", style: { "--fc": FACTIONS[field.faction].color } }, FACTIONS[field.faction].name[0]);
  return h("i", { class: "field-col" }, field.col === 0 ? "前" : "後");
}

/** 相性の印（◎○－）と、得をするヒーローの数 */
function matchMark(m) {
  if (!m) return null;
  return h("b", { class: `match-mark m${Math.min(2, m.n)}` }, m.mark);
}

function stageCard(app, area, stage) {
  const story = app.story;
  const index = stage.row;
  const key = keyOf(area, stage);
  const cleared = isCleared(story, key);
  const sortie = canSortie(story, area, index, stage.lane);
  const known = stageUnlocked(story, area, index, stage.lane) || sortie;
  const boss = stage.kind === "boss" ? app.db.def(area.boss) : null;
  const meet = stage.meet ? app.db.def(heroId(stage.meet)) : null;
  const joins = new Set([...(stage.meetAtStart ? [stage.meet] : []), ...stage.join]);
  const art = stageArt(app, area, stage);
  const team = nodeRun(story, area.id).team;
  const match = stageMatch(teamTraits(app.db, team), stage);
  const field = stage.field ? FIELDS[stage.field] : null;
  const foe = stage.foe ? FOES[stage.foe] : null;
  const title = boss ? boss.name : meet ? (known ? meet.name : "？？？") : stage.kind === "supply" ? "補給地点" : "エネミーの拠点";
  return h(
    "section",
    { class: `stage-card panel kind-${stage.kind}${boss ? " boss" : ""}` },
    h(
      "div",
      { class: "stage-card-head" },
      h("b", { class: "num stage-no" }, stageLabel(area, index, stage.lane)),
      h("span", { class: `kind-chip kind-${stage.kind}` }, stage.kind === "boss" ? "RAID BOSS" : STAGE_KINDS[stage.kind].name),
      stage.kind !== "supply" ? h("span", { class: "wave-chip num" }, `WAVE ${stageWaves(area, index)}`) : null,
      cleared ? h("span", { class: "clear-chip" }, "CLEAR") : null,
    ),
    h(
      "div",
      { class: "stage-card-body" },
      h(
        "div",
        { class: `meet-art r${art.def?.rarity ?? 1}${boss ? " boss" : ""} ${art.cls}` },
        img(art.image, `pixel${known || boss || !meet ? "" : " silhouette"}${art.cls === "enemy-art" ? " flip" : ""}`, title),
      ),
      h(
        "div",
        { class: "stage-rewards" },
        h("div", { class: "meet-name" }, title),
        // 特性（地形・エネミーの傾向）とチームの相性
        field
          ? h("div", { class: "trait-row" }, fieldIcon(field), h("b", null, field.name), h("small", null, field.text), matchMark(match.field))
          : null,
        foe
          ? h(
              "div",
              { class: "trait-row foe" },
              h("i", { class: "foe-icon" }, "敵"),
              h("b", null, foe.name),
              h("small", null, foe.counter.length ? `強い: ${foe.counter.map((k) => KIND_LABELS[k]).join("・")}` : foe.text),
              matchMark(match.foe),
            )
          : null,
        stage.kind === "supply" ? h("div", { class: "trait-row" }, h("small", null, STAGE_KINDS.supply.text)) : null,
        h(
          "div",
          { class: "reward-row" },
          joins.size
            ? h(
                "span",
                { class: "reward-chip" },
                [...joins].slice(0, 3).map((id) => img(app.db.def(heroId(id)).image, `pixel reward-face${known ? "" : " silhouette"}`, "")),
                h("small", null, "仲間"),
                h("b", { class: "num" }, `+${joins.size}`),
              )
            : null,
          stage.kind === "elite" ? h("span", { class: "reward-chip part" }, h("small", null, "撃破で"), h("b", null, "宝箱")) : null,
          boss && !cleared && story.machine < 5 ? h("span", { class: "reward-chip part" }, h("small", null, "パーツ"), h("b", { class: "num" }, "+1")) : null,
        ),
      ),
    ),
    teamRow(app, area, stage),
    h(
      "div",
      { class: "stage-actions" },
      h("button", { class: "btn deck-mini", onClick: () => app.actions.openDeck("area") }, `デッキ ${story.deck.length}/${DECK_SIZE}`),
      h(
        "button",
        { class: `btn primary big sortie-btn${sortie ? "" : " disabled"}`, onClick: () => app.actions.sortie(key), disabled: sortie ? null : "true" },
        sortie ? (stage.kind === "supply" ? "立ち寄る" : "出撃") : cleared ? "クリア済み" : "未開放",
      ),
    ),
  );
}

/**
 * 繰り越すチーム。次に出撃できるステージなら、前のステージをクリアしたときのパーティとGUM。
 * それ以外は、出撃できるのが道でつながった次のステージだけであることを短く出す
 */
function teamRow(app, area, stage) {
  const story = app.story;
  const carry = nodeRun(story, area.id);
  const rebuild = carry.next > 0 ? h("button", { class: "btn small rebuild-btn", onClick: () => app.actions.rebuildNode(area.id) }, "作り直す") : null;
  if (!canSortie(story, area, stage.row, stage.lane)) {
    if (!areaUnlocked(story, area)) return null;
    const options = sortieOptions(story, area).map((o) => stageLabel(area, o.index, o.lane));
    return h("div", { class: "team-row note" }, h("small", null, options.length ? `チームを繰り越して進みます。次は ${options.join(" / ")}` : ""), rebuild);
  }
  if (!carry.team) return h("div", { class: "team-row note" }, h("small", null, stage.row === 0 ? "新しいチームで出撃" : "チームなし"));
  const units = carry.team.party.filter(Boolean);
  return h(
    "div",
    { class: "team-row" },
    h("small", { class: "team-label" }, "チーム"),
    h(
      "div",
      { class: "team-units" },
      units.map((u) => {
        const def = app.db.def(u.defId);
        return h("span", { class: `team-unit r${def.rarity}` }, img(def.image, "pixel", def.name), h("i", { class: `lv lv${u.level}` }, `${u.level}`));
      }),
    ),
    h("span", { class: "team-gum num" }, `${carry.team.gum}G`),
    rebuild,
  );
}

// ---------------------------------------------------------------------------
// デッキ
// ---------------------------------------------------------------------------

const RARITY_SHORT = ["", "C", "U", "R", "E", "L"];

/**
 * デッキと、出撃するステージのマーケットの目安。ランクで決まったレアリティ（以上）のヒーローが
 * デッキにいないと、その枠は空になる（チュートリアルのノード以外）
 */
function deckOdds(app, draft) {
  const key = app.ui.deckStage;
  if (!key) return null;
  const odds = stageRarityOdds(key);
  const have = [1, 2, 3, 4, 5].map((r) => draft.filter((id) => app.db.def(id).rarity === r).length);
  const covered = (r) => have.slice(r - 1).some(Boolean);
  const empty = deckEmptyShare(app.db, draft, key);
  const parsed = parseStageKey(key);
  return h(
    "div",
    { class: "deck-odds panel" },
    h("small", { class: "deck-odds-label" }, `${stageLabel(parsed.area, parsed.index, parsed.lane)} のマーケット`),
    h(
      "div",
      { class: "odds-row" },
      odds.map((v, i) =>
        h(
          "div",
          { class: `odds-cell r${i + 1}${v ? "" : " zero"}${v && !covered(i + 1) ? " missing" : ""}`, style: { "--w": `${Math.max(v, 4)}` } },
          h("b", null, RARITY_SHORT[i + 1]),
          h("small", { class: "num" }, `${v}%`),
          h("i", { class: "num have" }, `×${have[i]}`),
        ),
      ),
    ),
    empty ? h("p", { class: "odds-warn" }, `デッキにいないレアリティの枠は空になります（約${empty}%）`) : null,
  );
}

export function deckScreen(app) {
  const story = app.story;
  const draft = app.ui.deckDraft ?? story.deck;
  const fresh = new Set(story.fresh ?? []);
  const heroes = story.heroes
    .map((id) => app.db.def(id))
    .sort((a, b) => b.rarity - a.rarity || a.mch_id - b.mch_id);
  const problem = deckProblem(app.db, draft);
  return h(
    "div",
    { class: "screen story-screen deck-screen" },
    header("デッキ", `${draft.length}/${DECK_SIZE}`, {
      back: () => app.actions.closeDeck(false),
      right: h("button", { class: "btn small auto-deck-btn", onClick: () => app.actions.autoDeck() }, "おまかせ"),
    }),
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
    deckOdds(app, draft),
    h(
      "div",
      { class: "collection" },
      heroes.map((def, i) => {
        const inDeck = draft.includes(def.id);
        const card = unitCard(def, { compact: true, seed: i });
        return h(
          "button",
          { class: `collection-item${inDeck ? " in-deck" : ""}`, onClick: () => app.actions.toggleDeck(def.id) },
          card,
          inDeck ? h("i", { class: "deck-check" }, "✓") : null,
          fresh.has(def.id) ? h("i", { class: "new-badge" }, "NEW") : null,
        );
      }),
    ),
    h(
      "div",
      { class: "deck-actions" },
      problem && draft.length ? h("p", { class: "deck-problem" }, problem) : null,
      h("button", { class: `btn primary big${problem ? " disabled" : ""}`, onClick: () => app.actions.closeDeck(true) }, "決定"),
    ),
  );
}

// ---------------------------------------------------------------------------
// ステージ結果（クリア / 撤退）
// ---------------------------------------------------------------------------

export function stageResultScreen(app, info) {
  const area = areaById(info.areaId);
  const label = stageLabel(area, info.index, info.lane);
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
      h("div", { class: "result-stage" }, res.areaCleared ? `${label} クリア ・ ${areaName(area)} 制覇` : `${label} クリア`),
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
      res.part ? h("div", { class: "part-chip" }, img("assets/story/machine-1.png", "pixel", ""), h("span", null, "タイムマシンのパーツ"), h("b", { class: "num" }, "+1")) : null,
      // 最終ステージ以外は、繰り越したチームのまま次のステージへ
      info.index < area.stages.length - 1 ? nextStageActions(app, area) : h("button", { class: "btn primary big", onClick: () => app.actions.afterStageResult() }, "つぎへ"),
    ),
  );
}

/** クリア画面の次の行き先: 次のステージが1つならそのまま出撃、枝分かれならルートを選ぶ */
function nextStageActions(app, area) {
  const options = sortieOptions(app.story, area);
  const one = options.length === 1 ? options[0] : null;
  return h(
    "div",
    { class: "stage-result-actions" },
    one
      ? h("button", { class: "btn primary big", onClick: () => app.actions.sortie(one.key) }, `次のステージへ（${stageLabel(area, one.index, one.lane)}）`)
      : h("button", { class: "btn primary big", onClick: () => app.actions.afterStageResult() }, "ルートを選ぶ"),
    one ? h("button", { class: "btn", onClick: () => app.actions.afterStageResult() }, "ステージ選択へ") : null,
  );
}

// ---------------------------------------------------------------------------
// タイムマシンのパーツ獲得（クリア画面の次）
// ---------------------------------------------------------------------------

/**
 * 次の合体ロボを黒いシルエットで出し、パーツの分だけドットを実体化する。
 * info: story.partsGain() の戻り値（before → after の割合、あと何ノードか、改良で行ける場所）
 */
export function partsScreen(app, info) {
  const next = machineByLevel(info.target);
  const places = info.nextAreas.map((id) => areaName(areaById(id)));
  const pct = (v) => `${Math.round(v * 100)}%`;
  const complete = info.after >= 1;
  return h(
    "div",
    { class: `screen story-screen parts-screen${complete ? " complete" : ""}` },
    h("div", { class: "parts-head" }, h("small", null, "TIME MACHINE PARTS"), h("b", null, "タイムマシンのパーツ")),
    h(
      "div",
      { class: "parts-stage" },
      h("div", { class: "parts-rays" }),
      h("div", { class: "parts-art" }, machineCanvas(next.image, info.before, { cls: "reveal-target" })),
      // そろったときの名前は、実体化し終わってから出す（main.js の playPartsReveal）
      h("div", { class: "parts-level" }, h("small", null, `NEXT  Lv${next.level}`), h("b", { "data-name": complete ? next.short : "" }, "？？？")),
    ),
    h(
      "div",
      { class: "parts-panel panel" },
      h(
        "div",
        { class: "parts-percent" },
        h("span", { class: "num before" }, pct(info.before)),
        h("span", { class: "arrow" }, "→"),
        h("b", { class: "num after", "data-to": String(info.after) }, pct(info.before)),
      ),
      h("div", { class: "parts-bar" }, h("i", { class: "bar-before", style: { width: pct(info.before) } }), h("i", { class: "bar-after", style: { width: pct(info.before) } })),
      h(
        "p",
        { class: "parts-remaining" },
        complete
          ? h("b", { class: "complete-note" }, "パーツがそろった！ タイムマシンを改良できます")
          : [h("span", null, "次の改良まで あと"), h("b", { class: "num" }, info.remaining), h("span", null, "ノードクリア")],
      ),
      places.length ? h("p", { class: "parts-unlock" }, h("small", null, "改良すると行ける"), h("span", null, places.join(" / "))) : null,
      h("button", { class: "btn primary big", onClick: () => app.actions.afterParts() }, "つぎへ"),
    ),
  );
}

export const storyBackground = (id) => new URL(bgUrl(id), document.baseURI).href;

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDb } from "./load-db.mjs";
import {
  AREAS,
  MAIN_AREAS,
  STARTER_HEROES,
  DECK_SIZE,
  MACHINES,
  BRANCH_FIRST,
  BRANCH_LAST,
  heroId,
  stageKey,
  areaById,
  stageWaves,
  nodeMap,
  allStages,
} from "../js/engine/world.js";
import {
  migrateStory,
  newStory,
  areaUnlocked,
  stageUnlocked,
  joinAtStart,
  clearStage,
  setDeck,
  newStageRun,
  machineInfo,
  machineProgress,
  partsGain,
  tutorialDone,
} from "../js/engine/story.js";
import { finishBattle, advance, runGoal, prepareBattle } from "../js/engine/run.js";
import { runBattle, battleSummary } from "../js/engine/battle.js";
import { isBossWave } from "../js/engine/boss.js";

const db = loadDb();
const win = { winner: 0, time: 10, sides: [{ name: "a" }, { name: "b" }] };
const lose = { winner: 1, time: 10, sides: [{ name: "a" }, { name: "b" }] };

test("すべてのヒーローが、どこか1か所で仲間になる", () => {
  const seen = new Map();
  const add = (id, where) => seen.set(id, [...(seen.get(id) ?? []), where]);
  STARTER_HEROES.forEach((id) => add(id, "starter"));
  for (const a of AREAS) {
    for (const s of allStages(a)) {
      const key = stageKey(a.id, s.row, s.lane);
      assert.ok(!s.meet || s.join.includes(s.meet) || s.meetAtStart, `${key} の出会うヒーローが仲間リストにない`);
      new Set([...(s.meetAtStart ? [s.meet] : []), ...s.join]).forEach((id) => add(id, key));
    }
  }
  for (const h of db.heroes) assert.equal(seen.get(h.mch_id)?.length, 1, `${h.name} (${h.mch_id}) の割り当て: ${seen.get(h.mch_id)}`);
  for (const id of seen.keys()) assert.ok(db.has(heroId(id)), `データにないヒーロー ${id}`);
});

/** ノードを最初から最後まで、枝分かれは真ん中のレーン（B）を通ってクリアする */
function clearArea(story, id) {
  const area = areaById(id);
  return nodeMap(area).rows.map((row, r) => clearStage(story, stageKey(id, r, row.length > 1 ? 1 : null)));
}

test("最初は近代・日本だけ。ノードをクリアすると同じ時代の国が開き、タイムマシンの改良で時代が開く", () => {
  const story = newStory();
  assert.deepEqual(story.heroes, STARTER_HEROES.map(heroId));
  assert.deepEqual(AREAS.filter((a) => areaUnlocked(story, a)).map((a) => a.id), ["kindai-jp"]);
  const jp = areaById("kindai-jp");
  assert.ok(stageUnlocked(story, jp, 0));
  assert.ok(!stageUnlocked(story, jp, 1));

  // 1-1 の開始時に福沢諭吉が加わる（2回目は加わらない）
  assert.deepEqual(joinAtStart(story, stageKey("kindai-jp", 0)), ["h10004"]);
  assert.deepEqual(joinAtStart(story, stageKey("kindai-jp", 0)), []);
  assert.ok(story.deck.includes("h10004"));

  // パーツはノードの最終ステージ（レイドボス）をクリアしたときだけ
  const r1 = clearStage(story, stageKey("kindai-jp", 0));
  assert.deepEqual(r1.heroes, ["h2036", "h2021"]);
  assert.equal(r1.part, false);
  assert.equal(clearStage(story, stageKey("kindai-jp", 1)).part, false);
  const r3 = clearStage(story, stageKey("kindai-jp", 2));
  assert.ok(tutorialDone(story));
  assert.equal(r3.areaCleared, true);
  assert.equal(r3.part, true);
  assert.equal(r3.upgradedTo, null);
  assert.equal(story.parts, 1);
  // 近代のほかの国が開く（改良はまだ）
  assert.deepEqual(r3.unlockedAreas.sort(), ["kindai-eu", "kindai-us"]);
  assert.ok(!areaUnlocked(story, areaById("kinsei-jp")));

  // 2ノード目で Uncommon に改良 → 近世は日本から
  const eu = clearArea(story, "kindai-eu");
  assert.equal(eu.filter((r) => r.part).length, 1);
  const last = eu[eu.length - 1];
  assert.equal(last.upgradedTo, 2);
  assert.equal(machineInfo(story).level, 2);
  // 近世・日本と、特別ステージ「コルシカの特異点」が開く
  assert.deepEqual(last.unlockedAreas.sort(), ["ex-corsica", "kinsei-jp"]);
  assert.ok(!areaUnlocked(story, areaById("kinsei-eu")));
  assert.deepEqual(clearArea(story, "kinsei-jp").at(-1).unlockedAreas.sort(), ["kinsei-eu", "kinsei-sea"]);

  // 2回目のクリアでは報酬なし
  const again = clearStage(story, stageKey("kindai-jp", 2));
  assert.equal(again.first, false);
  assert.equal(again.part, false);
  assert.ok(story.deck.length <= DECK_SIZE);
});

test("12ノードのパーツでちょうど Legendary。時空のはざまは全ノードのクリアで開く", () => {
  const story = newStory();
  const order = MAIN_AREAS.filter((a) => !a.requiresAll);
  for (const a of order) {
    assert.ok(areaUnlocked(story, a), `${a.id} が開いていない`);
    clearArea(story, a.id);
  }
  assert.equal(story.machine, MACHINES.length);
  assert.equal(story.parts, 0);
  assert.ok(areaUnlocked(story, areaById("hazama")));
  const fresh = newStory();
  fresh.machine = 5;
  assert.ok(!areaUnlocked(fresh, areaById("hazama")));
});

test("近代・日本は3ステージ、ほかのノードは10ステージ。どのノードにもレイドボスがいる", () => {
  for (const a of MAIN_AREAS) {
    assert.equal(a.stages.length, a.id === "kindai-jp" ? 3 : 10, a.id);
    assert.ok(db.has(a.boss), `${a.id} のボス ${a.boss}`);
  }
  const bosses = MAIN_AREAS.map((a) => db.def(a.boss).mch_id);
  for (const reserved of [373, 1188, 1189, 1190]) assert.ok(!bosses.includes(reserved), `特別ステージ用のボス ${reserved}`);
});

test("特別ステージ（特異点）: ノードのクリアで開き、3ステージの1本道。パーツは出ない。魔王の特異点はボスが2体", () => {
  const specials = AREAS.filter((a) => a.special);
  assert.deepEqual(specials.map((a) => db.def(a.boss).mch_id).sort((x, y) => x - y), [373, 1189, 1190]);
  for (const a of specials) {
    assert.equal(nodeMap(a).rows.length, 3);
    assert.ok(nodeMap(a).rows.every((row) => row.length === 1), `${a.id} は枝分かれしない`);
    assert.ok(db.def(a.boss).special);
  }
  const maou = areaById("ex-maou");
  assert.deepEqual(nodeMap(maou).rows.map((row) => row[0].boss), [null, "b1188", "b373"]);
  assert.deepEqual(nodeMap(maou).rows.map((row) => row[0].kind), ["battle", "boss", "boss"]);

  const story = newStory();
  clearArea(story, "kindai-jp");
  assert.ok(!areaUnlocked(story, areaById("ex-corsica")));
  clearArea(story, "kindai-eu");
  assert.ok(areaUnlocked(story, areaById("ex-corsica")));
  const before = { machine: story.machine, parts: story.parts };
  const res = clearArea(story, "ex-corsica");
  assert.ok(res.at(-1).areaCleared);
  assert.ok(res.every((r) => !r.part && !r.heroes.length));
  assert.deepEqual({ machine: story.machine, parts: story.parts }, before);

  // ステージのウェーブ数・ボス・地形がステージの情報に入る
  setDeck(story, ["h10001", "h10002", "h10003"], db);
  const run = newStageRun(db, story, stageKey("ex-maou", 1), 3);
  assert.equal(run.story.boss, "b1188");
  assert.equal(run.story.waves, 5);
  assert.equal(run.story.field, "tactics");
  assert.ok(run.story.special);
});

test("古い保存データ（パーツがステージごと）を、ノードごとのパーツに直す", () => {
  const old = {
    version: 1,
    prologue: true,
    cleared: ["kindai-jp:0", "kindai-jp:1", "kindai-jp:2", "kindai-eu:0", "kindai-eu:1", "kindai-eu:2"],
    heroes: ["h10001", "h10002", "h10003", "h10004", "h5002"],
    deck: ["h10001", "h5002"],
    machine: 3,
    parts: 1,
    flags: { tut: "done" },
  };
  const s = migrateStory(old);
  assert.equal(s.version, newStory().version);
  assert.equal(s.machine, 1);
  assert.equal(s.parts, 1);
  assert.deepEqual(s.cleared, old.cleared);
  assert.deepEqual(s.heroes, old.heroes);
  assert.ok(areaUnlocked(s, areaById("kindai-eu")));
  // 繰り越しのチームがないので X-1 から
  assert.ok(stageUnlocked(s, areaById("kindai-eu"), 0));
  assert.ok(stageUnlocked(s, areaById("kindai-eu"), 2));
  assert.ok(!stageUnlocked(s, areaById("kindai-eu"), 3));
});

test("デッキはコレクションから最大8種類", () => {
  const story = newStory();
  assert.equal(setDeck(story, ["h9999"]).ok, false);
  story.heroes.push(...["h2036", "h2021", "h4056", "h2014", "h3045", "h5008", "h4005"]);
  assert.ok(setDeck(story, story.heroes).ok);
  assert.equal(story.deck.length, DECK_SIZE);
});

test("ステージはデッキのヒーローだけが並び、決まった数のウェーブを勝つとクリア", () => {
  const story = newStory();
  joinAtStart(story, stageKey("kindai-jp", 0));
  const run = newStageRun(db, story, stageKey("kindai-jp", 0), 42);
  assert.equal(runGoal(run), stageWaves(areaById("kindai-jp"), 0));
  assert.equal(run.story.boss, null);
  assert.equal(run.lives, 3);
  for (const o of run.market.offers) if (o?.type === "hero") assert.ok(story.deck.includes(o.defId));
  assert.equal(run.pending.length, 0);

  finishBattle(run, db, lose);
  assert.equal(run.lives, 2);
  advance(run, db);
  for (let i = 0; i < runGoal(run); i++) {
    finishBattle(run, db, win);
    if (run.phase === "result") advance(run, db);
  }
  assert.equal(run.phase, "clear");
});

test("ライフ3回分負けると撤退（復活なし）", () => {
  const story = newStory();
  const run = newStageRun(db, story, stageKey("kindai-jp", 0), 7);
  for (let i = 0; i < 3; i++) {
    finishBattle(run, db, lose);
    if (run.phase === "result") advance(run, db);
  }
  assert.equal(run.phase, "gameover");
});

test("パーツ獲得画面の進み具合（改良前→後、あと何ノード）", () => {
  const story = newStory();
  const r1 = clearArea(story, "kindai-jp").at(-1);
  assert.deepEqual(
    { ...partsGain(story, r1), nextAreas: undefined },
    { target: 2, before: 0, after: 0.5, parts: 1, need: 2, remaining: 1, nextAreas: undefined },
  );
  assert.deepEqual(partsGain(story, r1).nextAreas, ["kinsei-jp"]);
  const g2 = partsGain(story, clearArea(story, "kindai-us").at(-1));
  assert.equal(g2.target, 2);
  assert.equal(g2.before, 0.5);
  assert.equal(g2.after, 1);
  assert.equal(g2.remaining, 0);
  // 改良後は次（Rare）へ向けて 0/3
  const p = machineProgress(story);
  assert.equal(p.ratio, 0);
  assert.equal(p.remaining, 3);
  assert.deepEqual(p.nextAreas, ["chusei-jp"]);
  // 途中のステージ・2回目のクリアではパーツなし
  assert.equal(partsGain(story, clearStage(story, stageKey("kindai-eu", 0))), null);
  assert.equal(partsGain(story, clearStage(story, stageKey("kindai-jp", 2))), null);
});

test("最終ステージの最後のウェーブはレイドボス（スキルを順番に使う）", () => {
  const story = newStory();
  clearArea(story, "kindai-jp");
  const area = areaById("kindai-eu");
  const key = stageKey(area.id, area.stages.length - 1);
  const run = newStageRun(db, story, key, 99);
  assert.equal(run.story.boss, area.boss);
  for (let i = 0; i < runGoal(run) - 1; i++) {
    assert.ok(!isBossWave(run));
    finishBattle(run, db, win);
    advance(run, db);
  }
  assert.ok(isBossWave(run));
  run.party[0] = { uid: 900, defId: "h10001", level: 3, permMult: 0, cdReduce: 0 };
  const prep = prepareBattle(run, db);
  assert.ok(prep.ok);
  assert.equal(prep.right.boss, true);
  assert.equal(prep.right.fighters.length, 1);
  const boss = prep.right.fighters[0];
  assert.equal(boss.rotation.length, db.def(area.boss).skills.length);
  const b = runBattle(prep.left, prep.right);
  const s = battleSummary(b);
  assert.ok(s.winner === 0 || s.winner === 1);
  // 途中のステージにはボスがいない
  assert.equal(newStageRun(db, story, stageKey(area.id, 0), 1).story.boss, null);
});

test("デッキにいないレアリティの枠は空（チュートリアルのノード以外）。デッキには Common か Uncommon が必要", async () => {
  const { rollMarket, buyOffer, toggleOfferLock } = await import("../js/engine/market.js");
  const { createRng } = await import("../js/engine/rng.js");
  const { autoDeck, deckEmptyShare, deckProblem } = await import("../js/engine/story.js");
  const story = newStory();
  clearArea(story, "kindai-jp");
  // 初心者だけのデッキで、難しいステージへ
  assert.ok(setDeck(story, ["h10001", "h10002", "h10003"], db).ok);
  const key = stageKey("kindai-eu", 8, 1);
  const run = newStageRun(db, story, key, 5);
  assert.equal(run.story.strictRarity, true);
  const rng = createRng(1);
  let empties = 0;
  for (let i = 0; i < 20; i++) {
    rollMarket(run, db, rng);
    for (const o of run.market.offers) if (o?.type === "none") empties++;
  }
  assert.ok(empties > 20, `空き枠 ${empties}`);
  const idx = run.market.offers.findIndex((o) => o?.type === "none");
  if (idx >= 0) {
    assert.equal(buyOffer(run, db, idx).ok, false);
    assert.equal(toggleOfferLock(run, idx), null);
  }
  assert.ok(deckEmptyShare(db, story.deck, key) > 50);
  // チュートリアルのノードは空にならない
  assert.equal(newStageRun(db, story, stageKey("kindai-jp", 2), 5).story.strictRarity, false);
  assert.equal(deckEmptyShare(db, story.deck, stageKey("kindai-jp", 2)), 0);
  // デッキの決まり
  assert.ok(deckProblem(db, ["h4056", "h5008"]));
  assert.equal(setDeck(story, ["h4056", "h5008"], db).ok, false);
  assert.equal(deckProblem(db, ["h4056", "h2036"]), null);
  // おまかせ編成は決まりを守り、空き枠が減る
  const auto = autoDeck(db, story);
  assert.ok(setDeck(story, auto, db).ok);
  assert.ok(deckEmptyShare(db, auto, key) < 10);
});

test("新しく仲間になったヒーローは NEW（デッキ画面を閉じるまで）", () => {
  const story = newStory();
  clearStage(story, stageKey("kindai-jp", 0));
  assert.deepEqual(story.fresh, ["h2036", "h2021"]);
});

test("ノードの中はチームを繰り越す（負けたら、そのステージを始めたときのチームでやり直し）", async () => {
  const { carryOver, canSortie, nodeRun, resetNodeRun, defaultStage } = await import("../js/engine/story.js");
  const story = newStory();
  clearArea(story, "kindai-jp");
  const area = areaById("kindai-eu");
  assert.ok(canSortie(story, area, 0));
  assert.ok(!canSortie(story, area, 1));
  // 2-1 をクリアしたチーム
  const run = newStageRun(db, story, stageKey(area.id, 0), 11);
  run.party[0] = { uid: 500, defId: "h10001", level: 3, permMult: 0, cdReduce: 0 };
  run.extensions.push(db.extensions[0].id);
  for (let i = 0; i < runGoal(run); i++) {
    finishBattle(run, db, win);
    if (run.phase === "result") advance(run, db);
  }
  assert.equal(run.phase, "clear");
  const gumLeft = run.gum;
  const stageCount = run.stage;
  clearStage(story, stageKey(area.id, 0));
  carryOver(story, run);
  assert.equal(nodeRun(story, area.id).next, 1);
  assert.equal(defaultStage(story, area), stageKey(area.id, 1));
  assert.ok(canSortie(story, area, 1));
  assert.ok(!canSortie(story, area, 0));
  // 2-2 は同じチームで始まる（ユニット・エクステンション・GUM・ステージ数を引き継ぎ、ライフは戻る）
  const next = newStageRun(db, story, stageKey(area.id, 1), 12);
  assert.equal(next.party[0].uid, 500);
  assert.equal(next.party[0].level, 3);
  assert.deepEqual(next.extensions, run.extensions);
  assert.equal(next.stage, stageCount + 1);
  assert.ok(next.gum > gumLeft);
  assert.equal(next.lives, 3);
  assert.equal(next.wins, 0);
  assert.equal(next.story.index, 1);
  // 負けても繰り越しは変わらない → やり直しは同じチームから
  for (let i = 0; i < 3; i++) {
    finishBattle(next, db, lose);
    if (next.phase === "result") advance(next, db);
  }
  assert.equal(next.phase, "gameover");
  assert.equal(newStageRun(db, story, stageKey(area.id, 1), 13).party[0].uid, 500);
  // 作り直すと 2-1 から新しいチーム（クリア済みのまま）
  resetNodeRun(story, area.id);
  assert.ok(canSortie(story, area, 0));
  assert.ok(story.cleared.includes(stageKey(area.id, 0)));
  assert.equal(newStageRun(db, story, stageKey(area.id, 0), 14).party.filter(Boolean).length, 0);
});

test("最終ステージをクリアするとノードの繰り越しは終わる。古い保存データ（v2）には繰り越しを足す", async () => {
  const { carryOver, nodeRun } = await import("../js/engine/story.js");
  const story = newStory();
  const area = areaById("kindai-jp");
  story.nodeRuns[area.id] = { next: 2, team: { story: { areaId: area.id, index: 1 } } };
  carryOver(story, { story: { areaId: area.id, index: 2 } });
  assert.deepEqual(nodeRun(story, area.id), { next: 0, at: null, team: null, path: [] });
  const v2 = { ...newStory(), version: 2 };
  delete v2.nodeRuns;
  const m = migrateStory(v2);
  assert.deepEqual(m.nodeRuns, {});
  assert.equal(m.version, newStory().version);
});

test("ノードの後半（X-5〜X-9）は3つのレーンに枝分かれし、道は交差しない", () => {
  for (const a of AREAS) {
    const { rows, next } = nodeMap(a);
    if (a.id === "kindai-jp") {
      assert.ok(rows.every((r) => r.length === 1));
      continue;
    }
    rows.forEach((row, r) => assert.equal(row.length, r >= BRANCH_FIRST && r <= BRANCH_LAST ? 3 : 1, `${a.id} ${r}`));
    assert.equal(rows.at(-1)[0].kind, "boss");
    for (let r = 0; r < rows.length - 1; r++) {
      // どのステージにも入ってくる道がある
      for (let j = 0; j < rows[r + 1].length; j++) assert.ok(next[r].some((links) => links.includes(j)), `${a.id} ${r + 1}:${j}`);
      // 交差しない（i→j と i'→j' で i<i' なら j<=j'）
      for (let i = 0; i < next[r].length; i++)
        for (let k = i + 1; k < next[r].length; k++)
          for (const j of next[r][i]) for (const m of next[r][k]) assert.ok(j <= m, `${a.id} ${r} 交差`);
    }
    for (const st of rows.flat()) {
      if (st.kind === "supply") assert.equal(st.join.length, 0);
      if (st.lane !== null && st.kind !== "supply") assert.ok(st.field && st.foe, `${a.id} ${st.row}${st.lane}`);
    }
  }
});

test("出撃できるのは、いまいるステージから道でつながった次のステージだけ", async () => {
  const { canSortie, carryOver, sortieOptions } = await import("../js/engine/story.js");
  const { linked } = await import("../js/engine/world.js");
  const story = newStory();
  clearArea(story, "kindai-jp");
  const area = areaById("kindai-eu");
  // X-4 まで進んだ（1本道）
  story.nodeRuns[area.id] = { next: BRANCH_FIRST, at: null, team: null };
  assert.equal(sortieOptions(story, area).length, 3);
  // X-5 の A レーンをクリアしたら、X-6 は A から道のあるレーンだけ
  carryOver(story, { story: { areaId: area.id, index: BRANCH_FIRST, lane: 0 } });
  for (let l = 0; l < 3; l++) assert.equal(canSortie(story, area, BRANCH_FIRST + 1, l), linked(area, BRANCH_FIRST, 0, l));
  assert.ok(canSortie(story, area, BRANCH_FIRST + 1, 0));
  assert.ok(!canSortie(story, area, BRANCH_FIRST + 2, 0));
});

test("補給はバトルなしで宝箱を選んで出発。強敵を倒すと次のステージの最初に宝箱", async () => {
  const { carryOver } = await import("../js/engine/story.js");
  const { departSupply, chooseTreasure, prepareBattle: prep } = await import("../js/engine/run.js");
  const story = newStory();
  clearArea(story, "kindai-jp");
  const area = areaById("kindai-eu");
  const rows = nodeMap(area).rows;
  const supply = rows.flat().find((st) => st.kind === "supply");
  story.nodeRuns[area.id] = { next: supply.row, at: 1, team: null };
  const run = newStageRun(db, story, stageKey(area.id, supply.row, supply.lane), 3);
  assert.equal(run.story.supply, true);
  assert.equal(run.pending[0].type, "treasure");
  assert.ok(!run.pending[0].options.includes("life"));
  assert.equal(prep(run, db).ok, false);
  assert.equal(departSupply(run).ok, false);
  chooseTreasure(run, db, run.pending[0].options.find((o) => o !== "extension" && o !== "ce") ?? run.pending[0].options[0]);
  while (run.pending.length) run.pending.shift();
  assert.ok(departSupply(run).ok);
  assert.equal(run.phase, "clear");
  // 強敵
  const elite = rows.flat().find((st) => st.kind === "elite");
  if (elite) {
    const team = newStageRun(db, story, stageKey(area.id, 0), 4);
    team.story = { ...team.story, areaId: area.id, index: elite.row, lane: elite.lane, elite: true };
    carryOver(story, team);
    assert.equal(story.nodeRuns[area.id].team.bonus, "elite");
    const nextRow = rows[elite.row + 1];
    const lane = nextRow.length > 1 ? elite.lane : null;
    const run2 = newStageRun(db, story, stageKey(area.id, elite.row + 1, lane), 5);
    assert.ok(run2.pending.some((ev) => ev.type === "treasure" && ev.reason === "elite"));
  }
});

test("地形は両陣営のスキルに効く", async () => {
  const { playerTeam } = await import("../js/engine/run.js");
  const { FIELDS } = await import("../js/engine/world.js");
  const story = newStory();
  const run = newStageRun(db, story, stageKey("kindai-jp", 0), 9);
  const poisoner = db.heroes.find((h) => h.effects.some((e) => e.kind === "poison"));
  run.party[0] = { uid: 1, defId: poisoner.id, level: 1, permMult: 0, cdReduce: 0 };
  const before = playerTeam(run, db).fighters[0].effects.find((e) => e.kind === "poison").value;
  run.story.field = "poison";
  const after = playerTeam(run, db).fighters[0].effects.find((e) => e.kind === "poison").value;
  assert.ok(after > before, `${before} → ${after}`);
  assert.ok(FIELDS.faction1.mods.factionMult[1] > 0);
});

test("台本: 出会うヒーローには全員セリフがあり、台本のヒーロー・ボスは実在する", async () => {
  const { NODE_SCRIPTS, HERO_LINES, SPECIAL_SCRIPTS } = await import("../js/story/node-scripts.js");
  const { stageIntro, areaClearScene } = await import("../js/story/scenes.js");
  const featured = new Set(Object.values(NODE_SCRIPTS).flatMap((s) => Object.keys(s.meet ?? {}).map(Number)));
  for (const a of MAIN_AREAS) {
    if (a.id === "kindai-jp") continue;
    assert.ok(NODE_SCRIPTS[a.id], `${a.id} の台本`);
    for (const st of nodeMap(a).rows.flat()) {
      if (st.meet) assert.ok(featured.has(st.meet) || HERO_LINES[st.meet], `${a.id} の ${st.meet} のセリフ`);
    }
  }
  const speakers = [];
  const collect = (steps) => steps.forEach((s) => s.say?.startsWith("hero:") && speakers.push(Number(s.say.slice(5))));
  for (const s of Object.values(NODE_SCRIPTS)) {
    Object.values(s.meet).forEach(collect);
    collect(s.arrive);
    collect(s.clear);
  }
  for (const s of Object.values(SPECIAL_SCRIPTS)) {
    s.stages.forEach(collect);
    collect(s.clear);
    for (const id of Object.keys(s.boss)) assert.ok(db.has(id), `ボス ${id}`);
  }
  for (const id of [...speakers, ...Object.keys(HERO_LINES).map(Number)]) assert.ok(db.has(heroId(id)), `ヒーロー ${id}`);
  // すべてのステージの出撃前の会話・クリアの会話が作れる
  for (const a of AREAS) {
    for (const st of nodeMap(a).rows.flat()) {
      const boss = st.boss ? db.def(st.boss) : null;
      for (const first of [true, false]) assert.ok(stageIntro(a, st.row, { first, boss, stage: st }).steps.length > 0);
    }
    assert.ok(areaClearScene(a, AREAS.filter((x) => x.after === a.id).map((x) => x.id)).steps.length > 0);
  }
});

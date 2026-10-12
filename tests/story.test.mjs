import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDb } from "./load-db.mjs";
import { AREAS, STARTER_HEROES, DECK_SIZE, STAGE_WAVES, heroId, stageKey, areaById } from "../js/engine/world.js";
import {
  newStory,
  areaUnlocked,
  stageUnlocked,
  joinAtStart,
  clearStage,
  setDeck,
  newStageRun,
  machineInfo,
  tutorialDone,
} from "../js/engine/story.js";
import { finishBattle, advance, runGoal } from "../js/engine/run.js";

const db = loadDb();
const win = { winner: 0, time: 10, sides: [{ name: "a" }, { name: "b" }] };
const lose = { winner: 1, time: 10, sides: [{ name: "a" }, { name: "b" }] };

test("すべてのヒーローが、どこか1か所で仲間になる", () => {
  const seen = new Map();
  const add = (id, where) => seen.set(id, [...(seen.get(id) ?? []), where]);
  STARTER_HEROES.forEach((id) => add(id, "starter"));
  for (const a of AREAS) {
    a.stages.forEach((s, i) => {
      assert.ok(s.join.includes(s.meet) || s.meetAtStart, `${a.id}:${i} の出会うヒーローが仲間リストにない`);
      new Set([...(s.meetAtStart ? [s.meet] : []), ...s.join]).forEach((id) => add(id, `${a.id}:${i}`));
    });
  }
  for (const h of db.heroes) assert.equal(seen.get(h.mch_id)?.length, 1, `${h.name} (${h.mch_id}) の割り当て: ${seen.get(h.mch_id)}`);
  for (const id of seen.keys()) assert.ok(db.has(heroId(id)), `データにないヒーロー ${id}`);
});

test("最初は近代・日本だけ。チュートリアルを終えてタイムマシンを改良すると国が増える", () => {
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

  const r1 = clearStage(story, stageKey("kindai-jp", 0));
  assert.deepEqual(r1.heroes, ["h2036", "h2021"]);
  assert.equal(r1.part, true);
  assert.equal(r1.upgradedTo, null);
  assert.equal(story.parts, 1);

  // 2つでUncommonに改良。ただしチュートリアルを終えるまでは他の国へ行けない
  const r2 = clearStage(story, stageKey("kindai-jp", 1));
  assert.equal(r2.upgradedTo, 2);
  assert.equal(machineInfo(story).level, 2);
  assert.deepEqual(r2.unlockedAreas, []);

  const r3 = clearStage(story, stageKey("kindai-jp", 2));
  assert.ok(tutorialDone(story));
  assert.deepEqual(r3.unlockedAreas.sort(), ["kindai-eu", "kindai-us"]);
  assert.ok(!areaUnlocked(story, areaById("kinsei-jp")));

  // 2回目のクリアでは報酬なし
  const again = clearStage(story, stageKey("kindai-jp", 0));
  assert.equal(again.first, false);
  assert.equal(again.part, false);
  assert.equal(story.parts, 1);
  assert.ok(story.deck.length <= DECK_SIZE);
});

test("時空のはざまは全エリアをクリアすると開く", () => {
  const story = newStory();
  story.machine = 5;
  for (const a of AREAS.filter((x) => !x.requiresAll)) a.stages.forEach((_, i) => story.cleared.push(stageKey(a.id, i)));
  assert.ok(areaUnlocked(story, areaById("hazama")));
  story.cleared.pop();
  assert.ok(!areaUnlocked(story, areaById("hazama")));
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
  assert.equal(runGoal(run), STAGE_WAVES[0]);
  assert.equal(run.lives, 3);
  for (const o of run.market.offers) if (o?.type === "hero") assert.ok(story.deck.includes(o.defId));
  assert.equal(run.pending.length, 0);

  finishBattle(run, db, lose);
  assert.equal(run.lives, 2);
  advance(run, db);
  for (let i = 0; i < STAGE_WAVES[0]; i++) {
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

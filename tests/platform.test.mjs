import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, MAIN_AREAS, TUTORIAL_AREA } from "../js/engine/world.js";
import { trophyIdsForAreaCleared, reportStageResult, initPlatform, setChatVisible, chatHiddenOn } from "../js/platform.js";

test("共通基盤のトロフィー：最初のノードと、最後のノード（時空のはざま）の制覇で送る", () => {
  assert.deepEqual(trophyIdsForAreaCleared(TUTORIAL_AREA), ["deckbattle.area1"]);
  assert.deepEqual(trophyIdsForAreaCleared("hazama"), ["deckbattle.clear"]);
  assert.deepEqual(trophyIdsForAreaCleared("kindai-eu"), []);
  assert.deepEqual(trophyIdsForAreaCleared("ex-corsica"), [], "特別ステージでは送らない");
  const hazama = AREAS.find((a) => a.id === "hazama");
  assert.ok(hazama?.requiresAll, "時空のはざまは本編の全ノード制覇が条件");
  assert.ok(MAIN_AREAS.some((a) => a.id === TUTORIAL_AREA));
});

test("共通基盤：SDK がなくても例外を出さない", () => {
  assert.doesNotThrow(() => initPlatform("0.1.0"));
  assert.doesNotThrow(() => reportStageResult(TUTORIAL_AREA, { areaCleared: true }));
});

test("共通基盤：ノードを制覇したときだけ送り、失敗・例外でも止めない", async () => {
  const sent = [];
  globalThis.window = {
    BearkoGames: {
      init: async () => ({ ok: true }),
      unlockTrophy: async (id) => {
        sent.push(id);
        return { ok: id !== "deckbattle.clear", error: "network" };
      },
    },
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    initPlatform("0.1.0");
    reportStageResult(TUTORIAL_AREA, { areaCleared: false });
    reportStageResult(TUTORIAL_AREA, { areaCleared: true });
    reportStageResult("hazama", { areaCleared: true });
    reportStageResult("hazama", null);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(sent, ["deckbattle.area1", "deckbattle.clear"]);
    globalThis.window.BearkoGames.unlockTrophy = () => {
      throw new Error("boom");
    };
    assert.doesNotThrow(() => reportStageResult(TUTORIAL_AREA, { areaCleared: true }));
  } finally {
    console.warn = warn;
    delete globalThis.window;
  }
});

// ---------------------------------------------------------------- 総合スコア（共通基盤 SPEC-002 3.4）
import { partyPower, avgBattleSec, recordNodeScore, scoreMetrics, reportStoryScore } from "../js/platform.js";
import { newStory } from "../js/engine/story.js";
import { stageKey } from "../js/engine/world.js";

const fakeDb = { def: (id) => ({ c: { rarity: 1 }, r: { rarity: 3 }, l: { rarity: 5 } })[id] };
const unit = (defId, level, permMult = 0) => ({ uid: 1, defId, level, permMult, cdReduce: 0 });

test("総合スコア：戦力はレアリティの基礎値 × Lv の倍率 × (1 + 永続強化) の合計", () => {
  const run = { party: [unit("c", 1), unit("r", 3), unit("l", 2, 0.5), null, null, null] };
  assert.equal(partyPower(fakeDb, run), 10 * 1 + 15 * 3 + 22 * 2 * 1.5);
  assert.equal(partyPower(fakeDb, { party: [] }), 0);
});

test("総合スコア：平均の戦闘時間", () => {
  assert.equal(avgBattleSec({ history: [{ time: 20 }, { time: 40 }, { time: 0 }] }), 30);
  assert.equal(avgBattleSec({ history: [] }), null);
});

test("総合スコア：ノードの最後のステージでだけ記録し、よくなったときだけ書き換える", () => {
  const story = newStory();
  const area = AREAS.find((a) => a.id === "kindai-eu");
  const last = area.stages.length - 1;
  const run = (lv, t) => ({ party: [unit("r", lv)], history: [{ time: t }] });
  assert.equal(recordNodeScore(story, "kindai-eu", 0, fakeDb, run(1, 30)), false, "最後のステージでない");
  assert.equal(recordNodeScore(story, "kindai-eu", last, fakeDb, run(2, 30)), true);
  assert.deepEqual(story.scores["kindai-eu"], { power: 30, avgBattleSec: 30 });
  assert.equal(recordNodeScore(story, "kindai-eu", last, fakeDb, run(1, 40)), false, "悪い成績では書き換えない");
  assert.equal(recordNodeScore(story, "kindai-eu", last, fakeDb, run(3, 20)), true);
});

test("総合スコア：送る成績は制覇したノードと、その自己ベスト。制覇がなければ送らない", async () => {
  const story = newStory();
  const tut = AREAS.find((a) => a.id === TUTORIAL_AREA);
  for (let i = 0; i < tut.stages.length; i++) story.cleared.push(stageKey(tut.id, i));
  story.scores = { [TUTORIAL_AREA]: { power: 50, avgBattleSec: 25 }, "kindai-eu": { power: 1, avgBattleSec: 1 } };
  assert.deepEqual(scoreMetrics(story), { nodesCleared: [TUTORIAL_AREA], nodes: { [TUTORIAL_AREA]: { power: 50, avgBattleSec: 25 } } });
  const sent = [];
  globalThis.window = { BearkoGames: { submitScore: async (m, o) => { sent.push([m.nodesCleared.length, !!o?.quiet]); return { ok: true }; } } };
  try {
    reportStoryScore(newStory());
    reportStoryScore(story, { quiet: true });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(sent, [[1, true]]);
  } finally {
    delete globalThis.window;
  }
});

test("RTA：近代・日本の区切りは 1-1・1-2・制覇。ほかのノードでは送らない", async () => {
  const { rtaCheckpointForStageClear, RTA_REGULATIONS } = await import("../js/platform.js");
  assert.equal(rtaCheckpointForStageClear(TUTORIAL_AREA, 0), "stage1");
  assert.equal(rtaCheckpointForStageClear(TUTORIAL_AREA, 1), "stage2");
  assert.equal(rtaCheckpointForStageClear(TUTORIAL_AREA, 2), "clear");
  assert.equal(rtaCheckpointForStageClear("kindai-eu", 0), null);
  assert.deepEqual(RTA_REGULATIONS, { node1: "deckbattle-node1", quest: "deckbattle-quest" });
});

test("RTA：10 勝でクリアの区切りは 5 勝目と 10 勝", async () => {
  const { rtaCheckpointForQuest } = await import("../js/platform.js");
  assert.equal(rtaCheckpointForQuest({ phase: "result", wins: 5, lastResult: { won: true } }), "win5");
  assert.equal(rtaCheckpointForQuest({ phase: "result", wins: 5, lastResult: { won: false } }), null, "5 勝のまま負けても送り直さない");
  assert.equal(rtaCheckpointForQuest({ phase: "result", wins: 4, lastResult: { won: true } }), null);
  assert.equal(rtaCheckpointForQuest({ phase: "clear", wins: 10, lastResult: { won: true } }), "clear");
  assert.equal(rtaCheckpointForQuest({ phase: "gameover", wins: 3, lastResult: { won: false } }), null);
});

test("RTA：RTA 用のストーリーは新しいストーリーで、プロローグと案内は済み", async () => {
  const { newRtaStory } = await import("../js/platform.js");
  const { newStory } = await import("../js/engine/story.js");
  const story = newRtaStory();
  assert.equal(story.prologue, true);
  assert.deepEqual(story.flags, { mapIntro: true, tut: "done" });
  assert.deepEqual(story.cleared, []);
  assert.deepEqual(story.heroes, newStory().heroes);
});

test("総合スコア：平均の戦闘時間はノード全体（ステージをまたいで繰り越した記録）", async () => {
  const { avgBattleSec } = await import("../js/platform.js");
  assert.equal(avgBattleSec({ nodeTimes: [10, 20, 30], history: [{ time: 30 }] }), 20, "ノード全体");
  assert.equal(avgBattleSec({ history: [{ time: 8 }, { time: 12 }] }), 10, "前の版のセーブ（nodeTimes なし）はこのステージだけ");
  assert.equal(avgBattleSec({ nodeTimes: [], history: [] }), null);
});

test("RTA：SDK がなくても例外を出さない", async () => {
  const { startRta, rtaCheckpoint, abortRta, isRtaAvailable } = await import("../js/platform.js");
  const saved = globalThis.window;
  globalThis.window = {};
  assert.equal(isRtaAvailable(), false);
  assert.doesNotThrow(() => startRta("deckbattle-quest"));
  assert.doesNotThrow(() => rtaCheckpoint("win5", 1000));
  assert.doesNotThrow(() => abortRta());
  globalThis.window = saved;
});

test("全体チャット：対戦と会話劇では隠し、SDK がない・古いときは何もしない", async () => {
  assert.equal(chatHiddenOn("battle"), true);
  assert.equal(chatHiddenOn("scene"), true);
  assert.equal(chatHiddenOn("title"), false);
  assert.equal(chatHiddenOn("stageResult"), false);
  assert.doesNotThrow(() => setChatVisible(false));
  globalThis.window = { BearkoGames: { init: async () => ({ ok: true }) } };
  try {
    assert.doesNotThrow(() => setChatVisible(true));
    const calls = [];
    globalThis.window.BearkoGames.chat = { setVisible: (on) => calls.push(on) };
    setChatVisible(false);   // 対戦に入った
    initPlatform("0.0.0");   // SDK が後から読めても、いまの値をそろえる
    await new Promise((r) => setTimeout(r, 0));
    setChatVisible(true);
    assert.deepEqual(calls, [false, false, true]);
  } finally {
    delete globalThis.window;
  }
});

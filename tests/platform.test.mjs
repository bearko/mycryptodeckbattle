import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, MAIN_AREAS, TUTORIAL_AREA } from "../js/engine/world.js";
import { trophyIdsForAreaCleared, reportStageResult, initPlatform } from "../js/platform.js";

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

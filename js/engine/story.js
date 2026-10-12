// ストーリーの進み具合（コレクション・デッキ・クリアしたステージ・タイムマシン）と、ステージの開始。
// story はセーブデータとしてそのまま JSON 保存できるプレーンなオブジェクト。DOM には依存しない。

import {
  AREAS,
  DECK_SIZE,
  MACHINES,
  MAX_MACHINE_LEVEL,
  STAGE_WAVES,
  STARTER_HEROES,
  TUTORIAL_AREA,
  heroId,
  machineByLevel,
  parseStageKey,
  stageKey,
} from "./world.js";
import { createRng } from "./rng.js";
import { newRun } from "./run.js";

export const STORY_VERSION = 1;
export const STORY_PLAYER = "chris";

export function newStory() {
  const starters = STARTER_HEROES.map(heroId);
  return {
    version: STORY_VERSION,
    prologue: false,
    cleared: [],
    heroes: [...starters],
    deck: [...starters],
    machine: 1,
    parts: 0,
    flags: {},
  };
}

export const isCleared = (story, key) => story.cleared.includes(key);

export function areaCleared(story, area) {
  return area.stages.every((_, i) => isCleared(story, stageKey(area.id, i)));
}

/** チュートリアル（近代・日本）を最後までクリアしたか */
export function tutorialDone(story) {
  return areaCleared(
    story,
    AREAS.find((a) => a.id === TUTORIAL_AREA),
  );
}

export function areaUnlocked(story, area) {
  if (area.id === TUTORIAL_AREA) return true;
  if (area.requiresAll) return AREAS.filter((a) => !a.requiresAll).every((a) => areaCleared(story, a));
  return tutorialDone(story) && story.machine >= area.machine;
}

export function stageUnlocked(story, area, index) {
  return areaUnlocked(story, area) && (index === 0 || isCleared(story, stageKey(area.id, index - 1)));
}

/** その時代のエリアが1つでも開いているか */
export function eraUnlocked(story, eraId) {
  return AREAS.some((a) => a.era === eraId && areaUnlocked(story, a));
}

/** 次に挑戦できるステージ（クリアしていない最初のもの） */
export function nextStage(story, area) {
  const i = area.stages.findIndex((_, idx) => !isCleared(story, stageKey(area.id, idx)));
  return i < 0 ? null : i;
}

/** タイムマシンの状態 */
export function machineInfo(story) {
  const m = machineByLevel(story.machine);
  return {
    ...m,
    parts: story.parts,
    need: m.next,
    nextMachine: m.next ? MACHINES[m.level] : null,
  };
}

/** 次の改良までの進み具合（0〜1）と、あと何ステージクリアで改良できるか */
export function machineProgress(story) {
  const m = machineByLevel(story.machine);
  if (!m.next) return { level: m.level, ratio: 1, remaining: 0, next: null, nextAreas: [] };
  return {
    level: m.level,
    ratio: story.parts / m.next,
    remaining: m.next - story.parts,
    next: MACHINES[m.level],
    nextAreas: AREAS.filter((a) => a.machine === m.level + 1 && !a.requiresAll).map((a) => a.id),
  };
}

/**
 * ステージクリアでパーツを手に入れたときの、改良前→後の進み具合（パーツ獲得画面用）。
 * res は clearStage() の戻り値（clearStage の後で呼ぶ）
 */
export function partsGain(story, res) {
  if (!res?.part) return null;
  if (res.upgradedTo) {
    const prev = machineByLevel(res.upgradedTo - 1);
    return {
      target: res.upgradedTo,
      before: (prev.next - 1) / prev.next,
      after: 1,
      parts: prev.next,
      need: prev.next,
      remaining: 0,
      nextAreas: res.unlockedAreas.length ? res.unlockedAreas : AREAS.filter((a) => a.machine === res.upgradedTo && !a.requiresAll).map((a) => a.id),
    };
  }
  const prog = machineProgress(story);
  const need = machineByLevel(story.machine).next;
  return {
    target: story.machine + 1,
    before: (story.parts - 1) / need,
    after: story.parts / need,
    parts: story.parts,
    need,
    remaining: prog.remaining,
    nextAreas: prog.nextAreas,
  };
}

function addHero(story, id) {
  if (story.heroes.includes(id)) return false;
  story.heroes.push(id);
  if (story.deck.length < DECK_SIZE && !story.deck.includes(id)) story.deck.push(id);
  return true;
}

/** ステージの開始時に仲間になるヒーロー（1-1 の福沢諭吉）。加わったIDを返す */
export function joinAtStart(story, key) {
  const parsed = parseStageKey(key);
  if (!parsed?.stage.meetAtStart) return [];
  const id = heroId(parsed.stage.meet);
  return addHero(story, id) ? [id] : [];
}

/**
 * ステージクリアを記録する。報酬は初回だけ。
 * 戻り値: { first, heroes: [仲間になったID], part, upgradedTo: 改良後のレベル|null, unlockedAreas: [新しく行けるエリアID] }
 */
export function clearStage(story, key) {
  const parsed = parseStageKey(key);
  if (!parsed) throw new Error(`unknown stage: ${key}`);
  const result = { first: !isCleared(story, key), heroes: [], part: false, upgradedTo: null, unlockedAreas: [] };
  if (!result.first) return result;
  const before = new Set(AREAS.filter((a) => areaUnlocked(story, a)).map((a) => a.id));
  story.cleared.push(key);
  for (const mch of parsed.stage.join) {
    const id = heroId(mch);
    if (addHero(story, id)) result.heroes.push(id);
  }
  if (story.machine < MAX_MACHINE_LEVEL) {
    story.parts += 1;
    result.part = true;
    const need = machineByLevel(story.machine).next;
    if (story.parts >= need) {
      story.parts -= need;
      story.machine += 1;
      result.upgradedTo = story.machine;
    }
  }
  result.unlockedAreas = AREAS.filter((a) => areaUnlocked(story, a) && !before.has(a.id)).map((a) => a.id);
  return result;
}

export function setDeck(story, ids) {
  const deck = [...new Set(ids)].filter((id) => story.heroes.includes(id)).slice(0, DECK_SIZE);
  if (!deck.length) return { ok: false, error: "デッキに1体以上入れてください" };
  story.deck = deck;
  return { ok: true };
}

/** エリアごとに決まったエネミーの顔ぶれ（レアリティ帯ごとに6体ずつ） */
export function areaEnemyPool(db, area) {
  let h = 2166136261;
  for (const c of area.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rng = createRng(h >>> 0);
  const ids = [];
  for (let r = 1; r <= 5; r++) ids.push(...rng.sample(db.enemies.filter((d) => d.rarity === r).map((d) => d.id), 6));
  return ids;
}

/** ステージの難しさ（エリアの時代・地域 ＋ ステージ番号） */
export function stageDifficulty(area, index) {
  return area.difficulty + index;
}

/** ステージを始める（ウェーブ制のラン）。デッキのヒーローだけがマーケットに並ぶ */
export function newStageRun(db, story, key, seed) {
  const parsed = parseStageKey(key);
  if (!parsed) throw new Error(`unknown stage: ${key}`);
  const { area, index } = parsed;
  const deck = story.deck.filter((id) => db.has(id));
  if (!deck.length) throw new Error("デッキが空です");
  return newRun(db, {
    playerId: STORY_PLAYER,
    seed,
    heroPool: deck,
    enemyPool: areaEnemyPool(db, area),
    story: {
      key,
      areaId: area.id,
      index,
      waves: STAGE_WAVES[index],
      difficulty: stageDifficulty(area, index),
      tutorial: area.id === TUTORIAL_AREA && index === 0,
      // チュートリアルのエリアはエネミーを弱めにする（1-1 は特に）
      handicap: area.id === TUTORIAL_AREA ? (index === 0 ? 2 : 1) : 0,
    },
  });
}

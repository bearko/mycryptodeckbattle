// ストーリーの進み具合（コレクション・デッキ・クリアしたステージ・タイムマシン）と、ステージの開始。
// story はセーブデータとしてそのまま JSON 保存できるプレーンなオブジェクト。DOM には依存しない。

import {
  AREAS,
  DECK_SIZE,
  MACHINES,
  MAX_MACHINE_LEVEL,
  STARTER_HEROES,
  TUTORIAL_AREA,
  areaById,
  areaRankCap,
  heroId,
  isFinalStage,
  machineByLevel,
  parseStageKey,
  stageKey,
  stageWaves,
  wavesBefore,
} from "./world.js";
import { createRng } from "./rng.js";
import { continueRun, newRun } from "./run.js";
import { RARITY, marketOdds, stageIncome, storyPlayerBonus } from "./balance.js";

// 2: パーツがステージごと → ノード（時代×地域）のクリアごとに。ノードのステージ数が 3 → 10 に
// 3: ノードの中でチームを繰り越す（nodeRuns）
export const STORY_VERSION = 3;
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
    // 新しく仲間になったヒーロー（デッキ画面で NEW と出す。デッキ画面を閉じると空にする）
    fresh: [],
    // ノードごとの繰り越し: { [ノードID]: { next: 次に出撃するステージ, team: 前のステージをクリアしたときの run } }
    nodeRuns: {},
    flags: {},
  };
}

/**
 * 古い保存データを今の形にする。v1（パーツがステージごと・各ノード3ステージ）からは、
 * 仲間・デッキ・クリアしたステージ（今もあるもの）を残し、タイムマシンをクリアしたノードの数から計算し直す。
 */
export function migrateStory(story) {
  if (!story || story.version === STORY_VERSION) return story;
  let next = { ...newStory(), ...story, version: STORY_VERSION };
  if ((story.version ?? 1) < 2) {
    next.cleared = story.cleared.filter((key) => parseStageKey(key));
    next.machine = 1;
    next.parts = 0;
    for (const area of AREAS) if (areaCleared(next, area)) addPart(next);
  }
  // v3: 繰り越しのチームはないので、途中までクリアしたノードは X-1 からチームを作って進む
  next.nodeRuns = story.nodeRuns ?? {};
  return next;
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

/**
 * 行けるノードか。タイムマシンのレベルで時代が開き（その時代の最初のノード）、
 * 最初のノードをクリアすると同じ時代のほかの国が開く（after）。時空のはざまは全ノードのクリアが必要
 */
export function areaUnlocked(story, area) {
  if (area.id === TUTORIAL_AREA) return true;
  if (area.requiresAll && !AREAS.filter((a) => !a.requiresAll).every((a) => areaCleared(story, a))) return false;
  if (area.after && !areaCleared(story, areaById(area.after))) return false;
  return story.machine >= area.machine;
}

/** ノードの繰り越し（次に出撃するステージと、そのときのチーム） */
export function nodeRun(story, areaId) {
  return story.nodeRuns?.[areaId] ?? { next: 0, team: null };
}

/**
 * 出撃できるステージ。ノードの中はチームを繰り越して順に進むので、出撃できるのは次のステージだけ
 * （チームを作り直すと X-1 から。クリア済みのステージは報酬なしで進む）
 */
export function canSortie(story, area, index) {
  return areaUnlocked(story, area) && index === nodeRun(story, area.id).next;
}

/** ステージ選択で最初に選んでおくステージ（次に出撃するステージ） */
export const defaultStage = (story, area) => nodeRun(story, area.id).next;

/** ステージをクリアしたチームを、次のステージへ繰り越す（最終ステージならノードの繰り越しは終わり） */
export function carryOver(story, run) {
  const { areaId, index } = run.story;
  const area = areaById(areaId);
  story.nodeRuns ??= {};
  if (isFinalStage(area, index)) delete story.nodeRuns[areaId];
  else story.nodeRuns[areaId] = { next: index + 1, team: JSON.parse(JSON.stringify(run)) };
}

/** チームを作り直す（X-1 から） */
export function resetNodeRun(story, areaId) {
  if (story.nodeRuns) delete story.nodeRuns[areaId];
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

/** タイムマシンがそのレベルになると開くノード（時代の最初のノード） */
const areasOpenedAt = (level) => AREAS.filter((a) => a.machine === level && !a.after).map((a) => a.id);

/** 次の改良までの進み具合（0〜1）と、あと何ノードクリアで改良できるか */
export function machineProgress(story) {
  const m = machineByLevel(story.machine);
  if (!m.next) return { level: m.level, ratio: 1, remaining: 0, next: null, nextAreas: [] };
  return {
    level: m.level,
    ratio: story.parts / m.next,
    remaining: m.next - story.parts,
    next: MACHINES[m.level],
    nextAreas: areasOpenedAt(m.level + 1),
  };
}

/**
 * ノードクリアでパーツを手に入れたときの、改良前→後の進み具合（パーツ獲得画面用）。
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
      nextAreas: areasOpenedAt(res.upgradedTo),
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
  story.fresh = [...(story.fresh ?? []), id];
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

/** パーツを1つ足す。そろったらタイムマシンを改良して、改良後のレベルを返す */
function addPart(story) {
  if (story.machine >= MAX_MACHINE_LEVEL) return null;
  story.parts += 1;
  const need = machineByLevel(story.machine).next;
  if (story.parts < need) return null;
  story.parts -= need;
  story.machine += 1;
  return story.machine;
}

/**
 * ステージクリアを記録する。報酬は初回だけ。パーツはノードの最終ステージ（レイドボス）を初めてクリアしたときだけ。
 * 戻り値: { first, heroes: [仲間になったID], part, areaCleared, upgradedTo: 改良後のレベル|null, unlockedAreas: [新しく行けるノードID] }
 */
export function clearStage(story, key) {
  const parsed = parseStageKey(key);
  if (!parsed) throw new Error(`unknown stage: ${key}`);
  const result = { first: !isCleared(story, key), heroes: [], part: false, areaCleared: false, upgradedTo: null, unlockedAreas: [] };
  if (!result.first) return result;
  const before = new Set(AREAS.filter((a) => areaUnlocked(story, a)).map((a) => a.id));
  const wasCleared = areaCleared(story, parsed.area);
  story.cleared.push(key);
  for (const mch of parsed.stage.join) {
    const id = heroId(mch);
    if (addHero(story, id)) result.heroes.push(id);
  }
  result.areaCleared = !wasCleared && areaCleared(story, parsed.area);
  if (result.areaCleared && story.machine < MAX_MACHINE_LEVEL) {
    result.part = true;
    result.upgradedTo = addPart(story);
  }
  result.unlockedAreas = AREAS.filter((a) => areaUnlocked(story, a) && !before.has(a.id)).map((a) => a.id);
  return result;
}

/** 最初のウェーブで買えるヒーロー（Common・Uncommon）か */
export const isStarterCost = (def) => RARITY[def.rarity].cost <= stageIncome(1);

/** デッキの問題点（なければ null）。最初のウェーブで1体も買えないデッキは組めない */
export function deckProblem(db, ids) {
  if (!ids.length) return "デッキに1体以上入れてください";
  if (db && !ids.some((id) => db.has(id) && isStarterCost(db.def(id)))) {
    return "Common か Uncommon を1体以上入れてください（最初のウェーブで買えるように）";
  }
  return null;
}

export function setDeck(story, ids, db = null) {
  const deck = [...new Set(ids)].filter((id) => story.heroes.includes(id)).slice(0, DECK_SIZE);
  const error = deckProblem(db, deck);
  if (error) return { ok: false, error };
  story.deck = deck;
  return { ok: true };
}

/**
 * そのステージのマーケットで、レアリティごとに並ぶ割合（ウェーブ全体の平均、%）。
 * デッキ画面の目安と、おまかせ編成に使う
 */
export function stageRarityOdds(key) {
  const parsed = parseStageKey(key);
  if (!parsed) return [100, 0, 0, 0, 0];
  const { area, index } = parsed;
  const waves = stageWaves(area, index);
  const bonus = storyPlayerBonus({ difficulty: stageDifficulty(area, index) }).rank;
  // チームを繰り越すので、ランクはノードの最初からのウェーブ数で上がる（負けなかった場合の目安）
  const before = wavesBefore(area, index);
  const cap = areaRankCap(area);
  const sum = [0, 0, 0, 0, 0];
  for (let w = 1; w <= waves; w++) marketOdds(Math.min(cap, before + w + bonus)).forEach((v, i) => (sum[i] += v / waves));
  return sum.map((v) => Math.round(v));
}

/**
 * デッキで出撃したとき、マーケットの枠が空になる割合（%）。ランクで決まったレアリティ以上の
 * ヒーローがデッキにいない枠は空になる（チュートリアルのノードは空にならない）
 */
export function deckEmptyShare(db, deck, key) {
  const parsed = parseStageKey(key);
  if (!parsed || parsed.area.id === TUTORIAL_AREA) return 0;
  const top = Math.max(0, ...deck.filter((id) => db.has(id)).map((id) => db.def(id).rarity));
  return stageRarityOdds(key).reduce((sum, v, i) => sum + (i + 1 > top ? v : 0), 0);
}

/**
 * おまかせ編成: 仲間から8種類を選ぶ。最初のウェーブで買える Common を2種類と Uncommon を1種類
 * （Common は5GUMで、最初の10GUMで2体買える）、残りはレアリティの高い順。同じレアリティでは新しく仲間になった順
 */
export function autoDeck(db, story) {
  const heroes = story.heroes
    .map((id, order) => ({ id, order }))
    .filter(({ id }) => db.has(id))
    .map((x) => ({ ...x, rarity: db.def(x.id).rarity }))
    .sort((a, b) => b.rarity - a.rarity || b.order - a.order);
  const commons = heroes.filter((x) => x.rarity === 1).slice(0, 2);
  const uncommons = heroes.filter((x) => x.rarity === 2).slice(0, 3 - commons.length);
  const cheap = [...commons, ...uncommons];
  const rest = heroes.filter((x) => !cheap.includes(x)).slice(0, DECK_SIZE - cheap.length);
  return [...rest, ...cheap].map((x) => x.id);
}

/** ノードごとに決まったエネミーの顔ぶれ（レアリティ帯ごとに6体ずつ） */
export function areaEnemyPool(db, area) {
  let h = 2166136261;
  for (const c of area.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rng = createRng(h >>> 0);
  const ids = [];
  for (let r = 1; r <= 5; r++) ids.push(...rng.sample(db.enemies.filter((d) => d.rarity === r).map((d) => d.id), 6));
  return ids;
}

/** ステージの難しさ（ノードの時代 ＋ ステージ番号）。後半のステージほどエネミーの収入が増えて強くなる */
export function stageDifficulty(area, index) {
  return area.difficulty + index;
}

/** ステージの情報（run.story） */
function stageInfo(area, index, key) {
  return {
    key,
    areaId: area.id,
    index,
    waves: stageWaves(area, index),
    difficulty: stageDifficulty(area, index),
    rankCap: areaRankCap(area),
    boss: isFinalStage(area, index) ? area.boss : null,
    tutorial: area.id === TUTORIAL_AREA && index === 0,
    // デッキを組めるようになってから（チュートリアルのノード以外）: デッキにいないレアリティの枠は空になる
    strictRarity: area.id !== TUTORIAL_AREA,
    // チュートリアルのノードはエネミーを弱めにする（1-1 は特に）
    handicap: area.id === TUTORIAL_AREA ? (index === 0 ? 2 : 1) : 0,
  };
}

/**
 * ステージを始める（ウェーブ制のラン）。デッキのヒーローだけがマーケットに並ぶ。最終ステージは最後のウェーブがレイドボス。
 * 前のステージをクリアしたチームがあれば、それを繰り越して始める（ノードの最初のステージは新しいチーム）
 */
export function newStageRun(db, story, key, seed) {
  const parsed = parseStageKey(key);
  if (!parsed) throw new Error(`unknown stage: ${key}`);
  const { area, index } = parsed;
  const deck = story.deck.filter((id) => db.has(id));
  if (!deck.length) throw new Error("デッキが空です");
  const info = stageInfo(area, index, key);
  const carry = nodeRun(story, area.id);
  if (index > 0 && carry.next === index && carry.team) return continueRun(db, carry.team, { seed, heroPool: deck, story: info });
  return newRun(db, { playerId: STORY_PLAYER, seed, heroPool: deck, enemyPool: areaEnemyPool(db, area), story: info });
}

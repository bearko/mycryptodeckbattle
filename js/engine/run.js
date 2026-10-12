// クエスト（参考作 の1ラン相当）の進行管理。
// run はセーブデータとしてそのまま JSON 保存できるプレーンなオブジェクト。
// ストーリーのステージも同じ仕組みで、run.story があるときは「決まった数のウェーブを勝ち抜く」ルールになる。

import { withRng } from "./rng.js";
import { STAGE_LIVES } from "./world.js";
import {
  RARITY,
  START_LIVES,
  WINS_TO_CLEAR,
  TREASURE_STAGES,
  MATERIAL_USES_PER_STAGE,
  stageIncome,
  lifeLoss,
} from "./balance.js";
import { CRYPTO_ENERGY, TREASURES, materialById, playerById, treasureGum } from "./content.js";
import { effectiveRank, poolByRarity, restockMarket, topRarity, buyOffer, sellUnit } from "./market.js";
import { acquireUnit, allUnits, canAcquire, emptyRoster, levelUp } from "./roster.js";
import { buildTeam, collectMods } from "./units.js";
import { buildCpuOpponent } from "./cpu.js";

export const RUN_VERSION = 1;

export function runMods(run, db) {
  return collectMods(run.extensions, db, run.bonusMaxHp);
}

function pickPool(db, defs, rng) {
  const ids = [];
  for (let r = 1; r <= 5; r++) {
    const list = defs.filter((d) => d.rarity === r && !d.novice).map((d) => d.id);
    ids.push(...rng.sample(list, RARITY[r].poolSize));
  }
  return ids;
}

/** クリアに必要な勝利数（ストーリーはウェーブ数） */
export const runGoal = (run) => run.story?.waves ?? WINS_TO_CLEAR;

/**
 * 新しいラン。heroPool / enemyPool を省略するとランダムに選ぶ（フリーバトル）。
 * story を渡すとストーリーのステージ（ウェーブ制・ライフ3・宝箱なし）になる。
 */
export function newRun(db, { playerId, seed, heroPool = null, enemyPool = null, story = null }) {
  const player = playerById(playerId);
  if (!player) throw new Error(`unknown player: ${playerId}`);
  const run = {
    version: RUN_VERSION,
    seed: seed >>> 0,
    rngState: seed >>> 0,
    playerId,
    stage: 0,
    lives: START_LIVES,
    wins: 0,
    losses: 0,
    revived: false,
    gum: 0,
    rankBonus: player.effect.rankBonus || 0,
    freeRerolls: 0,
    itemUses: 0,
    bonusMaxHp: 0,
    heroPool: [],
    enemyPool: [],
    nextUid: 1,
    market: { offers: [] },
    extensions: [],
    pending: [],
    phase: "market",
    history: [],
    lastResult: null,
    ...emptyRoster(),
  };
  if (story) {
    run.story = { ...story };
    run.lives = STAGE_LIVES;
    run.revived = true; // ストーリーでは復活なし
    run.rankBonus += story.difficulty;
  }
  withRng(run, (rng) => {
    run.heroPool = heroPool ? [...heroPool] : pickPool(db, db.heroes, rng);
    run.enemyPool = enemyPool ? [...enemyPool] : pickPool(db, db.enemies, rng);
  });
  startStage(run, db);
  return run;
}

/** 保存データが、データ更新で削除されたユニットを参照していないか */
export function usesKnownUnits(run, db) {
  const ids = [
    ...run.heroPool,
    ...run.enemyPool,
    ...allUnits(run).map(({ unit }) => unit.defId),
    ...run.market.offers.filter((o) => o?.type === "hero").map((o) => o.defId),
  ];
  return ids.every((id) => db.has(id));
}

export function startStage(run, db) {
  const player = playerById(run.playerId);
  const mods = runMods(run, db);
  run.stage += 1;
  run.gum += stageIncome(run.stage) + mods.income + (run.story?.difficulty ?? 0);
  run.freeRerolls += (player.effect.freeRerolls || 0) + mods.freeReroll;
  run.itemUses = MATERIAL_USES_PER_STAGE;
  withRng(run, (rng) => {
    // 取り置きした枠は次のステージへ持ち越す（market.locked は旧仕様の全体取り置き）
    restockMarket(run, db, rng, { keepAll: Boolean(run.market.locked) });
    delete run.market.locked;
    if (!run.story && TREASURE_STAGES.includes(run.stage)) run.pending.push(treasureEvent(run, rng));
  });
  if (run.story?.tutorial) tutorialOffers(run, db);
  run.phase = "market";
}

/**
 * チュートリアル（1-1）のラインナップ。説明に合わせて、
 * ウェーブ1は同じヒーローを2体（合成の準備）、ウェーブ2は合成できるヒーローを先頭に並べる。
 */
function tutorialOffers(run, db) {
  const offers = run.market.offers;
  const hero = (defId) => ({ type: "hero", defId, cost: RARITY[db.def(defId).rarity].cost });
  const pool = run.heroPool;
  if (run.wins === 0 && run.stage === 1) {
    offers[0] = hero(pool[0]);
    offers[1] = hero(pool[0]);
    return;
  }
  if (run.wins === 1) {
    const counts = new Map();
    for (const { unit } of allUnits(run)) if (unit.level === 1) counts.set(unit.defId, (counts.get(unit.defId) || 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    offers[0] = hero(best && best[1] >= 2 ? best[0] : pool[0]);
  }
}

// ---------------------------------------------------------------------------
// 保留中の選択（宝箱、エクステンション、マテリアルの対象選択）
// ---------------------------------------------------------------------------

function treasureEvent(run, rng, reason = "stage") {
  const entries = TREASURES.filter((t) => !(t.id === "life" && run.lives >= START_LIVES)).map((t) => [t.id, t.weight]);
  const options = [];
  while (options.length < 3 && entries.length) {
    const id = rng.weighted(entries);
    options.push(id);
    entries.splice(
      entries.findIndex(([e]) => e === id),
      1,
    );
  }
  return { type: "treasure", reason, options };
}

function extensionEvent(run, db, rng) {
  const factions = new Set(allUnits(run).map(({ unit }) => db.def(unit.defId).faction));
  const pool = db.extensions.filter((x) => x.effect !== "factionMult" || factions.has(x.faction));
  return { type: "extension", options: rng.sample(pool, 3).map((x) => x.id) };
}

function onMerges(run, db, merges) {
  if (!merges?.length) return;
  withRng(run, (rng) => {
    for (let i = 0; i < merges.length; i++) run.pending.push(extensionEvent(run, db, rng));
  });
}

export function currentPending(run) {
  return run.pending[0] ?? null;
}

export function chooseTreasure(run, db, optionId) {
  const ev = run.pending[0];
  if (!ev || ev.type !== "treasure" || !ev.options.includes(optionId)) return { ok: false, error: "選べません" };
  run.pending.shift();
  const result = { ok: true, id: optionId, message: "" };
  switch (optionId) {
    case "gum": {
      const gum = treasureGum(run.stage);
      run.gum += gum;
      result.message = `GUMを${gum}獲得しました`;
      break;
    }
    case "hero": {
      const rarity = topRarity(effectiveRank(run));
      const defId = withRng(run, (rng) => rng.pick(poolByRarity(db, run.heroPool, rarity)));
      const def = db.def(defId);
      if (canAcquire(run, defId)) {
        const { merges } = acquireUnit(run, defId);
        onMerges(run, db, merges);
        result.message = `${def.name}が仲間になりました`;
        result.defId = defId;
      } else {
        run.gum += RARITY[def.rarity].cost;
        result.message = `枠が空いていないため、${def.name}の代わりにGUMを${RARITY[def.rarity].cost}獲得しました`;
      }
      break;
    }
    case "extension":
      withRng(run, (rng) => run.pending.unshift(extensionEvent(run, db, rng)));
      break;
    case "ce":
      if (allUnits(run).length === 0) {
        run.gum += 10;
        result.message = "ヒーローがいないため、代わりにGUMを10獲得しました";
      } else {
        run.pending.unshift({ type: "target", source: "treasure", id: "ce" });
      }
      break;
    case "reroll":
      run.freeRerolls += 3;
      result.message = "マーケットの無料更新が3回増えました";
      break;
    case "maxhp":
      run.bonusMaxHp += 60;
      result.message = "パーティの最大HPが60増えました";
      break;
    case "life":
      run.lives = Math.min(START_LIVES, run.lives + 2);
      result.message = "ライフが回復しました";
      break;
    default:
      return { ok: false, error: "不明な報酬" };
  }
  return result;
}

export function chooseExtension(run, db, extId) {
  const ev = run.pending[0];
  if (!ev || ev.type !== "extension" || !ev.options.includes(extId)) return { ok: false, error: "選べません" };
  run.pending.shift();
  run.extensions.push(extId);
  return { ok: true, extension: db.ext(extId) };
}

/** 対象選択が必要なマテリアル（魔石・クリプトエナジー）を、指定したヒーローに使う */
export function applyTarget(run, db, zone, index) {
  const ev = run.pending[0];
  if (!ev || ev.type !== "target") return { ok: false, error: "対象選択中ではありません" };
  const unit = run[zone]?.[index];
  if (!unit) return { ok: false, error: "ヒーローを選んでください" };
  switch (ev.id) {
    case "ifrit":
      unit.permMult += 20;
      break;
    case "leviathan":
      unit.cdReduce = Math.min(50, unit.cdReduce + 10);
      break;
    case "ce": {
      if (unit.level >= 4) return { ok: false, error: "これ以上Lvを上げられません" };
      run.pending.shift();
      const { merges } = levelUp(run, zone, index);
      onMerges(run, db, merges);
      return { ok: true, unit };
    }
    default:
      return { ok: false, error: "不明なマテリアル" };
  }
  run.pending.shift();
  return { ok: true, unit };
}

export function targetMaterial(id) {
  return id === "ce" ? CRYPTO_ENERGY : materialById(id);
}

// ---------------------------------------------------------------------------
// マーケット操作（保留中の選択があるときは操作できない）
// ---------------------------------------------------------------------------

export function buy(run, db, index) {
  if (run.pending.length) return { ok: false, error: "先に選択を済ませてください" };
  const result = buyOffer(run, db, index);
  if (!result.ok) return result;
  if (result.merges) onMerges(run, db, result.merges);
  if (result.material) {
    const m = result.material;
    if (m.target) run.pending.unshift({ type: "target", source: "material", id: m.id });
    else if (m.id === "tiamat") run.bonusMaxHp += 40;
    else if (m.id === "garuda") run.rankBonus += 1;
  }
  return result;
}

export function sell(run, db, zone, index) {
  if (run.pending.length) return { ok: false, error: "先に選択を済ませてください" };
  return sellUnit(run, db, zone, index, runMods(run, db).sellBonus);
}

// ---------------------------------------------------------------------------
// バトル
// ---------------------------------------------------------------------------

export function playerTeam(run, db) {
  const player = playerById(run.playerId);
  const units = run.party.map((unit, slot) => unit && { unit, slot }).filter(Boolean);
  return buildTeam({
    name: player.name,
    units,
    stage: run.stage,
    mods: runMods(run, db),
    db,
    leader: { name: player.name, image: player.images.idle, pixelated: player.pixelated !== false },
  });
}

export function canStartBattle(run) {
  if (run.phase !== "market") return { ok: false, error: "いまはバトルできません" };
  if (run.pending.length) return { ok: false, error: "先に選択を済ませてください" };
  if (!run.party.some(Boolean)) return { ok: false, error: "パーティにヒーローを1体以上配置してください" };
  return { ok: true };
}

export function prepareBattle(run, db) {
  const check = canStartBattle(run);
  if (!check.ok) return check;
  const opponent = buildCpuOpponent(db, run, run.stage);
  run.phase = "battle";
  return { ok: true, left: playerTeam(run, db), right: opponent.team, opponent };
}

/** バトル結果を反映する。summary は battleSummary() の戻り値 */
export function finishBattle(run, db, summary) {
  const player = playerById(run.playerId);
  const won = summary.winner === 0;
  const result = {
    stage: run.stage,
    won,
    opponent: summary.sides[1].name,
    time: summary.time,
    livesLost: 0,
    gumGained: 0,
    revived: false,
    buffed: null,
  };
  if (won) {
    run.wins += 1;
    const mods = runMods(run, db);
    if (mods.winGum) {
      run.gum += mods.winGum;
      result.gumGained += mods.winGum;
    }
    if (player.effect.winBuff) {
      const party = run.party.filter(Boolean);
      if (party.length) {
        const unit = withRng(run, (rng) => rng.pick(party));
        unit.permMult += player.effect.winBuff;
        result.buffed = { defId: unit.defId, value: player.effect.winBuff };
      }
    }
  } else {
    run.losses += 1;
    result.livesLost = run.story ? 1 : lifeLoss(run.stage);
    run.lives -= result.livesLost;
    if (run.lives <= 0) {
      if (!run.revived) {
        run.revived = true;
        run.lives = 1;
        result.revived = true;
      }
    }
  }
  run.history.push({ stage: run.stage, won, opponent: result.opponent, time: summary.time });
  run.lastResult = result;
  if (run.wins >= runGoal(run)) run.phase = "clear";
  else if (run.lives <= 0) run.phase = "gameover";
  else run.phase = "result";
  return result;
}

/** 結果画面のあと、次のステージへ進む */
export function advance(run, db) {
  if (run.phase !== "result") return;
  const revived = run.lastResult?.revived;
  startStage(run, db);
  if (revived) withRng(run, (rng) => run.pending.unshift(treasureEvent(run, rng, "revive")));
}

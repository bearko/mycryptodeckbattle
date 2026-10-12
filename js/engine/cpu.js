// CPU対戦相手（エネミー部隊）の生成。
//
// 参考作 では「同じ日数に保存された他プレイヤーの盤面」と戦う。
// オンライン対戦はスコープ外なので、エネミーだけのプールを使って
// 仮想プレイヤーにステージ1から同じルールで買い物をさせ、その日の盤面を作る。

import { createRng } from "./rng.js";
import { RARITY, stageIncome, storyCpuBonus } from "./balance.js";
import { rollMarket } from "./market.js";
import { emptyRoster } from "./roster.js";
import { botShop, unitValue } from "./bot.js";
import { addFieldMods, buildTeam, collectMods } from "./units.js";
import { FIELDS } from "./world.js";

/** CPUにだけ与える追加GUM（宝箱・マテリアル・プレイヤースキルを使わない分の補正） */
export function cpuBonusIncome(stage) {
  return stage >= 5 ? Math.floor(stage / 4) : 0;
}

/** CPUが合成時に選ぶエクステンション（経済系は使わないので除外） */
const CPU_EXTENSION_EFFECTS = new Set([
  "maxHp",
  "startShield",
  "kindMult",
  "kindFlat",
  "speedAll",
  "speedCol",
  "colMult",
  "startBleed",
  "startPoison",
  "multicastSlowest",
  "startCharge",
]);

export function opponentSeed(run, stage) {
  return (Math.imul(run.seed ^ 0x9e3779b9, 2654435761) + stage * 40503) >>> 0;
}

/** ストーリーのCPUの強さ（補正の係数は balance.js の STORY_BALANCE） */
export function storyCpuTuning(story) {
  return storyCpuBonus(story);
}

/**
 * CPUの部隊を作る。stage ラウンドぶんマーケットで買い物をした結果のパーティ。
 * ストーリーではステージの難しさだけマーケットランクと収入を上乗せする（チュートリアルは弱め）。
 */
export function buildCpuOpponent(db, run, stage) {
  const rng = createRng(opponentSeed(run, stage));
  const story = run.story;
  const tune = story ? storyCpuTuning(story) : { rank: 0, income: 0, power: 0, hp: 0 };
  const extraIncome = tune.income;
  const ghost = {
    stage: 0,
    rankBonus: tune.rank,
    rankCap: story?.rankCap,
    gum: 0,
    freeRerolls: 0,
    itemUses: 0,
    // ストーリーはステージのエネミーの傾向に合わせた顔ぶれ
    heroPool: story?.enemyPool ?? run.enemyPool,
    nextUid: 1,
    market: { offers: [] },
    extensions: [],
    ...emptyRoster(),
  };
  const extPool = db.extensions.filter((x) => CPU_EXTENSION_EFFECTS.has(x.effect));

  for (let s = 1; s <= stage; s++) {
    ghost.stage = s;
    // 追加GUM（宝箱などの代わり）はフリーバトルだけ。ストーリーは宝箱がなく、難しさの補正で決める
    // 最低でも Common を1体買える分は入る（補正がマイナスでも部隊が空にならないように）
    ghost.gum += Math.max(RARITY[1].cost, stageIncome(s) + (story ? 0 : cpuBonusIncome(s)) + extraIncome);
    rollMarket(ghost, db, rng);
    botShop(ghost, db, rng, {
      maxRerolls: 2,
      onMerge: () => ghost.extensions.push(rng.pick(extPool).id),
    });
  }

  const units = ghost.party.map((unit, slot) => unit && { unit, slot }).filter(Boolean);
  if (!units.length) units.push({ unit: { uid: ghost.nextUid++, defId: ghost.heroPool[0], level: 1, permMult: 0, cdReduce: 0 }, slot: 0 });
  const leaderUnit = units.reduce((a, c) => (unitValue(db, c.unit) > unitValue(db, a.unit) ? c : a), units[0]).unit;
  const leaderDef = db.def(leaderUnit.defId);
  const mods = addFieldMods(collectMods(ghost.extensions, db), FIELDS[story?.field]);
  // ストーリー: 後半のステージほどエネミーの効果量とパーティHPを上げる（盤面が埋まったあとも強くなるように）
  if (tune.power) for (const { unit } of units) unit.permMult += tune.power;
  const team = buildTeam({
    name: `${leaderDef.name}の部隊`,
    units,
    stage,
    mods,
    db,
    leader: { name: leaderDef.name, image: leaderDef.image, pixelated: true },
  });
  if (tune.hp) team.maxHp = Math.round(team.maxHp * (1 + tune.hp / 100));
  return { team, units, extensions: ghost.extensions };
}

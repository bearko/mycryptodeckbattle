// CPU対戦相手（エネミー部隊）の生成。
//
// 参考作 では「同じ日数に保存された他プレイヤーの盤面」と戦う。
// オンライン対戦はスコープ外なので、エネミーだけのプールを使って
// 仮想プレイヤーにステージ1から同じルールで買い物をさせ、その日の盤面を作る。

import { createRng } from "./rng.js";
import { stageIncome } from "./balance.js";
import { rollMarket } from "./market.js";
import { emptyRoster } from "./roster.js";
import { botShop, unitValue } from "./bot.js";
import { buildTeam, collectMods } from "./units.js";

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

export function buildCpuOpponent(db, run, stage) {
  const rng = createRng(opponentSeed(run, stage));
  const ghost = {
    stage: 0,
    rankBonus: 0,
    gum: 0,
    freeRerolls: 0,
    itemUses: 0,
    heroPool: run.enemyPool,
    nextUid: 1,
    market: { offers: [] },
    extensions: [],
    ...emptyRoster(),
  };
  const extPool = db.extensions.filter((x) => CPU_EXTENSION_EFFECTS.has(x.effect));

  for (let s = 1; s <= stage; s++) {
    ghost.stage = s;
    ghost.gum += stageIncome(s) + cpuBonusIncome(s);
    rollMarket(ghost, db, rng);
    botShop(ghost, db, rng, {
      maxRerolls: 2,
      onMerge: () => ghost.extensions.push(rng.pick(extPool).id),
    });
  }

  const units = ghost.party.map((unit, slot) => unit && { unit, slot }).filter(Boolean);
  const leaderUnit = units.reduce((a, c) => (unitValue(db, c.unit) > unitValue(db, a.unit) ? c : a), units[0]).unit;
  const leaderDef = db.def(leaderUnit.defId);
  const mods = collectMods(ghost.extensions, db);
  const team = buildTeam({
    name: `${leaderDef.name}の部隊`,
    units,
    stage,
    mods,
    db,
    leader: { name: leaderDef.name, image: leaderDef.image, pixelated: true },
  });
  return { team, units, extensions: ghost.extensions };
}

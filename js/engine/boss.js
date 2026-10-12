// レイドボス（ストーリーの各ノードの最終ステージの、最後のウェーブ）。
//
// MCH のレイドのように、大きなボス1体と戦う。ボスはスキルを順番に使い（ローテーション）、
// 「Final Phase」などの大技（final）は事前に予告する。HP と効果量は、そのウェーブの
// 通常のエネミー部隊（buildCpuOpponent）を基準に決めるので、ステージの難しさに合わせて強くなる。

import { LEVEL_MULT, RARITY, kindValue } from "./balance.js";
import { buildCpuOpponent } from "./cpu.js";

/**
 * ボスの強さ（独自）。基準にした通常のエネミー部隊に対して
 * hp: パーティHPの倍率 / power: 1秒あたりの効果量の倍率 / easy: チュートリアルのノード（handicap あり）での倍率
 * 難しさが fromD を超えた分だけ、1あたり hpPerD・powerPerD を足す（終盤の部隊はエクステンションの強化が多く、
 * 予算だけで作ったボスが相対的に弱くなるため）
 */
export const BOSS_TUNING = { hp: 2, power: 1, easy: 0.6, fromD: 11, hpPerD: 0.5, powerPerD: 0.12 };

/** 弱体化・チャージ遅延は1回の量に上限を設ける（ボス1体に部隊ぶんの予算が集まるため） */
const BOSS_CAPS = { weaken: 30, slow: 1.5 };

/** 中衛の中央に置く（盤面では両方の段にまたがって大きく描く） */
export const BOSS_SLOT = 1;

/** 部隊の1秒あたりの効果量の目安（レアリティの予算 × Lv × 強化） */
function teamPower(db, units) {
  return units.reduce((sum, { unit }) => {
    const def = db.def(unit.defId);
    return sum + RARITY[def.rarity].budget * LEVEL_MULT[unit.level] * (1 + (unit.permMult || 0) / 100);
  }, 0);
}

function bossEffect(kind, budget) {
  let value = kindValue(kind, budget);
  if (BOSS_CAPS[kind] !== undefined) value = Math.min(BOSS_CAPS[kind], value);
  return { kind, trigger: "charge", value };
}

/** ローテーション1周の、1秒あたりの weight の平均（ボスごとの強さをそろえるのに使う） */
export function rotationWeight(skills) {
  const loop = skills.reduce((s, k) => s + k.cd, 0);
  const total = skills.reduce((s, k) => s + k.cd * k.effects.reduce((a, e) => a + e.weight, 0), 0);
  return total / loop;
}

/** ボスのスキル（ローテーションの1つ）を数値にする。power は1秒あたりの平均の効果量 */
export function bossSkill(skill, power, scale = 1) {
  return {
    name: skill.name,
    cd: skill.cd,
    final: Boolean(skill.final),
    effects: skill.effects.map((e) => bossEffect(e.kind, power * skill.cd * e.weight * scale)),
  };
}

/** ストーリーのステージで、いまのウェーブがレイドボスか（最終ステージの最後のウェーブ） */
export function isBossWave(run) {
  return Boolean(run.story?.boss) && run.wins === run.story.waves - 1;
}

/** レイドボスの部隊（ボス1体）を作る。戻り値は buildCpuOpponent と同じ形＋boss */
export function buildBossOpponent(db, run, stage) {
  const def = db.def(run.story.boss);
  const base = buildCpuOpponent(db, run, stage);
  const t = BOSS_TUNING;
  const easy = run.story.handicap ? t.easy : 1;
  const late = Math.max(0, run.story.difficulty - t.fromD);
  const power = Math.max(1, teamPower(db, base.units)) * (t.power + late * t.powerPerD) * (def.power ?? 1) * easy;
  const scale = 1 / rotationWeight(def.skills);
  const rotation = def.skills.map((s) => bossSkill(s, power, scale));
  const fighter = {
    slot: BOSS_SLOT,
    uid: 0,
    defId: def.id,
    name: def.name,
    image: def.image,
    rarity: def.rarity,
    level: 1,
    boss: true,
    cd: rotation[0].cd,
    effects: rotation[0].effects,
    rotation,
    multicast: 1,
  };
  const team = {
    name: def.name,
    boss: true,
    leader: { name: def.name, image: def.image, pixelated: true },
    maxHp: Math.round(base.team.maxHp * (t.hp + late * t.hpPerD) * easy),
    fighters: [fighter],
    start: { shield: 0, bleed: 0, poison: 0, charge: 0 },
  };
  return { team, units: [], extensions: [], boss: def };
}

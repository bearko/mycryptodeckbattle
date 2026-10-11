// ユニット定義（ヒーロー/エネミー）から、バトルで使う数値と説明文を作る。

import {
  RARITY,
  LEVEL_MULT,
  START_TRIGGER_SECONDS,
  PARTY_COLS,
  baseCooldown,
  baseMaxHp,
  kindValue,
  unitHp,
} from "./balance.js";

export function createDb({ heroes, enemies, extensions }) {
  const defs = new Map();
  for (const d of heroes) defs.set(d.id, d);
  for (const d of enemies) defs.set(d.id, d);
  const exts = new Map(extensions.map((e) => [e.id, e]));
  return {
    heroes,
    enemies,
    extensions,
    has(id) {
      return defs.has(id);
    },
    def(id) {
      const d = defs.get(id);
      if (!d) throw new Error(`unknown unit def: ${id}`);
      return d;
    },
    ext(id) {
      const e = exts.get(id);
      if (!e) throw new Error(`unknown extension: ${id}`);
      return e;
    },
  };
}

export function hasChargeSkill(def) {
  return def.effects.some((e) => e.trigger === "charge");
}

/** Lvごとの基本効果量（エクステンション等の補正前） */
export function baseEffects(def, level) {
  const cd = baseCooldown(def);
  return def.effects.map((e) => {
    const seconds = e.trigger === "start" ? START_TRIGGER_SECONDS : cd;
    const budget = RARITY[def.rarity].budget * seconds * e.weight * LEVEL_MULT[level];
    return { kind: e.kind, trigger: e.trigger, value: kindValue(e.kind, budget) };
  });
}

export function emptyMods() {
  return {
    maxHp: 0,
    kindMult: {},
    kindFlat: {},
    speedAll: 0,
    speedCol: [0, 0, 0],
    colMult: [0, 0, 0],
    factionMult: {},
    startShield: 0,
    startBleed: 0,
    startPoison: 0,
    startCharge: 0,
    multicastSlowest: 0,
    income: 0,
    freeReroll: 0,
    winGum: 0,
    sellBonus: 0,
  };
}

/** 所持エクステンションの効果を合算する（同じものを複数持つと重複して効く） */
export function collectMods(extIds, db, bonusMaxHp = 0) {
  const m = emptyMods();
  m.maxHp += bonusMaxHp;
  for (const id of extIds) {
    const x = db.ext(id);
    switch (x.effect) {
      case "maxHp":
        m.maxHp += x.value;
        break;
      case "kindMult":
        m.kindMult[x.kind] = (m.kindMult[x.kind] || 0) + x.value;
        break;
      case "kindFlat":
        m.kindFlat[x.kind] = (m.kindFlat[x.kind] || 0) + x.value;
        break;
      case "speedAll":
        m.speedAll += x.value;
        break;
      case "speedCol":
        m.speedCol[x.col] += x.value;
        break;
      case "colMult":
        m.colMult[x.col] += x.value;
        break;
      case "factionMult":
        m.factionMult[x.faction] = (m.factionMult[x.faction] || 0) + x.value;
        break;
      case "startShield":
      case "startBleed":
      case "startPoison":
      case "startCharge":
      case "multicastSlowest":
      case "income":
      case "freeReroll":
      case "winGum":
      case "sellBonus":
        m[x.effect] += x.value;
        break;
      default:
        throw new Error(`unknown extension effect: ${x.effect}`);
    }
  }
  return m;
}

function roundTo(v, step) {
  return Math.round(v / step) * step;
}

/** 補正込みの効果量 */
export function finalEffects(def, unit, slot, mods) {
  const col = slot % PARTY_COLS;
  const pct = (unit.permMult || 0) + mods.colMult[col] + (mods.factionMult[def.faction] || 0);
  return baseEffects(def, unit.level).map((e) => {
    const k = pct + (mods.kindMult[e.kind] || 0);
    let value = e.value * (1 + k / 100);
    if (e.kind === "haste" || e.kind === "slow") value = roundTo(value, 0.1);
    else value = Math.max(1, Math.round(value));
    if (mods.kindFlat[e.kind]) value += mods.kindFlat[e.kind];
    return { ...e, value: Number(value.toFixed(1)) };
  });
}

export function finalCooldown(def, unit, slot, mods) {
  if (!hasChargeSkill(def)) return null;
  const col = slot % PARTY_COLS;
  const speed = 1 + (mods.speedAll + mods.speedCol[col]) / 100;
  const cd = (baseCooldown(def) * (1 - (unit.cdReduce || 0) / 100)) / speed;
  return Math.max(1, Math.round(cd * 10) / 10);
}

/**
 * バトル用のチーム情報を作る。
 * units: [{ unit, slot }]（slot は 0..5、空き枠は含めない）
 */
export function buildTeam({ name, units, stage, mods, db, leader }) {
  const fighters = units.map(({ unit, slot }) => {
    const def = db.def(unit.defId);
    return {
      slot,
      uid: unit.uid,
      defId: def.id,
      name: def.name,
      image: def.image,
      rarity: def.rarity,
      level: unit.level,
      cd: finalCooldown(def, unit, slot, mods),
      effects: finalEffects(def, unit, slot, mods),
      multicast: 1,
    };
  });
  if (mods.multicastSlowest > 0) {
    const charged = fighters.filter((f) => f.cd !== null);
    if (charged.length) {
      const slowest = charged.reduce((a, b) => (b.cd > a.cd ? b : a));
      slowest.multicast += mods.multicastSlowest;
    }
  }
  let maxHp = baseMaxHp(stage) + mods.maxHp;
  for (const { unit } of units) maxHp += unitHp(db.def(unit.defId), unit.level);
  return {
    name,
    leader,
    maxHp,
    fighters,
    start: {
      shield: mods.startShield,
      bleed: mods.startBleed,
      poison: mods.startPoison,
      charge: mods.startCharge,
    },
  };
}

// ---------------------------------------------------------------------------
// 説明文
// ---------------------------------------------------------------------------

export function effectText(kind, value) {
  switch (kind) {
    case "damage":
      return `敵パーティに${value}ダメージ`;
    case "shield":
      return `味方パーティにシールド${value}`;
    case "heal":
      return `味方パーティのHPを${value}回復`;
    case "bleed":
      return `敵パーティに出血${value}を付与`;
    case "poison":
      return `敵パーティに毒${value}を付与`;
    case "haste":
      return `隣接する味方のチャージを${value}秒進める`;
    case "slow":
      return `チャージが最も進んでいる敵1体のチャージを${value}秒戻す`;
    case "buff":
      return `隣接する味方のスキル効果量+${value}%（バトル中）`;
    case "weaken":
      return `効果量が最も高い敵1体のスキル効果量-${value}%（バトル中）`;
    default:
      return kind;
  }
}

/** 効果量を「Lv1 / Lv2 / Lv3」の並びで返す（UIで現在Lvを強調する用） */
export function effectLevelTable(def, maxLevel = 3) {
  const rows = def.effects.map((e) => ({ kind: e.kind, trigger: e.trigger, values: [] }));
  for (let lv = 1; lv <= maxLevel; lv++) {
    baseEffects(def, lv).forEach((e, i) => rows[i].values.push(e.value));
  }
  return rows;
}

export function triggerLabel(trigger, cd) {
  return trigger === "start" ? "バトル開始時" : `チャージ${cd}秒`;
}

// オートバトルのシミュレーション。乱数を使わない決定的な処理。
//
// ルール（参考作 の公開情報に合わせたもの）
// - 各陣営は1つの「パーティHP」を共有する。0になった陣営の負け
// - 各ヒーローはチャージ時間ごとにスキルを発動する
// - 同時に発動したスキルは シールド → ダメージ → 状態異常 → 回復 の順で解決
// - 同じ段階ではプレイヤー側（左）が先。同時に決着する場合はプレイヤー側が有利
// - 出血: 0.5秒ごとにスタック数ダメージ→1減少 / 毒: 1秒ごとにスタック数ダメージ（減少しない）
// - 出血・毒ダメージはシールドに対して15%軽減
// - 30秒でサドンデス開始。0.5秒ごとに両陣営へ増加していくダメージ
// - rotation を持つユニット（レイドボス）は、発動のたびに次のスキルへ進む。チャージ時間もスキルごと
// - resist（0〜1）を持つユニットは、弱体化・チャージ遅延をその割合だけ軽減する（レイドボス）

import {
  TICK,
  BLEED_INTERVAL,
  POISON_INTERVAL,
  STATUS_VS_SHIELD,
  SUDDEN_DEATH_AT,
  SUDDEN_DEATH_INTERVAL,
  SUDDEN_DEATH_STEP,
  MIN_RUNTIME_MULT,
  PARTY_COLS,
} from "./balance.js";

const PHASE = { shield: 0, damage: 1, bleed: 2, poison: 2, slow: 2, weaken: 2, haste: 2, buff: 2, heal: 3 };
const PHASE_COUNT = 4;
const MAX_TIME = 120;

const ticksPer = (seconds) => Math.round(seconds / TICK);

export function createBattle(left, right) {
  const sides = [left, right].map((team, index) => ({
    index,
    name: team.name,
    leader: team.leader,
    maxHp: team.maxHp,
    hp: team.maxHp,
    shield: 0,
    bleed: 0,
    poison: 0,
    start: team.start,
    fighters: team.fighters
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((f) => ({ ...f, charge: 0, mult: 1, casts: 0, contribution: 0 })),
  }));
  return { tick: 0, time: 0, started: false, over: false, winner: null, sudden: 0, sides };
}

function adjacentSlots(slot) {
  const row = Math.floor(slot / PARTY_COLS);
  const col = slot % PARTY_COLS;
  const result = [];
  if (col > 0) result.push(slot - 1);
  if (col < PARTY_COLS - 1) result.push(slot + 1);
  result.push(row === 0 ? slot + PARTY_COLS : slot - PARTY_COLS);
  return result;
}

function fighterPower(f) {
  return f.effects.reduce((sum, e) => sum + e.value, 0) * f.mult;
}

function scaled(effect, mult) {
  const v = effect.value * mult;
  switch (effect.kind) {
    case "haste":
    case "slow":
      return Math.round(v * 10) / 10;
    case "bleed":
    case "poison":
    case "buff":
    case "weaken":
      return Math.max(1, Math.round(v));
    default:
      return Math.max(0, Math.round(v));
  }
}

function end(b, loserIndex, events) {
  if (b.over) return;
  b.over = true;
  b.winner = 1 - loserIndex;
  events.push({ type: "end", winner: b.winner, time: b.time });
}

function dealDamage(b, side, amount, isStatus, events) {
  if (amount <= 0 || b.over) return 0;
  let toHp = amount;
  if (side.shield > 0) {
    const vsShield = isStatus ? amount * STATUS_VS_SHIELD : amount;
    if (side.shield >= vsShield) {
      side.shield -= vsShield;
      toHp = 0;
    } else {
      toHp = amount * ((vsShield - side.shield) / vsShield);
      side.shield = 0;
    }
  }
  side.hp -= toHp;
  if (side.hp <= 0.0001) {
    side.hp = 0;
    end(b, side.index, events);
  }
  return amount;
}

function applyEffect(b, side, f, effect, events) {
  const me = b.sides[side];
  const foe = b.sides[1 - side];
  const value = scaled(effect, f.mult);
  const ev = { type: "effect", side, slot: f.slot, kind: effect.kind, value, targets: [] };
  switch (effect.kind) {
    case "damage":
      events.push(ev);
      dealDamage(b, foe, value, false, events);
      f.contribution += value;
      return;
    case "shield":
      me.shield += value;
      f.contribution += value;
      break;
    case "heal": {
      const before = me.hp;
      me.hp = Math.min(me.maxHp, me.hp + value);
      f.contribution += me.hp - before;
      break;
    }
    case "bleed":
      foe.bleed += value;
      f.contribution += value;
      break;
    case "poison":
      foe.poison += value;
      f.contribution += value;
      break;
    case "haste":
      for (const s of adjacentSlots(f.slot)) {
        const t = me.fighters.find((x) => x.slot === s && x.cd !== null);
        if (!t) continue;
        t.charge = Math.min(t.cd, t.charge + value);
        ev.targets.push(s);
        f.contribution += value;
      }
      break;
    case "buff":
      for (const s of adjacentSlots(f.slot)) {
        const t = me.fighters.find((x) => x.slot === s);
        if (!t) continue;
        t.mult += value / 100;
        ev.targets.push(s);
        f.contribution += value;
      }
      break;
    case "slow": {
      const candidates = foe.fighters.filter((x) => x.cd !== null);
      if (candidates.length) {
        const t = candidates.reduce((a, c) => (c.charge / c.cd > a.charge / a.cd ? c : a));
        t.charge = Math.max(0, t.charge - value * (1 - (t.resist || 0)));
        ev.targets.push(t.slot);
        f.contribution += value;
      }
      break;
    }
    case "weaken": {
      if (foe.fighters.length) {
        const t = foe.fighters.reduce((a, c) => (fighterPower(c) > fighterPower(a) ? c : a));
        t.mult = Math.max(MIN_RUNTIME_MULT, t.mult - (value / 100) * (1 - (t.resist || 0)));
        ev.targets.push(t.slot);
        f.contribution += value;
      }
      break;
    }
    default:
      return;
  }
  events.push(ev);
}

function resolveCasts(b, queue, trigger, events) {
  for (let phase = 0; phase < PHASE_COUNT; phase++) {
    for (const { side, fighter } of queue) {
      for (const effect of fighter.effects) {
        if (effect.trigger !== trigger || PHASE[effect.kind] !== phase) continue;
        applyEffect(b, side, fighter, effect, events);
        if (b.over) return;
      }
    }
  }
}

function applyStart(b, events) {
  events.push({ type: "start" });
  for (const side of b.sides) {
    const foe = b.sides[1 - side.index];
    if (side.start.charge > 0) {
      for (const f of side.fighters) if (f.cd !== null) f.charge = Math.min(f.cd, f.charge + side.start.charge);
    }
    if (side.start.shield > 0) side.shield += side.start.shield;
    if (side.start.bleed > 0) foe.bleed += side.start.bleed;
    if (side.start.poison > 0) foe.poison += side.start.poison;
    if (side.start.shield || side.start.bleed || side.start.poison || side.start.charge) {
      events.push({ type: "extensions", side: side.index });
    }
  }
  const queue = [];
  for (const side of b.sides) {
    for (const f of side.fighters) {
      if (f.effects.some((e) => e.trigger === "start")) {
        queue.push({ side: side.index, fighter: f });
        events.push({ type: "cast", side: side.index, slot: f.slot, trigger: "start" });
      }
    }
  }
  resolveCasts(b, queue, "start", events);
}

/** 1ティック進める。発生したイベントの配列を返す */
export function stepBattle(b) {
  const events = [];
  if (b.over) return events;
  if (!b.started) {
    b.started = true;
    applyStart(b, events);
    return events;
  }
  b.tick += 1;
  b.time = Math.round(b.tick * TICK * 10) / 10;

  const queue = [];
  for (const side of b.sides) {
    for (const f of side.fighters) {
      if (f.cd === null) continue;
      f.charge += TICK;
      if (f.charge >= f.cd - 1e-9) {
        f.charge = Math.max(0, f.charge - f.cd);
        const skill = f.rotation ? f.rotation[f.casts % f.rotation.length] : null;
        f.casts += 1;
        if (skill) {
          f.effects = skill.effects;
          f.cd = f.rotation[f.casts % f.rotation.length].cd;
        }
        for (let i = 0; i < f.multicast; i++) queue.push({ side: side.index, fighter: f });
        const ev = { type: "cast", side: side.index, slot: f.slot, trigger: "charge", multicast: f.multicast };
        if (skill) Object.assign(ev, { skill: skill.name, final: skill.final });
        events.push(ev);
      }
    }
  }
  resolveCasts(b, queue, "charge", events);
  if (b.over) return events;

  // 状態異常ダメージは敵側（右）から先に処理する
  if (b.tick % ticksPer(BLEED_INTERVAL) === 0) {
    for (const side of [b.sides[1], b.sides[0]]) {
      if (side.bleed <= 0) continue;
      const dmg = side.bleed;
      side.bleed -= 1;
      events.push({ type: "dot", side: side.index, kind: "bleed", value: dmg });
      dealDamage(b, side, dmg, true, events);
      if (b.over) return events;
    }
  }
  if (b.tick % ticksPer(POISON_INTERVAL) === 0) {
    for (const side of [b.sides[1], b.sides[0]]) {
      if (side.poison <= 0) continue;
      events.push({ type: "dot", side: side.index, kind: "poison", value: side.poison });
      dealDamage(b, side, side.poison, true, events);
      if (b.over) return events;
    }
  }
  if (b.time >= SUDDEN_DEATH_AT && b.tick % ticksPer(SUDDEN_DEATH_INTERVAL) === 0) {
    b.sudden += 1;
    const dmg = b.sudden * SUDDEN_DEATH_STEP;
    events.push({ type: "sudden", value: dmg });
    for (const side of [b.sides[1], b.sides[0]]) {
      dealDamage(b, side, dmg, false, events);
      if (b.over) return events;
    }
  }
  if (b.time >= MAX_TIME) {
    const [l, r] = b.sides;
    end(b, l.hp / l.maxHp >= r.hp / r.maxHp ? 1 : 0, events);
  }
  return events;
}

/** rotation を持つユニットが次に使うスキル */
export function nextSkill(f) {
  return f.rotation ? f.rotation[f.casts % f.rotation.length] : null;
}

/** 決着まで一気に進める */
export function runBattle(left, right) {
  const b = createBattle(left, right);
  while (!b.over) stepBattle(b);
  return b;
}

export function battleSummary(b) {
  return {
    winner: b.winner,
    time: b.time,
    sides: b.sides.map((s) => ({
      name: s.name,
      hp: Math.ceil(s.hp),
      maxHp: s.maxHp,
      mvp: s.fighters.length ? s.fighters.reduce((a, c) => (c.contribution > a.contribution ? c : a)).defId : null,
    })),
  };
}

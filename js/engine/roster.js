// パーティ（6枠）と控え（4枠）の管理、合成処理。
// run だけでなく CPU の仮想プレイヤー（同じ形のオブジェクト）にも使う。

import { PARTY_SIZE, BENCH_SIZE, MAX_MERGE_LEVEL, MAX_LEVEL } from "./balance.js";

export function emptyRoster() {
  return { party: Array(PARTY_SIZE).fill(null), bench: Array(BENCH_SIZE).fill(null) };
}

export function newUnit(owner, defId, level = 1) {
  const uid = owner.nextUid++;
  return { uid, defId, level, permMult: 0, cdReduce: 0 };
}

export function allUnits(owner) {
  const list = [];
  owner.party.forEach((unit, index) => unit && list.push({ unit, zone: "party", index }));
  owner.bench.forEach((unit, index) => unit && list.push({ unit, zone: "bench", index }));
  return list;
}

export function unitAt(owner, zone, index) {
  return owner[zone]?.[index] ?? null;
}

export function findEmptySlot(owner) {
  const p = owner.party.indexOf(null);
  if (p >= 0) return { zone: "party", index: p };
  const b = owner.bench.indexOf(null);
  if (b >= 0) return { zone: "bench", index: b };
  return null;
}

export function countCopies(owner, defId, level) {
  return allUnits(owner).filter(({ unit }) => unit.defId === defId && (level === undefined || unit.level === level))
    .length;
}

/** 空き枠があるか、買った瞬間に合成できるなら入手可能 */
export function canAcquire(owner, defId) {
  return findEmptySlot(owner) !== null || countCopies(owner, defId, 1) >= 2;
}

export function placeUnit(owner, unit, pos = findEmptySlot(owner)) {
  if (!pos) throw new Error("no empty slot");
  owner[pos.zone][pos.index] = unit;
  return pos;
}

export function removeUnit(owner, zone, index) {
  const unit = owner[zone][index];
  owner[zone][index] = null;
  return unit;
}

/** 枠の入れ替え（空き枠への移動を含む） */
export function moveUnit(owner, from, to) {
  if (from.zone === to.zone && from.index === to.index) return false;
  const a = owner[from.zone][from.index];
  const b = owner[to.zone][to.index];
  if (!a) return false;
  owner[from.zone][from.index] = b;
  owner[to.zone][to.index] = a;
  return true;
}

function positionRank({ zone, index }) {
  return (zone === "party" ? 0 : 100) + index;
}

/**
 * 同じヒーローが揃っていたら合成する。Lv1×3→Lv2、Lv2×2→Lv3。
 * 合成後のヒーローは、パーティにいる個体（なければ控えの先頭）の位置に置く。
 * 合成のたびに 1件ずつ結果を返す（エクステンション報酬の回数に使う）。
 */
export function resolveMerges(owner, defId) {
  const merges = [];
  for (;;) {
    let merged = false;
    for (const [level, need] of [
      [1, 3],
      [2, 2],
    ]) {
      if (level + 1 > MAX_MERGE_LEVEL) continue;
      const copies = allUnits(owner)
        .filter(({ unit }) => unit.defId === defId && unit.level === level)
        .sort((a, b) => positionRank(a) - positionRank(b))
        .slice(0, need);
      if (copies.length < need) continue;
      const keep = copies[0];
      const result = newUnit(owner, defId, level + 1);
      for (const c of copies) {
        result.permMult += c.unit.permMult;
        result.cdReduce = Math.min(50, result.cdReduce + c.unit.cdReduce);
        removeUnit(owner, c.zone, c.index);
      }
      placeUnit(owner, result, { zone: keep.zone, index: keep.index });
      merges.push({ defId, level: level + 1, zone: keep.zone, index: keep.index, uid: result.uid });
      merged = true;
      break;
    }
    if (!merged) return merges;
  }
}

/** ヒーローを入手して配置し、必要なら合成する */
export function acquireUnit(owner, defId, level = 1) {
  if (!canAcquire(owner, defId) && level === 1) return null;
  const unit = newUnit(owner, defId, level);
  let pos = findEmptySlot(owner);
  if (!pos) {
    // 満杯だが合成できる場合: いったん仮置きせず、Lv1を1体だけ合成素材として扱う
    const copies = allUnits(owner)
      .filter(({ unit: u }) => u.defId === defId && u.level === 1)
      .sort((a, b) => positionRank(a) - positionRank(b));
    const keep = copies[0];
    const result = newUnit(owner, defId, 2);
    for (const c of copies.slice(0, 2)) {
      result.permMult += c.unit.permMult;
      result.cdReduce = Math.min(50, result.cdReduce + c.unit.cdReduce);
      removeUnit(owner, c.zone, c.index);
    }
    placeUnit(owner, result, { zone: keep.zone, index: keep.index });
    const merges = [{ defId, level: 2, zone: keep.zone, index: keep.index, uid: result.uid }];
    merges.push(...resolveMerges(owner, defId));
    return { unit: result, merges };
  }
  placeUnit(owner, unit, pos);
  const merges = resolveMerges(owner, defId);
  return { unit, merges };
}

/** Lvを直接上げる（クリプトエナジー）。上げた結果揃えば合成する */
export function levelUp(owner, zone, index) {
  const unit = owner[zone][index];
  if (!unit || unit.level >= MAX_LEVEL) return null;
  unit.level += 1;
  const merges = unit.level <= 2 ? resolveMerges(owner, unit.defId) : [];
  return { unit, merges };
}

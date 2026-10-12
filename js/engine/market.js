// マーケット（参考作 のショップ相当）。

import {
  MARKET_SLOTS,
  MATERIAL_SLOT,
  REROLL_COST,
  MAX_MARKET_RANK,
  RARITY,
  marketOdds,
  sellValue,
} from "./balance.js";
import { MATERIALS, materialById } from "./content.js";
import { acquireUnit, allUnits, canAcquire, mergePreview, removeUnit } from "./roster.js";

/** マーケットランク。ストーリーでは時代ごとの上限（rankCap）がある */
export function effectiveRank(owner) {
  const cap = Math.min(MAX_MARKET_RANK, owner.rankCap ?? MAX_MARKET_RANK);
  return Math.max(1, Math.min(cap, owner.stage + (owner.rankBonus || 0)));
}

/** そのランクで出現しうる最高レアリティ */
export function topRarity(rank) {
  const odds = marketOdds(rank);
  for (let r = 5; r >= 1; r--) if (odds[r - 1] > 0) return r;
  return 1;
}

/** そのレアリティのヒーロー。いなければ近いレアリティ（下 → 上の順）から選ぶ（ストーリーのデッキは種類が少ないため） */
export function poolByRarity(db, pool, rarity) {
  for (let r = rarity; r >= 1; r--) {
    const list = pool.filter((id) => db.def(id).rarity === r);
    if (list.length) return list;
  }
  for (let r = rarity + 1; r <= 5; r++) {
    const list = pool.filter((id) => db.def(id).rarity === r);
    if (list.length) return list;
  }
  return pool;
}

/** そのレアリティ以上で、いちばん近いレアリティのヒーロー（いなければ空） */
export function poolAtOrAbove(db, pool, rarity) {
  for (let r = rarity; r <= 5; r++) {
    const list = pool.filter((id) => db.def(id).rarity === r);
    if (list.length) return list;
  }
  return [];
}

/**
 * ヒーローの枠を1つ引く。ストーリー（チュートリアル以外）は strictRarity: ランクで決まったレアリティ
 * 以上のヒーローがデッキにいなければ、その枠は空（type: "none"）。低いレアリティだけのデッキでは
 * 難しいステージほど並ぶヒーローが減る
 */
export function rollHeroOffer(owner, db, rng) {
  const odds = marketOdds(effectiveRank(owner));
  const rarity = rng.weighted(odds.map((w, i) => [i + 1, w]).filter(([, w]) => w > 0));
  const list = owner.story?.strictRarity ? poolAtOrAbove(db, owner.heroPool, rarity) : poolByRarity(db, owner.heroPool, rarity);
  if (!list.length) return { type: "none", rarity };
  const defId = rng.pick(list);
  return { type: "hero", defId, cost: RARITY[db.def(defId).rarity].cost };
}

/** 空の枠（デッキにそのレアリティ以上のヒーローがいない）か */
export const isEmptyOffer = (offer) => offer?.type === "none";

export function rollMaterialOffer(rng) {
  const m = rng.pick(MATERIALS);
  return { type: "material", id: m.id, cost: m.cost };
}

function rollSlot(owner, db, rng, i) {
  if (i === MATERIAL_SLOT && owner.itemUses > 0) return rollMaterialOffer(rng);
  return rollHeroOffer(owner, db, rng);
}

export function rollMarket(owner, db, rng) {
  owner.market.offers = Array.from({ length: MARKET_SLOTS }, (_, i) => rollSlot(owner, db, rng, i));
}

/**
 * 取り置き（locked）した枠を残し、それ以外を入れ替える（更新・次のステージで使う）。
 * keepAll は旧仕様（ラインナップ全体の取り置き）の保存データ用。
 */
export function restockMarket(owner, db, rng, { keepAll = false } = {}) {
  const offers = owner.market.offers;
  owner.market.offers = Array.from({ length: MARKET_SLOTS }, (_, i) => {
    const o = offers[i];
    return o && (o.locked || keepAll) ? o : rollSlot(owner, db, rng, i);
  });
}

/** 入れ替えられる枠（取り置きしていない枠・売り切れの枠）があるか */
function hasRestockable(owner) {
  return owner.market.offers.length < MARKET_SLOTS || owner.market.offers.some((o) => !o || !o.locked);
}

export function rerollCost(owner) {
  return owner.freeRerolls > 0 ? 0 : REROLL_COST;
}

/** ラインナップ更新。取り置きした枠はそのまま残る */
export function reroll(owner, db, rng) {
  if (!hasRestockable(owner)) return { ok: false, error: "すべて取り置き中です" };
  if (owner.freeRerolls > 0) owner.freeRerolls -= 1;
  else if (owner.gum >= REROLL_COST) owner.gum -= REROLL_COST;
  else return { ok: false, error: "GUMが足りません" };
  restockMarket(owner, db, rng);
  return { ok: true };
}

/** 1枠ずつの取り置き（GUMが足りなくてもできる）。戻り値は取り置き後の状態、枠が空なら null */
export function toggleOfferLock(owner, index) {
  const offer = owner.market.offers[index];
  if (!offer || isEmptyOffer(offer)) return null;
  offer.locked = !offer.locked;
  return offer.locked;
}

/**
 * ラインナップから購入する。
 * 戻り値: { ok, error?, merges?, material? }
 */
export function buyOffer(owner, db, index) {
  const offer = owner.market.offers[index];
  if (!offer) return { ok: false, error: "売り切れです" };
  if (isEmptyOffer(offer)) return { ok: false, error: `デッキに${RARITY[offer.rarity].name}以上のヒーローがいません` };
  if (owner.gum < offer.cost) return { ok: false, error: "GUMが足りません" };

  if (offer.type === "hero") {
    if (!canAcquire(owner, offer.defId)) return { ok: false, error: "空き枠がありません（売却して枠を空けてください）" };
    owner.gum -= offer.cost;
    owner.market.offers[index] = null;
    const { unit, merges } = acquireUnit(owner, offer.defId);
    return { ok: true, unit, merges };
  }

  const material = materialById(offer.id);
  if (owner.itemUses <= 0) return { ok: false, error: "このステージではもうマテリアルを購入できません" };
  if (material.target && allUnits(owner).length === 0) return { ok: false, error: "対象にするヒーローがいません" };
  owner.gum -= offer.cost;
  owner.itemUses -= 1;
  owner.market.offers[index] = null;
  return { ok: true, material };
}

/**
 * いま買って使えるヒーローの枠（GUMが足り、置き場所か合成先がある）。
 * 合成できるものを優先し、なければ安いもの。無ければ -1。
 * 「GUMが残っているのにバトルへ進む」のを防ぐ案内に使う（マテリアルは数えない）。
 */
export function bestAffordableOffer(owner) {
  let best = -1;
  let bestScore = -Infinity;
  owner.market.offers.forEach((o, i) => {
    if (!o || o.type !== "hero" || o.cost > owner.gum || !canAcquire(owner, o.defId)) return;
    const score = (mergePreview(owner, o.defId) ? 100 : 0) - o.cost;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function unitSellValue(owner, db, unit, bonus = 0) {
  return sellValue(db.def(unit.defId), unit.level, bonus);
}

export function sellUnit(owner, db, zone, index, bonus = 0) {
  const unit = owner[zone][index];
  if (!unit) return { ok: false, error: "ヒーローがいません" };
  const value = unitSellValue(owner, db, unit, bonus);
  removeUnit(owner, zone, index);
  owner.gum += value;
  return { ok: true, value, unit };
}

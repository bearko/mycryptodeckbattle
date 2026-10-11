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
import { acquireUnit, allUnits, canAcquire, removeUnit } from "./roster.js";

export function effectiveRank(owner) {
  return Math.max(1, Math.min(MAX_MARKET_RANK, owner.stage + (owner.rankBonus || 0)));
}

/** そのランクで出現しうる最高レアリティ */
export function topRarity(rank) {
  const odds = marketOdds(rank);
  for (let r = 5; r >= 1; r--) if (odds[r - 1] > 0) return r;
  return 1;
}

export function poolByRarity(db, pool, rarity) {
  for (let r = rarity; r >= 1; r--) {
    const list = pool.filter((id) => db.def(id).rarity === r);
    if (list.length) return list;
  }
  return pool;
}

export function rollHeroOffer(owner, db, rng) {
  const odds = marketOdds(effectiveRank(owner));
  const rarity = rng.weighted(odds.map((w, i) => [i + 1, w]).filter(([, w]) => w > 0));
  const defId = rng.pick(poolByRarity(db, owner.heroPool, rarity));
  return { type: "hero", defId, cost: RARITY[db.def(defId).rarity].cost };
}

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

/** 取り置きしていたラインナップを引き継ぎ、売り切れた枠だけ補充する */
export function refillMarket(owner, db, rng) {
  owner.market.offers = owner.market.offers.map((o, i) => o ?? rollSlot(owner, db, rng, i));
}

export function rerollCost(owner) {
  return owner.freeRerolls > 0 ? 0 : REROLL_COST;
}

export function reroll(owner, db, rng) {
  if (owner.freeRerolls > 0) owner.freeRerolls -= 1;
  else if (owner.gum >= REROLL_COST) owner.gum -= REROLL_COST;
  else return { ok: false, error: "GUMが足りません" };
  rollMarket(owner, db, rng);
  owner.market.locked = false;
  return { ok: true };
}

export function toggleLock(owner) {
  owner.market.locked = !owner.market.locked;
  return owner.market.locked;
}

/**
 * ラインナップから購入する。
 * 戻り値: { ok, error?, merges?, material? }
 */
export function buyOffer(owner, db, index) {
  const offer = owner.market.offers[index];
  if (!offer) return { ok: false, error: "売り切れです" };
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

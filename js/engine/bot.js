// マーケットで自動的に買い物をするAI。CPU対戦相手の編成と、バランス検証用の自動プレイに使う。

import { RARITY, COPY_MULT, REROLL_COST } from "./balance.js";
import { buyOffer, reroll, sellUnit } from "./market.js";
import { allUnits, canAcquire, countCopies, findEmptySlot } from "./roster.js";

export function unitValue(db, unit) {
  return RARITY[db.def(unit.defId).rarity].cost * COPY_MULT[unit.level];
}

/** 価値の高い順にパーティへ並べ、残りを控えに回す */
export function arrangeByValue(owner, db) {
  const units = allUnits(owner)
    .map(({ unit }) => unit)
    .sort((a, b) => unitValue(db, b) - unitValue(db, a));
  owner.party = owner.party.map((_, i) => units[i] ?? null);
  owner.bench = owner.bench.map((_, i) => units[owner.party.length + i] ?? null);
}

function offerScore(owner, db, offer, rng) {
  const def = db.def(offer.defId);
  const copies = countCopies(owner, offer.defId);
  const lv1 = countCopies(owner, offer.defId, 1);
  return def.rarity * 10 + (copies ? 12 + lv1 * 8 : 0) + rng.next() * 4;
}

/**
 * 1ステージぶんの買い物をする。
 * onMerge(merge) は合成が起きるたびに呼ばれる（エクステンション報酬の処理用）。
 */
export function botShop(owner, db, rng, { maxRerolls = 2, onMerge = () => {}, sellBonus = 0 } = {}) {
  let rerolls = 0;
  let freeUsed = 0;
  for (let guard = 0; guard < 60; guard++) {
    const offers = owner.market.offers
      .map((offer, index) => ({ offer, index }))
      .filter(({ offer }) => offer && offer.type === "hero" && offer.cost <= owner.gum);

    let best = null;
    let bestScore = -Infinity;
    for (const { offer, index } of offers) {
      if (!canAcquire(owner, offer.defId)) continue;
      const score = offerScore(owner, db, offer, rng);
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
    }
    if (best !== null) {
      const result = buyOffer(owner, db, best);
      if (result.ok) for (const m of result.merges) onMerge(m);
      continue;
    }

    // 枠が満杯なら、合成の見込みがない一番安いヒーローを売って入れ替える
    if (!findEmptySlot(owner) && offers.length) {
      const weakest = allUnits(owner)
        .filter(({ unit }) => countCopies(owner, unit.defId) === 1 && unit.level === 1)
        .sort((a, b) => unitValue(db, a.unit) - unitValue(db, b.unit))[0];
      const bestOffer = offers.reduce((a, c) => (c.offer.cost > a.offer.cost ? c : a));
      if (weakest && unitValue(db, weakest.unit) < bestOffer.offer.cost) {
        sellUnit(owner, db, weakest.zone, weakest.index, sellBonus);
        continue;
      }
    }

    // 無料更新は使い切り、有料更新は maxRerolls 回まで
    const free = owner.freeRerolls > 0 && freeUsed < 6;
    if (free || (rerolls < maxRerolls && owner.gum >= REROLL_COST + 5)) {
      if (reroll(owner, db, rng).ok) {
        if (free) freeUsed += 1;
        else rerolls += 1;
        continue;
      }
    }
    break;
  }
  arrangeByValue(owner, db);
}

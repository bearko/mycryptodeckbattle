// ゲームバランスの数値はすべてここに集約する。
// 「調査で確認できた値」と「確認できなかったため独自に決めた値」を区別して書いている。

/** クエストクリアに必要な勝利数（参考作 と同じ） */
export const WINS_TO_CLEAR = 10;

/** 開始時のライフ（参考作 と同じ） */
export const START_LIVES = 10;

/** 敗北時に失うライフ。ステージ1〜2: 1、3〜4: 2、5以降: 3（参考作 と同じ） */
export function lifeLoss(stage) {
  if (stage <= 2) return 1;
  if (stage <= 4) return 2;
  return 3;
}

/** 宝箱（イベント）が出るステージ。参考作 の Day 3/6/9 前のイベントに相当 */
export const TREASURE_STAGES = [3, 6, 9];

/** パーティ6枠（3列×2段）＋控え4枠（参考作 と同じ） */
export const PARTY_SIZE = 6;
export const BENCH_SIZE = 4;
export const PARTY_COLS = 3;

/** マーケットのラインナップ数。ヒーロー4枠＋マテリアル1枠（参考作 と同じ） */
export const MARKET_SLOTS = 5;
export const MATERIAL_SLOT = 4;

/** ラインナップ更新の費用（参考作 と同じ 3） */
export const REROLL_COST = 3;

/** 1ステージにマテリアルを購入できる回数（独自: 1回） */
export const MATERIAL_USES_PER_STAGE = 1;

/**
 * ステージ開始時に得るGUM（独自）。
 * 参考作 の初期ゴールド・収入は公開情報で確認できなかったため、
 * ステージ1で10、以降2ずつ増えてステージ6以降は20で固定にしている。
 */
export function stageIncome(stage) {
  return 10 + 2 * Math.min(stage - 1, 5);
}

/**
 * マーケットランク別のレアリティ出現率（Common / Uncommon / Rare / Epic / Legendary）。
 * 参考作 のショップランク表（Super Rare → Epic に読み替え）。
 * ランクはクエスト開始時1、ステージ開始ごとに+1。
 */
export const MARKET_ODDS = [
  null,
  [100, 0, 0, 0, 0],
  [90, 10, 0, 0, 0],
  [75, 25, 0, 0, 0],
  [67, 30, 3, 0, 0],
  [55, 30, 15, 0, 0],
  [45, 32, 20, 3, 0],
  [30, 40, 25, 5, 0],
  [25, 30, 35, 10, 0],
  [20, 25, 38, 15, 2],
  [15, 20, 40, 20, 5],
  [10, 20, 35, 25, 10],
  [5, 15, 30, 35, 15],
  [1, 10, 30, 39, 20],
  [1, 2, 20, 47, 30],
];
export const MAX_MARKET_RANK = MARKET_ODDS.length - 1;

export function marketOdds(rank) {
  return MARKET_ODDS[Math.max(1, Math.min(MAX_MARKET_RANK, rank))];
}

/**
 * レアリティ別の数値（独自）。
 * cost: Lv1の購入価格（参考作 のLv1価格帯 5〜20 に合わせた）
 * budget: Lv1・1秒あたりの効果量の目安。スキル値はこれ×チャージ時間から作る
 * poolSize: 1クエストで登場するヒーローの種類数
 */
export const RARITY = [
  null,
  { key: "common", name: "Common", cost: 5, budget: 10, poolSize: 6 },
  { key: "uncommon", name: "Uncommon", cost: 8, budget: 12.5, poolSize: 6 },
  { key: "rare", name: "Rare", cost: 12, budget: 15, poolSize: 6 },
  { key: "epic", name: "Epic", cost: 16, budget: 18, poolSize: 5 },
  { key: "legendary", name: "Legendary", cost: 20, budget: 22, poolSize: 4 },
];

/** Lvごとの効果倍率（参考作 のパッチノート例: 50/100/150 と同じ比率） */
export const LEVEL_MULT = [0, 1, 2, 3, 4];

/** Lvごとの「コピー数」。売却額の計算に使う（参考作 の 1/3/6/12） */
export const COPY_MULT = [0, 1, 3, 6, 12];

export const MAX_LEVEL = 4;
export const MAX_MERGE_LEVEL = 3;

/** チャージ時間（独自）。AGIが高いヒーローほど短い。3.0〜7.5秒、0.5秒刻み */
export function baseCooldown(def) {
  const raw = 7.5 - 4.5 * def.agi_pct;
  return Math.min(7.5, Math.max(3, Math.round(raw * 2) / 2));
}

/** 「バトル開始時」のスキルは1回きりなので、チャージ時間の代わりにこの秒数ぶんの予算を使う */
export const START_TRIGGER_SECONDS = 8;

/** スキル種別ごとの換算（独自）。予算 = budget × 秒数 × 配分 × Lv倍率 */
export function kindValue(kind, budgetSeconds) {
  const x = budgetSeconds;
  switch (kind) {
    case "damage":
      return Math.max(1, Math.round(x));
    case "shield":
      return Math.max(1, Math.round(x * 1.25));
    case "heal":
      return Math.max(1, Math.round(x * 1.1));
    case "bleed":
      // 出血Sスタックの総ダメージは S(S+1)/2。総量が予算の約9割になるようにする
      return Math.max(1, Math.round(Math.sqrt(1.8 * x)));
    case "poison":
      return Math.max(1, Math.round(x / 12));
    case "haste":
      return Math.min(4, Math.max(0.2, Math.round((x / 25) * 10) / 10));
    case "slow":
      return Math.min(4, Math.max(0.2, Math.round((x / 25) * 10) / 10));
    case "buff":
      return Math.max(1, Math.round(x / 3.5));
    case "weaken":
      return Math.max(1, Math.round(x / 3));
    default:
      return 0;
  }
}

/** 出血・毒の作用間隔（参考作 と同じ: 出血0.5秒、毒1秒） */
export const BLEED_INTERVAL = 0.5;
export const POISON_INTERVAL = 1;

/** 出血・毒ダメージがシールドに当たったときの軽減率（参考作 と同じ 15%） */
export const STATUS_VS_SHIELD = 0.85;

/** サドンデス開始秒（参考作 と同じ 30秒）。ダメージ量は独自 */
export const SUDDEN_DEATH_AT = 30;
export const SUDDEN_DEATH_INTERVAL = 0.5;
export const SUDDEN_DEATH_STEP = 10;

/** 1ティックの秒数 */
export const TICK = 0.1;

/** 弱体化で下がる効果量の下限 */
export const MIN_RUNTIME_MULT = 0.25;

/** パーティHP（独自）。参考作 の共有HPの値は確認できなかった */
export function baseMaxHp(stage) {
  return 200 + 50 * (stage - 1);
}

/** ヒーロー1体が共有HPに加える量（独自）。MCHのHPステータスの順位から決める */
export function unitHp(def, level) {
  const base = Math.round((12 + 28 * def.hp_pct) * (0.8 + 0.1 * def.rarity));
  return base * LEVEL_MULT[level];
}

/** 売却額: ceil(価格 × コピー数 / 2) ＋ボーナス */
export function sellValue(def, level, bonus = 0) {
  return Math.ceil((RARITY[def.rarity].cost * COPY_MULT[level]) / 2) + bonus;
}

/**
 * ストーリーの難しさ d による補正（独自）。d = ノードの時代の基本値 ＋ ステージ番号（story.js の stageDifficulty）。
 * ノードの中はチームを繰り越すので、ステージ数（ウェーブの合計）が進むほどプレイヤーもエネミーも育つ。
 * 盤面が埋まると収入だけでは強くならないので、後半のステージほどエネミーの効果量とHPを上げる。
 * playerRank / playerIncome(Base): プレイヤーのマーケットランクと毎ウェーブの収入への上乗せ（d × 係数 ＋ 定数）
 * cpuRank / cpuIncome(Base): エネミー部隊のマーケットランクと収入への上乗せ（d × 係数 ＋ 定数）
 * cpuPower / cpuHp: エネミー部隊の効果量とパーティHPの上乗せ（d × 係数 %）
 * チュートリアルのノードは handicap でエネミーの収入をさらに減らす
 */
export const STORY_BALANCE = {
  playerRank: 0.5,
  playerIncome: 0,
  playerIncomeBase: 2,
  cpuRank: 0.5,
  cpuIncome: 1,
  cpuIncomeBase: -2,
  cpuPower: 6,
  cpuHp: 6,
  // 強敵（枝分かれのステージ）の効果量・HP の上乗せ（%）
  elitePower: 30,
  eliteHp: 30,
};

export function storyPlayerBonus(story) {
  const d = story?.difficulty ?? 0;
  return {
    rank: Math.floor(d * STORY_BALANCE.playerRank),
    income: Math.floor(d * STORY_BALANCE.playerIncome + STORY_BALANCE.playerIncomeBase),
  };
}

export function storyCpuBonus(story) {
  const d = story.difficulty;
  return {
    rank: Math.floor(d * STORY_BALANCE.cpuRank),
    income: Math.floor(d * STORY_BALANCE.cpuIncome) + STORY_BALANCE.cpuIncomeBase - (story.handicap ?? 0),
    power: Math.round(d * STORY_BALANCE.cpuPower) + (story.elite ? STORY_BALANCE.elitePower : 0),
    hp: Math.round(d * STORY_BALANCE.cpuHp) + (story.elite ? STORY_BALANCE.eliteHp : 0),
  };
}

// 手書きのゲームコンテンツ（プレイヤー、マテリアル、宝箱、表示用ラベル）。

export const FACTIONS = {
  0: { name: "エネミー", color: "#8a8f9c" },
  1: { name: "朱雀", color: "#e0523f" },
  2: { name: "青龍", color: "#3f8fe0" },
  3: { name: "玄武", color: "#4a4f6b" },
  4: { name: "黄竜", color: "#d9a520" },
  5: { name: "白虎", color: "#c9ccd6" },
};

export const COLUMN_NAMES = ["前衛", "中衛", "後衛"];

export const KIND_LABELS = {
  damage: "ダメージ",
  shield: "シールド",
  heal: "回復",
  bleed: "出血",
  poison: "毒",
  haste: "チャージアップ",
  slow: "チャージダウン",
  buff: "効果量アップ",
  weaken: "効果量ダウン",
};

export const KIND_ICONS = {
  damage: "assets/battle-icons/phy.png",
  shield: "assets/battle-icons/decoy.png",
  heal: "assets/battle-icons/hp.png",
  bleed: "assets/battle-icons/bleed.png",
  poison: "assets/battle-icons/poison.png",
  haste: "assets/battle-icons/buf_agi.png",
  slow: "assets/battle-icons/dbf_agi.png",
  buff: "assets/battle-icons/buf_phy.png",
  weaken: "assets/battle-icons/dbf_phy.png",
};

/**
 * プレイヤー（参考作 のトレーナー相当）。
 * 能力は 参考作 のトレーナー能力の系統（リロール系 / ショップランク系 / 勝利時成長系）を参考にした独自設計。
 */
export const PLAYERS = [
  {
    id: "chris",
    name: "クリスくん",
    nameEn: "Chris",
    skillName: "ガッツ",
    text: "毎ステージ、マーケットの無料更新を3回得る。",
    effect: { freeRerolls: 3 },
    images: {
      idle: "assets/characters/chris_loop.gif",
      win: "assets/characters/chris_cheer.png",
      lose: "assets/characters/chris_cry_loop.gif",
      select: "assets/characters/chris_guts.png",
    },
    credit: "ドット絵：こじもこ",
  },
  {
    id: "mine",
    name: "マインちゃん",
    nameEn: "Mine",
    skillName: "ナビゲート",
    text: "マーケットランク+2の状態でクエストを開始する（高レアリティのヒーローが早く出現する）。",
    effect: { rankBonus: 2 },
    images: {
      idle: "assets/characters/navi_ain_loop.gif",
      win: "assets/characters/navi_ain_cheer.png",
      lose: "assets/characters/navi_ain_sad.png",
      select: "assets/characters/navi_ain_greeting_loop.gif",
    },
    credit: "ドット絵：こじもこ",
  },
  {
    id: "mai",
    name: "MAI",
    nameEn: "MAI",
    skillName: "推し活",
    text: "バトルに勝利するたび、パーティのランダムなヒーロー1体のスキル効果量が永続で+8%。",
    effect: { winBuff: 8 },
    images: {
      idle: "assets/characters/mai_sd.png",
      win: "assets/characters/mai_sd.png",
      lose: "assets/characters/mai_sd.png",
      select: "assets/characters/mai_sd.png",
    },
    pixelated: false,
    credit: "",
  },
];

export function playerById(id) {
  return PLAYERS.find((p) => p.id === id);
}

/**
 * マテリアル（参考作 のアイテム相当）。購入した瞬間に効果を発揮する。
 * 画像は MCH の魔石素材。
 */
export const MATERIALS = [
  {
    id: "ifrit",
    name: "イフリートの魔石",
    image: "assets/materials/ifrit.webp",
    cost: 6,
    target: true,
    text: "ヒーロー1体のスキル効果量を永続+20%",
  },
  {
    id: "leviathan",
    name: "リヴァイアサンの魔石",
    image: "assets/materials/leviathan.webp",
    cost: 6,
    target: true,
    text: "ヒーロー1体のチャージ時間を永続-10%",
  },
  {
    id: "tiamat",
    name: "ティアマトの魔石",
    image: "assets/materials/tiamat.webp",
    cost: 5,
    target: false,
    text: "パーティの最大HPを永続+40",
  },
  {
    id: "garuda",
    name: "ガルーダの魔石",
    image: "assets/materials/garuda.webp",
    cost: 8,
    target: false,
    text: "マーケットランクを永続+1",
  },
];

export function materialById(id) {
  return MATERIALS.find((m) => m.id === id);
}

/** クリプトエナジー（MCHの経験値）。宝箱から得る、ヒーローのLvを1上げるマテリアル */
export const CRYPTO_ENERGY = {
  id: "ce",
  name: "クリプトエナジー",
  image: "assets/icons/ce.png",
  cost: 0,
  target: true,
  text: "ヒーロー1体のLvを+1（最大Lv4）",
};

/** 宝箱（参考作 のイベント相当）で選べる報酬 */
export const TREASURES = [
  { id: "gum", weight: 3, image: "assets/icons/gum.png", name: "GUM", text: (stage) => `GUM +${treasureGum(stage)}` },
  {
    id: "hero",
    weight: 3,
    image: "assets/icons/mch_icon.png",
    name: "ヒーロー獲得",
    text: () => "いまのランクで出る最高レアリティのヒーローを1体獲得",
  },
  {
    id: "extension",
    weight: 3,
    image: "assets/icons/emblem.webp",
    name: "エクステンション",
    text: () => "エクステンションを3つから選んで獲得",
  },
  { id: "ce", weight: 2, image: "assets/icons/ce.png", name: "クリプトエナジー", text: () => "ヒーロー1体のLvを+1（最大Lv4）" },
  { id: "reroll", weight: 2, image: "assets/icons/cp.png", name: "無料更新", text: () => "マーケットの無料更新+3回" },
  { id: "maxhp", weight: 2, image: "assets/battle-icons/hp.png", name: "最大HPアップ", text: () => "パーティの最大HPを永続+60" },
  {
    id: "life",
    weight: 1,
    image: "assets/battle-icons/resurrection.png",
    name: "ライフ回復",
    text: () => "ライフ+2（最大10）",
  },
];

export function treasureGum(stage) {
  return 8 + stage;
}

export function treasureById(id) {
  return TREASURES.find((t) => t.id === id);
}

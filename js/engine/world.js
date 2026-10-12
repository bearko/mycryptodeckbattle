// ストーリーの世界: 時代・地域・ノード（時代×地域）・ステージと、どこでどのヒーローが仲間になるか。
// 仕様は docs/story.md。数値や並びを変えるときはここだけ直せばよい。
// ヒーローは MCH の ID（data/heroes.json の mch_id）、レイドボスは data/bosses.json の ID で書く。
// コード上はノードを area と呼ぶ（AREAS / areaId など）。
// ノードの中の道は 参考作 のように後半が枝分かれする（buildNodeMap）。

import { createRng } from "./rng.js";

/**
 * 時代（古いほど後で開く）。rankCap: その時代のマーケットランクの上限（プレイヤーもエネミーも）。
 * ノードの中ではチームを繰り越してウェーブを重ねるので、ランクはすぐ上がる。時代ごとに上限を決めて、
 * 古い時代ほど高いレアリティが並ぶようにする
 */
export const ERAS = [
  { id: "kindai", name: "近代", en: "MODERN", years: "19〜20世紀", rankCap: 8 },
  { id: "kinsei", name: "近世", en: "EARLY MODERN", years: "15〜18世紀", rankCap: 10 },
  { id: "chusei", name: "中世", en: "MEDIEVAL", years: "5〜15世紀", rankCap: 12 },
  { id: "kodai", name: "古代", en: "ANCIENT", years: "紀元前〜3世紀", rankCap: 14 },
  { id: "hazama", name: "時空のはざま", en: "RIFT", years: "????", rankCap: 14 },
];

/**
 * タイムマシン（エクステンション「合体ロボ」シリーズ）。next は次のレベルまでに必要なパーツ数。
 * パーツはノードを初めてクリアする（最終ステージのレイドボスを倒す）と1つ手に入る。
 * 2+3+3+4 = 12 で、時空のはざま以外の12ノードをすべてクリアすると Legendary になる。
 */
export const MACHINES = [
  { level: 1, rarity: 1, name: "魔導機械エメ・ラ・ルド・テレスター(破)", short: "エメ・ラ・ルド・テレスター", image: "assets/story/machine-1.png", next: 2 },
  { level: 2, rarity: 2, name: "魔導海底探索機ジャンヌ・ザ・オメガ", short: "ジャンヌ・ザ・オメガ", image: "assets/story/machine-2.png", next: 3 },
  { level: 3, rarity: 3, name: "魔導戦車ジュウ・ザ・トロール", short: "ジュウ・ザ・トロール", image: "assets/story/machine-3.png", next: 3 },
  { level: 4, rarity: 4, name: "魔導兵器バ・ビ・ディ・オン・ファティオス", short: "バ・ビ・ディ・オン・ファティオス", image: "assets/story/machine-4.png", next: 4 },
  { level: 5, rarity: 5, name: "古代魔導ロボット・ディア・ガ・レティウス", short: "ディア・ガ・レティウス", image: "assets/story/machine-5.png", next: null },
];

export const MAX_MACHINE_LEVEL = MACHINES.length;

/** 最初から仲間（MCHウォーリアー・タクティシャン・アーティスト） */
export const STARTER_HEROES = [10001, 10002, 10003];

export const DECK_SIZE = 8;
export const STAGE_LIVES = 3;
/** 近代・日本（チュートリアル）の 1-1, 1-2, 1-3 のウェーブ数 */
export const TUTORIAL_WAVES = [3, 4, 5];

/**
 * ステージのウェーブ数。チュートリアルのノードは 3/4/5、
 * ほかの10ステージのノードは X-1〜3 が3、X-4〜7 が4、X-8〜10 が5。
 * 最終ステージは最後のウェーブがレイドボス。
 */
export function stageWaves(area, index) {
  if (area.id === TUTORIAL_AREA) return TUTORIAL_WAVES[index];
  return index < 3 ? 3 : index < 7 ? 4 : 5;
}

/** そのステージより前のウェーブ数の合計（ノードの中でチームを繰り越すので、ランクや敵の強さの目安になる） */
export function wavesBefore(area, index) {
  let n = 0;
  for (let i = 0; i < index; i++) n += stageWaves(area, i);
  return n;
}

/** ノードの最終ステージか（レイドボスが待つ・クリアでパーツ） */
export const isFinalStage = (area, index) => index === area.stages.length - 1;

/**
 * ノード（時代×地域）。
 * machine: 行くのに必要なタイムマシンのレベル / after: 先にクリアが必要なノード（国 → 時代の順に開く）
 * map: ワールドマップ上の位置（地図の横・縦に対する%）/ boss: 最終ステージのレイドボス
 * stages[i].meet: そのステージで出会うヒーロー（いないステージもある）/ join: クリアで仲間になるヒーロー（meet を含む）
 * difficulty: エネミーの強さの上乗せの基本値。これにステージ番号を足した値で、後半のステージほど強くなる
 *   （story.js の stageDifficulty）。時代の差はマーケットランクの上限（ERAS の rankCap）で付けるので、いまはどれも0
 */
export const AREAS = [
  {
    id: "kindai-jp",
    no: 1,
    era: "kindai",
    region: "日本",
    machine: 1,
    map: { x: 88, y: 34 },
    bg: "1023",
    color: "#ff5a6a",
    rankCap: 6, // チュートリアルは低めに
    difficulty: 0,
    boss: "b171",
    stages: [
      { meet: 10004, join: [2036, 2021], meetAtStart: true }, // 1 福沢諭吉・樋口一葉・高杉晋作
      { meet: 4056, join: [4056, 2014, 3045] }, // 2 夏目漱石・徳川慶喜・斎藤一
      { meet: 5008, join: [5008, 4005, 4012, 4027, 4035, 4039] }, // 3 坂本龍馬・勝海舟・沖田総司・土方歳三・近藤勇・西郷隆盛
    ],
  },
  {
    id: "kindai-eu",
    no: 2,
    era: "kindai",
    region: "ヨーロッパ",
    machine: 1,
    after: "kindai-jp",
    map: { x: 50, y: 20 },
    bg: "1004",
    color: "#5fa8ff",
    difficulty: 0,
    boss: "b172",
    stages: [
      { meet: 1001, join: [1001] }, // 1 コナン・ドイル
      { meet: 2003, join: [2003, 1004, 2004, 2005] }, // 2 ジャックザリッパー・シートン・シューベルト・グリム兄弟
      { meet: 2008, join: [2008, 2010, 2016] }, // 3 シュレディンガー・カフカ・アナスタシア
      { meet: 2022, join: [2022, 2031, 2033, 2039] }, // 4 アンデルセン・ビスマルク・ゲーテ・ドストエフスキー
      { meet: 4002, join: [4002] }, // 5 ナイチンゲール
      { meet: 3004, join: [3004, 2048, 2049] }, // 6 マタ・ハリ・ルノワール・ショパン
      { meet: 4011, join: [4011, 3028, 4013, 4017] }, // 7 マルクス・モネ・チャイコフスキー・キュリー夫人
      { meet: 4021, join: [4021, 4028, 4041] }, // 8 ゴッホ・ダーウィン・ニコラ・テスラ
      { meet: 5010, join: [5010, 4044, 4046] }, // 9 アインシュタイン・ファーブル・ラスプーチン
      { meet: 5002, join: [5002] }, // 10 ナポレオン・ボナパルト
    ],
  },
  {
    id: "kindai-us",
    no: 3,
    era: "kindai",
    region: "アメリカ",
    machine: 1,
    after: "kindai-jp",
    map: { x: 20, y: 30 },
    bg: "1046",
    color: "#ffb347",
    difficulty: 0,
    boss: "b370",
    stages: [
      { meet: 1008, join: [1008] }, // 1 ジョン・L・サリバン
      { meet: 2001, join: [2001] }, // 2 ライト兄弟
      { meet: 2017, join: [2017] }, // 3 ジェロニモ
      { meet: 2032, join: [2032] }, // 4 モンゴメリ
      { meet: 4007, join: [4007] }, // 5 トーマス・エジソン
      { meet: 3031, join: [3031] }, // 6 ワイアット・アープ
      { meet: 3036, join: [3036] }, // 7 ベル・スター
      { meet: 4006, join: [4006] }, // 8 ビリー・ザ・キッド
      { meet: 4020, join: [4020] }, // 9 カラミティ・ジェーン
      { meet: 4033, join: [4033] }, // 10 エイブラハム・リンカーン
    ],
  },
  {
    id: "kinsei-jp",
    no: 4,
    era: "kinsei",
    region: "日本",
    machine: 2,
    map: { x: 88, y: 34 },
    bg: "1002",
    color: "#ff5a6a",
    difficulty: 0,
    boss: "b371",
    stages: [
      { meet: 10008, join: [10008] }, // 1 雷電為右衛門
      { meet: 2009, join: [2009, 1002, 1005, 2012] }, // 2 森蘭丸・甲斐姫・伊能忠敬・石田三成
      { meet: 2018, join: [2018, 2020, 2026, 2030] }, // 3 茶々・明智光秀・豊臣秀吉・出雲阿国
      { meet: 3003, join: [3003, 2043, 3010] }, // 4 平賀源内・霧隠才蔵・服部半蔵
      { meet: 4025, join: [4025] }, // 5 武田信玄
      { meet: 3011, join: [3011, 3012, 3013, 3014] }, // 6 前田 慶次・天草四郎・石川五右衛門・直江兼続
      { meet: 3016, join: [3016, 3025, 3038] }, // 7 松尾芭蕉・真田幸村・猿飛佐助
      { meet: 4004, join: [4004, 3044, 4009, 4032] }, // 8 佐々木小次郎・徳川家康・伊達政宗・上杉謙信
      { meet: 5024, join: [5024, 4055, 5032] }, // 9 葛飾北斎・本多忠勝・宮本武蔵
      { meet: 5001, join: [5001] }, // 10 織田信長
    ],
  },
  {
    id: "kinsei-eu",
    no: 5,
    era: "kinsei",
    region: "ヨーロッパ",
    machine: 2,
    after: "kinsei-jp",
    map: { x: 50, y: 20 },
    bg: "1052",
    color: "#5fa8ff",
    difficulty: 0,
    boss: "b372",
    stages: [
      { meet: 10006, join: [10006] }, // 1 パスカル
      { meet: 2015, join: [2015, 2023] }, // 2 モンテスキュー・ミケランジェロ
      { meet: 3002, join: [3002, 3008] }, // 3 ダルタニャン・ノストラダムス
      { meet: 3015, join: [3015, 3024] }, // 4 イワン雷帝・ルーベンス
      { meet: 3030, join: [3030] }, // 5 シェイクスピア
      { meet: 3041, join: [3041, 3043] }, // 6 ラファエロ・ニュートン
      { meet: 4003, join: [4003, 3046] }, // 7 ベートーヴェン・マリア・テレジア
      { meet: 4014, join: [4014, 4030] }, // 8 マリー・アントワネット・モーツァルト
      { meet: 5012, join: [5012, 5027] }, // 9 バッハ・ガリレオ・ガリレイ
      { meet: 5005, join: [5005] }, // 10 レオナルド・ダ・ビンチ
    ],
  },
  {
    id: "kinsei-sea",
    no: 6,
    era: "kinsei",
    region: "新大陸と海",
    machine: 2,
    after: "kinsei-jp",
    map: { x: 31, y: 46 },
    bg: "1030",
    color: "#36d6c3",
    difficulty: 0,
    boss: "b374",
    stages: [
      { meet: 2042, join: [2042] }, // 1 ヴァスコ・ダ・ガマ
      { meet: 3022, join: [3022, 2041] }, // 2 ポカホンタス・ベンジャミン・フランクリン
      { meet: 3029, join: [3029] }, // 3 メアリ・リード
      { meet: 3032, join: [3032] }, // 4 アン・ボニー
      { meet: 4036, join: [4036] }, // 5 黒髭
      { meet: 3037, join: [3037] }, // 6 マゼラン
      { meet: 3042, join: [3042] }, // 7 コロンブス
      { meet: 4019, join: [4019] }, // 8 カメハメハ大王
      { meet: 4052, join: [4052] }, // 9 フランシス・ドレーク
      { meet: 5004, join: [5004] }, // 10 ジョージ・ワシントン
    ],
  },
  {
    id: "chusei-jp",
    no: 7,
    era: "chusei",
    region: "日本",
    machine: 3,
    map: { x: 88, y: 34 },
    bg: "1003",
    color: "#ff5a6a",
    difficulty: 0,
    boss: "b420",
    stages: [
      { meet: 2019, join: [2019] }, // 1 金太郎
      { meet: 2029, join: [2029, 2038] }, // 2 一休・平清盛
      { meet: 2046, join: [2046] }, // 3 北条政子
      { meet: 3018, join: [3018, 3035] }, // 4 武蔵坊弁慶・小野小町
      { meet: 4022, join: [4022] }, // 5 巴御前
      { meet: 3051, join: [3051] }, // 6 源頼朝
      { meet: 4031, join: [4031, 4054] }, // 7 平将門・菅原道真
      { meet: 5021, join: [5021] }, // 8 安倍晴明
      { meet: 5028, join: [5028] }, // 9 那須与一
      { meet: 5019, join: [5019] }, // 10 源義経
    ],
  },
  {
    id: "chusei-eu",
    no: 8,
    era: "chusei",
    region: "ヨーロッパ",
    machine: 3,
    after: "chusei-jp",
    map: { x: 50, y: 20 },
    bg: "1056",
    color: "#5fa8ff",
    difficulty: 0,
    boss: "b1007",
    stages: [
      { meet: 3026, join: [3026] }, // 1 ロビンフッド
      { meet: 3034, join: [3034, 3047] }, // 2 パーシヴァル・アッティラ
      { meet: 4038, join: [4038] }, // 3 ブリュンヒルド
      { meet: 4053, join: [4053] }, // 4 ウィリアム・テル
      { meet: 4045, join: [4045] }, // 5 ランスロット
      { meet: 5007, join: [5007] }, // 6 ジャンヌ・ダルク
      { meet: 5014, join: [5014] }, // 7 カール大帝
      { meet: 5023, join: [5023] }, // 8 リチャード1世
      { meet: 5029, join: [5029] }, // 9 エドワード黒太子
      { meet: 5006, join: [5006] }, // 10 アーサー王
    ],
  },
  {
    id: "chusei-asia",
    no: 9,
    era: "chusei",
    region: "アジア",
    machine: 3,
    after: "chusei-jp",
    map: { x: 72, y: 34 },
    bg: "1010",
    color: "#ffd23f",
    difficulty: 0,
    boss: "b1182",
    stages: [
      { meet: 1007, join: [1007] }, // 1 大長今
      { meet: 2040, join: [2040] }, // 2 花木蘭
      { meet: 2045, join: [2045] }, // 3 達磨
      { meet: 4008, join: [4008] }, // 4 マルコ・ポーロ
      { meet: 3017, join: [3017] }, // 5 三蔵法師
      { meet: 4015, join: [4015] }, // 6 楊貴妃
      { meet: 4024, join: [4024] }, // 7 岳飛
      { meet: 5030, join: [5030] }, // 8 武則天
      { join: [] }, // 9
      { meet: 5013, join: [5013] }, // 10 チンギス・ハン
    ],
  },
  {
    id: "kodai-sangoku",
    no: 10,
    era: "kodai",
    region: "三国志",
    machine: 4,
    map: { x: 76, y: 41 },
    bg: "1037",
    color: "#ffd23f",
    difficulty: 0,
    boss: "b1183",
    stages: [
      { meet: 10005, join: [10005] }, // 1 孫尚香
      { meet: 2013, join: [2013, 1003, 2037] }, // 2 許褚・張遼・孫策
      { meet: 3019, join: [3019, 3020] }, // 3 黄忠・貂蝉
      { meet: 3023, join: [3023, 3048, 3049] }, // 4 孫堅・馬超・董卓
      { meet: 4037, join: [4037] }, // 5 関羽
      { meet: 4001, join: [4001, 4016] }, // 6 張飛・呂布
      { meet: 4018, join: [4018, 4023, 4048] }, // 7 孫権・趙雲・周瑜
      { meet: 4049, join: [4049, 4050] }, // 8 夏侯惇・司馬懿仲達
      { meet: 5003, join: [5003, 5015] }, // 9 曹操・諸葛亮
      { meet: 5009, join: [5009] }, // 10 劉備
    ],
  },
  {
    id: "kodai-east",
    no: 11,
    era: "kodai",
    region: "東アジア",
    machine: 4,
    after: "kodai-sangoku",
    map: { x: 82, y: 28 },
    bg: "1053",
    color: "#ff8ad8",
    difficulty: 0,
    boss: "b1184",
    stages: [
      { meet: 2011, join: [2011] }, // 1 孫子
      { meet: 3009, join: [3009, 2028] }, // 2 太公望・チュン姉妹
      { meet: 3027, join: [3027] }, // 3 楊端和
      { meet: 4010, join: [4010, 4029] }, // 4 王キ・ヤマトタケル
      { meet: 4040, join: [4040] }, // 5 韓信
      { meet: 4051, join: [4051] }, // 6 ラーマ
      { meet: 5011, join: [5011, 5022] }, // 7 卑弥呼・虞美人
      { meet: 5025, join: [5025] }, // 8 項羽
      { meet: 5026, join: [5026] }, // 9 劉邦
      { meet: 5018, join: [5018] }, // 10 始皇帝
    ],
  },
  {
    id: "kodai-med",
    no: 12,
    era: "kodai",
    region: "地中海",
    machine: 4,
    after: "kodai-sangoku",
    map: { x: 53, y: 33 },
    bg: "1041",
    color: "#e8c46a",
    difficulty: 0,
    boss: "b1186",
    stages: [
      { meet: 10007, join: [10007] }, // 1 ダビデ
      { meet: 2002, join: [2002, 1006, 2006] }, // 2 スパルタクス・ピタゴラス・アルキメデス
      { meet: 2024, join: [2024, 2027] }, // 3 サロメ・イソップ
      { meet: 2034, join: [2034, 2044, 2047] }, // 4 プラトン・ソクラテス・アリストテレス
      { meet: 4026, join: [4026] }, // 5 カエサル
      { meet: 3007, join: [3007, 3021] }, // 6 皇帝ネロ・ヴァレンティヌス
      { meet: 4047, join: [4047, 3040, 3050] }, // 7 ハンニバル・ギルガメッシュ・メイヴ
      { meet: 5017, join: [5017, 4057] }, // 8 アレキサンダー・ブーディカ
      { meet: 5020, join: [5020, 5031] }, // 9 ツタンカーメン・スキピオ・アフリカヌス
      { meet: 5016, join: [5016] }, // 10 クレオパトラ
    ],
  },
  {
    id: "hazama",
    no: 13,
    era: "hazama",
    region: "時空のはざま",
    machine: 5,
    requiresAll: true,
    map: { x: 50, y: 88 },
    bg: "2605",
    color: "#b46cff",
    difficulty: 0,
    boss: "b1187",
    stages: [
      { meet: 2007, join: [2007] }, // 1 サンタクロース
      { meet: 3005, join: [3005] }, // 2 ETHEREMON-BLUE
      { meet: 3006, join: [3006] }, // 3 ETHEREMON-GREEN
      { join: [] }, // 4
      { meet: 3001, join: [3001] }, // 5 ETHEREMON-RED
      { meet: 3039, join: [3039] }, // 6 ラクシュミー・バーイ
      { join: [] }, // 7
      { meet: 2025, join: [2025] }, // 8 サトシ・ナカモト ALPHA CC
      { join: [] }, // 9
      { meet: 4034, join: [4034] }, // 10 サトシ・ナカモト OMEGA CC
    ],
  },
];

export const TUTORIAL_AREA = "kindai-jp";

export const heroId = (mchId) => `h${mchId}`;
export const areaById = (id) => AREAS.find((a) => a.id === id);
export const eraById = (id) => ERAS.find((e) => e.id === id);
/** ノードのマーケットランクの上限 */
export const areaRankCap = (area) => area.rankCap ?? eraById(area.era).rankCap;
export const machineByLevel = (level) => MACHINES[Math.max(1, Math.min(MAX_MACHINE_LEVEL, level)) - 1];

// ---------------------------------------------------------------------------
// ノードの道（参考作 のような枝分かれ）
// ---------------------------------------------------------------------------

/** 枝分かれする行（X-5〜X-9。0から数える）。前半は1本道、最後（X-10）はレイドボスで合流 */
export const BRANCH_FIRST = 4;
export const BRANCH_LAST = 8;
export const LANES = 3;
export const LANE_LETTERS = ["A", "B", "C"];

/** ステージの種類 */
export const STAGE_KINDS = {
  battle: { name: "戦闘", text: "エネミーの部隊と戦う" },
  elite: { name: "強敵", text: "エネミーの効果量・HP +30%。クリアすると次のステージの最初に宝箱", power: 30, hp: 30 },
  supply: { name: "補給", text: "バトルなし。宝箱を1つ選び、マーケットで買い物をして出発" },
  boss: { name: "レイドボス", text: "最後のウェーブでレイドボスと戦う" },
};

/**
 * 地形（そのステージのバトルで効く）。kinds: 得をするスキルの種類 / faction: 得をする勢力（プレイヤーだけ。エネミーは勢力なし）
 * mods は units.js の collectMods と同じ形で足す
 */
export const FIELDS = {
  poison: { name: "毒の沼", text: "毒の効果量 +50%（両陣営）", kinds: ["poison"], mods: { kindMult: { poison: 50 } } },
  bleed: { name: "血の荒野", text: "出血の効果量 +50%（両陣営）", kinds: ["bleed"], mods: { kindMult: { bleed: 50 } } },
  spring: { name: "癒やしの泉", text: "回復・シールド +50%（両陣営）", kinds: ["heal", "shield"], mods: { kindMult: { heal: 50, shield: 50 } } },
  duel: { name: "決戦の地", text: "ダメージ +30%（両陣営）", kinds: ["damage"], mods: { kindMult: { damage: 30 } } },
  tactics: {
    name: "軍師の陣",
    text: "効果量アップ・チャージ操作・弱体化 +50%（両陣営）",
    kinds: ["buff", "haste", "slow", "weaken"],
    mods: { kindMult: { buff: 50, haste: 50, slow: 50, weaken: 50 } },
  },
  front: { name: "最前線", text: "前衛の効果量 +40%（両陣営）", col: 0, mods: { colMult: [40, 0, 0] } },
  back: { name: "見晴らしの丘", text: "後衛の効果量 +40%（両陣営）", col: 2, mods: { colMult: [0, 0, 40] } },
};

/** 勢力の地（その勢力のヒーローの効果量 +40%。エネミーには勢力がないのでプレイヤーだけ得をする） */
const FACTION_NAMES = { 1: "朱雀", 2: "青龍", 3: "玄武", 4: "黄竜", 5: "白虎" };
for (const [f, name] of Object.entries(FACTION_NAMES)) {
  FIELDS[`faction${f}`] = { name: `${name}の地`, text: `${name}のヒーローの効果量 +40%`, faction: Number(f), mods: { factionMult: { [f]: 40 } } };
}

/** エネミーの傾向（そのステージに出るエネミーの顔ぶれ）。counter: 相性のよいスキルの種類 */
export const FOES = {
  mixed: { name: "混成部隊", text: "いろいろなエネミー", kinds: null, counter: [] },
  venom: { name: "毒使いの群れ", text: "毒を使うエネミーが多い", kinds: ["poison"], counter: ["heal", "shield"] },
  blade: { name: "切り裂き部隊", text: "出血を使うエネミーが多い", kinds: ["bleed"], counter: ["heal", "shield"] },
  wall: { name: "鉄壁の部隊", text: "シールド・回復を使うエネミーが多い", kinds: ["shield", "heal"], counter: ["damage", "weaken"] },
  assault: { name: "猛攻部隊", text: "ダメージの大きいエネミーが多い", kinds: ["damage"], counter: ["shield", "heal", "weaken"] },
};

function hashString(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * ノードの道を作る（ノードIDから決まるので毎回同じ）。
 * 前半（X-1〜X-4）と最後（X-10）は1本道。X-5〜X-9 は3つのレーンに分かれ、隣のレーンへ渡る道もある。
 * その行のヒーロー（area.stages の join）をレーンに分け、レーンごとに種類（戦闘・強敵・補給）・地形・エネミーの傾向を決める。
 * 戻り値: { rows: [[ステージ]], next: [[次の行のステージの番号]] }（next[r][i] は r 行の i 番目から行ける r+1 行の番号）
 */
export function buildNodeMap(area) {
  const count = area.stages.length;
  const branching = area.id !== TUTORIAL_AREA && count > BRANCH_LAST + 1;
  const rng = createRng(hashString(`${area.id}:map`));
  const rows = [];
  for (let r = 0; r < count; r++) {
    const src = area.stages[r];
    if (!branching || r < BRANCH_FIRST || r > BRANCH_LAST) {
      const kind = r === count - 1 ? "boss" : "battle";
      rows.push([{ row: r, lane: null, kind, meet: src.meet ?? null, join: [...src.join], meetAtStart: Boolean(src.meetAtStart), field: null, foe: null }]);
      continue;
    }
    const kinds = ["battle", "battle", "battle"];
    const sides = rng.shuffle([0, 2]);
    if (rng.next() < 0.45) kinds[sides[0]] = "elite";
    if (rng.next() < (r === BRANCH_LAST ? 0.7 : 0.3)) kinds[sides[1]] = "supply";
    // ヒーローは真ん中 → 左 → 右の順に配る（補給には配らない）。最初のヒーローがそのレーンで出会うヒーロー
    const order = [1, 0, 2].filter((l) => kinds[l] !== "supply");
    const heroes = [[], [], []];
    src.join.forEach((id, i) => heroes[order[i % order.length]].push(id));
    rows.push(
      kinds.map((kind, lane) => ({ row: r, lane, kind, meet: heroes[lane][0] ?? null, join: heroes[lane], meetAtStart: false, field: null, foe: null })),
    );
  }
  // 地形とエネミーの傾向（枝分かれした戦闘・強敵だけ。同じ行で地形が重ならないように）
  const fieldIds = Object.keys(FIELDS);
  const foeIds = ["mixed", "mixed", "venom", "blade", "wall", "assault"];
  for (const row of rows) {
    if (row.length === 1) continue;
    const used = new Set();
    for (const st of row) {
      if (st.kind === "supply") continue;
      let field = rng.pick(fieldIds);
      for (let i = 0; i < 4 && used.has(field); i++) field = rng.pick(fieldIds);
      used.add(field);
      st.field = field;
      st.foe = rng.pick(foeIds);
    }
  }
  // 道: 同じレーンへは必ず。隣のレーンへは確率で（道どうしが交差しないように）
  const next = [];
  for (let r = 0; r < count - 1; r++) {
    const a = rows[r].length;
    const b = rows[r + 1].length;
    if (a === 1) next.push([Array.from({ length: b }, (_, i) => i)]);
    else if (b === 1) next.push(Array.from({ length: a }, () => [0]));
    else {
      // 隣り合うレーンの組ごとに「渡らない / 右へ / 左へ」のどれか（両方向は交差するので選ばない）
      const links = Array.from({ length: a }, (_, l) => [l]);
      for (let l = 0; l + 1 < Math.min(a, b); l++) {
        const way = rng.weighted([
          ["none", 3],
          ["right", 3.5],
          ["left", 3.5],
        ]);
        if (way === "right") links[l].push(l + 1);
        if (way === "left") links[l + 1].push(l);
      }
      next.push(links.map((x) => x.sort((m, n) => m - n)));
    }
  }
  return { rows, next };
}

/** ノードの道（ノードIDから決まる。初めて使うときに作る） */
export function nodeMap(area) {
  area.route ??= buildNodeMap(area);
  return area.route;
}

/** その行のステージ（1本道の行は lane が null） */
export function stageAt(area, row, lane = null) {
  const list = nodeMap(area).rows[row];
  if (!list) return null;
  if (list.length === 1) return lane === null || lane === undefined ? list[0] : null;
  return lane === null || lane === undefined ? null : (list[lane] ?? null);
}

/** ノードのすべてのステージ（下の行から） */
export const allStages = (area) => nodeMap(area).rows.flat();

/** from（row, lane）から to（row+1 の lane）へ行けるか */
export function linked(area, row, lane, toLane) {
  const rows = nodeMap(area).rows;
  const i = rows[row].length === 1 ? 0 : lane;
  const j = rows[row + 1]?.length === 1 ? 0 : toLane;
  return Boolean(nodeMap(area).next[row]?.[i]?.includes(j));
}

/** "kindai-jp:2"（1本道の行）や "kindai-eu:5.1"（枝分かれした行の B レーン）のようなステージID */
export const stageKey = (areaId, row, lane = null) => (lane === null || lane === undefined ? `${areaId}:${row}` : `${areaId}:${row}.${lane}`);

export function parseStageKey(key) {
  const [areaId, rest] = String(key).split(":");
  const area = areaById(areaId);
  if (!area || rest === undefined) return null;
  const [r, l] = rest.split(".");
  const index = Number(r);
  const lane = l === undefined ? null : Number(l);
  const stage = stageAt(area, index, lane);
  if (!stage) return null;
  return { area, index, lane, stage };
}

/** 画面に出すステージ番号（1-1、2-6B など） */
export const stageLabel = (area, index, lane = null) => `${area.no}-${index + 1}${lane === null || lane === undefined ? "" : LANE_LETTERS[lane]}`;
export const areaName = (area) => (area.era === "hazama" ? area.region : `${eraById(area.era).name}・${area.region}`);

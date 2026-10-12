// ストーリーの世界: 時代・地域・エリア・ステージと、どこでどのヒーローが仲間になるか。
// 仕様は docs/story.md。数値や並びを変えるときはここだけ直せばよい。
// ヒーローは MCH の ID（data/heroes.json の mch_id）で書く。

/** 時代（古いほど後で開く） */
export const ERAS = [
  { id: "kindai", name: "近代", en: "MODERN", years: "19〜20世紀" },
  { id: "kinsei", name: "近世", en: "EARLY MODERN", years: "15〜18世紀" },
  { id: "chusei", name: "中世", en: "MEDIEVAL", years: "5〜15世紀" },
  { id: "kodai", name: "古代", en: "ANCIENT", years: "紀元前〜3世紀" },
  { id: "hazama", name: "時空のはざま", en: "RIFT", years: "????" },
];

/** タイムマシン（エクステンション「合体ロボ」シリーズ）。next は次のレベルまでに必要なパーツ数 */
export const MACHINES = [
  { level: 1, rarity: 1, name: "魔導機械エメ・ラ・ルド・テレスター(破)", short: "エメ・ラ・ルド・テレスター", image: "assets/story/machine-1.png", next: 2 },
  { level: 2, rarity: 2, name: "魔導海底探索機ジャンヌ・ザ・オメガ", short: "ジャンヌ・ザ・オメガ", image: "assets/story/machine-2.png", next: 3 },
  { level: 3, rarity: 3, name: "魔導戦車ジュウ・ザ・トロール", short: "ジュウ・ザ・トロール", image: "assets/story/machine-3.png", next: 4 },
  { level: 4, rarity: 4, name: "魔導兵器バ・ビ・ディ・オン・ファティオス", short: "バ・ビ・ディ・オン・ファティオス", image: "assets/story/machine-4.png", next: 5 },
  { level: 5, rarity: 5, name: "古代魔導ロボット・ディア・ガ・レティウス", short: "ディア・ガ・レティウス", image: "assets/story/machine-5.png", next: null },
];

export const MAX_MACHINE_LEVEL = MACHINES.length;

/** 最初から仲間（MCHウォーリアー・タクティシャン・アーティスト） */
export const STARTER_HEROES = [10001, 10002, 10003];

export const DECK_SIZE = 8;
export const STAGE_LIVES = 3;
/** X-1, X-2, X-3 のウェーブ数 */
export const STAGE_WAVES = [3, 4, 5];

/**
 * エリア。
 * machine: 行くのに必要なタイムマシンのレベル / map: ワールドマップ上の位置（%）
 * stages[i].meet: そのステージで出会うヒーロー / join: クリアで仲間になるヒーロー（meet を含む）
 * difficulty: エネミーの強さとマーケットランクの上乗せ
 */
export const AREAS = [
  {
    id: "kindai-jp",
    no: 1,
    era: "kindai",
    region: "日本",
    machine: 1,
    map: { x: 84, y: 40 },
    bg: "1023",
    color: "#ff5a6a",
    difficulty: 0,
    stages: [
      { meet: 10004, join: [2036, 2021], meetAtStart: true },
      { meet: 4056, join: [4056, 2014, 3045] },
      { meet: 5008, join: [5008, 4005, 4012, 4027, 4035, 4039] },
    ],
  },
  {
    id: "kindai-eu",
    no: 2,
    era: "kindai",
    region: "ヨーロッパ",
    machine: 2,
    map: { x: 46, y: 30 },
    bg: "1004",
    color: "#5fa8ff",
    difficulty: 1,
    stages: [
      { meet: 1001, join: [1001, 1004, 2003, 2004, 2005, 2022, 2049] },
      { meet: 4002, join: [4002, 2008, 2010, 2016, 2031, 2033, 2039, 2048, 3004, 3028] },
      { meet: 5002, join: [5002, 4011, 4013, 4017, 4021, 4028, 4041, 4044, 4046, 5010] },
    ],
  },
  {
    id: "kindai-us",
    no: 3,
    era: "kindai",
    region: "アメリカ",
    machine: 2,
    map: { x: 18, y: 36 },
    bg: "1046",
    color: "#ffb347",
    difficulty: 1,
    stages: [
      { meet: 1008, join: [1008, 2017, 2032] },
      { meet: 4007, join: [4007, 2001, 3031, 3036] },
      { meet: 4033, join: [4033, 4006, 4020] },
    ],
  },
  {
    id: "kinsei-jp",
    no: 4,
    era: "kinsei",
    region: "日本",
    machine: 3,
    map: { x: 84, y: 40 },
    bg: "1002",
    color: "#ff5a6a",
    difficulty: 2,
    stages: [
      { meet: 10008, join: [10008, 1002, 1005, 2009, 2018, 2030, 2043, 3038, 3016] },
      { meet: 4025, join: [4025, 2012, 2020, 2026, 3003, 3010, 3011, 3012, 3013, 3014, 3025, 4032] },
      { meet: 5001, join: [5001, 3044, 4004, 4009, 4055, 5024, 5032] },
    ],
  },
  {
    id: "kinsei-eu",
    no: 5,
    era: "kinsei",
    region: "ヨーロッパ",
    machine: 3,
    map: { x: 46, y: 30 },
    bg: "1052",
    color: "#5fa8ff",
    difficulty: 2,
    stages: [
      { meet: 10006, join: [10006, 2015, 2023, 3002, 3008, 3024] },
      { meet: 3030, join: [3030, 3015, 3041, 3043, 3046, 4003, 4030] },
      { meet: 5005, join: [5005, 4014, 5012, 5027] },
    ],
  },
  {
    id: "kinsei-sea",
    no: 6,
    era: "kinsei",
    region: "新大陸と海",
    machine: 3,
    map: { x: 22, y: 52 },
    bg: "1030",
    color: "#36d6c3",
    difficulty: 2,
    stages: [
      { meet: 2042, join: [2042, 3022, 3037, 3042] },
      { meet: 4036, join: [4036, 3029, 3032, 4052, 4019] },
      { meet: 5004, join: [5004, 2041] },
    ],
  },
  {
    id: "chusei-jp",
    no: 7,
    era: "chusei",
    region: "日本",
    machine: 4,
    map: { x: 84, y: 40 },
    bg: "1003",
    color: "#ff5a6a",
    difficulty: 3,
    stages: [
      { meet: 2019, join: [2019, 2029, 3035, 3018] },
      { meet: 4022, join: [4022, 2038, 2046, 3051, 4031, 4054] },
      { meet: 5019, join: [5019, 5021, 5028] },
    ],
  },
  {
    id: "chusei-eu",
    no: 8,
    era: "chusei",
    region: "ヨーロッパ",
    machine: 4,
    map: { x: 46, y: 30 },
    bg: "1056",
    color: "#5fa8ff",
    difficulty: 3,
    stages: [
      { meet: 3026, join: [3026, 3034, 4053, 4038] },
      { meet: 4045, join: [4045, 3047, 5023, 5029] },
      { meet: 5006, join: [5006, 5007, 5014] },
    ],
  },
  {
    id: "chusei-asia",
    no: 9,
    era: "chusei",
    region: "アジア",
    machine: 4,
    map: { x: 70, y: 42 },
    bg: "1010",
    color: "#ffd23f",
    difficulty: 3,
    stages: [
      { meet: 1007, join: [1007, 2040, 2045] },
      { meet: 3017, join: [3017, 4008, 4015, 4024] },
      { meet: 5013, join: [5013, 5030] },
    ],
  },
  {
    id: "kodai-sangoku",
    no: 10,
    era: "kodai",
    region: "三国志",
    machine: 5,
    map: { x: 72, y: 44 },
    bg: "1037",
    color: "#ffd23f",
    difficulty: 4,
    stages: [
      { meet: 10005, join: [10005, 1003, 2013, 2037, 3019, 3020, 3023] },
      { meet: 4037, join: [4037, 3048, 3049, 4001, 4016, 4018, 4023, 4048, 4049, 4050] },
      { meet: 5009, join: [5009, 5003, 5015] },
    ],
  },
  {
    id: "kodai-east",
    no: 11,
    era: "kodai",
    region: "東アジア",
    machine: 5,
    map: { x: 82, y: 34 },
    bg: "1053",
    color: "#ff8ad8",
    difficulty: 4,
    stages: [
      { meet: 2011, join: [2011, 3009, 3027, 2028] },
      { meet: 4040, join: [4040, 4010, 4029, 4051] },
      { meet: 5018, join: [5018, 5011, 5022, 5025, 5026] },
    ],
  },
  {
    id: "kodai-med",
    no: 12,
    era: "kodai",
    region: "地中海",
    machine: 5,
    map: { x: 52, y: 46 },
    bg: "1041",
    color: "#e8c46a",
    difficulty: 4,
    stages: [
      { meet: 10007, join: [10007, 1006, 2006, 2027, 2034, 2044, 2047, 2024] },
      { meet: 4026, join: [4026, 2002, 3007, 3021, 3040, 3050, 4047, 4057] },
      { meet: 5016, join: [5016, 5017, 5020, 5031] },
    ],
  },
  {
    id: "hazama",
    no: 13,
    era: "hazama",
    region: "時空のはざま",
    machine: 5,
    requiresAll: true,
    map: { x: 50, y: 78 },
    bg: "2605",
    color: "#b46cff",
    difficulty: 5,
    stages: [
      { meet: 2007, join: [2007, 3039] },
      { meet: 3001, join: [3001, 3005, 3006] },
      { meet: 2025, join: [2025, 4034] },
    ],
  },
];

export const TUTORIAL_AREA = "kindai-jp";

export const heroId = (mchId) => `h${mchId}`;
export const areaById = (id) => AREAS.find((a) => a.id === id);
export const eraById = (id) => ERAS.find((e) => e.id === id);
export const machineByLevel = (level) => MACHINES[Math.max(1, Math.min(MAX_MACHINE_LEVEL, level)) - 1];

/** "kindai-jp:2" のようなステージID */
export const stageKey = (areaId, index) => `${areaId}:${index}`;

export function parseStageKey(key) {
  const [areaId, i] = key.split(":");
  const area = areaById(areaId);
  const index = Number(i);
  if (!area || !area.stages[index]) return null;
  return { area, index, stage: area.stages[index] };
}

/** 画面に出すステージ番号（1-1 など） */
export const stageLabel = (area, index) => `${area.no}-${index + 1}`;
export const areaName = (area) => (area.era === "hazama" ? area.region : `${eraById(area.era).name}・${area.region}`);

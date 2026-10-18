// bearko.games 共通基盤（アチーブメント・総合スコア・RTA）への窓口。docs/platform.md
// SDK（https://bearko.games/sdk/v1.js）が読めない・通信に失敗しても何もしない。ゲームの進行は止めない。
// ログイン状態は共通基盤が持つので、ここではセーブ（localStorage）に触らない。
import { AREAS, TUTORIAL_AREA, areaById, isFinalStage } from "./engine/world.js";
import { LEVEL_MULT, RARITY } from "./engine/balance.js";
import { areaCleared, areaProgress, newStory } from "./engine/story.js";

// ---------------------------------------------------------------- アチーブメント（共通基盤 SPEC-008。旧トロフィー）
// 送り方は SDK の unlockTrophy（名前は旧のまま）。定義（名前・絵）は共通基盤が持つ

/** 制覇するとアチーブメントになるノード（ノード ID → アチーブメント ID） */
export const AREA_ACHIEVEMENTS = {
  [TUTORIAL_AREA]: "deckbattle.area1", // 最初のノード（近代・日本）
  "kindai-eu": "deckbattle.europe", // 近代・ヨーロッパ
  "ex-corsica": "deckbattle.corsica", // コルシカの特異点
  "ex-abyss": "deckbattle.abyss", // 深海の特異点
  hazama: "deckbattle.clear", // 時空のはざま：本編の全ノードを制覇すると行ける最後のノード
  "ex-maou": "deckbattle.maou", // 魔王の特異点（最後のステージのレイドボスが覚醒魔王ファオ）
};

/** ノードを初めて制覇したときに送るアチーブメント ID（純関数。tests/platform.test.mjs） */
export function trophyIdsForAreaCleared(areaId) {
  const id = AREA_ACHIEVEMENTS[areaId];
  return id ? [id] : [];
}

/** すべてのノードのすべてのステージ（枝分かれ・特別ステージも含む）をクリアしたか */
export function allStagesCleared(story) {
  return AREAS.every((a) => {
    const p = areaProgress(story, a);
    return p.total > 0 && p.done >= p.total;
  });
}

/**
 * ストーリーのセーブから、いま満たしているアチーブメント（純関数。tests/platform.test.mjs）。
 * 起動のときとステージが終わったときに送る（前から遊んでいる人にも付く）
 */
export function storyTrophyIds(story) {
  if (!story) return [];
  const ids = [];
  for (const a of AREAS) if (AREA_ACHIEVEMENTS[a.id] && areaCleared(story, a)) ids.push(AREA_ACHIEVEMENTS[a.id]);
  const machine = story.machine ?? 1;
  if (machine >= 2) ids.push("deckbattle.machine2");
  if (machine >= 5) ids.push("deckbattle.machine5");
  const heroes = story.heroes?.length ?? 0;
  if (heroes >= 50) ids.push("deckbattle.heroes50");
  if (heroes >= 100) ids.push("deckbattle.heroes100");
  if (allStagesCleared(story)) ids.push("deckbattle.allstages");
  return ids;
}

/** フリーバトル（クエスト）が終わったとき：10 勝してクリアしていたら（純関数） */
export function trophyIdsForQuestEnd(run) {
  return run && !run.story && run.phase === "clear" ? ["deckbattle.quest"] : [];
}

/** 戦闘の演出が終わったとき：勝っていたら「初めてバトルに勝つ」（純関数。2 回目からは送り済みとして送らない） */
export function trophyIdsForBattle(result) {
  return result?.won ? ["deckbattle.firstwin"] : [];
}

/** マーケットで買ったとき：合成が起きていたら「初めてヒーローを合成する」（純関数） */
export function trophyIdsForBuy(res) {
  return res?.ok && res.merges?.length ? ["deckbattle.merge"] : [];
}

const sdk = () => (typeof window !== "undefined" ? window.BearkoGames : undefined);

export function initPlatform(version) {
  const bg = sdk();
  if (!bg) return;
  try {
    Promise.resolve(bg.init({ game: "deckbattle", version }))
      .then(() => applyChatVisible())   // SDK が後から読めたときも、いまの画面の出す／隠すをそろえる
      .catch((e) => console.warn("[platform] init", e));
  } catch (e) {
    console.warn("[platform] init", e);
  }
}

// ---------------------------------------------------------------- 全体チャット（共通基盤 SPEC-004。SDK 1.6.0 から）
// 窓そのものは SDK が描く（右下の 💬）。ここでは出す・隠すだけ：対戦（battle）と会話劇（scene）では隠し、それ以外で出す
let chatWanted = true;

function applyChatVisible() {
  const bg = sdk();
  if (!bg || !bg.chat || typeof bg.chat.setVisible !== "function") return;
  try {
    bg.chat.setVisible(chatWanted);
  } catch (e) {
    console.warn("[platform] chat", e);
  }
}

/** 💬 を出す（true）／隠す（false）。SDK がない・古い（chat が無い）ときは覚えておいて、読めたときにそろえる */
export function setChatVisible(on) {
  chatWanted = !!on;
  applyChatVisible();
}

// ---------------------------------------------------------------- bearko.games 共通のアイコン（共通基盤 SPEC-005 5.3。選ぶ窓は SDK 1.7.0）
/** 選ぶ窓を出せるか（SDK が読めて 1.7.0 以上） */
export function canPickAvatar() {
  const bg = sdk();
  return !!(bg && typeof bg.openAvatarPicker === "function");
}
/** アイコンを選ぶ窓（すべてのゲームとチャットで同じ絵になる）。SDK がない・古いときは何もしない */
export function openAvatarPicker() {
  const bg = sdk();
  if (!bg || typeof bg.openAvatarPicker !== "function") return false;
  try { bg.openAvatarPicker(); } catch (e) { console.warn("[platform] avatar", e); }
  return true;
}

/** その画面で 💬 を隠すか。純関数（tests/platform.test.mjs） */
export function chatHiddenOn(screen) {
  return screen === "battle" || screen === "scene";
}

// 送ったもの（この起動のあいだ）。同じ ID は 2 回送らない（失敗しても送り直さない。次の起動で送る）
const sentTrophies = new Set();
// 1 つずつ順に送る（未ログインの最初の書き込みで仮アカウントができるため、同時に送らない）
let trophyChain = Promise.resolve();

/** アチーブメントを送る。SDK がない・失敗しても何もしない。返すのは送り終わる Promise（テスト用） */
export function unlockTrophies(ids) {
  const bg = sdk();
  if (!bg || typeof bg.unlockTrophy !== "function") return trophyChain;
  for (const id of ids ?? []) {
    if (sentTrophies.has(id)) continue;
    sentTrophies.add(id);
    trophyChain = trophyChain.then(() => {
      try {
        return Promise.resolve(bg.unlockTrophy(id))
          .then((r) => {
            if (!r || !r.ok) console.warn("[platform] trophy", id, r && r.error);
          })
          .catch((e) => console.warn("[platform] trophy", id, e));
      } catch (e) {
        console.warn("[platform] trophy", id, e);
      }
    });
  }
  return trophyChain;
}

/** テスト用：この起動で送ったものを忘れる */
export function _resetSentTrophies() {
  sentTrophies.clear();
  trophyChain = Promise.resolve();
}

/** ステージの結果（Story.clearStage の戻り値）を受けて、ノードを制覇していたらアチーブメントを送る */
export function reportStageResult(areaId, result) {
  if (!result?.areaCleared) return trophyChain;
  return unlockTrophies(trophyIdsForAreaCleared(areaId));
}

/** ストーリーのセーブから、いま満たしているアチーブメントをまとめて送る（送り済みは送らない） */
export function reportStoryTrophies(story) {
  return unlockTrophies(storyTrophyIds(story));
}

// ---------------------------------------------------------------- 総合スコア（共通基盤 SPEC-002 3.4）
// ノードの最後のステージをクリアしたときのパーティの「戦力」と、そのノードの平均の戦闘時間で測る。
// 点の計算は共通基盤。ここでは成績を作って送るだけ（純関数は tests/platform.test.mjs）

/**
 * 戦力（新設）：パーティの各ヒーローの「レアリティの基礎値 × Lv の倍率 × (1 + 永続強化 ÷ 100)」の合計。強いほど高い。
 * permMult は %（イフリートの魔石 1 つで +20）。v1.0.0 より前は ÷ 100 をしておらず、魔石 1 つで 21 倍になっていた（共通基盤 SPEC-002 3.4）
 */
export function partyPower(db, run) {
  let power = 0;
  for (const unit of run?.party ?? []) {
    if (!unit) continue;
    const def = db.def(unit.defId);
    const rarity = RARITY[def?.rarity];
    if (!rarity) continue;
    power += rarity.budget * (LEVEL_MULT[unit.level] ?? 0) * (1 + (unit.permMult || 0) / 100);
  }
  return Math.round(power * 10) / 10;
}

/**
 * そのノードで戦った戦闘（ノードの中の全ステージ）の、ゲーム内の秒数の平均（戦っていなければ null）。
 * run.nodeTimes はチームと一緒に繰り越す記録。前の版のセーブで繰り越したチームにはないので、そのときはこのステージの戦闘だけ
 */
export function avgBattleSec(run) {
  const raw = Array.isArray(run?.nodeTimes) ? run.nodeTimes : (run?.history ?? []).map((h) => h.time);
  const times = raw.filter((t) => typeof t === "number" && t > 0);
  if (!times.length) return null;
  return Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10;
}

/**
 * ノードごとのふつうの戦力（ボットで 200 周した平均を 5 単位に丸めた値）。
 * 共通基盤の platform/scoring/deckbattle.v3.js の NORMAL_POWER と同じ。どちらかを変えたら、もう一方も直す
 */
export const NORMAL_POWER = {
  "kindai-jp": 180,
  "kindai-eu": 255,
  "kindai-us": 295,
  "kinsei-jp": 290,
  "kinsei-eu": 340,
  "kinsei-sea": 340,
  "chusei-jp": 335,
  "chusei-eu": 315,
  "chusei-asia": 345,
  "kodai-sangoku": 340,
  "kodai-east": 345,
  "kodai-med": 345,
  hazama: 340,
  "ex-corsica": 205,
  "ex-abyss": 215,
  "ex-maou": 235,
};

/** ノードの成績（共通基盤の v3 と同じ式：190 × 戦力 ÷ そのノードのふつうの戦力 ＋ 1,900 ÷ 平均秒）。自己ベストを選ぶのに使う */
export function nodeValue(areaId, e) {
  return (190 * e.power) / (NORMAL_POWER[areaId] ?? 300) + 1900 / e.avgBattleSec;
}

/** 自己ベスト（story.scores）の版。戦力の数え方を変えたら上げ、前の版の自己ベストは捨てる */
export const SCORES_VERSION = 3;

/**
 * セーブを読んだときに呼ぶ。前の版の自己ベストは戦力の数え方が違う（魔石を ÷ 100 していない）ので捨てる。
 * 前の制覇は節目の点だけになり、ノードを遊び直すと成績の点も入る（#12）。捨てたら true
 */
export function migrateScores(story) {
  if (!story || story.scoresVersion === SCORES_VERSION) return false;
  const had = Boolean(story.scores && Object.keys(story.scores).length);
  delete story.scores;
  story.scoresVersion = SCORES_VERSION;
  return had;
}

/**
 * ノードの最後のステージをクリアしたときに、そのノードの自己ベストを story.scores に残す。
 * よくなったら true。story はセーブに入る（既存のセーブには scores がないので、ここで足す）
 */
export function recordNodeScore(story, areaId, index, db, run) {
  const area = areaById(areaId);
  if (!area || !isFinalStage(area, index)) return false;
  const sec = avgBattleSec(run);
  if (sec == null) return false;
  const entry = { power: partyPower(db, run), avgBattleSec: Math.max(1, sec) };
  story.scores ??= {};
  story.scoresVersion = SCORES_VERSION;
  const prev = story.scores[areaId];
  if (prev && nodeValue(areaId, prev) >= nodeValue(areaId, entry)) return false;
  story.scores[areaId] = entry;
  return true;
}

/** 共通基盤に送る成績：制覇したノードと、ノードごとの自己ベスト */
export function scoreMetrics(story) {
  const nodesCleared = AREAS.filter((a) => areaCleared(story, a)).map((a) => a.id);
  const nodes = {};
  for (const id of nodesCleared) if (story.scores?.[id]) nodes[id] = story.scores[id];
  return { nodesCleared, nodes };
}

/** 送る。制覇したノードがなければ送らない */
export function reportStoryScore(story, { quiet = false } = {}) {
  const bg = sdk();
  if (!bg || typeof bg.submitScore !== "function") return;
  const metrics = scoreMetrics(story);
  if (!metrics.nodesCleared.length) return;
  try {
    Promise.resolve(bg.submitScore(metrics, { quiet }))
      .then((r) => {
        if (!r || !r.ok) console.warn("[platform] score", r && r.error);
      })
      .catch((e) => console.warn("[platform] score", e));
  } catch (e) {
    console.warn("[platform] score", e);
  }
}

// ---------------------------------------------------------------- RTA（共通基盤 SPEC-001 6.11）
// 時間は共通基盤の SDK が計る（公式タイムはサーバーの受信時刻の差）。ここでは始める・区切り・やめるを伝えるだけ

export const RTA_REGULATIONS = {
  node1: "deckbattle-node1", // 近代・日本の制覇まで（RTA 用の新しいストーリー）
  quest: "deckbattle-quest", // フリーバトル 10 勝でクリア
};
/** RTA 中の戦闘の倍速（固定。SKIP は使える） */
export const RTA_SPEED = 4;

/** RTA を出せるか（SDK が読めたときだけ。ローカルで開いたときなどはタイトルに出さない） */
export function isRtaAvailable() {
  const bg = sdk();
  return Boolean(bg && bg.rta && typeof bg.rta.start === "function");
}

/** RTA 用の新しいストーリー：プロローグ・ワールドマップの説明・マインの操作の案内は済んだことにする（純関数） */
export function newRtaStory() {
  const story = newStory();
  story.prologue = true;
  story.flags = { mapIntro: true, tut: "done" };
  return story;
}

/** 近代・日本のステージをクリアしたときの区切り ID（純関数）。ほかのノードは null */
export function rtaCheckpointForStageClear(areaId, index) {
  if (areaId !== TUTORIAL_AREA) return null;
  if (isFinalStage(areaById(areaId), index)) return "clear";
  return index >= 0 ? `stage${index + 1}` : null;
}

/** フリーバトルの戦闘が終わったときの区切り ID（純関数）。5 勝目で win5、10 勝（クリア）で clear */
export function rtaCheckpointForQuest(run) {
  if (run?.phase === "clear") return "clear";
  if (run?.lastResult?.won && run.wins === 5) return "win5";
  return null;
}

function rtaCall(name, fn) {
  const bg = sdk();
  if (!bg || !bg.rta) return;
  try {
    Promise.resolve(fn(bg.rta))
      .then((r) => {
        if (r && r.ok === false) console.warn("[platform] rta", name, r.error);
      })
      .catch((e) => console.warn("[platform] rta", name, e));
  } catch (e) {
    console.warn("[platform] rta", name, e);
  }
}

// 経過時間は画面の下、マーケットの「バトル開始」の帯（高さ 60px）のすぐ上に出す（上は HUD と戦闘の操作・タイマーがあるため）
const RTA_TIMER_OFFSET = 64;

/** 計測を始める（前の計測は SDK が中断にする） */
export function startRta(regulation) {
  rtaCall("start", (rta) => rta.start({ regulation, timer: "bottom", timerOffset: RTA_TIMER_OFFSET }));
}

/** 区切り。igtMs はゲーム内の戦闘時間の合計 */
export function rtaCheckpoint(id, igtMs) {
  rtaCall("checkpoint", (rta) => (rta.current && rta.current() ? rta.checkpoint(id, { igtMs }) : null));
}

/** やめたとき（ゲームオーバー・タイトルに戻ったとき） */
export function abortRta() {
  rtaCall("abort", (rta) => (rta.current && rta.current() ? rta.abort() : null));
}

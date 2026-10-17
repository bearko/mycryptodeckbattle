// bearko.games 共通基盤（トロフィー・総合スコア・RTA）への窓口。docs/platform.md
// SDK（https://bearko.games/sdk/v1.js）が読めない・通信に失敗しても何もしない。ゲームの進行は止めない。
// ログイン状態は共通基盤が持つので、ここではセーブ（localStorage）に触らない。
import { AREAS, TUTORIAL_AREA, areaById, isFinalStage } from "./engine/world.js";
import { LEVEL_MULT, RARITY } from "./engine/balance.js";
import { areaCleared, newStory } from "./engine/story.js";

/** ノードを初めて制覇したときに送るトロフィー ID（純関数。tests/platform.test.mjs） */
export function trophyIdsForAreaCleared(areaId) {
  if (areaId === TUTORIAL_AREA) return ["deckbattle.area1"]; // 最初のノード（近代・日本）
  if (areaId === "hazama") return ["deckbattle.clear"]; // 時空のはざま：本編の全ノードを制覇すると行ける最後のノード
  return [];
}

const sdk = () => (typeof window !== "undefined" ? window.BearkoGames : undefined);

export function initPlatform(version) {
  const bg = sdk();
  if (!bg) return;
  try {
    Promise.resolve(bg.init({ game: "deckbattle", version })).catch((e) => console.warn("[platform] init", e));
  } catch (e) {
    console.warn("[platform] init", e);
  }
}

/** ステージの結果（Story.clearStage の戻り値）を受けて、ノードを制覇していたらトロフィーを送る */
export function reportStageResult(areaId, result) {
  const bg = sdk();
  if (!bg || !result?.areaCleared) return;
  for (const id of trophyIdsForAreaCleared(areaId)) {
    try {
      Promise.resolve(bg.unlockTrophy(id))
        .then((r) => {
          if (!r || !r.ok) console.warn("[platform] trophy", id, r && r.error);
        })
        .catch((e) => console.warn("[platform] trophy", id, e));
    } catch (e) {
      console.warn("[platform] trophy", id, e);
    }
  }
}

// ---------------------------------------------------------------- 総合スコア（共通基盤 SPEC-002 3.4）
// ノードの最後のステージをクリアしたときのパーティの「戦力」と、そのノードの平均の戦闘時間で測る。
// 点の計算は共通基盤。ここでは成績を作って送るだけ（純関数は tests/platform.test.mjs）

/** 戦力（新設）：パーティの各ヒーローの「レアリティの基礎値 × Lv の倍率 × (1 + 永続強化)」の合計。強いほど高い */
export function partyPower(db, run) {
  let power = 0;
  for (const unit of run?.party ?? []) {
    if (!unit) continue;
    const def = db.def(unit.defId);
    const rarity = RARITY[def?.rarity];
    if (!rarity) continue;
    power += rarity.budget * (LEVEL_MULT[unit.level] ?? 0) * (1 + (unit.permMult || 0));
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

// どちらがよい成績か（共通基盤の式と同じ形：戦力 ＋ 4,800 ÷ 平均秒）
const nodeValue = (e) => e.power + 4800 / e.avgBattleSec;

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
  const prev = story.scores[areaId];
  if (prev && nodeValue(prev) >= nodeValue(entry)) return false;
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

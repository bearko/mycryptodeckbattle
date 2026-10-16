// bearko.games 共通基盤（トロフィー・総合スコア）への窓口。docs/platform.md
// SDK（https://bearko.games/sdk/v1.js）が読めない・通信に失敗しても何もしない。ゲームの進行は止めない。
// ログイン状態は共通基盤が持つので、ここではセーブ（localStorage）に触らない。
import { AREAS, TUTORIAL_AREA, areaById, isFinalStage } from "./engine/world.js";
import { LEVEL_MULT, RARITY } from "./engine/balance.js";
import { areaCleared } from "./engine/story.js";

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

/** そのノードで戦った戦闘の、ゲーム内の秒数の平均（戦っていなければ null） */
export function avgBattleSec(run) {
  const times = (run?.history ?? []).map((h) => h.time).filter((t) => typeof t === "number" && t > 0);
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

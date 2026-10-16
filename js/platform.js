// bearko.games 共通基盤（トロフィー）への窓口。docs/platform.md
// SDK（https://bearko.games/sdk/v1.js）が読めない・通信に失敗しても何もしない。ゲームの進行は止めない。
// ログイン状態は共通基盤が持つので、ここではセーブ（localStorage）に触らない。
import { TUTORIAL_AREA } from "./engine/world.js";

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

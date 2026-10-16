# bearko.games 共通基盤との連携

bearko.games 配下の全タイトル共通の基盤（共通 Google ログイン・トロフィー・総合スコア・RTA）に参加する。設計は [bearko/mycryptoportfolio の SPEC-001](https://github.com/bearko/mycryptoportfolio/blob/claude/game-portfolio-page-4afqbc/docs/specs/SPEC-001-bearko-games-platform.md)。

## トロフィー（2026-10-16〜）

ステージの結果（`Story.clearStage` の戻り値）で、**ノードを初めて制覇したとき** に送る（`js/platform.js`）。

| 制覇したノード | トロフィー | 名前 |
|---|---|---|
| 近代・日本（最初のノード。`TUTORIAL_AREA`） | `deckbattle.area1` | 開拓者の一歩 |
| 時空のはざま（本編の全ノード制覇で行ける最後のノード） | `deckbattle.clear` | 十二の功業 |

- 特別ステージ（特異点）では送らない
- 通知（「トロフィー獲得」、未ログインなら「未登録のトロフィー n 個 — ログインして登録」）は共通基盤の SDK が画面下に出す
- `index.html` で SDK（`https://bearko.games/sdk/v1.js`）を `defer` で読み込む。**SDK が読めない・失敗しても何もしない**。セーブ（localStorage）には触らない

## テスト

`npm test`（`tests/platform.test.mjs`）

## 総合スコア（共通基盤 SPEC-002 3.4）

- **戦力（新設）**：パーティ（6 枠）の各ヒーローの「レアリティの基礎値（`RARITY.budget`。Common 10 〜 Legendary 22）× Lv の倍率（`LEVEL_MULT`）×（1 ＋ 永続強化 `permMult`）」の合計。強いほど高い（`partyPower`）
- **平均の戦闘時間**：そのノードで戦った戦闘の、ゲーム内の秒数の平均（`run.history[].time`）。短いほど高い（`avgBattleSec`）
- ノードの最後のステージをクリアしたとき（`storyStageEnd`、`carryOver` の前）に、そのノードの自己ベストをセーブ（`story.scores`）に残し、よくなったか初めて制覇したら送る
- 送る成績：制覇したノード（`nodesCleared`）と、ノードごとの自己ベスト（`nodes`）。点の計算は共通基盤（節目：最初のノード 1,000 〜 時空のはざま 5,000、特別ステージ 1 つ + 1,667 ／ 成績：ノードごとに 戦力 ＋ 4,800 ÷ 平均秒）
- 起動のたびに、これまでの制覇を通知なしで送り直す（前からのセーブも点になる）

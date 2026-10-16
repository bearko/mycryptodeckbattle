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

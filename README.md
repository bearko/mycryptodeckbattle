# マイクリ デッキバトル（My Crypto Deck Battle）

My Crypto Heroes（マイクリ）のアセットを使った、**参考作 風のオートバトラー**です（非公式ファンゲーム）。
ヒーローをマーケットで集めて合成し、パーティを編成して、エネミー部隊とオートバトル。10勝でクエストクリアです。

この MVP はオンライン対戦をスコープ外にし、**CPU戦**のみを実装しています。

- プレイヤー: クリスくん / マインちゃん / MAI（それぞれプレイヤースキルが異なる）
- 自分のユニット: マイクリのヒーロー（194体）
- 敵のユニット: マイクリのエネミー（200体）
- ゲーム内の用語はすべてマイクリの用語に置き換えています（[用語対応表](docs/glossary.md)）

## 公開版（Vercel）

Vercel で `bearko/mycryptodeckbattle` をインポートすると、そのまま公開できます（ビルド不要の静的サイト。Framework Preset は「Other」、Build / Output の設定は空欄のままで可。設定は `vercel.json`）。接続後はデフォルトブランチへの push で自動デプロイされます。

スマホの縦画面を基準にしたレイアウトで、どの画面もスクロールせずに操作できます（スクロールするのはエクステンション一覧などのリストと、遊び方・詳細の説明画面だけ）。

## 遊び方（ローカル）

ビルド不要の静的サイトです。リポジトリのルートで任意の静的サーバーを起動し、ブラウザで開きます。

```bash
npm start                    # http://localhost:8080
# または
python3 -m http.server 8080
```

`index.html` をファイルとして直接開くと、ブラウザの制限でデータを読み込めません。必ずサーバー経由で開いてください。

## ゲームの流れ

1. プレイヤーを選んでクエスト開始（ライフ10）
2. マーケットで GUM を使ってヒーローを購入し、パーティ（前衛・中衛・後衛 × 2段）に配置
   - タップで詳細、もう一度タップ（または「購入」）で購入。ヒーローをタップ→別の枠をタップで入れ替え
   - 同じヒーロー3体で Lv2、Lv2 を2体で Lv3 に合成。合成するとエクステンションを3つから1つ獲得
   - ラインナップ更新（3GUM）、取り置き（次のステージに持ち越し）、売却
   - マテリアル（魔石）は購入した瞬間に効果を発揮（1ステージ1回）
3. 「バトル開始」でエネミー部隊とオートバトル
   - パーティ全体で1つの「パーティHP」を共有し、0になった側の負け
   - 各ヒーローはチャージが溜まるたびにスキルを発動（シールド・ダメージ・出血・毒・回復・チャージ操作・効果量の増減）
   - 30秒でサドンデス
4. 負けるとライフが減る（ステージ1〜2: 1、3〜4: 2、5以降: 3）。最初にライフが尽きたときだけ「復活」
5. ステージ3・6・9で宝箱。10勝でクエストクリア

## ドキュメント

- [docs/research.md](docs/research.md): 参考作 の仕組みの調査結果と、確認できなかった点
- [docs/glossary.md](docs/glossary.md): 参考作 → マイクリ用語の対応表
- [docs/design.md](docs/design.md): MVP の設計、独自に決めた数値、スキル生成・CPUの仕組み
- [docs/ui.md](docs/ui.md): UI の設計（リアクション・質感・アニメーション・常に動く背景・色の優先度）

## 構成

| パス | 内容 |
| --- | --- |
| `index.html`, `css/`, `js/main.js`, `js/ui/` | 画面（素の HTML / CSS / ES Modules、ビルド不要）。`css/theme.css` が共通の質感、`js/ui/ambient.js`・`speech.js`・`fx.js`・`transition.js` が演出 |
| `js/engine/` | ゲームロジック（DOM非依存。ブラウザとNodeの両方で動く） |
| `js/engine/balance.js` | バランス数値の集約先 |
| `content/extensions.json` | エクステンション（トリンケット相当）の効果定義 |
| `data/` | `scripts/build_data.py` が生成するユニット・エクステンションのデータ |
| `assets/` | `scripts/build_data.py` が mycryptoheroes リポジトリからコピーした画像・音声 |
| `tests/` | エンジンのテスト（`node --test`） |
| `scripts/simulate.mjs` | 自動プレイでクエストを回してバランスを確認するスクリプト |

## 開発

```bash
npm test                     # エンジンのテスト
npm run simulate             # 自動プレイによるバランス確認（周回数とプレイヤーIDを指定可能）
npm run build:data           # data/ と assets/ を再生成（../mycryptoheroes が必要）
python3 scripts/build_data.py /path/to/mycryptoheroes
```

`data/` と `assets/` は生成物ですが、サーバーに置くだけで遊べるようにコミットしています。
アセットの元データは [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) です。

## クレジット・利用条件

- 本作は My Crypto Heroes の**非公式・非営利の二次創作**です。
- ヒーロー・エクステンション・エネミーの画像、背景画像、BGM・SE、エフェクト・カットイン演出の権利は MCH Co., Ltd. に帰属します。利用は[マイクリのデザインガイドライン](https://medium.com/mycryptoheroes/mch-design-guideline-ja-99ff0970ccdc)の範囲に従ってください。
- クリスくん・マインちゃん　ドット絵：こじもこ
- ゲームの仕組みは 参考作を参考にしています。名称・アートは使用していません。

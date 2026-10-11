// タイトル・プレイヤー選択・結果などの画面とモーダル。
// 説明文はヘルプ・詳細モーダルに集約し、通常の画面は最小限の表記にしている。

import { h, img } from "./h.js";
import { extensionIcon, gumAmount, modal, unitCard, unitDetail } from "./components.js";
import { PLAYERS, TREASURES, playerById, treasureById } from "../engine/content.js";
import { START_LIVES, WINS_TO_CLEAR } from "../engine/balance.js";

function playerImg(player, key = "idle", cls = "") {
  return img(player.images[key], `${player.pixelated === false ? "" : "pixel"} ${cls}`, player.name);
}

function closeButton(app) {
  return h("button", { class: "btn modal-close", onClick: () => app.actions.closeModal() }, "閉じる");
}

export function titleScreen(app, { hasSave }) {
  return h(
    "div",
    { class: "screen title-screen", style: { backgroundImage: `url(${app.backgrounds[0]})` } },
    h(
      "div",
      { class: "title-box" },
      h("div", { class: "title-sub" }, "MY CRYPTO HEROES FAN GAME"),
      h("h1", { class: "title-logo" }, h("span", { class: "t1" }, "マイクリ"), h("span", { class: "t2" }, "デッキバトル")),
      h(
        "div",
        { class: "title-chars" },
        PLAYERS.map((p) => h("div", { class: `title-char ${p.id}` }, playerImg(p))),
      ),
      h(
        "div",
        { class: "title-actions" },
        hasSave ? h("button", { class: "btn primary big", onClick: () => app.actions.continueRun() }, "つづきから") : null,
        h("button", { class: `btn big${hasSave ? "" : " primary"}`, onClick: () => app.actions.newGame() }, "はじめから"),
        h("button", { class: "btn", onClick: () => app.actions.showHelp() }, "遊び方"),
      ),
      h("p", { class: "title-note" }, "非公式ファンゲーム"),
    ),
  );
}

export function selectScreen(app) {
  return h(
    "div",
    { class: "screen select-screen", style: { backgroundImage: `url(${app.backgrounds[1]})` } },
    h("h2", { class: "screen-title" }, "プレイヤー選択"),
    h(
      "div",
      { class: "player-select" },
      PLAYERS.map((p) =>
        h(
          "button",
          { class: `player-option ${p.id}`, onClick: () => app.actions.startRun(p.id) },
          h("div", { class: "player-option-art" }, playerImg(p, "select")),
          h(
            "div",
            { class: "player-option-body" },
            h("div", { class: "player-option-name" }, p.name),
            h("div", { class: "player-option-skill" }, p.skillName),
            h("div", { class: "player-option-short" }, p.short),
          ),
        ),
      ),
    ),
    h("button", { class: "btn", onClick: () => app.actions.toTitle() }, "戻る"),
  );
}

export function endScreen(app) {
  const run = app.run;
  const player = playerById(run.playerId);
  const cleared = run.phase === "clear";
  return h(
    "div",
    { class: `screen end-screen ${cleared ? "clear" : "over"}`, style: { backgroundImage: `url(${app.backgrounds[2]})` } },
    h(
      "div",
      { class: "end-box" },
      h("h1", null, cleared ? "クエストクリア！" : "クエスト失敗"),
      h("div", { class: "end-player" }, playerImg(player, cleared ? "win" : "lose")),
      h(
        "div",
        { class: "end-stats" },
        h("div", null, h("span", null, "勝利"), h("b", null, `${run.wins}/${WINS_TO_CLEAR}`)),
        h("div", null, h("span", null, "敗北"), h("b", null, run.losses)),
        h("div", null, h("span", null, "ステージ"), h("b", null, run.stage)),
        h("div", null, h("span", null, "ライフ"), h("b", null, `${Math.max(0, run.lives)}/${START_LIVES}`)),
      ),
      h(
        "div",
        { class: "end-party" },
        run.party.filter(Boolean).map((u) => unitCard(app.db.def(u.defId), { level: u.level, compact: true })),
      ),
      run.extensions.length
        ? h(
            "div",
            { class: "ext-list center" },
            run.extensions.map((id) => extensionIcon(app.db.ext(id))),
          )
        : null,
      h(
        "div",
        { class: "end-actions" },
        h("button", { class: "btn primary big", onClick: () => app.actions.newGame() }, "もう一度"),
        h("button", { class: "btn", onClick: () => app.actions.toTitle() }, "タイトルへ"),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// 選択モーダル（宝箱・エクステンション）
// ---------------------------------------------------------------------------

export function treasureModal(app, ev) {
  return modal(
    ev.reason === "revive" ? "復活！ 宝箱" : "宝箱",
    h(
      "div",
      { class: "choice-row" },
      ev.options.map((id) => {
        const t = treasureById(id);
        return h(
          "button",
          { class: "choice-card treasure", onClick: () => app.actions.chooseTreasure(id) },
          h("div", { class: "choice-art" }, img(t.image, "")),
          h("div", { class: "choice-body" }, h("div", { class: "choice-name" }, t.name), h("p", null, t.short(app.run.stage))),
        );
      }),
    ),
    { className: "choice-modal treasure-modal" },
  );
}

export function extensionModal(app, ev) {
  return modal(
    "エクステンション",
    h(
      "div",
      { class: "choice-row" },
      ev.options.map((id) => {
        const x = app.db.ext(id);
        const owned = app.run.extensions.filter((e) => e === id).length;
        return h(
          "button",
          { class: "choice-card", onClick: () => app.actions.chooseExtension(id) },
          h("div", { class: "choice-art" }, img(x.image, "pixel")),
          h(
            "div",
            { class: "choice-body" },
            h("div", { class: "choice-name" }, x.name, owned ? h("span", { class: "owned-count" }, `×${owned}`) : null),
            h("p", null, x.text),
          ),
        );
      }),
    ),
    { className: "choice-modal extension-modal" },
  );
}

// ---------------------------------------------------------------------------
// 説明用モーダル（ここではテキストで詳しく説明する）
// ---------------------------------------------------------------------------

export function extensionInfoModal(app, id) {
  const x = app.db.ext(id);
  const count = app.run.extensions.filter((e) => e === id).length;
  return modal(
    x.name,
    h(
      "div",
      { class: "ext-info" },
      img(x.image, "pixel big-ext"),
      h("p", null, x.text),
      count > 1 ? h("p", { class: "hint" }, `${count}個所持（効果は重複します）`) : null,
    ),
    { footer: closeButton(app) },
  );
}

export function unitModal(app, defId, unit = null) {
  return modal(null, unitDetail(app.db.def(defId), { unit }), { className: "detail-modal", footer: closeButton(app) });
}

export function playerModal(app) {
  const run = app.run;
  const player = playerById(run.playerId);
  const counts = new Map();
  for (const id of run.extensions) counts.set(id, (counts.get(id) || 0) + 1);
  return modal(
    null,
    h(
      "div",
      { class: "player-info" },
      h(
        "div",
        { class: "player-card" },
        h("div", { class: `player-portrait ${player.id}` }, playerImg(player)),
        h(
          "div",
          null,
          h("div", { class: "player-name" }, player.name),
          h("div", { class: "player-skill" }, `プレイヤースキル「${player.skillName}」`),
          h("p", null, player.text),
        ),
      ),
      h("h3", null, "エクステンション"),
      counts.size
        ? h(
            "ul",
            { class: "ext-detail-list" },
            [...counts.entries()].map(([id, n]) => {
              const x = app.db.ext(id);
              return h(
                "li",
                null,
                img(x.image, "pixel"),
                h("div", null, h("b", null, x.name, n > 1 ? ` ×${n}` : ""), h("p", null, x.text)),
              );
            }),
          )
        : h("p", { class: "hint" }, "合成や宝箱で獲得できます。"),
    ),
    { className: "player-modal", footer: closeButton(app) },
  );
}

export function confirmModal(app, message, onYes) {
  return modal(null, h("p", { class: "confirm-text" }, message), {
    footer: h(
      "div",
      { class: "modal-actions" },
      h("button", { class: "btn danger", onClick: onYes }, "はい"),
      h("button", { class: "btn", onClick: () => app.actions.closeModal() }, "いいえ"),
    ),
  });
}

// ---------------------------------------------------------------------------
// バトル結果
// ---------------------------------------------------------------------------

export function resultPanel(app, result) {
  const run = app.run;
  const player = playerById(run.playerId);
  const won = result.won;
  const rows = [h("div", { class: "result-row" }, h("small", null, "勝利"), h("b", null, `${run.wins}/${WINS_TO_CLEAR}`))];
  if (won) {
    if (result.gumGained) rows.push(h("div", { class: "result-row" }, gumAmount(`+${result.gumGained}`)));
    if (result.buffed) {
      const def = app.db.def(result.buffed.defId);
      rows.push(h("div", { class: "result-row buffed" }, img(def.image, "pixel mini-unit"), h("b", null, `+${result.buffed.value}%`)));
    }
  } else {
    rows.push(
      h(
        "div",
        { class: "result-row lives" },
        h("small", null, "ライフ"),
        h("b", null, `-${result.livesLost}`),
        h("span", null, `→ ${Math.max(0, run.lives)}`),
      ),
    );
    if (result.revived) {
      rows.push(h("div", { class: "result-row revived" }, img("assets/battle-icons/resurrection.png", "mini-icon"), h("b", null, "復活")));
    }
  }
  const phase = run.phase;
  const nextLabel = phase === "clear" ? "クリア！" : phase === "gameover" ? "結果へ" : "次へ";
  return h(
    "div",
    { class: `result-overlay ${won ? "win" : "lose"}` },
    h(
      "div",
      { class: "mch-battle-result-label mch-battle-result-label-enter-active" },
      h("p", { class: "mch-battle-result-label__text" }, won ? "WIN" : "LOSE"),
    ),
    h(
      "div",
      { class: "result-panel" },
      h("div", { class: "result-player" }, playerImg(player, won ? "win" : "lose")),
      h(
        "div",
        { class: "result-body" },
        h("div", { class: "result-stage" }, `ステージ ${result.stage}`),
        h("div", { class: "result-rows" }, rows),
        h("button", { class: "btn primary big", onClick: () => app.actions.next() }, nextLabel),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// ヘルプ（説明はここに集約）
// ---------------------------------------------------------------------------

export function helpModal(app) {
  const section = (title, ...body) => h("section", { class: "help-section" }, h("h3", null, title), ...body);
  const terms = [
    ["ヒーロー", "パーティに編成して戦うユニット。マイクリの偉人ヒーロー。"],
    ["エネミー", "CPUの部隊を構成するユニット。"],
    ["プレイヤー", "クリスくん・マインちゃん・MAIから選ぶ。プレイヤースキルを持つ。"],
    ["クエスト", "1回の挑戦。10勝でクリア、ライフが尽きると失敗。"],
    ["ステージ", "マーケットでの準備→バトルの1サイクル。"],
    ["GUM", "マーケットで使う通貨。ステージ開始時に獲得。"],
    ["マーケット", "ヒーローとマテリアルを購入する場所。↻でラインナップ更新、取置で次のステージに持ち越し。"],
    ["マーケットランク（R）", "ステージごとに上がり、高レアリティのヒーローが出やすくなる。C/U/R/E/L の数字は出現率（%）。"],
    ["合成", "同じヒーローLv1×3→Lv2、Lv2×2→Lv3。合成のたびにエクステンションを獲得。"],
    ["パーティ / 控え", "上の6枠（前衛・中衛・後衛 × 2段）がバトルに参加。下の4枠は控えで待機。"],
    ["パーティHP", "パーティ全体で共有するHP。0になると敗北。"],
    ["チャージ", "スキル発動までの時間（例: 4s）。満タンになるとスキル発動。「開始」はバトル開始時に1回発動。"],
    ["シールド", "HPより先にダメージを受け止める。"],
    ["出血", "0.5秒ごとにスタック数ダメージ、その後1減る。"],
    ["毒", "1秒ごとにスタック数ダメージ。減らない。"],
    ["隣接", "上下左右の枠（斜めは含まない）。"],
    ["エクステンション（EXT）", "所持しているだけで効果を発揮する装備品。重複して効果が上がる。"],
    ["マテリアル", "魔石など。購入した瞬間に効果を発揮。1ステージ1回まで。"],
    ["クリプトエナジー", "ヒーローのLvを1上げる（宝箱から入手）。"],
    ["宝箱", "ステージ3・6・9で3つの報酬から1つを選べる。"],
    ["復活", "ライフが初めて0になったとき、ライフ1で1度だけ復活できる。"],
    ["勢力", "朱雀・青龍・玄武・黄竜・白虎。エクステンションの対象になる。"],
  ];
  return modal(
    "遊び方",
    h(
      "div",
      { class: "help" },
      section(
        "クエストの流れ",
        h(
          "ol",
          null,
          h("li", null, "プレイヤーを選んでクエスト開始。ライフ10でスタート。"),
          h("li", null, "マーケットでヒーローをタップ→もう一度タップ（または「購入」）で購入。"),
          h("li", null, "パーティのヒーローをタップ→別の枠をタップで入れ替え。"),
          h("li", null, "「バトル開始」でエネミー部隊とオートバトル。"),
          h("li", null, "負けるとライフが減る（ステージ1〜2: 1、3〜4: 2、5以降: 3）。"),
          h("li", null, `${WINS_TO_CLEAR}勝でクエストクリア！`),
        ),
      ),
      section(
        "バトルのルール",
        h(
          "ul",
          null,
          h("li", null, "各ヒーローはチャージが溜まるたびにスキルを発動。"),
          h("li", null, "同時発動は シールド → ダメージ → 状態異常 → 回復 の順に解決。"),
          h("li", null, "出血・毒ダメージはシールドに対して15%軽減。"),
          h("li", null, "30秒経つとサドンデス。両陣営に増え続けるダメージ。"),
          h("li", null, "バトル中にヒーローをタップするとスキルを確認できます。"),
        ),
      ),
      section(
        "プレイヤースキル",
        h(
          "ul",
          null,
          PLAYERS.map((p) => h("li", null, `${p.name}「${p.skillName}」：${p.text}`)),
        ),
      ),
      section(
        "用語集",
        h(
          "dl",
          { class: "glossary" },
          terms.map(([t, d]) => [h("dt", null, t), h("dd", null, d)]),
        ),
      ),
      section(
        "宝箱の報酬",
        h(
          "ul",
          null,
          TREASURES.map((t) => h("li", null, `${t.name}：${t.text(app.run?.stage ?? 1)}`)),
        ),
      ),
      section(
        "クレジット",
        h(
          "p",
          { class: "credits" },
          "本作は My Crypto Heroes の非公式二次創作（非営利）です。ヒーロー・エクステンション・エネミー画像、背景、BGM・SE、演出の権利は MCH Co., Ltd. に帰属します。",
          h("br"),
          "クリスくん・マインちゃん　ドット絵：こじもこ",
          h("br"),
          "ゲームの仕組みは 参考作を参考にしています。",
        ),
      ),
    ),
    { className: "help-modal", footer: closeButton(app) },
  );
}

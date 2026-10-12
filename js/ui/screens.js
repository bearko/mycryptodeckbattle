// タイトル・プレイヤー選択・結果などの画面とモーダル。
// 説明文はヘルプ・詳細モーダルに集約し、通常の画面は最小限の表記にしている。
// 文字（ロゴやテロップ）の手前にキャラクターを重ねて、UIを空間の一部として見せる。

import { h, img } from "./h.js";
import { extensionIcon, gumAmount, modal, unitCard, unitDetail } from "./components.js";
import { winGauge } from "./market-view.js";
import { KIND_ICONS, PLAYERS, TREASURES, playerById, treasureById } from "../engine/content.js";
import { ROLES } from "./battle-fx.js";
import { START_LIVES, WINS_TO_CLEAR } from "../engine/balance.js";

function playerImg(player, src, cls = "") {
  return img(src, `${player.pixelated === false ? "" : "pixel"} ${cls}`, player.name);
}

function closeButton(app) {
  return h("button", { class: "btn modal-close", onClick: () => app.actions.closeModal() }, "閉じる");
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// ---------------------------------------------------------------------------
// タイトル
// ---------------------------------------------------------------------------

export function titleScreen(app, { hasSave }) {
  return h(
    "div",
    { class: "screen title-screen" },
    h("div", { class: "ticker top" }, h("span", null, "MY CRYPTO HEROES FAN GAME ✦ DECK BATTLE ✦ AUTO BATTLER ✦ ")),
    h("div", { class: "ticker bottom rev" }, h("span", null, "HEROES ✦ EXTENSIONS ✦ ENEMIES ✦ 10 WINS TO CLEAR ✦ ")),
    h(
      "div",
      { class: "title-stage" },
      h(
        "h1",
        { class: "title-logo" },
        h("span", { class: "t3", "aria-hidden": "true" }, "DECK"),
        h("span", { class: "t0" }, "MY CRYPTO HEROES"),
        h("span", { class: "t1" }, "マイクリ"),
        h("span", { class: "t2" }, "デッキバトル"),
      ),
      h(
        "div",
        { class: "title-chars" },
        PLAYERS.map((p, i) =>
          h(
            "div",
            { class: `title-char ${p.id}`, style: { "--d": `${0.25 + i * 0.12}s`, "--bd": `${-i * 0.7}s` } },
            playerImg(p, pick(p.poses)),
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "title-actions" },
      hasSave ? h("button", { class: "btn primary big enter-up", style: { "--d": "0.5s" }, onClick: () => app.actions.continueRun() }, "つづきから") : null,
      h(
        "button",
        { class: `btn big enter-up${hasSave ? "" : " primary"}`, style: { "--d": "0.58s" }, onClick: () => app.actions.newGame() },
        "はじめから",
      ),
      h("button", { class: "btn enter-up", style: { "--d": "0.66s" }, onClick: () => app.actions.showHelp() }, "遊び方"),
    ),
    h("p", { class: "title-note" }, "UNOFFICIAL FAN GAME"),
  );
}

// ---------------------------------------------------------------------------
// プレイヤー選択（毎回カメラ位置・ポーズを変える）
// ---------------------------------------------------------------------------

export function cameraVariant() {
  return {
    cx: `${pick([-16, -8, 0, 8, 14])}%`,
    cy: `${pick([0, 2, 4])}%`,
    cr: `${pick([-4, -2, 0, 2, 3])}deg`,
    cs: pick([0.94, 1, 1.06, 1.12]),
    band: `${pick([-12, -8, -4, 5, 9])}deg`,
  };
}

export function selectScreen(app) {
  const index = app.ui.selectIndex ?? 0;
  const p = PLAYERS[index];
  const cam = app.ui.selectCam ?? cameraVariant();
  const pose = app.ui.selectPose ?? p.images.select;
  let startX = null;
  const stage = h(
    "div",
    {
      class: "select-stage",
      onPointerdown: (e) => (startX = e.clientX),
      onPointerup: (e) => {
        if (startX === null) return;
        const dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 40) app.actions.selectPlayer(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      },
    },
    h("div", { class: "select-band", style: { "--band": cam.band } }),
    h("div", { class: "select-name-bg" }, p.nameEn.toUpperCase()),
    h(
      "div",
      {
        class: `select-figure ${p.id}`,
        style: { "--cx": cam.cx, "--cy": cam.cy, "--cr": cam.cr, "--cs": cam.cs, "--from": `${(app.ui.selectDir ?? 1) * 40}%` },
      },
      playerImg(p, pose),
    ),
    h(
      "div",
      { class: "select-plate panel" },
      h("div", { class: "p-name" }, p.name),
      h("div", { class: "p-skill" }, p.skillName),
      h("div", { class: "p-short" }, p.short),
    ),
  );
  const screen = h(
    "div",
    { class: "screen select-screen" },
    h("div", { class: "select-head" }, h("h2", null, "プレイヤー選択"), h("small", null, "SELECT PLAYER")),
    stage,
    h(
      "div",
      { class: "select-tabs" },
      PLAYERS.map((q, i) =>
        h(
          "button",
          {
            class: `player-tab ${q.id}${i === index ? " active" : ""}`,
            style: { "--tc": q.color },
            onClick: () => app.actions.selectPlayer(i, i > index ? 1 : -1),
            "aria-label": q.name,
          },
          playerImg(q, q.images.idle),
        ),
      ),
    ),
    h(
      "div",
      { class: "select-actions" },
      h("button", { class: "btn", onClick: () => app.actions.toTitle() }, "戻る"),
      h("button", { class: "btn primary big", onClick: () => app.actions.startRun(p.id) }, "決定"),
    ),
  );
  screen.style.setProperty("--pc", p.color);
  return screen;
}

// ---------------------------------------------------------------------------
// ステージ開始テロップ（帯の手前にキャラクター）
// ---------------------------------------------------------------------------

export function stageTelop(app, info, onDone) {
  const player = playerById(app.run.playerId);
  const el = h(
    "div",
    { class: "stage-telop", onClick: () => onDone() },
    h(
      "div",
      { class: "telop-band" },
      h("span", { class: "t-small" }, "STAGE"),
      h("span", { class: "t-num" }, String(app.run.stage).padStart(2, "0")),
    ),
    h("div", { class: `telop-figure ${player.id}` }, playerImg(player, pick(player.poses))),
    h(
      "div",
      { class: "telop-chips" },
      h("span", { style: { "--d": "0.35s" } }, gumAmount(`+${info.income}`)),
      h("span", { style: { "--d": "0.45s" } }, "R", h("b", null, info.rank)),
      info.treasure ? h("span", { style: { "--d": "0.55s" } }, "宝箱") : null,
    ),
  );
  el.style.setProperty("--player", player.color);
  return el;
}

// ---------------------------------------------------------------------------
// 終了画面
// ---------------------------------------------------------------------------

export function endScreen(app) {
  const run = app.run;
  const player = playerById(run.playerId);
  const cleared = run.phase === "clear";
  return h(
    "div",
    { class: `screen end-screen ${cleared ? "clear" : "over"}` },
    h(
      "div",
      { class: "end-hero" },
      h("div", { class: "end-band" }, h("h1", null, cleared ? "クエストクリア" : "クエスト失敗")),
      h("div", { class: `end-figure ${player.id}` }, playerImg(player, cleared ? player.images.win : player.images.lose)),
    ),
    h(
      "div",
      { class: "end-box panel enter-up", style: { "--d": "0.3s" } },
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
        run.party.filter(Boolean).map((u, i) => unitCard(app.db.def(u.defId), { level: u.level, compact: true, seed: i })),
      ),
      run.extensions.length
        ? h(
            "div",
            { class: "ext-list center" },
            run.extensions.map((id) => extensionIcon(app.db.ext(id))),
          )
        : null,
    ),
    h(
      "div",
      { class: "end-actions enter-up", style: { "--d": "0.45s" } },
      h("button", { class: "btn primary big", onClick: () => app.actions.newGame() }, "もう一度"),
      h("button", { class: "btn", onClick: () => app.actions.toTitle() }, "タイトルへ"),
    ),
  );
}

// ---------------------------------------------------------------------------
// 選択モーダル（宝箱・エクステンション）
// ---------------------------------------------------------------------------

const CHEST_SVG =
  '<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M8 24c0-4.4 3.6-8 8-8h32c4.4 0 8 3.6 8 8v4H8v-4zm0 8h20v6h8v-6h20v20c0 2.2-1.8 4-4 4H12c-2.2 0-4-1.8-4-4V32zm22 4v4h4v-4h-4z"/><path d="M16 16V12c0-2.2 1.8-4 4-4h24c2.2 0 4 1.8 4 4v4h-4v-4H20v4h-4z"/></svg>';

export function treasureModal(app, ev) {
  return modal(
    ev.reason === "revive" ? "復活！ 宝箱" : "宝箱",
    h(
      "div",
      { class: "choice-row" },
      ev.options.map((id, i) => {
        const t = treasureById(id);
        return h(
          "button",
          { class: "choice-card treasure", style: { "--i": i }, onClick: (e) => app.actions.chooseTreasure(id, e.currentTarget) },
          h("div", { class: "choice-art" }, img(t.image, "")),
          h("div", { class: "choice-body" }, h("div", { class: "choice-name" }, t.name), h("p", null, t.short(app.run.stage))),
        );
      }),
    ),
    { className: "choice-modal treasure-modal", header: h("div", { class: "treasure-chest", html: CHEST_SVG }) },
  );
}

export function extensionModal(app, ev) {
  return modal(
    "エクステンション",
    h(
      "div",
      { class: "choice-row" },
      ev.options.map((id, i) => {
        const x = app.db.ext(id);
        const owned = app.run.extensions.filter((e) => e === id).length;
        return h(
          "button",
          { class: "choice-card", style: { "--i": i }, onClick: (e) => app.actions.chooseExtension(id, e.currentTarget) },
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
        h("div", { class: `player-portrait ${player.id}` }, playerImg(player, player.images.idle)),
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

export function menuModal(app) {
  return modal(
    "メニュー",
    h(
      "div",
      { class: "menu-list" },
      h("button", { class: "btn big", onClick: () => app.actions.toggleSound() }, app.audio.muted ? "サウンド OFF" : "サウンド ON"),
      h("button", { class: "btn big", onClick: () => app.actions.showHelp() }, "遊び方"),
      h("button", { class: "btn big danger", onClick: () => app.actions.confirmQuit() }, "タイトルへ"),
    ),
    { className: "menu-modal", footer: closeButton(app) },
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
// バトル結果（テロップの手前にキャラクター）
// ---------------------------------------------------------------------------

export function resultPanel(app, result) {
  const run = app.run;
  const player = playerById(run.playerId);
  const won = result.won;
  const rows = [h("div", { class: "result-row" }, winGauge(run.wins))];
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
        h("span", { class: "num" }, `→ ${Math.max(0, run.lives)}`),
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
    h("div", { class: "result-band" }, h("span", null, won ? "WIN" : "LOSE")),
    h("div", { class: `result-figure ${player.id}` }, playerImg(player, won ? player.images.win : player.images.lose)),
    h(
      "div",
      { class: "result-panel panel" },
      h("div", { class: "result-stage" }, `STAGE ${result.stage}`),
      h("div", { class: "result-rows" }, rows),
      h("button", { class: "btn primary big", onClick: () => app.actions.next() }, nextLabel),
    ),
  );
}

// ---------------------------------------------------------------------------
// ヘルプ（ページめくり。説明はここに集約）
// ---------------------------------------------------------------------------

/** ヘルプの役割の凡例（バトル中の色・アイコンと対応） */
const ROLE_HELP = {
  damage: "敵のパーティHPにダメージ",
  heal: "味方のパーティHPを回復",
  shield: "味方にシールド（先にダメージを受ける）",
  bleed: "敵を出血させる。0.5秒ごとにダメージ、だんだん弱まる",
  poison: "敵を毒にする。1秒ごとにダメージ、弱まらない",
  buff: "隣のヒーローの効果量アップ",
  haste: "隣のヒーローのチャージを進める",
  slow: "敵のチャージを戻す",
  weaken: "敵の一番強いヒーローの効果量ダウン",
};

function helpPages(app) {
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
  const sample = app.db.heroes.find((d) => d.rarity === 3) ?? app.db.heroes[0];
  return [
    {
      tab: "Lv UP",
      body: [
        h("h3", null, "レベルアップ（合成）"),
        h(
          "div",
          { class: "help-figure" },
          [0, 1, 2].map(() => img(sample.image, "pixel")),
          h("span", { class: "arrow" }, "→"),
          h("span", { class: "lv lv2" }, "Lv2"),
        ),
        h(
          "ul",
          null,
          h("li", null, "同じヒーローを3体そろえると、自動で合成されて Lv2 になります。"),
          h("li", null, "Lv2 を2体そろえると Lv3。Lvが上がるとスキルの効果量が2倍・3倍になります。"),
          h("li", null, "ヒーローの下の ◆◆◇ が合成までの進み具合。マーケットで光っていて「Lv2↑」と出ているヒーローは、買うとすぐに合成されます。"),
          h("li", null, "合成するたびにエクステンションを1つ獲得できます。"),
          h("li", null, "宝箱のクリプトエナジーを使うと、1体のLvを直接1つ上げられます（最大Lv4）。"),
        ),
      ],
    },
    {
      tab: "流れ",
      body: [
        h("h3", null, "クエストの流れ"),
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
      ],
    },
    {
      tab: "バトル",
      body: [
        h("h3", null, "バトルのルール"),
        h(
          "ul",
          null,
          h("li", null, "各ヒーローはチャージが溜まるたびにスキルを発動。"),
          h("li", null, "同時発動は シールド → ダメージ → 状態異常 → 回復 の順に解決。"),
          h("li", null, "出血・毒ダメージはシールドに対して15%軽減。"),
          h("li", null, "30秒経つとサドンデス。両陣営に増え続けるダメージ。"),
          h("li", null, "バトル中にヒーローをタップするとスキルを確認できます。"),
        ),
        h("h3", { style: { marginTop: "14px" } }, "役割の色とアイコン"),
        h(
          "p",
          { class: "help-note" },
          "スキルを使ったヒーローは役割の色に光り、対象へ弾や光線を飛ばします。カード左下のアイコンが主な役割です。",
        ),
        h(
          "ul",
          { class: "role-legend" },
          Object.entries(ROLE_HELP).map(([kind, text]) =>
            h(
              "li",
              { style: { "--role": ROLES[kind].color } },
              img(KIND_ICONS[kind], "kind-icon"),
              h("b", null, ROLES[kind].label),
              h("span", null, text),
            ),
          ),
        ),
        h("h3", { style: { marginTop: "14px" } }, "プレイヤースキル"),
        h(
          "ul",
          null,
          PLAYERS.map((p) => h("li", null, `${p.name}「${p.skillName}」：${p.text}`)),
        ),
      ],
    },
    {
      tab: "用語",
      body: [
        h("h3", null, "用語集"),
        h(
          "dl",
          { class: "glossary" },
          terms.map(([t, d]) => [h("dt", null, t), h("dd", null, d)]),
        ),
      ],
    },
    {
      tab: "宝箱",
      body: [
        h("h3", null, "宝箱の報酬"),
        h(
          "ul",
          null,
          TREASURES.map((t) => h("li", null, `${t.name}：${t.text(app.run?.stage ?? 1)}`)),
        ),
      ],
    },
    {
      tab: "クレジット",
      body: [
        h("h3", null, "クレジット"),
        h(
          "p",
          { class: "credits" },
          "本作は My Crypto Heroes の非公式二次創作（非営利）です。ヒーロー・エクステンション・エネミー画像、背景、BGM・SE、演出の権利は MCH Co., Ltd. に帰属します。",
          h("br"),
          "クリスくん・マインちゃん　ドット絵：こじもこ",
          h("br"),
          "ゲームの仕組みは 参考作を参考にしています。",
        ),
      ],
    },
  ];
}

export function helpModal(app) {
  const pages = helpPages(app);
  const index = Math.max(0, Math.min(pages.length - 1, app.ui.helpPage ?? 0));
  const dir = app.ui.helpDir ?? 0;
  const go = (i) => app.actions.helpPage(i);
  let startX = null;
  return modal(
    null,
    h(
      "div",
      {
        class: "help-pages",
        onPointerdown: (e) => (startX = e.clientX),
        onPointerup: (e) => {
          if (startX === null) return;
          const dx = e.clientX - startX;
          startX = null;
          if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
        },
      },
      h("div", { class: `help-page${dir > 0 ? " flip-next" : dir < 0 ? " flip-prev" : ""}` }, pages[index].body),
    ),
    {
      className: "help-modal",
      header: h(
        "div",
        { class: "help-tabs" },
        pages.map((p, i) => h("button", { class: `help-tab${i === index ? " active" : ""}`, onClick: () => go(i) }, p.tab)),
      ),
      footer: h(
        "div",
        { class: "help-nav" },
        h("button", { class: "btn small", disabled: index === 0 ? true : null, onClick: () => go(index - 1) }, "◀"),
        h("span", { class: "page-no" }, `${index + 1} / ${pages.length}`),
        h("button", { class: "btn small", disabled: index === pages.length - 1 ? true : null, onClick: () => go(index + 1) }, "▶"),
        h("button", { class: "btn", onClick: () => app.actions.closeModal() }, "閉じる"),
      ),
    },
  );
}

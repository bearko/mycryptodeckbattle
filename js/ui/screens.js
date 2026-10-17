// タイトル・プレイヤー選択・結果などの画面とモーダル。
// 説明文はヘルプ・詳細モーダルに集約し、通常の画面は最小限の表記にしている。
// 文字（ロゴやテロップ）の手前にキャラクターを重ねて、UIを空間の一部として見せる。

import { h, img } from "./h.js";
import { extensionIcon, factionBadge, gumAmount, levelStars, modal, rarityBadge, unitCard, unitDetail } from "./components.js";
import { winGauge } from "./market-view.js";
import { COLUMN_NAMES, KIND_ICONS, PLAYERS, TREASURES, playerById, treasureById } from "../engine/content.js";
import { ROLES, mainKind } from "./battle-fx.js";
import { PARTY_COLS, START_LIVES, WINS_TO_CLEAR } from "../engine/balance.js";
import { effectText, triggerLabel } from "../engine/units.js";
import { runGoal } from "../engine/run.js";
import { areaById, stageLabel } from "../engine/world.js";

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

export function titleScreen(app, { hasSave, rta = false }) {
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
        { class: `btn big enter-up story-start${hasSave ? "" : " primary"}`, style: { "--d": "0.58s" }, onClick: () => app.actions.openStory() },
        "ストーリー",
      ),
      h(
        "div",
        { class: "title-sub-actions enter-up", style: { "--d": "0.66s" } },
        h("button", { class: "btn", onClick: () => app.actions.newGame() }, "フリーバトル"),
        // bearko.games 共通基盤の RTA（SDK が読めたときだけ。docs/platform.md）
        rta ? h("button", { class: "btn", onClick: () => app.actions.openRta() }, "RTA") : null,
        h("button", { class: "btn", onClick: () => app.actions.showHelp() }, "遊び方"),
      ),
      // bearko.games の総合ランキングへ（MyCryptoPortfolio#29。docs/platform.md）。遊んでいる画面を失わないよう新しいタブで
      h(
        "a",
        { class: "title-platform enter-up", style: { "--d": "0.74s" }, href: "https://bearko.games/score/?game=deckbattle", target: "_blank", rel: "noopener" },
        "bearko.games の総合ランキング ↗",
      ),
    ),
    h("p", { class: "title-note" }, "UNOFFICIAL FAN GAME"),
    h(
      "button",
      {
        class: `icon-btn title-sound${app.audio.muted ? " off" : ""}`,
        "aria-label": app.audio.muted ? "サウンドをオンにする" : "サウンドをオフにする",
        onClick: () => app.actions.toggleSound(),
      },
      h("span", { class: "speaker", html: app.audio.muted ? SPEAKER_OFF : SPEAKER_ON }),
    ),
  );
}

const SPEAKER_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SPEAKER_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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
    info.boss
      ? h("div", { class: "telop-band boss" }, h("span", { class: "t-small" }, "WARNING"), h("span", { class: "t-num" }, "RAID BOSS"))
      : info.supply
        ? h("div", { class: "telop-band supply" }, h("span", { class: "t-small" }, "REST"), h("span", { class: "t-num" }, "SUPPLY"))
      : h(
          "div",
          { class: "telop-band" },
          h("span", { class: "t-small" }, app.run.story ? "WAVE" : "STAGE"),
          h("span", { class: "t-num" }, String(app.run.story ? app.run.wins + 1 : app.run.stage).padStart(2, "0")),
        ),
    h("div", { class: `telop-figure ${player.id}` }, playerImg(player, pick(player.poses))),
    h(
      "div",
      { class: "telop-chips" },
      h("span", { style: { "--d": "0.35s" } }, gumAmount(`+${info.income}`)),
      h("span", { style: { "--d": "0.45s" } }, "R", h("b", null, info.rank)),
      info.treasure ? h("span", { style: { "--d": "0.55s" } }, "宝箱") : null,
      info.label ? h("span", { style: { "--d": "0.55s" } }, info.label) : null,
    ),
  );
  el.style.setProperty("--player", player.color);
  if (info.boss) el.classList.add("boss");
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
    ev.reason === "revive" ? "復活！ 宝箱" : ev.reason === "supply" ? "補給: 宝箱" : ev.reason === "elite" ? "強敵を倒した宝箱" : "宝箱",
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
      app.run?.story ? h("button", { class: "btn big danger", onClick: () => app.actions.confirmRetreat() }, "ステージをやめる") : null,
      h("button", { class: "btn big danger", onClick: () => app.actions.confirmQuit() }, "タイトルへ"),
    ),
    { className: "menu-modal", footer: closeButton(app) },
  );
}

/** タイトルの「RTA」：2 つのレギュレーションから選ぶ（共通基盤 SPEC-001 6.11） */
export function rtaModal(app) {
  const choice = (title, note, onClick) =>
    h("button", { class: "btn big rta-choice", onClick }, h("b", null, title), h("small", null, note));
  return modal(
    "RTA",
    h(
      "div",
      { class: "menu-list rta-list" },
      choice("近代・日本の制覇まで", "RTA 用の新しいストーリー（いまのストーリーはそのまま）。1-1 の出撃から計測", () => app.actions.startRtaNode1()),
      choice("10 勝でクリア", "フリーバトル。プレイヤーを選んだときから計測", () => app.actions.startRtaQuest()),
      h("p", { class: "rta-note" }, "戦闘は ×4 固定（SKIP は使えます）。経過時間は画面の下に出ます。タイトルに戻ると中断します"),
    ),
    { className: "menu-modal", footer: closeButton(app) },
  );
}

export function confirmModal(app, message, onYes, { yes = "はい", no = "いいえ", onNo = null } = {}) {
  return modal(null, h("p", { class: "confirm-text" }, message), {
    footer: h(
      "div",
      { class: "modal-actions" },
      h("button", { class: onNo ? "btn primary" : "btn danger", onClick: onYes }, yes),
      h("button", { class: "btn", onClick: onNo ?? (() => app.actions.closeModal()) }, no),
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
  const rows = [
    h("div", { class: "result-row" }, run.story ? winGauge(run.wins, runGoal(run), "ウェーブ", { boss: Boolean(run.story.boss) }) : winGauge(run.wins)),
  ];
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
  const story = run.story;
  const nextLabel = phase === "clear" ? (story ? "ステージクリア！" : "クリア！") : phase === "gameover" ? (story ? "撤退…" : "結果へ") : "次へ";
  return h(
    "div",
    { class: `result-overlay ${won ? "win" : "lose"}` },
    h("div", { class: "result-band" }, h("span", null, won ? "WIN" : "LOSE")),
    h("div", { class: `result-figure ${player.id}` }, playerImg(player, won ? player.images.win : player.images.lose)),
    h(
      "div",
      { class: "result-panel panel" },
      h(
        "div",
        { class: "result-stage" },
        story ? `${stageLabel(areaById(story.areaId), story.index, story.lane)} · WAVE ${run.wins}/${runGoal(run)}` : `STAGE ${result.stage}`,
      ),
      h("div", { class: "result-rows" }, rows),
      reviewRows(app, app.battleView?.battle),
      h("button", { class: "btn primary big", onClick: () => app.actions.next() }, nextLabel),
    ),
  );
}

// ---------------------------------------------------------------------------
// 振り返り（結果画面で両パーティのヒーローをタップすると、そのバトルでのスキルと活躍を確認できる）
// ---------------------------------------------------------------------------

/** 前衛→中衛→後衛の順に並べる */
const byLane = (a, b) => (a.slot % PARTY_COLS) - (b.slot % PARTY_COLS) || a.slot - b.slot;

function mvpSlot(side) {
  if (!side.fighters.length) return null;
  return side.fighters.reduce((a, c) => (c.contribution > a.contribution ? c : a)).slot;
}

function reviewRows(app, battle) {
  if (!battle) return null;
  return h(
    "div",
    { class: "review" },
    [1, 0].map((index) => {
      const side = battle.sides[index];
      const mvp = mvpSlot(side);
      return h(
        "div",
        { class: `review-row ${index === 0 ? "player" : "enemy"}` },
        h("span", { class: "review-label" }, index === 0 ? "自分" : "相手"),
        h(
          "div",
          { class: "review-units" },
          side.fighters
            .slice()
            .sort(byLane)
            .map((f) => {
              const kind = mainKind(f);
              return h(
                "button",
                {
                  class: `review-unit r${f.rarity}`,
                  style: { "--role": ROLES[kind].color },
                  "aria-label": `${f.name}のスキル`,
                  onClick: () => app.actions.showFighter(index, f.slot),
                },
                img(f.image, `pixel${index === 1 ? " flip" : ""}`, f.name),
                h("span", { class: `lv lv${f.level}` }, `Lv${f.level}`),
                img(KIND_ICONS[kind], "review-kind"),
                f.slot === mvp && f.contribution > 0 ? h("span", { class: "mvp" }, "MVP") : null,
              );
            }),
        ),
      );
    }),
  );
}

const formatValue = (kind, v) => (kind === "haste" || kind === "slow" ? v.toFixed(1) : Math.round(v));

/** 振り返り用の詳細: バトルでの最終値（エクステンション・強化込み）と活躍 */
export function fighterModal(app, battle, sideIndex, slot, onClose) {
  const side = battle.sides[sideIndex];
  const f = side.fighters.find((x) => x.slot === slot);
  const def = app.db.def(f.defId);
  const isEnemy = sideIndex === 1;
  const multPct = Math.round((f.mult - 1) * 100);
  const body = h(
    "div",
    { class: "unit-detail review-detail" },
    h(
      "div",
      { class: "detail-head" },
      h("div", { class: `detail-art r${def.rarity}` }, img(def.image, `pixel${isEnemy ? " flip" : ""}`, def.name)),
      h(
        "div",
        { class: "detail-title" },
        h("div", { class: "detail-name" }, def.name, levelStars(f.level)),
        h(
          "div",
          { class: "detail-badges" },
          h("span", { class: `side-chip ${isEnemy ? "enemy" : "player"}` }, isEnemy ? "相手" : "自分"),
          f.rotation ? null : h("span", { class: "lane-chip" }, COLUMN_NAMES[f.slot % PARTY_COLS]),
          f.rotation ? h("span", { class: "boss-chip" }, "RAID BOSS") : rarityBadge(def.rarity),
          def.faction ? factionBadge(def.faction) : null,
          f.slot === mvpSlot(side) && f.contribution > 0 ? h("span", { class: "mvp" }, "MVP") : null,
        ),
        h(
          "div",
          { class: "detail-stats" },
          h("span", null, f.cd ? `チャージ ${f.cd}秒` : "パッシブのみ"),
          h("span", null, `発動 ${f.casts}回`),
          h("span", null, `活躍度 ${Math.round(f.contribution)}`),
        ),
        multPct ? h("div", { class: `detail-notes${multPct < 0 ? " down" : ""}` }, `バトル中の効果量 ${multPct > 0 ? "+" : ""}${multPct}%`) : null,
      ),
    ),
    f.rotation ? bossRotation(f) : h(
      "div",
      { class: "skill-block" },
      h("div", { class: "skill-name" }, def.skill_name),
      h(
        "ul",
        { class: "skill-lines" },
        f.effects.map((e) =>
          h(
            "li",
            { class: `skill-line kind-${e.kind}` },
            h("span", { class: `trigger trigger-${e.trigger}` }, triggerLabel(e.trigger, f.cd)),
            img(KIND_ICONS[e.kind], "kind-icon"),
            h("span", { class: "skill-text" }, effectText(e.kind, formatValue(e.kind, e.value))),
            f.multicast > 1 && e.trigger === "charge" ? h("b", { class: "multicast-note" }, `×${f.multicast}`) : null,
          ),
        ),
      ),
    ),
    h("p", { class: "merge-rule" }, "このバトルでの数値（エクステンション・Lvを反映）。活躍度はダメージ・回復・シールドなどの合計です。"),
    h(
      "details",
      { class: "source-text" },
      h("summary", null, "元のスキル（MCH）"),
      h("p", null, def.skills ? def.skills.map((k) => `${k.name}: ${k.text}`).join("\n") : def.source_text),
    ),
  );
  return modal(null, body, {
    className: "detail-modal review-modal",
    footer: h("button", { class: "btn modal-close", onClick: onClose }, "閉じる"),
  });
}

/** レイドボスのスキル（順番に使う。大技に印） */
function bossRotation(f) {
  return h(
    "div",
    { class: "skill-block boss-rotation" },
    f.rotation.map((k, i) =>
      h(
        "div",
        { class: `rotation-skill${k.final ? " final" : ""}` },
        h("div", { class: "skill-name" }, h("span", { class: "num" }, `${i + 1}`), k.name, k.final ? h("span", { class: "boss-chip" }, "大技") : null),
        h(
          "ul",
          { class: "skill-lines" },
          k.effects.map((e) =>
            h(
              "li",
              { class: `skill-line kind-${e.kind}` },
              h("span", { class: "trigger trigger-charge" }, `チャージ${k.cd}秒`),
              img(KIND_ICONS[e.kind], "kind-icon"),
              h("span", { class: "skill-text" }, effectText(e.kind, formatValue(e.kind, e.value))),
            ),
          ),
        ),
      ),
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
    ["クエスト", "フリーバトルの1回の挑戦。10勝でクリア、ライフが尽きると失敗。"],
    ["ノード", "ストーリーの行き先。時代（近代・近世・中世・古代）×地域。ステージが10個（近代・日本は3個）、最後のステージにレイドボス。"],
    ["繰り越し", "ノードの中では、ステージをクリアしたチーム（ヒーロー・Lv・エクステンション・残りのGUM）のまま次のステージへ進む。負けたらそのステージの最初から。「作り直す」でノードの最初のステージから新しいチーム。後半のステージほどエネミーが強い。"],
    ["ルート", "ノードの X-5〜X-9 は3つの道（A・B・C）に分かれる。いまのステージから線でつながったステージへ進める。地形・エネミーの傾向とパーティの相性（◎ 2体以上 / ○ 1体 / － いない）を見て選ぶ。"],
    ["強敵", "エネミーの効果量・HP +30% のステージ。クリアすると次のステージの最初に宝箱。"],
    ["補給", "バトルのないステージ。宝箱を1つ選び、マーケットで買い物をして「出発」。"],
    ["特異点", "特別ステージ。ノードをクリアすると地図に現れる、歴史がねじれた場所。3ステージの奥に強力なボス（yamap・闇魚王・魔王ファオ）。仲間・パーツは出ない。"],
    ["地形", "そのステージのバトルで両陣営に効く（毒・出血・回復・ダメージなどの効果量アップ、前衛・後衛アップ）。勢力の地はその勢力のヒーローだけ（エネミーには勢力がない）。"],
    ["ウェーブ", "ストーリーのステージの1戦。決まった数のウェーブを勝ち抜くとステージクリア（ライフ3）。"],
    ["レイドボス", "ノードの最終ステージの最後のウェーブに出る大きなエネミー。スキルを順番に使い、大技（FINAL）は予告される。倒すとパーツ。"],
    ["デッキ", "ステージに連れて行くヒーロー（最大8種類、Common か Uncommon を1体以上）。マーケットにはデッキのヒーローだけが並ぶ。マーケットのランクで決まったレアリティ（以上）のヒーローがデッキにいないと、その枠は空になる（近代・日本以外）。"],
    ["タイムマシン", "マインの発明（合体ロボ）。ノードをクリアするとパーツが1つ。そろえて改良すると、行ける時代が増える。同じ時代のほかの国は、その時代の最初のノードをクリアすると開く。"],
    ["ステージ", "マーケットでの準備→バトルの1サイクル。"],
    ["GUM", "マーケットで使う通貨。ステージ開始時に獲得。"],
    ["マーケット", "ヒーローとマテリアルを購入する場所。↻でラインナップ更新。南京錠をタップすると1枠ずつ取り置きでき、更新しても次のステージでも残る（GUMが足りなくても取り置ける）。"],
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
    ["宝箱", "ステージ3・6・9で3つの報酬から1つを選べる（フリーバトルのみ）。"],
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
          h("li", null, `${WINS_TO_CLEAR}勝でクエストクリア！（フリーバトル）`),
          h("li", null, "ストーリーでは、ステージのウェーブをすべて勝ち抜くとクリア。ヒーローが仲間になり、チームは次のステージへ繰り越し。ノードの最後のレイドボスを倒すと、タイムマシンのパーツが手に入る。"),
          h("li", null, "ステージ選択では、選んでいるステージをもう一度タップすると出撃。"),
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
          h("li", null, "盤面は手前が自分、奥が敵。中央線に近い列から 前衛・中衛・後衛（マーケットの枠の列と同じ）。"),
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
          "シールドのアイコンと、毒・出血・斬撃のエフェクト素材は本作のオリジナルです。",
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

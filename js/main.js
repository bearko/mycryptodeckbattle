// アプリ本体: 画面遷移とプレイヤー操作をエンジンにつなぎ、操作ごとの演出を出す。

import { createDb } from "./engine/units.js";
import * as Run from "./engine/run.js";
import { moveUnit, allUnits } from "./engine/roster.js";
import { reroll, toggleLock, effectiveRank } from "./engine/market.js";
import { randomSeed, withRng } from "./engine/rng.js";
import { battleSummary, runBattle } from "./engine/battle.js";
import { PLAYERS, playerById } from "./engine/content.js";
import { TREASURE_STAGES, stageIncome } from "./engine/balance.js";
import { audio } from "./ui/audio.js";
import { clearRun, loadRun, loadSettings, saveRun, saveSettings } from "./ui/storage.js";
import { clear, h } from "./ui/h.js";
import { toast } from "./ui/components.js";
import { marketScreen } from "./ui/market-view.js";
import { BattleView } from "./ui/battle-view.js";
import { initAmbient } from "./ui/ambient.js";
import { wipe } from "./ui/transition.js";
import { speech } from "./ui/speech.js";
import { errorKind, line } from "./ui/lines.js";
import { burst, centerOfRect, coins, confetti, countUp, dissolve, flyGhost, installRipple, pop } from "./ui/fx.js";
import {
  cameraVariant,
  confirmModal,
  endScreen,
  extensionInfoModal,
  extensionModal,
  helpModal,
  menuModal,
  playerModal,
  resultPanel,
  selectScreen,
  stageTelop,
  titleScreen,
  treasureModal,
  unitModal,
} from "./ui/screens.js";

const root = document.getElementById("app");
const overlay = document.getElementById("overlay");
let ambient = null;

const app = {
  db: null,
  run: null,
  screen: "title",
  backgrounds: [],
  settings: loadSettings(),
  audio,
  ui: { selected: null, modal: null, flash: null, arriving: null, deal: false, lastGum: null, treasureKey: null },
  battleView: null,
  saveSettings() {
    saveSettings({ ...loadSettings(), ...app.settings, muted: audio.muted });
  },
};

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function save() {
  if (app.run) saveRun(app.run);
}

function background(offset = 0) {
  const list = app.backgrounds;
  return new URL(list[((app.run?.stage ?? 0) + offset) % list.length], document.baseURI).href;
}

function player() {
  return app.run ? playerById(app.run.playerId) : PLAYERS[app.ui.selectIndex ?? 0];
}

// ---------------------------------------------------------------------------
// セリフ（吹き出し）
// ---------------------------------------------------------------------------

function avatarEl() {
  return root.querySelector(".hud-avatar");
}

function setTalking(on) {
  app.ui.talking = on;
  const p = player();
  const el = avatarEl();
  if (!el) return;
  el.classList.toggle("talking", on);
  const im = el.querySelector("img");
  if (im) im.src = on ? p.images.talk : p.images.idle;
}

/** プレイヤーキャラクターに喋らせる。anchor を省略するとHUDのアイコンから */
function say(kind, vars = {}, { tone = "", anchor = null, text = null } = {}) {
  const p = player();
  const msg = text ?? line(p.id, kind, vars);
  if (!msg) return;
  const target = anchor ?? avatarEl();
  if (!target) return toast(msg, tone === "error" ? "error" : "");
  speech.say(msg, target, { tone, color: p.color, onTalk: anchor ? null : setTalking });
}

function sayError(message) {
  const kind = errorKind(message);
  if (kind) say(kind, {}, { tone: "error" });
  else say(null, {}, { tone: "error", text: message });
}

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------

function currentModal() {
  if (app.ui.modal) return app.ui.modal();
  if (app.screen === "market" && app.run && !app.ui.holdModal) {
    const ev = app.run.pending[0];
    if (ev?.type === "treasure") return treasureModal(app, ev);
    if (ev?.type === "extension") return extensionModal(app, ev);
  }
  return null;
}

function render() {
  if (app.screen === "battle") return;
  clear(root);
  let screen;
  switch (app.screen) {
    case "select":
      screen = selectScreen(app);
      break;
    case "market":
      screen = marketScreen(app);
      break;
    case "end":
      screen = endScreen(app);
      break;
    default:
      screen = titleScreen(app, { hasSave: Boolean(validSave()) });
  }
  screen.classList.toggle("intro", Boolean(app.ui.intro));
  root.append(screen);
  const modal = currentModal();
  if (modal) root.append(modal);
  afterRender();
}

/** 描画後の演出（GUMのカウント、口パク状態の引き継ぎ、宝箱の紙吹雪） */
function afterRender() {
  app.ui.deal = false;
  app.ui.intro = false;
  if (app.screen !== "market" || !app.run) return;
  const gumEl = root.querySelector(".hud-gum .n");
  if (app.ui.lastGum !== null && app.ui.lastGum !== app.run.gum) countUp(gumEl, app.ui.lastGum, app.run.gum);
  app.ui.lastGum = app.run.gum;
  if (app.ui.talking) setTalking(true);
  const ev = app.run.pending[0];
  const key = ev?.type === "treasure" ? `${app.run.stage}-${ev.reason}` : null;
  if (key && key !== app.ui.treasureKey && !app.ui.telopActive) {
    app.ui.treasureKey = key;
    audio.se("treasure");
    confetti();
    setTimeout(() => say(ev.reason === "revive" ? "revive" : "treasure"), 300);
  }
}

function validSave() {
  const run = loadRun();
  if (!run || run.version !== Run.RUN_VERSION) return null;
  if (run.phase === "clear" || run.phase === "gameover") return null;
  if (!Run.usesKnownUnits(run, app.db)) return null;
  return run;
}

function flashAt(pos, levelUp = false) {
  const flash = { ...pos, levelUp };
  app.ui.flash = flash;
  setTimeout(() => {
    if (app.ui.flash === flash) {
      app.ui.flash = null;
      root.querySelectorAll(".slot.flash, .slot.levelup").forEach((el) => el.classList.remove("flash", "levelup"));
    }
  }, 1400);
}

/** 画面をワイプで切り替える */
function go(screen, { bg = null, mood = screen, accent = null } = {}) {
  speech.dismiss();
  return wipe(
    () => {
      app.screen = screen;
      app.ui.intro = true;
      if (bg) ambient.setBackground(bg, { mood, accent: accent ?? player()?.color });
      render();
    },
    { accent: accent ?? "#ffd23f" },
  );
}

function slotRectByUid(uid) {
  const el = root.querySelector(`.slot[data-uid="${uid}"] .unit-img`) ?? root.querySelector(`.slot[data-uid="${uid}"]`);
  return el?.getBoundingClientRect() ?? null;
}

function slotElAt(zone, index) {
  return root.querySelector(`.slot[data-zone="${zone}"][data-index="${index}"]`);
}

/** ステージ開始: マーケットに入り、テロップのあとセリフ */
async function enterStage() {
  app.ui.selected = null;
  app.ui.deal = true;
  app.ui.lastGum = app.run.gum;
  app.ui.telopActive = true;
  audio.playBgm("bgm_market");
  await go("market", { bg: background(3), mood: "market", accent: player().color });
  const info = {
    income: stageIncome(app.run.stage),
    rank: effectiveRank(app.run),
    treasure: TREASURE_STAGES.includes(app.run.stage),
  };
  const telop = stageTelop(app, info, () => close());
  overlay.append(telop);
  audio.se("buff", 0.5);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    telop.classList.add("leave");
    setTimeout(() => {
      telop.remove();
      app.ui.telopActive = false;
      render();
      if (!app.run.pending.length) {
        const hasUnits = allUnits(app.run).length > 0;
        say(hasUnits && Math.random() < 0.35 ? "hint" : "stage", { n: app.run.stage });
      }
    }, 280);
  };
  setTimeout(close, 1700);
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

/** 購入の前に、飛ばす元の位置（マーケット枠と、合成相手の位置）を覚えておく */
function captureBuy(index) {
  const offer = app.run.market.offers[index];
  const el = root.querySelector(`[data-offer="${index}"] .unit-img, [data-offer="${index}"] .material-img`);
  const from = el?.getBoundingClientRect() ?? null;
  const partners =
    offer?.type === "hero"
      ? allUnits(app.run)
          .filter(({ unit }) => unit.defId === offer.defId)
          .map(({ unit }) => slotRectByUid(unit.uid))
          .filter(Boolean)
      : [];
  return { offer, from, partners, image: offer?.type === "hero" ? app.db.def(offer.defId).image : null };
}

function animateBuy(res, cap) {
  const pName = (uid) => app.db.def(allUnits(app.run).find((u) => u.unit.uid === uid)?.unit.defId ?? "")?.name;
  if (res.merges?.length) {
    const last = res.merges[res.merges.length - 1];
    const target = slotElAt(last.zone, last.index);
    const to = target?.getBoundingClientRect();
    const flights = [cap.from, ...cap.partners].filter(Boolean).map((r, i) => flyGhost(cap.image, r, to, { duration: 460, delay: i * 50 }));
    app.ui.holdModal = true;
    Promise.all(flights).then(() => {
      app.ui.arriving = null;
      target?.classList.remove("arriving");
      flashAt({ zone: last.zone, index: last.index }, true);
      target?.classList.add("levelup");
      if (to) burst(centerOfRect(to).x, centerOfRect(to).y, { count: 18, spread: 90 });
      audio.se("merge");
      say("merge", { name: app.db.def(last.defId).name, lv: last.level }, { tone: "good" });
      // LV UP の演出を見せてからエクステンション選択を出す
      setTimeout(() => {
        app.ui.holdModal = false;
        if (app.screen === "market") render();
      }, 1100);
    });
    return;
  }
  if (res.unit) {
    const target = root.querySelector(`.slot[data-uid="${res.unit.uid}"]`);
    const to = target?.getBoundingClientRect();
    flyGhost(cap.image, cap.from, to, { duration: 420 }).then(() => {
      app.ui.arriving = null;
      target?.classList.remove("arriving");
      pop(target);
      if (to) burst(centerOfRect(to).x, centerOfRect(to).y, { count: 10, spread: 50, color: player().color });
    });
    if (!mergeTipShown()) say("hint");
    else say("buy", { name: pName(res.unit.uid) ?? "" });
    return;
  }
  if (res.material) {
    const m = res.material;
    if (m.target) say("target");
    else {
      const dest = m.id === "garuda" ? root.querySelector(".rank-chip") : root.querySelector(".party-hp");
      flyGhost(m.image, cap.from, dest?.getBoundingClientRect(), { pixel: false, duration: 480 }).then(() => pop(dest));
      say("material");
    }
  }
}

const TIP_KEY = "mcdb.tip.merge";
function mergeTipShown() {
  try {
    if (localStorage.getItem(TIP_KEY)) return true;
    localStorage.setItem(TIP_KEY, "1");
  } catch {
    return true;
  }
  return false;
}

const actions = {
  newGame() {
    app.ui.modal = null;
    app.ui.selectIndex = app.ui.selectIndex ?? 0;
    app.ui.selectCam = cameraVariant();
    app.ui.selectPose = null;
    app.ui.selectDir = 1;
    go("select", { bg: app.backgrounds.length ? new URL(app.backgrounds[1], document.baseURI).href : null, mood: "select" }).then(() =>
      setTimeout(() => sayOnSelect(), 300),
    );
  },
  selectPlayer(i, dir = 1) {
    const n = PLAYERS.length;
    const next = ((i % n) + n) % n;
    if (next === app.ui.selectIndex && i === next) return;
    app.ui.selectIndex = next;
    app.ui.selectDir = dir;
    app.ui.selectCam = cameraVariant();
    const p = PLAYERS[next];
    app.ui.selectPose = p.poses[Math.floor(Math.random() * p.poses.length)];
    ambient.setBackground(null, { accent: p.color, mood: "select" });
    speech.dismiss();
    render();
    audio.se("buy", 0.4);
    setTimeout(() => sayOnSelect(), 260);
  },
  continueRun() {
    const run = validSave();
    if (!run) return actions.newGame();
    app.run = run;
    if (run.phase === "battle") run.phase = "market";
    if (run.phase === "result") Run.advance(run, app.db);
    save();
    enterStage();
  },
  startRun(playerId) {
    app.run = Run.newRun(app.db, { playerId, seed: randomSeed() });
    app.ui.treasureKey = null;
    save();
    enterStage();
  },
  toTitle() {
    app.ui.modal = null;
    app.run = null;
    audio.playBgm("bgm_market");
    go("title", { bg: new URL(app.backgrounds[0], document.baseURI).href, mood: "title", accent: "#ffd23f" });
  },
  showMenu() {
    app.ui.modal = () => menuModal(app);
    render();
  },
  confirmQuit() {
    app.ui.modal = () => confirmModal(app, "タイトルに戻りますか？（「つづきから」で再開できます）", () => actions.toTitle());
    render();
  },
  showHelp() {
    app.ui.helpPage = app.ui.helpPage ?? 0;
    app.ui.helpDir = 0;
    app.ui.modal = () => helpModal(app);
    render();
  },
  helpPage(i) {
    const prev = app.ui.helpPage ?? 0;
    if (i === prev || i < 0 || i > 5) return;
    app.ui.helpDir = i > prev ? 1 : -1;
    app.ui.helpPage = i;
    render();
  },
  showPlayer() {
    app.ui.modal = () => playerModal(app);
    render();
  },
  showUnit(defId, pos = null) {
    const unit = pos ? app.run[pos.zone][pos.index] : null;
    app.ui.modal = () => unitModal(app, defId, unit);
    render();
  },
  showExtension(id) {
    app.ui.modal = () => extensionInfoModal(app, id);
    render();
  },
  closeModal() {
    app.ui.modal = null;
    render();
  },
  toggleSound() {
    audio.unlock();
    audio.toggle();
    if (!audio.muted && app.screen === "market") audio.playBgm("bgm_market", true);
    render();
  },

  clickSlot(zone, index) {
    const run = app.run;
    const ev = run.pending[0];
    if (ev?.type === "target") {
      const res = Run.applyTarget(run, app.db, zone, index);
      if (!res.ok) return sayError(res.error);
      const levelUp = ev.id === "ce";
      audio.se("merge");
      flashAt({ zone, index }, levelUp);
      save();
      render();
      const r = slotElAt(zone, index)?.getBoundingClientRect();
      if (r) burst(centerOfRect(r).x, centerOfRect(r).y, { count: 16, spread: 80 });
      if (levelUp) say("merge", { name: app.db.def(res.unit.defId).name, lv: res.unit.level }, { tone: "good" });
      else say("boost");
      return;
    }
    const sel = app.ui.selected;
    const unit = run[zone][index];
    if (sel?.type === "unit") {
      if (sel.zone === zone && sel.index === index) app.ui.selected = null;
      else {
        const from = slotElAt(sel.zone, sel.index)?.getBoundingClientRect();
        const to = slotElAt(zone, index)?.getBoundingClientRect();
        const moving = run[sel.zone][sel.index];
        const other = run[zone][index];
        moveUnit(run, sel, { zone, index });
        app.ui.selected = null;
        save();
        render();
        // 入れ替えたカードをすべらせる
        const a = moving && slotElAt(zone, index);
        const b = other && slotElAt(sel.zone, sel.index);
        if (a && from && to) a.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.25,1.1)" });
        if (b && from && to) b.animate([{ transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.25,1.1)" });
        return;
      }
    } else if (sel?.type === "offer") {
      return actions.buy(sel.index, unit ? null : { zone, index });
    } else if (unit) {
      app.ui.selected = { type: "unit", zone, index };
    }
    render();
  },
  clickOffer(index) {
    const sel = app.ui.selected;
    if (!app.run.market.offers[index]) return;
    if (sel?.type === "offer" && sel.index === index) return actions.buy(index);
    app.ui.selected = { type: "offer", index };
    render();
  },
  buy(index, target = null) {
    const cap = captureBuy(index);
    const res = Run.buy(app.run, app.db, index);
    if (!res.ok) {
      sayError(res.error);
      return render();
    }
    audio.se("buy");
    if (res.unit && target && !app.run[target.zone][target.index]) {
      const found = allUnits(app.run).find(({ unit }) => unit.uid === res.unit.uid);
      if (found) moveUnit(app.run, { zone: found.zone, index: found.index }, target);
    }
    const last = res.merges?.[res.merges.length - 1];
    app.ui.arriving = new Set([last ? last.uid : res.unit?.uid].filter(Boolean));
    if (last) app.ui.holdModal = true;
    app.ui.selected = null;
    save();
    render();
    animateBuy(res, cap);
  },
  sell(zone, index) {
    const unit = app.run[zone][index];
    const rect = slotElAt(zone, index)?.querySelector(".unit-img")?.getBoundingClientRect();
    const res = Run.sell(app.run, app.db, zone, index);
    if (!res.ok) return sayError(res.error);
    audio.se("sell");
    app.ui.selected = null;
    save();
    render();
    dissolve(app.db.def(unit.defId).image, rect);
    coins(rect, root.querySelector(".hud-gum"), Math.min(8, 2 + Math.ceil(res.value / 4)));
    say("sell");
  },
  drop(raw, target) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (app.run.pending.length) return;
    if (data.kind === "unit") {
      app.ui.selected = { type: "unit", zone: data.zone, index: data.index };
      actions.clickSlot(target.zone, target.index);
    } else if (data.kind === "offer") {
      actions.buy(data.index, app.run[target.zone][target.index] ? null : target);
    }
  },
  reroll() {
    if (app.run.pending.length) return sayError("先に選択を済ませてください");
    const res = withRng(app.run, (rng) => reroll(app.run, app.db, rng));
    if (!res.ok) return sayError(res.error);
    if (app.ui.selected?.type === "offer") app.ui.selected = null;
    app.ui.deal = true;
    audio.se("buy", 0.35);
    save();
    render();
    say("reroll");
  },
  toggleLock() {
    const locked = toggleLock(app.run);
    save();
    render();
    say(locked ? "lockOn" : "lockOff");
  },
  chooseTreasure(id, el) {
    if (app.ui.picking) return;
    app.ui.picking = true;
    el?.classList.add("picked");
    setTimeout(() => {
      app.ui.picking = false;
      const res = Run.chooseTreasure(app.run, app.db, id);
      if (!res.ok) return sayError(res.error);
      audio.se("treasure");
      save();
      render();
      if (res.message) say(null, {}, { tone: "good", text: res.message });
    }, 220);
  },
  chooseExtension(id, el) {
    if (app.ui.picking) return;
    app.ui.picking = true;
    el?.classList.add("picked");
    const r = el?.querySelector("img")?.getBoundingClientRect();
    setTimeout(() => {
      app.ui.picking = false;
      const res = Run.chooseExtension(app.run, app.db, id);
      if (!res.ok) return sayError(res.error);
      audio.se("buff");
      save();
      render();
      const strip = root.querySelector(".ext-list") ?? root.querySelector(".info-bar");
      if (r && strip) flyGhost(res.extension.image, r, strip.getBoundingClientRect(), { duration: 480 }).then(() => pop(strip));
      say("ext");
    }, 220);
  },

  startBattle() {
    const prep = Run.prepareBattle(app.run, app.db);
    if (!prep.ok) return sayError(prep.error);
    // バトルは決定的なので、先に結果を確定・保存してから演出を再生する（再読み込みでのやり直しを防ぐ）
    const summary = battleSummary(runBattle(prep.left, prep.right));
    app.pendingResult = Run.finishBattle(app.run, app.db, summary);
    save();
    app.ui.selected = null;
    speech.dismiss();
    audio.playBgm("bgm_battle");
    wipe(
      () => {
        app.screen = "battle";
        ambient.setBackground(background(0), { mood: "battle", accent: "#ff4f6d" });
        clear(root);
        app.battleView = new BattleView(app, prep);
        root.append(app.battleView.el);
      },
      { accent: "#ff4f6d", label: "BATTLE" },
    ).then(() => app.battleView?.start());
  },
  battleSpeak(kind) {
    const anchor = root.querySelector(".side-head.player .side-leader");
    say(kind, {}, { anchor });
  },
  battleFinished() {
    const result = app.pendingResult;
    app.pendingResult = null;
    audio.stopBgm();
    audio.se(result.won ? "win" : "lose", 0.7);
    app.battleView.showResult(resultPanel(app, result));
    if (result.won) confetti({ duration: 1400, count: 90 });
    setTimeout(() => {
      const anchor = root.querySelector(".result-figure");
      say(result.revived ? "revive" : result.won ? "win" : "lose", {}, { anchor, tone: result.won ? "good" : "" });
    }, 700);
  },
  next() {
    const run = app.run;
    speech.dismiss();
    app.battleView = null;
    if (run.phase === "result") {
      Run.advance(run, app.db);
      save();
      return enterStage();
    }
    const cleared = run.phase === "clear";
    if (cleared) audio.se("clear", 0.7);
    clearRun();
    audio.stopBgm();
    go("end", { bg: background(2), mood: "end" }).then(() => {
      if (cleared) confetti({ duration: 2600, count: 140 });
      setTimeout(() => say(cleared ? "clear" : "over", {}, { anchor: root.querySelector(".end-figure") }), 500);
    });
  },
};

function sayOnSelect() {
  if (app.screen !== "select") return;
  say("select", {}, { anchor: root.querySelector(".select-figure img") });
}

app.actions = actions;

async function boot() {
  ambient = initAmbient();
  installRipple();
  document.addEventListener("pointerdown", () => audio.unlock(), { once: true });
  try {
    const [heroes, enemies, extensions, manifest] = await Promise.all([
      loadJson("data/heroes.json"),
      loadJson("data/enemies.json"),
      loadJson("data/extensions.json"),
      loadJson("data/manifest.json"),
    ]);
    app.db = createDb({ heroes, enemies, extensions });
    app.backgrounds = manifest.backgrounds;
  } catch (err) {
    clear(root).append(h("div", { class: "loading error" }, `データの読み込みに失敗しました: ${err.message}`));
    throw err;
  }
  ambient.setBackground(new URL(app.backgrounds[0], document.baseURI).href, { mood: "title" });
  app.ui.intro = true;
  render();
}

window.__app = app;
boot();

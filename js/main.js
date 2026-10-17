// アプリ本体: 画面遷移とプレイヤー操作をエンジンにつなぎ、操作ごとの演出を出す。

import { createDb } from "./engine/units.js";
import * as Run from "./engine/run.js";
import { moveUnit, allUnits, mergePreview } from "./engine/roster.js";
import { bestAffordableOffer, reroll, toggleOfferLock, effectiveRank } from "./engine/market.js";
import { randomSeed, withRng } from "./engine/rng.js";
import { battleSummary, runBattle } from "./engine/battle.js";
import { PLAYERS, playerById } from "./engine/content.js";
import { RARITY, TREASURE_STAGES, stageIncome, storyPlayerBonus } from "./engine/balance.js";
import { isBossWave } from "./engine/boss.js";
import { audio } from "./ui/audio.js";
import {
  RTA_REGULATIONS,
  abortRta,
  initPlatform,
  isRtaAvailable,
  newRtaStory,
  recordNodeScore,
  reportStageResult,
  reportStoryScore,
  rtaCheckpoint,
  rtaCheckpointForQuest,
  rtaCheckpointForStageClear,
  setChatVisible,
  chatHiddenOn,
  startRta,
} from "./platform.js";
import { clearRun, loadRun, loadSettings, loadStory, saveRun, saveSettings, saveStory } from "./ui/storage.js";
import * as Story from "./engine/story.js";
import { AREAS, DECK_SIZE, ERAS, TUTORIAL_AREA, areaById, areaMusic, areaName, machineByLevel, parseStageKey, stageLabel } from "./engine/world.js";
import { MAP_INTRO, PROLOGUE, TUTORIAL_DONE, areaClearScene, stageIntro, upgradeScene } from "./story/scenes.js";
import { ScenePlayer } from "./ui/scene.js";
import { Coach } from "./ui/coach.js";
import { TUTORIAL_STEPS } from "./story/tutorial.js";
import { areaScreen, deckScreen, partsScreen, stageResultScreen, storyBackground, worldMapScreen } from "./ui/story-views.js";
import { revealMachine } from "./ui/machine-reveal.js";
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
  fighterModal,
  helpModal,
  menuModal,
  playerModal,
  resultPanel,
  rtaModal,
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
  story: null,
  // RTA 中：{ regulation, started, finished, igtMs, mainStory }。近代・日本の RTA では app.story を RTA 用のストーリーに差し替え、
  // 本編のストーリーを mainStory に退避する（RTA 用のストーリー・ステージは保存しない）。docs/platform.md
  rta: null,
  saveSettings() {
    // app.settings は起動時の写しなので、音量は audio が今持っている値を書く
    saveSettings({ ...loadSettings(), ...app.settings, ...audio.settingsPatch() });
  },
};

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** 近代・日本の RTA 中か（RTA 用のストーリーで遊んでいる。セーブに触らない） */
function inRtaStory() {
  return app.rta?.regulation === RTA_REGULATIONS.node1;
}

function save() {
  if (app.run && !inRtaStory()) saveRun(app.run);
}

/** 遊んでいるステージのセーブを消す（RTA 用のストーリーでは、フリーバトルの「つづきから」を消さないよう何もしない） */
function dropRun() {
  if (!inRtaStory()) clearRun();
}

function background(offset = 0) {
  if (app.run?.story) return storyBackground(areaById(app.run.story.areaId).bg);
  const list = app.backgrounds;
  return new URL(list[((app.run?.stage ?? 0) + offset) % list.length], document.baseURI).href;
}

/** バトル背景（MCHの色違いの背景をステージごとに順番に使う） */
function battleBackground() {
  const list = app.battleBackgrounds?.length ? app.battleBackgrounds : app.backgrounds;
  return new URL(list[((app.run?.stage ?? 1) - 1) % list.length], document.baseURI).href;
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
  // チュートリアルでマインが案内している間は、クリスのセリフを控える（吹き出しが重なるため）
  if ((coach.el?.isConnected || (app.run?.story?.tutorial && tutorialStep())) && tone !== "error") return;
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
  if (app.screen === "battle" || app.screen === "scene") return;
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
    case "worldmap":
      screen = worldMapScreen(app);
      break;
    case "area":
      screen = areaScreen(app);
      break;
    case "deck":
      screen = deckScreen(app);
      break;
    case "stageResult":
      screen = stageResultScreen(app, app.ui.stageResult);
      break;
    case "parts":
      screen = partsScreen(app, app.ui.partsInfo);
      break;
    default:
      screen = titleScreen(app, { hasSave: Boolean(validSave()), rta: isRtaAvailable() });
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
  if (app.run?.story?.tutorial) coachUpdate();
  else coach.hide();
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
  coach.hide();
  return wipe(
    () => {
      app.screen = screen;
      setChatVisible(!chatHiddenOn(screen));   // 全体チャットの 💬（共通基盤 SPEC-004）
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

/**
 * いまのウェーブのBGM（scene: "market" | "battle"）。ストーリーはノードの曲と時代の音色、レイドボスのウェーブはレイドの曲
 */
function playStageBgm(scene) {
  const st = app.run?.story;
  if (!st) return audio.playBgm(scene === "battle" ? "bgm_battle" : "bgm_market");
  const music = areaMusic(areaById(st.areaId), scene, { boss: isBossWave(app.run) });
  audio.playBgm(music.name, { tone: music.tone });
}

/** ステージ開始: マーケットに入り、テロップのあとセリフ */
async function enterStage() {
  app.ui.selected = null;
  app.ui.deal = true;
  app.ui.lastGum = app.run.gum;
  app.ui.telopActive = true;
  playStageBgm("market");
  await go("market", { bg: background(3), mood: "market", accent: player().color });
  const info = {
    income: stageIncome(app.run.stage) + (app.run.story ? storyPlayerBonus(app.run.story).income : 0),
    label: app.run.story ? stageLabelOf(app.run.story) : null,
    rank: effectiveRank(app.run),
    treasure: !app.run.story && TREASURE_STAGES.includes(app.run.stage),
    boss: isBossWave(app.run),
    supply: Boolean(app.run.story?.supply),
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
      if (app.run.story?.tutorial) {
        coachUpdate();
      } else if (!app.run.pending.length) {
        const hasUnits = allUnits(app.run).length > 0;
        const story = Boolean(app.run.story);
        if (info.boss) say("boss");
        else if (info.supply) say(null, {}, { text: "補給だ！ 宝箱を選んで、しっかり準備しよう" });
        else say(hasUnits && Math.random() < 0.35 ? "hint" : story ? "wave" : "stage", { n: story ? app.run.wins + 1 : app.run.stage });
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

// ---------------------------------------------------------------------------
// チュートリアル（1-1 でマインが操作を案内する）
// ---------------------------------------------------------------------------

const coach = new Coach(document.body);

/** いま戦っている（準備している）ウェーブ。バトル中は結果を先に反映しているので開始時の値を使う */
function currentWave() {
  return app.pendingResult ? app.ui.battleWave : app.run.wins + 1;
}

function tutorialStep() {
  if (!app.run?.story?.tutorial || app.story.flags.tut === "done") return null;
  const wave = currentWave();
  let i = app.story.flags.tut ?? 0;
  // 先のウェーブに進んでいたら、それより前の案内は飛ばす
  while (i < TUTORIAL_STEPS.length && TUTORIAL_STEPS[i].wave < wave) i++;
  if (i >= TUTORIAL_STEPS.length) {
    app.story.flags.tut = "done";
    saveStoryNow();
    return null;
  }
  if (i !== (app.story.flags.tut ?? 0)) {
    app.story.flags.tut = i;
    saveStoryNow();
  }
  return TUTORIAL_STEPS[i];
}

/** いまの画面（案内を出す場所の判定用） */
function coachScreen() {
  if (app.screen !== "market") return app.screen;
  if (app.ui.telopActive) return "telop";
  const ev = app.run?.pending[0];
  if (ev?.type === "extension" && !app.ui.holdModal) return "modal-extension";
  return "market";
}

/**
 * いま出す案内。target が無いときは fallback（OKで進む）。
 * spendFirst の手順は、まだ買えるヒーローがあればバトルより先に「強化」を案内する。
 */
function stepView(step) {
  if (step.spendFirst && app.run) {
    const i = bestAffordableOffer(app.run);
    if (i >= 0) {
      const offer = app.run.market.offers[i];
      const merge = mergePreview(app.run, offer.defId);
      return {
        ...step,
        target: `.offer[data-offer="${i}"]`,
        text: merge
          ? `GUMが${app.run.gum}残っています！ 光っているヒーローを買うと合成してLv${merge}に。バトルの前に強化しましょう`
          : `GUMが${app.run.gum}残っています！ バトルの前に、ヒーローを買ってパーティを強化しましょう`,
      };
    }
  }
  if (step.fallback && step.target && !document.querySelector(step.target)) return { ...step, ...step.fallback, until: "ok" };
  return step;
}

function coachUpdate() {
  const step = tutorialStep();
  if (!step || step.screen !== coachScreen() || step.wave !== currentWave()) {
    coach.hide();
    return;
  }
  const view = stepView(step);
  coach.show({ text: view.text, target: view.target, button: view.button, onOk: () => tutorialEvent("ok") });
  if (step.screen === "battle" && app.battleView) app.battleView.paused = true;
  // 登場アニメーションで位置が動くので、少し後にもう一度合わせる
  setTimeout(() => coach.place(), 480);
}

function tutorialEvent(name) {
  const step = tutorialStep();
  // 本来の操作（buy など）でも、代わりの案内の OK でも進む（操作で対象が消えて代わりの案内になることがあるため）
  if (!step || (step.until !== name && stepView(step).until !== name)) return;
  app.story.flags.tut = TUTORIAL_STEPS.indexOf(step) + 1;
  saveStoryNow();
  if (app.battleView) app.battleView.paused = false;
  coach.hide();
  setTimeout(coachUpdate, 80);
}

// ---------------------------------------------------------------------------
// ストーリー
// ---------------------------------------------------------------------------

function saveStoryNow() {
  if (!inRtaStory()) saveStory(app.story);
}

function stageLabelOf(st) {
  return stageLabel(areaById(st.areaId), st.index, st.lane);
}

/** シーン（会話劇）を再生して、終わるまで待つ */
async function playScene(scene, { bgm = "bgm_market", tone = null } = {}) {
  speech.dismiss();
  if (bgm) audio.playBgm(bgm, { tone });
  const player = new ScenePlayer(scene, { db: app.db });
  await wipe(
    () => {
      app.screen = "scene";
      setChatVisible(false);   // 会話劇の最中は全体チャットの 💬 を隠す
      clear(root);
      root.append(player.el);
      if (scene.bg) ambient.setBackground(storyBackground(scene.bg), { mood: "story" });
    },
    { accent: "#4fd8ff" },
  );
  await player.start();
}

/** デッキ画面で目安を出すステージ: ステージ選択から開いたら選んでいるステージ、マップからなら次に挑むステージ */
function deckTargetStage(from) {
  const story = app.story;
  if (from === "area" && app.ui.storyArea) {
    const area = areaById(app.ui.storyArea);
    return app.ui.storyStage ?? Story.defaultStage(story, area);
  }
  const open = AREAS.filter((a) => Story.areaUnlocked(story, a) && Story.nextStage(story, a) !== null);
  const area = open[open.length - 1];
  return area ? Story.defaultStage(story, area) : null;
}

/** いちばん新しく開いた時代 */
function latestEra() {
  const open = ERAS.filter((e) => Story.eraUnlocked(app.story, e.id));
  return (open[open.length - 1] ?? ERAS[0]).id;
}

/** パーツ獲得画面: シルエットのドットを実体化し、割合のゲージと数字を進める */
async function playPartsReveal(info) {
  const canvas = root.querySelector(".parts-screen .reveal-target");
  const label = root.querySelector(".parts-percent .after");
  const bar = root.querySelector(".parts-bar .bar-after");
  await new Promise((r) => setTimeout(r, 450));
  audio.se("merge", 0.6);
  await revealMachine(canvas, info.before, info.after, {
    duration: 1500,
    onProgress: (p) => {
      if (label) label.textContent = `${Math.round(p * 100)}%`;
      if (bar) bar.style.width = `${p * 100}%`;
    },
  });
  if (!canvas?.isConnected) return;
  pop(label);
  if (info.after >= 1) {
    audio.se("treasure", 0.7);
    const screen = root.querySelector(".parts-screen");
    screen?.classList.add("done");
    const name = screen?.querySelector(".parts-level b");
    if (name?.dataset.name) name.textContent = name.dataset.name;
    confetti({ duration: 1400, count: 80 });
  }
}

/** ステージが終わったとき（クリア / 撤退） */
function storyStageEnd() {
  const run = app.run;
  const st = run.story;
  const cleared = run.phase === "clear";
  const result = cleared ? Story.clearStage(app.story, st.key) : null;
  // bearko.games 共通基盤のトロフィー（最初のノード・時空のはざまの制覇）。SDK がなければ何もしない
  reportStageResult(st.areaId, result);
  // 総合スコア：ノードの最後のステージなら、そのノードの戦力・戦闘時間を残して送る（carryOver の前。run はこのノードの通し）
  // RTA 用のストーリーは本編の進み具合ではないので送らない
  if (!inRtaStory() && cleared && (recordNodeScore(app.story, st.areaId, st.index, app.db, run) || result?.areaCleared)) reportStoryScore(app.story);
  // ノードの中はチームを繰り越す（負けたときは、そのステージを始めたときのチームのまま）
  if (cleared) Story.carryOver(app.story, run);
  saveStoryNow();
  dropRun();
  app.run = null;
  app.ui.stageResult = { areaId: st.areaId, index: st.index, lane: st.lane ?? null, key: st.key, cleared, result };
  audio.stopBgm();
  if (cleared) audio.se("clear", 0.7);
  const area = areaById(st.areaId);
  go("stageResult", { bg: storyBackground(area.bg), mood: "result", accent: area.color }).then(() => {
    if (cleared) confetti({ duration: 1800, count: 110 });
  });
}

const actions = {
  /** タイトルの「ストーリー」: 初回はプロローグ → ワールドマップの説明 */
  async openStory() {
    const story = app.story;
    if (!story.prologue) {
      await playScene(PROLOGUE);
      story.prologue = true;
      saveStoryNow();
    }
    if (!story.flags.mapIntro) {
      await playScene(MAP_INTRO, { bgm: "bgm_title" });
      story.flags.mapIntro = true;
      saveStoryNow();
    }
    actions.openMap();
  },
  openMap() {
    app.ui.modal = null;
    app.ui.storyEra = app.ui.storyEra && Story.eraUnlocked(app.story, app.ui.storyEra) ? app.ui.storyEra : latestEra();
    audio.playBgm("bgm_title");
    go("worldmap", { bg: storyBackground("2105"), mood: "map", accent: "#5fe3ff" });
  },
  selectEra(eraId) {
    if (!Story.eraUnlocked(app.story, eraId)) {
      const need = Math.min(...AREAS.filter((a) => a.era === eraId && !a.requiresAll).map((a) => a.machine));
      return toast(`タイムマシン Lv${need}（${machineByLevel(need).short}）で行けるようになります`);
    }
    app.ui.storyEra = eraId;
    audio.se("buy", 0.3);
    render();
  },
  openArea(areaId) {
    const area = areaById(areaId);
    if (!Story.areaUnlocked(app.story, area)) {
      if (app.story.machine < area.machine) {
        return toast(`タイムマシン Lv${area.machine}（${machineByLevel(area.machine).short}）で行けるようになります`);
      }
      if (area.requiresAll) return toast("すべてのノードをクリアすると行けるようになります");
      if (area.after) return toast(`${areaName(areaById(area.after))}をクリアすると行けるようになります`);
    }
    app.ui.storyArea = areaId;
    app.ui.storyStage = null;
    app.ui.storyEra = area.era;
    audio.playBgm("bgm_title");
    go("area", { bg: storyBackground(area.bg), mood: "area", accent: area.color });
  },
  /** ステージのタイル: 選ぶ。選んでいるステージをもう一度タップすると出撃（key はステージID） */
  selectStage(key) {
    const area = areaById(app.ui.storyArea);
    const current = app.ui.storyStage ?? Story.defaultStage(app.story, area);
    if (key === current) {
      const parsed = parseStageKey(key);
      if (parsed && Story.canSortie(app.story, area, parsed.index, parsed.lane)) return actions.sortie(key);
      const options = Story.sortieOptions(app.story, area).map((o) => stageLabel(area, o.index, o.lane));
      if (Story.isCleared(app.story, key) || options.length) {
        return toast(`チームを繰り越して進むので、出撃できるのは ${options.join(" / ")} です`);
      }
      return toast("まだ出撃できません");
    }
    app.ui.storyStage = key;
    audio.se("buy", 0.3);
    render();
  },
  /** 補給のステージ: 宝箱を選んだあと「出発」でクリア */
  departSupply() {
    const res = Run.departSupply(app.run);
    if (!res.ok) return toast(res.error, "error");
    save();
    storyStageEnd();
  },
  /** チームを作り直す（ノードの最初のステージから） */
  rebuildNode(areaId) {
    const area = areaById(areaId);
    app.ui.modal = () =>
      confirmModal(app, `チームを作り直して ${stageLabel(area, 0)} から始めますか？（いまのチームは消えます。クリア済みのステージは報酬なしで進みます）`, () => {
        Story.resetNodeRun(app.story, areaId);
        saveStoryNow();
        app.ui.modal = null;
        app.ui.storyStage = null;
        render();
      });
    render();
  },
  openDeck(from) {
    app.ui.deckFrom = from;
    app.ui.deckStage = deckTargetStage(from);
    app.ui.deckDraft = [...app.story.deck];
    app.screen = "deck";
    app.ui.intro = true;
    render();
  },
  toggleDeck(id) {
    const draft = app.ui.deckDraft;
    const i = draft.indexOf(id);
    if (i >= 0) draft.splice(i, 1);
    else if (draft.length >= DECK_SIZE) return toast(`デッキは${DECK_SIZE}種類までです`);
    else draft.push(id);
    audio.se("buy", 0.3);
    render();
  },
  /** おまかせ編成 */
  autoDeck() {
    app.ui.deckDraft = Story.autoDeck(app.db, app.story);
    audio.se("merge", 0.4);
    toast("おまかせで編成しました");
    render();
  },
  closeDeck(commit) {
    if (commit) {
      const res = Story.setDeck(app.story, app.ui.deckDraft, app.db);
      if (!res.ok) return toast(res.error, "error");
    }
    app.story.fresh = [];
    saveStoryNow();
    app.ui.deckDraft = null;
    app.screen = app.ui.deckFrom === "map" ? "worldmap" : "area";
    render();
  },
  /** 出撃: 出会いのシーン → ステージ開始。マーケットの枠が多く空くデッキなら先に確認する */
  async sortie(key, { force = false } = {}) {
    const parsed = parseStageKey(key);
    if (!parsed || !Story.canSortie(app.story, parsed.area, parsed.index, parsed.lane)) return;
    const empty = Story.deckEmptyShare(app.db, app.story.deck, key);
    if (!force && empty >= 30) {
      app.ui.modal = () =>
        confirmModal(
          app,
          `デッキに高いレアリティのヒーローが足りないため、マーケットの枠が約${empty}%空になります。デッキを見直しますか？`,
          () => {
            app.ui.modal = null;
            actions.openDeck("area");
          },
          { yes: "デッキを見直す", no: "このまま出撃", onNo: () => actions.sortie(key, { force: true }) },
        );
      return render();
    }
    app.ui.modal = null;
    // 近代・日本の RTA：最初の出撃（1-1）で計測を始める
    if (inRtaStory() && !app.rta.started) {
      app.rta.started = true;
      startRta(app.rta.regulation);
    }
    const story = app.story;
    const first = !story.flags[`met:${key}`] && !Story.isCleared(story, key);
    Story.joinAtStart(story, key);
    const boss = parsed.stage.boss ? app.db.def(parsed.stage.boss) : null;
    const music = areaMusic(parsed.area, "market", { boss: Boolean(boss) });
    await playScene(stageIntro(parsed.area, parsed.index, { first, boss, stage: parsed.stage }), { bgm: music.name, tone: music.tone });
    story.flags[`met:${key}`] = true;
    saveStoryNow();
    app.run = Story.newStageRun(app.db, story, key, randomSeed());
    app.ui.treasureKey = null;
    app.ui.stageResult = null;
    save();
    enterStage();
  },
  /** ステージ結果の「つぎへ」: パーツ獲得 → 改良の演出 → ノードクリアの会話 → 画面へ戻る */
  async afterStageResult() {
    // 近代・日本の RTA を走り終えたら、パーツ・会話は出さずにタイトルへ（本編のストーリーに戻す）
    if (inRtaStory() && app.rta.finished) return actions.toTitle();
    const info = app.ui.stageResult;
    const area = areaById(info.areaId);
    const res = info.result;
    const gain = !info.partsShown ? Story.partsGain(app.story, res) : null;
    if (gain) {
      info.partsShown = true;
      app.ui.partsInfo = gain;
      await go("parts", { bg: storyBackground("2505"), mood: "parts", accent: "#ffd23f" });
      playPartsReveal(gain);
      return;
    }
    if (res?.upgradedTo) await playScene(upgradeScene(res.upgradedTo - 1, res.upgradedTo, res.unlockedAreas), { bgm: "bgm_title" });
    if (res?.areaCleared) {
      // 改良の会話で行ける場所を話していなければ、ここで（同じ時代のほかの国が開いたとき）
      // 特別ステージ（特異点）が開いたときは、改良があってもここで話す
      const opened = res.upgradedTo ? res.unlockedAreas.filter((id) => areaById(id).special) : res.unlockedAreas;
      await playScene(area.id === TUTORIAL_AREA ? TUTORIAL_DONE : areaClearScene(area, opened));
      return actions.openMap();
    }
    actions.openArea(area.id);
  },
  afterParts() {
    actions.afterStageResult();
  },
  confirmRetreat() {
    app.ui.modal = () =>
      confirmModal(app, "ステージをやめますか？（このステージの進み具合は失われます）", () => {
        const st = app.run?.story;
        app.ui.modal = null;
        dropRun();
        app.run = null;
        if (st) actions.openArea(st.areaId);
        else actions.toTitle();
      });
    render();
  },
  newGame() {
    // RTA を走り終えたあとの「もう一度」は、ふつうのフリーバトル
    if (app.rta?.finished) endRtaMode();
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
    // 10 勝でクリアの RTA：プレイヤーを選んだときに計測を始める
    if (app.rta?.regulation === RTA_REGULATIONS.quest && !app.rta.started) {
      app.rta.started = true;
      startRta(app.rta.regulation);
    }
    app.run = Run.newRun(app.db, { playerId, seed: randomSeed() });
    app.ui.treasureKey = null;
    save();
    enterStage();
  },
  toTitle() {
    app.ui.modal = null;
    app.run = null;
    endRtaMode();
    audio.playBgm("bgm_title");
    go("title", { bg: new URL(app.backgrounds[0], document.baseURI).href, mood: "title", accent: "#ffd23f" });
  },
  /** タイトルの「RTA」：近代・日本 か 10 勝でクリア を選ぶ */
  openRta() {
    app.ui.modal = () => rtaModal(app);
    render();
  },
  /** 近代・日本の RTA：RTA 用の新しいストーリーで、近代・日本のステージ選択へ（計測は 1-1 の出撃から） */
  startRtaNode1() {
    app.ui.modal = null;
    app.rta = { regulation: RTA_REGULATIONS.node1, started: false, finished: false, igtMs: 0, mainStory: app.story };
    app.story = newRtaStory();
    app.ui.storyEra = null;
    actions.openArea(TUTORIAL_AREA);
  },
  /** 10 勝でクリアの RTA：プレイヤー選択へ（計測はプレイヤーを選んだときから） */
  startRtaQuest() {
    app.ui.modal = null;
    app.rta = { regulation: RTA_REGULATIONS.quest, started: false, finished: false, igtMs: 0, mainStory: null };
    actions.newGame();
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
  /** タイトルのスピーカー：BGMも効果音も 0 にする。もう一度押すと前の音量に戻す */
  toggleSound() {
    audio.unlock();
    audio.toggle();
    render();
  },
  /** メニューのつまみ。kind は "bgm" か "se"、level は 0〜1。つまみを動かすたびに呼ばれるので描き直さない */
  setVolume(kind, level) {
    audio.unlock();
    audio.setVolumes({ [kind]: level });
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
  /** 空の枠（デッキにそのレアリティ以上のヒーローがいない）をタップしたとき */
  emptyOfferInfo(rarity) {
    toast(`デッキに${RARITY[rarity].name}以上のヒーローがいないため、この枠は空です。ステージ選択の「デッキ」で入れておきましょう`);
  },
  clickOffer(index) {
    const sel = app.ui.selected;
    if (!app.run.market.offers[index]) return;
    if (sel?.type === "offer" && sel.index === index) return actions.buy(index);
    app.ui.selected = { type: "offer", index };
    render();
    tutorialEvent("select");
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
    tutorialEvent(last ? "merge" : "buy");
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
  /** ヒーロー（マテリアル）を1枠ずつ取り置き。GUMが足りなくてもでき、更新・次のステージでも残る */
  toggleOfferLock(index) {
    const locked = toggleOfferLock(app.run, index);
    if (locked === null) return;
    audio.se("buy", 0.3);
    save();
    render();
    pop(root.querySelector(`.offer[data-offer="${index}"] .offer-lock`), "pop");
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
      tutorialEvent("extension");
      const strip = root.querySelector(".ext-list") ?? root.querySelector(".info-bar");
      if (r && strip) flyGhost(res.extension.image, r, strip.getBoundingClientRect(), { duration: 480 }).then(() => pop(strip));
      say("ext");
    }, 220);
  },

  startBattle() {
    const prep = Run.prepareBattle(app.run, app.db);
    if (!prep.ok) return sayError(prep.error);
    app.ui.battleWave = app.run.wins + 1;
    // 結果を反映する前に（ウェーブ数が変わる前に）チュートリアルを進め、BGMを決める
    tutorialEvent("battle");
    playStageBgm("battle");
    // バトルは決定的なので、先に結果を確定・保存してから演出を再生する（再読み込みでのやり直しを防ぐ）
    const summary = battleSummary(runBattle(prep.left, prep.right));
    app.pendingResult = Run.finishBattle(app.run, app.db, summary);
    save();
    app.ui.selected = null;
    speech.dismiss();
    coach.hide();
    wipe(
      () => {
        app.screen = "battle";
        setChatVisible(false);   // 対戦中は全体チャットの 💬 を隠す
        const bg = battleBackground();
        ambient.setBackground(bg, { mood: "battle", accent: "#ff4f6d" });
        clear(root);
        app.battleView = new BattleView(app, prep, { background: bg });
        root.append(app.battleView.el);
      },
      { accent: "#ff4f6d", label: "BATTLE" },
    ).then(() => app.battleView?.start());
  },
  /** 結果画面での振り返り: ヒーローのスキルとそのバトルでの活躍 */
  showFighter(sideIndex, slot) {
    const battle = app.battleView?.battle;
    if (!battle) return;
    root.querySelector(".review-modal")?.remove();
    speech.dismiss();
    const close = () => el.remove();
    const el = fighterModal(app, battle, sideIndex, slot, close);
    el.addEventListener("click", (e) => e.target === el && close());
    root.append(el);
  },
  battleSpeak(kind) {
    const anchor = root.querySelector(".side-head.player .side-leader");
    say(kind, {}, { anchor });
    if (app.run?.story?.tutorial) coachUpdate();
  },
  battleFinished() {
    coach.hide();
    const result = app.pendingResult;
    app.pendingResult = null;
    rtaAfterBattle(result);
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
    if (run.story) return storyStageEnd();
    const cleared = run.phase === "clear";
    if (cleared) audio.se("clear", 0.7);
    dropRun();
    audio.stopBgm();
    go("end", { bg: background(2), mood: "end" }).then(() => {
      if (cleared) confetti({ duration: 2600, count: 140 });
      setTimeout(() => say(cleared ? "clear" : "over", {}, { anchor: root.querySelector(".end-figure") }), 500);
    });
  },
};

/** RTA：戦闘の演出が終わったとき（SKIP を含む）に、ゲーム内の戦闘時間を足し、区切りを送る */
function rtaAfterBattle(result) {
  const rta = app.rta;
  const run = app.run;
  if (!rta?.started || rta.finished || !run || !result) return;
  rta.igtMs += Math.round((result.time || 0) * 1000);
  const id = run.story
    ? run.phase === "clear"
      ? rtaCheckpointForStageClear(run.story.areaId, run.story.index)
      : null
    : rtaCheckpointForQuest(run);
  if (id) rtaCheckpoint(id, rta.igtMs);
  if (id === "clear") rta.finished = true;
  else if (!run.story && run.phase === "gameover") {
    abortRta();
    rta.finished = true;
  }
}

/** RTA をやめる（タイトルに戻ったとき）。走り終えていなければ中断にし、本編のストーリーに戻す */
function endRtaMode() {
  const rta = app.rta;
  if (!rta) return;
  if (rta.started && !rta.finished) abortRta();
  if (rta.mainStory) app.story = rta.mainStory;
  app.rta = null;
}

function sayOnSelect() {
  if (app.screen !== "select") return;
  say("select", {}, { anchor: root.querySelector(".select-figure img") });
}

app.actions = actions;

async function boot() {
  initPlatform("0.1.0"); // bearko.games 共通基盤（docs/platform.md）
  ambient = initAmbient();
  installRipple();
  // タイトルのBGM。ブラウザの制限で、最初にタップしたときに鳴り始める
  audio.playBgm("bgm_title");
  document.addEventListener("pointerdown", () => audio.unlock(), { once: true });
  try {
    const [heroes, enemies, extensions, bosses, manifest] = await Promise.all([
      loadJson("data/heroes.json"),
      loadJson("data/enemies.json"),
      loadJson("data/extensions.json"),
      loadJson("data/bosses.json"),
      loadJson("data/manifest.json"),
    ]);
    app.db = createDb({ heroes, enemies, extensions, bosses });
    app.backgrounds = manifest.backgrounds;
    app.battleBackgrounds = manifest.battleBackgrounds ?? [];
    const saved = loadStory();
    app.story = saved?.cleared ? Story.migrateStory(saved) : Story.newStory();
    // 総合スコア：これまでに制覇したノードを、起動のたびに送り直す（通知は出さない。サーバーで自己ベストだけ残る）
    reportStoryScore(app.story, { quiet: true });
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

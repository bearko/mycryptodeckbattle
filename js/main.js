// アプリ本体: 画面遷移とプレイヤー操作をエンジンにつなぐ。

import { createDb } from "./engine/units.js";
import * as Run from "./engine/run.js";
import { moveUnit } from "./engine/roster.js";
import { reroll, toggleLock } from "./engine/market.js";
import { randomSeed, withRng } from "./engine/rng.js";
import { battleSummary, runBattle } from "./engine/battle.js";
import { audio } from "./ui/audio.js";
import { clearRun, loadRun, loadSettings, saveRun, saveSettings } from "./ui/storage.js";
import { clear, h } from "./ui/h.js";
import { toast } from "./ui/components.js";
import { marketScreen } from "./ui/market-view.js";
import { BattleView } from "./ui/battle-view.js";
import {
  confirmModal,
  endScreen,
  extensionInfoModal,
  extensionModal,
  helpModal,
  resultPanel,
  selectScreen,
  titleScreen,
  treasureModal,
} from "./ui/screens.js";

const root = document.getElementById("app");

const app = {
  db: null,
  run: null,
  screen: "title",
  backgrounds: [],
  settings: loadSettings(),
  audio,
  ui: { selected: null, modal: null, flash: null },
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
  return list[((app.run?.stage ?? 0) + offset) % list.length];
}

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------

function currentModal() {
  if (app.ui.modal) return app.ui.modal();
  if (app.screen === "market" && app.run) {
    const ev = app.run.pending[0];
    if (ev?.type === "treasure") return treasureModal(app, ev);
    if (ev?.type === "extension") return extensionModal(app, ev);
  }
  return null;
}

function render() {
  if (app.screen === "battle") return;
  const scrollY = window.scrollY;
  clear(root);
  let screen;
  switch (app.screen) {
    case "select":
      screen = selectScreen(app);
      break;
    case "market":
      screen = marketScreen(app);
      screen.style.setProperty("--screen-bg", `url(${new URL(background(3), document.baseURI).href})`);
      break;
    case "end":
      screen = endScreen(app);
      break;
    default:
      screen = titleScreen(app, { hasSave: Boolean(validSave()) });
  }
  root.append(screen);
  const modal = currentModal();
  if (modal) root.append(modal);
  window.scrollTo(0, scrollY);
}

function validSave() {
  const run = loadRun();
  if (!run || run.version !== Run.RUN_VERSION) return null;
  if (run.phase === "clear" || run.phase === "gameover") return null;
  return run;
}

function flashAt(pos) {
  app.ui.flash = pos;
  setTimeout(() => {
    if (app.ui.flash === pos) {
      app.ui.flash = null;
      const el = root.querySelector(".slot.flash");
      if (el) el.classList.remove("flash");
    }
  }, 900);
}

function goMarket() {
  app.screen = "market";
  app.ui.selected = null;
  audio.playBgm("bgm_market");
  render();
}

function goEnd() {
  app.screen = "end";
  clearRun();
  audio.stopBgm();
  render();
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

function afterBuy(res, target) {
  audio.se("buy");
  if (res.unit && target && !app.run[target.zone][target.index]) {
    const all = [...app.run.party.map((u, i) => ["party", i, u]), ...app.run.bench.map((u, i) => ["bench", i, u])];
    const found = all.find(([, , u]) => u && u.uid === res.unit.uid);
    if (found) moveUnit(app.run, { zone: found[0], index: found[1] }, target);
  }
  if (res.merges?.length) {
    const last = res.merges[res.merges.length - 1];
    audio.se("merge");
    toast(`合成！ ${app.db.def(last.defId).name}がLv${last.level}になった`, "good");
    flashAt({ zone: last.zone, index: last.index });
  } else if (res.material?.target) {
    toast(`${res.material.name}を使うヒーローを選んでください`);
  } else if (res.material) {
    toast(`${res.material.name}：${res.material.text}`, "good");
  }
}

const actions = {
  newGame() {
    app.ui.modal = null;
    app.screen = "select";
    render();
  },
  continueRun() {
    const run = validSave();
    if (!run) return actions.newGame();
    app.run = run;
    if (run.phase === "battle") run.phase = "market";
    if (run.phase === "result") Run.advance(run, app.db);
    save();
    goMarket();
  },
  startRun(playerId) {
    app.run = Run.newRun(app.db, { playerId, seed: randomSeed() });
    save();
    goMarket();
  },
  toTitle() {
    app.ui.modal = null;
    app.screen = "title";
    app.run = null;
    audio.playBgm("bgm_market");
    render();
  },
  confirmQuit() {
    app.ui.modal = () =>
      confirmModal(app, "タイトルに戻りますか？（進行状況は保存され、「つづきから」で再開できます）", () => actions.toTitle());
    render();
  },
  showHelp() {
    app.ui.modal = () => helpModal(app);
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
    if (run.pending[0]?.type === "target") {
      const res = Run.applyTarget(run, app.db, zone, index);
      if (!res.ok) toast(res.error, "error");
      else {
        audio.se("merge");
        toast(`${app.db.def(res.unit.defId).name}を強化しました`, "good");
        flashAt({ zone, index });
      }
      save();
      return render();
    }
    const sel = app.ui.selected;
    const unit = run[zone][index];
    if (sel?.type === "unit") {
      if (sel.zone === zone && sel.index === index) app.ui.selected = null;
      else {
        moveUnit(run, sel, { zone, index });
        app.ui.selected = null;
        save();
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
    const res = Run.buy(app.run, app.db, index);
    if (!res.ok) {
      toast(res.error, "error");
      return render();
    }
    afterBuy(res, target);
    app.ui.selected = null;
    save();
    render();
  },
  sell(zone, index) {
    const res = Run.sell(app.run, app.db, zone, index);
    if (!res.ok) toast(res.error, "error");
    else {
      audio.se("sell");
      toast(`${app.db.def(res.unit.defId).name}を売却 +${res.value} GUM`);
    }
    app.ui.selected = null;
    save();
    render();
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
      moveUnit(app.run, { zone: data.zone, index: data.index }, target);
      app.ui.selected = null;
      save();
      render();
    } else if (data.kind === "offer") {
      actions.buy(data.index, app.run[target.zone][target.index] ? null : target);
    }
  },
  reroll() {
    if (app.run.pending.length) return toast("先に選択を済ませてください", "error");
    const res = withRng(app.run, (rng) => reroll(app.run, app.db, rng));
    if (!res.ok) toast(res.error, "error");
    if (app.ui.selected?.type === "offer") app.ui.selected = null;
    save();
    render();
  },
  toggleLock() {
    const locked = toggleLock(app.run);
    toast(locked ? "ラインナップを取り置きしました（次のステージに持ち越し）" : "取り置きを解除しました");
    save();
    render();
  },
  chooseTreasure(id) {
    const res = Run.chooseTreasure(app.run, app.db, id);
    if (!res.ok) return toast(res.error, "error");
    audio.se("treasure");
    if (res.message) toast(res.message, "good");
    save();
    render();
  },
  chooseExtension(id) {
    const res = Run.chooseExtension(app.run, app.db, id);
    if (!res.ok) return toast(res.error, "error");
    audio.se("buff");
    toast(`${res.extension.name}を獲得！`, "good");
    save();
    render();
  },

  startBattle() {
    const prep = Run.prepareBattle(app.run, app.db);
    if (!prep.ok) return toast(prep.error, "error");
    // バトルは決定的なので、先に結果を確定・保存してから演出を再生する（再読み込みでのやり直しを防ぐ）
    const summary = battleSummary(runBattle(prep.left, prep.right));
    app.pendingResult = Run.finishBattle(app.run, app.db, summary);
    save();
    app.screen = "battle";
    app.ui.selected = null;
    clear(root);
    app.battleView = new BattleView(app, prep, background(0));
    root.append(app.battleView.el);
    window.scrollTo(0, 0);
    audio.playBgm("bgm_battle");
    app.battleView.start();
  },
  battleFinished() {
    const result = app.pendingResult;
    app.pendingResult = null;
    audio.stopBgm();
    audio.se(result.won ? "win" : "lose", 0.7);
    app.battleView.showResult(resultPanel(app, result));
  },
  next() {
    const run = app.run;
    app.battleView = null;
    if (run.phase === "result") {
      Run.advance(run, app.db);
      save();
      return goMarket();
    }
    if (run.phase === "clear") audio.se("clear", 0.7);
    goEnd();
  },
};

app.actions = actions;

async function boot() {
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
  render();
}

window.__app = app;
boot();

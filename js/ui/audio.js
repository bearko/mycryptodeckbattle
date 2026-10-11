// BGM・効果音。ブラウザの自動再生制限があるため、最初のクリック後に鳴らし始める。

import { loadSettings, saveSettings } from "./storage.js";

const FILES = {
  bgm_market: "assets/audio/bgm_market.mp3",
  bgm_battle: "assets/audio/bgm_battle.mp3",
  damage: "assets/audio/se_damage.mp3",
  area: "assets/audio/se_area_damage.mp3",
  heal: "assets/audio/se_heal.mp3",
  buff: "assets/audio/se_buff.mp3",
  debuff: "assets/audio/se_debuff.mp3",
  win: "assets/audio/jingle_win.mp3",
  lose: "assets/audio/jingle_lose.mp3",
  clear: "assets/audio/jingle_clear.mp3",
  treasure: "assets/audio/se_treasure.mp3",
  merge: "assets/audio/se_merge.mp3",
  buy: "assets/audio/se_buy.mp3",
  sell: "assets/audio/se_sell.mp3",
};

const SE_GAP_MS = 90;

class AudioManager {
  constructor() {
    const s = loadSettings();
    this.muted = s.muted ?? false;
    this.unlocked = false;
    this.bgm = null;
    this.bgmName = null;
    this.lastSe = {};
    this.listeners = new Set();
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.bgmName) this.playBgm(this.bgmName, true);
  }

  setMuted(muted) {
    this.muted = muted;
    saveSettings({ ...loadSettings(), muted });
    if (this.bgm) this.bgm.muted = muted;
    if (!muted && this.bgmName && this.bgm?.paused) this.bgm.play().catch(() => {});
    this.listeners.forEach((fn) => fn(muted));
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  playBgm(name, force = false) {
    if (this.bgmName === name && this.bgm && !force) return;
    this.stopBgm();
    this.bgmName = name;
    if (!this.unlocked) return;
    const a = new Audio(FILES[name]);
    a.loop = true;
    a.volume = 0.35;
    a.muted = this.muted;
    a.play().catch(() => {});
    this.bgm = a;
  }

  stopBgm() {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm = null;
    }
  }

  se(name, volume = 0.55) {
    if (!this.unlocked || this.muted || !FILES[name]) return;
    const now = performance.now();
    if (now - (this.lastSe[name] || 0) < SE_GAP_MS) return;
    this.lastSe[name] = now;
    const a = new Audio(FILES[name]);
    a.volume = volume;
    a.play().catch(() => {});
  }
}

export const audio = new AudioManager();

// BGM・効果音。ブラウザの自動再生制限があるため、最初のクリック後に鳴らし始める。
//
// MCH の BGM は4曲（ランド・PvE・PvP・レイド）しかないので、ストーリーではノードの時代ごとに「音色」を変える。
// tone: { rate: 再生速度（音の高さも一緒に変える）, lowpass: 高い音を削る周波数(Hz) }。古い時代ほど低く・こもった音にして、
// 遠い昔の記録を聴いているような感じを出す（js/engine/world.js の ERAS[].tone）。

import { loadSettings, saveSettings } from "./storage.js";

const FILES = {
  bgm_title: "assets/audio/bgm_title.mp3",
  bgm_market: "assets/audio/bgm_market.mp3",
  bgm_battle: "assets/audio/bgm_battle.mp3",
  bgm_raid: "assets/audio/bgm_raid.mp3",
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
    this.bgmTone = null;
    this.ctx = null;
    this.gain = null;
    this.lastSe = {};
    this.listeners = new Set();
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.bgmName) this.playBgm(this.bgmName, { force: true, tone: this.bgmTone });
  }

  setMuted(muted) {
    this.muted = muted;
    saveSettings({ ...loadSettings(), muted });
    if (this.bgm) this.bgm.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : 1;
    if (!muted && this.bgmName && this.bgm?.paused) this.bgm.play().catch(() => {});
    this.listeners.forEach((fn) => fn(muted));
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** BGMを鳴らす。同じ曲・同じ音色なら鳴らし直さない。opts: { force, tone } */
  playBgm(name, { force = false, tone = null } = {}) {
    const same = this.bgmName === name && JSON.stringify(this.bgmTone) === JSON.stringify(tone);
    if (same && this.bgm && !force) return;
    this.stopBgm();
    this.bgmName = name;
    this.bgmTone = tone;
    if (!this.unlocked) return;
    const a = new Audio(FILES[name]);
    a.loop = true;
    a.volume = 0.35;
    a.muted = this.muted;
    if (tone?.rate && tone.rate !== 1) {
      a.preservesPitch = false;
      a.playbackRate = tone.rate;
    }
    if (tone?.lowpass) this.filter(a, tone.lowpass);
    a.play().catch(() => {});
    this.bgm = a;
  }

  /** ローパスフィルターを通して鳴らす（Web Audio。使えないブラウザではそのまま鳴らす） */
  filter(el, hz) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx ??= new Ctx();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      if (!this.gain) {
        this.gain = this.ctx.createGain();
        this.gain.connect(this.ctx.destination);
      }
      this.gain.gain.value = this.muted ? 0 : 1;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = hz;
      lp.Q.value = 0.5;
      this.ctx.createMediaElementSource(el).connect(lp);
      lp.connect(this.gain);
    } catch {
      // フィルターなしで鳴らす
    }
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

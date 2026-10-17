// BGM・効果音。ブラウザの自動再生制限があるため、最初のクリック後に鳴らし始める。
// 音量はメニューの設定（BGM・効果音それぞれ 0〜1。storage.js の bgmVolume / seVolume）を元の音量に掛ける。
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
const BGM_BASE = 0.35; // BGMの元の音量。効果音は呼び出しごとに渡す
const DEFAULT_VOLUMES = Object.freeze({ bgm: 1, se: 1 });

function clamp01(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

/**
 * 保存した設定から音量（0〜1）を読む。1 で今までと同じ大きさ。
 * 音量を持たない古い保存は、muted: true なら両方 0（OFF）に読みかえる。
 */
export function volumeSettings(s = {}) {
  const legacyMuted = s.bgmVolume === undefined && s.seVolume === undefined && s.muted === true;
  return {
    bgm: legacyMuted ? 0 : clamp01(s.bgmVolume, DEFAULT_VOLUMES.bgm),
    se: legacyMuted ? 0 : clamp01(s.seVolume, DEFAULT_VOLUMES.se),
  };
}

/** 最終的な音量 = 元の音量 × 設定 */
export function mixVolume(base, level) {
  return clamp01(clamp01(base, 0) * clamp01(level, 0), 0);
}

class AudioManager {
  constructor() {
    const s = loadSettings();
    this.volumes = volumeSettings(s);
    this.unmuteTo = s.unmuteTo ?? null; // タイトルのスピーカーで消す前の音量（もう一度押すと戻す）
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

  /** BGMも効果音も 0 なら消音（タイトルのスピーカーの表示に使う） */
  get muted() {
    return this.volumes.bgm === 0 && this.volumes.se === 0;
  }

  /** 保存する設定のうち、音の分（main.js の saveSettings も同じものを書く） */
  settingsPatch() {
    return { bgmVolume: this.volumes.bgm, seVolume: this.volumes.se, unmuteTo: this.unmuteTo };
  }

  /** 音量（0〜1）を変えて保存する。BGMにはその場で効き、効果音は次に鳴らすときから */
  setVolumes({ bgm = this.volumes.bgm, se = this.volumes.se } = {}) {
    this.volumes = { bgm: clamp01(bgm, DEFAULT_VOLUMES.bgm), se: clamp01(se, DEFAULT_VOLUMES.se) };
    saveSettings({ ...loadSettings(), ...this.settingsPatch() });
    if (this.bgm) {
      this.bgm.volume = mixVolume(BGM_BASE, this.volumes.bgm);
      if (this.bgm.paused && this.volumes.bgm > 0) this.bgm.play().catch(() => {});
    }
    this.listeners.forEach((fn) => fn(this.muted));
  }

  /** タイトルのスピーカー：両方を 0 にする。もう一度押すと、消す前の音量（無ければ 100%）に戻す */
  toggle() {
    if (this.muted) {
      const back = this.unmuteTo && (this.unmuteTo.bgm > 0 || this.unmuteTo.se > 0) ? this.unmuteTo : DEFAULT_VOLUMES;
      this.unmuteTo = null;
      this.setVolumes(back);
    } else {
      this.unmuteTo = { ...this.volumes };
      this.setVolumes({ bgm: 0, se: 0 });
    }
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
    a.volume = mixVolume(BGM_BASE, this.volumes.bgm);
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
    if (!this.unlocked || !FILES[name]) return;
    const vol = mixVolume(volume, this.volumes.se);
    if (vol <= 0) return;
    const now = performance.now();
    if (now - (this.lastSe[name] || 0) < SE_GAP_MS) return;
    this.lastSe[name] = now;
    const a = new Audio(FILES[name]);
    a.volume = vol;
    a.play().catch(() => {});
  }
}

export const audio = new AudioManager();

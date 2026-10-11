// キャラクターの吹き出し。トーストの代わりに「キャラクターが喋る」。
// - 吹き出しの大きさはセリフの長さに合わせてアニメーションで伸縮する
// - 文字は1文字ずつ表示し、その間はキャラクターを口パク画像に切り替える
// - 次のセリフが来たら、今の吹き出しから新しい大きさへ変形して続けて喋る

import { h } from "./h.js";

const MAX_WIDTH = 230;
const CHAR_MS = 32;

class Speech {
  constructor() {
    this.layer = document.getElementById("overlay");
    this.el = null;
    this.timers = [];
    this.onTalk = null;
  }

  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  measure(text) {
    const probe = h("div", { class: "speech-text speech-probe", style: { maxWidth: `${MAX_WIDTH}px` } }, text);
    this.layer.append(probe);
    const r = probe.getBoundingClientRect();
    probe.remove();
    return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
  }

  /**
   * anchor: 吹き出しのしっぽを向ける要素
   * opts.onTalk(talking: boolean): 口パク画像の切り替え用
   */
  say(text, anchor, { tone = "", onTalk = null, color = null } = {}) {
    if (!text || !anchor?.isConnected) return;
    this.clearTimers();
    if (this.onTalk && this.onTalk !== onTalk) this.onTalk(false);
    this.onTalk = onTalk;

    const a = anchor.getBoundingClientRect();
    const size = this.measure(text);
    const padX = 14;
    const padY = 9;
    const w = size.w + padX * 2;
    const hgt = size.h + padY * 2;
    const vw = window.innerWidth;
    const below = a.top < window.innerHeight * 0.55;
    let left = a.left + a.width / 2 - 26;
    left = Math.max(8, Math.min(vw - w - 8, left));
    const top = below ? a.bottom + 10 : a.top - hgt - 10;
    const tailX = Math.max(14, Math.min(w - 14, a.left + a.width / 2 - left));

    let el = this.el;
    const fresh = !el || !el.isConnected;
    if (fresh) {
      el = h("div", { class: "speech" }, h("div", { class: "speech-text" }), h("i", { class: "speech-tail" }));
      el.style.width = "28px";
      el.style.height = "28px";
      el.style.left = `${left + Math.min(tailX, 40) - 14}px`;
      el.style.top = `${top}px`;
      this.layer.append(el);
      this.el = el;
      void el.offsetWidth;
    }
    el.className = `speech show ${below ? "below" : "above"} ${tone}`;
    if (color) el.style.setProperty("--speaker", color);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${w}px`;
    el.style.height = `${hgt}px`;
    el.style.setProperty("--tail-x", `${tailX}px`);
    const textEl = el.querySelector(".speech-text");
    textEl.textContent = "";

    const chars = [...text];
    const startDelay = fresh ? 170 : 120;
    onTalk?.(true);
    chars.forEach((_, i) => {
      this.timers.push(setTimeout(() => (textEl.textContent = chars.slice(0, i + 1).join("")), startDelay + i * CHAR_MS));
    });
    const typed = startDelay + chars.length * CHAR_MS;
    this.timers.push(setTimeout(() => onTalk?.(false), typed + 120));
    const hold = Math.min(3600, 1300 + chars.length * 70);
    this.timers.push(
      setTimeout(() => {
        el.classList.remove("show");
        el.classList.add("hide");
        this.timers.push(
          setTimeout(() => {
            if (this.el === el) this.el = null;
            el.remove();
          }, 260),
        );
      }, typed + hold),
    );
  }

  dismiss() {
    this.clearTimers();
    this.onTalk?.(false);
    this.el?.remove();
    this.el = null;
  }
}

export const speech = new Speech();

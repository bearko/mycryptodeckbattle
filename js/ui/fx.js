// 操作へのフィードバック演出（カードの移動、コイン、はじける光、数値のカウントアップ、紙吹雪、波紋）。

import { h } from "./h.js";

function layer() {
  return document.getElementById("overlay");
}


/** 画像を from の位置から to の位置へ、弧を描いて飛ばす */
export function flyGhost(src, from, to, { duration = 420, pixel = true, delay = 0, size = null } = {}) {
  if (!from || !to) return Promise.resolve();
  const s = size ?? Math.min(from.width, from.height, 72);
  const el = h("img", { src, class: `fly-ghost${pixel ? " pixel" : ""}`, alt: "" });
  el.style.width = `${s}px`;
  el.style.height = `${s}px`;
  layer().append(el);
  const fx = from.left + from.width / 2 - s / 2;
  const fy = from.top + from.height / 2 - s / 2;
  const tx = to.left + to.width / 2 - s / 2;
  const ty = to.top + to.height / 2 - s / 2;
  const mx = (fx + tx) / 2;
  const my = Math.min(fy, ty) - 60;
  const anim = el.animate(
    [
      { transform: `translate(${fx}px, ${fy}px) scale(1)`, opacity: 1 },
      { transform: `translate(${mx}px, ${my}px) scale(1.25) rotate(-8deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${tx}px, ${ty}px) scale(1)`, opacity: 1 },
    ],
    { duration, delay, easing: "cubic-bezier(.45,.05,.3,1)", fill: "both" },
  );
  return anim.finished.then(() => el.remove()).catch(() => el.remove());
}

/** 中心から光の粒がはじける */
export function burst(x, y, { color = "#ffd23f", count = 14, spread = 70, size = 6 } = {}) {
  const host = layer();
  for (let i = 0; i < count; i++) {
    const p = h("i", { class: "burst-dot" });
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const d = spread * (0.6 + Math.random() * 0.6);
    p.style.background = color;
    p.style.width = p.style.height = `${size * (0.6 + Math.random() * 0.8)}px`;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    host.append(p);
    p.animate(
      [
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.2)`, opacity: 0 },
      ],
      { duration: 520 + Math.random() * 200, easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards" },
    ).finished.then(() => p.remove());
  }
  const ring = h("i", { class: "burst-ring" });
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.borderColor = color;
  host.append(ring);
  ring
    .animate(
      [
        { transform: "translate(-50%,-50%) scale(0.2)", opacity: 0.9 },
        { transform: "translate(-50%,-50%) scale(2.4)", opacity: 0 },
      ],
      { duration: 520, easing: "ease-out", fill: "forwards" },
    )
    .finished.then(() => ring.remove());
}

export function centerOfRect(r) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** GUMのコインを from から to 要素へ飛ばす */
export function coins(from, toEl, count = 5) {
  if (!from || !toEl?.isConnected) return;
  const to = toEl.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const jitter = { left: from.left + (Math.random() - 0.5) * 30, top: from.top + (Math.random() - 0.5) * 30, width: from.width, height: from.height };
    flyGhost("assets/icons/gum.png", jitter, to, { duration: 520, delay: i * 55, pixel: false, size: 20 });
  }
  setTimeout(() => pop(toEl), 520 + count * 55);
}

/** 要素を一瞬ポンと弾ませる */
export function pop(el, cls = "pop") {
  if (!el?.isConnected) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** 数値をカウントアップ/ダウンさせる */
export function countUp(el, from, to, { duration = 420, format = (v) => String(v) } = {}) {
  if (!el?.isConnected || from === to) return;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = format(Math.round(from + (to - from) * e));
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  pop(el.closest(".gum") ?? el, to > from ? "gain" : "spend");
}

/** 画面を揺らす */
export function shake(el, strength = 1) {
  if (!el?.isConnected) return;
  const s = 4 * strength;
  el.animate(
    [
      { transform: "translate(0,0)" },
      { transform: `translate(${-s}px, ${s * 0.6}px)` },
      { transform: `translate(${s}px, ${-s * 0.4}px)` },
      { transform: `translate(${-s * 0.6}px, ${-s * 0.6}px)` },
      { transform: `translate(${s * 0.4}px, ${s * 0.3}px)` },
      { transform: "translate(0,0)" },
    ],
    { duration: 260, easing: "ease-out" },
  );
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // 対応していない端末では何もしない
  }
}

/** ボタンを押したときの波紋（全ボタン共通） */
export function installRipple() {
  document.addEventListener(
    "pointerdown",
    (e) => {
      const btn = e.target.closest(".btn, .icon-btn, .choice-card, .player-tab, .slot, .offer");
      if (!btn || btn.disabled) return;
      const r = btn.getBoundingClientRect();
      const dot = h("i", { class: "ripple" });
      const size = Math.max(r.width, r.height) * 1.6;
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left - size / 2}px`;
      dot.style.top = `${e.clientY - r.top - size / 2}px`;
      btn.append(dot);
      setTimeout(() => dot.remove(), 520);
      haptic(6);
    },
    { passive: true },
  );
}

// ---------------------------------------------------------------------------
// 紙吹雪（MCHの金宝箱演出のパラメータ: 12色パレット・粒子120・速度2 を参考にした軽量版）
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = [
  "30,144,255",
  "107,142,35",
  "255,215,0",
  "255,192,203",
  "106,90,205",
  "173,216,230",
  "238,130,238",
  "152,251,152",
  "70,130,180",
  "244,164,96",
  "210,105,30",
  "220,20,60",
];

export function confetti({ duration = 1800, count = 120 } = {}) {
  const canvas = h("canvas", { class: "confetti" });
  layer().append(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const hgt = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * -hgt * 0.6,
    r: 4 + Math.random() * 6,
    c: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
    tilt: Math.random() * 10 - 10,
    ta: Math.random() * Math.PI,
    vy: 2 + Math.random() * 2.5,
    vx: Math.random() * 2 - 1,
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, w, hgt);
    const fade = t > duration ? Math.max(0, 1 - (t - duration) / 500) : 1;
    for (const p of parts) {
      p.ta += 0.07;
      p.x += p.vx + Math.sin(p.ta) * 0.6;
      p.y += p.vy;
      p.tilt = Math.sin(p.ta) * 12;
      ctx.beginPath();
      ctx.lineWidth = p.r / 2;
      ctx.strokeStyle = `rgba(${p.c},${fade})`;
      ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
      ctx.stroke();
    }
    if (fade > 0 && canvas.isConnected) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** 売却時: 画像がくるりと縮んで消える */
export function dissolve(src, rect, { pixel = true } = {}) {
  if (!rect) return;
  const s = Math.min(rect.width, rect.height, 72);
  const el = h("img", { src, class: `fly-ghost${pixel ? " pixel" : ""}`, alt: "" });
  el.style.width = `${s}px`;
  el.style.height = `${s}px`;
  layer().append(el);
  const x = rect.left + rect.width / 2 - s / 2;
  const y = rect.top + rect.height / 2 - s / 2;
  el.animate(
    [
      { transform: `translate(${x}px, ${y}px) scale(1) rotate(0deg)`, opacity: 1, filter: "brightness(1)" },
      { transform: `translate(${x}px, ${y - 20}px) scale(1.15) rotate(-10deg)`, opacity: 1, filter: "brightness(2.5)", offset: 0.3 },
      { transform: `translate(${x}px, ${y - 30}px) scale(0.1) rotate(25deg)`, opacity: 0, filter: "brightness(3)" },
    ],
    { duration: 480, easing: "ease-in", fill: "forwards" },
  ).finished.then(() => el.remove());
}

// バトルの「誰が・誰に・何をしたか」を見せる演出。
// 発動したヒーローから対象へ弾・光線を飛ばし、役割ごとの色とMCHのアイコンで行動の種類を示す。
// 毒・出血は MCH の状態異常アイコンに加え、独自のベクター素材（assets/vfx/）で「くらっている感」を出す。

import { h, img } from "./h.js";
import { KIND_ICONS } from "../engine/content.js";

const VFX = {
  shield: "assets/vfx/shield.svg",
  bubble: "assets/vfx/poison-bubble.svg",
  cloud: "assets/vfx/poison-cloud.svg",
  glob: "assets/vfx/poison-glob.svg",
  drop: "assets/vfx/blood-drop.svg",
  splat: "assets/vfx/blood-splat.svg",
  slash: "assets/vfx/slash.svg",
};

/** 役割ごとの表示（ラベルはバトル中に出す短い語） */
export const ROLES = {
  damage: { label: "攻撃", color: "#ff9a3c" },
  heal: { label: "回復", color: "#6dff9a" },
  shield: { label: "防御", color: "#5fe3ff" },
  bleed: { label: "出血", color: "#ff3d6e" },
  poison: { label: "毒", color: "#b46cff" },
  buff: { label: "強化", color: "#ffd23f" },
  haste: { label: "加速", color: "#ffd23f" },
  slow: { label: "減速", color: "#ff7a45" },
  weaken: { label: "弱体", color: "#ff7a45" },
};

export const roleColor = (kind) => ROLES[kind]?.color ?? "#ffffff";

const MAX_NODES = 90;

function place(layer, el, p) {
  if (layer.childElementCount > MAX_NODES) return null;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  layer.append(el);
  return el;
}

function vanish(el, anim) {
  anim.finished.then(() => el.remove(), () => el.remove());
  return anim;
}

const angleOf = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const rand = (min, max) => min + Math.random() * (max - min);

// ---------------------------------------------------------------------------
// 発動者
// ---------------------------------------------------------------------------

/** 発動したヒーローの周りに役割の色の輪を広げる */
export function castAura(layer, p, kind, size = 90) {
  const el = place(layer, h("i", { class: "cast-aura", style: { "--role": roleColor(kind), width: `${size}px`, height: `${size}px` } }), p);
  if (!el) return;
  vanish(
    el,
    el.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.4)", opacity: 0.95 },
        { transform: "translate(-50%,-50%) scale(1.25)", opacity: 0 },
      ],
      { duration: 460, easing: "cubic-bezier(.2,.8,.3,1)" },
    ),
  );
}

/** 発動したヒーローの上に「アイコン＋役割」のチップを出す */
export function roleChip(layer, p, kind, { compact = false, enemy = false } = {}) {
  const role = ROLES[kind];
  if (!role) return;
  const el = place(
    layer,
    h(
      "div",
      { class: `role-chip${compact ? " compact" : ""}${enemy ? " enemy" : ""}`, style: { "--role": role.color } },
      img(KIND_ICONS[kind], "role-chip-icon"),
      compact ? null : h("span", null, role.label),
    ),
    p,
  );
  if (!el) return;
  vanish(
    el,
    el.animate(
      [
        { transform: "translate(-50%,-30%) scale(0.4)", opacity: 0 },
        { transform: "translate(-50%,-100%) scale(1.08)", opacity: 1, offset: 0.16 },
        { transform: "translate(-50%,-100%) scale(1)", opacity: 1, offset: 0.7 },
        { transform: "translate(-50%,-140%) scale(1)", opacity: 0 },
      ],
      { duration: compact ? 620 : 900, easing: "ease-out" },
    ),
  );
}

// ---------------------------------------------------------------------------
// 発動者 → 対象
// ---------------------------------------------------------------------------

/**
 * from から to へ弾を飛ばし、着弾したら resolve する。
 * 種類ごとに見た目を変える（攻撃=光の尾を引く弾、出血=血のしずく、毒=毒の塊、シールド=盾、回復=光の粒）。
 */
export function projectile(layer, from, to, kind, duration) {
  if (kind === "heal") return healStream(layer, from, to, duration);
  const angle = angleOf(from, to);
  let el;
  let frames;
  if (kind === "damage") {
    // 右端（光の先頭）が座標に来るよう、回転後に自身の幅だけ戻す（transform-origin: 0 0）
    el = h("i", { class: "shot", style: { "--role": roleColor(kind) } });
    frames = [
      { transform: `translate(${from.x}px, ${from.y}px) rotate(${angle}deg) translate(-100%, -50%)`, opacity: 0.8 },
      { transform: `translate(${to.x}px, ${to.y}px) rotate(${angle}deg) translate(-100%, -50%)`, opacity: 1 },
    ];
  } else {
    const src = kind === "bleed" ? VFX.drop : kind === "poison" ? VFX.glob : VFX.shield;
    const size = kind === "shield" ? 30 : 24;
    el = img(src, `shot-img ${kind}`);
    el.style.width = el.style.height = `${size}px`;
    // しずくの先端を進行方向へ向ける（素材は上向き）
    const spin = kind === "shield" ? 0 : angle + 90;
    // 毒は放物線、それ以外はまっすぐ
    const lift = kind === "poison" ? -60 : 0;
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + lift };
    frames = [
      { transform: `translate(${from.x}px, ${from.y}px) translate(-50%,-50%) rotate(${spin}deg) scale(0.5)` },
      { transform: `translate(${mid.x}px, ${mid.y}px) translate(-50%,-50%) rotate(${spin}deg) scale(1.15)` },
      { transform: `translate(${to.x}px, ${to.y}px) translate(-50%,-50%) rotate(${spin}deg) scale(1)` },
    ];
  }
  if (layer.childElementCount > MAX_NODES) return Promise.resolve();
  layer.append(el);
  return vanish(el, el.animate(frames, { duration, easing: "cubic-bezier(.45,0,.75,.6)" })).finished.catch(() => {});
}

function healStream(layer, from, to, duration) {
  const count = 4;
  for (let i = 0; i < count; i++) {
    const el = h("i", { class: "heal-mote" });
    if (layer.childElementCount > MAX_NODES) break;
    layer.append(el);
    const sway = rand(-40, 40);
    const mid = { x: (from.x + to.x) / 2 + sway, y: (from.y + to.y) / 2 };
    vanish(
      el,
      el.animate(
        [
          { transform: `translate(${from.x + rand(-16, 16)}px, ${from.y}px) scale(0.4)`, opacity: 0 },
          { transform: `translate(${mid.x}px, ${mid.y}px) scale(1.2)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${to.x + rand(-30, 30)}px, ${to.y}px) scale(0.7)`, opacity: 0.9 },
        ],
        { duration, delay: i * 45, easing: "ease-in-out", fill: "backwards" },
      ),
    );
  }
  return new Promise((r) => setTimeout(r, duration + (count - 1) * 45));
}

/** 発動者から対象のヒーローへ光線を伸ばす（強化・加速・減速・弱体） */
export function beam(layer, from, to, kind, duration = 420) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const el = place(
    layer,
    h("i", { class: `beam ${kind}`, style: { "--role": roleColor(kind), width: `${len}px`, transform: `rotate(${angleOf(from, to)}deg)` } }),
    from,
  );
  if (!el) return;
  vanish(
    el,
    el.animate(
      [
        { clipPath: "inset(0 100% 0 0)", opacity: 1 },
        { clipPath: "inset(0 0 0 0)", opacity: 1, offset: 0.4 },
        { clipPath: "inset(0 0 0 100%)", opacity: 0.2 },
      ],
      { duration, easing: "ease-out" },
    ),
  );
}

/** 着弾点の衝撃（色付きの輪と光） */
export function impact(layer, p, kind, size = 70) {
  const el = place(layer, h("i", { class: "impact", style: { "--role": roleColor(kind), width: `${size}px`, height: `${size}px` } }), p);
  if (!el) return;
  vanish(
    el,
    el.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.2)", opacity: 1 },
        { transform: "translate(-50%,-50%) scale(1)", opacity: 0 },
      ],
      { duration: 380, easing: "cubic-bezier(.1,.8,.3,1)" },
    ),
  );
}

/** MCHのアイコンを対象の上にポンと出す（バフ・デバフ・状態異常） */
export function iconPop(layer, p, src, { size = 26, rise = 34 } = {}) {
  const el = place(layer, img(src, "icon-pop"), p);
  if (!el) return;
  el.style.width = el.style.height = `${size}px`;
  vanish(
    el,
    el.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.2)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(1.25)", opacity: 1, offset: 0.2 },
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.55 },
        { transform: `translate(-50%, calc(-50% - ${rise}px)) scale(0.9)`, opacity: 0 },
      ],
      { duration: 820, easing: "ease-out" },
    ),
  );
}

// ---------------------------------------------------------------------------
// 出血
// ---------------------------------------------------------------------------

/** 一閃の斬撃 */
export function slash(layer, p, size = 80) {
  const el = place(layer, img(VFX.slash, "vfx-slash"), p);
  if (!el) return;
  el.style.width = el.style.height = `${size}px`;
  const r = rand(-20, 20);
  vanish(
    el,
    el.animate(
      [
        { transform: `translate(-50%,-50%) rotate(${r}deg) scale(0.6)`, clipPath: "inset(0 100% 100% 0)", opacity: 1 },
        { transform: `translate(-50%,-50%) rotate(${r}deg) scale(1)`, clipPath: "inset(0 0 0 0)", opacity: 1, offset: 0.35 },
        { transform: `translate(-50%,-50%) rotate(${r}deg) scale(1.05)`, clipPath: "inset(0 0 0 0)", opacity: 0 },
      ],
      { duration: 420, easing: "ease-out" },
    ),
  );
}

/** 血しぶき（中心の染みと、重力で落ちるしずく） */
export function bloodBurst(layer, p, { drops = 5, splat = true, scale = 1 } = {}) {
  if (splat) {
    const s = place(layer, img(VFX.splat, "vfx-splat"), p);
    if (s) {
      const size = 46 * scale;
      s.style.width = s.style.height = `${size}px`;
      const r = rand(0, 360);
      vanish(
        s,
        s.animate(
          [
            { transform: `translate(-50%,-50%) rotate(${r}deg) scale(0.2)`, opacity: 0.95 },
            { transform: `translate(-50%,-50%) rotate(${r}deg) scale(1)`, opacity: 0.9, offset: 0.18 },
            { transform: `translate(-50%,-50%) rotate(${r}deg) scale(1.05)`, opacity: 0 },
          ],
          { duration: 700, easing: "ease-out" },
        ),
      );
    }
  }
  for (let i = 0; i < drops; i++) {
    const d = place(layer, img(VFX.drop, "vfx-drop"), p);
    if (!d) break;
    const size = rand(7, 13) * scale;
    d.style.width = `${size}px`;
    d.style.height = `${size * 1.4}px`;
    const vx = rand(-55, 55) * scale;
    const up = rand(18, 42) * scale;
    const fall = rand(30, 60) * scale;
    const tilt = vx * 0.9;
    vanish(
      d,
      d.animate(
        [
          { transform: "translate(-50%,-50%) translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(-50%,-50%) translate(${vx * 0.55}px, ${-up}px) rotate(${tilt * 0.5}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(-50%,-50%) translate(${vx}px, ${fall}px) rotate(${tilt}deg)`, opacity: 0 },
        ],
        { duration: rand(520, 720), easing: "cubic-bezier(.3,.6,.6,1)" },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 毒
// ---------------------------------------------------------------------------

/** 毒のもや（ドクロ混じりの雲）がふくらんで消える */
export function poisonCloud(layer, p, size = 96) {
  const el = place(layer, img(VFX.cloud, "vfx-cloud"), p);
  if (!el) return;
  el.style.width = `${size}px`;
  el.style.height = `${size * 0.67}px`;
  vanish(
    el,
    el.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.3)", opacity: 0 },
        { transform: "translate(-50%,-60%) scale(1)", opacity: 0.95, offset: 0.3 },
        { transform: "translate(-50%,-95%) scale(1.25)", opacity: 0 },
      ],
      { duration: 900, easing: "ease-out" },
    ),
  );
}

/** 毒の泡がぶくぶく上って弾ける */
export function poisonBubbles(layer, p, { count = 5, spread = 60, scale = 1 } = {}) {
  for (let i = 0; i < count; i++) {
    const b = place(layer, img(VFX.bubble, "vfx-bubble"), { x: p.x + rand(-spread, spread) / 2, y: p.y + rand(-6, 6) });
    if (!b) break;
    const size = rand(8, 16) * scale;
    b.style.width = b.style.height = `${size}px`;
    const rise = rand(30, 60) * scale;
    const sway = rand(-10, 10);
    vanish(
      b,
      b.animate(
        [
          { transform: "translate(-50%,-50%) scale(0.3)", opacity: 0 },
          { transform: `translate(calc(-50% + ${sway}px), calc(-50% - ${rise * 0.4}px)) scale(1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(calc(-50% - ${sway}px), calc(-50% - ${rise * 0.85}px)) scale(1)`, opacity: 1, offset: 0.82 },
          { transform: `translate(-50%, calc(-50% - ${rise}px)) scale(1.7)`, opacity: 0 },
        ],
        { duration: rand(650, 950), delay: i * 60, easing: "ease-out", fill: "backwards" },
      ),
    );
  }
}

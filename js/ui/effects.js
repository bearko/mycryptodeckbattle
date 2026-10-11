// バトル演出: MCHのバトルエフェクトスプライトと、ダメージ数値のポップアップ。

import { h } from "./h.js";

const SPRITES = {
  damage: { src: "assets/effects/01_single_damage.png", cols: 9, frames: 81 },
  area: { src: "assets/effects/02_area_damage.png", cols: 8, frames: 64 },
  heal: { src: "assets/effects/03_heal_resurrection.png", cols: 6, frames: 36 },
  buff: { src: "assets/effects/04_buff.png", cols: 9, frames: 81 },
  debuff: { src: "assets/effects/05_debuff_status_effect.png", cols: 7, frames: 49 },
};

const FRAME_SIZE = 100;
const MAX_ACTIVE = 14;
let active = 0;

/** layer 内の (x, y) を中心にスプライトを1回再生する */
export function playSprite(layer, key, x, y, { scale = 1.4, speed = 1 } = {}) {
  const sprite = SPRITES[key];
  if (!sprite || active >= MAX_ACTIVE) return;
  active += 1;
  const size = FRAME_SIZE * scale;
  const el = h("div", {
    class: "fx-sprite",
    style: {
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      backgroundImage: `url(${sprite.src})`,
      backgroundSize: `${sprite.cols * size}px auto`,
    },
  });
  layer.append(el);
  const step = Math.max(1, Math.round(1.5 * speed));
  let frame = 0;
  const tick = () => {
    if (frame >= sprite.frames || !el.isConnected) {
      el.remove();
      active -= 1;
      return;
    }
    const col = frame % sprite.cols;
    const row = Math.floor(frame / sprite.cols);
    el.style.backgroundPosition = `${-col * size}px ${-row * size}px`;
    frame += step;
    requestAnimationFrame(tick);
  };
  tick();
}

/** layer 内の (x, y) にテキストをポップアップさせる */
export function popText(layer, text, x, y, cls = "") {
  if (layer.childElementCount > 60) return null;
  const el = h("div", { class: `pop-text ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, text);
  layer.append(el);
  setTimeout(() => el.remove(), 1100);
  return el;
}

/** layer を基準にした要素の中心座標 */
export function centerOf(el, layer) {
  const a = el.getBoundingClientRect();
  const b = layer.getBoundingClientRect();
  return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
}

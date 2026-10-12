// バトルの背景: MCHのバトル背景の上に、ゼンレスゾーンゼロのUIのような「デザインされた帯（リボン）」を
// 何本も斜めに重ね、ゆっくり流し続ける。帯の記号はベクター（SVG）、文字はHTML。
// UIより目立たないよう、帯は半透明で彩度もUIより控えめにする。

import { h } from "./h.js";

// 帯に入れる記号（currentColor で帯ごとに色を変える）
const GLYPHS = {
  chevrons:
    '<svg viewBox="0 0 40 16" aria-hidden="true"><path fill="currentColor" d="M0 0h6l8 8-8 8H0l8-8zM13 0h6l8 8-8 8h-6l8-8zM26 0h6l8 8-8 8h-6l8-8z"/></svg>',
  chevronsBack:
    '<svg viewBox="0 0 40 16" aria-hidden="true"><path fill="currentColor" d="M40 0h-6l-8 8 8 8h6l-8-8zM27 0h-6l-8 8 8 8h6l-8-8zM14 0H8L0 8l8 8h6L6 8z"/></svg>',
  star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0l1.7 6.3L16 8l-6.3 1.7L8 16l-1.7-6.3L0 8l6.3-1.7z"/></svg>',
  slashes:
    '<svg viewBox="0 0 36 16" aria-hidden="true"><path fill="currentColor" d="M0 16 6 0h5L5 16zM10 16 16 0h5l-6 16zM20 16 26 0h5l-6 16z"/></svg>',
  target:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="5.5"/><path d="M8 0v5M8 11v5M0 8h5M11 8h5"/></g></svg>',
  barcode: (() => {
    const widths = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3];
    let x = 0;
    const bars = widths
      .map((w, i) => {
        const r = i % 2 === 0 ? `<rect x="${x}" y="0" width="${w}" height="16"/>` : "";
        x += w;
        return r;
      })
      .join("");
    return `<svg viewBox="0 0 ${x} 16" aria-hidden="true"><g fill="currentColor">${bars}</g></svg>`;
  })(),
  dots: '<svg viewBox="0 0 30 16" aria-hidden="true"><g fill="currentColor"><rect x="0" y="5" width="6" height="6"/><rect x="12" y="5" width="6" height="6"/><rect x="24" y="5" width="6" height="6"/></g></svg>',
};

const glyph = (name) => h("span", { class: `rb-glyph ${name}`, html: GLYPHS[name] });
const word = (text, cls = "") => h("span", { class: `rb-word ${cls}` }, text);

const COPIES = 6;

/** 帯を1本作る。中身を COPIES 回並べ、1つぶん横に流してつなぎ目なく繰り返す */
function ribbon(cls, segment, { top, angle, duration, reverse = false }) {
  return h(
    "div",
    { class: `ribbon ${cls}`, style: { top, transform: `rotate(${angle}deg)` } },
    h(
      "div",
      { class: "ribbon-track", style: { animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" } },
      Array.from({ length: COPIES }, () => h("div", { class: "rb-seg" }, segment())),
    ),
  );
}

/**
 * バトル背景を作る。
 * background: MCHの背景画像のURL / stage: ステージ数 / enemy・ally: 帯に入れる陣営名
 */
export function battleBackdrop({ background, stage, enemy, ally }) {
  const nn = String(stage).padStart(2, "0");
  return h(
    "div",
    { class: "battle-backdrop", "aria-hidden": "true" },
    h("div", { class: "bd-image", style: { backgroundImage: `url("${background}")` } }),
    h("div", { class: "bd-shade" }),
    // 大きな袋文字（いちばん奥）
    ribbon("rb-giant", () => [word("BATTLE"), glyph("star"), word(`STAGE ${nn}`), glyph("star")], {
      top: "38%",
      angle: -10,
      duration: 90,
    }),
    // タイトルのテープ（黒地に黄色）
    ribbon(
      "rb-title",
      () => [glyph("star"), word("MY CRYPTO HEROES"), glyph("chevrons"), word("DECK BATTLE"), glyph("slashes"), word(`STAGE ${nn}`), glyph("barcode")],
      { top: "11%", angle: -10, duration: 46 },
    ),
    // 注意テープ（交差させる）
    h("div", { class: "ribbon rb-caution", style: { top: "27%", transform: "rotate(15deg)" } }),
    // 敵陣の帯（赤）
    ribbon("rb-enemy", () => [word("ENEMY"), glyph("chevrons"), word(enemy, "jp"), glyph("target"), word("HOSTILE UNITS"), glyph("barcode")], {
      top: "43%",
      angle: -4,
      duration: 58,
      reverse: true,
    }),
    // 味方の帯（水色）
    ribbon(
      "rb-ally",
      () => [word("ALLY"), glyph("chevronsBack"), word(ally, "jp"), glyph("dots"), word("前衛・中衛・後衛", "jp"), glyph("star")],
      { top: "68%", angle: 6, duration: 52 },
    ),
    // 細い番号のテープ
    ribbon("rb-thin", () => [word("01"), glyph("dots"), word("02"), glyph("slashes"), word("03"), glyph("dots"), word("04"), word("////")], {
      top: "86%",
      angle: -10,
      duration: 70,
      reverse: true,
    }),
  );
}

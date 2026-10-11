// 画面遷移のワイプ演出。斜めの帯が画面を覆い、裏で画面を差し替えてから抜けていく。
// 覆う 280ms ＋ 抜ける 320ms ＝ 約600ms（短い尺で「めくる」快感を出す）。

import { h, img } from "./h.js";

let busy = false;

export function wipe(swap, { accent = "#ffd23f", label = "" } = {}) {
  const layer = document.getElementById("overlay");
  if (busy) {
    swap();
    return Promise.resolve();
  }
  busy = true;
  const el = h(
    "div",
    { class: "wipe", style: { "--accent": accent } },
    [0, 1, 2, 3, 4].map((i) => h("i", { style: { "--i": i } })),
    h("div", { class: "wipe-core" }, img("assets/characters/maycri_loop.gif", "pixel wipe-mascot"), label ? h("span", null, label) : null),
  );
  layer.append(el);
  return new Promise((resolve) => {
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => {
      swap();
      el.classList.add("out");
      setTimeout(() => {
        el.remove();
        busy = false;
        resolve();
      }, 360);
    }, 300);
  });
}

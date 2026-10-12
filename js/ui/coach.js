// チュートリアルの案内: 対象の要素をスポットライトで光らせ、マインが吹き出しで説明する。
// 画面の操作はそのままできる（案内の枠はタップを通す）。画面が描き直されたら update() で位置を合わせ直す。

import { h, img } from "./h.js";

const MINE = "assets/characters/navi_ain_pointer.png";

export class Coach {
  constructor(host) {
    this.host = host;
    this.step = null;
    this.el = null;
  }

  /** step: { text, target?, button?, onOk? } */
  show(step) {
    const same = this.step && this.step.text === step.text && this.el?.isConnected;
    this.step = step;
    if (!same) {
      this.hide();
      this.ring = h("div", { class: "coach-ring" });
      this.bubble = h(
        "div",
        { class: "coach-bubble" },
        h("div", { class: "coach-face" }, img(MINE, "pixel", "マイン")),
        h(
          "div",
          { class: "coach-body" },
          h("b", { class: "coach-name" }, "マイン"),
          h("p", null, step.text),
          step.button ? h("button", { class: "btn small primary coach-ok", onClick: () => step.onOk?.() }, step.button) : null,
        ),
      );
      this.el = h("div", { class: "coach" }, this.ring, this.bubble);
      this.host.append(this.el);
    }
    this.place();
  }

  /** 対象の位置に枠を合わせ、吹き出しを対象と反対側（上下）に置く */
  place() {
    if (!this.el) return;
    const target = this.step.target ? document.querySelector(this.step.target) : null;
    const r = target?.getBoundingClientRect();
    const visible = r && r.width > 0 && r.height > 0;
    this.ring.hidden = !visible;
    this.el.classList.toggle("no-target", !visible);
    if (visible) {
      const pad = 6;
      Object.assign(this.ring.style, {
        left: `${r.left - pad}px`,
        top: `${r.top - pad}px`,
        width: `${r.width + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
      });
    }
    const lower = visible && r.top + r.height / 2 > window.innerHeight * 0.5;
    this.bubble.classList.toggle("top", lower);
    this.bubble.classList.toggle("bottom", !lower);
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }

  clear() {
    this.hide();
    this.step = null;
  }
}

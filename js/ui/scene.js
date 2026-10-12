// ストーリーのシーン（会話劇）を再生する。台本は js/story/scenes.js。
// 背景・立ち絵・名前つきの会話枠。タップで次へ、文字送り中のタップは全文表示。SKIP で最後まで飛ばす。
// 立ち絵は2体まで: 左はクリス（exit / enter で消す・出す）、右はそれ以外の誰か1体（新しく出ると入れ替わる）。
// 右の役はクリスの方（左）を向く。立ち絵を出さずに話すときは say に offscreen: true。

import { h, img } from "./h.js";
import { shake } from "./fx.js";
import { machineByLevel } from "../engine/world.js";

const CHAR_MS = 28;
const DIR = "assets/characters/";

/** 主人公たちの表情（立ち絵） */
const CAST = {
  chris: {
    name: "クリス",
    color: "#8ee35a",
    faces: {
      normal: "chris_loop.gif",
      smile: "chris_smile.png",
      sad: "chris_sad.png",
      cheer: "chris_cheer.png",
      guts: "chris_guts.png",
      laugh: "chris_laugh.png",
      sparkle: "chris_sparkle.png",
      arms: "chris_arms_crossed.png",
      wave: "chris_wave.png",
      cry: "chris_cry_loop.gif",
    },
  },
  mine: {
    name: "マイン",
    color: "#4fd8ff",
    faces: {
      normal: "navi_ain_loop.gif",
      smile: "navi_ain_smile.png",
      sad: "navi_ain_sad.png",
      cheer: "navi_ain_cheer.png",
      arms: "navi_ain_arms_crossed.png",
      pointer: "navi_ain_pointer.png",
      sparkle: "navi_ain_sparkle.png",
      wave: "navi_ain_wave.png",
      wink: "navi_ain_wink.png",
      greet: "navi_ain_greeting_loop.gif",
    },
  },
};

const bgUrl = (id) => `assets/backgrounds/${id}.webp`;

export class ScenePlayer {
  /** scene: { bg, steps } / db: ヒーロー名・画像の参照用 */
  constructor(scene, { db }) {
    this.scene = scene;
    this.db = db;
    this.index = -1;
    this.actors = new Map();
    this.busy = false;
    this.typing = null;
    this.done = false;
    this.el = this.build();
    this.finished = new Promise((resolve) => (this.resolve = resolve));
  }

  build() {
    this.bgEl = h("div", { class: "scene-bg" });
    this.stage = h("div", { class: "scene-stage" });
    this.fxEl = h("div", { class: "scene-fx" });
    this.nameEl = h("div", { class: "scene-name" });
    this.textEl = h("div", { class: "scene-text" });
    this.box = h("div", { class: "scene-box" }, this.nameEl, this.textEl, h("span", { class: "scene-next", "aria-hidden": "true" }, "▼"));
    const skip = h(
      "button",
      {
        class: "btn small scene-skip",
        onClick: (e) => {
          e.stopPropagation();
          this.finish();
        },
      },
      "SKIP",
    );
    const el = h("div", { class: "screen scene-screen", onClick: () => this.next() }, this.bgEl, h("div", { class: "scene-shade" }), this.stage, this.fxEl, this.box, skip);
    if (this.scene.bg) this.setBg(this.scene.bg, true);
    return el;
  }

  start() {
    this.next();
    return this.finished;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    clearInterval(this.typing);
    this.el.classList.add("leave");
    setTimeout(() => this.resolve(), 260);
  }

  /** タップ: 文字送り中なら全文、そうでなければ次の手順 */
  next() {
    if (this.done) return;
    if (this.typing) {
      clearInterval(this.typing);
      this.typing = null;
      this.textEl.textContent = this.fullText;
      this.box.classList.add("ready");
      return;
    }
    if (this.busy) return;
    this.index += 1;
    const step = this.scene.steps[this.index];
    if (!step) return this.finish();
    this.run(step);
  }

  /** 台詞なしの手順は、演出が終わったら自動で次へ */
  auto(ms) {
    this.busy = true;
    setTimeout(() => {
      this.busy = false;
      this.next();
    }, ms);
  }

  run(step) {
    if (step.bg) {
      this.setBg(step.bg);
      return this.auto(350);
    }
    // enter / exit は fx（登場・退場のしかた）を持つので、単独の fx より先に見る
    if (step.enter) {
      this.showActor(step.enter, { image: step.image, fx: step.fx, name: step.name });
      return this.auto(step.fx === "drop" ? 650 : 380);
    }
    if (step.exit) {
      if (step.exit === "all") for (const key of [...this.actors.keys()]) this.hideActor(key, step.fx);
      else this.hideActor(step.exit, step.fx);
      return this.auto(500);
    }
    if (step.fx) return this.effect(step.fx);
    if (step.machine) return this.showMachine(step.machine, step.from);
    if (step.title) return this.showTitle(step.title, step.sub);
    if (step.narr) return this.speak(null, step.narr);
    if (step.say) {
      // offscreen: 立ち絵を出さず（入れ替えず）に話す。右にボスなどを出したまま、マインが説明するとき
      const actor = step.offscreen ? { el: null, info: this.cast(step.say, { face: step.face }) } : this.showActor(step.say, { face: step.face });
      return this.speak(actor, step.text);
    }
    this.next();
  }

  setBg(id, instant = false) {
    const layer = h("div", { class: `scene-bg-img${instant ? "" : " fade"}`, style: { backgroundImage: `url("${bgUrl(id)}")` } });
    this.bgEl.append(layer);
    const old = [...this.bgEl.children].slice(0, -1);
    setTimeout(() => old.forEach((o) => o.remove()), 700);
  }

  /** 役（chris / mine / hero:ID / enemy）の表示名・色・画像 */
  cast(key, { face, image, name } = {}) {
    if (CAST[key]) {
      const c = CAST[key];
      return { name: c.name, color: c.color, src: DIR + (c.faces[face] ?? c.faces.normal), pixel: true };
    }
    if (key.startsWith("hero:")) {
      const def = this.db.def(`h${key.slice(5)}`);
      return { name: def.name, color: "#ffd23f", src: def.image, pixel: true, hero: true };
    }
    // enemy: 通常のエネミー / boss: レイドボス（大きく描く。name で名前）。MCHのエネミーは元から左向き
    const prev = this.actors.get(key);
    return {
      name: name ?? prev?.info.name ?? "エネミー",
      color: "#ff4f6d",
      src: image ?? prev?.src,
      pixel: true,
      enemy: true,
      boss: key === "boss",
    };
  }

  showActor(key, { face, image, fx, name } = {}) {
    const info = this.cast(key, { face, image, name });
    // 左はクリスだけ。ほかは右（同じ位置にいる役は入れ替わる）
    const pos = key === "chris" ? "left" : "right";
    let actor = this.actors.get(key);
    if (!actor) {
      // 同じ位置にいる別の役は退場させる
      for (const [k, a] of this.actors) if (a.at === pos) this.hideActor(k);
      const el = h(
        "div",
        { class: `actor ${pos}${info.hero ? " hero" : ""}${info.enemy ? " enemy" : ""}${info.boss ? " boss" : ""}${fx === "drop" ? " drop" : " enter"}` },
        img(info.src, info.pixel ? "pixel" : "", info.name),
      );
      this.stage.append(el);
      actor = { el, at: pos, src: info.src, info };
      this.actors.set(key, actor);
    } else {
      if (actor.at !== pos) {
        actor.el.classList.remove(actor.at);
        actor.el.classList.add(pos);
        actor.at = pos;
      }
      const im = actor.el.querySelector("img");
      if (info.src && im.getAttribute("src") !== info.src) im.src = info.src;
    }
    for (const [k, a] of this.actors) a.el.classList.toggle("dim", k !== key);
    return { ...actor, info };
  }

  hideActor(key, fx) {
    const actor = this.actors.get(key);
    if (!actor) return;
    this.actors.delete(key);
    actor.el.classList.add(fx === "burst" ? "burst" : "leave");
    setTimeout(() => actor.el.remove(), 500);
  }

  speak(actor, text) {
    this.box.classList.remove("ready", "narr");
    if (actor) {
      this.nameEl.textContent = actor.info.name;
      this.nameEl.style.setProperty("--speaker", actor.info.color);
      this.nameEl.hidden = false;
      if (actor.el) {
        actor.el.classList.remove("talk");
        void actor.el.offsetWidth;
        actor.el.classList.add("talk");
      } else {
        for (const a of this.actors.values()) a.el.classList.add("dim");
      }
    } else {
      this.nameEl.hidden = true;
      this.box.classList.add("narr");
      for (const a of this.actors.values()) a.el.classList.add("dim");
    }
    this.fullText = text;
    const chars = [...text];
    let i = 0;
    this.textEl.textContent = "";
    this.typing = setInterval(() => {
      i += 1;
      this.textEl.textContent = chars.slice(0, i).join("");
      if (i >= chars.length) {
        clearInterval(this.typing);
        this.typing = null;
        this.box.classList.add("ready");
      }
    }, CHAR_MS);
  }

  effect(kind) {
    switch (kind) {
      case "shake":
        shake(this.el, 2);
        return this.auto(320);
      case "flash":
        this.flash("#ffffff");
        return this.auto(260);
      case "boom":
        this.flash("#4fd8ff");
        shake(this.el, 1.5);
        return this.auto(420);
      case "timeslip":
        return this.timeslip();
      default:
        return this.next();
    }
  }

  flash(color) {
    const f = h("i", { class: "scene-flash", style: { background: color } });
    this.fxEl.append(f);
    setTimeout(() => f.remove(), 500);
  }

  /** タイムスリップ: 時計の針が逆回りする渦の中を抜ける */
  timeslip() {
    this.busy = true;
    for (const k of [...this.actors.keys()]) this.hideActor(k);
    this.box.classList.add("hidden");
    const ring = (i) => h("i", { class: "ts-ring", style: { "--i": i } });
    const el = h(
      "div",
      { class: "timeslip" },
      [0, 1, 2, 3, 4, 5].map(ring),
      h("div", { class: "ts-clock" }, h("i", { class: "ts-hand long" }), h("i", { class: "ts-hand short" })),
      h("div", { class: "ts-label" }, "TIME SLIP"),
    );
    this.fxEl.append(el);
    setTimeout(() => {
      el.classList.add("out");
      this.box.classList.remove("hidden");
    }, 1500);
    setTimeout(() => {
      el.remove();
      this.busy = false;
      this.next();
    }, 1850);
  }

  /** タイムマシン（合体ロボ）の紹介。from があると改良の演出 */
  showMachine(level, from) {
    this.busy = true;
    const m = machineByLevel(level);
    const art = h("div", { class: "machine-art" }, img(m.image, "pixel", m.name));
    const card = h(
      "div",
      { class: `machine-reveal${from ? " upgrade" : ""}` },
      h("div", { class: "machine-rays" }),
      from ? h("div", { class: "machine-art old" }, img(machineByLevel(from).image, "pixel", "")) : null,
      art,
      h("div", { class: "machine-name" }, h("small", null, `TIME MACHINE Lv${m.level}`), m.name),
    );
    this.fxEl.append(card);
    this.box.classList.add("hidden");
    setTimeout(() => {
      this.busy = false;
      this.box.classList.remove("hidden");
      card.classList.add("docked");
      this.next();
    }, from ? 2400 : 1500);
    setTimeout(() => card.remove(), from ? 6000 : 5200);
  }

  showTitle(title, sub) {
    this.busy = true;
    const el = h("div", { class: "scene-title" }, h("small", null, sub ?? ""), h("b", null, title));
    this.fxEl.append(el);
    this.box.classList.add("hidden");
    setTimeout(() => {
      el.classList.add("out");
      this.box.classList.remove("hidden");
    }, 1500);
    setTimeout(() => {
      el.remove();
      this.busy = false;
      this.next();
    }, 1800);
  }
}

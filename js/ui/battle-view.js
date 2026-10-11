// バトル画面。エンジンを1ティックずつ進めながら描画する。
// 大きなダメージでは画面を揺らし、HPバーは白い残像を遅れて減らして「当たった感触」を出す。

import { h, img } from "./h.js";
import { playSprite, popText, centerOf } from "./effects.js";
import { createBattle, stepBattle } from "../engine/battle.js";
import { TICK, SUDDEN_DEATH_AT, PARTY_SIZE } from "../engine/balance.js";
import { KIND_ICONS } from "../engine/content.js";
import { bobDelay, effectShort, toast } from "./components.js";
import { shake } from "./fx.js";
import { ambient } from "./ambient.js";

const SPEEDS = [1, 2, 4];
const KIND_SE = {
  damage: "damage",
  shield: "buff",
  heal: "heal",
  bleed: "debuff",
  poison: "debuff",
  haste: "buff",
  buff: "buff",
  slow: "debuff",
  weaken: "debuff",
};

export class BattleView {
  constructor(app, prep) {
    this.app = app;
    this.prep = prep;
    this.battle = createBattle(prep.left, prep.right);
    this.speed = app.settings.speed || 1;
    this.cards = [new Map(), new Map()];
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.cutins = [];
    this.suddenShown = false;
    this.lastSkillPop = [0, 0];
    this.el = this.build();
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  sideView(index) {
    const side = this.battle.sides[index];
    const isPlayer = index === 0;
    const leader = side.leader;
    const head = h(
      "div",
      { class: "side-head" },
      h("div", { class: `side-leader${isPlayer ? "" : " enemy"}` }, img(leader.image, leader.pixelated ? "pixel" : "", leader.name)),
      h(
        "div",
        { class: "side-info" },
        h("div", { class: "side-name" }, side.name),
        h(
          "div",
          { class: "hpbar" },
          h("div", { class: "hpbar-trail" }),
          h("div", { class: "hpbar-fill" }),
          h("div", { class: "hpbar-shield" }),
          h("span", { class: "hpbar-text" }),
        ),
        h(
          "div",
          { class: "side-status" },
          h("span", { class: "st shield-st" }, img(KIND_ICONS.shield, "mini-icon"), h("b")),
          h("span", { class: "st bleed-st" }, img(KIND_ICONS.bleed, "mini-icon"), h("b")),
          h("span", { class: "st poison-st" }, img(KIND_ICONS.poison, "mini-icon"), h("b")),
        ),
      ),
    );
    const grid = h("div", { class: "battle-grid" });
    for (let slot = 0; slot < PARTY_SIZE; slot++) {
      const f = side.fighters.find((x) => x.slot === slot);
      if (!f) {
        grid.append(h("div", { class: "fighter empty" }));
        continue;
      }
      const card = h(
        "div",
        { class: `fighter r${f.rarity}`, style: { "--bd": bobDelay(slot + index * 3, 2.2) } },
        h("div", { class: "fighter-art" }, img(f.image, "pixel", f.name), h("span", { class: `lv lv${f.level}` }, `Lv${f.level}`)),
        h("div", { class: "charge" }, h("div", { class: "charge-fill" })),
        h("span", { class: "mult" }),
        f.multicast > 1 ? h("span", { class: "multicast" }, `×${f.multicast}`) : null,
      );
      const summary = `${f.name} Lv${f.level}　${f.effects
        .map((e) => `[${e.trigger === "start" ? "開始" : `${f.cd}s`}] ${effectShort(e.kind, e.value)}`)
        .join("　")}`;
      card.title = summary;
      card.addEventListener("click", () => toast(summary));
      this.cards[index].set(slot, card);
      grid.append(card);
    }
    return h("div", { class: `battle-side ${isPlayer ? "player" : "enemy"}` }, isPlayer ? [grid, head] : [head, grid]);
  }

  build() {
    this.fx = h("div", { class: "fx-layer" });
    this.timerEl = h("div", { class: "timer" }, "0.0");
    this.speedBtns = SPEEDS.map((s) =>
      h("button", { class: `btn small${s === this.speed ? " active" : ""}`, onClick: () => this.setSpeed(s) }, `×${s}`),
    );
    const controls = h(
      "div",
      { class: "battle-controls" },
      this.speedBtns,
      h("button", { class: "btn small", onClick: () => this.skip() }, "SKIP"),
    );
    this.enemyView = this.sideView(1);
    this.playerView = this.sideView(0);
    this.centerEl = h("div", { class: "battle-center" }, h("div", { class: "stage-label" }, `STAGE ${this.app.run.stage}`), this.timerEl, controls);
    this.inner = h("div", { class: "battle-inner" }, this.enemyView, this.centerEl, this.playerView);
    return h("div", { class: "screen battle-screen" }, this.inner, this.fx);
  }

  setSpeed(s) {
    this.speed = s;
    this.app.settings.speed = s;
    this.app.saveSettings();
    this.speedBtns.forEach((b, i) => b.classList.toggle("active", SPEEDS[i] === s));
  }

  // -------------------------------------------------------------------------
  // 進行
  // -------------------------------------------------------------------------

  start() {
    this.update();
    this.showIntro(() => {
      this.running = true;
      this.last = performance.now();
      this.app.actions.battleSpeak("battle");
      this.handleEvents(stepBattle(this.battle));
      this.update();
      requestAnimationFrame((t) => this.frame(t));
    });
  }

  showIntro(done) {
    const [l, r] = this.battle.sides;
    const intro = h(
      "div",
      { class: "battle-intro" },
      h(
        "div",
        { class: "vs-half ally" },
        h("div", { class: `vs-figure${l.leader.pixelated ? "" : " mai"}` }, img(l.leader.image, l.leader.pixelated ? "pixel" : "")),
        h("div", { class: "vs-name" }, l.name),
      ),
      h(
        "div",
        { class: "vs-half enemy" },
        h("div", { class: "vs-name" }, r.name),
        h("div", { class: "vs-figure enemy" }, img(r.leader.image, "pixel")),
      ),
      h("div", { class: "vs-word" }, "VS"),
    );
    this.el.append(intro);
    setTimeout(() => {
      if (intro.isConnected) shake(this.el, 1.6);
    }, 520);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      intro.classList.add("leave");
      setTimeout(() => intro.remove(), 300);
      done();
    };
    intro.addEventListener("click", finish);
    setTimeout(finish, this.speed >= 4 ? 700 : 1500);
  }

  frame(now) {
    if (!this.running || !this.el.isConnected) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (!this.cutinActive) {
      this.acc += dt * this.speed;
      while (this.acc >= TICK && !this.battle.over) {
        this.acc -= TICK;
        this.handleEvents(stepBattle(this.battle));
      }
    }
    this.update();
    if (this.battle.over) this.finish();
    else requestAnimationFrame((t) => this.frame(t));
  }

  skip() {
    if (!this.running) return;
    this.fx.replaceChildren();
    while (!this.battle.over) stepBattle(this.battle);
    this.update();
    this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    setTimeout(() => this.app.actions.battleFinished(), 600);
  }

  // -------------------------------------------------------------------------
  // 描画
  // -------------------------------------------------------------------------

  update() {
    const b = this.battle;
    this.timerEl.textContent = b.time.toFixed(1);
    this.timerEl.classList.toggle("sudden", b.time >= SUDDEN_DEATH_AT);
    [this.playerView, this.enemyView].forEach((view, i) => {
      const side = b.sides[i];
      const hpRatio = Math.max(0, side.hp / side.maxHp);
      const width = `${hpRatio * 100}%`;
      const fill = view.querySelector(".hpbar-fill");
      fill.style.width = width;
      fill.classList.toggle("low", hpRatio < 0.25);
      view.querySelector(".hpbar-trail").style.width = width;
      view.querySelector(".hpbar-shield").style.width = `${Math.min(1, side.shield / side.maxHp) * 100}%`;
      view.querySelector(".hpbar-text").textContent = `${Math.ceil(side.hp)} / ${side.maxHp}`;
      setStatus(view.querySelector(".shield-st"), Math.round(side.shield));
      setStatus(view.querySelector(".bleed-st"), side.bleed);
      setStatus(view.querySelector(".poison-st"), side.poison);
      for (const f of side.fighters) {
        const card = this.cards[i].get(f.slot);
        if (!card) continue;
        const ratio = f.cd ? Math.min(1, f.charge / f.cd) : 0;
        card.querySelector(".charge-fill").style.width = `${ratio * 100}%`;
        card.querySelector(".charge").classList.toggle("ready", ratio > 0.85);
        const mult = card.querySelector(".mult");
        const pct = Math.round((f.mult - 1) * 100);
        mult.textContent = pct ? `${pct > 0 ? "+" : ""}${pct}%` : "";
        mult.className = `mult${pct > 0 ? " up" : pct < 0 ? " down" : ""}`;
      }
    });
  }

  sideEl(index) {
    return index === 0 ? this.playerView : this.enemyView;
  }

  hpPoint(index) {
    const bar = this.sideEl(index).querySelector(".hpbar");
    const p = centerOf(bar, this.el);
    return { x: p.x + (Math.random() - 0.5) * 80, y: p.y - 6 };
  }

  gridPoint(index) {
    return centerOf(this.sideEl(index).querySelector(".battle-grid"), this.el);
  }

  cardPoint(index, slot) {
    const card = this.cards[index].get(slot);
    return card ? centerOf(card, this.el) : this.gridPoint(index);
  }

  bump(index, slot) {
    const card = this.cards[index].get(slot);
    if (!card) return;
    card.classList.remove("cast");
    void card.offsetWidth;
    card.classList.add("cast");
  }

  /** 発動したスキル名を小さく出す（等速のときだけ。出しすぎないよう間引く） */
  skillPop(sideIndex, slot) {
    if (this.speed > 1) return;
    const now = performance.now();
    if (now - this.lastSkillPop[sideIndex] < 650) return;
    this.lastSkillPop[sideIndex] = now;
    const f = this.battle.sides[sideIndex].fighters.find((x) => x.slot === slot);
    if (!f) return;
    const p = this.cardPoint(sideIndex, slot);
    const el = h("div", { class: `skill-pop${sideIndex === 1 ? " enemy" : ""}` }, this.app.db.def(f.defId).skill_name);
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y - 30}px`;
    this.el.append(el);
    setTimeout(() => el.remove(), 900);
  }

  hit(sideIndex, value) {
    const side = this.battle.sides[sideIndex];
    const ratio = value / side.maxHp;
    const head = this.sideEl(sideIndex).querySelector(".side-head");
    head.classList.remove("hit");
    void head.offsetWidth;
    head.classList.add("hit");
    if (ratio >= 0.06) {
      shake(this.inner, Math.min(2.2, ratio * 14));
      ambient?.pulse();
    }
  }

  handleEvents(events) {
    const fast = this.speed >= 4;
    for (const ev of events) {
      switch (ev.type) {
        case "cast":
          this.bump(ev.side, ev.slot);
          if (ev.trigger === "start") this.queueCutin(ev.side, ev.slot);
          else this.skillPop(ev.side, ev.slot);
          break;
        case "effect":
          this.showEffect(ev, fast);
          break;
        case "dot": {
          const p = this.hpPoint(ev.side);
          popText(this.el, `-${ev.value}`, p.x, p.y, `dot ${ev.kind}`);
          break;
        }
        case "sudden":
          if (!this.suddenShown) {
            this.suddenShown = true;
            this.banner("サドンデス");
          }
          if (!fast || this.battle.sudden % 2 === 0) {
            for (const i of [0, 1]) {
              const p = this.gridPoint(i);
              playSprite(this.el, "area", p.x, p.y, { scale: 2, speed: this.speed });
            }
          }
          for (const i of [0, 1]) {
            const p = this.hpPoint(i);
            popText(this.el, `-${ev.value}`, p.x, p.y, "sudden");
          }
          shake(this.inner, 0.8);
          this.app.audio.se("area", 0.4);
          break;
        case "extensions":
          this.bannerSide(ev.side, "EXTENSION");
          this.app.audio.se("buff", 0.4);
          break;
        default:
          break;
      }
    }
  }

  showEffect(ev, fast) {
    const foe = 1 - ev.side;
    const se = KIND_SE[ev.kind];
    if (se) this.app.audio.se(se, 0.45);
    switch (ev.kind) {
      case "damage": {
        const p = this.hpPoint(foe);
        const ratio = ev.value / this.battle.sides[foe].maxHp;
        const el = popText(this.el, `-${ev.value}`, p.x, p.y, `damage${ratio >= 0.08 ? " big" : ""}`);
        if (el) el.style.setProperty("--fs", `${Math.round(18 + Math.min(18, ratio * 160))}px`);
        this.hit(foe, ev.value);
        if (!fast) {
          const g = this.gridPoint(foe);
          playSprite(this.el, "damage", g.x + (Math.random() - 0.5) * 120, g.y, { speed: this.speed });
        }
        break;
      }
      case "shield": {
        const p = this.hpPoint(ev.side);
        popText(this.el, `+${ev.value}`, p.x, p.y, "shield");
        if (!fast) {
          const c = this.cardPoint(ev.side, ev.slot);
          playSprite(this.el, "buff", c.x, c.y, { scale: 1, speed: this.speed });
        }
        break;
      }
      case "heal": {
        const p = this.hpPoint(ev.side);
        popText(this.el, `+${ev.value}`, p.x, p.y, "heal");
        if (!fast) {
          const g = this.gridPoint(ev.side);
          playSprite(this.el, "heal", g.x, g.y, { scale: 1.6, speed: this.speed });
        }
        break;
      }
      case "bleed":
      case "poison": {
        const p = this.hpPoint(foe);
        popText(this.el, `${ev.kind === "bleed" ? "出血" : "毒"}+${ev.value}`, p.x, p.y, ev.kind);
        if (!fast) {
          const g = this.gridPoint(foe);
          playSprite(this.el, "debuff", g.x, g.y, { scale: 1.2, speed: this.speed });
        }
        break;
      }
      case "haste":
      case "buff":
        for (const slot of ev.targets) {
          const c = this.cardPoint(ev.side, slot);
          popText(this.el, ev.kind === "haste" ? `+${ev.value}s` : `+${ev.value}%`, c.x, c.y - 20, "buff");
          if (!fast) playSprite(this.el, "buff", c.x, c.y, { scale: 0.9, speed: this.speed });
        }
        break;
      case "slow":
      case "weaken":
        for (const slot of ev.targets) {
          const c = this.cardPoint(foe, slot);
          popText(this.el, ev.kind === "slow" ? `-${ev.value}s` : `-${ev.value}%`, c.x, c.y - 20, "debuff");
          if (!fast) playSprite(this.el, "debuff", c.x, c.y, { scale: 0.9, speed: this.speed });
        }
        break;
      default:
        break;
    }
  }

  banner(text) {
    const el = h("div", { class: "battle-banner" }, text);
    this.el.append(el);
    setTimeout(() => el.remove(), 1400);
  }

  bannerSide(index, text) {
    const p = this.gridPoint(index);
    popText(this.el, text, p.x, p.y, "ext");
  }

  /** バトル開始時スキルの発動カットイン（MCHのパッシブカットイン演出） */
  queueCutin(sideIndex, slot) {
    if (this.speed >= 2) return;
    const f = this.battle.sides[sideIndex].fighters.find((x) => x.slot === slot);
    if (!f) return;
    this.cutins.push({ sideIndex, f });
    if (!this.cutinActive) this.nextCutin();
  }

  nextCutin() {
    const item = this.cutins.shift();
    if (!item || this.cutins.length > 4) {
      this.cutinActive = false;
      this.cutins = [];
      return;
    }
    this.cutinActive = true;
    const def = this.app.db.def(item.f.defId);
    const ally = item.sideIndex === 0;
    const el = h(
      "div",
      { class: `mch-passive-cutin-unit cutin ${ally ? "ally" : "opponent"}` },
      h(
        "div",
        { class: `mch-passive-cutin ${ally ? "mch-passive-cutin--ally" : "mch-passive-cutin--opponent"}` },
        h("div", { class: `mch-passive-cutin__shine mch-passive-cutin__shine--${ally ? "ally" : "opponent"}` }),
      ),
      h(
        "div",
        { class: "cutin-content" },
        img(item.f.image, "mch-passive-cutin-unit__image"),
        h("p", { class: "mch-passive-cutin-unit__skill-name" }, def.skill_name),
      ),
    );
    this.el.append(el);
    setTimeout(() => {
      el.remove();
      this.nextCutin();
    }, 800);
  }

  showResult(content) {
    this.el.append(content);
  }
}

function setStatus(el, value) {
  el.style.display = value > 0 ? "" : "none";
  el.querySelector("b").textContent = value;
}

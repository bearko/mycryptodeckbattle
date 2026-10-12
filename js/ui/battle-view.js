// バトル画面。エンジンを1ティックずつ進めながら描画する。
// 大きなダメージでは画面を揺らし、HPバーは白い残像を遅れて減らして「当たった感触」を出す。
// スキルは発動したヒーローから対象へ弾・光線を飛ばし、着弾してからHPや状態異常の表示を動かす
// （誰が・誰に・何をしたかを見せるため。結果は事前に確定しているので表示だけの遅延）。

import { h, img } from "./h.js";
import { playSprite, popText, centerOf } from "./effects.js";
import {
  ROLES,
  beam,
  bloodBurst,
  castAura,
  iconPop,
  impact,
  mainKind,
  poisonBubbles,
  poisonCloud,
  projectile,
  roleChip,
  slash,
} from "./battle-fx.js";
import { createBattle, stepBattle } from "../engine/battle.js";
import { TICK, SUDDEN_DEATH_AT, PARTY_SIZE, PARTY_COLS } from "../engine/balance.js";
import { COLUMN_NAMES, KIND_ICONS } from "../engine/content.js";
import { bobDelay, effectShort, toast } from "./components.js";
import { pop, shake } from "./fx.js";
import { battleBackdrop } from "./battle-backdrop.js";
import { ambient } from "./ambient.js";

const SPEEDS = [1, 2, 4];
// 弾が着弾するまでの時間（等速）。表示上のHP・状態異常はこの間だけ発動前の値を見せる
const FLIGHT_MS = 300;
const HOLD_MAX_MS = 700;
const BEAM_MS = 420;
const BEAM_REACH = 0.4;

// 盤面: 参考作のように手前（自分）と奥（敵）が向かい合い、全体を少し斜めにする。
// 地面の座標 X=左右(-1..1)、Z=奥(-1)〜手前(+1) を回転・遠近をつけて画面の % に写す。
// パーティの列（前衛・中衛・後衛）を奥行きの段に、2段を左右に置く（前衛ほど中央線に近い）。
const FIELD = {
  yaw: (7 * Math.PI) / 180, // 地面の回転（斜めに向かい合う）
  laneZ: [0.3, 0.62, 0.94], // 前衛・中衛・後衛の、中央線からの距離
  laneX: [0.27, 0.66, 0.3], // 列ごとの左右の広がり（列ごとにずらして重なりを減らす）
  center: 54, // 中央線の高さ（%）
  depth: 43, // 奥行き方向の広がり（%）
  width: 36, // 左右方向の広がり（%）
  persp: 0.2, // 奥ほど小さくする割合
};

/** 地面の座標を画面の % と大きさに写す */
function project(X, Z) {
  const c = Math.cos(FIELD.yaw);
  const sn = Math.sin(FIELD.yaw);
  const x = X * c - Z * sn;
  const z = X * sn + Z * c;
  const s = 1 + FIELD.persp * z;
  return { x: 50 + x * FIELD.width * s, y: FIELD.center + z * FIELD.depth, s, z };
}

/** 陣営と枠番号から地面の座標（敵は左右も反転して向かい合わせる） */
function slotGround(sideIndex, slot) {
  const lane = slot % PARTY_COLS;
  const row = Math.floor(slot / PARTY_COLS);
  const sign = sideIndex === 0 ? 1 : -1;
  return { X: (row === 0 ? -1 : 1) * FIELD.laneX[lane] * sign, Z: FIELD.laneZ[lane] * sign };
}

function polyline(points) {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/** 陣地（中央線から奥/手前の端まで）の輪郭 */
function sideArea(index) {
  const line = (Z) => Array.from({ length: 9 }, (_, i) => project(-1.15 + (2.3 * i) / 8, Z));
  const [z0, z1] = index === 0 ? [0, 1.12] : [-1.12, 0];
  return [...line(z0), ...line(z1).reverse()];
}

/** 地面（陣地の色分け・列の線・中央線）を SVG で描く */
function fieldFloor() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "field-floor");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  const line = (Z, X0 = -1.15, X1 = 1.15) => Array.from({ length: 9 }, (_, i) => project(X0 + ((X1 - X0) * i) / 8, Z));
  const add = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };
  add("polygon", { points: polyline(sideArea(1)), class: "floor-area enemy" });
  add("polygon", { points: polyline(sideArea(0)), class: "floor-area ally" });
  for (const sign of [-1, 1]) {
    FIELD.laneZ.forEach((z, lane) => {
      add("polyline", { points: polyline(line(z * sign, -1.05, 1.05)), class: `lane-line lane${lane} ${sign > 0 ? "ally" : "enemy"}` });
    });
  }
  add("polyline", { points: polyline(line(0)), class: "center-line" });
  return svg;
}
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
  constructor(app, prep, { background = null } = {}) {
    this.app = app;
    this.prep = prep;
    this.background = background;
    this.battle = createBattle(prep.left, prep.right);
    this.speed = app.settings.speed || 1;
    this.cards = [new Map(), new Map()];
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.cutins = [];
    this.suddenShown = false;
    this.hold = [null, null];
    this.pre = null;
    this.el = this.build();
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  /** 陣営の情報（リーダー・名前・HP・状態異常） */
  sideHead(index) {
    const side = this.battle.sides[index];
    const isPlayer = index === 0;
    const leader = side.leader;
    return h(
      "div",
      { class: `side side-head ${isPlayer ? "player" : "enemy"}` },
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
          h("div", { class: "hpbar-poison" }),
          h("div", { class: "hpbar-bleed" }),
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
  }

  /** 盤面の片側（中央線より奥=敵、手前=自分）。ヒーローは盤面の座標から位置を決める */
  sideZone(index) {
    const side = this.battle.sides[index];
    const isPlayer = index === 0;
    const top = isPlayer ? FIELD.center : 0;
    const height = isPlayer ? 100 - FIELD.center : FIELD.center;
    const zone = h(
      "div",
      { class: `side field-zone ${isPlayer ? "player" : "enemy"}`, style: { top: `${top}%`, height: `${height}%` } },
      h(
        "div",
        {
          class: "status-veil",
          style: {
            clipPath: `polygon(${sideArea(index)
              .map((q) => `${q.x.toFixed(2)}% ${(((q.y - top) / height) * 100).toFixed(2)}%`)
              .join(", ")})`,
          },
        },
        h(
          "div",
          { class: "veil-poison" },
          [8, 26, 47, 66, 84].map((left, i) =>
            h("img", { src: "assets/vfx/poison-bubble.svg", alt: "", style: { left: `${left}%`, animationDelay: `${(i * 0.53) % 2.6}s` } }),
          ),
        ),
        h(
          "div",
          { class: "veil-bleed" },
          [12, 37, 61, 88].map((left, i) =>
            h("img", { src: "assets/vfx/blood-drop.svg", alt: "", style: { left: `${left}%`, animationDelay: `${(i * 0.71) % 2.2}s` } }),
          ),
        ),
      ),
    );
    for (let slot = 0; slot < PARTY_SIZE; slot++) {
      const g = slotGround(index, slot);
      const p = project(g.X, g.Z);
      const f = side.fighters.find((x) => x.slot === slot);
      const pos = h("div", {
        class: "unit-pos",
        style: {
          left: `${p.x}%`,
          top: `${((p.y - top) / height) * 100}%`,
          zIndex: String(Math.round(10 + p.z * 10)),
          "--s": p.s.toFixed(3),
        },
      });
      zone.append(pos);
      if (!f) {
        pos.append(h("div", { class: "fighter empty" }, h("div", { class: "ground" })));
        continue;
      }
      const role = mainKind(f);
      const card = h(
        "div",
        { class: `fighter r${f.rarity}`, style: { "--bd": bobDelay(slot + index * 3, 2.2), "--role": ROLES[role]?.color } },
        h("div", { class: "ground" }),
        h("div", { class: "fighter-art" }, img(f.image, "pixel", f.name)),
        h("span", { class: `lv lv${f.level}` }, `Lv${f.level}`),
        img(KIND_ICONS[role], "role-badge", ROLES[role]?.label),
        h("div", { class: "charge" }, h("div", { class: "charge-fill" })),
        h("span", { class: "mult" }),
        f.multicast > 1 ? h("span", { class: "multicast" }, `×${f.multicast}`) : null,
      );
      const summary = `${f.name} Lv${f.level}（${COLUMN_NAMES[slot % PARTY_COLS]}）　${f.effects
        .map((e) => `[${e.trigger === "start" ? "開始" : `${f.cd}s`}] ${effectShort(e.kind, e.value)}`)
        .join("　")}`;
      card.title = summary;
      card.addEventListener("click", () => toast(summary));
      this.cards[index].set(slot, card);
      pos.append(card);
    }
    return zone;
  }

  /** 列の名前（前衛・中衛・後衛）を各列の端に置く。自分は左端、敵は右端 */
  laneTags() {
    const tags = [];
    for (const index of [0, 1]) {
      const sign = index === 0 ? 1 : -1;
      FIELD.laneZ.forEach((z, lane) => {
        const p = project(-1.02 * sign, z * sign);
        tags.push(
          h(
            "div",
            {
              class: `lane-tag ${index === 0 ? "player" : "enemy"} lane${lane}`,
              style: { left: `${Math.min(95, Math.max(5, p.x))}%`, top: `${p.y}%` },
            },
            COLUMN_NAMES[lane],
          ),
        );
      });
    }
    return tags;
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
    this.heads = [this.sideHead(0), this.sideHead(1)];
    this.zones = [this.sideZone(0), this.sideZone(1)];
    const floor = fieldFloor();
    this.floors = [floor.querySelector(".floor-area.ally"), floor.querySelector(".floor-area.enemy")];
    this.field = h("div", { class: "battle-field" }, floor, this.laneTags(), this.zones[1], this.zones[0]);
    const top = h("div", { class: "battle-top" }, h("div", { class: "stage-label" }, `STAGE ${this.app.run.stage}`), this.timerEl, controls);
    this.inner = h("div", { class: "battle-inner" }, top, this.heads[1], this.field, this.heads[0]);
    const backdrop = this.background
      ? battleBackdrop({
          background: this.background,
          stage: this.app.run.stage,
          enemy: this.battle.sides[1].name,
          ally: this.battle.sides[0].name,
        })
      : null;
    return h("div", { class: "screen battle-screen" }, backdrop, this.inner, this.fx);
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
      this.step();
      this.update();
      requestAnimationFrame((t) => this.frame(t));
    });
  }

  showIntro(done) {
    const [l, r] = this.battle.sides;
    const intro = h(
      "div",
      { class: "battle-intro" },
      // 盤面と同じ並び: 敵が上、自分が下
      h(
        "div",
        { class: "vs-half enemy" },
        h("div", { class: "vs-name" }, r.name),
        h("div", { class: "vs-figure enemy" }, img(r.leader.image, "pixel")),
      ),
      h(
        "div",
        { class: "vs-half ally" },
        h("div", { class: `vs-figure${l.leader.pixelated ? "" : " mai"}` }, img(l.leader.image, l.leader.pixelated ? "pixel" : "")),
        h("div", { class: "vs-name" }, l.name),
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

  /** 1ティック進める。表示を遅らせるために進める前の値を覚えておく */
  step() {
    this.pre = this.battle.sides.map((s) => ({ hp: s.hp, shield: s.shield, bleed: s.bleed, poison: s.poison }));
    this.handleEvents(stepBattle(this.battle));
  }

  frame(now) {
    if (!this.running || !this.el.isConnected) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    // チュートリアルの説明中（paused）は止める
    if (!this.cutinActive && !this.paused) {
      this.acc += dt * this.speed;
      while (this.acc >= TICK && !this.battle.over) {
        this.acc -= TICK;
        this.step();
      }
    }
    this.update();
    if (this.battle.over) this.finish();
    else requestAnimationFrame((t) => this.frame(t));
  }

  skip() {
    if (!this.running) return;
    this.skipped = true;
    this.hold = [null, null];
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

  /** 演出の続きを実行してよいか（スキップ・画面遷移後は何もしない） */
  alive() {
    return !this.skipped && this.el.isConnected;
  }

  // -------------------------------------------------------------------------
  // 描画
  // -------------------------------------------------------------------------

  /** 弾が飛んでいる間、その陣営のHP・シールド・状態異常は発動前の値を見せる */
  holdSide(index, ms) {
    if (!this.pre) return;
    const now = performance.now();
    const cur = this.hold[index];
    if (cur && cur.until > now) {
      cur.until = Math.min(cur.start + HOLD_MAX_MS, Math.max(cur.until, now + ms));
      return;
    }
    this.hold[index] = { start: now, until: now + ms, ...this.pre[index] };
  }

  shown(index) {
    const side = this.battle.sides[index];
    const hold = this.hold[index];
    if (hold && hold.until > performance.now() && !this.battle.over) return hold;
    return side;
  }

  update() {
    const b = this.battle;
    this.timerEl.textContent = b.time.toFixed(1);
    this.timerEl.classList.toggle("sudden", b.time >= SUDDEN_DEATH_AT);
    this.heads.forEach((view, i) => {
      const side = b.sides[i];
      const shown = this.shown(i);
      const zone = this.zones[i];
      const hpRatio = Math.max(0, shown.hp / side.maxHp);
      const width = `${hpRatio * 100}%`;
      const fill = view.querySelector(".hpbar-fill");
      fill.style.width = width;
      fill.classList.toggle("low", hpRatio < 0.25);
      view.querySelector(".hpbar-trail").style.width = width;
      view.querySelector(".hpbar-shield").style.width = `${Math.min(1, shown.shield / side.maxHp) * 100}%`;
      view.querySelector(".hpbar-text").textContent = `${Math.ceil(shown.hp)} / ${side.maxHp}`;
      setStatus(view.querySelector(".shield-st"), Math.round(shown.shield));
      setStatus(view.querySelector(".bleed-st"), shown.bleed);
      setStatus(view.querySelector(".poison-st"), shown.poison);
      // 毒・出血をくらっている間のもやとにじみ（スタックが多いほど濃い）
      for (const el of [view, zone, this.floors[i]]) {
        el.classList.toggle("poisoned", shown.poison > 0);
        el.classList.toggle("bleeding", shown.bleed > 0);
        if (el === this.floors[i]) continue;
        el.style.setProperty("--poison", Math.min(1, 0.45 + shown.poison / 30).toFixed(2));
        el.style.setProperty("--bleed", Math.min(1, 0.4 + shown.bleed / 25).toFixed(2));
      }
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
    return this.heads[index];
  }

  hpPoint(index) {
    const bar = this.sideEl(index).querySelector(".hpbar");
    const p = centerOf(bar, this.el);
    return { x: p.x + (Math.random() - 0.5) * 80, y: p.y - 6 };
  }

  statusPoint(index, kind) {
    const el = this.sideEl(index).querySelector(`.${kind}-st`);
    if (!el || el.style.display === "none") return this.hpPoint(index);
    return centerOf(el, this.el);
  }

  gridPoint(index) {
    return centerOf(this.zones[index], this.el);
  }

  cardPoint(index, slot) {
    const card = this.cards[index].get(slot);
    return card ? centerOf(card, this.el) : this.gridPoint(index);
  }

  /** そのパーティの、ランダムなヒーローの位置 */
  randomCardPoint(index) {
    const cards = [...this.cards[index].values()];
    if (!cards.length) return this.gridPoint(index);
    const p = centerOf(cards[Math.floor(Math.random() * cards.length)], this.el);
    return { x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 20 };
  }

  fighter(index, slot) {
    return this.battle.sides[index].fighters.find((x) => x.slot === slot);
  }

  bump(index, slot) {
    const card = this.cards[index].get(slot);
    if (!card) return;
    card.classList.remove("cast");
    void card.offsetWidth;
    card.classList.add("cast");
  }

  /** カードに一時的なクラスを付ける（受けた側のリアクション） */
  flashCard(index, slot, cls, color) {
    const card = this.cards[index].get(slot);
    if (!card) return;
    if (color) card.style.setProperty("--fx", color);
    card.classList.remove(cls);
    void card.offsetWidth;
    card.classList.add(cls);
    setTimeout(() => card.classList.remove(cls), 650);
  }

  flashSide(index, cls) {
    const view = this.zones[index];
    view.classList.remove(cls);
    void view.offsetWidth;
    view.classList.add(cls);
    clearTimeout(this[`t_${cls}${index}`]);
    this[`t_${cls}${index}`] = setTimeout(() => view.classList.remove(cls), 650);
  }

  statusChip(index, kind, cls) {
    pop(this.sideEl(index).querySelector(`.${kind}-st`), cls);
  }

  hpGlow(index, cls) {
    pop(this.sideEl(index).querySelector(".hpbar"), cls);
  }

  hit(sideIndex, value) {
    const side = this.battle.sides[sideIndex];
    const ratio = value / side.maxHp;
    const head = this.heads[sideIndex];
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
          this.showCast(ev, fast);
          break;
        case "effect":
          this.showEffect(ev, fast);
          break;
        case "dot":
          this.showDot(ev, fast);
          break;
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

  /** 発動したヒーロー: 踏み込み＋役割の色の輪＋「アイコン＋役割」 */
  showCast(ev, fast) {
    this.bump(ev.side, ev.slot);
    const f = this.fighter(ev.side, ev.slot);
    if (!f) return;
    const kind = f.effects.find((e) => e.trigger === ev.trigger)?.kind ?? mainKind(f);
    const c = this.cardPoint(ev.side, ev.slot);
    castAura(this.fx, c, kind);
    if (!fast) roleChip(this.fx, { x: c.x, y: c.y - 26 }, kind, { compact: this.speed > 1, enemy: ev.side === 1 });
    if (ev.trigger === "start") this.queueCutin(ev.side, ev.slot);
  }

  /** スキルの効果: 発動者から対象へ飛ばし、着弾してから数値と反応を出す */
  showEffect(ev, fast) {
    const foe = 1 - ev.side;
    const se = KIND_SE[ev.kind];
    if (se) this.app.audio.se(se, 0.45);
    const from = this.cardPoint(ev.side, ev.slot);
    const flight = fast ? 0 : Math.round(FLIGHT_MS / this.speed);
    // 弾を飛ばす種類: 着弾まで対象陣営の表示を止めておく
    const launch = (target, to, land) => {
      if (!flight) return land();
      this.holdSide(target, flight);
      projectile(this.fx, from, to, ev.kind, flight).then(() => this.alive() && land());
    };
    switch (ev.kind) {
      case "damage": {
        const to = this.hpPoint(foe);
        launch(foe, to, () => {
          const ratio = ev.value / this.battle.sides[foe].maxHp;
          const el = popText(this.el, `-${ev.value}`, to.x, to.y, `damage${ratio >= 0.08 ? " big" : ""}`);
          if (el) el.style.setProperty("--fs", `${Math.round(18 + Math.min(18, ratio * 160))}px`);
          impact(this.fx, to, "damage", 56 + Math.min(60, ratio * 300));
          this.hit(foe, ev.value);
          if (!fast) playSprite(this.el, "damage", to.x, to.y + 10, { scale: 1.2, speed: this.speed });
        });
        break;
      }
      case "heal": {
        const to = this.hpPoint(ev.side);
        launch(ev.side, to, () => {
          popText(this.el, `+${ev.value}`, to.x, to.y, "heal");
          this.hpGlow(ev.side, "glow-heal");
          if (!fast) playSprite(this.el, "heal", to.x, to.y, { scale: 1.1, speed: this.speed });
        });
        break;
      }
      case "shield": {
        const to = this.statusPoint(ev.side, "shield");
        launch(ev.side, to, () => {
          popText(this.el, `+${ev.value}`, to.x, to.y - 10, "shield");
          impact(this.fx, to, "shield", 54);
          this.hpGlow(ev.side, "glow-shield");
          this.statusChip(ev.side, "shield", "bump");
        });
        break;
      }
      case "bleed": {
        const to = this.hpPoint(foe);
        launch(foe, to, () => {
          slash(this.fx, to, 76);
          bloodBurst(this.fx, to, { drops: fast ? 2 : 5, splat: !fast });
          popText(this.el, `出血+${ev.value}`, to.x, to.y - 8, "bleed");
          this.statusChip(foe, "bleed", "bump");
        });
        break;
      }
      case "poison": {
        const to = this.hpPoint(foe);
        launch(foe, to, () => {
          if (!fast) poisonCloud(this.fx, to, 90);
          poisonBubbles(this.fx, to, { count: fast ? 2 : 5 });
          popText(this.el, `毒+${ev.value}`, to.x, to.y - 8, "poison");
          this.statusChip(foe, "poison", "bump");
        });
        break;
      }
      case "haste":
      case "buff":
      case "slow":
      case "weaken": {
        const friendly = ev.kind === "haste" || ev.kind === "buff";
        const targetSide = friendly ? ev.side : foe;
        const icon = KIND_ICONS[ev.kind];
        const text = { haste: `+${ev.value}s`, buff: `+${ev.value}%`, slow: `-${ev.value}s`, weaken: `-${ev.value}%` }[ev.kind];
        for (const slot of ev.targets) {
          const to = this.cardPoint(targetSide, slot);
          const land = () => {
            iconPop(this.fx, { x: to.x, y: to.y - 8 }, icon, { size: 28 });
            popText(this.el, text, to.x, to.y - 30, friendly ? "buff" : "debuff");
            if (friendly) this.flashCard(targetSide, slot, "buffed", ROLES[ev.kind].color);
            else this.flashCard(targetSide, slot, "debuffed");
            if (!fast) playSprite(this.el, friendly ? "buff" : "debuff", to.x, to.y, { scale: 0.9, speed: this.speed });
          };
          if (fast) {
            land();
            continue;
          }
          const ms = Math.round(BEAM_MS / this.speed);
          beam(this.fx, from, to, ev.kind, ms);
          setTimeout(() => this.alive() && land(), ms * BEAM_REACH);
        }
        break;
      }
      default:
        break;
    }
  }

  /** 毒・出血のダメージ: パーティ全体が「くらっている」反応をする */
  showDot(ev, fast) {
    const p = this.hpPoint(ev.side);
    popText(this.el, `-${ev.value}`, p.x, p.y, `dot ${ev.kind}`);
    this.statusChip(ev.side, ev.kind, "tick");
    if (ev.kind === "poison") {
      poisonBubbles(this.fx, p, { count: fast ? 2 : 4, spread: 90 });
      if (!fast) {
        poisonCloud(this.fx, this.randomCardPoint(ev.side), 76);
        iconPop(this.fx, this.statusPoint(ev.side, "poison"), KIND_ICONS.poison, { size: 24, rise: 26 });
      }
      this.flashSide(ev.side, "poison-tick");
    } else {
      bloodBurst(this.fx, p, { drops: fast ? 2 : 3, splat: false, scale: 0.8 });
      if (!fast) bloodBurst(this.fx, this.randomCardPoint(ev.side), { drops: 3, scale: 0.7 });
      this.flashSide(ev.side, "bleed-tick");
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

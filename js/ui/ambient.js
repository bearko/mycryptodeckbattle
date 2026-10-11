// 常に動き続ける背景レイヤー（「UIを死なせない」）。
// 画面を切り替えても残り続け、背景画像のゆっくりしたパン・漂うパーティクル・網点の流れを描く。
// 背景は彩度と明るさを落として、UI側を目立たせる（色使いの優先度）。

const PARTICLES = 28;

class Ambient {
  constructor() {
    this.root = document.getElementById("ambient");
    this.layers = [...this.root.querySelectorAll(".ambient-img")];
    this.front = 0;
    this.current = null;
    this.canvas = this.root.querySelector(".ambient-particles");
    this.ctx = this.canvas.getContext("2d");
    this.accent = "#ffd23f";
    this.particles = [];
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.loop(performance.now());
    });
    for (let i = 0; i < PARTICLES; i++) this.particles.push(this.spawn(true));
    this.last = performance.now();
    this.loop(this.last);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  spawn(anywhere = false) {
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 10,
      size: 2 + Math.random() * 4,
      speed: 6 + Math.random() * 18,
      sway: Math.random() * Math.PI * 2,
      spin: Math.random() * Math.PI,
      alpha: 0.12 + Math.random() * 0.35,
      tone: Math.random(),
    };
  }

  loop(now) {
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.reduced) {
      for (const p of this.particles) {
        p.y -= p.speed * dt;
        p.sway += dt * 0.8;
        p.spin += dt * 0.6;
        const x = p.x + Math.sin(p.sway) * 12;
        if (p.y < -10) Object.assign(p, this.spawn());
        ctx.save();
        ctx.translate(x, p.y);
        ctx.rotate(p.spin);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.tone < 0.55 ? this.accent : p.tone < 0.8 ? "#ffffff" : "#5fe3ff";
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  /** 背景画像をクロスフェードで切り替える */
  setBackground(url, { accent, mood = "" } = {}) {
    if (accent) this.accent = accent;
    this.root.dataset.mood = mood;
    if (!url || url === this.current) return;
    this.current = url;
    const next = this.layers[1 - this.front];
    const prev = this.layers[this.front];
    next.style.backgroundImage = `url(${url})`;
    next.classList.add("show");
    prev.classList.remove("show");
    this.front = 1 - this.front;
  }

  /** 衝撃に合わせて背景を一瞬揺らす */
  pulse() {
    this.root.classList.remove("pulse");
    void this.root.offsetWidth;
    this.root.classList.add("pulse");
  }
}

export let ambient = null;

export function initAmbient() {
  ambient = new Ambient();
  return ambient;
}

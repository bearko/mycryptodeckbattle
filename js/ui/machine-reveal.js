// タイムマシン（合体ロボのエクステンション、64×64のドット絵）を黒いシルエットで描き、
// 進み具合（0〜1）の分だけドットを実体化して見せる。実体化は下から上へ（境目は少しまばら）。
// 拡大はキャンバスごと CSS で行い（image-rendering: pixelated）、縦横比は変えない。

const cache = new Map();

/** 画像を読み込み、不透明なドットと実体化する順番を作る（同じ画像は使い回す） */
function loadPixels(src) {
  if (!cache.has(src)) {
    cache.set(
      src,
      new Promise((resolve, reject) => {
        const im = document.createElement("img");
        im.onload = () => {
          const w = im.naturalWidth;
          const hgt = im.naturalHeight;
          const c = document.createElement("canvas");
          c.width = w;
          c.height = hgt;
          const ctx = c.getContext("2d");
          ctx.drawImage(im, 0, 0);
          const data = ctx.getImageData(0, 0, w, hgt).data;
          // 決まった並び（毎回同じ）にするための簡単な乱数
          let seed = 7;
          const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
          const pixels = [];
          for (let y = 0; y < hgt; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              if (data[i + 3] > 20) pixels.push({ i, key: hgt - y + rand() * 4 });
            }
          }
          pixels.sort((a, b) => a.key - b.key);
          const rank = new Int32Array(w * hgt).fill(-1);
          pixels.forEach((p, k) => (rank[p.i / 4] = k));
          resolve({ w, hgt, data, rank, count: pixels.length });
        };
        im.onerror = reject;
        im.src = src;
      }),
    );
  }
  return cache.get(src);
}

/** progress（0〜1）の分だけ実体化して描く。flash はいま実体化したばかりのドットを白く光らせる幅 */
function draw(canvas, px, progress, flash = 0) {
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(px.w, px.hgt);
  const shown = Math.round(px.count * Math.max(0, Math.min(1, progress)));
  const flashFrom = Math.max(0, shown - Math.round(px.count * flash));
  const d = px.data;
  const o = out.data;
  for (let p = 0; p < px.w * px.hgt; p++) {
    const r = px.rank[p];
    if (r < 0) continue;
    const i = p * 4;
    if (r < shown) {
      const t = r >= flashFrom ? 0.65 : 0;
      o[i] = d[i] + (255 - d[i]) * t;
      o[i + 1] = d[i + 1] + (255 - d[i + 1]) * t;
      o[i + 2] = d[i + 2] + (255 - d[i + 2]) * t;
      o[i + 3] = d[i + 3];
    } else {
      // シルエット（真っ黒にせず、少しだけ青みを残す）
      o[i] = 10;
      o[i + 1] = 13;
      o[i + 2] = 22;
      o[i + 3] = d[i + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

/** シルエットのキャンバス。progress の分だけ実体化した状態で描く */
export function machineCanvas(src, progress, { cls = "" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  canvas.className = `machine-canvas ${cls}`;
  canvas.dataset.src = src;
  loadPixels(src)
    .then((px) => {
      canvas.width = px.w;
      canvas.height = px.hgt;
      if (!canvas.dataset.animating) draw(canvas, px, progress);
    })
    .catch(() => {});
  return canvas;
}

/** from → to まで、ドットが下から実体化していくアニメーション。終わると resolve */
export async function revealMachine(canvas, from, to, { duration = 1600, onProgress = null } = {}) {
  if (!canvas?.isConnected) return;
  canvas.dataset.animating = "1";
  const px = await loadPixels(canvas.dataset.src);
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    draw(canvas, px, to);
    onProgress?.(to);
    return;
  }
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 2);
      const p = from + (to - from) * eased;
      draw(canvas, px, p, t < 1 ? 0.035 : 0);
      onProgress?.(p);
      if (t < 1 && canvas.isConnected) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  delete canvas.dataset.animating;
}

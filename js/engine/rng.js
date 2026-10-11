// シード付き乱数（mulberry32）。状態は数値1つなので、セーブデータにそのまま保存できる。

export function createRng(state) {
  let s = state >>> 0;
  const rng = {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) {
      return Math.floor(rng.next() * n);
    },
    pick(list) {
      return list[rng.int(list.length)];
    },
    shuffle(list) {
      const a = list.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    sample(list, n) {
      return rng.shuffle(list).slice(0, n);
    },
    weighted(entries) {
      // entries: [[value, weight], ...]
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let r = rng.next() * total;
      for (const [value, w] of entries) {
        r -= w;
        if (r < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    get state() {
      return s;
    },
  };
  return rng;
}

export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** run.rngState を使って乱数を引き、終わったら状態を書き戻す。 */
export function withRng(run, fn) {
  const rng = createRng(run.rngState);
  const result = fn(rng);
  run.rngState = rng.state;
  return result;
}

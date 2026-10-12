// バランス確認用: ストーリーを最初から自動プレイ（botShop）で進め、ステージごとのクリア率を集計する。
// 進め方は実際の遊び方と同じ（クリアするとヒーローが仲間になる）。
// 使い方: node scripts/simulate-story.mjs [周回数] [デッキの組み方] [ノードID...]
//   デッキの組み方 best:   おまかせ編成（Common・Uncommon を3種類、残りはレアリティの高い順。story.js の autoDeck）
//                  auto:   空きがあれば自動で入るだけ（デッキを組み直さない）
//                  novice: 初心者用ヒーローだけ（MCHウォーリアーなど。育てるだけで進めるかの確認）
import { loadDb } from "../tests/load-db.mjs";
import { prepareBattle, finishBattle, advance, chooseExtension, applyTarget } from "../js/engine/run.js";
import { runBattle, battleSummary } from "../js/engine/battle.js";
import { BOSS_TUNING, isBossWave } from "../js/engine/boss.js";
import { STORY_BALANCE } from "../js/engine/balance.js";
import { botShop } from "../js/engine/bot.js";
import { createRng } from "../js/engine/rng.js";
import { allUnits } from "../js/engine/roster.js";
import { AREAS, DECK_SIZE, stageKey, stageLabel } from "../js/engine/world.js";
import { newStory, newStageRun, clearStage, joinAtStart, stageUnlocked, areaUnlocked, setDeck, autoDeck } from "../js/engine/story.js";

// --tune '{"cpuIncome":1}' で balance.js の STORY_BALANCE を、--boss '{"hp":2}' で BOSS_TUNING を試しに変えられる
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return JSON.parse(v);
};
Object.assign(STORY_BALANCE, opt("--tune") ?? {});
Object.assign(BOSS_TUNING, opt("--boss") ?? {});
const jsonOut = args.includes("--json") ? args.splice(args.indexOf("--json"), 1) && true : false;
const runs = Number(args[0] || 10);
const policy = args[1] || "best";
const only = new Set(args.slice(2));
const TRIES = 5;
const db = loadDb();

function chooseDeck(story) {
  if (policy === "auto") return;
  if (policy === "best") {
    const res = setDeck(story, autoDeck(db, story), db);
    if (!res.ok) throw new Error(res.error);
    return;
  }
  const heroes = story.heroes.map((id, order) => ({ id, order, def: db.def(id) }));
  const pool = policy === "novice" ? heroes.filter((x) => x.def.novice) : heroes;
  pool.sort((a, b) => b.def.rarity - a.def.rarity || b.order - a.order);
  const cheap = pool.filter((x) => x.def.rarity <= 2).slice(0, 3);
  const rest = pool.filter((x) => !cheap.includes(x)).slice(0, DECK_SIZE - cheap.length);
  const res = setDeck(
    story,
    [...cheap, ...rest].map((x) => x.id),
    db,
  );
  if (!res.ok) throw new Error(res.error);
}

function resolvePending(run, rng) {
  for (let guard = 0; run.pending.length && guard < 20; guard++) {
    const ev = run.pending[0];
    if (ev.type === "extension") chooseExtension(run, db, rng.pick(ev.options));
    else if (ev.type === "target") {
      const u = allUnits(run)[0];
      applyTarget(run, db, u.zone, u.index);
    }
  }
}

/** 1ステージを自動プレイ。戻り値: { cleared, waves: [{ wave, won, boss }] } */
function playStage(story, key, seed) {
  const run = newStageRun(db, story, key, seed);
  const rng = createRng(seed ^ 0x5eed);
  const waves = [];
  for (let guard = 0; guard < 40; guard++) {
    resolvePending(run, rng);
    botShop(run, db, rng, { maxRerolls: 2, onMerge: () => {} });
    resolvePending(run, rng);
    const boss = isBossWave(run);
    const prep = prepareBattle(run, db);
    if (!prep.ok) break;
    const summary = battleSummary(runBattle(prep.left, prep.right));
    waves.push({ wave: run.wins + 1, won: summary.winner === 0, boss });
    finishBattle(run, db, summary);
    if (run.phase !== "result") break;
    advance(run, db);
  }
  return { cleared: run.phase === "clear", waves };
}

const stats = {};
const reached = [];
for (let i = 0; i < runs; i++) {
  const story = newStory();
  let attempts = 0;
  let last = "";
  outer: for (const area of AREAS) {
    if (!areaUnlocked(story, area)) continue;
    if (only.size && !only.has(area.id) && area.id !== "kindai-jp") {
      // 対象外のノードは、プレイせずにクリアしたことにする（仲間とパーツだけ受け取る）
      area.stages.forEach((_, s) => clearStage(story, stageKey(area.id, s)));
      continue;
    }
    for (let s = 0; s < area.stages.length; s++) {
      const key = stageKey(area.id, s);
      if (!stageUnlocked(story, area, s)) break;
      joinAtStart(story, key);
      chooseDeck(story);
      const label = stageLabel(area, s);
      const st = (stats[label] ??= { tries: 0, clears: 0, firstTry: 0, waveGames: {}, waveWins: {}, bossGames: 0, bossWins: 0 });
      let cleared = false;
      for (let t = 0; t < TRIES && !cleared; t++) {
        const res = playStage(story, key, (i * 7919 + attempts++ * 104729) >>> 0);
        st.tries++;
        for (const w of res.waves) {
          st.waveGames[w.wave] = (st.waveGames[w.wave] || 0) + 1;
          if (w.won) st.waveWins[w.wave] = (st.waveWins[w.wave] || 0) + 1;
          if (w.boss) {
            st.bossGames++;
            if (w.won) st.bossWins++;
          }
        }
        if (res.cleared) {
          cleared = true;
          st.clears++;
          if (t === 0) st.firstTry++;
        }
      }
      if (!cleared) break outer;
      clearStage(story, key);
      last = label;
    }
  }
  reached.push(last);
}

if (jsonOut) {
  const out = {};
  for (const [label, st] of Object.entries(stats)) out[label] = { pass: st.clears / runs, rate: st.clears / st.tries, boss: st.bossGames ? st.bossWins / st.bossGames : null };
  console.log(JSON.stringify(out));
  process.exit(0);
}
console.log(`デッキ: ${policy} / ${runs}周 / 1ステージ最大${TRIES}回挑戦`);
for (const [label, st] of Object.entries(stats)) {
  const waves = Object.keys(st.waveGames)
    .map((w) => `${Math.round(((st.waveWins[w] || 0) / st.waveGames[w]) * 100)}`)
    .join("/");
  const boss = st.bossGames ? `  ボス ${Math.round((st.bossWins / st.bossGames) * 100)}%` : "";
  console.log(
    `${label.padEnd(5)} 突破 ${String(Math.round((st.clears / runs) * 100)).padStart(3)}%  初回クリア ${String(Math.round((st.firstTry / runs) * 100)).padStart(3)}%  クリア率 ${String(Math.round((st.clears / st.tries) * 100)).padStart(3)}%  ウェーブ勝率 ${waves}${boss}`,
  );
}
console.log(`最後にクリアしたステージ: ${reached.join(" ")}`);

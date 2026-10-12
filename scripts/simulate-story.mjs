// バランス確認用: ストーリーを最初から自動プレイ（botShop）で進め、ステージごとのクリア率を集計する。
// 進め方は実際の遊び方と同じ（クリアするとヒーローが仲間になり、空きがあればデッキに入る）。
// 使い方: node scripts/simulate-story.mjs [周回数]
import { loadDb } from "../tests/load-db.mjs";
import { prepareBattle, finishBattle, advance, chooseExtension, applyTarget } from "../js/engine/run.js";
import { runBattle, battleSummary } from "../js/engine/battle.js";
import { botShop } from "../js/engine/bot.js";
import { createRng } from "../js/engine/rng.js";
import { allUnits } from "../js/engine/roster.js";
import { AREAS, stageKey, stageLabel } from "../js/engine/world.js";
import { newStory, newStageRun, clearStage, joinAtStart, stageUnlocked, areaUnlocked } from "../js/engine/story.js";

const runs = Number(process.argv[2] || 40);
const db = loadDb();

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

/** 1ステージを自動プレイ。戻り値: { cleared, waveWins: [勝ったウェーブ番号...] } */
function playStage(story, key, seed) {
  const run = newStageRun(db, story, key, seed);
  const rng = createRng(seed ^ 0x5eed);
  const waves = [];
  for (let guard = 0; guard < 40; guard++) {
    resolvePending(run, rng);
    botShop(run, db, rng, { maxRerolls: 2, onMerge: () => {} });
    resolvePending(run, rng);
    const prep = prepareBattle(run, db);
    if (!prep.ok) break;
    const summary = battleSummary(runBattle(prep.left, prep.right));
    waves.push({ wave: run.stage, won: summary.winner === 0 });
    finishBattle(run, db, summary);
    if (run.phase !== "result") break;
    advance(run, db);
  }
  return { cleared: run.phase === "clear", waves };
}

const stats = {};
for (let i = 0; i < runs; i++) {
  const story = newStory();
  let attempts = 0;
  for (const area of AREAS) {
    if (!areaUnlocked(story, area)) continue;
    for (let s = 0; s < area.stages.length; s++) {
      const key = stageKey(area.id, s);
      if (!stageUnlocked(story, area, s)) break;
      joinAtStart(story, key);
      const label = stageLabel(area, s);
      const st = (stats[label] ??= { tries: 0, clears: 0, firstTry: 0, waveGames: {}, waveWins: {} });
      let cleared = false;
      for (let t = 0; t < 5 && !cleared; t++) {
        const res = playStage(story, key, (i * 7919 + attempts++ * 104729) >>> 0);
        st.tries++;
        for (const w of res.waves) {
          st.waveGames[w.wave] = (st.waveGames[w.wave] || 0) + 1;
          if (w.won) st.waveWins[w.wave] = (st.waveWins[w.wave] || 0) + 1;
        }
        if (res.cleared) {
          cleared = true;
          st.clears++;
          if (t === 0) st.firstTry++;
        }
      }
      if (!cleared) break;
      clearStage(story, key);
    }
  }
}

for (const [label, st] of Object.entries(stats)) {
  const waves = Object.keys(st.waveGames)
    .map((w) => `${Math.round(((st.waveWins[w] || 0) / st.waveGames[w]) * 100)}`)
    .join("/");
  console.log(`${label.padEnd(5)} 初回クリア ${String(Math.round((st.firstTry / runs) * 100)).padStart(3)}%  クリア率 ${String(Math.round((st.clears / st.tries) * 100)).padStart(3)}%  ウェーブ勝率 ${waves}`);
}

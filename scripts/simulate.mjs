// バランス確認用: 自動プレイ（botShop）でクエストを何周も回し、勝率やバトル時間を集計する。
// 使い方: node scripts/simulate.mjs [周回数] [プレイヤーID]
import { loadDb } from "../tests/load-db.mjs";
import { newRun, prepareBattle, finishBattle, advance, chooseTreasure, chooseExtension, applyTarget } from "../js/engine/run.js";
import { runBattle, battleSummary } from "../js/engine/battle.js";
import { botShop } from "../js/engine/bot.js";
import { createRng } from "../js/engine/rng.js";
import { allUnits } from "../js/engine/roster.js";

const runs = Number(process.argv[2] || 200);
const players = process.argv[3] ? [process.argv[3]] : ["chris", "mine", "mai"];
const db = loadDb();

function resolvePending(run, rng) {
  for (let guard = 0; run.pending.length && guard < 20; guard++) {
    const ev = run.pending[0];
    if (ev.type === "treasure") chooseTreasure(run, db, rng.pick(ev.options));
    else if (ev.type === "extension") chooseExtension(run, db, rng.pick(ev.options));
    else if (ev.type === "target") {
      const u = allUnits(run)[0];
      applyTarget(run, db, u.zone, u.index);
    }
  }
}

const stats = { stageWins: {}, stageGames: {}, durations: [], sudden: 0, clears: 0, winsHist: {} };
for (const playerId of players) {
  for (let i = 0; i < runs; i++) {
    const seed = (i * 7919 + playerId.length * 104729) >>> 0;
    const run = newRun(db, { playerId, seed });
    const rng = createRng(seed ^ 0xabcdef);
    for (let guard = 0; guard < 60; guard++) {
      resolvePending(run, rng);
      botShop(run, db, rng, { maxRerolls: 3, onMerge: () => {} });
      resolvePending(run, rng);
      const prep = prepareBattle(run, db);
      if (!prep.ok) { run.phase = "market"; break; }
      const b = runBattle(prep.left, prep.right);
      const summary = battleSummary(b);
      stats.durations.push(b.time);
      if (b.time >= 30) stats.sudden++;
      stats.stageGames[run.stage] = (stats.stageGames[run.stage] || 0) + 1;
      if (summary.winner === 0) stats.stageWins[run.stage] = (stats.stageWins[run.stage] || 0) + 1;
      finishBattle(run, db, summary);
      if (run.phase !== "result") break;
      advance(run, db);
    }
    if (run.phase === "clear") stats.clears++;
    stats.winsHist[run.wins] = (stats.winsHist[run.wins] || 0) + 1;
  }
}
const total = runs * players.length;
const d = stats.durations.sort((a, b) => a - b);
console.log(`runs=${total} clear=${((stats.clears / total) * 100).toFixed(1)}%`);
console.log("wins histogram", stats.winsHist);
console.log("battle time p10/p50/p90", d[Math.floor(d.length * 0.1)], d[Math.floor(d.length * 0.5)], d[Math.floor(d.length * 0.9)], "sudden death", ((stats.sudden / d.length) * 100).toFixed(1) + "%");
for (const s of Object.keys(stats.stageGames)) {
  console.log(`stage ${s}: winrate ${(((stats.stageWins[s] || 0) / stats.stageGames[s]) * 100).toFixed(0)}% (${stats.stageGames[s]})`);
}

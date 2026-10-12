// バランス確認用: ストーリーを最初から自動プレイ（botShop）で進め、ステージごとのクリア率を集計する。
// 進め方は実際の遊び方と同じ（クリアするとヒーローが仲間になり、ノードの中はチームを繰り越す）。
// 負けたらそのステージの開始時のチームでやり直し、TRIES 回負けたら1回だけ X-1 からチームを作り直す。
// 枝分かれでは、地形・エネミーの傾向とチームの相性（stageMatch）を見てルートを選ぶ（補給は少し好む）。
// 使い方: node scripts/simulate-story.mjs [周回数] [デッキの組み方] [ノードID...]
//   デッキの組み方 best:   おまかせ編成（story.js の autoDeck）。ルートは相性で選ぶ
//                  straight: best と同じデッキで、ルートは同じレーンをまっすぐ（相性を見ない）
//                  auto:   空きがあれば自動で入るだけ（デッキを組み直さない）
//                  novice: 初心者用ヒーローだけ（MCHウォーリアーなど。育てるだけで進めるかの確認）
import { loadDb } from "../tests/load-db.mjs";
import { prepareBattle, finishBattle, advance, chooseExtension, chooseTreasure, applyTarget, departSupply } from "../js/engine/run.js";
import { runBattle, battleSummary } from "../js/engine/battle.js";
import { BOSS_TUNING, isBossWave } from "../js/engine/boss.js";
import { STORY_BALANCE } from "../js/engine/balance.js";
import { botShop, unitValue } from "../js/engine/bot.js";
import { sellUnit } from "../js/engine/market.js";
import { createRng } from "../js/engine/rng.js";
import { allUnits, findEmptySlot } from "../js/engine/roster.js";
import { AREAS, DECK_SIZE, MAIN_AREAS, heroId, nodeMap, stageKey, stageLabel } from "../js/engine/world.js";
import {
  newStory,
  newStageRun,
  clearStage,
  joinAtStart,
  areaUnlocked,
  setDeck,
  autoDeck,
  carryOver,
  resetNodeRun,
  isCleared,
  areaCleared,
  nodeRun,
  sortieOptions,
  stageMatch,
  teamTraits,
} from "../js/engine/story.js";

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
  if (policy === "best" || policy === "straight") {
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
    if (ev.type === "treasure") chooseTreasure(run, db, rng.pick(ev.options));
    else if (ev.type === "extension") chooseExtension(run, db, rng.pick(ev.options));
    else if (ev.type === "target") {
      const u = allUnits(run)[0];
      applyTarget(run, db, u.zone, u.index);
    }
  }
}

// 合成したときのエクステンション（人は3択から選ぶので、CPUと同じく戦闘に効くものから選ぶ）
const COMBAT_EXT = db.extensions.filter((x) => !["income", "freeReroll", "winGum", "sellBonus", "factionMult"].includes(x.effect));

/**
 * 枠が埋まってGUMが余っているとき、人がするように弱いヒーローを売って、高いレアリティのヒーローへ入れ替える
 * （botShop は Lv1 のヒーローしか売らないため、繰り越しでGUMが余り続けてしまう）
 */
function upgradeRoster(run) {
  if (findEmptySlot(run)) return;
  const offers = run.market.offers.filter((o) => o?.type === "hero" && o.cost <= run.gum);
  if (!offers.length) return;
  const best = offers.reduce((a, c) => (db.def(c.defId).rarity > db.def(a.defId).rarity ? c : a));
  const rarity = db.def(best.defId).rarity;
  const weakest = allUnits(run)
    .filter(({ unit }) => db.def(unit.defId).rarity < rarity && unit.defId !== best.defId)
    .sort((a, b) => unitValue(db, a.unit) - unitValue(db, b.unit))[0];
  if (weakest && run.gum >= best.cost * 2) sellUnit(run, db, weakest.zone, weakest.index);
}

/** 1ステージを自動プレイ。戻り値: { cleared, run, waves: [{ wave, won, boss }] } */
function playStage(story, key, seed) {
  const run = newStageRun(db, story, key, seed);
  const rng = createRng(seed ^ 0x5eed);
  const waves = [];
  for (let guard = 0; guard < 40; guard++) {
    resolvePending(run, rng);
    const onMerge = () => run.extensions.push(rng.pick(COMBAT_EXT).id);
    for (let k = 0; k < 3; k++) {
      upgradeRoster(run);
      botShop(run, db, rng, { maxRerolls: 2, onMerge });
    }
    if (run.story.supply) {
      resolvePending(run, rng);
      departSupply(run);
      break;
    }
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
  return { cleared: run.phase === "clear", run, waves };
}

const stats = {};
const reached = [];
const record = (label, res, t, run) => {
  // passed: その行を突破した周（枝分かれで同じ行を別のレーンでもう一度遊んでも1回と数える）
  const st = (stats[label] ??= { tries: 0, clears: 0, passed: new Set(), firstTry: 0, waveGames: {}, waveWins: {}, bossGames: 0, bossWins: 0 });
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
    st.clears++;
    if (t === 0 && !st.passed.has(run)) st.firstTry++;
    st.passed.add(run);
  }
};
/** ルートを選ぶ: 地形・エネミーの傾向とチームの相性、補給、新しい仲間を見て点数の高いステージ */
function chooseRoute(story, area, options, rng) {
  if (options.length === 1 || policy === "straight") return options.find((o) => o.lane === nodeRun(story, area.id).at) ?? options[0];
  const traits = teamTraits(db, nodeRun(story, area.id).team);
  const score = (o) => {
    const m = stageMatch(traits, o.stage);
    let v = (m.field?.n ?? 0) + 0.5 * (m.foe?.n ?? 0) + rng.next() * 0.5;
    if (o.stage.kind === "supply") v += 1.5;
    if (o.stage.kind === "elite") v -= 0.5;
    if (o.stage.join.some((id) => !story.heroes.includes(heroId(id)))) v += 0.5;
    return v;
  };
  return options.reduce((a, c) => (score(c) > score(a) ? c : a));
}

/** プレイせずにノードをクリアしたことにする（真ん中のレーンを通る） */
function skipArea(story, area) {
  nodeMap(area).rows.forEach((row, r) => clearStage(story, stageKey(area.id, r, row.length > 1 ? 1 : null)));
}

// 特別ステージ（特異点）は、開くノードをクリアした直後に挑む
const ORDER = MAIN_AREAS.flatMap((a) => [a, ...AREAS.filter((sp) => sp.special && sp.after === a.id)]);

const kindStats = {};
for (let i = 0; i < runs; i++) {
  const story = newStory();
  let attempts = 0;
  let last = "";
  const rng = createRng(i * 31 + 7);
  outer: for (const area of ORDER) {
    if (!areaUnlocked(story, area)) continue;
    if (only.size && !only.has(area.id) && area.id !== "kindai-jp") {
      skipArea(story, area);
      continue;
    }
    let rebuilt = false;
    while (!areaCleared(story, area) || nodeRun(story, area.id).next > 0) {
      const options = sortieOptions(story, area);
      if (!options.length) break;
      const opt = chooseRoute(story, area, options, rng);
      const { key, index } = opt;
      joinAtStart(story, key);
      chooseDeck(story);
      const label = stageLabel(area, index);
      const replay = isCleared(story, key);
      const ks = (kindStats[opt.stage.kind] ??= { tries: 0, clears: 0 });
      let cleared = null;
      for (let t = 0; t < TRIES && !cleared; t++) {
        const res = playStage(story, key, (i * 7919 + attempts++ * 104729) >>> 0);
        if (!replay) {
          record(label, res, t, i);
          ks.tries++;
          if (res.cleared) ks.clears++;
        }
        if (res.cleared) cleared = res.run;
      }
      if (!cleared) {
        // 特別ステージは寄り道なので、クリアできなくても本編へ戻る
        if (area.special && (rebuilt || index === 0)) break;
        // 一度だけ X-1 からチームを作り直す
        if (rebuilt || index === 0) break outer;
        rebuilt = true;
        resetNodeRun(story, area.id);
        continue;
      }
      clearStage(story, key);
      carryOver(story, cleared);
      if (!replay) last = label;
      if (areaCleared(story, area) && nodeRun(story, area.id).next === 0) break;
    }
  }
  reached.push(last);
}

if (jsonOut) {
  const out = {};
  for (const [label, st] of Object.entries(stats)) out[label] = { pass: st.passed.size / runs, rate: st.clears / st.tries, boss: st.bossGames ? st.bossWins / st.bossGames : null };
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
    `${label.padEnd(5)} 突破 ${String(Math.round((st.passed.size / runs) * 100)).padStart(3)}%  初回クリア ${String(Math.round((st.firstTry / runs) * 100)).padStart(3)}%  クリア率 ${String(Math.round((st.clears / st.tries) * 100)).padStart(3)}%  ウェーブ勝率 ${waves}${boss}`,
  );
}
console.log(`最後にクリアしたステージ: ${reached.join(" ")}`);
console.log(
  `ステージの種類: ${Object.entries(kindStats)
    .map(([k, v]) => `${k} ${v.tries}回 クリア率${Math.round((v.clears / v.tries) * 100)}%`)
    .join(" / ")}`,
);

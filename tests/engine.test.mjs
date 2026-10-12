import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDb } from "./load-db.mjs";
import { createBattle, stepBattle, runBattle } from "../js/engine/battle.js";
import { newRun, buy, sell, finishBattle, advance, prepareBattle, chooseExtension, chooseTreasure, usesKnownUnits, startStage } from "../js/engine/run.js";
import { acquireUnit, allUnits, emptyRoster } from "../js/engine/roster.js";
import { rollMarket, reroll, toggleOfferLock } from "../js/engine/market.js";
import { createRng } from "../js/engine/rng.js";
import { buildCpuOpponent } from "../js/engine/cpu.js";
import { sellValue, lifeLoss } from "../js/engine/balance.js";

const db = loadDb();

function team(fighters, maxHp = 100, start = {}) {
  return {
    name: "t",
    maxHp,
    start: { shield: 0, bleed: 0, poison: 0, charge: 0, ...start },
    fighters: fighters.map((f, i) => ({
      slot: i,
      uid: i + 1,
      defId: "x",
      name: "x",
      image: "",
      rarity: 1,
      level: 1,
      multicast: 1,
      ...f,
    })),
  };
}

function ghost() {
  return { stage: 1, rankBonus: 0, gum: 999, nextUid: 1, heroPool: [], market: { offers: [] }, ...emptyRoster() };
}

test("同じヒーロー3体でLv2、Lv2が2体でLv3に合成される", () => {
  const g = ghost();
  const id = db.heroes[0].id;
  acquireUnit(g, id);
  acquireUnit(g, id);
  const r = acquireUnit(g, id);
  assert.equal(r.merges.length, 1);
  assert.deepEqual(
    allUnits(g).map((u) => u.unit.level),
    [2],
  );
  for (let i = 0; i < 3; i++) acquireUnit(g, id);
  assert.deepEqual(
    allUnits(g).map((u) => u.unit.level),
    [3],
  );
});

test("枠が満杯でも、買った瞬間に合成できるなら購入できる", () => {
  const g = ghost();
  const ids = db.heroes.slice(0, 9).map((d) => d.id);
  const target = db.heroes[20].id;
  for (const id of ids.slice(0, 8)) acquireUnit(g, id);
  acquireUnit(g, target);
  acquireUnit(g, target);
  assert.equal(allUnits(g).length, 10);
  const r = acquireUnit(g, target);
  assert.ok(r);
  assert.equal(allUnits(g).length, 9);
  assert.equal(allUnits(g).find((u) => u.unit.defId === target).unit.level, 2);
  assert.equal(acquireUnit(g, db.heroes[30].id) === null, false); // 空きが1つできたので入る
  assert.equal(acquireUnit(g, db.heroes[31].id), null); // もう空きがない
});

test("同時発動はシールド→ダメージの順で解決される", () => {
  // 左: ダメージ50 / 右: シールド30 を同じタイミングで発動
  const left = team([{ cd: 1, effects: [{ kind: "damage", trigger: "charge", value: 50 }] }]);
  const right = team([{ cd: 1, effects: [{ kind: "shield", trigger: "charge", value: 30 }] }]);
  const b = createBattle(left, right);
  stepBattle(b); // 開始
  for (let i = 0; i < 10; i++) stepBattle(b);
  assert.equal(b.sides[1].shield, 0);
  assert.equal(b.sides[1].hp, 80);
});

test("同時に決着する場合はプレイヤー側（左）の勝ち", () => {
  const left = team([{ cd: 1, effects: [{ kind: "damage", trigger: "charge", value: 100 }] }]);
  const right = team([{ cd: 1, effects: [{ kind: "damage", trigger: "charge", value: 100 }] }]);
  const b = runBattle(left, right);
  assert.equal(b.winner, 0);
  assert.equal(b.sides[0].hp, 100);
});

test("出血は0.5秒ごとにスタック数ダメージ→1減少、毒は1秒ごとで減少しない", () => {
  const left = team([], 1000);
  const right = team([], 1000, { bleed: 3, poison: 2 });
  const b = createBattle(left, right);
  stepBattle(b);
  for (let i = 0; i < 10; i++) stepBattle(b); // 1.0秒
  // 出血: 3 + 2 = 5、毒: 2
  assert.equal(b.sides[0].hp, 1000 - 5 - 2);
  assert.equal(b.sides[0].bleed, 1);
  assert.equal(b.sides[0].poison, 2);
});

test("出血・毒ダメージはシールドに対して15%軽減される", () => {
  const left = team([], 1000, { shield: 100 });
  const right = team([], 1000, { poison: 20 });
  const b = createBattle(left, right);
  stepBattle(b);
  for (let i = 0; i < 10; i++) stepBattle(b);
  assert.equal(b.sides[0].hp, 1000);
  assert.equal(b.sides[0].shield, 100 - 20 * 0.85);
});

test("30秒を過ぎるとサドンデスで必ず決着する", () => {
  const b = runBattle(team([], 2000), team([], 3000));
  assert.ok(b.over);
  assert.ok(b.time >= 30);
  assert.equal(b.winner, 1);
});

test("チャージアップは隣接する味方だけに効く", () => {
  const left = team(
    [
      { cd: 100, effects: [{ kind: "damage", trigger: "charge", value: 1 }] }, // slot0
      { cd: 1, effects: [{ kind: "haste", trigger: "charge", value: 5 }] }, // slot1
      { cd: 100, effects: [{ kind: "damage", trigger: "charge", value: 1 }] }, // slot2
    ],
    1000,
  );
  left.fighters[2].slot = 5; // slot1とは斜め（隣接しない）
  const b = createBattle(left, team([], 1000));
  stepBattle(b);
  for (let i = 0; i < 10; i++) stepBattle(b);
  const bySlot = Object.fromEntries(b.sides[0].fighters.map((f) => [f.slot, f.charge]));
  assert.ok(bySlot[0] >= 5);
  assert.ok(bySlot[5] < 2);
});

test("売却額は ceil(価格×コピー数/2)", () => {
  const common = db.heroes.find((d) => d.rarity === 1);
  assert.equal(sellValue(common, 1), 3);
  assert.equal(sellValue(common, 2), 8);
  assert.equal(sellValue(common, 3), 15);
});

test("マーケットランク1ではCommonしか出ない", () => {
  const run = newRun(db, { playerId: "chris", seed: 1 });
  const rng = createRng(5);
  for (let i = 0; i < 50; i++) {
    rollMarket(run, db, rng);
    for (const o of run.market.offers.slice(0, 4)) assert.equal(db.def(o.defId).rarity, 1);
  }
});

test("敗北でライフが減り、最初に0になったときだけ復活する", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(lifeLoss), [1, 1, 2, 2, 3, 3]);
  const run = newRun(db, { playerId: "chris", seed: 2 });
  buy(run, db, 0);
  const lose = { winner: 1, time: 10, sides: [{ name: "a" }, { name: "b" }] };
  run.lives = 1;
  finishBattle(run, db, lose);
  assert.equal(run.lives, 1);
  assert.equal(run.revived, true);
  assert.equal(run.phase, "result");
  advance(run, db);
  assert.equal(run.pending[0].type, "treasure");
  assert.equal(run.pending[0].reason, "revive");
  run.phase = "market";
  finishBattle(run, db, lose);
  assert.equal(run.phase, "gameover");
});

test("10勝でクエストクリア", () => {
  const run = newRun(db, { playerId: "mai", seed: 3 });
  buy(run, db, 0);
  run.wins = 9;
  finishBattle(run, db, { winner: 0, time: 10, sides: [{ name: "a" }, { name: "b" }] });
  assert.equal(run.phase, "clear");
});

test("購入→合成でエクステンション選択が保留され、選ぶと所持品に入る", () => {
  const run = newRun(db, { playerId: "chris", seed: 4 });
  const id = run.heroPool.find((h) => db.def(h).rarity === 1);
  run.gum = 100;
  for (let i = 0; i < 3; i++) {
    run.market.offers[0] = { type: "hero", defId: id, cost: 5 };
    const r = buy(run, db, 0);
    assert.ok(r.ok, r.error);
  }
  assert.equal(run.pending[0].type, "extension");
  const ext = run.pending[0].options[0];
  assert.ok(chooseExtension(run, db, ext).ok);
  assert.deepEqual(run.extensions, [ext]);
  assert.equal(sell(run, db, "party", 0).value, 8);
});

test("ステージ3で宝箱が出る", () => {
  const run = newRun(db, { playerId: "chris", seed: 5 });
  buy(run, db, 0);
  for (let s = 1; s < 3; s++) {
    run.pending = [];
    const prep = prepareBattle(run, db);
    assert.ok(prep.ok);
    finishBattle(run, db, { winner: 0, time: 1, sides: [{ name: "a" }, { name: "b" }] });
    advance(run, db);
  }
  assert.equal(run.stage, 3);
  const ev = run.pending.find((p) => p.type === "treasure");
  assert.ok(ev);
  run.pending = [ev];
  assert.ok(chooseTreasure(run, db, ev.options[0]).ok);
});

test("CPU対戦相手は同じシードなら同じ編成になる", () => {
  const run = newRun(db, { playerId: "chris", seed: 6 });
  const a = buildCpuOpponent(db, run, 5);
  const b = buildCpuOpponent(db, run, 5);
  assert.deepEqual(
    a.units.map((u) => [u.unit.defId, u.unit.level, u.slot]),
    b.units.map((u) => [u.unit.defId, u.unit.level, u.slot]),
  );
  assert.ok(a.units.length >= 3);
  assert.ok(a.units.every((u) => u.unit.defId.startsWith("e")));
});

test("合成プレビューと進み具合", async () => {
  const { mergePreview, mergeProgress } = await import("../js/engine/roster.js");
  const g = ghost();
  const id = db.heroes[0].id;
  assert.equal(mergePreview(g, id), null);
  acquireUnit(g, id);
  assert.deepEqual(mergeProgress(g, allUnits(g)[0].unit), { have: 1, need: 3, next: 2 });
  acquireUnit(g, id);
  assert.equal(mergePreview(g, id), 2);
  acquireUnit(g, id); // Lv2
  acquireUnit(g, id);
  acquireUnit(g, id);
  assert.equal(mergePreview(g, id), 3); // Lv1×2 + Lv2×1 の状態で買うと Lv3 まで連鎖
  const lv2 = allUnits(g).find((u) => u.unit.level === 2).unit;
  assert.deepEqual(mergeProgress(g, lv2), { have: 1, need: 2, next: 3 });
});

test("版権コラボのユニットはデータに含めず、それを参照する古い保存データは無効", () => {
  assert.ok(!db.has("h2035"));
  assert.ok(!db.enemies.some((e) => e.image.endsWith("/715.png")));
  const run = newRun(db, { playerId: "chris", seed: 7 });
  assert.ok(usesKnownUnits(run, db));
  assert.ok(!usesKnownUnits({ ...run, heroPool: [...run.heroPool, "h2035"] }, db));
});

test("取り置きは1枠ずつ。GUMが足りなくてもでき、更新と次のステージで残る", () => {
  const run = newRun(db, { playerId: "chris", seed: 11 });
  const rng = createRng(3);
  run.gum = 0;
  const held = run.market.offers[1];
  assert.equal(toggleOfferLock(run, 1), true);
  run.gum = 10;
  run.freeRerolls = 0;
  assert.ok(reroll(run, db, rng).ok);
  assert.equal(run.market.offers[1], held);
  assert.equal(run.gum, 7);
  startStage(run, db);
  assert.equal(run.market.offers[1], held);
  assert.equal(run.market.offers[1].locked, true);
  // 解除すると次の更新で入れ替わる対象になる
  assert.equal(toggleOfferLock(run, 1), false);
  // 全枠取り置き中は更新できない
  for (let i = 0; i < run.market.offers.length; i++) toggleOfferLock(run, i);
  const gum = run.gum;
  assert.equal(reroll(run, db, rng).ok, false);
  assert.equal(run.gum, gum);
});

test("旧仕様（ラインナップ全体の取り置き）の保存データは全枠を持ち越す", () => {
  const run = newRun(db, { playerId: "chris", seed: 12 });
  const before = run.market.offers.map((o) => o?.defId ?? o?.id);
  run.market.locked = true;
  startStage(run, db);
  assert.deepEqual(run.market.offers.map((o) => o?.defId ?? o?.id), before);
  assert.equal(run.market.locked, undefined);
});

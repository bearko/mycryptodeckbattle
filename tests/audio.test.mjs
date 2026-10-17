import { test } from "node:test";
import assert from "node:assert/strict";
import { mixVolume, volumeSettings } from "../js/ui/audio.js";

test("音量の設定: 無ければ 1（今までの大きさ）、古い保存の muted: true は両方 0 に読みかえる", () => {
  assert.deepEqual(volumeSettings({}), { bgm: 1, se: 1 });
  assert.deepEqual(volumeSettings({ muted: false }), { bgm: 1, se: 1 });
  assert.deepEqual(volumeSettings({ muted: true }), { bgm: 0, se: 0 });
  // 音量を持っていれば、残っている muted は見ない
  assert.deepEqual(volumeSettings({ muted: true, bgmVolume: 0.5, seVolume: 1 }), { bgm: 0.5, se: 1 });
  // 壊れた値・範囲外は 0〜1 に収める
  assert.deepEqual(volumeSettings({ bgmVolume: 2, seVolume: "x" }), { bgm: 1, se: 1 });
  assert.deepEqual(volumeSettings({ bgmVolume: -1, seVolume: 0.25 }), { bgm: 0, se: 0.25 });
});

test("最終的な音量は 元の音量 × 設定", () => {
  assert.equal(mixVolume(0.35, 1), 0.35);
  assert.equal(mixVolume(0.35, 0.5), 0.175);
  assert.equal(mixVolume(0.55, 0), 0);
  assert.equal(mixVolume(0.7, 2), 0.7);
});

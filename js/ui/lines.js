// プレイヤーキャラクターのセリフ。吹き出しで喋らせる（トーストの代わり）。
// {n} はステージ数、{name} はヒーロー名、{lv} はLvに置き換える。

export const LINES = {
  chris: {
    greet: ["オレに任せとけ！", "よーし、いっくぞー！"],
    stage: ["ステージ{n}、気合い入れてこう！", "ステージ{n}！ まだまだいける！"],
    wave: ["ウェーブ{n}、気合い入れてこう！", "ウェーブ{n}！ まだまだいける！"],
    boss: ["次はレイドボスだ……！ しっかり強化していこう", "いよいよ親玉か。全力でいくぞ！"],
    buy: ["いいヤツ見っけ！", "仲間ゲット！", "よろしくな、{name}！"],
    merge: ["Lv{lv}だ！ 強くなったぜ！", "合体ー！ {name}がLv{lv}！"],
    sell: ["またな！", "GUMに替えたぜ"],
    reroll: ["次はどうだ？", "入れ替えっ！"],
    lockOn: ["これはキープ！"],
    lockOff: ["キープやめ！"],
    noGum: ["GUMが足りない…", "ぐぬぬ、金欠だ…"],
    full: ["枠がいっぱいだ！"],
    noUnit: ["パーティが空っぽだ！"],
    hint: ["同じヒーロー3体でLvアップだ！", "光ってるヤツは買うと合成できるぜ！"],
    battle: ["いくぞ、バトルだ！"],
    win: ["やったぜ！", "楽勝楽勝！"],
    lose: ["くっそー！", "次は負けねえ！"],
    revive: ["まだ終わらないぜ！"],
    treasure: ["宝箱だ！ どれにする？"],
    ext: ["いい装備だ！"],
    material: ["魔石パワー！"],
    target: ["誰に使う？"],
    boost: ["パワーアップ！"],
    select: ["オレを選ぶ？", "任せとけって！"],
    clear: ["クエストクリアだー！"],
    over: ["また挑戦しようぜ！"],
  },
  mine: {
    greet: ["ナビゲートはお任せください", "準備はいいですか？"],
    stage: ["ステージ{n}です。準備しましょう", "ステージ{n}、作戦を立てましょう"],
    wave: ["ウェーブ{n}です。準備しましょう", "ウェーブ{n}、作戦を立てましょう"],
    boss: ["次はレイドボスです。大技の前に削りきりましょう", "親玉の反応です。準備は念入りに！"],
    buy: ["良い選択です", "{name}、加入です", "戦力アップですね"],
    merge: ["{name}がLv{lv}になりました！", "合成成功、Lv{lv}です！"],
    sell: ["売却しました", "GUMに換えました"],
    reroll: ["ラインナップを更新します", "次の候補です"],
    lockOn: ["取り置きしますね"],
    lockOff: ["取り置きを解除します"],
    noGum: ["GUMが足りません", "予算オーバーです"],
    full: ["空き枠がありません"],
    noUnit: ["パーティにヒーローがいません"],
    hint: ["同じヒーローを3体でLvアップです", "光っているヒーローは合成できますよ"],
    battle: ["バトル開始です！"],
    win: ["作戦成功です！", "お見事です！"],
    lose: ["次は勝てます…！", "分析し直しましょう"],
    revive: ["まだ立て直せます"],
    treasure: ["宝箱です。どれにしますか？"],
    ext: ["装備を確認しました"],
    material: ["魔石を使いました"],
    target: ["対象を選んでください"],
    boost: ["強化完了です"],
    select: ["ナビはお任せを", "一緒に行きましょう"],
    clear: ["クエスト達成です！"],
    over: ["次の挑戦をお待ちしてます"],
  },
  mai: {
    greet: ["みんな〜、いくよ☆", "MAIが応援するね！"],
    stage: ["ステージ{n}だよ☆", "ステージ{n}もがんばろ〜！"],
    wave: ["ウェーブ{n}だよ☆", "ウェーブ{n}もがんばろ〜！"],
    boss: ["次はレイドボスだって！ ドキドキ☆", "おっきいのが来るよ〜！ 準備しよ！"],
    buy: ["新しい推しだ〜！", "{name}、ようこそ☆", "かわいい〜！"],
    merge: ["{name}、Lv{lv}だよ☆", "推しがLv{lv}に成長！"],
    sell: ["またね〜", "GUMになった☆"],
    reroll: ["シャッフル〜！", "次は誰かな？"],
    lockOn: ["キープしとこ☆"],
    lockOff: ["キープ解除〜"],
    noGum: ["GUMが足りないよ〜", "お財布ピンチ…"],
    full: ["もう入らないよ〜"],
    noUnit: ["推しがいないよ〜"],
    hint: ["同じ子3人でLvアップだよ☆", "光ってる子は合成できるよ！"],
    battle: ["ライブ開始〜！"],
    win: ["勝った〜☆", "最高のステージ！"],
    lose: ["うぅ…次は勝つ！", "まだまだ〜！"],
    revive: ["アンコールだよ☆"],
    treasure: ["宝箱だ〜！ どれにする？"],
    ext: ["キラキラ装備☆"],
    material: ["魔石でパワーアップ☆"],
    target: ["誰に使う？"],
    boost: ["推し強化☆"],
    select: ["MAIでいいの？", "いっしょにがんばろ☆"],
    clear: ["クエストクリア〜☆"],
    over: ["また遊ぼうね☆"],
  },
};

/** エンジンのエラー文をセリフの種類に対応づける */
export function errorKind(message) {
  if (/GUM/.test(message)) return "noGum";
  if (/空き枠/.test(message)) return "full";
  if (/パーティにヒーロー/.test(message)) return "noUnit";
  return null;
}

let lastPick = {};

export function line(playerId, kind, vars = {}) {
  const list = LINES[playerId]?.[kind];
  if (!list?.length) return null;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && lastPick[kind] === i) i = (i + 1) % list.length;
  lastPick[kind] = i;
  return list[i].replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "").toString());
}

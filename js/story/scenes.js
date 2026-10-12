// ストーリーの台本。シーンは「手順（step）」の配列で、js/ui/scene.js が再生する。
//
// step の種類
//   { say: "chris" | "mine" | "hero:10004" | "enemy", face?, at?, text }  … 台詞（立ち絵を出して喋る）
//   { narr: "text" }                         … ナレーション
//   { enter: 役, at?, image?, fx? }          … 立ち絵を出す（台詞なし）
//   { exit: 役, fx? }                        … 立ち絵を消す（"burst" で弾けて消える）
//   { fx: "shake" | "flash" | "timeslip" | "boom" }
//   { bg: "1023" }                           … 背景を変える（assets/backgrounds/<id>.webp）
//   { machine: レベル, from?: レベル }       … タイムマシンを見せる（from があると改良の演出）
//   { title: "近代・日本", sub: "MODERN JAPAN" } … エリア名のテロップ
//
// エリアごとの専用の台本は M5（docs/story.md）で増やす。いまは近代・日本を専用、ほかは共通の台本。

import { areaById, areaName, eraById, heroId, machineByLevel } from "../engine/world.js";

/** プロローグに出てくるエネミー（遭遇するだけ。戦わない） */
const PROLOGUE_ENEMY = "assets/enemies/101.png";

export const PROLOGUE = {
  bg: "1051",
  steps: [
    { narr: "さまざまな時代の、さまざまな国で――" },
    { narr: "歴史に「エネミー」が入り込み、少しずつ書き換え始めていた。" },
    { say: "chris", face: "smile", text: "今日もいい天気だなぁ。さて、どこへ行こうかな" },
    { fx: "shake" },
    { enter: "enemy", image: PROLOGUE_ENEMY, at: "right", fx: "drop" },
    { say: "enemy", text: "ギギ……ギギギッ！" },
    { say: "chris", face: "sad", text: "うわっ!? な、なんだコイツ!?" },
    { say: "chris", face: "sad", text: "見たことない生き物……いや、そもそも生き物なのか……？" },
    { fx: "flash" },
    { say: "mine", face: "pointer", at: "center", text: "クリス、下がって！" },
    { fx: "boom" },
    { exit: "enemy", fx: "burst" },
    { say: "chris", face: "smile", text: "マイン!? 助かったよ……。今のは何だったんだ？" },
    { say: "mine", face: "arms", at: "right", text: "あれは「エネミー」。いま、世界中の歴史に入り込んで悪さをしているんです" },
    { say: "mine", face: "sad", text: "このままだと歴史が書き換えられて……わたしたちの「今」も、消えてしまうかもしれません" },
    { say: "chris", face: "guts", text: "そんな……！ どうにかできないのか？" },
    { say: "mine", face: "sparkle", text: "そこで、これです！" },
    { machine: 1 },
    { say: "mine", face: "wink", text: "わたしが発明したタイムマシン、エメ・ラ・ルド・テレスター(破)！ どんな時代にも飛んでいけます！" },
    { say: "chris", face: "arms", text: "ドリルがついてるけど……本当に時間を飛べるの？" },
    { say: "mine", face: "smile", text: "もちろんです！ ……たぶん。" },
    { say: "mine", face: "pointer", text: "クリス、お願いがあります。いろんな時代へ行って、その時代の偉人――ヒーローたちを仲間にしながら、エネミーと戦ってほしいんです" },
    { say: "chris", face: "arms", text: "……マインの頼みじゃ断れないな" },
    { say: "chris", face: "cheer", text: "幼なじみのよしみだ、協力するよ！" },
    { say: "mine", face: "cheer", text: "ありがとう、クリス！ さっそく乗り込みましょう！" },
  ],
};

/** はじめてワールドマップを開いたとき */
export const MAP_INTRO = {
  bg: "2105",
  steps: [
    { say: "mine", face: "pointer", at: "right", text: "ここがタイムマシンのワールドマップです。行きたい時代と場所を選ぶと、そこへタイムスリップできます" },
    { say: "mine", face: "smile", text: "いまのタイムマシンで行けるのは「近代・日本」だけ。パーツを集めて改良すれば、行ける時代や国が増えていきます" },
    { say: "chris", face: "guts", at: "left", text: "よし、まずは近代の日本だな！" },
  ],
};

/** エリアに初めて着いたときのテロップ（共通） */
function arrival(area) {
  const era = eraById(area.era);
  return [
    { fx: "timeslip" },
    { bg: area.bg },
    { title: areaName(area), sub: `${era.en} · ${era.years}` },
  ];
}

/** 近代・日本の専用台本（チュートリアル） */
const KINDAI_JP = {
  0: [
    { say: "mine", face: "smile", at: "right", text: "到着！ ここは近代の日本ですね" },
    { say: "chris", face: "smile", at: "left", text: "人力車に洋館……教科書で見た景色だ！" },
    { say: "hero:10004", at: "center", text: "おや、見慣れない格好の子どもたちだね" },
    { say: "chris", face: "sad", text: "あ、あなたは……？" },
    { say: "hero:10004", text: "福沢諭吉という者だ。人は学ぶことで、いくらでも自分を高められる――そう本に書いている" },
    { fx: "shake" },
    { enter: "enemy", image: "assets/enemies/111.png", at: "right", fx: "drop" },
    { say: "hero:10004", text: "な、なんだあれは！" },
    { say: "mine", face: "pointer", text: "エネミーです！ 福沢さん、力を貸してください！" },
    { say: "hero:10004", text: "天は人の上に人を造らず。しかし、あれは人ではないな……よし、手を貸そう！" },
    { narr: "福沢諭吉が仲間になった！" },
    { say: "mine", face: "wink", text: "戦い方はわたしが教えますね。クリス、準備はいいですか？" },
  ],
  1: [
    { say: "mine", face: "pointer", at: "right", text: "エネミーの反応は、この先の書生街です" },
    { say: "hero:4056", at: "center", text: "吾輩は小説家である。名前は……夏目漱石という" },
    { say: "hero:4056", text: "妙な連中が街を騒がせていてね。おちおち原稿も書けやしない。君たちが退治してくれるのかね？" },
    { say: "chris", face: "guts", at: "left", text: "はい！ よかったら一緒に戦ってもらえませんか？" },
    { say: "hero:4056", text: "ふむ……則天去私。ここは筆を置いて、手を貸そうじゃないか" },
  ],
  2: [
    { say: "hero:5008", at: "center", text: "おまんらが、エネミーとかいう化け物を追いゆう者か！ わしは坂本龍馬じゃ" },
    { say: "hero:5008", text: "この国の夜明けを邪魔するやつは、放っておけんぜよ！" },
    { say: "mine", face: "pointer", at: "right", text: "近代日本のエネミーの親玉が、この先にいます。気をつけて！" },
    { say: "chris", face: "cheer", at: "left", text: "よし、行こう！" },
  ],
};

/** ステージの前のシーン（出会い） */
export function stageIntro(area, index, { first }) {
  const steps = [];
  if (index === 0 && first) steps.push(...arrival(area));
  else steps.push({ bg: area.bg });
  if (area.id === "kindai-jp") {
    steps.push(...(first ? KINDAI_JP[index] : [{ say: "mine", face: "smile", at: "right", text: "もう一度、腕だめしですね！" }]));
    return { bg: area.bg, steps };
  }
  const meet = area.stages[index].meet;
  if (first) {
    steps.push(
      { say: "mine", face: "pointer", at: "right", text: index === 0 ? `到着！ ここは${areaName(area)}ですね` : "エネミーの反応が強くなってきました" },
      { say: `hero:${meet}`, at: "center", text: "見慣れぬ者たちだな。……もしや、この地を騒がせる怪物を追っているのか？" },
      { say: "chris", face: "guts", at: "left", text: "はい！ 一緒に戦ってくれませんか？" },
      { say: `hero:${meet}`, text: "よかろう。この時代を守るためなら、力を貸そう！" },
    );
  } else {
    steps.push({ say: "mine", face: "smile", at: "right", text: "もう一度、腕だめしですね！" });
  }
  return { bg: area.bg, steps };
}

/** ステージクリアのあとのシーン（タイムマシンの改良） */
export function upgradeScene(fromLevel, toLevel, unlockedAreas) {
  const m = machineByLevel(toLevel);
  const places = unlockedAreas.map((id) => areaName(areaById(id)));
  const steps = [
    { say: "mine", face: "sparkle", at: "right", text: "パーツがそろいました！ タイムマシンを改良しますね" },
    { machine: toLevel, from: fromLevel },
    { say: "mine", face: "cheer", text: `${m.short}に進化しました！` },
  ];
  if (places.length) {
    steps.push({ say: "mine", face: "pointer", text: `これで「${places.join("」「")}」にも行けるようになります！` });
  } else {
    steps.push({ say: "mine", face: "smile", text: "これでもっと遠くまで行けそうです。でもまずは、この時代のエネミーを片付けましょう！" });
  }
  return { bg: "2505", steps };
}

/** チュートリアル（近代・日本）を終えたとき */
export const TUTORIAL_DONE = {
  bg: "1023",
  steps: [
    { say: "mine", face: "cheer", at: "right", text: "近代日本のエネミーは、いなくなりました！" },
    { say: "chris", face: "laugh", at: "left", text: "やったな！ みんなのおかげだよ" },
    { say: "mine", face: "pointer", text: "でも……ほかの国にも、エネミーの反応があります" },
    { say: "mine", face: "smile", text: "タイムマシンはもう近代のヨーロッパやアメリカにも行けます。仲間をふやしながら、ひとつずつ取り戻していきましょう！" },
    { say: "chris", face: "cheer", text: "おう！ 次はどこへ行こうか" },
  ],
};

/** エリアを最後までクリアしたとき（チュートリアル以外の共通） */
export function areaClearScene(area) {
  return {
    bg: area.bg,
    steps: [
      { say: "mine", face: "cheer", at: "right", text: `${areaName(area)}のエネミーを追い払いました！` },
      { say: "chris", face: "smile", at: "left", text: "この時代の人たちも、きっともう大丈夫だな" },
    ],
  };
}

export const heroActor = (key) => (key.startsWith("hero:") ? heroId(Number(key.slice(5))) : null);

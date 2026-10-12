// ストーリーの台本。シーンは「手順（step）」の配列で、js/ui/scene.js が再生する。
//
// 立ち絵は2体まで: 左はクリス、右はそれ以外の誰か1体（新しく出ると入れ替わる）。右の役はクリスの方を向く。
//
// step の種類
//   { say: "chris" | "mine" | "hero:10004" | "enemy" | "boss", face?, text, offscreen? }
//                                            … 台詞（立ち絵を出して喋る。offscreen は立ち絵を出さず声だけ）
//   { narr: "text" }                         … ナレーション
//   { enter: 役, image?, fx?, name? }        … 立ち絵を出す（台詞なし）。役 "boss" はレイドボス（name で名前）
//   { exit: 役, fx? }                        … 立ち絵を消す（"burst" で弾けて消える。"all" で全員）
//   { fx: "shake" | "flash" | "timeslip" | "boom" }
//   { bg: "1023" }                           … 背景を変える（assets/backgrounds/<id>.webp）
//   { machine: レベル, from?: レベル }       … タイムマシンを見せる（from があると改良の演出）
//   { title: "近代・日本", sub: "MODERN JAPAN" } … エリア名のテロップ
//
// ノード（時代×地域）ごとの専用の台本は M5（docs/story.md）で増やす。いまは近代・日本を専用、ほかは共通の台本。

import { areaById, areaName, eraById, heroId, isFinalStage, machineByLevel } from "../engine/world.js";

/** プロローグに出てくるエネミー（遭遇するだけ。戦わない） */
const PROLOGUE_ENEMY = "assets/enemies/101.png";

export const PROLOGUE = {
  bg: "1051",
  steps: [
    { narr: "さまざまな時代の、さまざまな国で――" },
    { narr: "歴史に「エネミー」が入り込み、少しずつ書き換え始めていた。" },
    { say: "chris", face: "smile", text: "今日もいい天気だなぁ。さて、どこへ行こうかな" },
    { fx: "shake" },
    { enter: "enemy", image: PROLOGUE_ENEMY, fx: "drop" },
    { say: "enemy", text: "ギギ……ギギギッ！" },
    { say: "chris", face: "sad", text: "うわっ!? な、なんだコイツ!?" },
    { say: "chris", face: "sad", text: "見たことない生き物……いや、そもそも生き物なのか……？" },
    { fx: "flash" },
    { say: "mine", offscreen: true, text: "クリス、下がって！" },
    { fx: "boom" },
    { exit: "enemy", fx: "burst" },
    { enter: "mine", fx: "drop" },
    { say: "chris", face: "smile", text: "マイン!? 助かったよ……。今のは何だったんだ？" },
    { say: "mine", face: "arms", text: "あれは「エネミー」。いま、世界中の歴史に入り込んで悪さをしているんです" },
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
    { say: "mine", face: "pointer", text: "ここがタイムマシンのワールドマップです。行きたい時代と場所を選ぶと、そこへタイムスリップできます" },
    { say: "mine", face: "smile", text: "いまのタイムマシンで行けるのは「近代・日本」だけ。それぞれの場所の奥にいるレイドボスを倒すとパーツが手に入って、集めて改良すれば行ける時代や国が増えていきます" },
    { say: "chris", face: "guts", text: "よし、まずは近代の日本だな！" },
  ],
};

/** ノードに初めて着いたときのテロップ（共通） */
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
    { say: "mine", face: "smile", text: "到着！ ここは近代の日本ですね" },
    { say: "chris", face: "smile", text: "人力車に洋館……教科書で見た景色だ！" },
    { say: "hero:10004", text: "おや、見慣れない格好の子どもたちだね" },
    { say: "chris", face: "sad", text: "あ、あなたは……？" },
    { say: "hero:10004", text: "福沢諭吉という者だ。人は学ぶことで、いくらでも自分を高められる――そう本に書いている" },
    { fx: "shake" },
    { enter: "enemy", image: "assets/enemies/111.png", fx: "drop" },
    { say: "hero:10004", offscreen: true, text: "な、なんだあれは！" },
    { say: "mine", offscreen: true, text: "エネミーです！ 福沢さん、力を貸してください！" },
    { say: "hero:10004", text: "天は人の上に人を造らず。しかし、あれは人ではないな……よし、手を貸そう！" },
    { narr: "福沢諭吉が仲間になった！" },
    { say: "mine", face: "wink", text: "戦い方はわたしが教えますね。クリス、準備はいいですか？" },
  ],
  1: [
    { say: "mine", face: "pointer", text: "エネミーの反応は、この先の書生街です" },
    { say: "hero:4056", text: "吾輩は小説家である。名前は……夏目漱石という" },
    { say: "hero:4056", text: "妙な連中が街を騒がせていてね。おちおち原稿も書けやしない。君たちが退治してくれるのかね？" },
    { say: "chris", face: "guts", text: "はい！ よかったら一緒に戦ってもらえませんか？" },
    { say: "hero:4056", text: "ふむ……則天去私。ここは筆を置いて、手を貸そうじゃないか" },
  ],
  2: [
    { say: "hero:5008", text: "おまんらが、エネミーとかいう化け物を追いゆう者か！ わしは坂本龍馬じゃ" },
    { say: "hero:5008", text: "この国の夜明けを邪魔するやつは、放っておけんぜよ！" },
    { say: "mine", face: "pointer", text: "近代日本のエネミーの親玉が、この先にいます。気をつけて！" },
    { say: "chris", face: "cheer", text: "よし、行こう！" },
  ],
};

/** 最終ステージ: レイドボスの登場（ステージの最後のウェーブで戦う）。ボスは右に出したまま、マインは声だけ */
function bossReveal(boss) {
  return [
    { fx: "shake" },
    { enter: "boss", image: boss.image, name: boss.name, fx: "drop" },
    { fx: "flash" },
    { say: "boss", text: "…………ゴ……ゴゴゴゴ……！" },
    { say: "chris", face: "sad", text: "で、でかい……！ なんだあれは!?" },
    { say: "mine", offscreen: true, text: `レイドボス「${boss.name}」！ この時代を書き換えている、エネミーの親玉です！` },
    { say: "mine", offscreen: true, text: "最後のウェーブで戦います。大技の予告が出たら要注意。それまでにたくさんダメージを与えましょう！" },
    { say: "chris", face: "guts", text: "よし……みんな、いくぞ！" },
  ];
}

/**
 * ステージの前のシーン（出会い）。boss はそのノードのレイドボス（最終ステージで登場）。
 * 出会うヒーローがいないステージは短く、最終ステージはレイドボスが現れる
 */
export function stageIntro(area, index, { first, boss = null }) {
  const steps = [];
  if (index === 0 && first) steps.push(...arrival(area));
  else steps.push({ bg: area.bg });
  const final = isFinalStage(area, index) && boss;
  if (area.id === "kindai-jp") {
    steps.push(...(first ? KINDAI_JP[index] : [{ say: "mine", face: "smile", text: "もう一度、腕だめしですね！" }]));
    if (first && final) steps.push(...bossReveal(boss));
    return { bg: area.bg, steps };
  }
  const meet = area.stages[index].meet;
  if (!first) {
    steps.push({ say: "mine", face: "smile", text: final ? `${boss.name}に、もう一度挑みましょう！` : "もう一度、腕だめしですね！" });
    return { bg: area.bg, steps };
  }
  if (meet) {
    steps.push(
      { say: "mine", face: "pointer", text: index === 0 ? `到着！ ここは${areaName(area)}ですね` : final ? "この先から、ものすごく強い反応が……！" : "エネミーの反応が強くなってきました" },
      { say: `hero:${meet}`, text: final ? "おぬしたちも、あの巨大な怪物を追ってきたのか。" : "見慣れぬ者たちだな。……もしや、この地を騒がせる怪物を追っているのか？" },
      { say: "chris", face: "guts", text: "はい！ 一緒に戦ってくれませんか？" },
      { say: `hero:${meet}`, text: "よかろう。この時代を守るためなら、力を貸そう！" },
    );
  } else {
    steps.push(
      { say: "mine", face: "pointer", text: "この先にエネミーが集まっています。拠点をひとつずつ片付けましょう！" },
      { say: "chris", face: "guts", text: "まかせて！" },
    );
  }
  if (final) steps.push(...bossReveal(boss));
  return { bg: area.bg, steps };
}

/** ステージクリアのあとのシーン（タイムマシンの改良） */
export function upgradeScene(fromLevel, toLevel, unlockedAreas) {
  const m = machineByLevel(toLevel);
  const places = unlockedAreas.map((id) => areaName(areaById(id)));
  const steps = [
    { say: "mine", face: "sparkle", text: "パーツがそろいました！ タイムマシンを改良しますね" },
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
    { say: "mine", face: "cheer", text: "近代日本のエネミーは、いなくなりました！" },
    { say: "chris", face: "laugh", text: "やったな！ みんなのおかげだよ" },
    { say: "mine", face: "pointer", text: "でも……ほかの国にも、エネミーの反応があります" },
    { say: "mine", face: "smile", text: "タイムマシンを調整したので、近代のヨーロッパやアメリカにも行けます。どちらも10か所ほどの拠点の奥に、レイドボスが待っています" },
    { say: "mine", face: "arms", text: "それから、ここからは「デッキ」が大事です。先へ進むほどマーケットに高いレアリティのヒーローが並ぶので、そのレアリティの仲間がデッキにいないと、マーケットの枠が空いてしまうんです" },
    { say: "mine", face: "wink", text: "新しい仲間が増えたら、デッキに入れてあげてくださいね。迷ったら「おまかせ」で！" },
    { say: "chris", face: "cheer", text: "おう！ 次はどこへ行こうか" },
  ],
};

/** ノードを最後までクリアしたとき（チュートリアル以外の共通）。opened: 新しく行けるようになったノード */
export function areaClearScene(area, opened = []) {
  const steps = [
    { say: "mine", face: "cheer", text: `${areaName(area)}のエネミーを追い払いました！` },
    { say: "chris", face: "smile", text: "この時代の人たちも、きっともう大丈夫だな" },
  ];
  if (opened.length) {
    const places = opened.map((id) => areaName(areaById(id)));
    steps.push({ say: "mine", face: "pointer", text: `タイムマシンを調整しました。これで「${places.join("」「")}」にも行けます！` });
  }
  return { bg: area.bg, steps };
}

export const heroActor = (key) => (key.startsWith("hero:") ? heroId(Number(key.slice(5))) : null);

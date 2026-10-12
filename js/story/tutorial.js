// チュートリアル（1-1）でマインが操作を案内する手順。
// screen: どの画面で出すか / wave: 何ウェーブ目で出すか（run.wins + 1）
// target: 光らせる要素 / until: 次へ進むきっかけ（操作のイベント名。"ok" はボタン）
// fallback: target が見つからないときの代わりの案内
// spendFirst: まだ買えるヒーローが残っていたら、バトルより先に強化を案内する（main.js の stepView）

export const TUTORIAL_STEPS = [
  {
    id: "select",
    screen: "market",
    wave: 1,
    target: '.offer[data-offer="0"]',
    text: "ここはマーケット。GUMを使ってヒーローを仲間にします。まずはヒーローをタップ！",
    until: "select",
  },
  {
    id: "buy",
    screen: "market",
    wave: 1,
    target: ".compact-actions .btn.primary",
    text: "「購入」をタップ！ 同じヒーローをもう一度タップしても買えます",
    until: "buy",
  },
  {
    id: "buy-more",
    screen: "market",
    wave: 1,
    target: '.offer[data-offer="1"]',
    text: "パーティに入りました！ 同じヒーローがもう1体いますね。これも仲間にしておきましょう",
    until: "buy",
    fallback: { target: ".party-grid", text: "パーティに入りました！ GUMがあるうちは仲間をふやしましょう", button: "OK" },
  },
  {
    id: "battle",
    screen: "market",
    wave: 1,
    target: ".battle-btn",
    text: "準備ができたら「バトル開始」！",
    until: "battle",
    spendFirst: true,
  },
  {
    id: "battle-rule",
    screen: "battle",
    wave: 1,
    text: "バトルは自動で進みます。チャージがたまったヒーローからスキルを使い、HPはパーティみんなで共有です",
    button: "OK",
    until: "ok",
  },
  {
    id: "merge",
    screen: "market",
    wave: 2,
    target: ".offer.merge-ready",
    text: "光っているヒーローは、買うと同じヒーローが3体そろって合成！ Lv2に強くなります",
    until: "merge",
    fallback: { target: '.offer[data-offer="0"]', text: "同じヒーローを3体そろえると合成してLv2に！ 覚えておいてくださいね", button: "OK" },
  },
  {
    id: "extension",
    screen: "modal-extension",
    wave: 2,
    target: ".choice-card",
    text: "合成するとエクステンションがもらえます。どれか1つ選んでください",
    until: "extension",
  },
  {
    id: "battle-2",
    screen: "market",
    wave: 2,
    target: ".battle-btn",
    text: "いい感じです！ バトルへ行きましょう",
    until: "battle",
    spendFirst: true,
  },
  {
    id: "lock",
    screen: "market",
    wave: 3,
    target: ".offer-lock",
    text: "欲しいけどGUMが足りないヒーローは、南京錠で取り置き。↻で更新しても、次のウェーブまで残ります",
    button: "OK",
    until: "ok",
  },
  {
    id: "last",
    screen: "market",
    wave: 3,
    target: ".battle-btn",
    text: "あと1勝で1-1クリアです。がんばって！",
    until: "battle",
    spendFirst: true,
  },
];

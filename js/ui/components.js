// 画面間で共通の表示部品。

import { h, img } from "./h.js";
import { RARITY, baseCooldown, unitHp, sellValue } from "../engine/balance.js";
import { FACTIONS, KIND_ICONS, KIND_LABELS } from "../engine/content.js";
import { baseEffects, effectLevelTable, effectText, hasChargeSkill, triggerLabel } from "../engine/units.js";

export function rarityBadge(rarity) {
  return h("span", { class: `rarity-badge r${rarity}` }, RARITY[rarity].name);
}

export function factionBadge(faction) {
  const f = FACTIONS[faction] ?? FACTIONS[0];
  return h("span", { class: "faction-badge", style: { "--faction": f.color } }, f.name);
}

export function levelStars(level) {
  return h("span", { class: `lv lv${level}` }, `Lv${level}`);
}

export function gumAmount(value, cls = "") {
  return h("span", { class: `gum ${cls}` }, img("assets/icons/gum.png", "gum-icon"), String(value));
}

/** ヒーロー/エネミーのカード（マーケット・パーティ・バトル共通） */
export function unitCard(def, { level = 1, compact = false, extra = null } = {}) {
  const main = def.effects[0];
  return h(
    "div",
    { class: `unit-card r${def.rarity}${compact ? " compact" : ""}` },
    h(
      "div",
      { class: "unit-art" },
      img(def.image, "pixel unit-img", def.name),
      h("span", { class: "unit-kind", title: KIND_LABELS[main.kind] }, img(KIND_ICONS[main.kind], "kind-icon")),
      level ? levelStars(level) : null,
    ),
    h("div", { class: "unit-name" }, def.name),
    extra,
  );
}

/** 合成の進み具合を ●●○ で表す */
export function pips(have, need, cls = "") {
  return h(
    "span",
    { class: `pips ${cls}`, "aria-label": `${have}/${need}` },
    Array.from({ length: need }, (_, i) => h("i", { class: i < have ? "on" : "" })),
  );
}

const VALUE_TOKEN = "\u0000";

/** 効果文の中の数値を「Lv1 / Lv2 / Lv3」の並びにして、現在Lvを強調する */
function effectLine(row, cd, currentLevel) {
  const text = effectText(row.kind, VALUE_TOKEN);
  const [before, after] = text.split(VALUE_TOKEN);
  const values = row.values.map((v, i) =>
    h("b", { class: i + 1 === currentLevel ? "cur" : "" }, row.kind === "haste" || row.kind === "slow" ? v.toFixed(1) : v),
  );
  const joined = [];
  values.forEach((v, i) => {
    if (i) joined.push(h("span", { class: "sep" }, "/"));
    joined.push(v);
  });
  return h(
    "li",
    { class: `skill-line kind-${row.kind}` },
    h("span", { class: `trigger trigger-${row.trigger}` }, triggerLabel(row.trigger, cd)),
    img(KIND_ICONS[row.kind], "kind-icon"),
    h("span", { class: "skill-text" }, before, h("span", { class: "values" }, joined), after),
  );
}

export function skillBlock(def, currentLevel = 1) {
  const cd = hasChargeSkill(def) ? baseCooldown(def) : null;
  const maxLevel = Math.max(3, currentLevel);
  return h(
    "div",
    { class: "skill-block" },
    h("div", { class: "skill-name" }, def.skill_name),
    h(
      "ul",
      { class: "skill-lines" },
      effectLevelTable(def, maxLevel).map((row) => effectLine(row, cd, currentLevel)),
    ),
  );
}

/** 詳細パネル（マーケットのヒーロー、または所持ヒーロー） */
export function unitDetail(def, { unit = null, sellBonus = 0, actions = null } = {}) {
  const level = unit?.level ?? 1;
  const cd = hasChargeSkill(def) ? baseCooldown(def) : null;
  const notes = [];
  if (unit?.permMult) notes.push(`効果量+${unit.permMult}%`);
  if (unit?.cdReduce) notes.push(`チャージ時間-${unit.cdReduce}%`);
  return h(
    "div",
    { class: "unit-detail" },
    h(
      "div",
      { class: "detail-head" },
      h("div", { class: `detail-art r${def.rarity}` }, img(def.image, "pixel", def.name)),
      h(
        "div",
        { class: "detail-title" },
        h("div", { class: "detail-name" }, def.name, unit ? levelStars(level) : null),
        h(
          "div",
          { class: "detail-badges" },
          rarityBadge(def.rarity),
          factionBadge(def.faction),
          def.attributes?.length ? h("span", { class: "attrs" }, def.attributes.join("・")) : null,
        ),
        h(
          "div",
          { class: "detail-stats" },
          h("span", null, `パーティHP +${unitHp(def, level)}`),
          cd ? h("span", null, `チャージ ${cd}秒`) : h("span", null, "パッシブのみ"),
          unit ? h("span", null, "売却 ", gumAmount(sellValue(def, level, sellBonus))) : h("span", null, "価格 ", gumAmount(RARITY[def.rarity].cost)),
        ),
        notes.length ? h("div", { class: "detail-notes" }, notes.join(" / ")) : null,
      ),
    ),
    skillBlock(def, level),
    h(
      "p",
      { class: "merge-rule" },
      "Lvアップ：同じヒーローを3体集めるとLv2、Lv2を2体でLv3（購入した瞬間に自動で合成）。クリプトエナジーでも1Lv上がります。",
    ),
    h("details", { class: "source-text" }, h("summary", null, "元のスキル（MCH）"), h("p", null, def.source_text)),
    actions ? h("div", { class: "detail-actions" }, actions) : null,
  );
}

/** 効果の短い表記（情報バー・バトル用） */
export function effectShort(kind, value) {
  switch (kind) {
    case "haste":
      return `隣接チャージ+${value}秒`;
    case "slow":
      return `敵チャージ-${value}秒`;
    case "buff":
      return `隣接効果量+${value}%`;
    case "weaken":
      return `敵効果量-${value}%`;
    default:
      return `${KIND_LABELS[kind]} ${value}`;
  }
}

function effectChips(def, level, permMult = 0) {
  const cd = hasChargeSkill(def) ? baseCooldown(def) : null;
  return baseEffects(def, level).map((e) => {
    let v = e.value * (1 + permMult / 100);
    v = e.kind === "haste" || e.kind === "slow" ? Math.round(v * 10) / 10 : Math.round(v);
    return h(
      "span",
      { class: `fx-chip kind-${e.kind}` },
      h("span", { class: `trigger trigger-${e.trigger}` }, e.trigger === "start" ? "開始" : `${cd}s`),
      img(KIND_ICONS[e.kind], "kind-icon"),
      effectShort(e.kind, v),
    );
  });
}

/** 情報バー用のコンパクトなユニット表示 */
export function compactUnit(def, { unit = null, actions = [], progress = null } = {}) {
  const level = unit?.level ?? 1;
  return h(
    "div",
    { class: "compact" },
    h("div", { class: `compact-art r${def.rarity}` }, img(def.image, "pixel", def.name)),
    h(
      "div",
      { class: "compact-body" },
      h(
        "div",
        { class: "compact-title" },
        h("span", { class: "compact-name" }, def.name),
        unit ? levelStars(level) : null,
        h("span", { class: `rarity-dot r${def.rarity}`, title: RARITY[def.rarity].name }, RARITY[def.rarity].name[0]),
        def.faction ? factionBadge(def.faction) : null,
        unit?.permMult || unit?.cdReduce ? h("span", { class: "boost-mark" }, "+") : null,
        progress,
      ),
      h("div", { class: "compact-fx" }, effectChips(def, level, unit?.permMult || 0)),
    ),
    h("div", { class: "compact-actions" }, actions),
  );
}

export function compactMaterial(material, actions = []) {
  return h(
    "div",
    { class: "compact" },
    h("div", { class: "compact-art material" }, img(material.image, "", material.name)),
    h(
      "div",
      { class: "compact-body" },
      h("div", { class: "compact-title" }, h("span", { class: "compact-name" }, material.name)),
      h("div", { class: "compact-fx" }, h("span", { class: "fx-chip" }, material.text)),
    ),
    h("div", { class: "compact-actions" }, actions),
  );
}

export function materialCard(material) {
  return h(
    "div",
    { class: "unit-card material" },
    h("div", { class: "unit-art" }, img(material.image, "material-img", material.name)),
    h("div", { class: "unit-name" }, material.name),
  );
}

export function materialDetail(material, actions = null) {
  return h(
    "div",
    { class: "unit-detail" },
    h(
      "div",
      { class: "detail-head" },
      h("div", { class: "detail-art material" }, img(material.image, "", material.name)),
      h(
        "div",
        { class: "detail-title" },
        h("div", { class: "detail-name" }, material.name),
        h("div", { class: "detail-badges" }, h("span", { class: "rarity-badge mat" }, "マテリアル")),
        h("div", { class: "detail-stats" }, h("span", null, "価格 ", gumAmount(material.cost))),
      ),
    ),
    h("p", { class: "material-text" }, material.text),
    actions ? h("div", { class: "detail-actions" }, actions) : null,
  );
}

export function extensionIcon(ext, count = 1) {
  return h(
    "div",
    { class: "ext-icon", title: `${ext.name}：${ext.text}` },
    img(ext.image, "pixel", ext.name),
    count > 1 ? h("span", { class: "ext-count" }, `×${count}`) : null,
  );
}

export function modal(title, body, { className = "", footer = null } = {}) {
  return h(
    "div",
    { class: `modal-backdrop ${className}` },
    h("div", { class: "modal" }, title ? h("h2", { class: "modal-title" }, title) : null, h("div", { class: "modal-body" }, body), footer),
  );
}

let toastTimer = null;
export function toast(message, kind = "info") {
  let el = document.querySelector(".toast");
  if (!el) {
    el = h("div", { class: "toast" });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

#!/usr/bin/env python3
"""mycryptoheroes のアセットDBから、ゲームで使うデータとアセットを生成する。

使い方:
    python3 scripts/build_data.py [mycryptoheroesリポジトリのパス]

パスを省略した場合は環境変数 MCH_ASSETS、次に ../mycryptoheroes を使う。

出力:
    data/heroes.json      プレイヤー側ユニット（ヒーロー）定義
    data/enemies.json     CPU側ユニット（エネミー）定義
    data/extensions.json  エクステンション（トリンケット相当）定義
    data/manifest.json    生成情報・クレジット
    assets/...            ゲームで使う画像・音声

数値（ダメージ量・チャージ時間など）はここでは決めず、正規化した素性
（レアリティ、AGI/HPの順位、スキル種別と配分）だけを出力する。
実際の数値は js/engine/balance.js で計算するため、調整時に再生成は不要。
"""

import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

RARITY_IDS = {"Common": 1, "Uncommon": 2, "Rare": 3, "Epic": 4, "Legendary": 5}

FACTIONS = {
    1: {"ja": "朱雀", "en": "SUZAKU"},
    2: {"ja": "青龍", "en": "SEIRYU"},
    3: {"ja": "玄武", "en": "GENBU"},
    4: {"ja": "黄竜", "en": "KOURYU"},
    5: {"ja": "白虎", "en": "BYAKKO"},
}

# エネミー画像の重複を除いた代表を何体使うか（レアリティ帯ごと）
ENEMIES_PER_TIER = 40

# 版権コラボのキャラクター。元データでは category が original のため個別に除外する。
# 順位（agi_pct など）の計算には含めたまま出力だけ外し、他のユニットの数値を変えない。
EXCLUDED_HERO_IDS = {2035}  # 猿田彦
EXCLUDED_ENEMY_IMAGES = {"Image/Enemies/715.png"}  # ゴースト・猿田彦

BACKGROUND_IDS = ["1001", "1003", "1023", "1038", "1050", "2105", "2405", "2705"]
# バトル用（MCHの色違いの背景）。ステージごとに順番に使う
BATTLE_BACKGROUND_IDS = ["2105", "2405", "2805", "2705", "2301", "2205", "2605", "2505", "2905"]


def find_source() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1]).resolve()
    env = os.environ.get("MCH_ASSETS")
    if env:
        return Path(env).resolve()
    return (ROOT.parent / "mycryptoheroes").resolve()


# ---------------------------------------------------------------------------
# スキル文の分類
# ---------------------------------------------------------------------------

STATUS_WORDS = "睡眠|混乱|恐怖|バインド|スタン|麻痺"


def classify_effect(text: str):
    """MCHのスキル効果文1つを、このゲームのスキル種別に変換する。

    戻り値は damage / shield / heal / bleed / poison / haste / slow / buff /
    weaken のいずれか。自分への弱体化など、変換対象にしない効果は None。
    """
    t = text.replace("ActiveSkill", "Active Skill")
    subject = re.split(r"[をに]", t, maxsplit=1)[0]
    enemy = "敵" in subject
    ally = not enemy

    if re.search(r"状態異常.*解除|解除", t) and ally:
        return "heal"
    if re.search(r"復活|回復", t):
        return "heal" if ally else None
    if re.search(r"バリア|デコイ|シールド", t):
        return "shield" if ally else None
    if "毒" in t:
        return "poison" if enemy else None
    if "出血" in t:
        return "bleed" if enemy else None
    if re.search(STATUS_WORDS, t):
        return "slow" if enemy else None
    if re.search(r"ダメージ|攻撃", t) and (enemy or not re.search(r"アップ|ダウン", t)):
        return "damage"
    if re.search(r"AGI|チャージ", t) and "アップ" in t:
        return "haste" if ally else None
    if re.search(r"AGI|チャージ", t) and "ダウン" in t:
        return "slow" if enemy else None
    if re.search(r"PHY|INT|HP", t) and "アップ" in t:
        return "buff" if ally else None
    if re.search(r"PHY|INT", t) and "ダウン" in t:
        return "weaken" if enemy else None
    if re.search(r"PHY|INT", t):
        # エネミーの「先頭＋中衛PHY」のような短縮表記は攻撃とみなす
        return "damage"
    return None


def split_enemy_text(text: str):
    parts = re.split(r"[、/／]|を与え|し、|と(?=睡眠|混乱|恐怖|出血|毒)", text)
    return [p.strip() for p in parts if p.strip()]


def main_kind(stats, hp_pct, agi_pct, passive_kinds):
    """ステータスの傾向からメインのアクティブスキル種別を決める。

    MCHではヒーローの攻撃手段はエクステンション側のActive Skillで、ヒーロー固有の
    パッシブスキルは支援効果が中心になる。そのままだと支援役ばかりになるため、
    メイン効果はステータス（HP/PHY/INT/AGI）の傾向から決め、パッシブ由来の効果を
    サブ効果として付ける。
    """
    phy, int_ = stats["phy"], stats["int"]
    if hp_pct >= 0.8 and max(phy, int_) < stats["hp"] * 0.35:
        return "shield"
    if phy >= int_ * 1.2:
        return "bleed" if agi_pct >= 0.65 else "damage"
    if int_ >= phy * 1.2:
        if "heal" in passive_kinds:
            return "heal"
        if "shield" in passive_kinds:
            return "shield"
        if any(k in passive_kinds for k in ("slow", "weaken", "poison")):
            return "poison"
        return "damage"
    if "heal" in passive_kinds:
        return "heal"
    return "damage"


def build_effects(main, passive_kinds, passive_trigger):
    """メイン効果（チャージで発動）＋パッシブ由来のサブ効果を作る。"""
    sub = next((k for k in passive_kinds if k and k != main), None)
    if sub is None:
        return [{"kind": main, "weight": 1.0, "trigger": "charge"}]
    if passive_trigger == "start":
        return [
            {"kind": main, "weight": 0.8, "trigger": "charge"},
            {"kind": sub, "weight": 0.6, "trigger": "start"},
        ]
    return [
        {"kind": main, "weight": 0.65, "trigger": "charge"},
        {"kind": sub, "weight": 0.35, "trigger": "charge"},
    ]


def percentile_map(values):
    """値 -> 0..1 の順位（同値は同じ順位）。"""
    ordered = sorted(values)
    n = len(ordered)
    result = {}
    for v in set(values):
        lo = ordered.index(v)
        hi = n - 1 - ordered[::-1].index(v)
        result[v] = ((lo + hi) / 2) / max(1, n - 1)
    return result


# ---------------------------------------------------------------------------
# ヒーロー
# ---------------------------------------------------------------------------


def build_heroes(src: Path):
    heroes = json.loads((src / "Data/Heroes/heroes.json").read_text(encoding="utf-8"))
    pool = [
        h
        for h in heroes
        if h.get("category") == "original"
        and h.get("rarity", {}).get("name") in RARITY_IDS
        and h.get("passive")
        and (src / h["image_file_path"]).exists()
    ]
    agi_pct = percentile_map([h["max_level_stats"]["agi"] for h in pool])
    hp_pct = percentile_map([h["max_level_stats"]["hp"] for h in pool])

    out = []
    out_dir = ROOT / "assets/heroes"
    out_dir.mkdir(parents=True, exist_ok=True)
    for h in pool:
        if h["id"] in EXCLUDED_HERO_IDS:
            continue
        passive = h["passive"]
        desc = passive["description"]["ja"]
        kinds = [classify_effect(e["description"]) for e in desc["effects"]]
        trigger = "start" if desc.get("condition", "").startswith("バトル開始時") else "charge"
        stats = h["max_level_stats"]
        main = main_kind(stats, hp_pct[stats["hp"]], agi_pct[stats["agi"]], kinds)
        image_name = f"{h['id']}.png"
        shutil.copyfile(src / h["image_file_path"], out_dir / image_name)
        out.append(
            {
                "id": f"h{h['id']}",
                "mch_id": h["id"],
                "side": "hero",
                "name": h["name"]["ja"],
                "name_en": h["name"]["en"],
                "image": f"assets/heroes/{image_name}",
                "rarity": RARITY_IDS[h["rarity"]["name"]],
                "faction": h["faction"]["id"],
                "attributes": [a["name"]["ja"] for a in h.get("attributes", [])],
                "skill_name": passive["name"]["ja"],
                "agi_pct": round(agi_pct[stats["agi"]], 4),
                "hp_pct": round(hp_pct[stats["hp"]], 4),
                "stats": stats,
                "effects": build_effects(main, kinds, trigger),
                "source_text": desc["text"].replace("{triggerRate}", str(desc.get("trigger_rate", ""))),
            }
        )
    out.sort(key=lambda u: (u["rarity"], u["mch_id"]))
    return out


# ---------------------------------------------------------------------------
# エネミー
# ---------------------------------------------------------------------------


def build_enemies(src: Path):
    enemies = json.loads((src / "Data/Enemies/enemies.json").read_text(encoding="utf-8"))
    groups = {}
    for e in enemies:
        if not e.get("image_exists") or not (src / e["image_file_path"]).exists():
            continue
        if not e.get("active_skills"):
            continue
        groups.setdefault(e["image_file_path"], []).append(e)

    reps = []
    for path, members in groups.items():
        members.sort(key=lambda e: sum(e["base_param"].values()))
        rep = members[len(members) // 2]
        total = sum(rep["base_param"].values())
        if total > 100000:  # レイドボス等の極端な値は除外
            continue
        reps.append(rep)

    totals = [sum(e["base_param"].values()) for e in reps]
    total_pct = percentile_map(totals)
    agi_pct = percentile_map([e["base_param"]["agi"] for e in reps])
    hp_pct = percentile_map([e["base_param"]["hp"] for e in reps])

    by_tier = {r: [] for r in range(1, 6)}
    for e in reps:
        pct = total_pct[sum(e["base_param"].values())]
        tier = min(5, 1 + int(pct * 5))
        by_tier[tier].append(e)

    out = []
    out_dir = ROOT / "assets/enemies"
    out_dir.mkdir(parents=True, exist_ok=True)
    for tier, members in by_tier.items():
        members.sort(key=lambda e: e["id"])
        step = max(1, len(members) / ENEMIES_PER_TIER)
        picked = [members[int(i * step)] for i in range(min(ENEMIES_PER_TIER, len(members)))]
        for e in picked:
            if e["image_file_path"] in EXCLUDED_ENEMY_IMAGES:
                continue
            skill = e["active_skills"][0]
            text = skill["description"]["ja"]["text"]
            kinds = [classify_effect(p) for p in split_enemy_text(text)]
            stats = e["base_param"]
            first = next((k for k in kinds if k), "damage")
            main = first if first in ("heal", "shield", "poison", "bleed") else main_kind(
                stats, hp_pct[stats["hp"]], agi_pct[stats["agi"]], kinds
            )
            image_name = Path(e["image_file_path"]).name
            shutil.copyfile(src / e["image_file_path"], out_dir / image_name)
            out.append(
                {
                    "id": f"e{e['id']}",
                    "mch_id": e["id"],
                    "side": "enemy",
                    "name": e["name"]["ja"],
                    "name_en": e["name"]["en"],
                    "image": f"assets/enemies/{image_name}",
                    "rarity": tier,
                    "faction": 0,
                    "attributes": [],
                    "skill_name": skill["name"]["ja"],
                    "agi_pct": round(agi_pct[stats["agi"]], 4),
                    "hp_pct": round(hp_pct[stats["hp"]], 4),
                    "stats": stats,
                    "effects": build_effects(main, kinds, "charge"),
                    "source_text": text,
                }
            )
    out.sort(key=lambda u: (u["rarity"], u["mch_id"]))
    return out


# ---------------------------------------------------------------------------
# エクステンション（トリンケット相当）
# ---------------------------------------------------------------------------


def build_extensions(src: Path):
    defs = json.loads((ROOT / "content/extensions.json").read_text(encoding="utf-8"))
    master = {
        e["id"]: e for e in json.loads((src / "Data/Extensions/extensions.json").read_text(encoding="utf-8"))
    }
    out_dir = ROOT / "assets/extensions"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = []
    for d in defs:
        ext = master[d["mch_extension_id"]]
        image_name = f"{ext['id']}.png"
        shutil.copyfile(src / ext["image_file_path"], out_dir / image_name)
        out.append({**d, "name": ext["name"]["ja"], "name_en": ext["name"]["en"], "image": f"assets/extensions/{image_name}"})
    return out


# ---------------------------------------------------------------------------
# その他のアセット
# ---------------------------------------------------------------------------

COPY_FILES = {
    # キャラクター（プレイヤー）
    "Image/Characters/Gif/chris_loop.gif": "assets/characters/chris_loop.gif",
    "Image/Characters/chris_03_cheer.png": "assets/characters/chris_cheer.png",
    "Image/Characters/chris_04_guts_pose.png": "assets/characters/chris_guts.png",
    "Image/Characters/chris_08_sad.png": "assets/characters/chris_sad.png",
    "Image/Characters/Gif/chris_cry_loop.gif": "assets/characters/chris_cry_loop.gif",
    "Image/Characters/Gif/navi_ain_loop.gif": "assets/characters/navi_ain_loop.gif",
    "Image/Characters/navi_ain_02_both_arms_up.png": "assets/characters/navi_ain_cheer.png",
    "Image/Characters/navi_ain_00_pointer_up.png": "assets/characters/navi_ain_pointer.png",
    "Image/Characters/navi_ain_10_teary.png": "assets/characters/navi_ain_sad.png",
    "Image/Characters/Gif/navi_ain_greeting_loop.gif": "assets/characters/navi_ain_greeting_loop.gif",
    # 口パク（吹き出しで喋っている間に使う）と、選択画面のポーズ差分
    "Image/Characters/Gif/chris_speak_loop.gif": "assets/characters/chris_talk.gif",
    "Image/Characters/Gif/navi_ain_speak_loop.gif": "assets/characters/navi_ain_talk.gif",
    "Image/Characters/Gif/navi_ain_cross_loop.gif": "assets/characters/navi_ain_cross_loop.gif",
    "Image/Characters/Gif/maycri_loop.gif": "assets/characters/maycri_loop.gif",
    "Image/Characters/chris_01_arms_crossed.png": "assets/characters/chris_arms_crossed.png",
    "Image/Characters/chris_02_wave.png": "assets/characters/chris_wave.png",
    "Image/Characters/chris_05_smile.png": "assets/characters/chris_smile.png",
    "Image/Characters/chris_06_laugh.png": "assets/characters/chris_laugh.png",
    "Image/Characters/chris_07_sparkle.png": "assets/characters/chris_sparkle.png",
    "Image/Characters/navi_ain_01_arms_crossed.png": "assets/characters/navi_ain_arms_crossed.png",
    "Image/Characters/navi_ain_03_wave.png": "assets/characters/navi_ain_wave.png",
    "Image/Characters/navi_ain_05_wink.png": "assets/characters/navi_ain_wink.png",
    "Image/Characters/navi_ain_06_smile.png": "assets/characters/navi_ain_smile.png",
    "Image/Characters/navi_ain_08_sparkle.png": "assets/characters/navi_ain_sparkle.png",
    "Image/Icons/mai_sd.png": "assets/characters/mai_sd.png",
    # アイコン
    "Image/Icons/gum.png": "assets/icons/gum.png",
    "Image/Icons/ce.png": "assets/icons/ce.png",
    "Image/Icons/cp.png": "assets/icons/cp.png",
    "Image/Icons/emblem.webp": "assets/icons/emblem.webp",
    "Image/Icons/gold_dust.webp": "assets/icons/gold_dust.webp",
    "Image/Icons/mch_icon.png": "assets/icons/mch_icon.png",
    # マテリアル（アイテム相当）
    "Image/Materials/Gemstones/315.webp": "assets/materials/ifrit.webp",
    "Image/Materials/Gemstones/325.webp": "assets/materials/leviathan.webp",
    "Image/Materials/Gemstones/335.webp": "assets/materials/tiamat.webp",
    "Image/Materials/Gemstones/345.webp": "assets/materials/garuda.webp",
    # バトルアイコン
    "Image/BattleIcons/Parameters/hp.png": "assets/battle-icons/hp.png",
    "Image/BattleIcons/Parameters/phy.png": "assets/battle-icons/phy.png",
    "Image/BattleIcons/Parameters/int.png": "assets/battle-icons/int.png",
    "Image/BattleIcons/Buffs/buf_agi.png": "assets/battle-icons/buf_agi.png",
    "Image/BattleIcons/Buffs/buf_phy.png": "assets/battle-icons/buf_phy.png",
    "Image/BattleIcons/Buffs/buf_int.png": "assets/battle-icons/buf_int.png",
    "Image/BattleIcons/Buffs/dbf_agi.png": "assets/battle-icons/dbf_agi.png",
    "Image/BattleIcons/Buffs/dbf_phy.png": "assets/battle-icons/dbf_phy.png",
    "Image/BattleIcons/StatusEffects/bleed.png": "assets/battle-icons/bleed.png",
    "Image/BattleIcons/StatusEffects/poison.png": "assets/battle-icons/poison.png",
    "Image/BattleIcons/StatusEffects/sleep.png": "assets/battle-icons/sleep.png",
    "Image/BattleIcons/StatusEffects/resurrection.png": "assets/battle-icons/resurrection.png",
    # バトルエフェクト
    "Image/Effects/Battle/01_single_damage.png": "assets/effects/01_single_damage.png",
    "Image/Effects/Battle/02_area_damage.png": "assets/effects/02_area_damage.png",
    "Image/Effects/Battle/03_heal_resurrection.png": "assets/effects/03_heal_resurrection.png",
    "Image/Effects/Battle/04_buff.png": "assets/effects/04_buff.png",
    "Image/Effects/Battle/05_debuff_status_effect.png": "assets/effects/05_debuff_status_effect.png",
    # 音声
    "Audio/BGM/pve.mp3": "assets/audio/bgm_battle.mp3",
    "Audio/BGM/land.mp3": "assets/audio/bgm_market.mp3",
    "Audio/BGM/pvp.mp3": "assets/audio/bgm_title.mp3",
    "Audio/SE/Battle/1_single_damage.mp3": "assets/audio/se_damage.mp3",
    "Audio/SE/Battle/2_area_damage.mp3": "assets/audio/se_area_damage.mp3",
    "Audio/SE/Battle/3_heal_resurrection.mp3": "assets/audio/se_heal.mp3",
    "Audio/SE/Battle/4_buff.mp3": "assets/audio/se_buff.mp3",
    "Audio/SE/Battle/5_debuff_status_effect.mp3": "assets/audio/se_debuff.mp3",
    "Audio/SE/Jingles/win.mp3": "assets/audio/jingle_win.mp3",
    "Audio/SE/Jingles/lose.mp3": "assets/audio/jingle_lose.mp3",
    "Audio/SE/Jingles/knight.mp3": "assets/audio/jingle_clear.mp3",
    "Audio/SE/Actions/open_treasure.mp3": "assets/audio/se_treasure.mp3",
    "Audio/SE/Actions/insp.mp3": "assets/audio/se_merge.mp3",
    "Audio/SE/Actions/production.mp3": "assets/audio/se_buy.mp3",
    "Audio/SE/Actions/crash.mp3": "assets/audio/se_sell.mp3",
    # MCHのカットイン演出CSS
    "Style/Cutins/passive_skill_cutin.css": "css/cutins/passive_skill_cutin.css",
    "Style/Cutins/battle_result_cutin.css": "css/cutins/battle_result_cutin.css",
}


def copy_misc(src: Path):
    for s, d in COPY_FILES.items():
        dst = ROOT / d
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src / s, dst)

    bg_dir = ROOT / "assets/backgrounds"
    bg_dir.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image  # type: ignore
    except ImportError:
        Image = None
    def convert(bid):
        s = src / f"Image/Backgrounds/{bid}.png"
        if Image is not None:
            dst = bg_dir / f"{bid}.webp"
            if not dst.exists():
                Image.open(s).convert("RGB").save(dst, "WEBP", quality=72, method=6)
        else:
            dst = bg_dir / f"{bid}.png"
            shutil.copyfile(s, dst)
        return str(dst.relative_to(ROOT))

    return [convert(bid) for bid in BACKGROUND_IDS], [convert(bid) for bid in BATTLE_BACKGROUND_IDS]


def main():
    src = find_source()
    if not (src / "Data/Heroes/heroes.json").exists():
        sys.exit(f"mycryptoheroes リポジトリが見つかりません: {src}")

    for d in ["assets/heroes", "assets/enemies", "assets/extensions", "assets/backgrounds"]:
        shutil.rmtree(ROOT / d, ignore_errors=True)

    heroes = build_heroes(src)
    enemies = build_enemies(src)
    extensions = build_extensions(src)
    backgrounds, battle_backgrounds = copy_misc(src)

    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)

    def dump(name, obj):
        (data_dir / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    dump("heroes.json", heroes)
    dump("enemies.json", enemies)
    dump("extensions.json", extensions)
    dump(
        "manifest.json",
        {
            "source": "https://github.com/bearko/mycryptoheroes",
            "factions": FACTIONS,
            "backgrounds": backgrounds,
            "battleBackgrounds": battle_backgrounds,
            "counts": {"heroes": len(heroes), "enemies": len(enemies), "extensions": len(extensions)},
            "credits": {
                "chris": "ドット絵：こじもこ",
                "navi_ain": "ドット絵：こじもこ",
                "mch_images": "ヒーロー・エクステンション・エネミー画像: My Crypto Heroes（MCH Co., Ltd.）",
            },
        },
    )

    from collections import Counter

    print(f"heroes: {len(heroes)} {dict(Counter(h['rarity'] for h in heroes))}")
    print(f"  kinds: {dict(Counter(e['kind'] for h in heroes for e in h['effects']))}")
    print(f"  main: {dict(Counter(h['effects'][0]['kind'] for h in heroes))}")
    print(f"  start: {sum(1 for h in heroes for e in h['effects'] if e['trigger'] == 'start')}")
    print(f"enemies: {len(enemies)} {dict(Counter(e['rarity'] for e in enemies))}")
    print(f"  kinds: {dict(Counter(e['kind'] for h in enemies for e in h['effects']))}")
    print(f"  main: {dict(Counter(h['effects'][0]['kind'] for h in enemies))}")
    print(f"extensions: {len(extensions)}")


if __name__ == "__main__":
    main()

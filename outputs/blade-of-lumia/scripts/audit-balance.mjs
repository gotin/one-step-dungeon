#!/usr/bin/env node
// Phase 8-4（実行キュー9番）＝リバランスの測定基盤。
// 「プレイヤー強さ vs 敵強さ」を体感ではなく数値で出す。
//
// 実行：outputs/blade-of-lumia/ から
//   node scripts/audit-balance.mjs            … 全表を出す
//   node scripts/audit-balance.mjs --json     … 機械可読（テスト/回帰用）
//
// 単一の真実は既存データだけ＝このスクリプトは値を持たない：
//   ・敵の hp/atk/def/攻撃の cooldown  … shared/enemies.js（ENEMY_META）
//   ・剣/防具/盾/ブーメランのティア    … shared/items.js
//   ・剣のクールダウン・無敵時間ほか    … game/constants.js
//   ・報酬が「どのレイヤーに置いてあるか」… work/blade-of-lumia.json（実マップ）
// ∴ 数値を1つ触ると、この監査の出力が必ず動く（手書きの表は腐るので作らない）。
//
// 測るもの（4つ）：
//   ① 攻撃側：剣1振り/満タンビームのダメージ・撃破に要する振り数・撃破秒数（TTK）
//   ② 防御側：被弾1回のダメージ・死ぬまでの被弾回数・死ぬまでの秒数（TTD）
//   ③ 進行地点ごとのプレイヤー諸元（剣/防具/盾/最大HP）＝実マップの報酬配置から導出
//   ④ 欠陥の検出（下記 DEFECTS）＝「調整すべき箇所」を主観でなく条件で拾う
//
// ⚠️ 測るのは「地点 × 敵」の総当たりではなく **実際に起こる遭遇**（2026-08-23 に改訂）。
//    敵がどのレイヤーに置かれているかは実マップから引き、その敵に**最初に会う進行地点**の
//    プレイヤー諸元で測る。総当たり（14地点 × 34種 = 476組）は「聖剣で D1 の雑魚を殴る」
//    のような起こらない組み合わせを大量に数える＝欠陥件数が意味を持たない。
//
// ⚠️ 脅威度 `hp*atk/(def+1)`（scripts/lib/enemy-placement.mjs THREAT_OF）は
//    **攻撃頻度と無敵時間を数えていない**∴ここでは別に「実効 DPS」を出す。
//    無敵時間 INVINCIBLE_MS があるので、プレイヤーが受ける DPS には
//    「1体でも複数体でも 1.5 秒に1発まで」という天井がある（体数の効き方の上限）。

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { ENEMY_META } from '../shared/enemies.js';
import {
	SWORD_TIERS, ARMOR_TIERS, SHIELD_TIERS, BASE_ATK, BASE_DEF,
} from '../shared/items.js';
import {
	SWORD_COOLDOWN_MS, INVINCIBLE_MS, HP_PER_HEART,
	BEAM_STRONG_MULT, CHARGE_FULL_MS,
	SLAM_RANGE, SLAM_WINDUP_MS, SLAM_COOLDOWN_MS,
} from '../game/constants.js';
import { THREAT_OF } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

// ── 進行順（PLAN 9-1）＝報酬が手に入る順序の単一の真実 ────────────────
// 本編：D1→D2→D3→D4→D6→D5→D8→D7→（祭壇）→dark_tower
// 寄道は「入るのに必要な道具」で本編のどこに挟まるかが決まる（scripts/lib/progression.mjs）：
//   cave_1        … 爆弾+はしご（D5 の後）
//   forest_cave   … 爆弾（D6 の後）＝銅の剣 tier1
//   secret_grotto … 笛（D8 の後）＝銀の剣 tier2
//   void_shrine   … 翼の羽衣（祭壇の後）＝聖剣 tier3
const ORDER = [
	{ id: 'start',         label: '開始直後',            layer: null },
	{ id: 'dungeon_1',     label: 'D1 森の遺跡',         layer: 'dungeon_1' },
	{ id: 'dungeon_2',     label: 'D2 岩窟',             layer: 'dungeon_2' },
	{ id: 'dungeon_3',     label: 'D3 湖の神殿',         layer: 'dungeon_3' },
	{ id: 'dungeon_4',     label: 'D4 砂の遺跡',         layer: 'dungeon_4' },
	{ id: 'dungeon_6',     label: 'D6 火山',             layer: 'dungeon_6' },
	{ id: 'forest_cave',   label: '寄道 樹海の岩室',     layer: 'forest_cave', optional: true },
	{ id: 'dungeon_5',     label: 'D5 氷の遺跡',         layer: 'dungeon_5' },
	{ id: 'cave_1',        label: '寄道 洞窟',           layer: 'cave_1', optional: true },
	{ id: 'dungeon_8',     label: 'D8 沼地',             layer: 'dungeon_8' },
	{ id: 'secret_grotto', label: '寄道 空中の遺跡',     layer: 'secret_grotto', optional: true },
	{ id: 'dungeon_7',     label: 'D7 空の神殿',         layer: 'dungeon_7' },
	{ id: 'void_shrine',   label: '寄道 虚空の祠',       layer: 'void_shrine', optional: true },
	{ id: 'dark_tower',    label: 'DT 暗黒の塔',         layer: 'dark_tower' },
];

// ── 実マップから報酬を集める（レイヤー単位）────────────────────────
// 「どのレイヤーに置いてあるか」だけを見る＝部屋の位置や関門は見ない。
// 関門（killAll/パズル）は「取れるかどうか」を左右するが「順序」は変えない。
function collectRewards(map) {
	const perLayer = new Map();   // layer → { sword:[], armor:[], shield:[], hearts:n }
	const bump = (layer) => {
		if (!perLayer.has(layer)) perLayer.set(layer, { sword: [], armor: [], shield: [], hearts: 0 });
		return perLayer.get(layer);
	};
	for (const [layerName, layer] of Object.entries(map.layers)) {
		for (const [, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['chestContents', 'floorItems']) {
				for (const v of Object.values(st[src] ?? {})) {
					if (!v || typeof v !== 'object') continue;
					const bucket = bump(layerName);
					if (v.swordTier  != null) bucket.sword.push(v.swordTier);
					if (v.armorTier  != null) bucket.armor.push(v.armorTier);
					if (v.shieldTier != null) bucket.shield.push(v.shieldTier);
					if (v.type === 'heartContainer' || v.item === 'heartContainer') bucket.hearts += 1;
				}
			}
		}
	}
	return perLayer;
}

// 進行地点ごとのプレイヤー諸元＝実プレイが必ず入る帯（min ≦ 実プレイ ≦ max）。
//   min … その地点までの**必須レイヤー**の報酬だけ＋木の剣。
//         寄道（forest_cave / secret_grotto / void_shrine / cave_1 ＝ ORDER の optional）は
//         **入らなくてもクリアできる**∴下限には数えない。ここを数えると
//         「DT に来た人は必ず聖剣（ATK 14）を持っている」という嘘の下限になる
//         （実際は木の剣 ATK 4 で塔に入れる＝3.5 倍の差）。
//   max … 寄道もフィールドの宝も全部拾った（＝一番強い想定）。
// ∴調整の当たり判定は min で見る（min で溶ける／効かないなら誰でもそうなる）。
// max で速いのは「寄道の剣＝報酬」＝設計どおり∴参考値として併記するだけ。
function profilesAt(index, perLayer, fieldRewards) {
	const need = { sword: -1, armor: -1, shield: -1, hearts: 3 };   // 必須レイヤーだけ
	const all  = { sword: -1, armor: -1, shield: -1, hearts: 3 };   // 寄道も含む
	for (let i = 0; i < index; i++) {
		const layer = ORDER[i].layer;
		if (!layer) continue;
		const r = perLayer.get(layer);
		if (!r) continue;
		for (const acc of ORDER[i].optional ? [all] : [need, all]) {
			for (const t of r.sword)  acc.sword  = Math.max(acc.sword, t);
			for (const t of r.armor)  acc.armor  = Math.max(acc.armor, t);
			for (const t of r.shield) acc.shield = Math.max(acc.shield, t);
			acc.hearts += r.hearts;
		}
	}
	// 木の剣（swordTier 0）は必携＝min にも入れる（無いと剣が振れない）。
	const min = { ...need, sword: Math.max(need.sword, 0) };
	const max = {
		sword:  Math.max(all.sword,  fieldRewards.swordMax),
		armor:  Math.max(all.armor,  fieldRewards.armorMax),
		shield: Math.max(all.shield, fieldRewards.shieldMax),
		hearts: all.hearts + fieldRewards.hearts,
	};
	return { min: statsOf(min), max: statsOf(max) };
}

function statsOf(p) {
	const atk = BASE_ATK + (p.sword >= 0 ? SWORD_TIERS[p.sword].atk : 0);
	const def = BASE_DEF + (p.armor >= 0 ? ARMOR_TIERS[p.armor].def : 0);
	return {
		...p,
		atk, def,
		maxHp: p.hearts * HP_PER_HEART,
		beam:   p.sword >= 0 && SWORD_TIERS[p.sword].beam,
		pierce: p.sword >= 0 && SWORD_TIERS[p.sword].pierce,
		reflect: p.shield >= 0 ? SHIELD_TIERS[p.shield].reflect : null,
	};
}

// ── 遭遇地点（実マップ由来）──────────────────────────────────────
// 敵タイルが置かれているレイヤーを実マップから集め、ORDER 上で**一番早い地点**を
// 「初めて会う地点」とする。ここで測らないと調整の当たり判定がぼやける
// （聖剣で D1 の雑魚を殴る組み合わせを数えても何も分からない）。
//   field           … 地域ごとに到達時期が違う＝最速で会える＝ORDER の先頭（開始直後）扱い。
//   test_mechanics  … 検証ステージ∴進行に存在しない（除外）。
//   hidden_cave 等  … ORDER に無いレイヤーは「本編の進行に載っていない」∴除外して報告する。
const EXCLUDE_LAYERS = new Set(['test_mechanics']);

function encountersOf(map) {
	const layersByTile = new Map();   // tile → Set(layer)
	for (const [layerName, layer] of Object.entries(map.layers)) {
		if (EXCLUDE_LAYERS.has(layerName)) continue;
		for (const st of Object.values(layer.stages ?? {})) {
			for (const row of st.tiles ?? []) {
				const cells = Array.isArray(row) ? row : String(row).split('');
				for (const ch of cells) {
					if (!ENEMY_META[ch]) continue;
					if (!layersByTile.has(ch)) layersByTile.set(ch, new Set());
					layersByTile.get(ch).add(layerName);
				}
			}
		}
	}
	const indexOfLayer = (name) => (name === 'field' ? 0 : ORDER.findIndex((o) => o.layer === name));
	const out = new Map();            // tile → { layers, firstIndex|null }
	for (const [tile, set] of layersByTile) {
		const idxs = [...set].map(indexOfLayer).filter((i) => i >= 0);
		out.set(tile, { layers: [...set].sort(), firstIndex: idxs.length ? Math.min(...idxs) : null });
	}
	return out;
}

// ── ① 攻撃側 ───────────────────────────────────────────────────
// combat.js damageEnemy：actual = max(1, dmg - e.def)（弱点は別倍率・ここでは等倍で見る）
// 剣は SWORD_COOLDOWN_MS ごとに振れる＝敵側に被弾無敵は無い（実コードで確認）。
// 満タンビームは剣ATK×BEAM_STRONG_MULT・貫通（聖剣のみ pierce も付く）。
function offense(stats, meta) {
	const swordDmg = Math.max(1, stats.atk - (meta.def ?? 0));
	const swings   = Math.ceil(meta.hp / swordDmg);
	const beamDmg  = stats.beam ? Math.max(1, stats.atk * BEAM_STRONG_MULT - (meta.def ?? 0)) : null;
	return {
		swordDmg, swings,
		ttkMs: swings * SWORD_COOLDOWN_MS,
		beamDmg,
		beamShots: beamDmg ? Math.ceil(meta.hp / beamDmg) : null,
		// ビームは「溜め時間 + 発射」でしか撃てない∴1発ごとに CHARGE_FULL_MS を払う
		beamTtkMs: beamDmg ? Math.ceil(meta.hp / beamDmg) * CHARGE_FULL_MS : null,
	};
}

// ── ② 防御側 ───────────────────────────────────────────────────
// combat.js takeDamage：actual = max(1, amount - player.def)（二周目は def×2）
// 攻撃間隔は攻撃種別ごと：
//   charge（体当たり10種） … SLAM_WINDUP_MS + SLAM_COOLDOWN_MS（k-7.5 の予告→解決）
//   それ以外              … attack.cooldown（実データ）
// 実効間隔は無敵時間で床を張られる＝max(cadence, INVINCIBLE_MS)。
function cadenceMs(meta) {
	const a = meta.attack;
	if (!a) return null;
	if (a.type === 'charge') return SLAM_WINDUP_MS + SLAM_COOLDOWN_MS;
	return a.cooldown ?? null;
}

// 1回の攻撃で飛んでくる素ダメージの最大値。体当たりの atk だけを見ると
// 「本体が別の口を持つ敵」を過小評価する（爆弾鬼は爆風・火吐き亀は炎が本体）。
function rawHit(meta) {
	return Math.max(
		meta.atk ?? 0,
		meta.attack?.blast?.damage ?? 0,
		meta.shell?.breathAtk ?? 0,
	);
}

// 減算防御を通らない追加ダメージ（毒＝debuff.js が論理時間で刻む）。
// 毒は無敵窓を貫通し def でも減らない∴「1発の重さ」に足して数える。
function extraDamage(meta) {
	const inf = meta.inflict;
	if (inf?.type !== 'poison') return 0;
	const ticks = Math.floor(inf.ms / inf.tickMs);
	let dmg = inf.damage, total = 0;
	for (let i = 0; i < ticks; i++) { total += Math.max(1, dmg); dmg -= (inf.decay ?? 0); }
	return total;
}

function defense(stats, meta) {
	const raw    = rawHit(meta);
	const extra  = extraDamage(meta);
	const perHit = Math.max(1, raw - stats.def) + extra;
	const hits   = Math.ceil(stats.maxHp / perHit);
	const cad    = cadenceMs(meta);
	const eff    = cad == null ? null : Math.max(cad, INVINCIBLE_MS);
	return {
		raw, extra, perHit, hits,
		cadenceMs: cad,
		effectiveMs: eff,
		ttdMs: eff == null ? null : hits * eff,
		dpsOnPlayer: eff == null ? null : (perHit / (eff / 1000)),
		// max(1,...) の床に当たっている＝防具が敵の攻撃を食い切っていて
		// 「どの敵に触っても 1」＝緊張が消える（毒などの追加ダメージは別枠）
		floored: (raw - stats.def) <= 1 && extra === 0,
	};
}

// ── ④ 欠陥の検出 ─────────────────────────────────────────────
// 「主観で重い/軽いと言う」のを避けるための機械的な条件。閾値の根拠はコメントに書く。
//
// 判定はすべて **その敵に初めて会う地点の min プロファイル**（本編の報酬だけ・寄道の剣なし）で行う。
//   ・min で「溶ける/効かない」なら、どのプレイヤーでもそうなる＝確定の欠陥。
//   ・max（寄道も全回収）で重い場合は参考値に留める＝最強装備で重いのは調整の対象になり得るが
//     「min で軽い」ほど確実な話ではない。
// ∴表には min→max の両方を出し、欠陥件数は min で数える。

// 1振りで消えて良い敵＝「弱いことが設計」の種（意図をここに明示して例外にする）。
// これを書かないと ONE_SWING が「最弱の敵が最弱である」ことまで欠陥として数える。
const ONE_SWING_OK = {
	E: 'パトロール＝最初の敵（1振りで倒せることを教える役）',
	ξ: 'コウモリ群＝1体2.0の最弱を数で撒く設計',
	'&': 'スライム（水）＝水中の最弱',
	δ: '分裂スライム＝木の剣1振りで分裂に届くのが機構そのもの（shared/enemies.js に明記）',
	ψ: '呪い火＝剣封じが本体・弓/爆弾で消す前提の低HP（同上）',
};

const DEFECTS = {
	// 雑魚が剣1振りで消える＝戦闘が「歩きながら振る」作業になる（意図的な最弱は除く）
	ONE_SWING: ({ o, meta, tile }) => !meta.isBoss && o.swings <= 1 && !ONE_SWING_OK[tile],
	// 雑魚1体に4秒以上（＝連打で殴り続ける作業。雑魚は「数体まとめて」相手にする）
	ZAKO_SLOG: ({ o, meta }) => !meta.isBoss && o.ttkMs >= 4000,
	// ボスが6秒未満で溶ける＝機構（開閉・反射・投擲）が一巡する前に終わる
	BOSS_MELT: ({ o, meta }) => !!meta.isBoss && o.ttkMs < 6000,
	// ボスに40秒以上＝機構を理解しても殴る時間だけが伸びる（＝HP水増し）
	BOSS_SLOG: ({ o, meta }) => !!meta.isBoss && o.ttkMs > 40000,
	// 防具が敵の一番重い口を食い切って「1ダメージ固定」＝どの敵に触っても同じ＝緊張が消える。
	// 設計上 atk 1-2 の敵（妨害役）は対象外にする∴raw 3 以上の攻撃が 1 になった時だけ数える。
	DEF_WALL: ({ d }) => d.floored && d.raw >= 3,
	// 死ぬまで60秒以上＝張り付かれても負けない（＝その敵は脅威として存在していない）
	UNKILLABLE: ({ d }) => d.ttdMs != null && d.ttdMs >= 60000,
};

// 目標帯（この監査の「良い」の定義）。数値の根拠：
//   ・雑魚 2〜6振り … SWORD_COOLDOWN_MS で秒に換算した戦闘時間で決める（1振りは作業・
//     7振り以上は連打の作業）。最弱枠は 1〜2 振り（数で圧をかける役）。
//   ・ボス 30〜60振り … 機構（開閉・反射・投擲・突進）が数巡する長さ。
//   ・プレイヤーが死ぬまで 雑魚12発・ボス8発 … ハート換算で 雑魚6ハート・ボス4ハート分。
const TARGET = {
	zakoSwings: [2, 6],
	weakSwings: [1, 2],
	bossSwings: [30, 60],
	hits: { zako: 12, boss: 8 },
};

function flagsOf(ctx) {
	return Object.entries(DEFECTS).filter(([, fn]) => fn(ctx)).map(([k]) => k);
}

function main() {
	const json = process.argv.includes('--json');
	const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const perLayer = collectRewards(map);

	const fr = perLayer.get('field') ?? { sword: [], armor: [], shield: [], hearts: 0 };
	const fieldRewards = {
		swordMax:  Math.max(-1, ...fr.sword),
		armorMax:  Math.max(-1, ...fr.armor),
		shieldMax: Math.max(-1, ...fr.shield),
		hearts:    fr.hearts,
	};

	const report = {
		constants: {
			SWORD_COOLDOWN_MS, INVINCIBLE_MS, HP_PER_HEART, BEAM_STRONG_MULT, CHARGE_FULL_MS,
			SLAM_RANGE, SLAM_WINDUP_MS, SLAM_COOLDOWN_MS,
		},
		rewardPlacement: {},
		unplacedTiers: [],
		unplacedEnemies: [],
		checkpoints: [],
		defects: [],
	};

	for (const [layer, r] of [...perLayer.entries()].sort()) {
		report.rewardPlacement[layer] = r;
	}
	// 置き忘れの検出＝ティア定義はあるのに世界のどこにも無い（＝到達不能な強化）
	const placed = { sword: new Set(), armor: new Set(), shield: new Set() };
	for (const r of perLayer.values()) {
		r.sword.forEach((t) => placed.sword.add(t));
		r.armor.forEach((t) => placed.armor.add(t));
		r.shield.forEach((t) => placed.shield.add(t));
	}
	SWORD_TIERS.forEach((t, i)  => { if (!placed.sword.has(i))  report.unplacedTiers.push(`剣 tier${i} ${t.name}`); });
	ARMOR_TIERS.forEach((t, i)  => { if (!placed.armor.has(i))  report.unplacedTiers.push(`防具 tier${i} ${t.name}`); });
	SHIELD_TIERS.forEach((t, i) => { if (!placed.shield.has(i)) report.unplacedTiers.push(`盾 tier${i} ${t.name}`); });

	ORDER.forEach((cp, i) => {
		const { min, max } = profilesAt(i, perLayer, fieldRewards);
		report.checkpoints.push({ id: cp.id, label: cp.label, min, max });
	});

	// 実際に起こる遭遇だけを測る＝敵タイル1行。
	// 測る地点＝その敵に初めて会う進行地点（実マップの配置から導出）。
	const encounters = encountersOf(map);
	const rows = [];
	for (const [tile, meta] of Object.entries(ENEMY_META)) {
		const enc = encounters.get(tile);
		if (!enc || enc.firstIndex == null) {
			report.unplacedEnemies.push(`${tile} ${meta.name}`
				+ (enc ? `（${enc.layers.join(',')} にだけ居る＝本編の進行外）` : '（世界のどこにも居ない）'));
			continue;
		}
		const cp = ORDER[enc.firstIndex];
		const { min, max } = profilesAt(enc.firstIndex, perLayer, fieldRewards);
		const measure = (stats) => {
			const o = offense(stats, meta), d = defense(stats, meta);
			return { ...o, ...d, flags: flagsOf({ o, d, meta, tile }) };
		};
		const mn = measure(min), mx = measure(max);
		rows.push({
			tile, name: meta.name, isBoss: !!meta.isBoss,
			threat: +THREAT_OF(meta).toFixed(1),
			at: cp.id, atLabel: cp.label, layers: enc.layers,
			atk: { min: min.atk, max: max.atk },
			def: { min: min.def, max: max.def },
			maxHp: { min: min.maxHp, max: max.maxHp },
			min: mn, max: mx,
			flags: mn.flags,                                  // 欠陥件数は min で数える
			maxOnlyFlags: mx.flags.filter((f) => !mn.flags.includes(f)),
		});
	}
	rows.sort((a, b) => (a.isBoss - b.isBoss)
		|| (ORDER.findIndex((o) => o.id === a.at) - ORDER.findIndex((o) => o.id === b.at))
		|| (a.threat - b.threat));
	report.encounters = rows;
	report.defects = rows.filter((r) => r.flags.length);

	if (json) { console.log(JSON.stringify(report, null, 2)); return; }

	const ms = (v) => (v == null ? '—' : `${(v / 1000).toFixed(1)}s`);
	console.log('# Phase 8-4 バランス監査（実データ由来・手書きの値なし）\n');
	console.log('## 定数');
	console.log(Object.entries(report.constants).map(([k, v]) => `  ${k} = ${v}`).join('\n'));

	console.log('\n## 報酬の配置（レイヤー単位）');
	for (const [layer, r] of Object.entries(report.rewardPlacement)) {
		const bits = [];
		if (r.sword.length)  bits.push(`剣 tier${r.sword.join('/')}`);
		if (r.armor.length)  bits.push(`防具 tier${r.armor.join('/')}`);
		if (r.shield.length) bits.push(`盾 tier${r.shield.join('/')}`);
		if (r.hearts)        bits.push(`ハートの器 ×${r.hearts}`);
		if (bits.length) console.log(`  ${layer.padEnd(14)} ${bits.join(' / ')}`);
	}
	if (report.unplacedTiers.length) {
		console.log('\n  🔴 世界に置かれていないティア（＝到達不能な強化）:');
		report.unplacedTiers.forEach((t) => console.log(`     - ${t}`));
	}

	console.log('\n## 進行地点ごとのプレイヤー諸元（min＝本編のみ / max＝フィールドも全回収）');
	console.log('  地点                 | ATK(min→max) | DEF | 最大HP | 剣ティア');
	for (const cp of report.checkpoints) {
		console.log(`  ${cp.label.padEnd(20)} | ${String(cp.min.atk).padStart(4)}→${String(cp.max.atk).padEnd(4)}   |`
			+ ` ${String(cp.min.def)}→${String(cp.max.def)} | ${String(cp.min.maxHp).padStart(3)}→${String(cp.max.maxHp).padEnd(3)}  |`
			+ ` ${cp.min.sword}→${cp.max.sword}`);
	}

	if (report.unplacedEnemies.length) {
		console.log('\n  🔴 本編の進行に載っていない敵（＝会えない敵）:');
		report.unplacedEnemies.forEach((t) => console.log(`     - ${t}`));
	}

	// ── 遭遇表（1敵1行・測る地点はその敵に初めて会う地点）─────────────
	const line = (r) => {
		const o = r.min, x = r.max;
		return `  ${(r.tile + ' ' + r.name).padEnd(20)}`
			+ ` ${r.atLabel.padEnd(14)}`
			+ ` HP${String(ENEMY_META[r.tile].hp).padStart(3)} 脅威${String(r.threat).padStart(5)} |`
			+ ` 振${String(o.swings).padStart(3)}→${String(x.swings).padEnd(3)}`
			+ ` TTK ${ms(o.ttkMs).padStart(6)}→${ms(x.ttkMs).padEnd(6)} |`
			+ ` 被弾${String(o.perHit).padStart(3)}→${String(x.perHit).padEnd(2)}`
			+ ` TTD ${ms(o.ttdMs).padStart(6)}→${ms(x.ttdMs).padEnd(6)} |`
			+ ` ${r.flags.join(',')}${r.maxOnlyFlags.length ? ` (max のみ: ${r.maxOnlyFlags.join(',')})` : ''}`;
	};
	for (const [title, want] of [['雑魚', false], ['ボス', true]]) {
		console.log(`\n## 遭遇表：${title}（初遭遇地点の min→max プロファイル・欠陥は min で判定）`);
		rows.filter((r) => r.isBoss === want).forEach((r) => console.log(line(r)));
	}

	console.log('\n## 欠陥の集計（min プロファイル・実際に起こる遭遇のみ）');
	const byFlag = {};
	for (const r of report.defects) for (const f of r.flags) (byFlag[f] ??= []).push(r.tile);
	for (const [f, list] of Object.entries(byFlag)) {
		console.log(`  ${f.padEnd(11)} ${String(list.length).padStart(2)} 件  ${list.join(' ')}`);
	}
	console.log(`\n  欠陥のある遭遇 ${report.defects.length} / ${rows.length} 種`
		+ `（測れなかった敵 ${report.unplacedEnemies.length} 種は除く）`);

	// ── ⑤ 目標帯から逆算した推奨値 ───────────────────────────────
	// 「いくつにするか」を勘で決めないための逆算。min プロファイル（＝寄道を飛ばした
	// 一番弱いプレイヤー）で目標の振り数・被弾回数に収まる hp / atk を出す。
	// ⚠️ ここは**提案**＝実際の値は shared/enemies.js に手で書く（種ごとの機構の意図が
	//    数式より優先する。例：δ は1振りで分裂に届くことが機構そのもの）。
	console.log('\n## 推奨値（min プロファイルで目標帯に収まる hp / atk の逆算）');
	console.log(`  目標: 雑魚 ${TARGET.zakoSwings.join('〜')}振り（最弱枠 ${TARGET.weakSwings.join('〜')}）`
		+ ` / ボス ${TARGET.bossSwings.join('〜')}振り`
		+ ` / プレイヤーが死ぬまで 雑魚 ${TARGET.hits.zako}発・ボス ${TARGET.hits.boss}発`);
	console.log('  敵                   地点             hp 現→推奨       atk 現→推奨   1振りdmg');
	for (const r of rows) {
		const meta = ENEMY_META[r.tile];
		const band = meta.isBoss ? TARGET.bossSwings
			: (ONE_SWING_OK[r.tile] ? TARGET.weakSwings : TARGET.zakoSwings);
		const dmg = r.min.swordDmg;
		const hpBand = `${dmg * band[0]}〜${dmg * band[1]}`;
		const hits = meta.isBoss ? TARGET.hits.boss : TARGET.hits.zako;
		// 被弾1回の目標＝最大HP ÷ 目標被弾回数。減算防御を戻して atk にする。
		const atkWant = Math.max(1, Math.round(r.maxHp.min / hits) + r.def.min);
		console.log(`  ${(r.tile + ' ' + r.name).padEnd(20)} ${r.atLabel.padEnd(14)}`
			+ ` ${String(meta.hp).padStart(3)} → ${hpBand.padEnd(10)}`
			+ ` ${String(meta.atk).padStart(3)} → ${String(atkWant).padStart(2)}`
			+ `        ${dmg}`);
	}
}

main();


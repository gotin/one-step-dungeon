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
// 進行順（ORDER）と「その地点で何を持っているか」の導出は **`shared/progression.js` が単一の真実**。
// 元はこのファイルの内部定数・内部関数だったが、実行キュー 0f でエディタ（プレビュー設定の
// 「🚩進行地点」プリセット）からも同じ値が必要になった∴共有へ出した（コピーを作らない）。
// ⚠️ `profilesAt()` が返すのは**ティア番号とハート数だけ**＝ATK/DEF はこのファイルの
//    `statsOf()` が `shared/items.js` から導出する（プリセットは数値を計算しない）。
import {
	ORDER, collectRewards, fieldRewardsOf, bossRoomLayersOf, labelOf, profilesAt as rawProfilesAt,
} from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

// 第4引数 `preBossHere`＝その地点のレイヤーの「ボス部屋の外」の報酬（`null` で「ボス直前」なし）。
// 0d-2.9（2026-08-25）＝ボスの行は `min`（入場時）ではなく `boss`（ボス直前）で測る。
function profilesAt(index, perLayer, fieldRewards, preBossHere = null) {
	const { min, max, boss } = rawProfilesAt(index, perLayer, fieldRewards, preBossHere);
	return { min: statsOf(min), max: statsOf(max), boss: boss ? statsOf(boss) : null };
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
		// 溜め時間はティアごと（`chargeMs` を持たないティアは既定 720）。
		// ⚠️ 定数のまま測ると「溜めが速いことが売りの剣」を監査が見落とす
		//    ＝ルミアの剣（0o-2）の実効ビーム DPS は 1.5 倍なのに表は同じ数を出す。
		chargeMs: (p.sword >= 0 ? SWORD_TIERS[p.sword].chargeMs : null) ?? CHARGE_FULL_MS,
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
	const inBossRoom = new Set();     // ボス部屋（st.isBossRoom）に1つでも置かれているタイル
	for (const [layerName, layer] of Object.entries(map.layers)) {
		if (EXCLUDE_LAYERS.has(layerName)) continue;
		for (const st of Object.values(layer.stages ?? {})) {
			for (const row of st.tiles ?? []) {
				const cells = Array.isArray(row) ? row : String(row).split('');
				for (const ch of cells) {
					if (!ENEMY_META[ch]) continue;
					if (!layersByTile.has(ch)) layersByTile.set(ch, new Set());
					layersByTile.get(ch).add(layerName);
					if (st.isBossRoom) inBossRoom.add(ch);
				}
			}
		}
	}
	const indexOfLayer = (name) => (name === 'field' ? 0 : ORDER.findIndex((o) => o.layer === name));
	const out = new Map();            // tile → { layers, firstIndex|null, inBossRoom }
	for (const [tile, set] of layersByTile) {
		const idxs = [...set].map(indexOfLayer).filter((i) => i >= 0);
		out.set(tile, {
			layers: [...set].sort(),
			firstIndex: idxs.length ? Math.min(...idxs) : null,
			inBossRoom: inBossRoom.has(tile),
		});
	}
	return out;
}

// ── 敵の「格」＝帯と判定プロファイルを決める唯一の分類（0d-2.9・2026-08-25）────────
// `isBoss` だけでは足りない＝**ボス部屋に居ないボス**（道中の中ボス）をボス帯 30〜60振りで
// 測ると「溶けている」と誤検出する（実例＝W 魔物を 0d-2.8 で hp 48 に下げたら BOSS_MELT）。
// ⚠️ 中ボスの一覧は**手書きしない**＝実マップの `isBossRoom` から導出する
//    （敵タイル一覧を手書きして13タイル漏らした前例と同じ轍を踏まない）。
//    2026-09-05（0h）の実データ＝ボス部屋に居る12種（G N J A L O U I Z ＋ field の { 海の主
//    ＋ 寄道 warlord_lair の V 魔将）に対し、W 魔物（D1/D2/D7/cave_1 の道中）だけが
//    **ボス部屋に居ない**＝中ボス。
//    ⚠️ V は 2026-09-05 まで dark_tower 2,3・3,3 の道中に3体居る中ボスだった。0h で
//       「寄道の主」へ格上げ＝warlord_lair の主の間（isBossRoom）に1体だけになった∴格は boss。
//       DT の3体は雑魚（λ×2／μ×2＋π）へ差し替えた。
function kindOf(tile, meta, enc) {
	if (meta.isBoss) return enc?.inBossRoom ? 'boss' : 'midBoss';
	return ONE_SWING_OK[tile] ? 'weak' : 'zako';
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
		// ビームは「溜め時間 + 発射」でしか撃てない∴1発ごとに溜め時間を払う
		// （剣ティアごと＝`stats.chargeMs`。定数を直に使うと速い剣の得が消える）
		beamTtkMs: beamDmg ? Math.ceil(meta.hp / beamDmg) * stats.chargeMs : null,
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
// 判定は **その敵に初めて会う地点**で行う。使うプロファイルは格で変える（0d-2.9・2026-08-25）：
//   ・雑魚・中ボス … `min`（そのレイヤーへ**入った瞬間**の装備）＝道中はこの装備で当たる。
//   ・ボス        … `boss`（ボス直前）＝min ＋ そのレイヤーの**ボス部屋の外**の報酬。
//       min でボスを測るのは「D1 の革の鎧も木の盾もハートの器も捨ててボス部屋へ直行する」
//       という実プレイでは起こらない下限だった（2026-08-25・D1 の G が min では勝てないという
//       実プレイ報告の真因＝PLAN 0d-2.8）。**判定プロファイルが嘘だと13体ぶん測り直しになる。**
//       ボス部屋が ORDER のレイヤーの外にある場合（field の { 海の主）は `boss` が作れない∴
//       `min` に落ちる＝表の「判定」列に出す（黙って落とさない）。
//   ・max（寄道も全回収）で重い場合は参考値に留める＝最強装備で重いのは調整の対象になり得るが
//     「判定プロファイルで軽い」ほど確実な話ではない。
// ∴表には 判定→max の両方を出し、欠陥件数は判定プロファイルで数える。

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
	ONE_SWING: ({ o, kind }) => kind === 'zako' && o.swings <= 1,
	// 雑魚1体に4秒以上（＝連打で殴り続ける作業。雑魚は「数体まとめて」相手にする）
	ZAKO_SLOG: ({ o, kind }) => (kind === 'zako' || kind === 'weak') && o.ttkMs >= 4000,
	// ボスが6秒未満で溶ける＝機構（開閉・反射・投擲）が一巡する前に終わる
	BOSS_MELT: ({ o, kind }) => kind === 'boss' && o.ttkMs < 6000,
	// 中ボスが 2.4 秒（8振り）未満＝雑魚の上限（6振り）と区別がつかない＝道中の壁にならない。
	// ⚠️ ボスの床（6秒）は当てない＝中ボスは「ボス部屋の一戦」ではなく道中に複数回出る
	//    （W 魔物は D1 に2体・D2/D7/cave_1 にも居る）∴ボス並みの長さだとボス前に消耗しきる。
	MIDBOSS_MELT: ({ o, kind }) => kind === 'midBoss' && o.ttkMs < 2400,
	// ボス・中ボスに40秒以上＝機構を理解しても殴る時間だけが伸びる（＝HP水増し）
	BOSS_SLOG: ({ o, kind }) => (kind === 'boss' || kind === 'midBoss') && o.ttkMs > 40000,
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
//   ・中ボス 10〜60振り … **下限だけをボスより緩めた帯**（0d-2.9）。中ボスは道中に複数回出る
//     ∴ボスの下限（30振り＝9秒）を課すとボス部屋に着く前に消耗しきる。上限はボスと同じ
//     （＝60振りを超えたら殴る時間だけが伸びている）。実データ＝W 16振り＝帯内。
//     ⚠️ V 魔将は 0h（2026-09-05）で寄道の主へ格上げ＝格が boss になった。振り数は 48 で
//        変わらない（判定諸元＝DT min と同じ ATK 4）∴ボス帯 30〜60 の内側に入る
//        （2026-08-24 のユーザー実プレイ判定【現状維持】は失効しない）。
//   ・プレイヤーが死ぬまで 雑魚12発・ボス8発 … ハート換算で 雑魚6ハート・ボス4ハート分。
const TARGET = {
	zakoSwings: [2, 6],
	weakSwings: [1, 2],
	midBossSwings: [10, 60],
	bossSwings: [30, 60],
	hits: { zako: 12, boss: 8 },
};

// 格ごとの目標帯（推奨値の逆算に使う）。手書きの分岐をここ1箇所に閉じる。
const BAND_OF = {
	weak: TARGET.weakSwings,
	zako: TARGET.zakoSwings,
	midBoss: TARGET.midBossSwings,
	boss: TARGET.bossSwings,
};

function flagsOf(ctx) {
	return Object.entries(DEFECTS).filter(([, fn]) => fn(ctx)).map(([k]) => k);
}

function main() {
	const json = process.argv.includes('--json');
	const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const perLayer = collectRewards(map);

	const fieldRewards = fieldRewardsOf(perLayer);

	// 「ボス直前」＝min ＋ そのレイヤーのボス部屋の外の報酬。ボス部屋を持たないレイヤーと
	// `start` では作らない＝`shared/progression.js presetsFrom()` と同じ規則
	// （寄道でも `warlord_lair` は主の間を持つ∴作る＝0h・2026-09-05）。
	const preBoss    = collectRewards(map, { excludeBossRooms: true });
	const bossLayers = bossRoomLayersOf(map);
	const EMPTY_REWARDS = { sword: [], armor: [], shield: [], boomerang: [], items: [], hearts: 0, triforce: 0 };
	const preBossAt = (i) => {
		const layer = ORDER[i]?.layer;
		return layer && bossLayers.has(layer) ? (preBoss.get(layer) ?? EMPTY_REWARDS) : null;
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
		const { min, max, boss } = profilesAt(i, perLayer, fieldRewards, preBossAt(i));
		// 地点の表示名＝実マップのレイヤー名から導出（0g・2026-09-05）＝ORDER は名前を持たない。
		report.checkpoints.push({ id: cp.id, label: labelOf(map, cp), min, max, boss });
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
		const kind = kindOf(tile, meta, enc);
		const { min, max, boss } = profilesAt(enc.firstIndex, perLayer, fieldRewards, preBossAt(enc.firstIndex));
		// 判定プロファイル＝ボスだけ「ボス直前」（作れないレイヤーでは min に落ちる＝表に出す）。
		const judgeStats   = kind === 'boss' ? (boss ?? min) : min;
		const judgeVariant = kind === 'boss' ? (boss ? 'boss' : 'min') : 'min';
		const measure = (stats) => {
			const o = offense(stats, meta), d = defense(stats, meta);
			return { ...o, ...d, flags: flagsOf({ o, d, meta, tile, kind }) };
		};
		const jd = measure(judgeStats), mx = measure(max);
		rows.push({
			tile, name: meta.name, isBoss: !!meta.isBoss, kind,
			threat: +THREAT_OF(meta).toFixed(1),
			at: cp.id, atLabel: labelOf(map, cp), layers: enc.layers,
			inBossRoom: enc.inBossRoom,
			judgeVariant,
			atk: { judge: judgeStats.atk, max: max.atk },
			def: { judge: judgeStats.def, max: max.def },
			maxHp: { judge: judgeStats.maxHp, max: max.maxHp },
			judge: jd, max: mx,
			flags: jd.flags,                                  // 欠陥件数は判定プロファイルで数える
			maxOnlyFlags: mx.flags.filter((f) => !jd.flags.includes(f)),
		});
	}
	const KIND_ORDER = { weak: 0, zako: 0, midBoss: 1, boss: 2 };
	rows.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
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

	console.log('\n## 進行地点ごとのプレイヤー諸元（min＝入場時 / ボス直前＝min＋ボス部屋の外 / max＝フィールドも全回収）');
	console.log('  地点                 | ATK(min→max) | DEF | 最大HP | 剣ティア | ボス直前(DEF/最大HP)');
	for (const cp of report.checkpoints) {
		const pre = cp.boss ? `${cp.boss.def}/${cp.boss.maxHp}` : '—';
		console.log(`  ${cp.label.padEnd(20)} | ${String(cp.min.atk).padStart(4)}→${String(cp.max.atk).padEnd(4)}   |`
			+ ` ${String(cp.min.def)}→${String(cp.max.def)} | ${String(cp.min.maxHp).padStart(3)}→${String(cp.max.maxHp).padEnd(3)}  |`
			+ ` ${cp.min.sword}→${cp.max.sword}      | ${pre}`);
	}

	if (report.unplacedEnemies.length) {
		console.log('\n  🔴 本編の進行に載っていない敵（＝会えない敵）:');
		report.unplacedEnemies.forEach((t) => console.log(`     - ${t}`));
	}

	// ── 遭遇表（1敵1行・測る地点はその敵に初めて会う地点）─────────────
	// 「判定」列＝どのプロファイルで測ったか（min／ボス直前）。ボス部屋が ORDER の外にある
	// ボス（field の { 海の主）はボス直前が作れず min に落ちる∴列に出して黙って落とさない。
	const VARIANT_LABEL = { min: 'min', boss: 'ボス直前' };
	const line = (r) => {
		const o = r.judge, x = r.max;
		return `  ${(r.tile + ' ' + r.name).padEnd(20)}`
			+ ` ${r.atLabel.padEnd(14)}`
			+ ` ${VARIANT_LABEL[r.judgeVariant].padEnd(8)}`
			+ ` HP${String(ENEMY_META[r.tile].hp).padStart(3)} 脅威${String(r.threat).padStart(5)} |`
			+ ` 振${String(o.swings).padStart(3)}→${String(x.swings).padEnd(3)}`
			+ ` TTK ${ms(o.ttkMs).padStart(6)}→${ms(x.ttkMs).padEnd(6)} |`
			+ ` 被弾${String(o.perHit).padStart(3)}→${String(x.perHit).padEnd(2)}`
			+ ` TTD ${ms(o.ttdMs).padStart(6)}→${ms(x.ttdMs).padEnd(6)} |`
			+ ` ${r.flags.join(',')}${r.maxOnlyFlags.length ? ` (max のみ: ${r.maxOnlyFlags.join(',')})` : ''}`;
	};
	// 中ボス＝`isBoss` だがボス部屋に居ない敵（実マップから導出）＝ボス帯で測らない∴表も分ける。
	for (const [title, kinds] of [['雑魚', ['zako', 'weak']], ['中ボス', ['midBoss']], ['ボス', ['boss']]]) {
		console.log(`\n## 遭遇表：${title}（初遭遇地点の 判定→max プロファイル・欠陥は判定側で数える）`);
		rows.filter((r) => kinds.includes(r.kind)).forEach((r) => console.log(line(r)));
	}

	console.log('\n## 欠陥の集計（判定プロファイル・実際に起こる遭遇のみ）');
	const byFlag = {};
	for (const r of report.defects) for (const f of r.flags) (byFlag[f] ??= []).push(r.tile);
	for (const [f, list] of Object.entries(byFlag)) {
		console.log(`  ${f.padEnd(11)} ${String(list.length).padStart(2)} 件  ${list.join(' ')}`);
	}
	console.log(`\n  欠陥のある遭遇 ${report.defects.length} / ${rows.length} 種`
		+ `（測れなかった敵 ${report.unplacedEnemies.length} 種は除く）`);

	// ── ⑤ 目標帯から逆算した推奨値 ───────────────────────────────
	// 「いくつにするか」を勘で決めないための逆算。判定プロファイル（雑魚・中ボスは min＝
	// 寄道を飛ばした一番弱いプレイヤー／ボスは「ボス直前」）で目標の振り数・被弾回数に
	// 収まる hp / atk を出す。
	// ⚠️ ここは**提案**＝実際の値は shared/enemies.js に手で書く（種ごとの機構の意図が
	//    数式より優先する。例：δ は1振りで分裂に届くことが機構そのもの）。
	console.log('\n## 推奨値（判定プロファイルで目標帯に収まる hp / atk の逆算）');
	console.log(`  目標: 雑魚 ${TARGET.zakoSwings.join('〜')}振り（最弱枠 ${TARGET.weakSwings.join('〜')}）`
		+ ` / 中ボス ${TARGET.midBossSwings.join('〜')}振り / ボス ${TARGET.bossSwings.join('〜')}振り`
		+ ` / プレイヤーが死ぬまで 雑魚 ${TARGET.hits.zako}発・ボス ${TARGET.hits.boss}発`);
	console.log('  敵                   地点           判定     hp 現→推奨       atk 現→推奨   1振りdmg');
	for (const r of rows) {
		const meta = ENEMY_META[r.tile];
		const band = BAND_OF[r.kind];
		const dmg = r.judge.swordDmg;
		const hpBand = `${dmg * band[0]}〜${dmg * band[1]}`;
		const hits = (r.kind === 'boss' || r.kind === 'midBoss') ? TARGET.hits.boss : TARGET.hits.zako;
		// 被弾1回の目標＝最大HP ÷ 目標被弾回数。減算防御を戻して atk にする。
		const atkWant = Math.max(1, Math.round(r.maxHp.judge / hits) + r.def.judge);
		console.log(`  ${(r.tile + ' ' + r.name).padEnd(20)} ${r.atLabel.padEnd(14)}`
			+ ` ${VARIANT_LABEL[r.judgeVariant].padEnd(8)}`
			+ ` ${String(meta.hp).padStart(3)} → ${hpBand.padEnd(10)}`
			+ ` ${String(meta.atk).padStart(3)} → ${String(atkWant).padStart(2)}`
			+ `        ${dmg}`);
	}
}

main();


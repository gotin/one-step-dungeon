// D1〜D8 の「重いのにルピーだけ」の宝箱を差し替える
// （2026-11-09 / PLAN 実行キュー100・割り当てはユーザー確定「OK このまま」＝DECISIONS 2026-11-09）
//
// ■ 何をするか（盤面・封印は触らない＝中身だけ）
//   巻物＝各ダンジョンで光の紋章の次に重い謎の部屋 → 剣技の巻物（1ダンジョン1個・全8個）
//         4つで回転斬り・8つで回転斬りが2マス先まで（shared/items.js spinLevelOf）
//   増額＝キュー45 の段（L16〜34 → ×50）をキュー92〜95 で作り込んだ部屋にも当てる。栗番の辻は ×100
//   回復薬（大）の宝箱＝1本しか持てない∴持っていると開かない → ルピーへ（重い1室は ×100・他は ×50）
//
// 使い方（outputs/blade-of-lumia/ で）：
//   node scripts/migrate-q100-dungeon-rewards.mjs --dry   # 書き込まずに差分と検証
//   node scripts/migrate-q100-dungeon-rewards.mjs         # 書き込み（冪等）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ITEM_META, SCROLLS_FOR_WIDE_SPIN, EMBLEMS_FOR_AURA } from '../shared/items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const rupee = (value) => ({ type: 'rupee', value, name: `ルピー×${value}` });
const item = (id) => ({ type: 'item', item: id, name: ITEM_META[id]?.name });
const SCROLL = item('scroll');
const POTION = item('bigHealPotion');

// [層, 部屋, 宝箱のセル, 書き換え前, 書き換え後, 部屋の名]
export const Q100_PLAN = [
	// 剣技の巻物
	['dungeon_1', '3,2', '5,7',  rupee(20),  SCROLL, 'D1 L17'],
	['dungeon_2', '3,0', '4,5',  rupee(30),  SCROLL, 'D2 L8'],
	['dungeon_3', '4,1', '5,6',  rupee(50),  SCROLL, 'D3 渦の砂州'],
	['dungeon_4', '4,0', '2,9',  rupee(20),  SCROLL, 'D4 炉番の盾騎士 L15'],
	['dungeon_5', '4,3', '1,1',  rupee(100), SCROLL, 'D5 凍れる湖の鐘の道 L58'],
	['dungeon_6', '3,2', '1,10', rupee(50),  SCROLL, 'D6 焼き栗の淵'],
	['dungeon_7', '1,4', '1,1',  rupee(100), SCROLL, 'D7 空の石運び L35'],
	['dungeon_8', '2,0', '7,9',  rupee(20),  SCROLL, 'D8 爆弾鬼と毒の廊下'],
	// 増額
	['dungeon_4', '0,2', '8,6',  rupee(20), rupee(50),  'D4 熾火の苗床'],
	['dungeon_4', '0,3', '4,4',  rupee(20), rupee(50),  'D4 怨念の封じ祠'],
	['dungeon_4', '4,2', '8,1',  rupee(20), rupee(50),  'D4 爆弾鬼の封じ窯'],
	['dungeon_4', '4,3', '8,10', rupee(20), rupee(50),  'D4 火口湖の甲羅島'],
	['dungeon_4', '2,0', '1,5',  rupee(20), rupee(50),  'D4 冷え石の渡り'],
	['dungeon_8', '0,1', '2,1',  rupee(20), rupee(50),  'D8 眠りヒルの泥道'],
	['dungeon_8', '4,3', '5,10', rupee(30), rupee(50),  'D8 ルピー喰いの底なし沼'],
	['dungeon_3', '4,3', '6,10', rupee(20), rupee(50),  'D3 潮だまりの砂州'],
	['dungeon_6', '0,2', '8,1',  rupee(20), rupee(50),  'D6 猪の木立ち'],
	['dungeon_6', '0,3', '3,2',  rupee(30), rupee(50),  'D6 ルピー喰いの檻'],
	['dungeon_6', '2,2', '3,7',  rupee(30), rupee(50),  'D6 呪い火の野焼き'],
	['dungeon_6', '2,1', '7,10', rupee(50), rupee(100), 'D6 栗番の辻'],
	// 回復薬（大）→ ルピー
	['dungeon_6', '3,4', '8,10', POTION, rupee(100), 'D6 鬼火薬の栗転がし L44'],
	['dungeon_6', '4,1', '8,10', POTION, rupee(50),  'D6 野火の掃討'],
	['dungeon_6', '4,2', '8,10', POTION, rupee(50),  'D6 呪い火の導火'],
	['dungeon_6', '4,4', '3,10', POTION, rupee(50),  'D6 遠火の発破'],
	['dungeon_3', '2,0', '1,10', POTION, rupee(50),  'D3 射水魚の入り江'],
];

// 中身が同じか＝ルピーは額、道具は id で比べる（名前の表記揺れで止まらない）
const same = (a, b) => a?.type === b?.type
	&& (a.type === 'rupee' ? a.value === b.value : a.item === b.item);

function main() {
	const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
	if (!ITEM_META.scroll?.name) die('ITEM_META.scroll が無い');

	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stageOf = (layer, room) => data.layers?.[layer]?.stages?.[room];
	const sealsBefore = new Map(Q100_PLAN.map(([l, room, cell]) =>
		[`${l}|${room}|${cell}`, JSON.stringify(stageOf(l, room)?.showConditions?.[cell] ?? null)]));
	const tilesBefore = new Map(Q100_PLAN.map(([l, room]) => [`${l}|${room}`, JSON.stringify(stageOf(l, room)?.tiles)]));

	const log = [];
	for (const [layer, room, cell, before, after, label] of Q100_PLAN) {
		const st = stageOf(layer, room);
		if (!st) die(`${layer} ${room} が無い`);
		const [r, c] = cell.split(',').map(Number);
		if (st.tiles?.[r]?.[c] !== TILE.CHEST) die(`${layer} ${room} (${cell}) が宝箱でない（'${st.tiles?.[r]?.[c]}'）`);
		const cur = st.chestContents?.[cell];
		if (same(cur, after)) {
			log.push(`  ${layer} ${room} (${cell}) ${label}：変更なし＝既に ${after.name}`);
		} else if (same(cur, before)) {
			st.chestContents[cell] = after;
			log.push(`  ${layer} ${room} (${cell}) ${label}：${cur.name ?? JSON.stringify(cur)} → ${after.name}`);
		} else {
			die(`${layer} ${room} (${cell}) の中身が想定外 ${JSON.stringify(cur)}＝書き換え前の状態が違う（手で確かめる）`);
		}
	}

	// ── 検証 ──
	const verify = [];
	const check = (cond, msg) => verify.push([cond, msg]);
	const where = (id) => {
		const out = [];
		for (const [lk, ld] of Object.entries(data.layers ?? {})) {
			for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
				for (const src of ['chestContents', 'floorItems']) {
					for (const [cell, ct] of Object.entries(sd[src] ?? {})) if (ct?.item === id) out.push(`${lk}/${sk}(${cell})`);
				}
			}
		}
		return out;
	};
	const scrolls = where('scroll');
	check(scrolls.length === SCROLLS_FOR_WIDE_SPIN, `剣技の巻物は全マップで ${SCROLLS_FOR_WIDE_SPIN} 個（実測 ${scrolls.length}）`);
	const perDungeon = new Set(scrolls.map((w) => w.split('/')[0]));
	check(perDungeon.size === SCROLLS_FOR_WIDE_SPIN && [...perDungeon].every((l) => /^dungeon_[1-8]$/.test(l)),
		`剣技の巻物は D1〜D8 に1個ずつ（${[...perDungeon].sort().join(' ')}）`);
	const emblemRooms = new Set(where('emblem').map((w) => w.split('(')[0]));
	check(emblemRooms.size === EMBLEMS_FOR_AURA, `光の紋章は ${EMBLEMS_FOR_AURA} 個のまま（実測 ${emblemRooms.size}）`);
	check(scrolls.every((w) => !emblemRooms.has(w.split('(')[0])), '巻物は紋章と同じ部屋に置かない');
	for (const [layer, room, cell] of Q100_PLAN) {
		const st = stageOf(layer, room);
		const now = JSON.stringify(st.showConditions?.[cell] ?? null);
		check(now === sealsBefore.get(`${layer}|${room}|${cell}`), `${layer} ${room} (${cell}) の封印は書き換え前と同じ（${now}）`);
		check(JSON.stringify(st.tiles) === tilesBefore.get(`${layer}|${room}`) && st.tiles.every((row) => Array.isArray(row)),
			`${layer} ${room} の盤面は書き換え前と同じ（文字配列のまま）`);
	}

	console.log(`# キュー100：D1〜D8 の報酬の差し替え（${Q100_PLAN.length} 箱）`);
	console.log(log.join('\n'));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) {
		if (!cond || !msg.includes('の封印は') && !msg.includes('の盤面は')) console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
		if (!cond) ng++;
	}
	console.log(`  ✅ 封印と盤面 ${Q100_PLAN.length} 箱ぶん（失敗したものだけ上に出る）`);
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);

	if (DRY) {
		console.log('\n--dry: 書き込みなし');
	} else {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('\n書き込み完了:', MAP_PATH);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

// D1〜D8 の宝箱の中身を、謎の深さ（ソルバーの最短手数 L）に見合う物へ差し替える
// （2026-10-11 / PLAN 実行キュー45・割り当てはユーザー確定＝DECISIONS 2026-10-11）
//
// ■ 何をするか（盤面・封印は触らない＝中身だけ）
//   S＝各ダンジョンでいちばん深い謎の部屋 → 光の紋章（1ダンジョン1個・全8個＝そろうと剣にオーラ）
//   A＝S 以外で L35 以上の部屋 → ルピー×100
//   B＝L16〜34 の部屋 → ルピー×50
//   C＝それ以外（L12 以下・敵全滅の封印・通り道）→ 据え置き（このスクリプトは触らない）
//   L は `scripts/measure-puzzle.mjs --layer` と PLAN の記録（キュー39/40/41 の「最短 N 手」）。
//
// 使い方（outputs/blade-of-lumia/ で）：
//   node scripts/migrate-q45-dungeon-rewards.mjs --dry   # 書き込まずに差分と検証
//   node scripts/migrate-q45-dungeon-rewards.mjs         # 書き込み（冪等）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ITEM_META, EMBLEMS_FOR_AURA } from '../shared/items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const rupee = (value) => ({ type: 'rupee', value, name: `ルピー×${value}` });
const item = (id) => ({ type: 'item', item: id, name: ITEM_META[id]?.name });
const EMBLEM = item('emblem');

// [層, 部屋, 宝箱のセル, 書き換え前, 書き換え後, 部屋の名と L]
export const Q45_PLAN = [
	// S＝光の紋章
	['dungeon_1', '2,1', '1,10', rupee(30), EMBLEM, '石とボタンの袋小路 L18'],
	['dungeon_2', '0,3', '4,1',  rupee(30), EMBLEM, '砂の獄 L12'],
	['dungeon_3', '3,0', '1,9',  rupee(30), EMBLEM, '潮の道 L34'],
	['dungeon_4', '3,3', '8,1',  rupee(20), EMBLEM, '溶岩越しの灯火 L16'],
	['dungeon_5', '4,2', '1,1',  rupee(30), EMBLEM, '凍れる床の水門 L65'],
	['dungeon_6', '3,0', '1,1',  rupee(20), EMBLEM, '泉の的 L30'],
	['dungeon_7', '4,4', '1,10', rupee(50), EMBLEM, '空の二つの渡り L45'],
	['dungeon_8', '3,0', '2,2',  rupee(20), EMBLEM, '二色の鐘 L22'],
	// A＝ルピー×100
	['dungeon_5', '2,0', '1,1',  rupee(30), rupee(100), '凍れる湖の射ち継ぎ L43'],
	['dungeon_5', '0,3', '1,10', rupee(30), rupee(100), '凍れる水門の石渡し L42'],
	['dungeon_5', '4,0', '1,10', rupee(30), rupee(100), '凍れる湖の重しと鐘 L41'],
	['dungeon_5', '4,1', '1,1',  rupee(30), rupee(100), '凍れる床の石止め L44'],
	['dungeon_5', '4,3', '1,1',  rupee(30), rupee(100), '凍れる湖の鐘の道 L50'],
	['dungeon_7', '1,4', '1,1',  item('bigHealPotion'), rupee(100), '空の石運び L35'],
	// B＝ルピー×50
	['dungeon_5', '0,2', '8,6',  rupee(20), rupee(50), '凍れる湖の水門の足場 L29'],
	['dungeon_7', '0,1', '2,5',  rupee(30), rupee(50), '空の灯籠継ぎ L19'],
	['dungeon_7', '0,2', '8,9',  rupee(30), rupee(50), '空の崩れ柱渡り L22'],
	['dungeon_7', '0,3', '1,1',  rupee(30), rupee(50), '空の二色回廊 L22'],
	['dungeon_7', '2,2', '8,1',  rupee(20), rupee(50), '空の射的場 L18'],
	['dungeon_8', '3,3', '5,8',  rupee(20), rupee(50), '崩れ壁の橋脚 L16'],
];

// 中身が同じか＝ルピーは額、道具は id で比べる（名前の表記揺れで止まらない）
const same = (a, b) => a?.type === b?.type
	&& (a.type === 'rupee' ? a.value === b.value : a.item === b.item);

function main() {
	const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
	if (!ITEM_META.emblem?.name) die('ITEM_META.emblem が無い');

	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stageOf = (layer, room) => data.layers?.[layer]?.stages?.[room];
	const sealsBefore = new Map(Q45_PLAN.map(([l, room, cell]) =>
		[`${l}|${room}`, JSON.stringify(stageOf(l, room)?.showConditions?.[cell] ?? null)]));

	const log = [];
	for (const [layer, room, cell, before, after, label] of Q45_PLAN) {
		const st = stageOf(layer, room);
		if (!st) die(`${layer} ${room} が無い`);
		const [r, c] = cell.split(',').map(Number);
		if (st.tiles?.[r]?.[c] !== TILE.CHEST) die(`${layer} ${room} (${cell}) が宝箱でない（'${st.tiles?.[r]?.[c]}'）`);
		const cur = st.chestContents?.[cell];
		if (same(cur, after)) {
			log.push(`  ${layer} ${room} (${cell}) ${label}：変更なし＝既に ${after.name}`);
		} else if (same(cur, before)) {
			st.chestContents[cell] = after;
			log.push(`  ${layer} ${room} (${cell}) ${label}：${cur.name} → ${after.name}`);
		} else {
			die(`${layer} ${room} (${cell}) の中身が想定外 ${JSON.stringify(cur)}＝書き換え前の状態が違う（手で確かめる）`);
		}
	}

	// ── 検証 ──
	const verify = [];
	const check = (cond, msg) => verify.push([cond, msg]);
	const emblems = [];
	for (const [lk, ld] of Object.entries(data.layers ?? {})) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [cell, ct] of Object.entries(sd.chestContents ?? {})) {
				if (ct?.item === 'emblem') emblems.push(`${lk}/${sk}(${cell})`);
			}
		}
	}
	check(emblems.length === EMBLEMS_FOR_AURA, `光の紋章は全マップで ${EMBLEMS_FOR_AURA} 個＝そろうとオーラ（実測 ${emblems.length}）`);
	const perDungeon = new Set(emblems.map((w) => w.split('/')[0]));
	check(perDungeon.size === EMBLEMS_FOR_AURA && [...perDungeon].every((l) => /^dungeon_[1-8]$/.test(l)),
		`光の紋章は D1〜D8 に1個ずつ（${[...perDungeon].sort().join(' ')}）`);
	for (const [layer, room, cell] of Q45_PLAN) {
		const st = stageOf(layer, room);
		const now = JSON.stringify(st.showConditions?.[cell] ?? null);
		check(now === sealsBefore.get(`${layer}|${room}`), `${layer} ${room} (${cell}) の封印は書き換え前と同じ（${now}）`);
		check(st.tiles.every((row) => Array.isArray(row)), `${layer} ${room} の tiles は文字配列のまま`);
	}

	console.log(`# キュー45：D1〜D8 の報酬の差し替え（${Q45_PLAN.length} 箱）`);
	console.log(log.join('\n'));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) {
		console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
		if (!cond) ng++;
	}
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);

	if (DRY) {
		console.log('\n--dry: 書き込みなし');
	} else {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('\n書き込み完了:', MAP_PATH);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

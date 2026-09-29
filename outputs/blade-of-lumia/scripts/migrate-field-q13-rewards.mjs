// field の「意味ありげなのに報酬がしょぼい」宝箱の中身を差し替える
// （2026-09-29 / PLAN 実行キュー13・割り当てはユーザー確定＝DECISIONS 2026-09-29（2））
//
// ■ 何をするか（盤面・封印は触らない＝中身だけ）
//   ハートのかけら×4（4個＝器1個ちょうど）… `15,0` 果ての火口跡／`4,0` 崖端の見台／`3,19` 世界の縁／`13,8` 氷下の鐘
//   爆弾袋×2（dark_tower `1,5` と合わせて最大の3個）… `11,17` 都の裏門／`15,5` 風の裂け目
//   矢筒×1（dark_tower `3,2`・`3,5` と合わせて最大の3個）… `15,7` 潮境の氷丘
//   ルピー増額 … `12,17` 沈んだ都の門・`8,19` 潮の祭壇（封印が二重の終盤の寄り道）＝150、
//                `12,1` 溶岩の射的場・`11,6` 凍った堀（弓の予告編）＝50
//   ※ 増額の値はユーザー確定の「叩き台どおり」に数が書かれていなかったため、ここで決めた仮の値
//     （PLAN キュー13 に判定待ちとして記録）。
//
// 使い方（outputs/blade-of-lumia/ で）：
//   node scripts/migrate-field-q13-rewards.mjs --dry   # 書き込まずに差分と検証
//   node scripts/migrate-field-q13-rewards.mjs         # 書き込み（冪等）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ITEM_META } from '../shared/items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');
const LAYER = 'field';

const rupee = (value) => ({ type: 'rupee', value, name: `ルピー×${value}` });
const item = (id) => ({ type: 'item', item: id, name: ITEM_META[id]?.name });
const HEART_PIECE = { type: 'item', item: 'heartPiece', name: 'ハートのかけら' };

// [画面, 宝箱のセル, 書き換え前, 書き換え後]
const PLAN = [
	['15,0',  '3,5', item('healPotion'),    HEART_PIECE],
	['4,0',   '1,5', rupee(50),             HEART_PIECE],
	['3,19',  '4,5', rupee(80),             HEART_PIECE],
	['13,8',  '6,5', item('bigHealPotion'), HEART_PIECE],
	['11,17', '7,8', rupee(80),             item('bombBag')],
	['15,5',  '3,4', rupee(75),             item('bombBag')],
	['15,7',  '7,5', rupee(45),             item('quiver')],
	['12,17', '6,5', rupee(80),             rupee(150)],
	['8,19',  '5,5', rupee(70),             rupee(150)],
	['12,1',  '3,7', rupee(25),             rupee(50)],
	['11,6',  '3,7', rupee(25),             rupee(50)],
];

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const id of ['healPotion', 'bigHealPotion', 'bombBag', 'quiver']) {
	if (!ITEM_META[id]?.name) die(`ITEM_META.${id} が無い`);
}

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);

// 封印（showConditions）は書き換え前後で同じであること＝検証用に控える
const sealsBefore = Object.fromEntries(PLAN.map(([room, cell]) => [room, JSON.stringify(stages[room]?.showConditions?.[cell] ?? null)]));

const log = [];
for (const [room, cell, before, after] of PLAN) {
	const st = stages[room];
	if (!st) die(`${LAYER} ${room} が無い`);
	const [r, c] = cell.split(',').map(Number);
	if (st.tiles?.[r]?.[c] !== TILE.CHEST) die(`${room} (${cell}) が宝箱でない（'${st.tiles?.[r]?.[c]}'）`);
	const cur = st.chestContents?.[cell];
	if (same(cur, after)) {
		log.push(`  ${room} (${cell})：変更なし＝既に ${after.name}`);
	} else if (same(cur, before)) {
		st.chestContents[cell] = after;
		log.push(`  ${room} (${cell})：${before.name} → ${after.name}`);
	} else {
		die(`${room} (${cell}) の中身が想定外 ${JSON.stringify(cur)}＝書き換え前の状態が違う（手で確かめる）`);
	}
}

// ── 検証 ──
const verify = [];
const check = (cond, msg) => verify.push([cond, msg]);
const where = { heartPiece: [], bombBag: [], quiver: [] };
for (const [lk, ld] of Object.entries(data.layers ?? {})) {
	for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
		for (const [cell, ct] of Object.entries(sd.chestContents ?? {})) {
			if (where[ct?.item]) where[ct.item].push(`${lk}/${sk}(${cell})`);
		}
	}
}
check(where.heartPiece.length === 4, `ハートのかけらは全マップで4個＝器1個ちょうど（実測 ${where.heartPiece.length}）`);
check(where.bombBag.length === 3, `爆弾袋は全マップで3個＝items.js の「最大3個配置」（実測 ${where.bombBag.length}：${where.bombBag.join(' ')}）`);
check(where.quiver.length === 3, `矢筒は全マップで3個＝items.js の「最大3個配置」（実測 ${where.quiver.length}：${where.quiver.join(' ')}）`);
for (const [room, cell] of PLAN) {
	const now = JSON.stringify(stages[room].showConditions?.[cell] ?? null);
	check(now === sealsBefore[room], `${room} (${cell}) の封印は書き換え前と同じ（${now}）`);
	check(stages[room].tiles.every((row) => Array.isArray(row)), `${room} の tiles は文字配列のまま`);
}

console.log(`# ${LAYER}：キュー13 の報酬の差し替え（${PLAN.length} 箱）`);
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

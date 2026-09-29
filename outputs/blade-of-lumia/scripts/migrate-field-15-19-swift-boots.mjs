// field `15,19`（沈んだ宝物庫）の宝箱 (6,7) の中身を「ルピー×100」から「疾風の靴」に差し替える
// （2026-09-29 / PLAN 実行キュー13・配分はユーザー確定＝8番の枠 `15,19` に新しい道具）
//
// ■ なぜここか
//   爆弾で壁 !(5,7) を壊し、さらに笛を吹かないと宝箱が現れない二重封印（`tests/field-delta-o-lower.spec.js` ⑨）。
//   爆弾と笛の両方を持つ終盤＝寄り道の最後の報酬に置く。靴は進行の鍵ではない（`shared/items.js` の注記）∴
//   取らなくても詰まない。盤面・封印は触らない＝中身だけ差し替える。
//
// 使い方（outputs/blade-of-lumia/ で）：
//   node scripts/migrate-field-15-19-swift-boots.mjs --dry   # 書き込まずに差分と検証
//   node scripts/migrate-field-15-19-swift-boots.mjs         # 書き込み（冪等）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ITEM_META } from '../shared/items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');
const LAYER = 'field', ROOM = '15,19', CHEST = '6,7';
const BEFORE = { type: 'rupee', value: 100, name: 'ルピー×100' };
const AFTER  = { type: 'item', item: 'swiftBoots', name: ITEM_META.swiftBoots?.name };

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers?.[LAYER]?.stages?.[ROOM];
if (!stage) die(`${LAYER} ${ROOM} が無い`);
if (!AFTER.name) die('ITEM_META.swiftBoots が無い（先に shared/items.js を足す）');

const [r, c] = CHEST.split(',').map(Number);
if (stage.tiles?.[r]?.[c] !== TILE.CHEST) die(`${ROOM} (${CHEST}) が宝箱でない（'${stage.tiles?.[r]?.[c]}'）`);

const cur = stage.chestContents?.[CHEST];
const log = [];
if (same(cur, AFTER)) {
	log.push('  （変更なし＝既に疾風の靴）');
} else if (same(cur, BEFORE)) {
	stage.chestContents[CHEST] = AFTER;
	log.push(`  chestContents["${CHEST}"]: ${JSON.stringify(BEFORE)} → ${JSON.stringify(AFTER)}`);
} else {
	die(`想定外の中身 ${JSON.stringify(cur)}＝書き換え前の状態が違う（手で確かめる）`);
}

// ── 検証：靴は field 全体でここ1つ・封印はそのまま ──
const verify = [];
const check = (cond, msg) => verify.push([cond, msg]);
let boots = 0;
for (const ld of Object.values(data.layers ?? {})) {
	for (const sd of Object.values(ld.stages ?? {})) {
		for (const ct of Object.values(sd.chestContents ?? {})) if (ct?.item === 'swiftBoots') boots++;
		if (sd.bossReward?.item === 'swiftBoots') boots++;
	}
}
check(boots === 1, `疾風の靴は全マップで1つ（実測 ${boots}）`);
check(stage.showConditions?.[CHEST]?.trigger === 'flutePlayed', '宝箱の笛の封印が残っている');
check(stage.tiles?.[5]?.[7] === TILE.BREAKABLE_WALL, '爆弾壁 !(5,7) が残っている');

console.log(`# ${LAYER} ${ROOM}：宝箱 (${CHEST}) を疾風の靴に（キュー13）`);
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

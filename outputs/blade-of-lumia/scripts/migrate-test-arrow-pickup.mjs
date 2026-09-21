#!/usr/bin/env node
// 実行キュー19（2026-09-21）: 矢束（'6'）の検証ステージ `arrow_pickup`（test_mechanics 43,0）。
//
// 検証ステージは fixture ではなくライブマップの test_mechanics に置く決まり
// （tests/test-stage-keys.js の冒頭・DECISIONS 2026-07-25）。
//
// 幾何の意図（この盤面でしか測れないこと）:
//   ・(4,4) 矢束（本数 4）      … `floorItems.count` を読むこと・上限より少ない本数
//   ・(4,7) 矢束（本数の指定なし）… 既定（ITEM_META.bow.defaultStack=10）で拾えること
//   ・(6,4) 爆弾（本数 2）      … 同じ機構が爆弾にも効くこと（弓のような必要道具は無い）
//   ・内部は全面床＝プレイヤーを (4,2) に置いて東へ歩くだけで矢束2つを順に踏める
//     （弓なしで踏んでもタイルが残ることを「同じセルをもう一度踏む」で測れる）
//   ・敵なし・外周だけ壁（閉じた部屋）＝通路アリーナ（DOOR_ARENAS 28,0〜38,0）ではない
//
// 冪等（同じ結果を書き直す）＋自己検証。実行は outputs/blade-of-lumia/ から:
//   node scripts/migrate-test-arrow-pickup.mjs

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TEST_LAYER, TEST_STAGE_KEYS } from '../tests/test-stage-keys.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const STAGE_KEY = TEST_STAGE_KEYS.arrow_pickup;
if (!STAGE_KEY) throw new Error('tests/test-stage-keys.js に arrow_pickup が無い');

const ROWS = 10, COLS = 12;
const ARROWS = '6', BOMB = '5', SIGN = 'i';

// 外周だけ壁・内部は全面床
const tiles = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) =>
	(r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) ? '#' : '.'));

tiles[4][4] = ARROWS;
tiles[4][7] = ARROWS;
tiles[6][4] = BOMB;
tiles[2][5] = SIGN;

const stage = {
	comment: '[arrow_pickup] 矢束 6(4,4 本数4)/6(4,7 既定)・爆弾 5(6,4 本数2)。弓が無いと矢束は拾えない（実行キュー19）',
	tiles,
	links: [],
	showConditions: {},
	npcData: {
		'2,5': {
			name: '立て看板',
			lines: [
				'矢束の部屋。',
				'弓が無いと 矢は持っていけない。',
				'左の束は4本・右の束は既定の10本。',
			],
		},
	},
	mapEnters: {},
	chestContents: {},
	floorItems: {
		'4,4': { count: 4 },
		'6,4': { count: 2 },
		// (4,7) は意図的に書かない＝既定本数で拾えることを測る
	},
	rows: ROWS,
	cols: COLS,
};

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers[TEST_LAYER].stages;
const existed = !!stages[STAGE_KEY];
stages[STAGE_KEY] = stage;
writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── 自己検証 ─────────────────────────────────────────────────────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8')).layers[TEST_LAYER].stages[STAGE_KEY];
const errors = [];
if (after.tiles[4][4] !== ARROWS) errors.push('(4,4) が矢束でない');
if (after.tiles[4][7] !== ARROWS) errors.push('(4,7) が矢束でない');
if (after.tiles[6][4] !== BOMB)   errors.push('(6,4) が爆弾でない');
if (after.floorItems['4,4'].count !== 4) errors.push('(4,4) の本数が 4 でない');
if (after.floorItems['4,7'] !== undefined) errors.push('(4,7) に本数が書かれている（既定で拾う検証が死ぬ）');
if (after.floorItems['6,4'].count !== 2) errors.push('(6,4) の本数が 2 でない');
if (!Array.isArray(after.tiles[0])) errors.push('tiles の行が配列でない');
// (4,2)→(4,7) を歩ける（矢束以外は床）
for (let c = 2; c <= 7; c++) {
	const t = after.tiles[4][c];
	if (t !== '.' && t !== ARROWS) errors.push(`(4,${c}) が床でも矢束でもない: '${t}'`);
}
// 爆弾へ降りる道（(4,4)の下・(5,4)）が床
if (after.tiles[5][4] !== '.') errors.push('(5,4) が床でない＝爆弾まで歩けない');

console.log(`migrate-test-arrow-pickup: ${TEST_LAYER} [${STAGE_KEY}] を${existed ? '更新' : '新規作成'}`);
if (errors.length) {
	for (const e of errors) console.error(`  ❌ ${e}`);
	process.exit(1);
}
console.log('  ✅ 検証 OK');

// test_mechanics[35,0] `split_slime` / [36,0] `rupee_eater` を作る／更新する
// （キーは tests/test-stage-keys.js から引く＝2026-08-16 の 32,0 空きアリーナ挿入で +1 ずれた）
// （2026-08-16 / Phase 5.5k k-5「被弾トリガー」の検証ステージ）。
//
// 2体を1枚に混ぜない＝どの機構が壊れたのか混ざらない（k-3/k-4 と同じ作法）。
//   split_slime … 分裂スライム（meta.split）。剣で HP を尽かせると小型 count 体へ分かれる。
//                 **小型の置き場所が無いと分裂しない**（combat.js pickSplitCells）∴
//                 敵の周囲に count 体ぶんの床があることを検査する。
//   rupee_eater … ルピー喰い（meta.leech）。隣接で張り付き所持ルピーを吸う／殴れば剥がれる。
//                 張り付きは**プレイヤーのセルに重なって追従する**＝逃げ回る余地（開けた床）が
//                 要る＝「速度では振り切れない」を測る幾何。
//
// 自己検査（書き込み前に assert）:
//   1. 形（10×12）／外周は壁。ただし**左右の通路（rows 7/8・tests/test-arena-doors.js）は床**
//      ＝隣のアリーナへ歩いて移動できる（敵を試すときに要る・2026-08-16 ユーザー指摘）
//   2. 内部は素の床のみ＝遮蔽ゼロ（敵セルを除く）
//   3. 敵はちょうど1体・期待したタイル・内部にいる
//   4. その敵の ENEMY_META が検証したい機構を実際に持っている（split / leech）
//      ＝機構の無いステージを書かない
//   5. enemyDirs のキー集合が盤面の敵セルと一致
//   6. 敵の4近傍がすべて床（分裂の置き場所／張り付きから逃げる向き）
//   7. split を持つ敵は「親のセル＋4近傍」の床が count+1 セル以上ある
//      ＝小型が置けずに分裂が起きない盤面を書かない
//   8. leech を持つ敵は attachRange >= 1.0（敵はプレイヤーのセルへ自力で入れない∴
//      1.0 未満だと永遠に張り付けない＝歯の無いテストになる。GUIDE §3-1 と同型）
//   9. ステージキーは tests/test-stage-keys.js の表から引く（座標を直書きしない）
//  10. 既存ステージを上書きする場合、同名の用途にしか使われていない（他を踏み潰さない）
//
// 使い方:
//   node scripts/migrate-test-hit-trigger-arenas.mjs --dry
//   node scripts/migrate-test-hit-trigger-arenas.mjs

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TEST_LAYER, stageKey } from '../tests/test-stage-keys.js';
import { openArenaDoors, isArenaDoor, ARENA_DOOR_ROWS } from '../tests/test-arena-doors.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const ROWS = 10, COLS = 12;

// 遮蔽ゼロの開けた 10×12（k-3/k-4 の検証ステージと同じ寸法・同じ敵位置 (4,9)）。
// プレイヤーは save 注入（?row=&col=）で置く＝1枚の盤面で立ち位置を変えて測れる。
const OPEN_BOARD = (enemyTile) => [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	`#........${enemyTile}.#`,
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

const DIR_DELTA = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] };

const STAGES = [
	{
		name: 'split_slime',
		tile: TILE.SPLIT_SLIME,
		board: OPEN_BOARD(TILE.SPLIT_SLIME),
		// 西（プレイヤー側）を向いて置く＝(4,8) から殴って分裂を起こす立ち位置が作れる。
		enemyDirs: { '4,9': 'left' },
		requires: (m) => m.split?.count > 0 && m.split?.childHp > 0 && !!m.split?.childSprite,
		requiresLabel: 'meta.split = { count, childHp, childSprite }',
		comment:
			'[split_slime] Phase 5.5k k-5 分裂スライムの「倒すと小型2体へ分かれる」の検証ステージ'
			+ '（2026-08-16）。幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの通路**'
			+ '（歩いて敵を見比べるため・塞がない）・内部は全面床＝**遮蔽ゼロ**（小型の置き場所が'
			+ '地形で潰れない）。分裂スライム1体(4,9)・向き left。プレイヤーは save 注入で置く：'
			+ '(4,8)＝剣が届く隣接／(4,7)＝射程外。'
			+ '見るもの＝剣で HP0 にすると**倒れずに**小型2体が湧く（親の posKey は記録されない）／'
			+ '小型は1発で倒れ、もう分裂しない／最後の小型を倒したときだけ親の posKey が記録される'
			+ '（＝部屋を出て戻っても復活しない）／弱点の爆弾で潰すと分裂しない。'
			+ '⚠️ 親の周囲を壁で埋めると「置き場所が無い＝分裂しない」経路に落ちてテストの歯が抜ける。',
	},
	{
		name: 'rupee_eater',
		tile: TILE.RUPEE_EATER,
		board: OPEN_BOARD(TILE.RUPEE_EATER),
		enemyDirs: { '4,9': 'left' },
		requires: (m) => m.leech?.attachRange > 0 && m.leech?.drainMs > 0 && m.leech?.amount > 0,
		requiresLabel: 'meta.leech = { attachRange, drainMs, amount }',
		comment:
			'[rupee_eater] Phase 5.5k k-5 ルピー喰いの「張り付いてルピーを吸う」の検証ステージ'
			+ '（2026-08-16）。幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの通路**'
			+ '（歩いて敵を見比べるため・塞がない）・内部は全面床＝**遮蔽ゼロ**（逃げる方向が地形で'
			+ '潰れない＝「速度では振り切れない」を測れる）。ルピー喰い1体(4,9)・向き left。'
			+ 'プレイヤーは save 注入で置き、所持ルピーは ?ps_rupees= で与える。'
			+ '見るもの＝隣接（attachRange 内）で張り付く（attached）／張り付き中はプレイヤーの'
			+ 'セルへ重なって追従する（走っても離れない）／drainMs ごとに amount ルピーを吸う／'
			+ '張り付き中は接触ダメージが出ない（吸うことがこの敵の攻撃）／殴ると剥がれ、'
			+ 'cooldownMs の間は再び張り付けない／倒すと吸われたルピーの refund 割が戻る。'
			+ '⚠️ 所持ルピー 0 では吸うものが無く自分から剥がれる∴ルピーを与えずに測ると歯が抜ける。',
	},
];

// ── 検査 ────────────────────────────────────────────────────────────────
const isEnemy = (t) => ENEMY_META[t] != null;

const prepared = [];
for (const st of STAGES) {
	const { name, tile, board, enemyDirs, requires, requiresLabel } = st;
	if (board.length !== ROWS) throw new Error(`${name}: rows が ${ROWS} でない: ${board.length}`);
	for (const [i, row] of board.entries()) {
		if ([...row].length !== COLS) throw new Error(`${name}: cols が ${COLS} でない: row ${i} = ${[...row].length}`);
	}
	// 左右の通路（rows 7/8）を開ける＝隣のアリーナへ歩いて移動できる。宣言した盤面の
	// 文字列に直接書かずここで開ける＝盤面を書き足すときに通路を潰せない。
	const grid = openArenaDoors(board.map(r => [...r]));
	const enemyCells = [];
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const t = grid[r][c];
			const onEdge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
			if (onEdge) {
				if (isArenaDoor(r, c, COLS)) {
					if (t !== TILE.FLOOR) throw new Error(`${name}: 通路(${r},${c}) が床でない: '${t}'`);
					continue;
				}
				if (t !== TILE.WALL) throw new Error(`${name}: 外周(${r},${c}) が壁でない: '${t}'`
					+ `（通路は rows ${ARENA_DOOR_ROWS.join('/')} だけ）`);
				continue;
			}
			if (isEnemy(t)) { enemyCells.push(`${r},${c}`); continue; }
			if (t !== TILE.FLOOR) {
				throw new Error(`${name}: 内部(${r},${c}) が素の床でない: '${t}'（遮蔽ゼロが条件）`);
			}
		}
	}
	if (enemyCells.length !== 1) throw new Error(`${name}: 敵は1体だけ置く: ${enemyCells.length} 体`);
	const [er, ec] = enemyCells[0].split(',').map(Number);
	if (grid[er][ec] !== tile) throw new Error(`${name}: 置いた敵が期待('${tile}')でない: '${grid[er][ec]}'`);

	const meta = ENEMY_META[tile];
	if (!meta) throw new Error(`${name}: ENEMY_META に '${tile}' が無い`);
	if (!requires(meta)) {
		throw new Error(`${name}: ${meta.name} が検証対象の機構を持っていない（要求: ${requiresLabel}）`);
	}

	const dirKeys = Object.keys(enemyDirs);
	if (dirKeys.length !== enemyCells.length || dirKeys.some(k => !enemyCells.includes(k))) {
		throw new Error(`${name}: enemyDirs が盤面と一致しない（盤面: ${enemyCells.join(' ')} / dirs: ${dirKeys.join(' ')}）`);
	}

	// 6. 敵の4近傍がすべて床（分裂の置き場所／張り付きから逃げる向き）
	for (const [d, [dr, dc]] of Object.entries(DIR_DELTA)) {
		const t = grid[er + dr]?.[ec + dc];
		if (t !== TILE.FLOOR) {
			throw new Error(`${name}: 敵(${er},${ec}) の ${d} 側(${er + dr},${ec + dc}) が床でない: '${t}'`
				+ '（被弾トリガーは敵の周囲に余裕が無いと検証できない）');
		}
	}

	// 7. 分裂する敵は「親のセル＋4近傍」に count+1 セル以上の床がある
	//    （親のセルは分裂の瞬間に空く＝小型の置き場所になる。pickSplitCells と同じ順序）
	if (meta.split) {
		const need = (meta.split.count ?? 2) + 1;
		let free = 1;   // 親のセル
		for (const [dr, dc] of Object.values(DIR_DELTA)) {
			if (grid[er + dr]?.[ec + dc] === TILE.FLOOR) free++;
		}
		if (free < need) {
			throw new Error(`${name}: 小型の置き場所が足りない（床 ${free} / 必要 ${need}）`
				+ '＝分裂せずに素直に倒れる経路に落ちる（テストの歯が抜ける）');
		}
	}

	// 8. 張り付く敵は attachRange >= 1.0（自力で詰められる最短距離が 1.0）
	if (meta.leech) {
		const ar = meta.leech.attachRange ?? 0;
		if (ar < 1.0) {
			throw new Error(`${name}: attachRange が ${ar} ＝1.0 未満`
				+ '（敵はプレイヤーのセルへ自力で入れない∴永遠に張り付けない＝GUIDE §3-1 の罠）');
		}
	}

	prepared.push({ ...st, grid, key: stageKey(name), enemyCell: [er, ec], dir: enemyDirs[enemyCells[0]] });
}

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[TEST_LAYER];
if (!layer) throw new Error(`レイヤーが無い: ${TEST_LAYER}`);
for (const p of prepared) {
	const existing = layer.stages[p.key];
	if (existing && !(existing.comment ?? '').startsWith(`[${p.name}]`)) {
		throw new Error(`${TEST_LAYER}[${p.key}] は別の用途で使われている（comment: ${String(existing.comment).slice(0, 40)}…）`);
	}
}

// ── 書き込み ────────────────────────────────────────────────────────────
for (const p of prepared) {
	const existing = layer.stages[p.key];
	layer.stages[p.key] = {
		comment: p.comment,
		tiles: p.grid,
		bgTiles: existing?.bgTiles ?? {},
		links: existing?.links ?? [],
		enemyDirs: { ...p.enemyDirs },
		rows: ROWS,
		cols: COLS,
	};
	const meta = ENEMY_META[p.tile];
	console.log(`# ${TEST_LAYER}[${p.key}] = ${p.name}（${existing ? '更新' : '新規'}）`);
	for (const [i, row] of p.grid.entries()) console.log(`   ${String(i).padStart(2)} ${row.join('')}`);
	console.log(`# ${meta.name} 1 体 (${p.enemyCell.join(',')}) 向き=${p.dir}`
		+ ' / 内部は全面床（遮蔽ゼロ）・敵の四方すべて床'
		+ (meta.split ? ` / 小型 ${meta.split.count} 体の置き場所を確認済み` : '')
		+ (meta.leech ? ` / attachRange ${meta.leech.attachRange} >= 1.0 を確認済み` : ''));
}

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
}

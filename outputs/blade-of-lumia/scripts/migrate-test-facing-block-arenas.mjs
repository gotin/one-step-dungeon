// test_mechanics[33,0] `shield_knight` / [34,0] `fire_turtle` を作る／更新する
// （キーは tests/test-stage-keys.js から引く＝2026-08-16 の 32,0 空きアリーナ挿入で +1 ずれた）
// （2026-08-15 / Phase 5.5k k-4「方向依存の被ダメ」の検証ステージ）。
//
// 2体を1枚に混ぜない＝どの機構が壊れたのか混ざらない（k-3 の hide-window-arenas と同じ作法）。
//   shield_knight … 盾騎士（meta.blockFacing）。正面は常時ブロック＝側面/背後だけ通る。
//                   遮蔽ゼロ＝「回り込めなかった理由」が地形と混ざらない。さらに
//                   **敵の四方すべてが床**であることを検査する（GUIDE §3-2＝敵と同じ
//                   セルには入れない∴回り込みには周囲1マスの余裕が要る）。
//   fire_turtle   … 火吐き亀（meta.shell）。籠もり中は全方向無効・開いた瞬間に炎。
//                   炎は正面へ breathCells セル∴**その射線ぶんの床が敵の正面に要る**
//                   （届く距離と届かない距離を同じ盤面で測るため +1 セル）。
//
// 自己検査（書き込み前に assert）:
//   1. 形（10×12）／外周は壁。ただし**左右の通路（rows 7/8・tests/test-arena-doors.js）は床**
//      ＝隣のアリーナへ歩いて移動できる（敵を試すときに要る・2026-08-16 ユーザー指摘）。
//      計測帯 rows 4/5 は壁のまま＝⑦（ノックバックの壁止め）⑫（炎の壁止め）の突き当たり
//   2. 内部は素の床のみ＝遮蔽ゼロ（敵セルを除く）
//   3. 敵はちょうど1体・期待したタイル・内部にいる
//   4. その敵の ENEMY_META が検証したい機構を実際に持っている（blockFacing / shell）
//      ＝機構の無いステージを書かない
//   5. enemyDirs のキー集合が盤面の敵セルと一致
//   6. 敵の4近傍がすべて床＝正面/側面/背後の3方向から殴れる幾何（回り込みの余地）
//   7. 敵の正面（enemyDirs の向き）に (炎の射程+1) セルぶんの床が続く
//      ＝「焼かれる位置」と「焼かれない位置」を同じ盤面で測れる（shell を持つ敵のみ）
//   8. ステージキーは tests/test-stage-keys.js の表から引く（座標を直書きしない）
//   9. 既存ステージを上書きする場合、同名の用途にしか使われていない（他を踏み潰さない）
//
// 使い方:
//   node scripts/migrate-test-facing-block-arenas.mjs --dry
//   node scripts/migrate-test-facing-block-arenas.mjs

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

// 遮蔽ゼロの開けた 10×12（sword_beast_arena / k-3 の3枚と同じ寸法・同じ敵位置 (4,9)）。
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
		name: 'shield_knight',
		tile: TILE.SHIELD_KNIGHT,
		board: OPEN_BOARD(TILE.SHIELD_KNIGHT),
		// 西（プレイヤー側）を向いて立つ＝正面ブロックを (4,8) から、背後を (4,10) から測れる。
		// tickFaceLock は初回だけこの向きを尊重する（turnMs 経過後に向き直り始める）。
		enemyDirs: { '4,9': 'left' },
		requires: (m) => m.blockFacing?.turnMs > 0 && m.blockFacing?.knockback > 0,
		requiresLabel: 'meta.blockFacing = { turnMs, knockback }',
		comment:
			'[shield_knight] Phase 5.5k k-4 盾騎士の「向き固定の常時ブロック」の検証ステージ（2026-08-15）。'
			+ '幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの通路**（歩いて敵を見比べる'
			+ 'ため・塞がない）・内部は全面床＝**遮蔽ゼロ**（回り込めない理由が地形と混ざらない）。'
			+ '盾騎士1体(4,9)・向き left（西＝プレイヤー側を向いて立つ）。プレイヤーは save 注入で置く：'
			+ '(4,8)＝正面＝弾かれる／(4,10)＝背後＝通る／(3,9)(5,9)＝側面＝通る。'
			+ '見るもの＝正面からの剣は 0 ダメージ＋プレイヤーが1歩弾かれる／側面・背後は通る／'
			+ '向き直りは blockFacing.turnMs ごと（毎tick向き直らない＝回り込む猶予がある）／'
			+ '騎士の剣も正面にしか振れない（側面のプレイヤーは殴られない）。'
			+ '⚠️ 敵の四方に床が無いと回り込みが試せない（敵と同じセルには入れない＝GUIDE §3-2）。',
	},
	{
		name: 'fire_turtle',
		tile: TILE.FIRE_TURTLE,
		board: OPEN_BOARD(TILE.FIRE_TURTLE),
		// 西を向いて立つ＝炎の射線が (4,8)(4,7) に来る（(4,6) は届かない）。
		enemyDirs: { '4,9': 'left' },
		requires: (m) => m.shell?.closedMs > 0 && m.shell?.openMs > 0 && m.shell?.breathCells > 0,
		requiresLabel: 'meta.shell = { closedMs, openMs, breathCells }',
		comment:
			'[fire_turtle] Phase 5.5k k-4 火吐き亀の「甲羅の開閉＋開いた瞬間の炎」の検証ステージ'
			+ '（2026-08-15）。幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの通路**・内部は'
			+ '全面床＝**遮蔽ゼロ**（炎が正面の射線で壁に止められない＝rows 4/5 の外周は壁のまま）。'
			+ '火吐き亀1体(4,9)・向き left。プレイヤーは save 注入で置く：(4,7)＝炎の射程内'
			+ '（正面2セル）／(4,6)＝射程外／(4,8)＝隣接＝籠もり中の甲羅を叩ける。'
			+ '見るもの＝籠もり中（shellClosed）は**方向を問わず**全ダメージ 0／開いている間だけ通る／'
			+ '籠もり→開くの瞬間に正面へ炎が出る（.enemy-fire-breath）。'
			+ '⚠️ 正面の射線に壁を置くと炎が途中で止まる（届く/届かないの切り分けが崩れる）。',
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
	// 左右の通路（rows 7/8）を開ける＝隣のアリーナへ歩いて移動できる（計測帯 rows 4/5 は
	// 壁のまま＝⑦ のノックバック・⑫ の炎は (4,11) の壁を突き当たりとして測る）。
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

	// 6. 敵の4近傍がすべて床＝正面/側面/背後の3方向から殴れる（回り込みの余地がある）
	for (const [d, [dr, dc]] of Object.entries(DIR_DELTA)) {
		const t = grid[er + dr]?.[ec + dc];
		if (t !== TILE.FLOOR) {
			throw new Error(`${name}: 敵(${er},${ec}) の ${d} 側(${er + dr},${ec + dc}) が床でない: '${t}'`
				+ '（方向依存の被ダメは四方から殴れないと検証できない）');
		}
	}

	// 7. 炎を持つ敵は正面に「射程+1」セルの床が続く（届く/届かないを同じ盤面で測る）
	const dir = enemyDirs[enemyCells[0]];
	const [ur, uc] = DIR_DELTA[dir] ?? [];
	if (ur == null) throw new Error(`${name}: enemyDirs の向きが不正: '${dir}'`);
	if (meta.shell) {
		const need = (meta.shell.breathCells ?? 0) + 1;
		for (let k = 1; k <= need; k++) {
			const t = grid[er + ur * k]?.[ec + uc * k];
			if (t !== TILE.FLOOR) {
				throw new Error(`${name}: 正面 ${k} セル目(${er + ur * k},${ec + uc * k}) が床でない: '${t}'`
					+ `（炎の射程 ${meta.shell.breathCells} + 1 セルぶんの床が要る）`);
			}
		}
	}

	prepared.push({ ...st, grid, key: stageKey(name), enemyCell: [er, ec], dir });
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
		+ ' / 内部は全面床（遮蔽ゼロ）・敵の四方すべて床（回り込み可）'
		+ (meta.shell ? ` / 炎の射線 ${meta.shell.breathCells}+1 セル確認済み` : ''));
}

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
}

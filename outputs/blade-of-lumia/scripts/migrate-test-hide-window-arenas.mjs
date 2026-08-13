// test_mechanics[29,0] `burrow_worm` / [30,0] `leap_spider` / [31,0] `bat_swarm` を作る／更新する
// （2026-08-13 / Phase 5.5k k-3「隠れ↔出現の無敵窓」を陸/空へ一般化したときの検証ステージ）。
//
// 3体を1枚に混ぜない＝どの機構が壊れたのか混ざらない（sword_beast_arena と同じ作法）。
//   burrow_worm … 地中蟲（meta.hide）。遮蔽ゼロ＝隠れ↔出現の周期と無敵/接触/攻撃の
//                 スキップだけを見る（壁や水で「止まった理由」が混ざらない）。
//   leap_spider … 跳躍蜘蛛（meta.leap）。遮蔽ゼロ＝溜め→滞空（無敵）→着地硬直（反撃の窓）。
//   bat_swarm   … コウモリ群（move:'air' + meta.zigzag）。**中央に水の縦帯**を置く＝
//                 陸上敵には渡れない幾何を飛行敵が越えることを確認するための盤面。
//
// 自己検査（書き込み前に assert）:
//   1. 形（10×12）／外周は全部壁
//   2. 内部は素の床のみ（bat_swarm は水の縦帯だけ例外）＝遮蔽ゼロ
//   3. 敵はちょうど1体・期待したタイル・内部にいる
//   4. その敵の ENEMY_META が検証したい機構を実際に持っている
//      （hide / leap / move:'air'+zigzag）＝機構の無いステージを書かない
//   5. enemyDirs のキー集合が盤面の敵セルと一致
//   6. bat_swarm の水帯が**東西を完全に分断している**（陸の 4 近傍 BFS で敵セルに届かない）
//      ＝「飛行だから渡れた」と言える幾何であることを盤面から証明する
//   7. ステージキーは tests/test-stage-keys.js の表から引く（座標を直書きしない）
//   8. 既存ステージを上書きする場合、同名の用途にしか使われていない（他を踏み潰さない）
//
// 使い方:
//   node scripts/migrate-test-hide-window-arenas.mjs --dry
//   node scripts/migrate-test-hide-window-arenas.mjs

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TEST_LAYER, stageKey } from '../tests/test-stage-keys.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const ROWS = 10, COLS = 12;

// 遮蔽ゼロの開けた 10×12（sword_beast_arena と同じ寸法＝プレイヤーは save 注入で置く）。
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

// 水の縦帯（col 6・rows 1-8）で東西を分断した 10×12。コウモリは東 (4,9)。
const WATER_BOARD = [
	'############',
	'#.....~....#',
	'#.....~....#',
	'#.....~....#',
	'#.....~..ξ.#',
	'#.....~....#',
	'#.....~....#',
	'#.....~....#',
	'#.....~....#',
	'############',
];

const STAGES = [
	{
		name: 'burrow_worm',
		tile: TILE.BURROW_WORM,
		board: OPEN_BOARD(TILE.BURROW_WORM),
		enemyDirs: { '4,9': 'left' },
		// 検証したい機構がメタに実在するか（無ければステージを書かない）
		requires: (m) => m.hide?.hiddenMs > 0 && m.hide?.shownMs > 0,
		requiresLabel: 'meta.hide = { hiddenMs, shownMs }',
		waterSplit: false,
		comment:
			'[burrow_worm] Phase 5.5k k-3 地中蟲の「隠れ↔出現の無敵窓」の検証ステージ（2026-08-13）。'
			+ '幾何＝外周だけ壁・内部は全面床＝**遮蔽ゼロ**（敵が止まった理由が地形と混ざらない）。'
			+ '地中蟲1体(4,9)。プレイヤーは save 注入で置く：(4,10)＝隣接＝噛みつき/剣が届く。'
			+ '見るもの＝潜伏中（hidden）は無敵・接触ダメージなし・攻撃なしで寄ってくる／'
			+ '浮上中（hidden=false）だけ殴れる・噛まれる。⚠️ 壁や水を内部に置くと「浮上を待つ」'
			+ 'リズムの観測に地形の影響が混ざる。',
	},
	{
		name: 'leap_spider',
		tile: TILE.LEAP_SPIDER,
		board: OPEN_BOARD(TILE.LEAP_SPIDER),
		enemyDirs: { '4,9': 'left' },
		requires: (m) => m.leap?.cells > 0 && m.leap?.windupMs > 0 && m.leap?.cooldownMs > 0,
		requiresLabel: 'meta.leap = { windupMs, cells, cooldownMs }',
		waterSplit: false,
		comment:
			'[leap_spider] Phase 5.5k k-3 跳躍蜘蛛の「跳躍＝滞空中は当たり判定消失」の検証ステージ'
			+ '（2026-08-13）。幾何＝外周だけ壁・内部は全面床＝**遮蔽ゼロ**（跳躍が壁で止まらない）。'
			+ '跳躍蜘蛛1体(4,9)。プレイヤーは save 注入で置く：(4,5)＝距離4＝leap.maxRange 6 の内側'
			+ '∴溜め（windup）→滞空（無敵）→着地硬直（反撃の窓）の3拍がそのまま観測できる。'
			+ '⚠️ 距離が minRange 1.8 より近いと跳ばない（密着では跳躍しない設計）。',
	},
	{
		name: 'bat_swarm',
		tile: TILE.BAT_SWARM,
		board: WATER_BOARD,
		enemyDirs: { '4,9': 'left' },
		requires: (m) => m.move === 'air' && m.zigzag?.amplitude > 0 && m.zigzag?.periodMs > 0,
		requiresLabel: "move:'air' + meta.zigzag = { amplitude, periodMs }",
		waterSplit: true,
		comment:
			'[bat_swarm] Phase 5.5k k-3 コウモリ群の「飛行（水/溶岩/空を越える）＋ジグザグ飛行」の'
			+ '検証ステージ（2026-08-13）。幾何＝**水の縦帯（col 6・rows 1-8）で東西を完全に分断**'
			+ 'する＝陸上敵なら絶対に渡れない盤面（migrate が陸の BFS で分断を検査済み）∴'
			+ 'コウモリが西へ来たら「飛んで越えた」と断定できる。コウモリ1体(4,9)。プレイヤーは'
			+ 'save 注入で置く：(4,2)＝水帯の西側。ジグザグ（プレイヤーの脇 amplitude を狙う）も'
			+ 'この盤面で測る。⚠️ 水帯に橋やはしごを足すと分断が崩れて飛行の検証が成立しない。',
	},
];

// ── 検査 ────────────────────────────────────────────────────────────────
const isEnemy = (t) => ENEMY_META[t] != null;

/** 陸（床）だけを 4 近傍でたどれるセル集合。水/壁は通れない＝陸上敵の到達範囲。 */
function landReachable(grid, sr, sc) {
	const seen = new Set([`${sr},${sc}`]);
	const q = [[sr, sc]];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
			const k = `${nr},${nc}`;
			if (seen.has(k)) continue;
			const t = grid[nr][nc];
			if (t === TILE.WALL || t === TILE.WATER) continue;   // 陸上は水も壁も通れない
			seen.add(k);
			q.push([nr, nc]);
		}
	}
	return seen;
}

const prepared = [];
for (const st of STAGES) {
	const { name, tile, board, enemyDirs, requires, requiresLabel, waterSplit } = st;
	if (board.length !== ROWS) throw new Error(`${name}: rows が ${ROWS} でない: ${board.length}`);
	for (const [i, row] of board.entries()) {
		if ([...row].length !== COLS) throw new Error(`${name}: cols が ${COLS} でない: row ${i} = ${[...row].length}`);
	}
	const grid = board.map(r => [...r]);
	const enemyCells = [];
	const waterCells = [];
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const t = grid[r][c];
			const onEdge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
			if (onEdge) {
				if (t !== TILE.WALL) throw new Error(`${name}: 外周(${r},${c}) が壁でない: '${t}'`);
				continue;
			}
			if (isEnemy(t)) { enemyCells.push(`${r},${c}`); continue; }
			if (waterSplit && t === TILE.WATER) { waterCells.push(`${r},${c}`); continue; }
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

	if (waterSplit) {
		if (waterCells.length === 0) throw new Error(`${name}: 水帯が無い（飛行の検証が成立しない）`);
		// 西側の代表セル（プレイヤーを置く (4,2)）から陸だけで敵セルに届いてはならない。
		const reach = landReachable(grid, 4, 2);
		if (reach.has(`${er},${ec}`)) {
			throw new Error(`${name}: 水帯が東西を分断していない（陸だけで敵セル(${er},${ec})へ到達できる）`);
		}
		// 逆側からも確認＝敵側の陸が西へ抜けていない（迂回路が無い）
		const reachEast = landReachable(grid, er, ec);
		if (reachEast.has('4,2')) {
			throw new Error(`${name}: 敵側の陸から西 (4,2) へ抜けられる（迂回路がある）`);
		}
	}

	prepared.push({ ...st, grid, key: stageKey(name), enemyCell: [er, ec], waterCells });
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
	console.log(`# ${meta.name} 1 体 (${p.enemyCell.join(',')}) 向き=${Object.values(p.enemyDirs)[0]}`
		+ (p.waterSplit ? ` / 水 ${p.waterCells.length} セル＝東西分断を確認済み` : ' / 内部は全面床（遮蔽ゼロ）'));
}

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
}

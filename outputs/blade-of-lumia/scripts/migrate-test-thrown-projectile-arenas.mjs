// test_mechanics[37,0] `bomb_ogre` / [38,0] `boomerang_ogre` を作る／更新する
// （キーは tests/test-stage-keys.js から引く＝座標を直書きしない）
// （2026-08-16 / Phase 5.5k k-6「投擲物の種別追加」の検証ステージ）。
//
// 2体を1枚に混ぜない＝どの機構が壊れたのか混ざらない（k-3/k-4/k-5 と同じ作法）。
//   bomb_ogre      … 爆弾鬼（attack.type:'bombThrow'）。放物線で投げた爆弾が着弾点で
//                    範囲爆発する。**壁を越えて届く**のがこの敵の設計の核∴内部に壁を
//                    1枚だけ立てる（＝このアリーナは意図的に遮蔽ゼロではない）。
//                    爆風で `!`（壊せる壁）が壊れることも同じ盤面で測る。
//   boomerang_ogre … ブーメラン鬼（attack.type:'boomerangThrow'）。往復するブーメランを
//                    投げる。**行きを避けて帰りに当たる**を測る＝行から1マス外れる床と、
//                    折り返す maxRange が収まる西側の距離が要る∴内部は全面床（遮蔽ゼロ）。
//
// 自己検査（書き込み前に assert）:
//   1. 形（10×12）／外周は壁。ただし**左右の通路（rows 7/8・tests/test-arena-doors.js）は床**
//      ＝隣のアリーナへ歩いて移動できる（敵を試すときに要る・2026-08-16 ユーザー指摘）
//   2. 内部は「素の床」＋**宣言した例外セル（holes）だけ**＝宣言していない障害物を書かない
//      （遮蔽ゼロを崩すなら、崩す理由と場所をこのファイルに明記させる）
//   3. 敵はちょうど1体・期待したタイル・内部にいる
//   4. その敵の ENEMY_META が検証したい機構を実際に持っている（bombThrow / boomerangThrow）
//      ＝機構の無いステージを書かない
//   5. enemyDirs のキー集合が盤面の敵セルと一致
//   6. 敵の4近傍がすべて床（回り込み・逃げる向きが地形で潰れない）
//   7. 遠隔攻撃の成立条件が幾何として満たされている＝**計測に使う立ち位置（probe）が
//      minRange < dist <= range** かつ **combat.keepMin <= dist <= keepMax**（＝遠隔相の
//      敵がその場に止まる間合い＝GUIDE §7-3 の罠を盤面の側でも防ぐ）
//   8. 爆弾鬼のアリーナは「壁が敵と probe の直線上にある」＝壁越しに当たることを測れる
//      （壁が横に逸れていると「遮蔽を越えた」ことの証明にならない）
//   9. 爆弾鬼のアリーナは `!` が着弾セルから blast.radius 以内にある
//      ＝爆風で壊れる位置（外れていると「敵の爆弾で `!` が壊れる」の歯が抜ける）
//  10. ステージキーは tests/test-stage-keys.js の表から引く（座標を直書きしない）
//  11. 既存ステージを上書きする場合、同名の用途にしか使われていない（他を踏み潰さない）
//
// 使い方:
//   node scripts/migrate-test-thrown-projectile-arenas.mjs --dry
//   node scripts/migrate-test-thrown-projectile-arenas.mjs

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

// 遮蔽ゼロの開けた 10×12（k-3/k-4/k-5 の検証ステージと同じ寸法・同じ敵位置 (4,9)）。
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

// 爆弾鬼の盤面＝開けた床に**壁(4,7)と壊せる壁(4,3)を1枚ずつ**足したもの。
// row 4 だけが素の床でない＝計測帯（rows 4/5）の row 4 に「遮蔽」と「壊す標的」を並べる。
const BOMB_BOARD = (enemyTile) => {
	const rows = OPEN_BOARD(enemyTile);
	rows[4] = `#..${TILE.BREAKABLE_WALL}...${TILE.WALL}.${enemyTile}.#`;
	return rows;
};

const DIR_DELTA = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] };

const STAGES = [
	{
		name: 'bomb_ogre',
		tile: TILE.BOMB_OGRE,
		board: BOMB_BOARD(TILE.BOMB_OGRE),
		// 西（プレイヤー側）を向いて置く＝壁の向こうの probe へ投げる向き。
		enemyDirs: { '4,9': 'left' },
		// 宣言した例外セル＝ここに書いたセルだけ床以外を許す（検査 2）。
		holes: { '4,7': TILE.WALL, '4,3': TILE.BREAKABLE_WALL },
		// 計測に使う立ち位置（プレイヤーを save 注入する場所）＝着弾セルにもなる。
		probe: [4, 4],
		// 爆風で壊れることを測る `!` の位置。
		breakable: [4, 3],
		// 敵と probe の直線を遮る壁（検査 8）。
		cover: [4, 7],
		requires: (m) => m.attack?.type === 'bombThrow'
			&& m.attack?.blast?.radius > 0 && m.attack?.blast?.damage > 0
			&& m.attack?.blast?.breakPower > 0,
		requiresLabel: "attack = { type:'bombThrow', blast:{ radius, damage, breakPower } }",
		comment:
			'[bomb_ogre] Phase 5.5k k-6 爆弾鬼の「放物線で投げた爆弾が着弾点で範囲爆発する」の'
			+ '検証ステージ（2026-08-16）。幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの'
			+ '通路**（歩いて敵を見比べるため・塞がない）。⚠️ **このアリーナは意図的に遮蔽ゼロでは'
			+ 'ない**＝内部に壁(4,7)を1枚立てている。理由＝放物線の爆弾は壁を越えて届く（遮蔽が'
			+ '効かない）のがこの敵の設計の核∴壁が無いと「越えた」ことを測れない（bat_swarm の'
			+ '水帯と同型の「機構のために遮蔽を置く」例外）。壊せる壁 `!`(4,3) は着弾点(4,4)から'
			+ '距離1＝爆風半径 1.5 の内側。爆弾鬼1体(4,9)・向き left。'
			+ 'プレイヤーは save 注入で置く：(4,4)＝壁の向こう・dist 5（遠隔相の間合い）。'
			+ '見るもの＝壁越しに爆弾が飛んで来る（proj.lob・当たり判定を通らない）／着弾点は'
			+ '**投げた瞬間のプレイヤーのセル**で固定＝走れば避けられる／爆風は `!`(4,3) を壊す／'
			+ '盾を正面に構えても防げない（点の投擲物ではない＝離れるしかない）／'
			+ '密着（minRange 2.0 より近い）では投げてこない＝接触ダメージに切り替わる。'
			+ '⚠️ 壁(4,7) を消すと「遮蔽を越えた」の歯が抜ける（ただの開けた床での命中になる）。',
	},
	{
		name: 'boomerang_ogre',
		tile: TILE.BOOMERANG_OGRE,
		board: OPEN_BOARD(TILE.BOOMERANG_OGRE),
		enemyDirs: { '4,9': 'left' },
		holes: {},
		probe: [4, 6],
		requires: (m) => m.attack?.type === 'boomerangThrow' && m.attack?.maxRange > 0,
		requiresLabel: "attack = { type:'boomerangThrow', maxRange }",
		comment:
			'[boomerang_ogre] Phase 5.5k k-6 ブーメラン鬼の「往復するブーメラン＝避けても帰りに'
			+ '当たる」の検証ステージ（2026-08-16）。幾何＝外周は壁・**左右の rows 7/8 だけ隣の'
			+ 'アリーナへの通路**（歩いて敵を見比べるため・塞がない）・内部は全面床＝**遮蔽ゼロ**'
			+ '（行きを避けるために行から1マス外れる余地が要る／折り返す maxRange 4.5 が西側に'
			+ '収まる）。ブーメラン鬼1体(4,9)・向き left。'
			+ 'プレイヤーは save 注入で置く：(4,6)＝同じ行・dist 3（遠隔相の間合い・射程内）。'
			+ '見るもの＝縦横が揃ったときだけ投げる（行/列を外すと投げてこない＝swordBeam と同型）／'
			+ '投げたブーメランは maxRange か壁で折り返し**投げた敵へ帰る**（returning が立つ）／'
			+ '行きを避けて行へ戻ると帰りに当たる（二度読み）／敵のブーメランは床のアイテムを'
			+ '拾わない・かがり火に点火しない（ギミックが敵の手で解けない）。'
			+ '⚠️ 内部に壁を足すと折り返し距離が変わる＝「maxRange で折り返す」の測定が壁の'
			+ '折り返しに置き換わって歯が抜ける。',
	},
];

// ── 検査 ────────────────────────────────────────────────────────────────
const isEnemy = (t) => ENEMY_META[t] != null;

const prepared = [];
for (const st of STAGES) {
	const { name, tile, board, enemyDirs, requires, requiresLabel, holes, probe } = st;
	if (board.length !== ROWS) throw new Error(`${name}: rows が ${ROWS} でない: ${board.length}`);
	for (const [i, row] of board.entries()) {
		if ([...row].length !== COLS) throw new Error(`${name}: cols が ${COLS} でない: row ${i} = ${[...row].length}`);
	}
	// 左右の通路（rows 7/8）を開ける＝隣のアリーナへ歩いて移動できる。宣言した盤面の
	// 文字列に直接書かずここで開ける＝盤面を書き足すときに通路を潰せない。
	const grid = openArenaDoors(board.map(r => [...r]));
	const enemyCells = [];
	const seenHoles = new Set();
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
			const key = `${r},${c}`;
			if (holes[key] !== undefined) {
				if (t !== holes[key]) {
					throw new Error(`${name}: 例外セル(${r},${c}) が宣言('${holes[key]}')と違う: '${t}'`);
				}
				seenHoles.add(key);
				continue;
			}
			if (t !== TILE.FLOOR) {
				throw new Error(`${name}: 内部(${r},${c}) が素の床でない: '${t}'`
					+ '（遮蔽を置くなら holes に「どこに・なぜ」を宣言する）');
			}
		}
	}
	for (const key of Object.keys(holes)) {
		if (!seenHoles.has(key)) throw new Error(`${name}: holes に宣言した(${key}) が盤面に無い`);
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

	// 6. 敵の4近傍がすべて床（回り込み・逃げる向きが地形で潰れない）
	for (const [d, [dr, dc]] of Object.entries(DIR_DELTA)) {
		const t = grid[er + dr]?.[ec + dc];
		if (t !== TILE.FLOOR) {
			throw new Error(`${name}: 敵(${er},${ec}) の ${d} 側(${er + dr},${ec + dc}) が床でない: '${t}'`
				+ '（投擲の検証でも敵の周囲に余裕が無いと立ち位置を変えられない）');
		}
	}

	// 7. probe の間合いが「射程内」かつ「遠隔相で敵が止まる間合い」であること
	//    ＝GUIDE §7-3 の罠（撃てない位置に居る遠隔敵）を盤面の側でも防ぐ。
	const [pr, pc] = probe;
	if (grid[pr]?.[pc] !== TILE.FLOOR) throw new Error(`${name}: probe(${pr},${pc}) が床でない: '${grid[pr]?.[pc]}'`);
	const dist = Math.sqrt((pr - er) ** 2 + (pc - ec) ** 2);
	const atk = meta.attack;
	if (dist > (atk.range ?? 5)) throw new Error(`${name}: probe が射程外（dist ${dist} > range ${atk.range}）`);
	if (atk.minRange !== undefined && dist <= atk.minRange) {
		throw new Error(`${name}: probe が minRange の内側（dist ${dist} <= minRange ${atk.minRange}）`
			+ '＝投げてこない立ち位置で測ることになる');
	}
	if (meta.combat) {
		const { keepMin, keepMax } = meta.combat;
		if (dist < keepMin || dist > keepMax) {
			throw new Error(`${name}: probe が遠隔相の間合いの外（dist ${dist} ∉ [${keepMin}, ${keepMax}]）`
				+ '＝敵が寄る/退がるので観測 tick が揺れる（止まる間合いで測る）');
		}
	}

	// 8. 爆弾鬼のアリーナ＝敵と probe の直線上に遮蔽があること
	if (st.cover) {
		const [cr, cc] = st.cover;
		if (grid[cr]?.[cc] !== TILE.WALL) throw new Error(`${name}: 遮蔽(${cr},${cc}) が壁でない`);
		if (!(cr === er && er === pr)) {
			throw new Error(`${name}: 遮蔽(${cr},${cc}) が敵(${er},${ec}) と probe(${pr},${pc}) の同じ行に無い`
				+ '＝「壁を越えて当たった」の証明にならない');
		}
		if (!(cc > Math.min(ec, pc) && cc < Math.max(ec, pc))) {
			throw new Error(`${name}: 遮蔽(${cr},${cc}) が敵と probe の間に無い（col ${Math.min(ec, pc)}〜${Math.max(ec, pc)}）`);
		}
	}

	// 9. 爆弾鬼のアリーナ＝`!` が着弾セル（probe）から爆風半径の内側にあること
	if (st.breakable) {
		const [br, bc] = st.breakable;
		if (grid[br]?.[bc] !== TILE.BREAKABLE_WALL) throw new Error(`${name}: (${br},${bc}) が壊せる壁でない`);
		const bd = Math.sqrt((br - pr) ** 2 + (bc - pc) ** 2);
		const radius = meta.attack.blast.radius;
		if (bd > radius) {
			throw new Error(`${name}: \`!\`(${br},${bc}) が爆風の外（着弾(${pr},${pc}) から ${bd} > radius ${radius}）`
				+ '＝「敵の爆弾で壊せる壁が壊れる」の歯が抜ける');
		}
	}

	prepared.push({ ...st, grid, key: stageKey(name), enemyCell: [er, ec], dir: enemyDirs[enemyCells[0]], dist });
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
		+ ` / probe (${p.probe.join(',')}) dist ${p.dist.toFixed(2)}`
		+ ` / 射程 ${meta.attack.range}・minRange ${meta.attack.minRange}`
		+ (meta.combat ? `・遠隔相 [${meta.combat.keepMin}, ${meta.combat.keepMax}]` : '')
		+ (st_holeCount(p) ? ` / 宣言した遮蔽 ${st_holeCount(p)} セル` : ' / 遮蔽ゼロ')
		+ (p.breakable ? ` / \`!\` は着弾から爆風半径 ${meta.attack.blast.radius} の内側` : ''));
}

function st_holeCount(p) { return Object.keys(p.holes ?? {}).length; }

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
}

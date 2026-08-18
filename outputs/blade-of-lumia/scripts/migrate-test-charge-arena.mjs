// test_mechanics[42,0] `charge_boar` を作る／更新する
// （キーは tests/test-stage-keys.js から引く＝座標を直書きしない）
// （2026-08-18 / Phase 5.5k k-9「直線突進＋壁で気絶（#14 突進猪）」の検証ステージ）。
//
// 突進猪（`dash:{ windupMs, speed, maxCells, alignTol, hitRange, minRange, maxRange,
//                 stunMs, cooldownMs }`）＝
//   idle → （プレイヤーが行/列に入る）→ windup（溜め・殴れる）→ run（高速直進）→
//   ① 接触＝体当たりのダメージ（気絶しない） ② 地形に激突＝stunMs の気絶（反撃の窓）
//   ③ maxCells 走り切る＝空振り、のいずれか → recover（硬直）。
//   測るのは「①と②の作り分け」＝**助走路とその先の壁**が1枚に収まっていれば足りる
//   （1体だけの単独機構∴1枚）。
//
// 自己検査（書き込み前に assert）:
//   1. 形（10×12）／外周は壁。ただし**左右の通路（rows 7/8・tests/test-arena-doors.js）は床**
//      ＝隣のアリーナへ歩いて移動できる（2026-08-16 ユーザー指摘）
//   2. 内部は「素の床」＋**宣言した例外セル（holes）だけ**＝遮蔽ゼロ（holes は空）
//   3. 敵はちょうど1体・期待したタイル・内部にいる
//   4. その敵の ENEMY_META が検証したい機構を実際に持っている（dash の数値と体当たり）
//   5. enemyDirs のキー集合が盤面の敵セルと一致
//   6. 敵の4近傍がすべて床（気絶を殴りに回り込める＝GUIDE §3-2）
//   7. ★ probe は**敵と同じ行**・敵との距離が dash.minRange〜maxRange の内側
//      ＝立っているだけで突進が始まる（`slam` の間合いに入る前に突進が起きる）
//   8. ★ **助走路が一直線に床**＝敵と probe の間に遮蔽が無い（途中の壁で止まると
//      「壁で気絶」が probe に着く前に起きて①と②を作り分けられない）
//   9. ★ **probe の先（突進の続き）が外壁**かつ dash.maxCells がそこへ届く長さ
//      ＝「軸から1セル外れれば壁に激突して気絶する」を同じ盤面で測れる
//      （maxCells が短いと③走り切りで止まる＝気絶が観測できない）
//  10. ★ probe の**真北/真南が内部の床**＝プレイヤーが軸から1セル外れる余地がある
//      （避けられない盤面では「避ければ壁に当たる」を測れない）
//  11. dash の時間値は **TICK_MS(120) の整数倍**＝相が切り替わる tick が揺れない
//  12. 溜めは 2 tick 以上（見て避けられる）／気絶は溜めより長い（＝反撃の窓になる）
//  13. dash.minRange > 体当たりの到達距離（SLAM_RANGE）＝突進と体当たりの間合いが重ならない
//      （同じ距離で両方の予告が立つと「どちらを避けたのか」が読めない）
//  14. dash.alignTol が 1 未満＝**1セル横にずれれば突進が始まらない**（避け方の保証）
//      かつ dash.hitRange が「重なり禁止での最接近 1.0」以上＝突進が素通りしない
//  15. 突進は歩きより速く（speed > meta.speed）、歩きは鈍足（GUIDE §7-2）
//  16. ステージキーは tests/test-stage-keys.js の表から引く（座標を直書きしない）
//  17. 既存ステージを上書きする場合、同名の用途にしか使われていない（他を踏み潰さない）
//
// 使い方:
//   node scripts/migrate-test-charge-arena.mjs --dry
//   node scripts/migrate-test-charge-arena.mjs

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_SLOW } from '../shared/enemies.js';
import { TICK_MS, SLAM_RANGE } from '../game/constants.js';
import { TEST_LAYER, stageKey } from '../tests/test-stage-keys.js';
import { openArenaDoors, isArenaDoor, ARENA_DOOR_ROWS } from '../tests/test-arena-doors.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const ROWS = 10, COLS = 12;

// 遮蔽ゼロの開けた 10×12（k-3〜k-8 の検証ステージと同じ寸法・同じ敵位置 (4,9)）。
// プレイヤーは save 注入（?row=&col=）で置く。
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
		name: 'charge_boar',
		tile: TILE.CHARGE_BOAR,
		board: OPEN_BOARD(TILE.CHARGE_BOAR),
		enemyDirs: { '4,9': 'left' },
		holes: {},
		// 計測に使う立ち位置＝敵と同じ行の西端。助走路（col 8〜1）とその先の西の外壁が
		// 同じ盤面に収まる（検査 7〜10）。
		probe: [4, 1],
		requires: (m) => m.dash?.windupMs > 0 && m.dash.speed > 0 && m.dash.maxCells > 0
			&& m.dash.alignTol > 0 && m.dash.hitRange > 0
			&& m.dash.minRange > 0 && m.dash.maxRange > m.dash.minRange
			&& m.dash.stunMs > 0 && m.dash.cooldownMs > 0
			&& (m.attacks ?? (m.attack ? [m.attack] : [])).some(a => a.type === 'charge'),
		requiresLabel: 'dash = { windupMs, speed, maxCells, alignTol, hitRange, minRange, maxRange,'
			+ " stunMs, cooldownMs } ＋ attack = { type:'charge' }",
		comment:
			'[charge_boar] Phase 5.5k k-9 突進猪の「直線突進＋壁で気絶」の検証ステージ（2026-08-18）。'
			+ '幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの通路**（歩いて敵を見比べる'
			+ 'ため・塞がない）・内部は全面床＝**遮蔽ゼロ**。突進猪1体(4,9)・向き left。'
			+ 'プレイヤーは save 注入で置く：(4,1)＝**敵と同じ行の西端**・dist 8.0'
			+ '（突進が始まる間合い 2.0〜9.0 の内側／体当たりの間合い 1.5 の外側）。'
			+ '⚠️ この立ち位置は「助走路（列8〜1が一直線に床）」と「その先の西の外壁」を'
			+ '同じ盤面に収めるためのもの＝**立っていれば轢かれる／1セル南北へ外れれば'
			+ '壁に激突して気絶する**の両方を1枚で測れる。probe を敵に近づけると'
			+ '突進の最短間合い（2.0）の内側に入り、体当たり（slam）の検証に化ける。'
			+ '見るもの＝行/列に入られると 0.36秒の溜め（前後に細かく揺れる＝`.dash-windup`）'
			+ '→1.5セル/tick で一直線に突進→当たれば体当たりのダメージ（気絶しない）／'
			+ '外して壁に当たると 1.44秒（12 tick）気絶（⭐が出る＝殴り放題の窓）→1.2秒の硬直。'
			+ '歩きは鈍足（0.25）∴走って距離を取れる＝速いのは予告付きの突進の窓だけ。'
			+ '弱点は無し（気絶させたときだけが弱点）。',
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
	// 左右の通路（rows 7/8）を開ける＝隣のアリーナへ歩いて移動できる。
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

	// 6. 敵の4近傍がすべて床（気絶を殴りに回り込める）
	for (const [d, [dr, dc]] of Object.entries(DIR_DELTA)) {
		const t = grid[er + dr]?.[ec + dc];
		if (t !== TILE.FLOOR) {
			throw new Error(`${name}: 敵(${er},${ec}) の ${d} 側(${er + dr},${ec + dc}) が床でない: '${t}'`
				+ '（気絶した敵を殴りに回り込む余地が要る）');
		}
	}

	const [pr, pc] = probe;
	const dash = meta.dash;

	// 7. probe は床・敵と同じ行・突進が始まる間合いの内側
	if (grid[pr]?.[pc] !== TILE.FLOOR) throw new Error(`${name}: probe(${pr},${pc}) が床でない: '${grid[pr]?.[pc]}'`);
	if (pr !== er) throw new Error(`${name}: probe(${pr},${pc}) が敵(${er},${ec}) と同じ行でない`
		+ '＝行/列に入っていない＝突進が始まらない');
	const dist = Math.abs(pc - ec);
	if (dist < dash.minRange || dist > dash.maxRange) {
		throw new Error(`${name}: probe の距離 ${dist} が突進の間合い [${dash.minRange}, ${dash.maxRange}] の外`
			+ '＝立っていても突進が始まらない');
	}

	// 8. 助走路が一直線に床（敵と probe の間に遮蔽が無い）
	const stepDir = Math.sign(pc - ec);
	for (let c = ec + stepDir; c !== pc; c += stepDir) {
		if (grid[pr][c] !== TILE.FLOOR) {
			throw new Error(`${name}: 助走路(${pr},${c}) が床でない: '${grid[pr][c]}'`
				+ '＝probe に着く前に壁で気絶する＝「当たる」と「壁で気絶」を作り分けられない');
		}
	}

	// 9. probe の先が外壁で、maxCells がそこへ届く
	const wallCol = pc + stepDir;
	if (grid[pr]?.[wallCol] !== TILE.WALL) {
		throw new Error(`${name}: probe(${pr},${pc}) の先(${pr},${wallCol}) が壁でない: '${grid[pr]?.[wallCol]}'`
			+ '＝軸から外れても激突する壁が無い＝気絶を測れない');
	}
	const runCells = Math.abs(pc - ec);   // 敵→probe の距離＝壁に触れるまで走る距離
	if (!(dash.maxCells > runCells)) {
		throw new Error(`${name}: dash.maxCells=${dash.maxCells} が助走路 ${runCells} セルを走り切れない`
			+ '＝壁の手前で力尽きる（③空振り）＝気絶が観測できない');
	}

	// 10. probe の真北/真南が内部の床（軸から1セル外れる余地）
	for (const [label, dr] of [['北', -1], ['南', 1]]) {
		const t = grid[pr + dr]?.[pc];
		const inside = pr + dr > 0 && pr + dr < ROWS - 1;
		if (!inside || t !== TILE.FLOOR) {
			throw new Error(`${name}: probe(${pr},${pc}) の${label}(${pr + dr},${pc}) が内部の床でない: '${t}'`
				+ '＝軸から1セル外れられない＝「避ければ壁に激突する」を測れない');
		}
	}

	// 11. dash の時間値は TICK_MS の整数倍
	const multipleOfTick = (v) => Number.isInteger(v / TICK_MS);
	for (const k of ['windupMs', 'stunMs', 'cooldownMs']) {
		if (!multipleOfTick(dash[k])) {
			throw new Error(`${name}: dash.${k}=${dash[k]} が TICK_MS(${TICK_MS}) の整数倍でない`
				+ '＝相が切り替わる tick が揺れて境界を測れない');
		}
	}

	// 12. 溜めは 2 tick 以上／気絶は溜めより長い
	const windupTicks = dash.windupMs / TICK_MS;
	if (windupTicks < 2) {
		throw new Error(`${name}: 溜めが ${windupTicks} tick＝見て軸から外れる余裕が無い（予告になっていない）`);
	}
	if (!(dash.stunMs > dash.windupMs)) {
		throw new Error(`${name}: 気絶 ${dash.stunMs}ms <= 溜め ${dash.windupMs}ms`
			+ '＝壁に当てても反撃の窓にならない（好機の割に合わない）');
	}

	// 13. 突進と体当たりの間合いが重ならない
	const slamRange = (meta.attack?.range ?? SLAM_RANGE);
	if (!(dash.minRange > slamRange)) {
		throw new Error(`${name}: dash.minRange=${dash.minRange} <= 体当たりの到達距離 ${slamRange}`
			+ '＝同じ距離で予告が2種類立つ＝どちらを避けたのか読めない');
	}

	// 14. 避け方の保証（1セル外れれば始まらない）と、突進が素通りしないこと
	if (!(dash.alignTol < 1)) {
		throw new Error(`${name}: dash.alignTol=${dash.alignTol} >= 1＝1セル横にずれても突進が始まる`
			+ '＝軸から外れる避け方が成立しない');
	}
	if (!(dash.hitRange >= 1)) {
		throw new Error(`${name}: dash.hitRange=${dash.hitRange} < 1＝重なり禁止での最接近（1.0）に届かない`
			+ '＝突進がプレイヤーを素通りする');
	}

	// 15. 突進は歩きより速い／歩きは鈍足（GUIDE §7-2）
	if (!(dash.speed > meta.speed)) {
		throw new Error(`${name}: dash.speed=${dash.speed} <= 歩き ${meta.speed}＝突進が速くない`);
	}
	if (meta.speed > ENEMY_SPEED_SLOW) {
		throw new Error(`${name}: 歩きが ${meta.speed}（鈍足 ${ENEMY_SPEED_SLOW} 超）`
			+ '＝走って距離を取れない＝突進の予告を見て逃げる遊びが成立しない');
	}

	prepared.push({
		...st, grid, key: stageKey(name), enemyCell: [er, ec],
		dir: enemyDirs[enemyCells[0]], dist, runCells, wallCol,
	});
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
	const stage = {
		comment: p.comment,
		tiles: p.grid,
		bgTiles: existing?.bgTiles ?? {},
		links: existing?.links ?? [],
		enemyDirs: { ...p.enemyDirs },
		rows: ROWS,
		cols: COLS,
	};
	layer.stages[p.key] = stage;
	const meta = ENEMY_META[p.tile];
	console.log(`# ${TEST_LAYER}[${p.key}] = ${p.name}（${existing ? '更新' : '新規'}）`);
	for (const [i, row] of p.grid.entries()) console.log(`   ${String(i).padStart(2)} ${row.join('')}`);
	console.log(`# ${meta.name} 1 体 (${p.enemyCell.join(',')}) 向き=${p.dir}`
		+ ` / probe (${p.probe.join(',')}) dist ${p.dist}（突進の間合い ${meta.dash.minRange}〜${meta.dash.maxRange} の内側）`
		+ ` / 助走路 ${p.runCells} セル → 壁 (${p.probe[0]},${p.wallCol})（maxCells ${meta.dash.maxCells} で届く）`
		+ ` / 歩き ${meta.speed}・突進 ${meta.dash.speed}（セル/tick）`
		+ ` / dash ${JSON.stringify(meta.dash)}`
		+ (Object.keys(p.holes ?? {}).length ? ` / 宣言した例外セル ${Object.keys(p.holes).join(' ')}` : ' / 遮蔽ゼロ'));
}

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
}

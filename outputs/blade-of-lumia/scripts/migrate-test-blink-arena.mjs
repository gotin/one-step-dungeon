// test_mechanics[41,0] `sorcerer` を作る／更新する
// （キーは tests/test-stage-keys.js から引く＝座標を直書きしない）
// （2026-08-18 / Phase 5.5k k-8「瞬間移動（#5 術士）」の検証ステージ）。
//
// 術士（`blink:{ shownMs, goneMs, castDelayMs, range, style }`）＝
//   姿がある(shown) → 消える(gone・無敵) → プレイヤーから range セル離れたカーディナルの
//   セルへ跳んで再出現 → castDelayMs の詠唱 → 魔弾1発、の3拍。
//   歩かない（speed 0）∴**移動手段は瞬間移動だけ**＝「寄って来る」を測る敵ではない。
//   測るのは「拍」と「出現先」＝1枚の遮蔽ゼロの盤面で足りる（1体だけの単独機構∴1枚）。
//
// 自己検査（書き込み前に assert）:
//   1. 形（10×12）／外周は壁。ただし**左右の通路（rows 7/8・tests/test-arena-doors.js）は床**
//      ＝隣のアリーナへ歩いて移動できる（2026-08-16 ユーザー指摘）
//   2. 内部は「素の床」＋**宣言した例外セル（holes）だけ**＝遮蔽ゼロ（holes は空）
//   3. 敵はちょうど1体・期待したタイル・内部にいる
//   4. その敵の ENEMY_META が検証したい機構を実際に持っている（blink の数値と魔弾の型）
//   5. enemyDirs のキー集合が盤面の敵セルと一致
//   6. 敵の4近傍がすべて床（出現先が敵の初期セル周りで潰れない）
//   7. ★ **probe から距離 blink.range の4方位セルがすべて内部の床**
//      ＝出現先の抽選が地形で潰れない。これが崩れると「4方位のどこかに出た」のか
//      「壁だから出られなかった」のか区別できない＝出現先のテストの歯が抜ける
//      （❌失効：当初は「北→東→南→西の固定巡回」と書いていた。k-8c／2026-08-18 の
//        ユーザー指摘で **直前と同じ方角を除いた乱択**（enemy-ai.js pickBlinkCell）に変えた）
//   8. probe（プレイヤーを save 注入する立ち位置）は床・**敵と同じ行**（一直線＝魔弾が届く）
//      かつ敵との距離が attack.minRange〜attack.range の内側
//      ＝**出現する前（置いた場所）からも1発撃つ**ことが同じ盤面で測れる
//      ⚠️ この敵は歩かない∴「隣まで詰めるのに要る tick」の見積り（k-3〜k-7 の検査 8）は
//         意味を持たない（速度 0 で割ると Infinity になる）。代わりに射程で測る。
//   9. blink の時間値は **TICK_MS(120) の整数倍**＝論理時間の観測 tick が揺れない
//  10. castDelayMs < shownMs（詠唱が「姿のある窓」に収まる）／goneMs > 0（消える窓がある）
//  11. **castDelayMs + attack.cooldown > shownMs**＝1回の出現で撃つのは1発だけ
//      ＝拍が読める（2発目が同じ出現の中に入ると「出現1回＝1発」を測れない）
//  12. speed 0＝歩かない（歩く敵にすると瞬間移動が「ワープする追跡者」になって
//      GUIDE §7-2「敵はプレイヤーより遅い」の逃げ道が消える）
//  13. attack.minRange <= blink.range <= attack.range
//      ＝出現した瞬間に必ず魔弾が届く（近すぎて撃たない・遠すぎて届かないが起きない）
//  14. ステージキーは tests/test-stage-keys.js の表から引く（座標を直書きしない）
//  15. 既存ステージを上書きする場合、同名の用途にしか使われていない（他を踏み潰さない）
//
// 使い方:
//   node scripts/migrate-test-blink-arena.mjs --dry
//   node scripts/migrate-test-blink-arena.mjs

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TICK_MS } from '../game/constants.js';
import { TEST_LAYER, stageKey } from '../tests/test-stage-keys.js';
import { openArenaDoors, isArenaDoor, ARENA_DOOR_ROWS } from '../tests/test-arena-doors.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const ROWS = 10, COLS = 12;

// 遮蔽ゼロの開けた 10×12（k-3〜k-7 の検証ステージと同じ寸法・同じ敵位置 (4,9)）。
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
// 出現先の候補（enemy-ai.js BLINK_DIRS と同じ4方位。**順番に意味はない**＝実装は
// 直前と同じ方角を除いた乱択＝pickBlinkCell。ここでは「4方位すべてが床か」を見るだけ）。
const BLINK_DIRS = [[-1, 0, '北'], [0, 1, '東'], [1, 0, '南'], [0, -1, '西']];

const STAGES = [
	{
		name: 'sorcerer',
		tile: TILE.SORCERER,
		board: OPEN_BOARD(TILE.SORCERER),
		enemyDirs: { '4,9': 'left' },
		holes: {},
		// 計測に使う立ち位置。四方すべてに「距離 3（blink.range）の内部の床」がある
		// ＝出現先の抽選が地形で潰れない（検査 7）。
		probe: [4, 5],
		requires: (m) => m.blink?.shownMs > 0 && m.blink.goneMs > 0
			&& m.blink.castDelayMs > 0 && m.blink.range > 0
			// ❌失効：k-8c（2026-08-18）で術士の攻撃は 'stone' から専用の 'magicBolt' になった
			// （enemy-ai.js は stone と同じ分岐で撃つ・絵と色だけ違う）。'stone' のまま
			// 要求していると**このスクリプトが二度と走らない**（実際に起きた）。
			&& m.attack?.type === 'magicBolt' && m.attack.cooldown > 0
			&& m.attack.range > 0 && m.attack.minRange > 0,
		requiresLabel: "blink = { shownMs, goneMs, castDelayMs, range } ＋ attack = { type:'magicBolt', range, minRange, cooldown }",
		comment:
			'[sorcerer] Phase 5.5k k-8 術士の「瞬間移動して撃つ」の検証ステージ（2026-08-18）。'
			+ '幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの通路**（歩いて敵を見比べる'
			+ 'ため・塞がない）・内部は全面床＝**遮蔽ゼロ**。術士1体(4,9)・向き left。'
			+ 'プレイヤーは save 注入で置く：(4,5)＝同じ行・dist 4.0（魔弾の射程 6.5 の内側・'
			+ '最短射程 2.0 の外側）∴**置いた場所からも1発撃つ**。'
			+ '⚠️ probe(4,5) は**四方すべてに「距離 3（blink.range）の内部の床」がある**立ち位置'
			+ '＝出現先の候補（北(1,5)/東(4,8)/南(7,5)/西(4,2)）が地形で潰れない。'
			+ '出現先は**直前と同じ方角を除いた乱択**（固定巡回ではない）∴'
			+ 'probe を動かすと「4方位のどこかに出た」のか「壁で出られなかった」のか区別できなくなる。'
			+ '⚠️ この敵は**歩かない**（speed 0）＝寄って来ない・追いかけても間合いは詰まらない'
			+ '（移動手段は瞬間移動だけ）。'
			+ '見るもの＝1.44秒 姿を見せ（この間だけ殴れる／魔弾を撃つ）→0.72秒 消えて'
			+ '**無敵**（消えた場所に回る魔法陣が残る＝`.hiding.hide-warp`）→プレイヤーから'
			+ '3セル離れた四方のどこかに再出現→0.36秒の詠唱（動かない・撃たない）→魔弾1発。'
			+ '弱点は弓（×2）＝消える前に落とす遊び。',
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

	// 6. 敵の4近傍がすべて床
	for (const [d, [dr, dc]] of Object.entries(DIR_DELTA)) {
		const t = grid[er + dr]?.[ec + dc];
		if (t !== TILE.FLOOR) {
			throw new Error(`${name}: 敵(${er},${ec}) の ${d} 側(${er + dr},${ec + dc}) が床でない: '${t}'`
				+ '（瞬間移動の検証でも敵の周囲に余裕が無いと立ち位置を変えられない）');
		}
	}

	const [pr, pc] = probe;
	const blink = meta.blink;
	const atk   = meta.attack;

	// 7. ★ probe から距離 blink.range の4方位セルがすべて内部の床（出現先の抽選の歯）
	const dests = [];
	for (const [dr, dc, label] of BLINK_DIRS) {
		const ny = pr + dr * blink.range, nx = pc + dc * blink.range;
		const t = grid[ny]?.[nx];
		const inside = ny > 0 && ny < ROWS - 1 && nx > 0 && nx < COLS - 1;
		if (!inside || t !== TILE.FLOOR) {
			throw new Error(`${name}: probe(${pr},${pc}) の${label}側 距離 ${blink.range} のセル(${ny},${nx}) が`
				+ `内部の床でない: '${t}'＝出現先の抽選が地形で潰れる`
				+ '（「4方位のどこかに出た」のか「壁で出られなかった」のか区別できない）');
		}
		dests.push(`${label}(${ny},${nx})`);
	}

	// 8. probe は床・敵と同じ行・敵との距離が魔弾の射程の内側
	if (grid[pr]?.[pc] !== TILE.FLOOR) throw new Error(`${name}: probe(${pr},${pc}) が床でない: '${grid[pr]?.[pc]}'`);
	if (pr !== er) throw new Error(`${name}: probe(${pr},${pc}) が敵(${er},${ec}) と同じ行でない`
		+ '＝一直線に並ばない（魔弾の飛翔 tick が斜めで揺れる）');
	const dist = Math.abs(pc - ec);
	if (dist > atk.range || dist < atk.minRange) {
		throw new Error(`${name}: probe の距離 ${dist} が魔弾の射程 [${atk.minRange}, ${atk.range}] の外`
			+ '＝置いた場所からの1発目を測れない');
	}

	// 9. blink の時間値は TICK_MS の整数倍
	const multipleOfTick = (v) => Number.isInteger(v / TICK_MS);
	for (const k of ['shownMs', 'goneMs', 'castDelayMs']) {
		if (!multipleOfTick(blink[k])) {
			throw new Error(`${name}: blink.${k}=${blink[k]} が TICK_MS(${TICK_MS}) の整数倍でない`
				+ '＝相が切り替わる tick が揺れて境界を測れない');
		}
	}
	if (!multipleOfTick(atk.cooldown)) {
		throw new Error(`${name}: attack.cooldown=${atk.cooldown} が TICK_MS(${TICK_MS}) の整数倍でない`);
	}

	// 10. 詠唱が「姿のある窓」に収まる／消える窓がある
	if (!(blink.castDelayMs < blink.shownMs)) {
		throw new Error(`${name}: castDelayMs(${blink.castDelayMs}) >= shownMs(${blink.shownMs})`
			+ '＝詠唱が終わる前に消える＝魔弾が一度も出ない');
	}
	if (!(blink.goneMs > 0)) throw new Error(`${name}: goneMs が 0 以下＝消える窓が無い`);

	// 11. 1回の出現で撃つのは1発だけ
	if (!(blink.castDelayMs + atk.cooldown > blink.shownMs)) {
		throw new Error(`${name}: castDelayMs(${blink.castDelayMs}) + cooldown(${atk.cooldown})`
			+ ` <= shownMs(${blink.shownMs})＝1回の出現で2発以上撃つ＝「出現1回＝1発」の拍が読めない`);
	}

	// 12. 歩かない
	if (meta.speed !== 0) {
		throw new Error(`${name}: ${meta.name} の speed が ${meta.speed}＝歩いてしまう`
			+ '（瞬間移動が「ワープする追跡者」になり、走って距離を取る答えが消える）');
	}

	// 13. 出現した瞬間に魔弾が必ず届く
	if (blink.range < atk.minRange || blink.range > atk.range) {
		throw new Error(`${name}: blink.range=${blink.range} が魔弾の射程 [${atk.minRange}, ${atk.range}] の外`
			+ '＝出現しても撃たない（近すぎ）／届かない（遠すぎ）回が出る');
	}

	prepared.push({ ...st, grid, key: stageKey(name), enemyCell: [er, ec], dir: enemyDirs[enemyCells[0]], dist, dests });
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
		+ ` / probe (${p.probe.join(',')}) dist ${p.dist}（魔弾の射程 ${meta.attack.minRange}〜${meta.attack.range} の内側）`
		+ ` / speed ${meta.speed}（歩かない）`
		+ ` / blink ${JSON.stringify(meta.blink)}`
		+ ` / 出現先の候補（乱択） ${p.dests.join(' / ')}`
		+ (Object.keys(p.holes ?? {}).length ? ` / 宣言した例外セル ${Object.keys(p.holes).join(' ')}` : ' / 遮蔽ゼロ'));
}

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
}

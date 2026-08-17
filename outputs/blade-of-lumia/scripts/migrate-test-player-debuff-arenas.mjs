// test_mechanics[39,0] `curse_fire` / [40,0] `poison_leech` を作る／更新する
// （キーは tests/test-stage-keys.js から引く＝座標を直書きしない）
// （2026-08-17 / Phase 5.5k k-7「プレイヤー側の一時デバフ窓」の検証ステージ）。
//
// 2体を1枚に混ぜない＝どの機構が壊れたのか混ざらない（k-3/k-4/k-5/k-6 と同じ作法）。
//   curse_fire   … 呪い火（`inflict:{ type:'sealSword' }`）。触れると数秒 剣が封じられる。
//                  ダメージは最小（atk 1）＝**接触の痛みではなく手を1つ奪うのが機構**。
//                  内部は全面床＝遮蔽ゼロ。ただし**看板 `i` を1枚だけ置く**
//                  （宣言した例外セル）＝「封印中でも看板は読める」を同じ盤面で測る
//                  ＝封印ゲートを swordAttack のどこに入れたかを固定する歯。
//   poison_leech … 毒沼ヒル（`inflict:{ type:'poison' }`）。接触で毒＝tickMs ごとに
//                  刻み、1刻みごとに decay だけ弱まる。鈍足（SLOW）∴遮蔽ゼロの
//                  全面床で「触れる／離れて毒だけ受ける」を測る。
//
// 自己検査（書き込み前に assert）:
//   1. 形（10×12）／外周は壁。ただし**左右の通路（rows 7/8・tests/test-arena-doors.js）は床**
//      ＝隣のアリーナへ歩いて移動できる（2026-08-16 ユーザー指摘）
//   2. 内部は「素の床」＋**宣言した例外セル（holes）だけ**＝宣言していない障害物を書かない
//   3. 敵はちょうど1体・期待したタイル・内部にいる
//   4. その敵の ENEMY_META が検証したい機構を実際に持っている（inflict の型と数値）
//      ＝機構の無いステージを書かない
//   5. enemyDirs のキー集合が盤面の敵セルと一致
//   6. 敵の4近傍がすべて床（回り込み・逃げる向きが地形で潰れない）
//   7. **デバフは接触で入る**＝この2体は遠隔攻撃を持たない（attack.type==='charge'）。
//      持っていたら「接触せずにデバフが入った」ように見えて測定が濁る
//   8. probe（プレイヤーを save 注入する立ち位置）は床・**敵と同じ行**（直線で寄って来る）
//      かつ「隣（dist 1.0）まで詰めるのに要る tick の見積り」が予算内＝テストが巨大な
//      step 数を要らない。
//      ⚠️ **「接触まで」ではない。**敵はプレイヤーの占有セルへは入れない
//      （passable.js isPassableForEnemy）∴自力で詰められる限界は dist 1.0 で、
//      接触箱（enemyPointHit の 0.9）には**永久に入らない**。接触はプレイヤーが
//      踏み込んで作る（テスト側で `p.x = e.x; p.y = e.y` と重ねる）。
//      見積り＝(dist - 1.0) / (MOVE_STEP × 敵の速度)。敵は accum が 1.0 に達した tick に
//      だけ MOVE_STEP(0.5) セル動く∴1 tick あたりの前進は 0.5 × speed セル
//      （実測：呪い火 dist 5.0・速度 0.5 で 16 tick で隣に着いてそこで止まる）
//   9. デバフの時間値は **TICK_MS(120) の整数倍**＝論理時間の観測 tick が揺れない
//      （毒は tickMs も ms も整数倍・かつ ms は tickMs の整数倍＝刻む回数が割り切れる）
//  10. 毒の1刻み目は **接触無敵（INVINCIBLE_MS=1500）の内側で来る**＝
//      「毒は無敵窓を貫通する」の歯が幾何/数値の側で保証される
//      （tickMs >= INVINCIBLE_MS だと貫通を潰しても赤くならない）
//  11. 呪い火のアリーナ＝看板が probe の真南にあり signData に本文がある
//      （`i` タイルは本文が無いと無言の看板になる＝読めたことを測れない）
//  12. ステージキーは tests/test-stage-keys.js の表から引く（座標を直書きしない）
//  13. 既存ステージを上書きする場合、同名の用途にしか使われていない（他を踏み潰さない）
//
// 使い方:
//   node scripts/migrate-test-player-debuff-arenas.mjs --dry
//   node scripts/migrate-test-player-debuff-arenas.mjs

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TICK_MS, INVINCIBLE_MS, MOVE_STEP } from '../game/constants.js';
import { TEST_LAYER, stageKey } from '../tests/test-stage-keys.js';
import { openArenaDoors, isArenaDoor, ARENA_DOOR_ROWS } from '../tests/test-arena-doors.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const ROWS = 10, COLS = 12;

// 遮蔽ゼロの開けた 10×12（k-3〜k-6 の検証ステージと同じ寸法・同じ敵位置 (4,9)）。
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

// 呪い火の盤面＝開けた床に**看板(5,4)を1枚だけ**足したもの（probe(4,4) の真南）。
const CURSE_BOARD = (enemyTile) => {
	const rows = OPEN_BOARD(enemyTile);
	rows[5] = `#...${TILE.SIGN}......#`;
	return rows;
};

const DIR_DELTA = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] };

const SIGN_LINES = ['ここに触れるものは', '剣を忘れる'];

const STAGES = [
	{
		name: 'curse_fire',
		tile: TILE.CURSE_FIRE,
		board: CURSE_BOARD(TILE.CURSE_FIRE),
		enemyDirs: { '4,9': 'left' },
		// 宣言した例外セル＝ここに書いたセルだけ床以外を許す（検査 2）。
		holes: { '5,4': TILE.SIGN },
		// 計測に使う立ち位置（プレイヤーを save 注入する場所）。
		probe: [4, 4],
		// 「封印中でも読める」を測る看板（検査 11）。probe の真南に置く。
		sign: [5, 4],
		signData: { '5,4': { name: '呪いの碑', lines: SIGN_LINES } },
		requires: (m) => m.inflict?.type === 'sealSword' && m.inflict.ms > 0,
		requiresLabel: "inflict = { type:'sealSword', ms }",
		comment:
			'[curse_fire] Phase 5.5k k-7 呪い火の「触れると数秒 剣が封じられる」の検証ステージ'
			+ '（2026-08-17）。幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの通路**'
			+ '（歩いて敵を見比べるため・塞がない）・内部は全面床＝**遮蔽ゼロ**。'
			+ '⚠️ ただし**看板 `i`(5,4) を1枚だけ置いている**＝probe(4,4) の真南＝下を向いて'
			+ '調べられる位置。理由＝剣封じは `swordAttack` の「剣が必要な操作」より後・'
			+ 'NPC/店/看板の分岐より前に入れてある（封印中も会話と看板は通る）∴その位置を'
			+ '固定する歯がこの看板。⚠️ 看板を消すと「封印中は看板も読めない」実装に戻っても'
			+ '赤くならない。呪い火1体(4,9)・向き left（`move:'
			+ "'air'` ＝水/溶岩/空を越える飛行）。"
			+ 'プレイヤーは save 注入で置く：(4,4)＝同じ行・dist 5（16 tick で隣まで寄って来る）。'
			+ '⚠️ 敵は隣（dist 1.0）で止まる＝**接触はプレイヤーが踏み込んで作る**'
			+ '（自力ではプレイヤーの占有セルへ入れない）。'
			+ '見るもの＝触れた瞬間に「剣が封じられた！」＋プレイヤーに `.sealed`（紫の輪）が付く／'
			+ '封印中は剣が振れない・チャージも始まらない（溜め中に封じられたら中断される）／'
			+ '**弓/爆弾/ブーメランは使える**（妨害特化＝サブ武器で処理する敵）／'
			+ '看板は封印中でも読める／窓が切れると「剣の封印が解けた」。',
	},
	{
		name: 'poison_leech',
		tile: TILE.POISON_LEECH,
		board: OPEN_BOARD(TILE.POISON_LEECH),
		enemyDirs: { '4,9': 'left' },
		holes: {},
		probe: [4, 6],
		requires: (m) => m.inflict?.type === 'poison'
			&& m.inflict.ms > 0 && m.inflict.tickMs > 0
			&& m.inflict.damage >= 1 && m.inflict.decay >= 0,
		requiresLabel: "inflict = { type:'poison', ms, tickMs, damage, decay }",
		comment:
			'[poison_leech] Phase 5.5k k-7 毒沼ヒルの「接触で継続ダメージの毒（時間で減衰）」の'
			+ '検証ステージ（2026-08-17）。幾何＝外周は壁・**左右の rows 7/8 だけ隣のアリーナへの'
			+ '通路**（塞がない）・内部は全面床＝**遮蔽ゼロ**（毒を受けてから離れて「刻みだけ'
			+ '受ける」を測る余地が要る）。毒沼ヒル1体(4,9)・向き left・速度 SLOW（鈍足）。'
			+ 'プレイヤーは save 注入で置く：(4,6)＝同じ行・dist 3（鈍足∴16 tick で隣まで寄って来る）。'
			+ '⚠️ 敵は隣（dist 1.0）で止まる＝**接触はプレイヤーが踏み込んで作る**。'
			+ '見るもの＝触れると「毒を受けた！」＋プレイヤーに `.poisoned`（緑の脈動）が付く／'
			+ '毒は tickMs ごとに刻み1刻みごとに弱まる（2→1・下限1）／**接触無敵の間も刻む**'
			+ '（毒は無敵窓を貫通する）が**毒では無敵が付かない**（毒を盾にできない）／'
			+ '離れても窓が切れるまで刻み続ける＝「後を引く」／窓が切れると「毒が抜けた」。',
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
				+ '（デバフの検証でも敵の周囲に余裕が無いと立ち位置を変えられない）');
		}
	}

	// 7. デバフは接触で入る＝遠隔攻撃を持たない
	if (meta.attack?.type !== 'charge') {
		throw new Error(`${name}: ${meta.name} が接触専門でない（attack.type='${meta.attack?.type}'）`
			+ '＝遠隔でデバフが入ったのか接触で入ったのか区別できない');
	}

	// 8. probe は床・敵と同じ行・隣まで詰めるのに要る tick の見積りが予算内
	const [pr, pc] = probe;
	if (grid[pr]?.[pc] !== TILE.FLOOR) throw new Error(`${name}: probe(${pr},${pc}) が床でない: '${grid[pr]?.[pc]}'`);
	if (pr !== er) throw new Error(`${name}: probe(${pr},${pc}) が敵(${er},${ec}) と同じ行でない`
		+ '＝直線で寄って来ない（斜めの寄り方は経路で tick が揺れる）');
	const dist = Math.abs(pc - ec);
	const ADJACENT = 1.0;                          // 敵が自力で詰められる限界（プレイヤーの占有セルへは入れない）
	const TICK_BUDGET = 40;                        // 1テストの step 数の上限（実測ではなく設計上の余裕）
	const ticksToAdjacent = Math.ceil((dist - ADJACENT) / (MOVE_STEP * meta.speed));
	if (ticksToAdjacent > TICK_BUDGET) {
		throw new Error(`${name}: probe が遠すぎる（隣まで ${ticksToAdjacent} tick > 予算 ${TICK_BUDGET}）`
			+ `＝速度 ${meta.speed} の敵には dist ${dist} は遠い`);
	}

	// 9. デバフの時間値は TICK_MS の整数倍
	const inf = meta.inflict;
	const multipleOfTick = (v) => Number.isInteger(v / TICK_MS);
	if (!multipleOfTick(inf.ms)) {
		throw new Error(`${name}: inflict.ms=${inf.ms} が TICK_MS(${TICK_MS}) の整数倍でない`
			+ '＝窓の切れる tick が揺れて境界を測れない');
	}
	if (inf.type === 'poison') {
		if (!multipleOfTick(inf.tickMs)) {
			throw new Error(`${name}: inflict.tickMs=${inf.tickMs} が TICK_MS(${TICK_MS}) の整数倍でない`);
		}
		if (!Number.isInteger(inf.ms / inf.tickMs)) {
			throw new Error(`${name}: inflict.ms=${inf.ms} が tickMs=${inf.tickMs} の整数倍でない`
				+ '＝刻む回数が割り切れず「何回刻むか」をテストで固定できない');
		}
		// 10. 毒の1刻み目が接触無敵の内側で来る＝「毒は無敵窓を貫通する」の歯
		if (inf.tickMs >= INVINCIBLE_MS) {
			throw new Error(`${name}: inflict.tickMs=${inf.tickMs} が INVINCIBLE_MS(${INVINCIBLE_MS}) 以上`
				+ '＝1刻み目が無敵の切れた後に来る∴「毒は無敵窓を貫通する」を潰しても赤くならない');
		}
	}

	// 11. 看板（呪い火のアリーナだけ）＝probe の真南・本文あり
	if (st.sign) {
		const [sr, sc] = st.sign;
		if (grid[sr]?.[sc] !== TILE.SIGN) throw new Error(`${name}: (${sr},${sc}) が看板でない`);
		if (!(sc === pc && sr === pr + 1)) {
			throw new Error(`${name}: 看板(${sr},${sc}) が probe(${pr},${pc}) の真南に無い`
				+ '＝下を向いて調べる（ArrowDown で向きだけ変える）測り方が成立しない');
		}
		const sd = st.signData?.[`${sr},${sc}`];
		if (!sd?.lines?.length) {
			throw new Error(`${name}: 看板(${sr},${sc}) の signData に本文が無い`
				+ '＝無言の看板になり「読めた」ことを測れない');
		}
	}

	prepared.push({ ...st, grid, key: stageKey(name), enemyCell: [er, ec], dir: enemyDirs[enemyCells[0]], dist, ticksToAdjacent });
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
	if (p.signData) stage.signData = { ...p.signData };
	layer.stages[p.key] = stage;
	const meta = ENEMY_META[p.tile];
	console.log(`# ${TEST_LAYER}[${p.key}] = ${p.name}（${existing ? '更新' : '新規'}）`);
	for (const [i, row] of p.grid.entries()) console.log(`   ${String(i).padStart(2)} ${row.join('')}`);
	console.log(`# ${meta.name} 1 体 (${p.enemyCell.join(',')}) 向き=${p.dir}`
		+ ` / probe (${p.probe.join(',')}) dist ${p.dist} → 隣(dist 1.0)まで約 ${p.ticksToAdjacent} tick`
		+ '（接触はプレイヤーが踏み込んで作る）'
		+ ` / speed ${meta.speed}`
		+ ` / inflict ${JSON.stringify(meta.inflict)}`
		+ (Object.keys(p.holes ?? {}).length ? ` / 宣言した例外セル ${Object.keys(p.holes).join(' ')}` : ' / 遮蔽ゼロ'));
}

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
}

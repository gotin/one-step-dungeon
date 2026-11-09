// dungeon_3 `4,1`（`4,2` の北の行き止まり・床のルピー R）：素の部屋を「渦の砂州」に作り替える
// （2026-11-04 / PLAN 実行キュー 94 の5室目＝潮の総仕上げ・設計は Opus）
//
// ■ 何が薄かったか（キュー94 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 #.....R....#     ← 床のルピー R(4,6)・敵なし・仕掛けなし
//      9 #####..#####     ← 南の口（列5-6）だけ＝行き止まり
//
// ■ 新しい `4,1`＝渦の砂州（'~'＝bgTiles の水。tiles 層では床）
//      0 ############
//      1 #~=======..#     ← 北の砂州 (1,2)〜(1,8)／中洲 (1,9)(1,10)
//      2 #~=~~~~~~E=#     ← 中洲 (2,9)＝パトロール E が居座る／東の砂州の先 (2,10)
//      3 #~=~~~~~~~=#
//      4 #~=....~~~=#     ← 北の砂州の先 (4,2)／中央の小島 (4,3)〜(5,6)
//      5 #~~...B~~~=#     ← 宝箱 (5,6)＝ルピー×50
//      6 #~~~~~~~~~=#
//      7 #~~~~..~~~=#     ← 南の岸
//      8 #~~~~..====#     ← 南の岸・南の口／東の砂州の根元 (8,7)〜(8,10)
//      9 #####..#####
//   ・**主題＝潮の総仕上げ＝1室目 `4,3`「潮 vs 敵（敵が呑まれる）」と2室目 `2,1`「潮 vs 勇者（中洲で次の引きを
//     待つ）」を1室に束ね、2室目の判定の申し送り「間に合わない！やばい！」の切迫感で締める。**
//     潮の規則と周期は 1・2室目と同じ（game/tide.js・満ち 3.6 秒 → 引き 3.0 秒＝25 tick）＝D3 の潮のリズムは1つ。
//   ・砂州は部屋を渦に巻く：南の岸 → 東の砂州（10 枚）→ 北東の中洲 → 北の砂州（10 枚）→ 中央の小島。
//     区間はどちらも 11 マス＝22 tick（勇者は 1 マス 2 tick）＝**余り 3 tick**（2室目は 9・7 tick）
//     ＝引いた瞬間に出て、立ち止まらずに歩き切らないと間に合わない。通しは 23 マス＝1回の引きでは足りない。
//   ・中洲にパトロール E×1（いつも追う＝enemyChase）。勇者が南の岸や東の砂州の下の段に居る間は、E の一歩
//     （長い軸を先に・塞がれたら短い軸）はどちらも水＝中洲から出ない。**勇者が東の砂州の角 (8,10) まで来ると、
//     E の短い軸の一歩が東の砂州の先 (2,10) になる＝E が砂州へ出てくる**（足は勇者の約 1/4）。
//     幅1の砂州ではすれ違えない＝E に道を塞がれたまま満ちれば、勇者は岸へ押し戻される（半ハート）。答えは3つ：
//       ① 誘い出す＝角で E が砂州の先 (2,10) に乗り切るのを待ってから岸へ引き返す → E は追って砂州を下り、
//          満ちて呑まれる → 次の引きで渡る（実測＝岸に戻り着くのは満ちの 3 tick 前。⚠️ E が半歩のうちに
//          引き返すと、E は中洲へ引っ込む＝呑まれない）
//       ② 射る＝縦の段 (7,10) から上を向き、E が列10 に乗った所を射る（hp 4）→ 同じ引きで中洲へ（満ちの 1 tick 前）
//       ③ 何も考えずに走る＝(3,10) で E に塞がれ、満ちて岸へ押し戻される（半ハート）。E も呑まれる＝次の引きは空く
//          （斬り抜けは間に合わない＝実測 `.scratch/q94c/probe-4-1.mjs sword`）
//   ・中洲で満ちを待ち（3.6 秒）、次の引きの瞬間に北の砂州へ出る（余り 3 tick）。
//     途中で満ちると最後に乾いた所へ押し戻されて半ハート＝**北の砂州なら中洲へ・東の砂州なら岸へ**。
//   ・疾風の靴（field `15,19`）があれば通し 23 マス＝23 tick＝1回の引きで渡れる（E が塞がなければ）。
//   ・脅威度 4.0（E×1・看板 `1,3` の 36.0 より軽い）。弓が無くても解ける（①・③）。
//   ・型を重ねない相手＝D3 `4,3`（敵は小島から砂州へ出る＝勇者は岸で待つだけ）／D3 `2,1`（敵なし・余り 9・7 tick）
//     ／D5 の水門（鐘・ボタンで潮を操る）。
//
// ■ 撤去したもの
//   床のルピー R(4,6) → 中央の小島の宝箱（ルピー×50＝潮の部屋の総仕上げの報酬）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と砂は bgTiles だけ／宝箱は小島の1つ（ルピー×50）／潮の周期は 1・2室目と同じ
//   ・砂州は links に無い／余計な仕掛けなし／敵は中洲の E×1・enemyChase・脅威度
//   ・満ちている間：南の岸・中洲・小島は互いに歩いて届かない／引いている間：全部届く
//   ・区間の長さ（余り 3 tick）と通しの長さ（1回の引きでは足りない・靴なら足りる）を BFS の歩数で測る
//   ・E の一歩：南の岸のどこに居ても水／東の砂州の角に来ると東の砂州の先
//   ・口と口の前は潮ゲートでない／砂州は幅1（区間の終わりの1枚を除く）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d3-4-1-tide-spiral.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d3-4-1-tide-spiral.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_3';
export const ROOM  = '4,1';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'############',
	'#~=======..#',
	'#~=~~~~~~E=#',
	'#~=~~~~~~~=#',
	'#~=....~~~=#',
	'#~~...B~~~=#',
	'#~~~~~~~~~=#',
	'#~~~~..~~~=#',
	'#~~~~..====#',
	'#####..#####',
];
export const TIDE_CYCLE = { highMs: 3600, lowMs: 3000, warnMs: 720 };   // 1・2室目と同じ
export const CHEST = '5,6';
export const CHEST_ITEM = { type: 'item', item: 'scroll', name: '剣技の巻物' };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
export const PATROL = '2,9';
export const MIDBAR = ['1,9', '1,10', '2,9'];                           // 中洲（乾いた床・E が居座る）
export const ISLAND = ['4,3', '4,4', '4,5', '4,6', '5,3', '5,4', '5,5', '5,6'];   // 中央の小島（宝箱つき）
export const SHORE = ['7,5', '7,6', '8,5', '8,6', '9,5', '9,6'];         // 南の岸（口つき）
export const BAR_EAST = ['8,7', '8,8', '8,9', '8,10', '7,10', '6,10', '5,10', '4,10', '3,10', '2,10'];   // 岸 → 中洲
export const BAR_NORTH = ['1,8', '1,7', '1,6', '1,5', '1,4', '1,3', '1,2', '2,2', '3,2', '4,2'];         // 中洲 → 小島
export const SHORE_STAND = '8,6';   // 東の砂州の根元（南の岸の端）
export const MID_LAND = '1,10';     // 東の砂州から上がる中洲のマス
export const MID_STAND = '1,9';     // 北の砂州の根元（中洲の端）
export const ISLAND_LAND = '4,3';   // 北の砂州から上がる小島のマス
export const BAR_CORNER = '8,10';   // ここに来ると E が砂州へ出てくる
export const MOUTH = ['9,5', '9,6', '8,5', '8,6'];
export const SAND = [...BAR_EAST, ...BAR_NORTH];
export const TICKS_PER_CELL = 2;    // 勇者＝1 tick に半マス
export const TICK_MS = 120;

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET, sand = SAND) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER) bg[key(r, c)] = TILE.WATER; }));
	for (const k of sand) bg[k] = TILE.SAND;
	return bg;
}

// 歩ける所（水と固い物は通れない・潮ゲートは tideOpen のときだけ・宝箱と敵は床扱い）→ 歩数つき
export function walk(grid, starts, { tideOpen = false } = {}) {
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		if (ch === TILE.WATER) return false;
		if (ch === TILE.TIDE_GATE) return tideOpen;
		if (ch === TILE.CHEST) return false;
		return !HARD_BLOCKED.has(ch);
	};
	const dist = new Map();
	const q = [];
	for (const k of starts) { const [r, c] = parse(k); if (ok(r, c) && !dist.has(k)) { dist.set(k, 0); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (!dist.has(k) && ok(nr, nc)) { dist.set(k, dist.get(key(r, c)) + 1); q.push([nr, nc]); }
		}
	}
	return dist;
}

// E の一歩の候補（game/enemy-ai.js enemyChase と同じ選び方＝長い軸を先に・次に短い軸。差 0 の軸は動かない）
export function chaseSteps(from, hero) {
	const [er, ec] = parse(from), [hr, hc] = parse(hero);
	const dy = hr - er, dx = hc - ec;
	const v = dy ? [Math.sign(dy), 0] : null;
	const h = dx ? [0, Math.sign(dx)] : null;
	const order = Math.abs(dy) >= Math.abs(dx) ? [v, h] : [h, v];
	return order.filter(Boolean).map(([a, b]) => key(er + a, ec + b));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2)
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=', '(', ')']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#]/g, '.') === ringOf(TARGET).replace(/[^#]/g, '.'));
	room.tiles = tilesOf();
	room.bgTiles = bgOf();
	room.chestContents = { [CHEST]: { ...CHEST_ITEM } };
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = {};
	room.links = [];
	room.enemyDirs = {};
	room.tideCycle = { ...TIDE_CYCLE };
	room.enemyChase = { [PATROL]: true };   // さまよわずに最初から追う＝角に来た勇者へ必ず砂州から出てくる
	delete room.enemyHold;
	delete room.enemiesRespawn;
	delete room.fluteEffect;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		const sand = Object.keys(bg).filter((k) => bg[k] === TILE.SAND);
		check(`bgTiles＝水 ${water.length} 枚・砂 ${sand.length} 枚（ほかの値なし・中洲と小島と岸は床のまま）`,
			water.length + sand.length === Object.keys(bg).length && sand.sort().join() === [...SAND].sort().join()
			&& [...MIDBAR, ...ISLAND, ...SHORE].every((k) => !bg[k]));
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
	}
	check(`宝箱は小島の ${CHEST} の1つだけ・中身＝${CHEST_ITEM.name}`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST && ISLAND.includes(CHEST)
		&& Object.keys(room.chestContents).join() === CHEST && JSON.stringify(room.chestContents[CHEST]) === JSON.stringify(CHEST_ITEM));
	check(`潮の周期＝満ち ${TIDE_CYCLE.highMs}ms・引き ${TIDE_CYCLE.lowMs}ms・予告 ${TIDE_CYCLE.warnMs}ms（1室目 4,3・2室目 2,1 と同じ）`,
		JSON.stringify(room.tideCycle) === JSON.stringify(TIDE_CYCLE)
		&& JSON.stringify(stages['4,3'].tideCycle) === JSON.stringify(TIDE_CYCLE)
		&& JSON.stringify(stages['2,1'].tideCycle) === JSON.stringify(TIDE_CYCLE));
	check(`潮ゲートは砂州の ${SAND.length} 枚だけ・どれも links に無い（＝潮の周期で動く）`,
		flat.filter((ch) => ch === TILE.TIDE_GATE).length === SAND.length && SAND.every((k) => at(k) === TILE.TIDE_GATE)
		&& room.links.length === 0);
	check(`石・立札・碑・ボタン・鐘・門・ルピー・床の拾い物・出現条件・笛の効き目が無い（旧 床のルピー R は撤去）`,
		![TILE.STONE, TILE.SIGN, '†', TILE.BUTTON, TILE.SWITCH, TILE.GATE, TILE.RUPEE].some((ch) => flat.includes(ch))
		&& !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !room.fluteEffect);
	{
		const mobs = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${key(r, c)}`); }));
		check(`敵はパトロール E×1（中洲 ${PATROL}）（実測 ${mobs.join(' ')}）`,
			mobs.join() === `${TILE.PATROL}@${PATROL}` && MIDBAR.includes(PATROL));
		check(`E は歩く陸の敵（飛ばない・泳がない・ボスでない）＝満ち潮で沈む側`,
			!ENEMY_META[TILE.PATROL].move && !ENEMY_META[TILE.PATROL].isBoss);
		check(`E はいつも追う（enemyChase）＝さまよわない`, JSON.stringify(room.enemyChase) === JSON.stringify({ [PATROL]: true }));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['1,3'], ENEMY_META);
		check(`脅威度 ${threat}（E 4.0）が D3 の看板部屋 1,3（${sig}）より軽い`, threat === 4 && threat < sig);
	}

	// ── ② 歩行：満ちれば3つの陸は離れ、引けばつながる。区間と通しの長さ ─────────
	{
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = grid[r][c];
			if (ch !== TILE.WATER && ch !== TILE.CHEST && !HARD_BLOCKED.has(ch)) floors.push(key(r, c));
		}
		const same = (m, arr) => [...m.keys()].sort().join() === [...arr].sort().join();
		const highS = walk(grid, ['9,5']);
		const highM = walk(grid, [MID_STAND]);
		const highI = walk(grid, [ISLAND_LAND]);
		check(`満ちている間、南の口から歩けるのは南の岸だけ（${highS.size} マス）`, same(highS, SHORE));
		check(`満ちている間、中洲はどこともつながらない（${highM.size} マス）`, same(highM, MIDBAR));
		check(`満ちている間、小島はどこともつながらない（${highI.size} マス＝宝箱を除く）`, same(highI, ISLAND.filter((k) => k !== CHEST)));
		const lowS = walk(grid, ['9,5'], { tideOpen: true });
		const stranded = floors.filter((k) => !lowS.has(k));
		check(`引いている間は床が全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

		const lowTicks = TIDE_CYCLE.lowMs / TICK_MS;
		const legE = walk(grid, [SHORE_STAND], { tideOpen: true }).get(MID_LAND);
		const legN = walk(grid, [MID_STAND], { tideOpen: true }).get(ISLAND_LAND);
		const whole = walk(grid, [SHORE_STAND], { tideOpen: true }).get(ISLAND_LAND);
		check(`東の区間（岸 ${SHORE_STAND} → 中洲 ${MID_LAND}）＝${legE} マス＝${legE * TICKS_PER_CELL} tick＝引き ${lowTicks} tick の余り ${lowTicks - legE * TICKS_PER_CELL} tick（2〜3）`,
			legE * TICKS_PER_CELL <= lowTicks && lowTicks - legE * TICKS_PER_CELL <= 3);
		check(`北の区間（中洲 ${MID_STAND} → 小島 ${ISLAND_LAND}）＝${legN} マス＝${legN * TICKS_PER_CELL} tick＝余り ${lowTicks - legN * TICKS_PER_CELL} tick（2〜3）`,
			legN * TICKS_PER_CELL <= lowTicks && lowTicks - legN * TICKS_PER_CELL <= 3);
		check(`通し（${SHORE_STAND} → ${ISLAND_LAND}）＝${whole} マス＝${whole * TICKS_PER_CELL} tick ＞ 引き ${lowTicks} tick＝1回の引きでは渡り切れない（疾風の靴なら ${whole} tick ≤ ${lowTicks}）`,
			whole * TICKS_PER_CELL > lowTicks && whole <= lowTicks);
		// 砂州は幅1＝どの砂州のマスも、陸の隣は前後の2つまで（区間の終わりの1枚 (2,10) だけは中洲の2マスに接する）
		const wide = SAND.filter((k) => {
			const [r, c] = parse(k);
			const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => {
				const ch = grid[r + dr]?.[c + dc];
				return ch && ch !== TILE.WATER && ch !== TILE.WALL;
			});
			return side.length > 2;
		});
		check(`砂州は幅1（陸の隣が3つ以上の砂州のマス＝${wide.join(' ') || 'なし'}＝東の砂州の先 2,10 だけ）`, wide.join() === '2,10');
		check(`口と口の前は潮ゲートでない（入った瞬間に押し戻されない）`, MOUTH.every((k) => at(k) !== TILE.TIDE_GATE));
	}

	// ── ③ E の一歩：岸では出てこない・東の砂州の角で出てくる ──────────────────
	{
		const notOut = [...SHORE, ...BAR_EAST.slice(0, 3)].filter((h) => {
			const steps = chaseSteps(PATROL, h);
			return steps.some((s) => at(s) !== TILE.WATER && at(s) !== TILE.WALL);
		});
		check(`勇者が南の岸か東の砂州の下の段 (8,7)〜(8,9) に居る間、E の一歩はどちらも水か壁＝中洲から出ない（例外 ${notOut.join(' ') || 'なし'}）`,
			notOut.length === 0);
		const steps = chaseSteps(PATROL, BAR_CORNER);
		check(`勇者が東の砂州の角 ${BAR_CORNER} に来ると、E の一歩が東の砂州の先 2,10（${steps.join(' → ')}）`,
			steps.includes('2,10') && steps.filter((s) => at(s) !== TILE.WATER).join() === '2,10');
		const fromMid = MIDBAR.every((k) => walk(grid, [k], { tideOpen: true }).has(ISLAND_LAND));
		check(`中洲から小島へ北の砂州で歩いて届く（E が北の砂州へ出るのは勇者が中洲より西に居るとき）`, fromMid);
	}

	// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「渦の砂州」に作り替える（キュー94 の5室目＝潮の総仕上げ）`);
	console.log(`\n## 盤面の差分（${ROOM}・水は ~ で表示）`);
	TARGET.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === tilesOf()[i].join('') ? '=' : '→'}   ${row}`);
	});
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
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

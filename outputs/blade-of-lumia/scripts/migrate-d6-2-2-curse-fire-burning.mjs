// dungeon_6 `2,2`（爆弾の櫃 `1,2` の東＝四方の辻）：薄い部屋を「呪い火の野焼き」に作り替える
// （2026-11-05 / PLAN 実行キュー 95 の3室目・主題はユーザー選択「B 呪い火の野焼き」・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 #####..#####
//      2 #..u....u..#     ← 茂み2つ
//      4 ............     ← 四方の口の十字
//      6 #..t.......#     ← 木1本
//      9 #####..#####
//   床にルピー×3 が置いてあるだけの四角い広間・敵なし。
//
// ■ 新しいルール（このスクリプトと同じ日にエンジンへ入れた）
//   **呪い火 ψ の体に縦横で接した茂みは燃える**（`shared/enemies.js` ψ の `ignitesBushes`／
//   `game/enemy-ai.js` scorchAround／`game/projectile.js` igniteBushAt）。燃え広がりはロウソクと同じ
//   ＝縦横につながった茂みへ 240ms ずつ移り、消えたかがり火に灯る（キュー93 の spreadFireFrom）。
//   ψ は飛ぶ＝水の上を越えて来る。茂み・木・壁は越えない（接した茂みは燃えて通れるようになる）。
//   最初は「ぶつかった茂みだけ燃える」で作った＝斜めに池を横切る ψ が島の角をかすめても燃えず、
//   北西の島は ψ が列3より西に居る一瞬しか通らなかった（実測）∴「接したら」に広げた。
//
// ■ 新しい `2,2`＝呪い火の野焼き
//      0 #####..#####
//      1 #Huu~..tttt#     ← 北西の池の島：かがり火 H(1,1)＋茂み5
//      2 #uuu~..tttt#
//      3 #~~~~uuBttt#     ← 宝箱 B(3,7)＝かがり火が全部灯ると現れる（torchesLit）
//      4 ....uψuu....     ← 呪い火 ψ(4,5)＝十字の真ん中の茂みの檻（茂み11）の中
//      5 ....uuuu....
//      6 #tttiuu~~~~#     ← 碑 i(6,4)
//      7 #tttt..~uuu#     ← 南東の池の島：茂み5＋かがり火 H(8,10)
//      8 #tttt..~uuH#
//      9 #####..#####
//   （`~` は bgTiles の水＝tiles は '.'）
//   ・入ると ψ に接した檻の茂みが燃える→檻が丸ごと燃える＝ルールをその場で見せる。
//     檻の茂みは島に届かない（水で隔ててある）＝燃えるのは檻だけ。
//   ・島の茂みはどれも勇者の立てる床に縦横で接していない（間に水が1マス）＝ロウソクは
//     正面1マスにしか届かない∴自分では点けられない。ブーメランで運ぶ火も無い（初めから灯った
//     かがり火が無い）。爆弾は茂みに効かない。∴**ψ に島の茂みを燃やさせる**しかない。
//   ・ψ は勇者へまっすぐ寄る（大きい方の軸を先に）＝十字の腕の先へ連れて行き、すり抜けて隣の腕の
//     先へ走る（勇者は ψ の倍の速さ）と、ψ は角を斜めに切って池の上を飛び、島の縁の茂みに接する。
//     腕の上をまっすぐ追う間は池に入らない（島の茂みは腕から1マス以上離れている）＝燃えない。
//     東の腕で待って南の腕の先へ＝南東の島／西の腕で待って北の腕の先へ＝北西の島。
//     入口に立っているだけでは ψ は腕をまっすぐ来る＝島は燃えない（`.scratch/q95/sim-2-2c.mjs`）。
//   ・ψ を斬ってしまったら部屋を出て入り直せば戻る（`enemiesRespawn`）＝詰まない。
//   ・ψ は既定ではさまよう＝家の周りの池の上を歩いて勝手に島を燃やす∴この部屋では最初から追う（`enemyChase`）。
//   ・報酬＝ルピー×30（旧 床のルピー×3）。
//   ・爆弾は使わない（爆弾の在庫の約束を食わない）。D6 の他の部屋と型が違う＝`1,1` 聖樹の火
//     （ブーメランで火を運ぶ）／`0,3` ルピー喰いの檻（爆弾）／`0,2` 猪の木立ち（敵＋地形）。
//     燃え広がりは進行順で D6 が初出（D8 `2,0` 葦の導火線が後でこれを難しくする）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水の下地／宝の中身と出る条件（torchesLit）／碑の本文／enemiesRespawn・enemyChase／外周の口の形が不変
//   ・ψ は ignitesBushes を持ち、部屋の敵は ψ 1体だけ（脅威度は看板 `2,3` より軽い）
//   ・ψ の四方は檻の茂み・檻の茂みは縦横につながった1かたまり（11）でかがり火に接しない
//   ・島は2つ＝それぞれ茂みのかたまりがかがり火1本に接する・島の茂みとかがり火はどれも
//     勇者の立てる床に縦横で接しない（ロウソクが届かない）・一方のかがり火の行と列に他方の島が無い
//   ・四方の口がつながる（茂みは剣で切れる＝通れる扱い）・床は全部届く・宝箱に届く
//   ・層の到達性が書き換え前と同じ・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-2-2-curse-fire-burning.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-2-2-curse-fire-burning.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '2,2';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（`~` は bgTiles の水）──────────────────────────────────
export const DISPLAY = [
	'#####..#####',
	'#Huu~..tttt#',
	'#uuu~..tttt#',
	'#~~~~uuBttt#',
	'....uψuu....',
	'....uuuu....',
	'#tttiuu~~~~#',
	'#tttt..~uuu#',
	'#tttt..~uuH#',
	'#####..#####',
];
export const TARGET = DISPLAY.map((row) => row.replaceAll('~', '.'));
export const WATER = [];
DISPLAY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
export const PSI   = '4,5';
export const CHEST = '3,7';
export const SIGN  = '6,4';
export const TORCH_NW = '1,1';
export const TORCH_SE = '8,10';
export const MOUTHS = {
	north: ['0,5', '0,6'], south: ['9,5', '9,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'],
};
export const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const SHOW = { [CHEST]: { trigger: 'torchesLit', message: '{{torch}} 池の 島の 火が 灯り、宝箱が 現れた！' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '呪い火の 封じ場',
		lines: [
			'森を 焼いた 呪いの 火を 此処に 封ず。',
			'火は 狙う 者へ まっすぐ 寄り、 触れた 茂みを 焼く。',
		],
	},
};

// 部屋の中だけの歩行（4近傍）。茂みは剣で切れる＝通れる扱い。敵と宝箱のセルは床とみなす。
export function reach(grid, starts, water) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		if (water.has(`${r},${c}`)) return false;
		const ch = grid[r][c];
		if (ENEMY_META[ch]) return true;
		if (ch === TILE.CHEST || ch === TILE.BUSH) return true;
		return !HARD_BLOCKED.has(ch);
	};
	for (const k of starts) {
		const [r, c] = k.split(',').map(Number);
		if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); }
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}

// 縦横につながった茂みのかたまり（燃え広がりの届く範囲）と、それが接するかがり火。
export function bushGroup(grid, start) {
	const seen = new Set([start]);
	const q = [start];
	const torches = new Set();
	while (q.length) {
		const [r, c] = q.shift().split(',').map(Number);
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			const ch = grid[nr]?.[nc];
			if (ch === TILE.TORCH) torches.add(k);
			if (ch !== TILE.BUSH || seen.has(k)) continue;
			seen.add(k); q.push(k);
		}
	}
	return { cells: seen, torches };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, DISPLAY.length === ROWS && DISPLAY.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	room.chestContents = { ...CHEST_CONTENTS };
	room.showConditions = JSON.parse(JSON.stringify(SHOW));
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	room.enemiesRespawn = true;   // ψ を斬っても入り直せば戻る＝島に火を点ける手段が消えない
	// ψ は既定でさまよう（ROAM_DEFAULT＝家から半径3・気づき4）。家 (4,5) の半径3は池の上まで届く
	// ＝さまよう ψ は勝手に島の縁を飛んで燃やす（実測＝東の口に立って 1200 tick 待つと 10回中4回で
	// どちらかの島が灯った）＝謎が乱数で解ける∴この部屋では最初から追う（勇者の後ろを離れない）。
	room.enemyChase = { [PSI]: true };

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const water = new Set(Object.keys(room.bgTiles).filter((k) => room.bgTiles[k] === TILE.WATER));
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水の下地は ${WATER.length} マス（tiles 層は床）`, water.size === WATER.length && WATER.every((k) => at(k) === TILE.FLOOR));
	check(`宝箱 ${CHEST} の中身＝ルピー×30・宝箱は1つだけ`,
		JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS)
		&& t.flat().filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST);
	check(`宝箱はかがり火が全部灯ると現れる（showConditions は ${CHEST} の torchesLit だけ）`,
		JSON.stringify(Object.keys(room.showConditions)) === JSON.stringify([CHEST]) && room.showConditions[CHEST].trigger === 'torchesLit');
	check(`かがり火は ${TORCH_NW} と ${TORCH_SE} の2本だけ`,
		t.flat().filter((ch) => ch === TILE.TORCH).length === 2 && at(TORCH_NW) === TILE.TORCH && at(TORCH_SE) === TILE.TORCH);
	check(`初めから灯ったかがり火が無い（initLitTorches なし）＝ブーメランで運ぶ火が無い`,
		!(room.initLitTorches ?? []).length);
	check(`碑 ${SIGN} に本文がある`, at(SIGN) === TILE.SIGN && room.signData[SIGN]?.lines?.length === 2);
	check(`enemiesRespawn が true`, room.enemiesRespawn === true);
	check(`床の爆弾 '5'・朽ちた根 '!' が無い・breakableWalls・floorItems が空`,
		![TILE.ITEM_BOMB, TILE.BREAKABLE_WALL].some((ch) => t.flat().includes(ch))
		&& !Object.keys(room.breakableWalls).length && !Object.keys(room.floorItems).length);

	// ── ② 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は呪い火 ψ ${PSI} の1体だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.CURSE_FIRE}@${PSI}`);
		check(`呪い火は ignitesBushes を持つ・飛ぶ（move 'air'）`,
			ENEMY_META[TILE.CURSE_FIRE].ignitesBushes === true && ENEMY_META[TILE.CURSE_FIRE].move === 'air');
		check(`この部屋の ψ は最初から追う（enemyChase）＝さまよわず見失わない`,
			JSON.stringify(room.enemyChase) === JSON.stringify({ [PSI]: true }) && !room.enemyHold?.[PSI]);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（ψ 1体＝3.0）が D6 の看板部屋 2,3（${sig}）より軽い`, threat === 3 && threat < sig);
	}

	// ── ③ 檻と島（燃え広がりの形）───────────────────────────────────────
	const mouthCells = Object.values(MOUTHS).flat();
	const walk = reach(t, mouthCells, water);
	{
		const [pr, pc] = PSI.split(',').map(Number);
		const around = [[pr - 1, pc], [pr + 1, pc], [pr, pc - 1], [pr, pc + 1]].map(([r, c]) => `${r},${c}`);
		check(`ψ の四方は茂み（檻）`, around.every((k) => at(k) === TILE.BUSH));
		const pen = bushGroup(t, around[0]);
		check(`檻の茂みは縦横につながった1かたまり（${pen.cells.size}＝11）＝1か所燃えれば檻が丸ごと燃える`,
			pen.cells.size === 11 && around.every((k) => pen.cells.has(k)));
		check(`檻の茂みはかがり火に接しない＝入口で檻が燃えても島は灯らない`, pen.torches.size === 0);

		const nw = bushGroup(t, '1,2');
		const se = bushGroup(t, '7,9');
		check(`北西の島＝茂み5のかたまりがかがり火 ${TORCH_NW} だけに接する`,
			nw.cells.size === 5 && nw.torches.size === 1 && nw.torches.has(TORCH_NW));
		check(`南東の島＝茂み5のかたまりがかがり火 ${TORCH_SE} だけに接する`,
			se.cells.size === 5 && se.torches.size === 1 && se.torches.has(TORCH_SE));
		const allBush = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.BUSH) allBush.push(`${r},${c}`); }));
		check(`茂みは檻・北西の島・南東の島の3かたまりだけ（${allBush.length}＝21）`,
			allBush.length === 21 && allBush.every((k) => pen.cells.has(k) || nw.cells.has(k) || se.cells.has(k)));

		// 勇者が立てる床＝口から歩ける（檻の茂みは燃えた後に床になる＝立てる側に数える）
		const islets = [...nw.cells, ...se.cells, TORCH_NW, TORCH_SE];
		const stand = new Set([...walk].filter((k) => !islets.includes(k)));
		const touching = islets.filter((k) => {
			const [r, c] = k.split(',').map(Number);
			return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([a, b]) => stand.has(`${a},${b}`));
		});
		check(`島の茂みとかがり火はどれも勇者の立てる床に縦横で接しない＝ロウソクが届かない（接するセル ${touching.join(' ') || 'なし'}）`,
			touching.length === 0);
		check(`島へは歩いて入れない（水で隔ててある）`, islets.every((k) => !walk.has(k)));
		// 一方のかがり火が灯っても、その行と列（ブーメランの往復の筋）に他方の島の茂みが無い
		const lineHits = (torch, cells) => {
			const [tr, tc] = torch.split(',').map(Number);
			return [...cells].filter((k) => { const [r, c] = k.split(',').map(Number); return r === tr || c === tc; });
		};
		check(`北西のかがり火の行と列に南東の島が無い・逆も同じ＝灯った火をブーメランで隣の島へ運べない`,
			lineHits(TORCH_NW, se.cells).length === 0 && lineHits(TORCH_SE, nw.cells).length === 0);
	}

	// ── ④ 歩行：通り抜けと取り残し ─────────────────────────────────────
	{
		const fromWest = reach(t, MOUTHS.west, water);
		check(`西の口から北・南・東の口へ抜けられる（檻の茂みは剣でも切れる）`,
			[...MOUTHS.north, ...MOUTHS.south, ...MOUTHS.east].every((k) => fromWest.has(k)));
		check(`宝箱 ${CHEST} に届く`, fromWest.has(CHEST));
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = t[r][c];
			if (water.has(`${r},${c}`)) continue;
			if (ch === TILE.FLOOR || ENEMY_META[ch] || ch === TILE.CHEST) floors.push(`${r},${c}`);
		}
		const stranded = floors.filter((k) => !fromWest.has(k));
		check(`床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}

	// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
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
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「呪い火の野焼き」に作り替える（キュー95 の3室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・右は水を ~ で表示）`);
	room.tiles.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${DISPLAY[i]}`);
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

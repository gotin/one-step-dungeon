// dungeon_5 `1,2`（はしごの部屋）：D4 の写しの部屋を「凍れる水路の番兵」に作り替える
// （2026-10-05 / PLAN 実行キュー 40 の第1陣 2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 #####..#####
//      1〜3 #..........#
//      4 #....B......     ← 宝箱 B(4,5)＝はしご（素で開く）・東の口（`2,2`）
//      5 #...........
//      6〜8 #..........#
//      9 #####..#####     ← 南の口（入口 `1,3`）・北の口は上（`1,1`）
//   `dungeon_4 1,2` と 4 セル差＝D5 の報酬（はしご）が、敵も仕掛けも無い箱に素で置かれていた。
//   ユーザー判定（2026-10-05）＝「はしごを取れる部屋はもう少し難しさを足した方がよさそう。
//   せめて敵を何匹かおいて全滅したらはしごの宝箱が現れるようにするとか。」
//
// ■ 新しい `1,2`＝凍れる水路の番兵（D5 の主題「水路とはしご」の本題）
//      0 #####..#####
//      1 #~~~~..~~~~#     ← 北の口へ続く細い岸 (1,5)(1,6)
//      2 #~<~~~~~~~~#     ← 水路＝部屋を東西に横切る。(2,5)(2,6) だけ厚さ1＝はしごの渡り
//      3 #~~~......~#
//      4 #....B....θ.     ← 宝箱 B(4,5)＝はしご（敵全滅で現れる）・東の口
//      5 #...........
//      6 #..#....#..#     ← 柱の残骸 2本＝水の弾の盾
//      7 #...........#
//      8 #...........#
//      9 #####..#####
//   ・水（bgTiles の `~` 22 枚）に水棲の敵が2体＝潜み鮫 `<`(2,2)・射水魚 `/`(1,9)。どちらも陸に
//     上がれないが、離れた岸へ水の弾を撃つ。陸に骸骨剣士 θ(4,10) が1体＝立ち止まって射ち合うのを許さない。
//     （脅威度 22.5＋16.0＋18.0＝56.5＝D5 の看板部屋 `2,3` の 76.0 より軽い）
//   ・3体を倒すと宝箱（はしご）が現れる（`showConditions` killAll）。水の敵は弓で岸から射るか、
//     寄ってきた所を岸から斬る（鮫は浮いている間だけ当たる）。
//   ・北の口（`1,1` へ＝ボスへの本筋）は水路の向こう。水路の厚さ1の所 (2,5)(2,6) をはしごで渡る＝
//     手に入れたはしごをその場で使う。行き先の `1,1` の石碑「凍れる湖に橋を架けよ。はしごを使え。」と
//     順序が合う。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・はしごを持っていれば到達できる部屋は書き換え前と同じ。
//   ・はしごを持たない到達室から `1,1`・`0,1`（鉄の盾の宝箱）・`0,2` が抜ける（意図した変化）。
//     `1,0`（鍵の部屋）・ボス `0,0` は元々はしごが要る＝本筋の門が2部屋手前へ来ただけ。
//
// 使い方:
//   node scripts/migrate-d5-1-2-frozen-canal-guards.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-1-2-frozen-canal-guards.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';
import { THREAT_OF, EXTRA_ENEMY_ROOMS, SIGNATURE_LADDER } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '1,2';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#....B......',
	'#...........',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（`~` は bgTiles の水・tiles 層では床。敵の文字は tiles 層に置く） ─────
// WATER_MAP の `~` が水。TARGET はそれを床 `.`（敵が乗るセルは敵の文字）にした tiles 層。
export const WATER_MAP = [
	'#####..#####',
	'#~~~~..~~~~#',
	'#~~~~~~~~~~#',
	'#~~~......~#',
	'#....B......',
	'#...........',
	'#..#....#..#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const ENEMIES = { '2,2': TILE.LURK_SHARK, '1,9': TILE.ARCHER_FISH, '4,10': 'θ' };
export const TARGET = WATER_MAP.map((row, r) => [...row].map((ch, c) => ENEMIES[`${r},${c}`] ?? (ch === '~' ? '.' : ch)).join(''));
export const WATER = WATER_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '~' ? [`${r},${c}`] : [])));
export const EXITS = { north: ['0,5', '0,6'], south: ['9,5', '9,6'], east: ['4,11', '5,11'] };
export const CHEST_CELL = '4,5';
export const CROSSINGS = ['2,5', '2,6'];
export const ENTRY = '8,5';    // 南の口の内側（入口 `1,3` から来たときの最初の床）
const CHEST_CONTENTS = { [CHEST_CELL]: { type: 'item', item: 'ladder', name: 'はしご' } };
const SHOW = { [CHEST_CELL]: { trigger: 'killAll' } };

// ── 歩行の到達（番人も import する） ─────────────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
// 水を tiles 層へ畳み込んだ実効の盤面（`connectivity.mjs cellTile` と同じ考え＝bgTiles の水も水）。
export const effective = () => WATER_MAP.map((row) => [...row]);
// from から歩けるセル。withLadder なら幅 1 の水を、進む向きの先が地上のときだけ 1 マス渡る
// ＝`game/passable.js isLadderCrossable`。返り値は Map(セル → 渡った水の最少枚数)。
export function reach(t, { withLadder = false, from = ENTRY } = {}) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const cost = new Map([[from, 0]]);
	const dq = [from];
	while (dq.length) {
		const k = dq.shift();
		const [r, c] = P(k);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc)) continue;
			if (!blocked(nr, nc)) {
				const nCost = cost.get(k);
				if (!cost.has(nk) || cost.get(nk) > nCost) { cost.set(nk, nCost); dq.unshift(nk); }
				continue;
			}
			const fr = nr + dr, fc = nc + dc, fk = `${fr},${fc}`;
			if (withLadder && LADDER_OVER.has(t[nr][nc]) && inside(fr, fc) && !blocked(fr, fc)) {
				const nCost = cost.get(k) + 1;
				if (!cost.has(fk) || cost.get(fk) > nCost) { cost.set(fk, nCost); dq.push(fk); }
			}
		}
	}
	return cost;
}
// 水の中で、岸（歩ける床）に4近傍で接するセル＝寄ってきた魚を岸から斬れる所。
export function bankWater(t) {
	return WATER.filter((k) => {
		const [r, c] = P(k);
		return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => inside(r + dr, c + dc) && !BLOCKED.has(t[r + dr][c + dc]));
	});
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);
	if (room.chestContents?.[CHEST_CELL]?.item !== 'ladder') die(`${ROOM} のはしごの宝箱が ${CHEST_CELL} に無い`);

	const START = { stage: '1,3', row: 7, col: 2 };
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		ladder: bfsLayer(stages, START, { withLadder: true, openTiles: OPEN }),
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: true, openTiles: null }),
	});
	// 基準は書き換え前の盤面で測る＝適用済みの地図に再実行しても同じ（冪等）。
	const before = room.tiles.map(rowStr);
	const saved = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	room.bgTiles = {};
	const base = runs();
	room.tiles = saved.tiles;
	room.bgTiles = saved.bgTiles;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));   // [[field-tiles-are-char-arrays]]
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	const wantBg = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚`);
	}
	if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify(SHOW)) {
		room.showConditions = JSON.parse(JSON.stringify(SHOW));
		log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL} を敵全滅（killAll）で封印`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const tl = room.tiles.map((r) => [...r]);
	const t = effective();
	const at = (g, k) => { const [r, c] = P(k); return g[r]?.[c]; };
	const cellsOf = (g, pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(g[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	check(`tiles 層に水 ~ を書いていない（水は bgTiles の単一ソース）`, cellsOf(tl, (ch) => ch === TILE.WATER).length === 0);
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		check(`画面の縁で開いているのは北・南・東の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(Object.values(EXITS).flat().sort()));
	}
	check(`宝箱 B は ${CHEST_CELL} の1枚・中身＝はしご・敵全滅で現れる`,
		JSON.stringify(cellsOf(tl, (ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST_CELL])
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS)
		&& JSON.stringify(room.showConditions) === JSON.stringify(SHOW));
	{
		const found = Object.fromEntries(cellsOf(tl, (ch) => !!ENEMY_META[ch]).map((k) => [k, at(tl, k)]));
		check(`敵は潜み鮫 (2,2)・射水魚 (1,9)・骸骨剣士 (4,10) の3体`, Object.keys(found).length === 3 && Object.entries(ENEMIES).every(([k, ch]) => found[k] === ch));
		const waterOk = Object.entries(ENEMIES).every(([k, ch]) => (ENEMY_META[ch].move === 'water') === WATER.includes(k));
		check(`水棲の敵は水の上・陸の敵は陸の上`, waterOk);
		const threat = Object.values(ENEMIES).reduce((s, ch) => s + THREAT_OF(ENEMY_META[ch]), 0);
		const sig = SIGNATURE_LADDER.find((e) => e.layer === LAYER);
		const sigRoom = stages[sig.stage].tiles.map(rowStr).join('');
		const sigThreat = [...sigRoom].reduce((s, ch) => s + (ENEMY_META[ch] && !ENEMY_META[ch].isBoss ? THREAT_OF(ENEMY_META[ch]) : 0), 0);
		check(`脅威度 ${threat.toFixed(1)}＝D5 の看板部屋 ${sig.stage}（${sigThreat.toFixed(1)}）より軽い`, threat === 56.5 && threat < sigThreat);
		check(`EXTRA_ENEMY_ROOMS に宣言がある`, EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`柱の残骸は (6,3)(6,8) の2本だけ・石・門・座・看板が無い`,
		JSON.stringify(cellsOf(tl, (ch) => ch === TILE.WALL).filter((k) => { const [r, c] = P(k); return r > 0 && r < 9 && c > 0 && c < 11; })) === JSON.stringify(['6,3', '6,8'])
		&& cellsOf(tl, (ch) => [TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.SIGN, TILE.MONUMENT, TILE.TORCH].includes(ch)).length === 0);

	// ── ② 水路とはしご ───────────────────────────────────────────────
	{
		const foot = reach(t);
		const ladder = reach(t, { withLadder: true });
		check(`はしご無しでも宝箱・東の口に届く（歩ける ${foot.size} マス）`, [CHEST_CELL, ...EXITS.east].every((k) => foot.has(k)));
		check(`はしご無しでは北の口に届かない`, EXITS.north.every((k) => !foot.has(k)));
		check(`はしごがあれば北の口に届き、渡る水は1枚（実測 ${ladder.get('0,5')}）`, ladder.get('0,5') === 1);
		for (const k of CROSSINGS) {
			const [r, c] = P(k);
			check(`渡り ${k} は縦の橋（上下が地上・左右は水）`,
				!BLOCKED.has(t[r - 1][c]) && !BLOCKED.has(t[r + 1][c]) && LADDER_OVER.has(t[r][c - 1]) && LADDER_OVER.has(t[r][c + 1]));
		}
		const floors = cellsOf(t, (ch) => !BLOCKED.has(ch));
		check(`床のどのセルにも、はしごを使えば立てる（${floors.length} マス）`, floors.every((k) => ladder.has(k)));
		// 水の中の敵は岸から斬れるセルまで泳いで来られる（水がひと続き＝どこからでも岸へ寄れる）
		const bank = bankWater(t);
		const water = new Set(WATER);
		const seen = new Set(['2,2']); const q = ['2,2'];
		while (q.length) {
			const [r, c] = P(q.shift());
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nk = `${r + dr},${c + dc}`;
				if (water.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
			}
		}
		check(`水はひと続き（${seen.size}/${WATER.length} 枚）・岸に接する水 ${bank.length} 枚`, seen.size === WATER.length && bank.length >= 10);
		// 対照①＝渡りの両方を壁にすると、はしごでも北の口に届かない（潰すのは必ず '#'）
		const wall = effective(); wall[2][5] = TILE.WALL; wall[2][6] = TILE.WALL;
		check(`対照：渡り2枚を壁にすると、はしごでも北の口に届かない`, !reach(wall, { withLadder: true }).has('0,5'));
		// 対照②＝渡りの下の岸 (3,5)(3,6) も水にする（厚さ2）と届かない＝厚さ1 だから渡れている
		const thick = effective(); thick[3][5] = TILE.WATER; thick[3][6] = TILE.WATER;
		check(`対照：(3,5)(3,6) も水にして厚さ2にすると、はしごでも北の口に届かない`, !reach(thick, { withLadder: true }).has('0,5'));
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`はしごあり・錠を全部開けた到達室が書き換え前と同じ（${now.ladder.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`はしごあり・門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		const lost = sorted(base.foot.reachedRooms).filter((k) => !now.foot.reachedRooms.has(k));
		const gained = sorted(now.foot.reachedRooms).filter((k) => !base.foot.reachedRooms.has(k));
		check(`はしご無しの到達室から抜けるのは 1,1 とその先だけ（実測 抜け=[${lost.join(' ')}] 増え=[${gained.join(' ')}]）`,
			JSON.stringify(lost) === JSON.stringify(['0,1', '0,2', '1,1']) && gained.length === 0);
		check(`レイヤーの dead-edge が 0（実測 ${now.ladder.deadEdges.length}）`, now.ladder.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：はしごの部屋を「凍れる水路の番兵」に作り替える（キュー40 第1陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}・水は bgTiles）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}   ${WATER_MAP[i]}`);
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

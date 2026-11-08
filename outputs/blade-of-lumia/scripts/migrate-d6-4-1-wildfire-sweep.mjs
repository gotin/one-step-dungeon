// dungeon_6 `4,1`（`3,1` の東・`4,2` の北＝西と南の口をつなぐ通り道）：薄い部屋を「野火の掃討」に作り替える
// （2026-11-08 / PLAN 実行キュー 95 の14室目＝最後の1室・主題はユーザー判断「A 野火の掃討」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 ############
//      2 #....7.....#     ← 床の回復薬（小）'7'
//      3 #..u...u...#     ← 茂み2
//      4 ...........#     ← 口は西（行4-5）と南（列5-6）
//      9 #####..#####
//   床の広間に回復薬（小）が1つあるだけ・敵なし。floorItems["4,5"] の「小さな妖精」（type:'faerie'）は
//   そのセルにタイルが無く、ゲームに faerie を読む処理も無い＝使われていない古いデータ（ここで消す）。
//
// ■ 新しい `4,1`＝野火の掃討（`~` は bgTiles の水）
//      0 ############
//      1 #..........#
//      2 #.~~~H~~~~.#     ← 北のかがり火 H(2,5)（初めから灯っている）
//      3 #.~uuuuuuH.#     ← 茂みの垣 (3,3)〜(3,8)・東のかがり火 H(3,9)（初めから灯っている）
//      4 ..~#ζ..ζ#~.#     ← 檻（中は1列 (4,4)〜(4,7)）に盾騎士 ζ×2（最初から追う）
//      5 ..~######~.#
//      6 #.~~~~~~~~.#
//      7 #..........#
//      8 #i........B#     ← 碑 i(8,1)・宝箱 B(8,10)＝回復薬（大）（盾騎士を2体とも倒すと現れる）
//      9 #####..#####
//   ・新しい規則（エンジン変更＝game/projectile.js burnEnemiesBesideFire）：
//     **燃える茂みの火は、縦横に接した敵を焼く**（爆弾と同じ 20＝雑魚は一度で倒れる）。
//     発生源は燃えた茂みのセル＝**盾騎士の正面（盾）からは弾かれる**。
//   ・盾騎士は勇者の方を向く（blockFacing・720ms ごとに向き直る）。檻は1列＝騎士は必ず垣に接している。
//   ・解き方：東のかがり火の東 (3,10) から西へ射る（または木のブーメランを投げる）＝火矢が垣を走る。
//     勇者は騎士と同じ高さの1つ上の行＝騎士は横（東）を向く＝盾は垣に向かない＝2体とも焼ける。
//   ・誤り（自然に手が出る方）：北のかがり火の北 (1,5) から南へ射る＝騎士は勇者を見上げる（盾が垣を向く）
//     ＝火は盾に弾かれる。垣は燃え尽き、騎士は檻と垣の跡から出られない（堀）。部屋を出ると垣は戻る
//     （regrowBushes）＝やり直せる。
//   ・ほかの手では倒せない：矢・剣のビーム・ブーメランは正面の盾に弾かれる（騎士は勇者を向く）／
//     横から撃つ列は石で止まる／剣は堀で届かない／爆弾は立てる床から檻まで3マス（爆風の届きの外）／
//     ロウソクは垣に縦横で接する床が無い。
//   ・騎士は檻と垣の跡から出られない＝勇者に届かない（剣の間合い 1.5 の外）∴脅威度 72.0 は
//     看板部屋 2,3 の 46.5 を超えるが、勇者は傷を負わない（例外＝PLAN に記録）。
//   ・報酬＝回復薬（大）（旧 床の回復薬（小）は撤去・キュー100 の棚卸しの対象に入れてよい）。
//
// ■ 撤去したもの
//   床の回復薬（小）'7'(2,5)・茂み (3,3)(3,7)・floorItems の「小さな妖精」。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水／宝の中身と出現条件／碑の本文／かがり火2つは初めから灯る／外周の口の形が不変
//   ・敵は盾騎士2体だけ・最初から追う・部屋を出ると茂みが戻る
//   ・口から全部の岸の床へ歩ける・通り抜けに条件なし・檻へは入れない・騎士の居場所は勇者の剣の間合いの外
//   ・ロウソク：立てる床が茂みに縦横で接しない／爆弾：どこに置いても檻に届かない
//   ・火の総当たり（立てる床×4方向・矢は壁でだけ止まる）：垣に火が付く射ち方は (1,5) の南向きと
//     (3,10) の西向きの2つだけ。(1,5) からは檻のどこに居る騎士も上（盾が垣）を向き、
//     (3,10) からは檻のどこに居る騎士も横を向く
//   ・層の到達性が書き換え前と同じ・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-4-1-wildfire-sweep.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-4-1-wildfire-sweep.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META, BOOMERANG_TIERS } from '../shared/items.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '4,1';
export const ROWS = 10, COLS = 12;

// `~` は bgTiles の水（tiles 側は床 '.'）。
export const PLAN_ROWS = [
	'############',
	'#..........#',
	'#.~~~H~~~~.#',
	'#.~uuuuuuH.#',
	'..~#ζ..ζ#~.#',
	'..~######~.#',
	'#.~~~~~~~~.#',
	'#..........#',
	'#i........B#',
	'#####..#####',
];
export const KNIGHTS   = ['4,4', '4,7'];
export const PEN       = ['4,4', '4,5', '4,6', '4,7'];
export const HEDGE     = ['3,3', '3,4', '3,5', '3,6', '3,7', '3,8'];
export const TORCH_N   = '2,5';
export const TORCH_E   = '3,9';
export const SHOT_WRONG = { at: '1,5', dir: 'down' };   // 北のかがり火越し＝騎士は上を向く＝盾が垣
export const SHOT_RIGHT = { at: '3,10', dir: 'left' };  // 東のかがり火越し＝騎士は横を向く
export const CHEST = '8,10';
export const SIGN  = '8,1';
export const MOUTHS = { west: ['4,0', '5,0'], south: ['9,5', '9,6'] };
export const TARGET = PLAN_ROWS.map((row) => row.replace(/~/g, '.'));
export const WATER = [];
PLAN_ROWS.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
export const CHEST_CONTENTS = { [CHEST]: { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } };
export const SHOW = { [CHEST]: { trigger: 'killAll', message: '{{bush}} 盾騎士が 野火に 倒れ、宝箱が 現れた！' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '野火の 掃討',
		lines: [
			'燃える 茂みの 火は、 隣に 立つ 者を 焼く。',
			'ただし 盾の 面は 火をも 弾く。',
		],
	},
};

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIR_DELTA = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const rc = (k) => k.split(',').map(Number);
const nb4 = (k) => { const [r, c] = rc(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

// 勇者の歩ける床（口から）。
export function reach(tiles, water) {
	const ok = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && !water.has(`${r},${c}`) && tiles[r][c] === TILE.FLOOR;
	const seen = new Set(); const q = [];
	for (const k of Object.values(MOUTHS).flat()) { seen.add(k); q.push(k); }
	while (q.length) {
		const [r, c] = rc(q.shift());
		for (const [dr, dc] of DIRS) {
			const k = `${r + dr},${c + dc}`;
			if (seen.has(k) || !ok(r + dr, c + dc)) continue;
			seen.add(k); q.push(k);
		}
	}
	return seen;
}

// 矢の通り道（game/projectile.js isTilePassableForProj＝壁でだけ止まる）。灯ったかがり火を通ると火矢になり、
// 火矢が最初に通った茂みに火が付く（carryFireAt）。火が付いた茂みのセルを返す（付かなければ null）。
// range を渡すとブーメラン（その歩数で折り返す・往路だけを見る＝往路で付かなければ復路も同じ線）。
export function fireLine(tiles, lit, from, dir, range = Infinity) {
	const [dr, dc] = DIR_DELTA[dir];
	let [r, c] = rc(from);
	let flaming = false;
	for (let n = 0; n < range; n++) {
		r += dr; c += dc;
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS || tiles[r][c] === TILE.WALL) return null;
		const ch = tiles[r][c];
		if (ch === TILE.TORCH && lit.has(`${r},${c}`)) flaming = true;
		else if (flaming && ch === TILE.BUSH) return `${r},${c}`;
	}
	return null;
}

// 盾騎士の向き（game/enemy-ai.js enemyChase＝長い軸の向き・同じ長さなら縦）。
export function facing(knight, hero) {
	const [kr, kc] = rc(knight), [hr, hc] = rc(hero);
	const dy = hr - kr, dx = hc - kc;
	if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'down' : 'up';
	return dx > 0 ? 'right' : 'left';
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
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : [...row][0] + [...row][COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, TARGET.length === ROWS && TARGET.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	room.showConditions = JSON.parse(JSON.stringify(SHOW));
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.breakableWalls = {};
	room.floorItems = {};   // 旧「小さな妖精」（読み手の無い古いデータ）もここで消える
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	delete room.enemyHold;
	// 盾騎士は既定でさまよう＝さまよう間は歩く向き（横）を向く∴火が通ってしまう＝謎が乱数で解ける。
	// ∴最初から追う（いつも勇者の方を向く）。
	room.enemyChase = Object.fromEntries(KNIGHTS.map((k) => [k, true]));
	// 倒した騎士は戻さない（宝箱は一度きり）。失敗したら垣だけ戻す＝部屋を出ると茂みが戻る。
	delete room.enemiesRespawn;
	room.regrowBushes = true;
	room.initLitTorches = [TORCH_N, TORCH_E];
	room.comment = '【キュー95 野火の掃討（2026-11-08）】燃える茂みの火は縦横に接した敵を焼く（盾の正面からは弾かれる）。'
		+ '1列の檻に盾騎士2体（最初から追う＝勇者を向く）。北の垣が茂み、まわりは堀。'
		+ '東のかがり火越しに (3,10) から西へ射ると騎士は横を向いて焼ける＝宝箱（回復薬（大）・killAll）。'
		+ '北のかがり火越しに (1,5) から射ると騎士は見上げて盾で弾く＝失敗（部屋を出ると垣が戻る＝regrowBushes）。'
		+ 'scripts/migrate-d6-4-1-wildfire-sweep.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const water = new Set(Object.keys(room.bgTiles).filter((k) => room.bgTiles[k] === TILE.WATER));
	const lit = new Set(room.initLitTorches);
	const at = (k) => { const [r, c] = rc(k); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水 ${water.size} マス（bgTiles）`, water.size === WATER.length && WATER.length > 0);
	check(`宝箱 ${CHEST} は1つ・中身＝回復薬（大）・騎士を全部倒すと現れる（killAll）`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS) && room.showConditions[CHEST]?.trigger === 'killAll'
		&& Object.keys(room.showConditions).length === 1);
	check(`碑 ${SIGN} に本文2行`, at(SIGN) === TILE.SIGN && count(TILE.SIGN) === 1 && room.signData[SIGN]?.lines?.length === 2);
	check(`茂みは垣の ${HEDGE.length} 本だけ（1かたまり）`, count(TILE.BUSH) === HEDGE.length && HEDGE.every((k) => at(k) === TILE.BUSH)
		&& HEDGE.every((k, i) => i === 0 || nb4(k).includes(HEDGE[i - 1])));
	check(`かがり火は北 ${TORCH_N}・東 ${TORCH_E} の2つ・どちらも初めから灯る`, count(TILE.TORCH) === 2 && at(TORCH_N) === TILE.TORCH
		&& at(TORCH_E) === TILE.TORCH && lit.size === 2);
	check(`栗・枯れ木・石・踏み板・門・壊せる壁・床の物は無い`,
		![TILE.BURR, TILE.DEAD_TREE, TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.BREAKABLE_WALL, TILE.ITEM_BOMB, TILE.ITEM_HEAL_POTION]
			.filter(Boolean).some((ch) => t.flat().includes(ch)) && Object.keys(room.floorItems).length === 0);
	{
		const mobs = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		check(`敵は盾騎士 ζ ${KNIGHTS.join('・')} の2体だけ（実測 ${mobs.join(' ')}）`,
			mobs.join() === KNIGHTS.map((k) => `${TILE.SHIELD_KNIGHT}@${k}`).join());
		const meta = ENEMY_META[TILE.SHIELD_KNIGHT];
		check(`盾騎士は正面を弾く（blockFacing）・hp ${meta.hp} def ${meta.def}＝野火（爆弾と同じ ${ITEM_META.bomb.damage}）で一度に倒れる`,
			!!meta.blockFacing && ITEM_META.bomb.damage - meta.def >= meta.hp);
		check(`騎士は最初から追う（enemyChase）・入り直しても戻らない・部屋を出ると茂みが戻る（regrowBushes）`,
			JSON.stringify(room.enemyChase) === JSON.stringify(Object.fromEntries(KNIGHTS.map((k) => [k, true])))
			&& !room.enemiesRespawn && room.regrowBushes === true);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（盾騎士2体）は看板部屋 2,3（${sig}）を超える＝下の ② で「騎士は勇者に届かない」を縛る`, threat === 72 && threat > sig);
	}

	// ── ② 歩行：通り抜け・取り残し・騎士は勇者に届かない ──────────────────────
	const walk = reach(t, water);
	{
		check(`西の口から南の口へ謎を解かずに抜けられる`, Object.values(MOUTHS).flat().every((k) => walk.has(k)));
		const floors = [];
		t.forEach((row, r) => row.forEach((ch, c) => {
			const k = `${r},${c}`;
			if (!water.has(k) && ch === TILE.FLOOR && !PEN.includes(k)) floors.push(k);
		}));
		const stranded = floors.filter((k) => !walk.has(k));
		check(`岸の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		check(`檻へは歩いて入れない`, PEN.every((k) => !walk.has(k)));
		check(`宝箱 ${CHEST} の隣に立てる`, nb4(CHEST).some((k) => walk.has(k)));
		// 騎士が動ける所＝檻＋燃えた垣の跡（垣が燃え尽きた後）。勇者の床との距離が剣の間合い（1.5）より遠い。
		const knightZone = [...PEN, ...HEDGE];
		const kr = (k) => rc(k);
		const nearest = Math.min(...knightZone.flatMap((a) => [...walk].map((b) => { const [ar, ac] = kr(a), [br, bc] = kr(b); return Math.hypot(ar - br, ac - bc); })));
		const range = ENEMY_META[TILE.SHIELD_KNIGHT].attack.range;
		check(`騎士の居場所（檻＋垣の跡）から勇者の床まで最短 ${nearest.toFixed(2)}＞剣の間合い ${range}`, nearest > range);
		const zoneWalk = (() => {
			const seen = new Set(knightZone); const q = [...knightZone];
			while (q.length) {
				const k = q.shift();
				for (const n of nb4(k)) {
					const [r, c] = rc(n);
					if (seen.has(n) || water.has(n) || t[r]?.[c] !== TILE.FLOOR) continue;
					seen.add(n); q.push(n);
				}
			}
			return seen;
		})();
		check(`垣が燃え尽きても騎士は檻と垣の跡から出られない（外へ漏れる床 ${[...zoneWalk].filter((k) => !knightZone.includes(k)).join(' ') || 'なし'}）`,
			[...zoneWalk].every((k) => knightZone.includes(k)));
	}

	// ── ③ ほかの手では解けない ───────────────────────────────────────────
	{
		const touch = HEDGE.flatMap(nb4).filter((k) => walk.has(k));
		check(`ロウソク：立てる床は垣に縦横で接しない（${touch.join(' ') || 'なし'}）`, touch.length === 0);
		// 爆風（game/projectile.js blastCells 半径2）＝(0,±1)(0,±2)(±1,0)(±2,0)(±1,±1)
		const BLAST = [[0, 1], [0, -1], [0, 2], [0, -2], [1, 0], [-1, 0], [2, 0], [-2, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
		const bombHits = [...walk].filter((k) => { const [r, c] = rc(k); return BLAST.some(([dr, dc]) => PEN.includes(`${r + dr},${c + dc}`)); });
		check(`爆弾：立てる床のどこに置いても檻に届かない（届く置き場 ${bombHits.join(' ') || 'なし'}）`, bombHits.length === 0);
		const plainHits = [];
		for (const k of walk) for (const dir of Object.keys(DIR_DELTA)) {
			const [dr, dc] = DIR_DELTA[dir];
			let [r, c] = rc(k);
			for (;;) {
				r += dr; c += dc;
				if (r < 0 || c < 0 || r >= ROWS || c >= COLS || t[r][c] === TILE.WALL) break;
				if (PEN.includes(`${r},${c}`)) {
					const f = facing(`${r},${c}`, k);
					if (f !== dir.replace(/up|down|left|right/, (d) => ({ up: 'down', down: 'up', left: 'right', right: 'left' })[d])) plainHits.push(`${k}:${dir}`);
					break;
				}
			}
		}
		check(`矢・剣のビーム：檻へ届く射ち方は全部、騎士の正面から（盾に弾かれる）（側面から届く射ち方 ${plainHits.join(' ') || 'なし'}）`, plainHits.length === 0);
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で持てる道具＝弓・ブーメラン・ロウソク・爆弾`, ['bow', 'boomerang', 'candle', 'bomb'].every((x) => tools.has(x)));
	}

	// ── ④ 火の総当たり：垣に火が付く射ち方と、そのときの騎士の向き ─────────────────
	{
		const shots = [];
		for (const k of walk) for (const dir of Object.keys(DIR_DELTA)) {
			if (fireLine(t, lit, k, dir)) shots.push(`${k}:${dir}`);
		}
		const expect = [`${SHOT_WRONG.at}:${SHOT_WRONG.dir}`, `${SHOT_RIGHT.at}:${SHOT_RIGHT.dir}`].sort();
		check(`火矢で垣に火が付く射ち方は ${expect.join('・')} の2つだけ（実測 ${shots.sort().join(' ')}）`, shots.sort().join() === expect.join());
		const woodRange = BOOMERANG_TIERS[0].maxRange;
		check(`木のブーメラン（届き ${woodRange}）でも同じ2つで火が付く`,
			!!fireLine(t, lit, SHOT_WRONG.at, SHOT_WRONG.dir, woodRange) && !!fireLine(t, lit, SHOT_RIGHT.at, SHOT_RIGHT.dir, woodRange));
		const upFromWrong = PEN.filter((k) => facing(k, SHOT_WRONG.at) === 'up');
		check(`${SHOT_WRONG.at} から射つと、檻のどこに居る騎士も上を向く＝盾が垣（実測 ${upFromWrong.length}/${PEN.length}）`, upFromWrong.length === PEN.length);
		const sideFromRight = PEN.filter((k) => ['left', 'right'].includes(facing(k, SHOT_RIGHT.at)));
		check(`${SHOT_RIGHT.at} から射つと、檻のどこに居る騎士も横を向く＝盾は垣に向かない（実測 ${sideFromRight.length}/${PEN.length}）`, sideFromRight.length === PEN.length);
		check(`檻の騎士は全員が垣に縦横で接している（檻は1列）`, PEN.every((k) => nb4(k).some((n) => HEDGE.includes(n))));
	}

	// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「野火の掃討」に作り替える（キュー95 の14室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・~ は水）`);
	room.tiles.forEach((row, i) => console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${PLAN_ROWS[i]}`));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) ng++; }
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);
	if (DRY) console.log('\n--dry: 書き込みなし');
	else { writeFileSync(MAP_PATH, JSON.stringify(data, null, 2)); console.log('\n書き込み完了:', MAP_PATH); }
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// tests/d2-compass-rose.spec.js
// dungeon_2 `3,1`（南東の環の北東＝コンパスの部屋）「砂の方位盤」の番人
// （2026-10-11 / PLAN 実行キュー 41 の第3陣 3室目・盤面は `scripts/migrate-d2-3-1-compass-rose.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の真ん中にコンパスが1つ落ちているだけ＝D1 `3,1` の写し。
//
// 新しい盤面（真ん中に砂の流れ落ちた四角い穴＋中心へ向かう幅1の針4本＝方位盤）:
//      1 #.......#.n#   ← 北東の祠にコンパス
//      2 #....*..#..#   ← 北の針の口に石
//      3 #..xx*xx##T#   ← 北の針に石／祠の門
//      4 ...xxSxx...#   ← 北の針の先にボタン
//      5 ....Sx.....#   ← 西の針の先にボタン
//      6 #..xx.xx...#
//      7 #..xx.xx...#
//   両方のボタンに石が乗ると門が開いたまま（ロック）。北の針に詰まった石2つは重ねて押せない＝口の石を横へどけ、
//   奥の石を押し込み、どけた石を西の針へ運ぶ。
//
// 守るものは3つ。
//   ① データ：盤面・下地・針の形・ソルバー（最短手数・詰まない・貪欲で解けない・対照）・層の接続。
//   ② 挙動（実機）：詰まった石は北から押しても動かない／ボタン1つに石・もう1つに自分が立っても門は足を離すと閉じる／
//      解けないまま部屋を出れば石は元に戻る（罠に押し込んでも出直せる）。
//   ③ 通し（実機）：ソルバーの最短解どおりに押すと石がロックされ門が開き、コンパスを拾える。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';
import {
	TARGET, EXITS, STONES, BUTTONS, NEEDLES, HUB, GATE, COMPASS, STONE_FLOOR, SHORTEST, PUSHES,
	targetBg, reach, solveRoom, withCell,
} from '../scripts/migrate-d2-3-1-compass-rose.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '3,1';
const stages = map.layers[LAYER].stages;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 3,1 砂の方位盤 ① データ', () => {
	test('盤面・下地・石とボタンと門とコンパス・敵も看板も宝箱も無い', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.bgTiles).toEqual(targetBg());
		for (const k of STONE_FLOOR) expect(st.bgTiles[k], `${k}（祠・門の敷居）が石畳でない`).toBe(TILE.STONE_FLOOR);
		const t = rowsOf(st);
		const cells = (ch) => t.flatMap((row, r) => [...row].map((x, c) => (x === ch ? `${r},${c}` : null)).filter(Boolean));
		expect(cells(TILE.STONE).sort()).toEqual([...STONES].sort());
		expect(cells(TILE.BUTTON).sort()).toEqual(Object.values(BUTTONS).sort());
		expect(cells(TILE.GATE)).toEqual([GATE]);
		expect(cells(TILE.ITEM_COMPASS)).toEqual([COMPASS]);
		expect([...t.join('')].filter((ch) => ENEMY_META[ch]), '敵が居る（敵は石を押す）').toEqual([]);
		expect(st.links, 'links（門はボタンの規則で開く）').toEqual([]);
		for (const k of ['signData', 'chestContents', 'showConditions', 'floorItems', 'breakableWalls', 'npcData']) {
			expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		}
	});

	test('方位盤の形：針4本は幅1で両脇が穴・先は中心の穴の隣／ボタンは北と西の針の先／北の針に石が2つ詰まっている', () => {
		const t = rowsOf(stages[ROOM]);
		const at = (k) => { const [r, c] = P(k); return t[r][c]; };
		expect(at(HUB)).toBe(TILE.PIT);
		for (const [dir, cells] of Object.entries(NEEDLES)) {
			for (const k of cells) {
				const [r, c] = P(k);
				const sides = dir === 'north' || dir === 'south' ? [`${r},${c - 1}`, `${r},${c + 1}`] : [`${r - 1},${c}`, `${r + 1},${c}`];
				for (const s of sides) expect(at(s), `${dir} の針 ${k} の脇 ${s} が穴でない`).toBe(TILE.PIT);
			}
			const [r, c] = P(cells[1]);
			expect([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => `${r + dr},${c + dc}` === HUB), `${dir} の針の先が中心に接しない`).toBe(true);
		}
		expect(BUTTONS.north).toBe(NEEDLES.north[1]);
		expect(BUTTONS.west).toBe(NEEDLES.west[1]);
		expect(STONES).toEqual(['2,5', NEEDLES.north[0]]);
		// 歩行（石と門を壁にする）：奥の石を押す立ち位置にもコンパスにも届かない／通り道は石に触れずに通れる
		const foot = reach(t);
		expect(foot.has(BUTTONS.north), '針の先へ歩いて回り込めた＝奥の石を北へ押し出せる').toBe(false);
		expect(foot.has(COMPASS), '門を通らずにコンパスへ届いた').toBe(false);
		for (const k of EXITS.south) expect(foot.has(k), `西の口から南の口 ${k} へ歩けない`).toBe(true);
	});

	test(`ソルバー：最短 ${SHORTEST} 手・押し ${PUSHES}・口の石を先にどける・詰まない・貪欲で解けない・北→西の順`, () => {
		const m = solveRoom(rowsOf(stages[ROOM]));
		expect(m.L, '口からコンパスまでの最短手数').toBe(SHORTEST);
		expect(m.pushes, '最短解で押す回数').toBe(PUSHES);
		expect(m.pushList[0], '最初の押しは口の石を横へ').toBe('2,5→2,4');
		expect(m.pushList[1], '次に奥の石を針の先へ').toBe(`3,5→${BUTTONS.north}`);
		expect(m.pushList.at(-1), '最後は西の針の先へ').toBe(`5,3→${BUTTONS.west}`);
		expect(m.noEscape, '入って詰む状態').toBe(0);
		expect(m.greedy, '貪欲で解ける＝考えずに手が進む').toBe(false);
		expect(m.deadlocks, '詰みの状態が無い＝押し方を誤る余地が無い').toBeGreaterThan(0);
		expect(m.orders).toEqual([[m.buttons.indexOf(BUTTONS.north), m.buttons.indexOf(BUTTONS.west)]]);
	});

	test('対照：押さない・石を1つ消す・穴を床にする・はしごで中心を渡る', () => {
		expect(solveRoom(TARGET, { noPush: true }).L, '石を押さずにコンパスへ届いた').toBe(null);
		for (const k of STONES) expect(solveRoom(withCell(k, '.')).L, `石 ${k} が無くても届く`).toBe(null);
		const flat = solveRoom(TARGET.map((row) => row.replaceAll('x', '.')));
		expect(flat.pushes, '穴を床にしても押しの数が同じ＝穴が謎を作っていない').toBeLessThan(PUSHES);
		// はしご（D5）を持って戻ると中心の穴 (5,5) を渡れる（針の先どうし）。近道にも閉じ込めにもならない。
		const tiles = TARGET.map((r) => [...r].map((ch) => (ch === TILE.ITEM_COMPASS ? '.' : ch)));
		const S = makeSolver(tiles, TARGET.map((r) => [...r].map(() => TILE.SAND)), [], {}, new Set(), { hasLadder: true, pitCrossable: true });
		const exits = Object.values(EXITS).flat();
		const starts = exits.map((k) => { const [r, c] = P(k); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
		const m = measureMetrics(S, starts, (st) => st.split('|')[0] === COMPASS, () => 0,
			{ escapeTest: (st) => exits.includes(st.split('|')[0]) });
		expect(m.L, 'はしごで近道ができた').toBe(SHORTEST);
		expect(m.noEscape, 'はしごで入って詰む').toBe(0);
	});

	test('層の接続：到達室・dead-edge は書き換え前と同じ', () => {
		const start = { stage: '1,3', row: 7, col: 2 };
		const closed = bfsLayer(stages, start, { withLadder: false, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(15);
		expect(closed.reachedRooms.has(ROOM)).toBe(true);
	});
});

// ── ② ③ 実機（fromEditor=1 プレビュー）──────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col) });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）＝余裕を見て待つ。
async function push(page, d) {
	await page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
	await page.waitForTimeout(1000);
}
// 石の位置＝動いた石は stonePositions（元のセル→今のセル）、動いていない石は元のセル
const snap = (page) => page.evaluate(({ stones, gate, layer }) => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		stones: stones.map((k) => { const s = ss.stonePositions?.[k]; return s ? `${s.r},${s.c}` : k; }).sort(),
		gateOpen: (ss.openGates ?? []).includes(gate),   // スナップショット＝配列（[[blade-snapshot-api-names]]）
		locked: !!ss.stonesLocked,
		compass: !!p.dungeonItems?.[layer]?.hasCompass,
		stage: window.__game.getState().stageKey,
	};
}, { stones: STONES, gate: GATE, layer: LAYER });
// [kind, dir, n, 着いた位置, 押した後の石（押しのときだけ）]
async function run(page, route) {
	for (const [kind, d, n, want, stonesAfter] of route) {
		if (kind === 'push') await push(page, d); else await walk(page, d, n);
		const s = await snap(page);
		expect(s.pos, `${kind} ${d}×${n} の後の位置`).toBe(want);
		if (stonesAfter) expect(s.stones.join(' '), `${d} へ押した後の石（ソルバーと同じ所で止まる）`).toBe(stonesAfter);
	}
}
// 西の口の内側 (4,1) からの最短解（ソルバーの状態空間から起こした＝.scratch/q41-3-1-route.mjs）
const SOLVE = [
	['walk', 'up', 3, '1,1'],
	['walk', 'right', 5, '1,6'],
	['walk', 'down', 1, '2,6'],
	['push', 'left', 1, '2,5', '2,4 3,5'],          // 口の石を西へどける
	['push', 'down', 1, '3,5', '2,4 4,5'],          // 奥の石を北の針の先へ
	['walk', 'up', 1, '2,5'],
	['push', 'left', 1, '2,4', '2,3 4,5'],
	['push', 'left', 1, '2,3', '2,2 4,5'],
	['walk', 'up', 1, '1,3'], ['walk', 'left', 1, '1,2'],
	['push', 'down', 1, '2,2', '3,2 4,5'],          // 列2 を南へ下ろす
	['push', 'down', 1, '3,2', '4,2 4,5'],
	['push', 'down', 1, '4,2', '4,5 5,2'],
	['walk', 'left', 1, '4,1'], ['walk', 'down', 1, '5,1'],
	['push', 'right', 1, '5,2', '4,5 5,3'],         // 行5 を東へ＝西の針
	['push', 'right', 1, '5,3', '4,5 5,4'],         // 西の針の先へ＝両方のボタンに石
];

test.describe('D2 3,1 砂の方位盤 ② 挙動（実機）', () => {
	test('詰まった石は北から押しても動かない（2つ重ねては押せない）', async ({ page }) => {
		const errors = await boot(page, 4, 1);
		await run(page, [['walk', 'up', 3, '1,1'], ['walk', 'right', 4, '1,5']]);
		await push(page, 'down');
		const s = await snap(page);
		expect(s.stones.join(' '), '北から押して詰まった石が動いた').toBe('2,5 3,5');
		expect(s.pos).toBe('1,5');
		expect(errors).toEqual([]);
	});

	test('対照：石1つ＋自分がもう1つのボタンに立つと門は開くが、足を離すと閉じる（ロックしない）', async ({ page }) => {
		test.setTimeout(60_000);
		const errors = await boot(page, 4, 1);
		await run(page, SOLVE.slice(0, 5));                                    // 奥の石だけ北の針の先へ
		await run(page, [['walk', 'up', 1, '2,5'], ['walk', 'right', 1, '2,6'], ['walk', 'up', 1, '1,6'],
			['walk', 'left', 5, '1,1'], ['walk', 'down', 4, '5,1'], ['walk', 'right', 3, BUTTONS.west]]);
		let s = await snap(page);
		expect(s.gateOpen, '石1つ＋足で門が開かない').toBe(true);
		expect(s.locked, '足踏みでロックした').toBe(false);
		await walk(page, 'left', 1);
		s = await snap(page);
		expect(s.gateOpen, '足を離しても門が開いたまま').toBe(false);
		expect(errors).toEqual([]);
	});

	test('解けないまま部屋を出れば石は元に戻る（北東の角へ押し込んで詰めても出直せる）', async ({ page }) => {
		test.setTimeout(60_000);
		const errors = await boot(page, 4, 1);
		await run(page, [['walk', 'up', 3, '1,1'], ['walk', 'right', 3, '1,4'], ['walk', 'down', 1, '2,4'],
			['push', 'right', 1, '2,5', '2,6 3,5'], ['push', 'right', 1, '2,6', '2,7 3,5']]);   // (2,7) で動かなくなる
		await run(page, [['walk', 'left', 5, '2,1'], ['walk', 'down', 2, '4,1']]);
		await page.evaluate(() => { for (let i = 0; i < 6; i++) { window.__game.movePlayer('left'); window.__game.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '2,1');
		await page.evaluate(() => { for (let i = 0; i < 6; i++) { window.__game.movePlayer('right'); window.__game.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,1');
		const s = await snap(page);
		expect(s.stones.join(' '), '出直しても石が戻らない').toBe('2,5 3,5');
		expect(errors).toEqual([]);
	});
});

test.describe('D2 3,1 砂の方位盤 ③ 通し（実機）', () => {
	test('通し：口の石をどけて奥の石を押し込み、どけた石を西の針へ→ロックして門が開き、コンパスを拾える', async ({ page }) => {
		test.setTimeout(90_000);
		const errors = await boot(page, 4, 1);
		await run(page, SOLVE);
		let s = await snap(page);
		expect(s.locked, '両方のボタンに石が乗ったのにロックしない').toBe(true);
		expect(s.gateOpen, '門が開かない').toBe(true);
		expect(s.compass).toBe(false);
		// 西の針の口から南へ下り、行8 を東へ、列8 を北へ、門の前 (4,10) から祠へ
		await run(page, [['walk', 'left', 1, '5,2'], ['walk', 'down', 3, '8,2'], ['walk', 'right', 6, '8,8'],
			['walk', 'up', 4, '4,8'], ['walk', 'right', 2, '4,10'], ['walk', 'up', 3, COMPASS]]);
		s = await snap(page);
		expect(s.gateOpen, '足を離したら門が閉じた（ロックが効いていない）').toBe(true);
		expect(s.compass, 'コンパスを拾えない').toBe(true);
		expect(errors).toEqual([]);
	});
});

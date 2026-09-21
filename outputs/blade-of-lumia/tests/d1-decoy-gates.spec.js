// tests/d1-decoy-gates.spec.js
// D1 の「飾りの仕掛け」を直した2室の番人（2026-09-21 / PLAN 実行キュー20）。
//
// 直す前の実測（`scripts/measure-puzzle.mjs --layer dungeon_1`）：
//   ・`2,1`：宝箱が東の境界口の真横にあり **L=1**。`--no-push`（石を押さない）でも L=1
//     ＝石・ボタン・扉が1つも要らなかった。
//   ・`2,2`：地図まで **L=4**。`--kill 8,9`（Y を壁で潰す）でも L=4＝扉は迂回できた。
//
// 守るものは2つ。
//
// ① データ（状態空間）：仕掛けを殺すと報酬に**届かない**（＝飾りでない）。
//    これは「歩いて行けるか」の目視では判定できない＝必ずソルバーで測る
//    （[[blade-puzzle-must-verify-with-solver]]）。対照実験で潰すセルは必ず '#'
//    （未知文字だと通行可になり全部「必須でない」と出る
//     ＝[[blade-control-experiment-needs-tile-wall]]）。
//    併せて「境界の開き（外周の口）」を固定する＝室内に壁を足す直しが部屋間の接続を
//    動かしていないことの番人。
//
// ② 挙動（実機）：扉が実際に通行を止め、仕掛けを使うと開いて報酬に届く。
//    ⚠️ `fromEditor=1` プレビューは debugMode=true ＝**壁も石もすり抜ける**（無敵）ので
//       「扉が通れない」の検証には使えない。セーブを仕込んで「つづきから」で入る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_1';

// D1 は道具ゼロ（`shared/progression.js toolsUsableIn` が返す集合が空）＝剣だけで測る。
const SOLVER_OPTS = { hasLadder: false, hasCandle: false, noTools: true };

const ROOMS = [
	{
		key: '2,1',
		label: '石の重し（石 → ボタン → 扉）',
		reward: '1,10',        // 宝箱（北東の袋小路の奥）
		gate: '3,9',
		edges: 'N[] S[5,6] W[] E[4,5]',
		control: { kind: 'noPush', why: '石を押さない' },
	},
	{
		key: '2,2',
		label: '壁の刻み（Y スイッチ → 扉）',
		reward: '1,1',         // 洞窟の地図（北西の袋小路の奥）
		gate: '3,2',
		edges: 'N[5,6] S[] W[4,5] E[4,5]',
		control: { kind: 'kill', cell: '8,9', why: 'Y を壁で潰す' },
	},
];

// ── ① データ（状態空間）────────────────────────────────────────────────
function rowsOf(st) {
	return st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
}

function edgeSig(rows) {
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[ROWS - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[COLS - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

function measureRoom(key, reward, { noPush = false, kill = null } = {}) {
	const st = map.layers[LAYER].stages[key];
	const tiles = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
	if (kill) {
		const [r, c] = kill.split(',').map(Number);
		tiles[r][c] = TILE.WALL;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const linkMap = new Map();
	for (const { switchId, gateId } of st.links ?? []) {
		if (!linkMap.has(switchId)) linkMap.set(switchId, []);
		linkMap.get(switchId).push(gateId);
	}
	const S = makeSolver(tiles, bg, [...linkMap.entries()], {}, new Set(), { ...SOLVER_OPTS, noPush });
	const starts = S.exitCells.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	const [gr, gc] = reward.split(',').map(Number);
	return measureMetrics(
		S,
		starts,
		(state) => state.split('|')[0] === reward,
		(state) => {
			const [pr, pc] = state.split('|')[0].split(',').map(Number);
			return Math.abs(pr - gr) + Math.abs(pc - gc);
		},
		{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) },
	);
}

test.describe('Blade of Lumia – D1 の飾りの仕掛けを塞いだ2室（キュー20）', () => {
	for (const room of ROOMS) {
		test(`データ：${LAYER} ${room.key}「${room.label}」は仕掛けを使わないと報酬に届かない`, () => {
			const st = map.layers[LAYER].stages[room.key];

			// 報酬セルに報酬がある（宝箱なら中身つき）
			const [rr, rc] = room.reward.split(',').map(Number);
			const rewardTile = st.tiles[rr][rc];
			expect([TILE.CHEST, TILE.ITEM_DUNGEON_MAP], `(${room.reward}) が報酬タイル`).toContain(rewardTile);
			if (rewardTile === TILE.CHEST) expect(st.chestContents?.[room.reward]).toBeTruthy();

			// 扉は links の行き先で、実際に 'T'
			expect(st.links?.length, 'links は1本').toBe(1);
			expect(st.links[0].gateId, '扉の位置').toBe(room.gate);
			const [tr, tc] = room.gate.split(',').map(Number);
			expect(st.tiles[tr][tc], `(${room.gate}) は扉 'T'`).toBe(TILE.GATE);

			// 素の測定＝届く／浅すぎない／貪欲では解けない／入って詰まない
			// ⚠️ 届かないときの L は `null`（`lib/puzzle-metrics.mjs` の表現）＝Infinity ではない。
			const m = measureRoom(room.key, room.reward);
			expect(m.L, '報酬に届く（解なし＝null ではない）').not.toBeNull();
			expect(m.L, `最短手数 L=${m.L} が6以上`).toBeGreaterThanOrEqual(6);
			expect(m.greedy, '貪欲法では解けない（気づきが要る）').toBe(false);
			expect(m.noEscape, '入って詰む状態は無い').toBe(0);

			// 対照実験＝仕掛けを殺すと届かない（これが「飾りでない」の唯一の証明）
			const ctl = measureRoom(room.key, room.reward, room.control.kind === 'noPush'
				? { noPush: true }
				: { kill: room.control.cell });
			expect(ctl.L, `対照実験（${room.control.why}）では報酬に届かない`).toBeNull();
		});

		test(`データ：${LAYER} ${room.key} の境界の開きは不変（部屋間の接続を動かさない）`, () => {
			const rows = rowsOf(map.layers[LAYER].stages[room.key]);
			expect(edgeSig(rows)).toBe(room.edges);
		});
	}
});

// ── ② 挙動（実機・セーブ経由＝debugMode OFF）──────────────────────────────
/** セーブを仕込んで「つづきから」で入る＝無敵もすり抜けも無い素の状態。 */
async function startAt(page, { row, col, dir = 'down', room }) {
	const save = JSON.stringify({
		player: {
			x: col, y: row,
			hp: 6, maxHp: 6, maxHearts: 3, atk: 99, def: 0, keys: 0,
			weapon: 'sword', shield: null, armor: null,
			subItems: {}, activeSubItem: null,
			rupees: 0, triforceCount: 0,
		},
		stageState: {},
		currentLayer: LAYER,
		stageKey: room,
		heroDir: dir,
	});
	await page.addInitScript(({ k, v }) => {
		try { localStorage.setItem(k, v); } catch { /* noop */ }
	}, { k: SAVE_KEY, v: save });
	await page.goto(GAME_URL);
	await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
	await page.locator('#btn-continue').click();
	await page.waitForFunction(() => {
		const b = document.getElementById('board');
		return !!b && b.children.length > 0;
	});
	// 実ループを止める＝敵の動きで経路が変わらない（石押しのクールダウンは実時間なので影響なし）
	await page.evaluate(() => window.__game.pause());
}

const posOf = (page) => page.evaluate(() => {
	const p = window.__game.getState().player;
	return { x: p.x, y: p.y };
});

/**
 * 目標セルへ歩く。`movePlayer` 1回＝半マス（[[blade-moveplayer-is-half-tile]]）だが
 * 「n セル＝2n 回」と数えると半マス取り残しで座標が 1.5 のまま止まる∴**到達するまで
 * 繰り返す**（整数一致を到達条件にすると石押し＝1回1マスも同じ書き方で再生できる）。
 */
async function moveTo(page, cell, { guard = 24 } = {}) {
	const [tr, tc] = cell.split(',').map(Number);
	let p = await posOf(page);
	if (p.y !== tr && p.x !== tc) throw new Error(`moveTo は1軸ずつ: (${p.y},${p.x}) → (${cell})`);
	const dir = tr < p.y ? 'up' : tr > p.y ? 'down' : tc < p.x ? 'left' : 'right';
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	for (let i = 0; i < guard; i++) {
		p = await posOf(page);
		if (p.x === tc && p.y === tr) break;
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
	p = await posOf(page);
	expect(`${p.y},${p.x}`, `(${cell}) へ到達`).toBe(cell);
}

/** 壁/閉じた扉に阻まれることを確かめる＝何度押しても座標が動かない。 */
async function pushIntoWall(page, dir, times = 6) {
	const before = await posOf(page);
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	for (let i = 0; i < times; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
	return { before, after: await posOf(page) };
}

const ssOf = (page) => page.evaluate(() => window.__game.getStageState());

test.describe('Blade of Lumia – D1 の扉は実機で通行を止める（キュー20）', () => {
	test('2,2：Y(8,9) を剣で叩くまで扉 3,2 は通れない／叩けば地図が取れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		// 扉 (3,2) の真下 (4,2) から始める
		await startAt(page, { room: '2,2', row: 4, col: 2, dir: 'up' });
		expect((await ssOf(page)).openGates ?? [], '入室時の扉は閉じている').not.toContain('3,2');

		// ① 閉じた扉は通れない（北の袋小路に入れない）
		const blocked = await pushIntoWall(page, 'up');
		expect(blocked.after, '閉じた扉に阻まれて1歩も進めない').toEqual(blocked.before);

		// ② Y(8,9) の右隣 (8,10) まで歩いて剣で叩く
		await moveTo(page, '5,2');
		await moveTo(page, '5,10');
		await moveTo(page, '8,10');
		await page.evaluate(() => window.__game.setHeroDir('left'));
		await page.evaluate(() => window.__game.swordAttack());
		await page.evaluate(() => window.__game.step(1));

		const ss = await ssOf(page);
		expect(ss.switchToggles, 'Y(8,9) が剣でトグルされた').toContain('8,9');
		expect(ss.openGates, '扉 3,2 が開いた').toContain('3,2');

		// ③ 開いた扉を通って地図を拾える
		await moveTo(page, '5,10');
		await moveTo(page, '5,2');
		await moveTo(page, '1,2');          // (4,2) → 扉(3,2) → (2,2) → (1,2)
		await moveTo(page, '1,1');          // 地図 'm'
		// ⚠️ `getState()` の player は**ホワイトリストのスナップショット**で dungeonItems を
		//    含まない＝内部名で読むと常に undefined（[[blade-snapshot-api-names]]）。
		//    実体は `getPlayer()`（テスト用に露出した本物の player）で読む。
		const dungeonItems = await page.evaluate(() => window.__game.getPlayer().dungeonItems ?? {});
		expect(dungeonItems?.[LAYER]?.hasMap, 'ダンジョンの地図を手に入れた').toBe(true);
		expect((await ssOf(page)).pickedKeys, '地図のセルが拾い済みになった').toContain('1,1');
		expect(errors).toEqual([]);
	});

	test('2,1：石をボタンに乗せるまで扉 3,9 は通れない／乗せれば宝箱に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { room: '2,1', row: 4, col: 8, dir: 'right' });
		expect((await ssOf(page)).openGates ?? [], '入室時の扉は閉じている').not.toContain('3,9');

		// ① 閉じた扉は通れない（宝箱の袋小路に入れない）
		await moveTo(page, '4,9');          // 扉の真下
		const blocked = await pushIntoWall(page, 'up');
		expect(blocked.after, '閉じた扉に阻まれて1歩も進めない').toEqual(blocked.before);

		// ② 石 *(3,5) の真上 (2,5) へ回り込んで下に押す＝ボタン S(4,5) に乗せる
		await moveTo(page, '4,6');
		await moveTo(page, '2,6');
		await moveTo(page, '2,5');
		await page.evaluate(() => window.__game.setHeroDir('down'));
		await page.waitForTimeout(700);     // 石押しは実時間クールダウン（STONE_PUSH_COOLDOWN_MS）
		await page.evaluate(() => window.__game.movePlayer('down'));
		await page.evaluate(() => window.__game.step(1));

		const ss = await ssOf(page);
		expect(Object.values(ss.stonePositions ?? {}), '石がボタン 4,5 に乗った')
			.toEqual(expect.arrayContaining([{ r: 4, c: 5 }]));
		expect(ss.switchStates['4,5'], 'ボタン 4,5 が ON').toBe(true);
		expect(ss.openGates, '扉 3,9 が開いた').toContain('3,9');
		expect(ss.stonesLocked, '全ボタンに石＝恒久ロック（閉じ込められない）').toBe(true);

		// ③ 開いた扉を通って宝箱に届く（番人チェイサーは先に倒す＝経路を確定させる）
		await page.evaluate(() => {
			for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 9999);
		});
		await moveTo(page, '3,7');
		await moveTo(page, '4,7');
		await moveTo(page, '4,9');
		await moveTo(page, '2,9');          // 扉(3,9) を通って袋小路へ
		await moveTo(page, '2,10');
		await moveTo(page, '1,10');         // 宝箱
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.rupees, 'ルピー×30 を手に入れた').toBe(30);
		expect(errors).toEqual([]);
	});
});

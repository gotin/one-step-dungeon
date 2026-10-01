// tests/d7-sky-shooting-gallery.spec.js
// dungeon_7 `2,2`（中央の十字路）「空の射的場」の番人
// （2026-10-01 / PLAN 実行キュー 31 の第1陣・盤面は `scripts/migrate-d7-2-2-sky-shooting-gallery.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `2,2` は `dungeon_6 2,2` と盤面がバイト一致＝4方向の口がある四角い広間に森の木 t と
//   茂み u が残るだけ。
//
// 守るものは3つ。
//   ① データ：盤面（空の吹き抜け・浮いた座 Y・柱の残骸）・座→門の配線・宝箱の中身。
//      座の四方は空か柱＝歩いて隣に立てない（剣で叩けない）。
//   ② 射線：座と同じ行・列の縁から射っても、柱の残骸が遮る3方向（西・東・南）では当たらない。
//      北の縁 (1,7) から真下へ射ると、矢が空の上を飛んで座に当たり門が開く。
//   ③ 通し：門は閉じていれば通れない。開けると南西の奥の宝箱（ルピー×20）に届く。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '2,2';
const st = map.layers[LAYER].stages[ROOM];
const BOARD = [
	'#####..#####',
	'#%.........#',
	'#..%%..%%%.#',
	'#.%%%%%%%..#',
	'...%%%%%%%..',
	'....%%%%%...',
	'#..%#%%Y#%.#',
	'#%..%..#%%.#',
	'#BT........#',
	'#####..#####',
];
const SWITCH = '6,7';
const GATE = '8,2';
const CHEST = '8,1';

const cellsOf = (pred) => {
	const out = [];
	st.tiles.forEach((row, r) => row.forEach((x, c) => { if (pred(x)) out.push(`${r},${c}`); }));
	return out;
};

test.describe('D7 2,2 空の射的場 ① データ', () => {
	test('① 盤面・配線・宝箱', () => {
		expect(st.tiles.every((row) => Array.isArray(row) && row.length === 12), 'tiles が文字の配列の配列でない').toBe(true);
		expect(st.tiles.map((row) => row.join('')), '盤面が変わった').toEqual(BOARD);
		expect(st.links, '座→門の配線').toEqual([{ switchId: SWITCH, gateId: GATE }]);
		expect(st.chestContents, '宝箱の中身').toEqual({ [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } });
		expect(cellsOf((ch) => !!ENEMY_META[ch]), '謎解きの部屋＝敵は置かない').toEqual([]);
		expect(cellsOf((ch) => ch === TILE.TREE || ch === TILE.BUSH), '森の木・茂みが残っている').toEqual([]);
		expect(Object.keys(st.bgTiles ?? {}), '空は tiles の %＝下地は使わない').toEqual([]);
	});

	test('① 座の四方は空か柱＝歩いて隣に立てない', () => {
		const [r, c] = SWITCH.split(',').map(Number);
		const around = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => st.tiles[r + dr][c + dc]);
		for (const ch of around) expect([TILE.SKY, TILE.WALL], `座の隣に ${ch}`).toContain(ch);
	});
});

// ── 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_bow: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(previewUrl(row, col));
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// 1マス＝movePlayer 2回（[[blade-moveplayer-is-half-tile]]）
async function walk(page, dir, tiles) {
	for (let i = 0; i < tiles * 2; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const at = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return { r: y, c: x };
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const face = async (page, dir) => {
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	await step(page, 1);
};
const shoot = async (page) => {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bow'; });
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 30);
};

test.describe('D7 2,2 空の射的場 ② 射線', () => {
	// 座と同じ行・列の縁から、柱の残骸の向こうの座を射る＝当たらない（3方向）。
	for (const [label, row, col, dir, pillar] of [
		['西の縁 (6,2) から東へ', 6, 2, 'right', '6,4'],
		['東の縁 (6,10) から西へ', 6, 10, 'left', '6,8'],
		['南の縁 (8,7) から北へ', 8, 7, 'up', '7,7'],
	]) {
		test(`② ${label}射っても柱 (${pillar}) に遮られて座に当たらない`, async ({ page }) => {
			const errors = await boot(page, row, col);
			expect(await at(page), '射る位置に立てない').toEqual({ r: row, c: col });
			await face(page, dir);
			await shoot(page);
			const s = await ss(page);
			expect(s.switchToggles ?? [], '柱の向こうの座に矢が当たった').not.toContain(SWITCH);
			expect(s.openGates ?? [], '門が開いた').not.toContain(GATE);
			expect(errors).toEqual([]);
		});
	}

	test('② 北の縁 (1,7) から真下へ射ると、矢が空を越えて座に当たり門が開く', async ({ page }) => {
		const errors = await boot(page, 1, 7);
		await face(page, 'down');
		await shoot(page);
		const s = await ss(page);
		expect(s.switchToggles, '矢が座に当たらない').toContain(SWITCH);
		expect(s.openGates, `門 (${GATE}) が開かない`).toContain(GATE);
		expect(errors).toEqual([]);
	});
});

test.describe('D7 2,2 空の射的場 ③ 通し', () => {
	test('③ 門が閉じていれば宝箱の奥へ入れない', async ({ page }) => {
		const errors = await boot(page, 8, 3);
		await walk(page, 'left', 3);
		expect(await at(page), '閉じた門を越えてしまった').toEqual({ r: 8, c: 3 });
		expect(errors).toEqual([]);
	});

	test('③ 北の縁から座を射て、西の縁を回って南西の奥の宝箱（ルピー×20）を開ける', async ({ page }) => {
		const errors = await boot(page, 1, 7);
		await face(page, 'down');
		await shoot(page);
		expect((await ss(page)).openGates, `門 (${GATE}) が開かない`).toContain(GATE);
		const before = await page.evaluate(() => window.__game.getState().player.rupees);
		await walk(page, 'left', 5);
		expect(await at(page), '北の縁を西へ歩けない').toEqual({ r: 1, c: 2 });
		await walk(page, 'down', 1);
		await walk(page, 'left', 1);
		await walk(page, 'down', 4);
		expect(await at(page), '西の縁を南へ歩けない').toEqual({ r: 6, c: 1 });
		await walk(page, 'right', 1);
		await walk(page, 'down', 2);
		expect(await at(page), `開いた門 (${GATE}) に入れない`).toEqual({ r: 8, c: 2 });
		await walk(page, 'left', 1);
		expect(await at(page), '宝箱のセルに立てない').toEqual({ r: 8, c: 1 });
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await page.evaluate(() => window.__game.getState().player.rupees), 'ルピーが 20 増えない').toBe(before + 20);
		expect(errors).toEqual([]);
	});
});

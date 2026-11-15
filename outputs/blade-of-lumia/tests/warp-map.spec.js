// キュー107（2026-11-15 ユーザー提案）：転移の石碑の行き先一覧に地図を出す。
// 「地図には選んでない石碑の位置も示して、選んでるものは光らせることで目立たせて」。
//   ・行ける碑（灯った碑）＝水色の点・今いる碑＝白い点・灯っていない碑は出さない。
//   ・選んでいる碑に枠（#warp-map-sel）＝↑↓ で一緒に動く・「碑文を読む」の行では消える。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { listWarpStones } from '../shared/warp-stones.js';

const map = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const stones = listWarpStones(map);
const LAKE = stones.find((w) => w.stage === '9,9');
const field = map.layers.field.stages;
const keys = Object.keys(field).map((k) => k.split(',').map(Number));
const minX = Math.min(...keys.map((k) => k[0])), minY = Math.min(...keys.map((k) => k[1]));
const COLS = field[Object.keys(field)[0]].cols, ROWS = field[Object.keys(field)[0]].rows;
const px = (ws) => { const [sx, sy] = ws.stage.split(',').map(Number); return [(sx - minX) * COLS + ws.c, (sy - minY) * ROWS + ws.r]; };

async function openAt(page, lit) {
	await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=9,9&row=${LAKE.r + 1}&col=${LAKE.c}&ps_weapon=1&ps_lit=${encodeURIComponent(lit.map((w) => w.id).join(';'))}`);
	await waitForBoard(page);
	await page.waitForTimeout(300);
	await page.evaluate(() => { window.__game.setHeroDir('up'); window.__game.swordAttack(); });
	await expect(page.locator('#warp-overlay')).toBeVisible();
	await expect(page.locator('#warp-map-wrap')).toBeVisible();
}
const pixel = (page, [x, y]) => page.evaluate(([x, y]) => [...document.getElementById('warp-map').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]);
const selBox = (page) => page.evaluate(() => {
	const el = document.getElementById('warp-map-sel'); const cv = document.getElementById('warp-map');
	if (el.classList.contains('hidden')) return null;
	const scale = parseFloat(cv.style.width) / cv.width;
	return { cx: (parseFloat(el.style.left) + parseFloat(el.style.width) / 2) / scale, cy: (parseFloat(el.style.top) + parseFloat(el.style.height) / 2) / scale };
});

test('行ける碑は水色・今いる碑は白・灯っていない碑は出ない', async ({ page }) => {
	const dests = stones.filter((w) => w !== LAKE).slice(0, 3);
	const unlit = stones.filter((w) => w !== LAKE && !dests.includes(w));
	await openAt(page, [LAKE, ...dests]);
	for (const d of dests) expect(await pixel(page, px(d)), `${d.name} の点が水色でない`).toEqual([0x5f, 0xe0, 0xff]);
	expect(await pixel(page, px(LAKE)), '今いる碑の点が白でない').toEqual([255, 255, 255]);
	for (const u of unlit) expect(await pixel(page, px(u)), `灯っていない ${u.name} が描かれている`).not.toEqual([0x5f, 0xe0, 0xff]);
});

test('選んでいる碑に枠が重なり ↑↓ で動く・「碑文を読む」では消える', async ({ page }) => {
	const dests = stones.filter((w) => w !== LAKE);
	await openAt(page, stones);
	const names = await page.evaluate(() => [...document.querySelectorAll('#warp-list .warp-row')].map((e) => e.textContent));
	for (let i = 0; i < names.length; i++) {
		const box = await selBox(page);
		if (names[i] === '碑文を読む') { expect(box, '「碑文を読む」で枠が残っている').toBe(null); break; }
		const ws = dests.find((d) => d.name === names[i]);
		const [x, y] = px(ws);
		expect(box, `${ws.name} を選んだのに枠が無い`).not.toBe(null);
		expect(Math.abs(box.cx - (x + 0.5)) <= 1 && Math.abs(box.cy - (y + 0.5)) <= 1, `${ws.name} の枠がずれている`).toBe(true);
		await page.keyboard.press('ArrowDown');
	}
});

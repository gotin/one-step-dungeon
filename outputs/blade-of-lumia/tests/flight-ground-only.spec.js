// @ts-check
// 実行キュー86（2026-10-19・ユーザー決定）。飛んでいる間に「踏む」物の扱い：
//   ① 入口（MAP_ENTER '>'）＝飛んだまま乗っても入らない。入口の上で降りれば入る。
//   ② ボタン（BUTTON 'S'）＝飛んだまま乗っても押さない。ボタンの上で降りれば押す・ボタンの上で飛び立てば離れる。
//   ③ 石＝飛んでいても押せる（今のまま。押せなくするとパズルが変わる）。
//   ④ 画面をまたいでも飛んだまま（降りるのは F／🪽 だけ）＝flight-edge-landing.spec.js ②。
// 入口とボタンはどれも隣に歩いて立てるセルがある（2026-10-19 全マップで数えた＝入口 53・ボタン 76・飛ぶしか無い物 0）
// ∴降りてから歩いて乗れる＝この決まりで行けなくなる所は無い。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { STONE, FRONT_STAND } from '../scripts/migrate-d1-0-3-stone-storeroom.mjs';

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const FIELD = MAP.layers.field.stages;

async function boot(page, layer, stage, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`${GAME_URL}?fromEditor=1&layer=${layer}&stage=${stage}&row=${row}&col=${col}&ps_weapon=1&ps_wingrobe=1`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス）
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const fly = (page) => page.evaluate(() => { window.__game.toggleFlight(); return window.__game.getPlayer().flying; });
const pos = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`;
});

test('前提：実マップの形（field 6,13 の 8,8 は D1 の入口・左は床／field 2,14 の 6,5 はボタン・左は床）', () => {
	expect(FIELD['6,13'].tiles[8][8]).toBe(TILE.MAP_ENTER);
	expect(FIELD['6,13'].mapEnters['8,8'].destId).toBe('dungeon_1');
	expect(FIELD['6,13'].tiles[8][7]).toBe(TILE.FLOOR);
	expect(FIELD['2,14'].tiles[6][5]).toBe(TILE.BUTTON);
	expect(FIELD['2,14'].tiles[6][4]).toBe(TILE.FLOOR);
});

test('① 飛んだまま入口に乗っても入らない・入口の上で降りると入る', async ({ page }) => {
	const errors = await boot(page, 'field', '6,13', 8, 7);
	expect(await fly(page), '前提：飛べた').toBe(true);
	await walk(page, 'right', 1);
	expect(await pos(page)).toBe('8,8');
	await page.waitForTimeout(400);   // 遷移は 100ms 後＝入るならここまでに始まる
	const st = await page.evaluate(() => window.__game.getState());
	expect(st.currentLayer, '飛んだまま入口に入った').toBe('field');
	expect(st.isTransitioning).toBe(false);

	expect(await fly(page), '入口の上で降りられない').toBe(false);
	await page.waitForFunction(() => window.__game.getState().currentLayer === 'dungeon_1'
		&& !window.__game.getState().isTransitioning, null, { timeout: 3_000 });
	expect(errors).toEqual([]);
});

test('② 飛んだままボタンに乗っても押さない・降りると押す・飛び立つと離れる', async ({ page }) => {
	const errors = await boot(page, 'field', '2,14', 6, 4);
	const pressed = () => page.evaluate(() => !!window.__game.getStageState().switchStates?.['6,5']);
	expect(await fly(page), '前提：飛べた').toBe(true);
	await walk(page, 'right', 1);
	expect(await pos(page)).toBe('6,5');
	expect(await pressed(), '飛んだままボタンを押した').toBe(false);

	expect(await fly(page)).toBe(false);
	expect(await pressed(), 'ボタンの上で降りたのに押していない').toBe(true);

	expect(await fly(page)).toBe(true);
	expect(await pressed(), 'ボタンの上で飛び立ったのに押したまま').toBe(false);

	// 歩いて乗れば今までどおり押す（対照）
	expect(await fly(page)).toBe(false);
	await walk(page, 'left', 1);
	expect(await pressed()).toBe(false);
	await walk(page, 'right', 1);
	expect(await pressed(), '歩いて乗ったのに押していない').toBe(true);
	expect(errors).toEqual([]);
});

// ボタンは「離れたら戻る」（checkSwitchOff）∴飛んで通り過ぎた後の押した印だけ見ても押したかが分からない。
// 一度成り立つと残る条件（showConditions の switchOn）なら押した瞬間が残る＝field 15,13 のボタン 2,2 → 6,7 が出る。
test('② の続き：飛んで通り過ぎても、ボタンで出る物は出ない（field 15,13）', async ({ page }) => {
	expect(FIELD['15,13'].tiles[2][2]).toBe(TILE.BUTTON);
	expect(FIELD['15,13'].tiles[2][3]).toBe(TILE.FLOOR);   // 西 2,1 は下地が水＝東から乗る
	expect(FIELD['15,13'].showConditions['6,7']).toMatchObject({ trigger: 'switchOn', switchId: '2,2' });
	const errors = await boot(page, 'field', '15,13', 2, 3);
	const met = () => page.evaluate(() => [...(window.__game.getStageState().conditionsMet ?? [])].includes('6,7'));
	expect(await fly(page), '前提：飛べた').toBe(true);
	await walk(page, 'left', 1);
	expect(await pos(page)).toBe('2,2');
	await walk(page, 'right', 1);
	expect(await met(), '飛んで通り過ぎただけでボタンの物が出た').toBe(false);
	// 対照：歩いて乗れば出る
	expect(await fly(page)).toBe(false);
	await walk(page, 'left', 1);
	expect(await met(), '歩いて乗ったのに出ない').toBe(true);
	expect(errors).toEqual([]);
});

test('③ 飛んでいても石は押せる（D1 0,3 の石室）', async ({ page }) => {
	const errors = await boot(page, 'dungeon_1', '0,3', 4, 10);
	expect(await fly(page), '前提：飛べた').toBe(true);
	await walk(page, 'left', 6);
	expect(await pos(page), '石の東に着いていない').toBe(FRONT_STAND);
	await page.evaluate(() => { window.__game.movePlayer('left'); window.__game.step(1); });
	await page.waitForTimeout(1000);   // 石押しは実時間のクールダウン
	const moved = await page.evaluate((k) => {
		const s = window.__game.getStageState().stonePositions?.[k];
		return s ? `${s.r},${s.c}` : k;
	}, STONE);
	expect(moved, '飛んでいると石が押せない').not.toBe(STONE);
	expect(errors).toEqual([]);
});

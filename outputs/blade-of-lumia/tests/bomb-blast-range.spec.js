// tests/bomb-blast-range.spec.js
// 爆弾の爆風が「どこまで届くか」を画面が正しく示すことの番人（2026-09-29 / PLAN 実行キュー 35）。
//
// 直す前の姿（この番人が再発を止める相手）:
//   効果＝explodeAt は中心からの距離 ≤ 2 のセル（上下左右は2セル先・斜めは (±1,±1)）を壊す/傷める。
//   絵＝直径 3 セルの円だけ（放射グラデーションで外周は透明）＝「隣の1セル」にしか見えなかった。
//   ユーザーの言葉「てっきり１セル範囲だと思い込んでいた」。
//
// 守るもの:
//   ① 置いた瞬間から導火線の間ずっと、届くセルの外形が床に出る（セルの集合＝手で書いた期待値）。
//      枠は外周の辺にだけ付く（形が1本の線で読める）。爆発したら予告は消える（①-2＝何も壊さない爆発でも）。
//   ② 爆発の絵＝効いたセルを1枚ずつ塗る。壊れた `!` は必ず塗られたセルの中にある。
//   ③ 導火線の途中で別の爆弾が壁を崩して再描画（renderChars＝char-layer の作り直し）が走っても、
//      残っている爆弾の絵と予告は消えない（直す前は消えて「見えない爆弾」になっていた）。
//   ④ 敵の爆風（爆弾鬼 λ・半径 1.5）も同じ規則で描く＝3×3。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { ITEM_META } from '../shared/items.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const ROWS = 10, COLS = 12;

// 半径 2 の爆風が届く相対セル（手書き＝実装の式を写さない）。(±2,±1) と (±2,±2) は外。
const R2_OFFSETS = [
	[0, 0],
	[-1, 0], [1, 0], [0, -1], [0, 1],
	[-2, 0], [2, 0], [0, -2], [0, 2],
	[-1, -1], [-1, 1], [1, -1], [1, 1],
];
// 半径 1.5（爆弾鬼）＝3×3。
const R15_OFFSETS = [-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc) => [dr, dc]));
const around = (r, c, offs) => offs
	.map(([dr, dc]) => [r + dr, c + dc])
	.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS)
	.map(([rr, cc]) => `${rr},${cc}`)
	.sort();

function previewUrl(layer, stage, row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage, row: String(row), col: String(col), ps_weapon: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
// dungeon_8 3,3「崩れ壁の橋脚」の西の外周 (4,1)＝水 (4,2) を挟んだ 2 セル先に `!(4,3)`。
const D8 = (r, c) => previewUrl('dungeon_8', '3,3', r, c, { ps_bomb: '1' });

async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function walk(page, dir, tiles) {
	for (let i = 0; i < tiles * 2; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
async function placeBomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; });
	await page.evaluate(() => window.__game.useSubItem());
}
const cellsOf = (page, sel) => page.evaluate((s) =>
	[...document.querySelectorAll(s)].map((e) => `${e.dataset.r},${e.dataset.c}`).sort(), sel);
const broken = (page) => page.evaluate(() => [...(window.__game.getStageState().brokenWalls ?? [])].sort());
// 1 tick ずつ進めて、条件が立った tick で止める（爆発の絵は実時間で消える∴まとめて回さない）
async function stepUntil(page, fn, max = 40) {
	for (let i = 0; i < max; i++) {
		await step(page, 1);
		if (await page.evaluate(fn)) return i + 1;
	}
	return -1;
}

test.describe('キュー35 爆弾の爆風範囲の見せ方', () => {
	test('前提：プレイヤーの爆弾の半径は 2（期待値の表はこの値で手書きした）', () => {
		expect(ITEM_META.bomb.aoeRadius).toBe(2);
	});

	test('① 置いた瞬間から届くセルの外形が出る・枠は外周の辺だけ・爆発で消える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, D8(4, 1));
		await placeBomb(page);

		// 置いた瞬間（tick を進める前）に出ている＝狙いを立てるのに爆発を待たない
		const expected = around(4, 1, R2_OFFSETS);
		expect(expected.length, '前提：(4,-1) は盤の外＝12 セル').toBe(12);
		expect(await cellsOf(page, '.bomb-range-cell'), '予告のセルが爆風の届くセルと違う').toEqual(expected);
		expect(expected, '前提：水を挟んだ `!(4,3)` が範囲に入る').toContain('4,3');

		// 外周の辺にだけ枠（上右下左の太さ）
		const borders = await page.evaluate(() => Object.fromEntries(
			[...document.querySelectorAll('.bomb-range-cell')].map((e) => {
				const cs = getComputedStyle(e);
				const w = (s) => parseFloat(cs[`border${s}Width`]) > 0 ? 1 : 0;
				return [`${e.dataset.r},${e.dataset.c}`, `${w('Top')}${w('Right')}${w('Bottom')}${w('Left')}`];
			})));
		expect(borders['4,1'], '中心に枠がある＝格子に見える').toBe('0000');
		expect(borders['4,3'], '東の先端は上・右・下が外周').toBe('1110');
		expect(borders['3,2'], '北東の斜めは上・右が外周').toBe('1100');
		expect(borders['4,2'], '先端の手前（水）は上下を斜めのセルが挟む＝枠なし').toBe('0000');
		expect(borders['2,1'], '北の先端は上・右・左が外周').toBe('1101');
		expect(borders['4,0'], '盤の端のセルは盤の外の側にだけ枠').toBe('0001');

		// 導火線の途中でも出ている
		await step(page, 8);
		expect(await cellsOf(page, '.bomb-range-cell'), '導火線の途中で予告が消えた').toEqual(expected);

		// 爆発したら消える
		const at = await stepUntil(page, () => window.__game.getStageState().brokenWalls.length > 0);
		expect(at, '爆発しない').toBeGreaterThan(0);
		expect(await cellsOf(page, '.bomb-range-cell'), '爆発した後も予告が残っている').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('①-2 何も壊さない爆発（再描画が走らない）でも予告は消える', async ({ page }) => {
		// ①の爆発は `!` を崩す＝char-layer の作り直しで予告が巻き添えで消える∴消し忘れを見逃す。
		// 南の外周 (8,3) は半径 2 の中に `!` が無い＝再描画が走らない爆発で確かめる。
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, D8(8, 3));
		await placeBomb(page);
		expect(await cellsOf(page, '.bomb-range-cell'), '前提：予告が出ていない').toEqual(around(8, 3, R2_OFFSETS));
		await page.evaluate(() => document.getElementById('char-player')?.setAttribute('data-q35-mark', '1'));
		const at = await stepUntil(page, () => document.querySelectorAll('.blast-cell').length > 0);
		expect(at, '爆発しない').toBeGreaterThan(0);
		expect(await broken(page), '前提：何も壊れていない').toEqual([]);
		expect(await page.locator('[data-q35-mark]').count(), '前提：再描画が走った＝この確認に歯が無い').toBe(1);
		expect(await cellsOf(page, '.bomb-range-cell'), '爆発した後も予告が残っている').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('② 爆発の絵＝効いたセルを1枚ずつ塗る・壊れた `!` は塗られたセルの中', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, D8(4, 1));
		await placeBomb(page);
		const at = await stepUntil(page, () => document.querySelectorAll('.blast-cell').length > 0);
		expect(at, '爆発の絵にセル塗りが無い').toBeGreaterThan(0);

		const drawn = await cellsOf(page, '.blast-cell');
		expect(drawn, '塗ったセルが爆風の届くセルと違う').toEqual(around(4, 1, R2_OFFSETS));
		const b = await broken(page);
		expect(b, '前提：2 セル先の `!(4,3)` が壊れた').toEqual(['4,3']);
		for (const k of b) expect(drawn, `壊れた ${k} に爆発の絵が無い＝絵が効果より狭い`).toContain(k);
		// 円（芯の閃光）は残る
		expect(await page.locator('.explosion-effect').count(), '芯の円が消えた').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('③ 別の爆弾が壁を崩して再描画されても、残っている爆弾の絵と予告は消えない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, D8(4, 1));
		await placeBomb(page);                 // A＝(4,1)・`!(4,3)` を崩す
		await walk(page, 'down', 1);
		await placeBomb(page);                 // B＝(5,1)
		const expectedB = around(5, 1, R2_OFFSETS);
		expect(await page.locator('.bomb-placed').count(), '前提：爆弾が2つ置けていない').toBe(2);

		// 再描画が本当に走ったことを確かめる目印（char-layer が作り直されると消える）
		await page.evaluate(() => document.getElementById('char-player')?.setAttribute('data-q35-mark', '1'));
		const at = await stepUntil(page, () => window.__game.getStageState().brokenWalls.length > 0);
		expect(at, 'A が爆発しない').toBeGreaterThan(0);
		expect(await page.locator('[data-q35-mark]').count(), '前提：壁が崩れても再描画が走っていない＝この確認に歯が無い').toBe(0);

		expect(await page.locator('#char-layer .bomb-placed').count(), '残っている爆弾 B の絵が再描画で消えた').toBe(1);
		expect(await cellsOf(page, '#char-layer .bomb-range-cell'), '残っている爆弾 B の予告が再描画で消えた').toEqual(expectedB);
		await step(page, 1);
		expect(await cellsOf(page, '#char-layer .bomb-range-cell'), '次の tick で B の予告が消えた').toEqual(expectedB);
		expect(errors).toEqual([]);
	});

	test('④ 敵の爆風（爆弾鬼・半径 1.5）も効いたセルを塗る＝3×3', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// thrown-projectile-enemies ⑥⑦ と同じ検証ステージ＝爆弾鬼が壁越しに (4,4) へ投げる
		await boot(page, previewUrl(TEST_LAYER, stageKey('bomb_ogre'), 4, 4));
		const at = await stepUntil(page, () => document.querySelectorAll('.blast-cell').length > 0, 80);
		expect(at, '爆弾鬼の爆発にセル塗りが無い').toBeGreaterThan(0);
		expect(await cellsOf(page, '.blast-cell'), '爆弾鬼の爆風の絵が 3×3 と違う').toEqual(around(4, 4, R15_OFFSETS));
		expect(errors).toEqual([]);
	});
});

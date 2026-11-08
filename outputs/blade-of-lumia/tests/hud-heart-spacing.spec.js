// tests/hud-heart-spacing.spec.js
// HUD のハートの間隔（2026-11-08 ユーザー指摘「ハートとハートの隙間はもっと全然小さくていい」・初代ゼルダの並び）。
// ハートは固定箱（--hud-heart）で描き、絵は箱の約 0.53 しかない＝箱をそのまま並べると
// 透明余白がハート1つ分近い隙間になる。css/hud.css で余白を負のマージンで詰めた。
// 守るもの＝PC 幅（レーン）とスマホ幅で、隣のハートの間隔（箱の左端どうし）が箱の 0.7 倍以下、
// かつ 0.55 倍以上（絵どうしが重ならない）。行の間隔も同じ。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const URL = '/blade-of-lumia/game/?fromEditor=1&layer=dungeon_6&stage=3,1&row=5&col=9&ps_weapon=1&ps_hearts=24';

for (const [w, h] of [[1656, 990], [1280, 800], [390, 844]]) {
	test(`${w}×${h}：ハートの間隔は詰まっていて、重ならない`, async ({ page }) => {
		await page.setViewportSize({ width: w, height: h });
		await page.goto(URL);
		await waitForBoard(page);
		const boxes = await page.evaluate(() => [...document.querySelectorAll('#hud-hearts canvas')]
			.map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }));
		expect(boxes.length, 'ハートが 24 個並んでいない').toBe(24);
		const size = boxes[0].w;
		const rowGaps = [], colGaps = [];
		for (let i = 1; i < boxes.length; i++) {
			if (Math.abs(boxes[i].y - boxes[i - 1].y) < 1) colGaps.push(boxes[i].x - boxes[i - 1].x);
			else rowGaps.push(boxes[i].y - boxes[i - 1].y);
		}
		for (const g of colGaps) {
			expect(g / size, `横の間隔が広い／重なる（箱 ${size}px・間隔 ${g}px）`).toBeLessThanOrEqual(0.7);
			expect(g / size).toBeGreaterThanOrEqual(0.55);
		}
		for (const g of rowGaps) {
			expect(g / size, `行の間隔が広い／重なる（箱 ${size}px・間隔 ${g}px）`).toBeLessThanOrEqual(0.7);
			expect(g / size).toBeGreaterThanOrEqual(0.5);
		}
	});
}

// ポーズの体力欄（2026-11-08 ユーザー指摘「ポーズ画面も合わせて」）＝css/overlays.css #pause-hearts。
for (const [w, h] of [[1656, 990], [390, 844]]) {
	test(`${w}×${h}：ポーズ画面のハートも同じ間隔`, async ({ page }) => {
		await page.setViewportSize({ width: w, height: h });
		await page.goto(URL);
		await waitForBoard(page);
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => document.querySelectorAll('#pause-hearts > canvas').length === 24);
		const boxes = await page.evaluate(() => [...document.querySelectorAll('#pause-hearts > canvas')]
			.map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }));
		const size = boxes[0].w;
		let n = 0;
		for (let i = 1; i < boxes.length; i++) {
			if (Math.abs(boxes[i].y - boxes[i - 1].y) >= 1) {
				const g = boxes[i].y - boxes[i - 1].y;
				expect(g / size, `行の間隔（箱 ${size}px・間隔 ${g}px）`).toBeLessThanOrEqual(0.7);
				continue;
			}
			const g = boxes[i].x - boxes[i - 1].x;
			expect(g / size, `横の間隔が広い／重なる（箱 ${size}px・間隔 ${g}px）`).toBeLessThanOrEqual(0.7);
			expect(g / size).toBeGreaterThanOrEqual(0.55);
			n++;
		}
		expect(n, '横に並んだ組が無い＝空虚').toBeGreaterThan(5);
	});
}

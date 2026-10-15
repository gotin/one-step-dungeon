// ── tests/pause-tabs-mobile.spec.js ── 実行キュー74 ──────────────────
// 不変条件：**スマホ幅のポーズ画面は「持ち物｜地図」のタブで、地図タブでは地図が画面幅いっぱいに見える**
// （2026-10-15 iPhone 実機のユーザー指摘「地図がまるで見えない」）。PC は縦1列のまま（タブは出ない）。
//
// 🔴 当て所：
//   ① タブが出ない／持ち物タブなのに地図が出る（縦に積んだまま）
//   ② 地図タブで地図が幅に収まらない・小さいまま（1マス 1px）／マーク一覧が横に並んではみ出す
//   ③ 最後に開いたタブを覚えない
//   ④ 地図を持っていないのに地図タブを押せる
//   ⑤ PC 幅でもタブが出る・地図が隠れる
//   ⑥ タブを切り替えるとタブの位置が動く（枠を中央寄せにしている＝2026-10-15 ユーザー指摘）

import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

const URL_WITH_MAP = `${GAME_URL}?fromEditor=1&layer=field&stage=6,14&row=5&col=4&ps_weapon=1&ps_map=1`;
const URL_NO_MAP   = `${GAME_URL}?fromEditor=1&layer=field&stage=6,14&row=5&col=4&ps_weapon=1`;

async function openPause(page) {
	await page.evaluate(() => { if (!window.__game.getState().isPaused) window.__game.togglePause?.(); });
	if (!(await page.evaluate(() => window.__game.getState().isPaused))) await page.keyboard.press('Escape');
	await expect(page.locator('#pause-overlay')).toBeVisible();
}
async function closePause(page) {
	await page.locator('#pause-close').click();
	await expect(page.locator('#pause-overlay')).toBeHidden();
}
const rect = (page, sel) => page.evaluate((sel) => {
	const r = document.querySelector(sel).getBoundingClientRect();
	return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
}, sel);

test.describe('キュー74 スマホ幅のポーズ画面のタブ', () => {
	test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

	test('①②③ 持ち物⇄地図を切り替え、地図は幅いっぱい・一覧は下、タブを覚える', async ({ page }) => {
		// 最初の1回だけ消す（リロードの後も覚えていることを③で見る）
		await page.addInitScript(() => {
			try { if (!sessionStorage.getItem('q74-init')) { localStorage.removeItem('blade-of-lumia-pause-tab'); sessionStorage.setItem('q74-init', '1'); } } catch { /* noop */ }
		});
		await page.goto(URL_WITH_MAP);
		await waitForBoard(page);
		await openPause(page);
		await expect(page.locator('#pause-tabs')).toBeVisible();
		// 既定＝持ち物
		await expect(page.locator('#pause-items')).toBeVisible();
		await expect(page.locator('#pause-dungeon-map')).toBeHidden();

		const tabTop = (await rect(page, '#pause-tabs')).top;
		await page.locator('#pause-tabs [data-tab="map"]').tap();
		await expect(page.locator('#pause-dungeon-map')).toBeVisible();
		expect((await rect(page, '#pause-tabs')).top, 'タブを切り替えたらタブの位置が動いた（枠の高さで上下する）').toBe(tabTop);
		await expect(page.locator('#pause-items')).toBeHidden();
		await expect(page.locator('#pause-stats')).toBeHidden();
		const box = await rect(page, '#pause-box');
		const map = await rect(page, '#pause-map-canvas');
		expect(map.left, '地図が枠の左からはみ出す').toBeGreaterThanOrEqual(box.left);
		expect(map.right, '地図が枠の右からはみ出す').toBeLessThanOrEqual(box.right);
		expect(map.width, '地図が幅いっぱいに伸びていない').toBeGreaterThan(box.width * 0.75);
		expect(map.bottom, '地図が画面の下にはみ出す').toBeLessThanOrEqual(667);
		const list = page.locator('#pause-mark-list');
		if (await list.isVisible()) {
			expect((await rect(page, '#pause-mark-list')).top, 'マーク一覧が地図の下に無い').toBeGreaterThanOrEqual(map.bottom);
		}

		// 閉じて開き直しても・ページを読み直しても地図タブ（覚えている）
		await closePause(page);
		await openPause(page);
		await expect(page.locator('#pause-tabs [data-tab="map"]')).toHaveClass(/active/);
		await closePause(page);
		await page.reload();
		await waitForBoard(page);
		await openPause(page);
		await expect(page.locator('#pause-dungeon-map')).toBeVisible();
		await expect(page.locator('#pause-tabs [data-tab="map"]')).toHaveClass(/active/);
		await page.locator('#pause-tabs [data-tab="items"]').tap();
		await expect(page.locator('#pause-items')).toBeVisible();
		await expect(page.locator('#pause-dungeon-map')).toBeHidden();
	});

	test('④ 地図を持っていなければ地図タブは押せず、持ち物が出る', async ({ page }) => {
		await page.addInitScript(() => { try { localStorage.setItem('blade-of-lumia-pause-tab', 'map'); } catch { /* noop */ } });
		await page.goto(URL_NO_MAP);
		await waitForBoard(page);
		await openPause(page);
		await expect(page.locator('#pause-tabs [data-tab="map"]')).toBeDisabled();
		await expect(page.locator('#pause-items')).toBeVisible();
		await expect(page.locator('#pause-tabs [data-tab="items"]')).toHaveClass(/active/);
	});
});

test.describe('キュー74 PC 幅は縦1列のまま', () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test('⑤ タブは出ず、持ち物と地図が両方見える', async ({ page }) => {
		await page.addInitScript(() => { try { localStorage.setItem('blade-of-lumia-pause-tab', 'map'); } catch { /* noop */ } });
		await page.goto(URL_WITH_MAP);
		await waitForBoard(page);
		await openPause(page);
		await expect(page.locator('#pause-tabs')).toBeHidden();
		await expect(page.locator('#pause-items')).toBeVisible();
		await expect(page.locator('#pause-dungeon-map')).toBeVisible();
	});
});

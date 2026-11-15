// キュー106（2026-11-15 ユーザー指摘）：ポーズ画面に「×null」が出る。
// 原因＝数を持たない道具（ブーメラン・ロウソク・笛）の count は Infinity。保存（JSON）を通ると null になり、
// ポーズ画面は `×${cnt}` をそのまま出していた。決め＝数を持たない道具は何も出さない（∞ も出さない）。
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { subItemCountLabel } from '../shared/items.js';

test('数の表示＝数だけ ×N・Infinity／null／undefined は空', () => {
	expect(subItemCountLabel(0)).toBe('×0');
	expect(subItemCountLabel(11)).toBe('×11');
	for (const v of [Infinity, null, undefined, NaN]) expect(subItemCountLabel(v)).toBe('');
});

test('ポーズ画面とクイック切り替え＝保存を通って null になった道具にも ×null が出ない', async ({ page }) => {
	await page.goto(`${GAME_URL}?fromEditor=1&ps_weapon=1&ps_bow=1&ps_boomerang=1&ps_flute=1&ps_candle=1`);
	await waitForBoard(page);
	// 保存→読み込みと同じ形（Infinity は JSON で null になる）
	await page.evaluate(() => {
		const si = window.__game.getPlayer().subItems;
		for (const k of Object.keys(si)) si[k] = JSON.parse(JSON.stringify(si[k]));
	});
	await page.keyboard.press('Escape');
	await page.locator('#pause-items .pause-item-count').first().waitFor({ timeout: 5000 });
	const counts = await page.evaluate(() => [...document.querySelectorAll('#pause-items .pause-item-slot')].map((s) => s.querySelector('.pause-item-count').textContent));
	expect(counts.join('|'), 'ポーズ画面に null / ∞ が出ている').not.toMatch(/null|∞|undefined/);
	expect(counts, '矢の数が消えた').toContain('×8');
	expect(counts.filter((c) => c === '').length, '数を持たない道具（ブーメラン・笛・ロウソク）が空になっていない').toBe(3);
});

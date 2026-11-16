// キュー108／109（2026-11-15 ユーザー指定「この女王キャラでゲームできるように」）：クリア後は女王ルミアの絵で遊ぶ。
// 絵＝shared/sprites-queen.js（refs/女王シート.png の読み戻し・髪をピンク）。勇者と同じ組み立て＝4方向（左は右の反転）×2コマ＋構え。
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { QUEEN_SPRITES, QUEEN_PAL } from '../shared/sprites-queen.js';

test('絵の一式＝向き3つ×2コマ・構え3つ・32×32・色番号はパレットの内', () => {
	for (const k of ['queenD', 'queenR', 'queenU']) expect(QUEEN_SPRITES[k]?.length, k).toBe(2);
	for (const k of ['queenDAtk', 'queenRAtk', 'queenUAtk']) expect(QUEEN_SPRITES[k]?.length, k).toBe(1);
	for (const [k, frames] of Object.entries(QUEEN_SPRITES)) for (const f of frames) {
		expect(f.length, k).toBe(32);
		expect(f.every((r) => r.length === 32 && r.every((v) => Number.isInteger(v) && v >= 0 && v < QUEEN_PAL.queen.length)), `${k} の番号がパレットの外`).toBe(true);
	}
	// 髪はピンク（パレットにピンクの3段がある・正面の絵で使っている）
	const pinks = new Set([14, 15, 16]);
	expect(QUEEN_PAL.queen.slice(14)).toEqual(['#ffa8d0', '#ff80b8', '#d4508e']);
	expect(QUEEN_SPRITES.queenD[0].flat().some((v) => pinks.has(v)), '正面にピンクの髪が無い').toBe(true);
});

// 2026-11-15 ユーザー指摘「横向きで攻撃をしたときの剣の位置が女王の手の位置より２ドットぐらい下」＝女王の横向きだけ上げる
// （2 ドット → ユーザー「もう１ドット上にしてみて」→「良さそう」＝3 ドット）
test('横向きの剣＝女王は勇者より 3 ドット（3/32 セル）上・下向きは同じ', async ({ page }) => {
	const swordTop = async (cleared, dir) => {
		await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=6&col=6&ps_weapon=1&ps_cleared=${cleared}`);
		await waitForBoard(page);
		await page.waitForTimeout(300);
		await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.swordAttack(); }, dir);
		await page.waitForSelector('.sword-held', { timeout: 2000 });
		return page.evaluate(() => {
			const el = document.querySelector('.sword-held');
			const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
			const p = window.__game.getPlayer();
			return (parseFloat(el.style.top) / cell) - p.y;
		});
	};
	for (const dir of ['right', 'left']) {
		const hero = await swordTop(0, dir), queen = await swordTop(1, dir);
		expect(Math.abs((hero - queen) - 3 / 32) < 0.02, `${dir}：勇者 ${hero.toFixed(3)}・女王 ${queen.toFixed(3)}`).toBe(true);
	}
	expect(Math.abs((await swordTop(0, 'down')) - (await swordTop(1, 'down'))) < 0.02, '下向きまで動いた').toBe(true);
});

const heroSpr = (page) => page.evaluate(() => {
	const cv = document.querySelector('#char-player canvas:not(.shield-overlay):not(.gold-shine)');
	return { pal: cv?.dataset?.pal ?? null, w: cv?.width };
});

test('クリア後＝女王の絵（色は queen）・クリア前＝勇者のまま', async ({ page }) => {
	await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=6&col=6&ps_weapon=1&ps_cleared=1`);
	await waitForBoard(page);
	await page.waitForTimeout(300);
	const names = await page.evaluate(async () => {
		const out = [];
		for (const d of ['down', 'right', 'left', 'up']) {
			window.__game.setHeroDir(d);
			out.push(window.__game.getHeroSpriteName?.() ?? null);
		}
		return out;
	});
	if (names[0] !== null) expect(names).toEqual(['queenD', 'queenR', 'queenR', 'queenU']);
	await page.evaluate(() => { window.__game.setHeroDir('down'); window.__game.updateHud(); });
	await expect.poll(async () => (await heroSpr(page)).pal).toBe('queen');

	await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=6&col=6&ps_weapon=1&ps_cleared=0`);
	await waitForBoard(page);
	await page.waitForTimeout(300);
	await page.evaluate(() => window.__game.updateHud());
	await expect.poll(async () => (await heroSpr(page)).pal).toBe('hero');
});

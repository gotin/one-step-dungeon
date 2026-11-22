// tests/queen-run-lines.spec.js
// キュー116 ②（2026-11-22）：女王の周回（クリア後の「はじめから」）の会話の版 `queen`。
// 1周目の基本の台詞は勇者への呼びかけ・「女王は石で眠る」＝女王が遊ぶ2周目では食い違う∴7か所を言い直した。
// 本文は scripts/migrate-q116-queen-lines.mjs（台詞はユーザー OK）。
//
// 守るもの：
// ① 7か所すべてに `queen` の版があり、linesAfterBoss の先頭（一番弱い＝2周目の基本の台詞）に居る
// ② 実機：女王の周回では老賢者が女王に話しかける／1周目は今までどおり勇者に（対照）
// ③ 実機：女王の周回でもボスを倒した後の案内の版が勝つ（`queen` が一番弱い）
// ④ 実機：島の女王の石碑は、2周目だけ剣士が眠る一行が足される
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { QUEEN_LINES } from '../scripts/migrate-q116-queen-lines.mjs';

const MAP = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const entryOf = (t) => MAP.layers[t.layer].stages[t.stage][t.kind][t.pos];

async function openAt(page, { layer, stage, row, col, cleared, defeated = '' }) {
	await page.goto(`${GAME_URL}?fromEditor=1&layer=${layer}&stage=${stage}&row=${row}&col=${col}&ps_sword=0&ps_cleared=${cleared ? 1 : 0}${defeated ? `&ps_defeated=${defeated}` : ''}`);
	await waitForBoard(page);
}

/** 隣の人／立て物に話しかけ、全行を読んで返す */
async function readLeft(page, dir = 'left') {
	await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.swordAttack(); }, dir);
	await expect(page.locator('#dialog-overlay')).toBeVisible();
	const lines = [];
	for (let i = 0; i < 30; i++) {
		if (await page.locator('#dialog-overlay').isHidden()) break;
		await page.waitForTimeout(700);   // 一行が打ち終わるまで
		lines.push((await page.locator('#dialog-text').textContent()).trim());
		await page.keyboard.press('Space');
		await page.waitForTimeout(150);
		if (await page.locator('#dialog-overlay').isVisible() && (await page.locator('#dialog-text').textContent()).trim() === lines.at(-1)) {
			await page.keyboard.press('Space');   // 打ち途中で送りが「全文表示」だった場合
		}
	}
	return lines;
}

test.describe('Blade of Lumia – 女王の周回の会話（キュー116 ②）', () => {
	test('① 7か所に queen の版があり、先頭（一番弱い）に居る', () => {
		expect(QUEEN_LINES).toHaveLength(7);
		for (const t of QUEEN_LINES) {
			const e = entryOf(t);
			expect(Object.keys(e.linesAfterBoss ?? {})[0], `${t.name} の queen が先頭でない`).toBe('queen');
			expect(e.linesAfterBoss.queen.join(''), `${t.name}：2周目なのに勇者へ呼びかけている`).not.toMatch(/若き勇者|勇者どの、ご無事|よく来た、勇者よ|勇者を待つ/);
		}
	});

	test('② 女王の周回では老賢者が女王に話しかける（対照：1周目は勇者に）', async ({ page }) => {
		await openAt(page, { layer: 'field', stage: '7,14', row: 3, col: 4, cleared: true });
		const q = await readLeft(page);
		expect(q[0]).toContain('女王さま');
		expect(q.join('')).toContain('石になられた');
		await openAt(page, { layer: 'field', stage: '7,14', row: 3, col: 4, cleared: false });
		const h = await readLeft(page);
		expect(h[0]).toContain('若き勇者');
	});

	test('③ 女王の周回でも、ボスを倒した後の案内の版が勝つ', async ({ page }) => {
		await openAt(page, { layer: 'field', stage: '7,14', row: 3, col: 4, cleared: true, defeated: 'G' });
		const lines = await readLeft(page);
		expect(lines[0]).toContain('岩のゴーレムを倒したか');
	});

	test('④ 島の女王の石碑は、2周目だけ剣士が眠る一行が足される', async ({ page }) => {
		const sign = entryOf(QUEEN_LINES.find((t) => t.name === '女王の 石碑'));
		expect(sign.linesAfterBoss.queen.slice(0, 3)).toEqual(sign.lines);
		await openAt(page, { layer: 'field', stage: '11,19', row: 4, col: 6, cleared: true });
		const q = await readLeft(page, 'up');
		expect(q.at(-1)).toContain('剣を 継ぐ者が、ここで 石と なって 眠る');
		await openAt(page, { layer: 'field', stage: '11,19', row: 4, col: 6, cleared: false });
		const h = await readLeft(page, 'up');
		expect(h.join('')).not.toContain('ここで 石と なって 眠る');
	});
});

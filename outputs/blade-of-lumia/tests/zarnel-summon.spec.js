// tests/zarnel-summon.spec.js
// キュー116 ⑤（2026-11-22 ユーザー提案「闇のザーネルは何か少し強くなった要素をたせるといいかも？たとえば、ランダムに
// 敵キャラを生み出してくるとか（ただし最大でステージ内に3匹ぐらいまで？）」）。game/zarnel-summon.js。
//
// 守るもの：
// ① 女王の周回：戦いの間に手下が現れる。現れる前に床へ予告が出る・手下は呼ぶ敵の候補から・勇者から離れた所
// ② 手下は同時に max 体まで（倒さずに長く待っても増えない）
// ③ 1周目（対照）：同じ時間待っても1体も現れない
// ④ ザーネルを倒すと手下も消える
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { ZARNEL_SUMMON } from '../game/zarnel-summon.js';

const url = (cleared) => `${GAME_URL}?fromEditor=1&layer=dark_tower&stage=5,3&row=2&col=5&ps_sword=2&ps_hearts=15&ps_cleared=${cleared ? 1 : 0}&ps_defeated=G,N,J,A,O,L,I,U`;

async function open(page, cleared) {
	await page.goto(url(cleared));
	await waitForBoard(page);
	await page.evaluate(() => {
		window.__game.pause();
		// ザーネルは歩かせない・勇者は倒れない（呼び出しだけを測る）
		const z = window.__game.getEnemies().find((e) => e.type === 'Z');
		window.__game.setEnemyFieldForTest(z.id, { speed: 0 });
	});
}

/** n tick 進めながら、手下の数・予告の有無を記録する */
async function run(page, ticks) {
	return page.evaluate((n) => {
		const log = { maxCount: 0, warnSeen: false, warnBeforeFirst: false, spawns: [] };
		const known = new Set();
		for (let i = 0; i < n; i++) {
			const p = window.__game.getPlayer();
			p.hp = p.maxHp;
			window.__game.step(1);
			const warn = !!document.getElementById('summon-warn');
			if (warn) log.warnSeen = true;
			const minions = window.__game.getEnemies().filter((e) => String(e.id).startsWith('summon-'));
			for (const m of minions) {
				if (known.has(m.id)) continue;
				known.add(m.id);
				if (log.spawns.length === 0) log.warnBeforeFirst = log.warnSeen;
				log.spawns.push({ type: m.type, dist: Math.hypot(m.y - p.y, m.x - p.x) });
			}
			log.maxCount = Math.max(log.maxCount, minions.length);
		}
		return log;
	}, ticks);
}

test.describe('Blade of Lumia – 女王の周回の闇のザーネルは手下を呼ぶ（キュー116 ⑤）', () => {
	test('① 女王の周回：予告の後に手下が現れる（候補の敵・勇者から離れた所）', async ({ page }) => {
		await open(page, true);
		const log = await run(page, 120);   // 約 14 秒
		expect(log.spawns.length, '手下が現れない').toBeGreaterThan(0);
		expect(log.warnBeforeFirst, '現れる前に床の予告が出ない').toBe(true);
		for (const s of log.spawns) {
			expect(ZARNEL_SUMMON.pool).toContain(s.type);
			expect(s.dist, '勇者のすぐ近くに現れた').toBeGreaterThanOrEqual(ZARNEL_SUMMON.keepMin - 1);
		}
	});

	test('② 手下は同時に max 体まで', async ({ page }) => {
		await open(page, true);
		const log = await run(page, 400);   // 約 48 秒（倒さずに待つ）
		expect(log.maxCount, '溜まり方を測れていない').toBe(ZARNEL_SUMMON.max);
	});

	test('③ 1周目（対照）：手下は現れない', async ({ page }) => {
		await open(page, false);
		const log = await run(page, 120);
		expect(log.spawns).toEqual([]);
		expect(log.warnSeen).toBe(false);
	});

	test('④ ザーネルを倒すと手下も消える', async ({ page }) => {
		await open(page, true);
		const log = await run(page, 120);
		expect(log.spawns.length).toBeGreaterThan(0);
		const z = await page.evaluate(() => window.__game.getEnemies().find((e) => e.type === 'Z').id);
		await page.evaluate((id) => window.__game.dealDamage(id, 9999, 'sword'), z);
		await page.evaluate(() => window.__game.step(2));
		const left = await page.evaluate(() => window.__game.getEnemies().filter((e) => String(e.id).startsWith('summon-')).length);
		expect(left, '主が倒れても手下が残った').toBe(0);
		await expect(page.locator('#char-layer [id^="char-enemy-summon-"]')).toHaveCount(0);
	});
});

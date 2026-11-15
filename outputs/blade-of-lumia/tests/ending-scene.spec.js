// キュー108（2026-11-15 ユーザー指定「ザーネルを倒した瞬間スタッフロールになってしまう…倒しただけでは終わらないようにしたい」
// 「姫の復活によって世界を救われていく感じを」）：ザーネルを倒す → 最期の言葉 → 女王の石碑の島で女王が目覚めて話す
// → 世界が戻っていく（各地の画面＋一行）→ はじまりの村 → スタッフロール。場面の一覧は game/ending-scene.js FINALE。
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { FINALE } from '../game/ending-scene.js';

test('ザーネルを倒すと、最期の言葉 → 女王の目覚め → 世界が戻る → 村 → スタッフロールの順', async ({ page }) => {
	test.setTimeout(120000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(`${GAME_URL}?fromEditor=1&layer=dark_tower&stage=5,3&row=7&col=5&ps_weapon=1&ps_defeated=G,N,J,A,O,L,I,U`);
	await waitForBoard(page);
	await page.waitForTimeout(800);
	const z = await page.evaluate(() => window.__game.getEnemies().find((e) => e.type === 'Z')?.id);
	expect(z, 'ザーネルが居ない').toBeTruthy();
	await page.evaluate((id) => window.__game.dealDamage(id, 9999, 'sword'), z);

	const seen = { names: [], captions: [], queenOnIsland: false, stoneFirst: false, pulses: new Set() };
	// 2026-11-15 ユーザー報告「シーンの間に毒をうけたと表示されてた」＝場面の間に世界が進まない（HP も減らない）
	const hp0 = await page.evaluate(() => window.__game.getPlayer().hp);
	const t0 = Date.now();
	let ended = false;
	while (Date.now() - t0 < 100000 && !ended) {
		await page.waitForTimeout(250);
		const st = await page.evaluate(() => ({
			dlg: !document.getElementById('dialog-overlay').classList.contains('hidden'),
			name: document.getElementById('dialog-name')?.textContent,
			cap: document.getElementById('ending-caption')?.classList.contains('on') ? document.getElementById('ending-caption').textContent : '',
			queen: !!document.querySelector('.ending-queen'),
			stone: !!document.querySelector('.ending-queen.stone'),
			ending: !document.getElementById('ending-overlay').classList.contains('hidden'),
			msg: document.getElementById('msg-bar')?.classList.contains('hidden') ? '' : document.getElementById('msg-bar')?.textContent,
			hp: window.__game.getPlayer().hp,
		}));
		if (st.msg) seen.pulses.add(st.msg);
		if (!st.ending) expect(st.hp, '場面の間に HP が減った').toBe(hp0);
		if (st.stone && !seen.queenOnIsland) seen.stoneFirst = true;
		if (st.queen) seen.queenOnIsland = true;
		if (st.cap && seen.captions.at(-1) !== st.cap) seen.captions.push(st.cap);
		if (st.dlg) {
			if (seen.names.at(-1) !== st.name) seen.names.push(st.name);
			await page.keyboard.press('Space');
		}
		ended = st.ending;
	}
	expect(errors).toEqual([]);
	expect([...seen.pulses].filter((m) => /毒|ダメージ|拾った|手に入れた/.test(m)), '場面の間に世界の出来事の知らせが出た').toEqual([]);
	expect(ended, 'スタッフロールまで行かない').toBe(true);
	expect(seen.names).toEqual([FINALE.zarnel.name, FINALE.queen.name, ...FINALE.village.talks.map((t) => t.name)]);
	expect(seen.stoneFirst, '女王が石（灰色）から始まらない').toBe(true);
	expect(seen.captions).toEqual(FINALE.restore.map((s) => s.text));
});

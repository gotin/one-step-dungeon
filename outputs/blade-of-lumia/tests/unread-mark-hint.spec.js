// ── tests/unread-mark-hint.spec.js ── 実行キュー61 ──────────────────────
// 不変条件：**目的地マークをくれる台詞をまだ聞いていない相手は、画面で目立つ。**
// ユーザーの言葉（2026-10-13・プレイメモ field 3,11）＝「二つ目のダンジョンが意外にわからない。
// 南西と言われて彷徨った」→「新たにメッセージが変わったNPC／石碑は何かしらの方法で目立たせる。
// 石碑ならワープとは違う形で点滅、NPCなら吹き出しマーク」。
//
// 「まだ聞いていない」はセーブに記録を持たずに導く＝**今の版が教える行き先のうち、まだ地図に
// 記されていないものがある**（game/ui.js refreshUnreadMarks の注記）。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 立て物：版が切り替わる前から光る／切り替わっても光らない／読んでも消えない
//   ② 人：吹き出しが出ない／読んでも残る
//   ③ 同じ行き先をもう持っているのに出る
//   ④ 開始の会話で記した老賢者に出る／HUD の更新で付け直されない
//   ⑤ 道具の版（item:）が拾った直後に反映されない
//   ⑥ 台詞が変わっただけ（行き先を持たない版）で出る

import { test, expect } from '@playwright/test';
import { gotoFreshGame, GAME_URL, SAVE_KEY, waitForBoard, dismissIntroDialog } from './helpers.js';

const unreadCells = (page) => page.evaluate(() =>
	[...document.querySelectorAll('.mark-unread-npc, .mark-unread-sign')]
		.map(e => `${e.dataset.row},${e.dataset.col}:${e.classList.contains('mark-unread-npc') ? 'npc' : 'sign'}`));
const bubbleCount = (page) => page.locator('#board canvas.mark-bubble').count();

async function enter(page, sk, r, c, setup = {}) {
	await page.evaluate(({ sk, r, c, setup }) => {
		const p = window.__game.getPlayer();
		for (const b of setup.defeated ?? []) p.defeatedBosses.add(b);
		window.__game.enterStage('field', sk, r, c);
	}, { sk, r, c, setup });
}

/** 隣に立って向きを合わせ、実際の口（攻撃ボタン）で読み、最後まで送って閉じる */
async function readFacing(page, dir) {
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	await page.evaluate(() => window.__game.swordAttack());
	await expect(page.locator('#dialog-overlay')).toBeVisible();
	for (let i = 0; i < 30 && await page.locator('#dialog-overlay').isVisible(); i++) {
		await page.keyboard.press('Space');
	}
	await expect(page.locator('#dialog-overlay')).toBeHidden();
}

test.describe('キュー61 未読の目的地の印', () => {
	test('① 石碑（field 6,13）＝G を倒すまで光らず、倒すと金に点滅し、読むと消える', async ({ page }) => {
		await gotoFreshGame(page);
		await enter(page, '6,13', 7, 9);
		expect(await unreadCells(page), 'G を倒す前から光っている').toEqual([]);

		await enter(page, '6,13', 7, 9, { defeated: ['G'] });
		expect(await unreadCells(page)).toEqual(['7,8:sign']);
		// 点滅は CSS のアニメーション＝付いていることだけ見る（灯った転移の石碑は静止の水色）
		const anim = await page.locator('.cell[data-row="7"][data-col="8"] > canvas.sprite')
			.evaluate(el => getComputedStyle(el).animationName);
		expect(anim).toBe('mark-unread-glow');

		await readFacing(page, 'left');
		expect(await unreadCells(page), '読んだのに印が残る').toEqual([]);
		const marks = await page.evaluate(() => window.__game.getPlayer().mapMarks.map(m => m.stage));
		expect(marks).toContain('2,15');
	});

	test('② 人（賢者エルン・field 13,5）＝O の後に吹き出しが出て、読むと消える', async ({ page }) => {
		await gotoFreshGame(page);
		await enter(page, '13,5', 4, 6);
		expect(await bubbleCount(page), 'O を倒す前から吹き出しがある').toBe(0);

		await enter(page, '13,5', 4, 6, { defeated: ['O'] });
		expect(await unreadCells(page)).toEqual(['4,5:npc']);
		expect(await bubbleCount(page)).toBe(1);

		await readFacing(page, 'left');
		expect(await unreadCells(page)).toEqual([]);
		expect(await bubbleCount(page), '読んだのに吹き出しが残る').toBe(0);
	});

	test('③ 同じ行き先をもう持っていれば出ない', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate(() => {
			window.__game.getPlayer().mapMarks.push({ layer: 'field', stage: '15,4', label: '氷の廃墟', kind: 'dungeon' });
		});
		await enter(page, '13,5', 4, 6, { defeated: ['O'] });
		expect(await unreadCells(page)).toEqual([]);
	});

	test('④ 老賢者＝開始の会話で記した∴出ない／印を失えば HUD の更新で付き直す', async ({ page }) => {
		await page.addInitScript((key) => { try { localStorage.removeItem(key); } catch { /* noop */ } }, SAVE_KEY);
		await page.goto(GAME_URL);
		await waitForBoard(page);
		await dismissIntroDialog(page);
		expect(await bubbleCount(page), '開始の会話で記したのに吹き出しが出ている').toBe(0);

		await page.evaluate(() => { window.__game.getPlayer().mapMarks = []; window.__game.updateHud(); });
		expect(await unreadCells(page)).toEqual(['3,3:npc']);
	});

	test('⑤ 道具の版＝笛を手にした瞬間に古道の道標（field 0,2）が光る', async ({ page }) => {
		await gotoFreshGame(page);
		await enter(page, '0,2', 5, 6);
		expect(await unreadCells(page)).toEqual([]);
		await page.evaluate(() => window.__game.giveSubItem('flute'));
		await page.evaluate(() => window.__game.updateHud());
		expect(await unreadCells(page)).toEqual(['5,5:sign']);
	});

	test('⑥ 台詞が変わっただけ（行き先を持たない版）では出ない＝タロ（field 7,14）', async ({ page }) => {
		await gotoFreshGame(page);
		// 印は老賢者の分だけ持たせる＝タロの版だけを見る
		await page.evaluate(() => {
			window.__game.getPlayer().mapMarks.push({ layer: 'field', stage: '6,13', label: '草原の洞窟', kind: 'dungeon' });
		});
		await enter(page, '7,14', 6, 5, { defeated: ['G', 'N', 'J'] });
		const cells = await unreadCells(page);
		// 諦めた老人（7,3）は U の版だけが印を持つ∴ここでは出ない。
		expect(cells).toEqual([]);
	});
});

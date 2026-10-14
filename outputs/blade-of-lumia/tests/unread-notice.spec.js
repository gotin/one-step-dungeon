// ── tests/unread-notice.spec.js ── 実行キュー64 ──────────────────────
// 不変条件：**データで「印を出す」と決めた版（`notifyAfterBoss`）は、行き先を持たなくても、
// まだ読んでいなければ未読の印（人＝吹き出し）が出る。読んだら消え、セーブに残る。**
// ユーザーの言葉（2026-10-14）＝「このメッセージはマップ位置のことじゃないから吹き出しはでないんだね。
// でもこのケースも吹き出しあった方がいい気がする」→ 合意＝版ごとに opt-in（キュー61 の
// 「台詞が変わっただけでは出さない」は崩さない＝フラグの無い版は今までどおり出ない）。
//
// 🔴 当て所：
//   ① フラグの版が出ていない（盾を持たない）のに出る
//   ② フラグの版が出ているのに出ない（地図の印だけを見ている）
//   ③ 読んでも消えない／「読んだ版」がセーブに残らない／入り直すと復活する
//   ④ データの読み書きでフラグが落ちる・本文の無い版に残る
//   ⑤ 壊れたセーブ値で落ちる

import { test, expect } from '@playwright/test';
import { gotoFreshGame, SAVE_KEY } from './helpers.js';
import { readEntryVariants, applyEntryVariants, variantOptions, noticeId } from '../shared/dialog-variants.js';
import { sanitizeLoadedPlayer } from '../game/save.js';
import { ITEM_META } from '../shared/items.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAP = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const VET_ID = noticeId('field', '6,13', '8,10', 'item:shield');

const bubbleAt = (page, r, c) => page.locator(`#board .cell[data-row="${r}"][data-col="${c}"] canvas.mark-bubble`).count();

async function enterCave(page, { shield }) {
	await page.evaluate((shield) => {
		const p = window.__game.getPlayer();
		if (shield) { p.shield = 'shield'; p.shieldTier = 0; }
		// 老兵の西隣 (8,9)
		window.__game.enterStage('field', '6,13', 8, 9);
	}, shield);
}

async function talkRight(page) {
	await page.evaluate(() => { window.__game.setHeroDir('right'); window.__game.swordAttack(); });
	await expect(page.locator('#dialog-overlay')).toBeVisible();
	for (let i = 0; i < 30 && await page.locator('#dialog-overlay').isVisible(); i++) {
		await page.keyboard.press('Space');
	}
	await expect(page.locator('#dialog-overlay')).toBeHidden();
}

test.describe('キュー64 印を出すと決めた版の未読の吹き出し', () => {
	test('①② 盾を持たない＝出ない／持つ＝老兵に吹き出し', async ({ page }) => {
		await gotoFreshGame(page);
		await enterCave(page, { shield: false });
		expect(await bubbleAt(page, 8, 10), '盾を持たないのに吹き出しが出た（基本の台詞は印を出さない）').toBe(0);
		await enterCave(page, { shield: true });
		expect(await bubbleAt(page, 8, 10), '盾の版（notify）が出ているのに吹き出しが無い').toBe(1);
		// 隣のハナ（フラグの無い版しか持たない）には出ない
		expect(await bubbleAt(page, 5, 7)).toBe(0);
	});

	test('③ 読むと消え、「読んだ版」がセーブに残り、入り直しても出ない', async ({ page }) => {
		await gotoFreshGame(page);
		await enterCave(page, { shield: true });
		expect(await bubbleAt(page, 8, 10)).toBe(1);
		await talkRight(page);
		expect(await bubbleAt(page, 8, 10), '読んだのに吹き出しが残る').toBe(0);
		const read = await page.evaluate(() => window.__game.getPlayer().readNotices);
		expect(read).toEqual([VET_ID]);
		const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
		expect(saved.player.readNotices, '読んだ版がセーブに入っていない').toContain(VET_ID);
		// 画面を出て入り直す（盤面を描き直す＝印は状態から導き直される）
		await page.evaluate(() => window.__game.enterStage('field', '7,14', 4, 5));
		await enterCave(page, { shield: true });
		expect(await bubbleAt(page, 8, 10), '入り直したら吹き出しが戻った').toBe(0);
	});

	test('④ データ：フラグは読み書きで保たれ、本文の無い版には書かれない', () => {
		const opts = variantOptions(MAP);
		const vet = MAP.layers.field.stages['6,13'].npcData['8,10'];
		expect(vet.notifyAfterBoss, '老兵の盾の版に印のフラグが無い').toEqual({ 'item:shield': true });
		const got = readEntryVariants(vet, opts);
		expect(got.find((v) => v.key === 'item:shield').notify).toBe(true);
		const clone = JSON.parse(JSON.stringify(vet));
		applyEntryVariants(clone, got);
		expect(JSON.stringify(clone), '往復でフラグが変わった').toBe(JSON.stringify(vet));
		// 本文の無い版のフラグは書かない／全部外せばキーごと消える
		const e = {};
		applyEntryVariants(e, [{ key: 'G', lines: [], notify: true }, { key: 'O', lines: ['x'], notify: false }]);
		expect(e.notifyAfterBoss).toBeUndefined();
	});

	test('⑤ セーブの読み込み：壊れた値は []・重複と文字列以外を落とす', () => {
		expect(sanitizeLoadedPlayer({ readNotices: 'x' }, ITEM_META).readNotices).toEqual([]);
		expect(sanitizeLoadedPlayer({}, ITEM_META).readNotices).toEqual([]);
		expect(sanitizeLoadedPlayer({ readNotices: ['a', 'a', 3, null] }, ITEM_META).readNotices).toEqual(['a']);
	});
});

// プレイメモ（実行キュー57）の番人。
//
// プレビュー（fromEditor=1）で N キー → ゲームが止まって入力欄が開き、保存すると
// 開発サーバの受け口（/__playtest-notes＝scripts/vite-playtest-notes.mjs）へ
// {layer, stage, row, col, text, preview} が届く。サーバが work/playtest-notes.json に書く。
//
// 固定すること：
//   ① サーバ側：足す／消す／空の本文は捨てる／壊れたファイルは上書きしない
//   ② 入力欄で打った W/A/S/D・Space・Z・B・F・G はゲームへ届かない（勇者が動かない・世界が止まる）
//   ③ 保存で居場所と本文と再現用のプレビュー設定が届き、閉じるとゲームが再開する
//   ④ Esc は枠を閉じるだけ（ポーズ画面を開かない）
//   ⑤ ポーズ中に開いて閉じてもポーズのまま（こちらが止めたのでないなら再開しない）
//   ⑥ サーバに届かなければ控えに残し、次の保存でまとめて送る（メモを黙って失わない）
//   ⑦ 通常プレイ（fromEditor なし）では出ない
//
// ⚠️ ブラウザ側のテストは受け口を page.route で差し替える＝本物の work/playtest-notes.json を書かない
//    （起動済みの開発サーバに受け口が無くても＝プラグイン追加前の古いサーバでも動く）。
import { test, expect } from '@playwright/test';
import { writeFileSync, readFileSync } from 'fs';
import { GAME_URL, waitForBoard, gotoFreshGame } from './helpers.js';
import { appendNotes, deleteNote, readNotes } from '../scripts/vite-playtest-notes.mjs';

// はじめの村の床（8,5）から始める。ps_hearts は「プレビュー設定が残るか」を見るための目印。
const PREVIEW_URL = `${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=8&col=5&ps_hearts=5`;

const state = (page) => page.evaluate(() => window.__game.getState());

/** 受け口を差し替える。届いた POST の本文を posts に貯める。fail=true の間は落とす。 */
async function mockEndpoint(page) {
	const ctl = { posts: [], fail: false, stored: [] };
	await page.route('**/__playtest-notes**', async (route) => {
		const req = route.request();
		if (ctl.fail) return route.abort();
		if (req.method() === 'POST') {
			const body = JSON.parse(req.postData() || '{}');
			ctl.posts.push(body);
			for (const n of body.notes) ctl.stored.push({ id: `id${ctl.stored.length}`, ...n });
			return route.fulfill({ json: { count: ctl.stored.length, ids: [] } });
		}
		return route.fulfill({ json: ctl.stored });
	});
	return ctl;
}

async function openPreview(page) {
	await page.goto(PREVIEW_URL);
	await waitForBoard(page);
	await expect(page.locator('#pnote-btn')).toBeVisible();
}

test.describe('① サーバ側（work/playtest-notes.json の読み書き）', () => {
	test('足す・消す・空の本文は捨てる', async () => {
		const file = test.info().outputPath('notes.json');
		expect(readNotes(file)).toEqual([]);
		const r1 = appendNotes(file, [
			{ layer: 'field', stage: '6,13', row: 3, col: 2, text: '  看板の話が変  ', preview: 'ps_bow=1' },
			{ layer: 'field', stage: '6,13', row: 3, col: 2, text: '   ' },
		]);
		expect(r1.count).toBe(1);
		const notes = readNotes(file);
		expect(notes[0]).toMatchObject({ layer: 'field', stage: '6,13', row: 3, col: 2, text: '看板の話が変', preview: 'ps_bow=1' });
		expect(notes[0].id).toBeTruthy();
		expect(notes[0].createdAt).toBeTruthy();
		appendNotes(file, [{ layer: 'dungeon1', stage: '0,0', row: 1, col: 1, text: '二件目' }]);
		expect(readNotes(file)).toHaveLength(2);
		expect(deleteNote(file, notes[0].id).count).toBe(1);
		expect(readNotes(file).map((n) => n.text)).toEqual(['二件目']);
	});

	test('壊れたファイルは上書きしない（例外で止める）', async () => {
		const file = test.info().outputPath('broken.json');
		writeFileSync(file, '{ 書きかけ');
		expect(() => appendNotes(file, [{ text: 'x' }])).toThrow();
		expect(readFileSync(file, 'utf8')).toBe('{ 書きかけ');
	});
});

test.describe('プレビューでの操作', () => {
	test('②③ 打ったキーはゲームへ届かず、保存で居場所と本文が届いて再開する', async ({ page }) => {
		const ctl = await mockEndpoint(page);
		await openPreview(page);
		const before = await state(page);
		expect(before.isPaused).toBe(false);

		await page.keyboard.press('n');
		await expect(page.locator('#pnote-overlay')).toBeVisible();
		await expect(page.locator('#pnote-where')).toContainText('field 7,14');
		const opened = await state(page);
		expect(opened.isPaused).toBe(true);

		// ゲームの操作キーを全部まぜて打つ（Space・Z＝剣、B＝道具、F＝飛行、G＝デバッグ）
		const typed = 'wasd WASD zb fg 柵';
		await page.locator('#pnote-text').pressSequentially(typed);
		// 方向キーを押しっぱなしにしても歩かない
		await page.keyboard.down('d');
		await page.waitForTimeout(400);
		await page.keyboard.up('d');
		await expect(page.locator('#pnote-text')).toHaveValue(`${typed}d`);
		const during = await state(page);
		expect(during.player.x).toBe(before.player.x);
		expect(during.player.y).toBe(before.player.y);
		expect(during.gameTime).toBe(opened.gameTime);   // 世界が止まっている
		await expect(page.locator('#pause-overlay')).toBeHidden();

		await page.keyboard.press('Control+Enter');
		await expect(page.locator('#pnote-overlay')).toBeHidden();
		expect(ctl.posts).toHaveLength(1);
		expect(ctl.posts[0].notes).toHaveLength(1);
		expect(ctl.posts[0].notes[0]).toMatchObject({
			layer: 'field', stage: '7,14', row: 8, col: 5, text: `${typed}d`, preview: 'ps_hearts=5',
		});

		// 閉じたらゲームが再開する（論理時間が進む）
		expect((await state(page)).isPaused).toBe(false);
		await expect.poll(async () => (await state(page)).gameTime).toBeGreaterThan(opened.gameTime);
		await expect(page.locator('#pnote-count')).toHaveText('1');
	});

	test('④ Esc は枠を閉じるだけ（ポーズ画面を開かない・何も送らない）', async ({ page }) => {
		const ctl = await mockEndpoint(page);
		await openPreview(page);
		await page.keyboard.press('n');
		await page.locator('#pnote-text').fill('送らない');
		await page.keyboard.press('Escape');
		await expect(page.locator('#pnote-overlay')).toBeHidden();
		await expect(page.locator('#pause-overlay')).toBeHidden();
		expect((await state(page)).isPaused).toBe(false);
		expect(ctl.posts).toHaveLength(0);
	});

	test('⑤ ポーズ中に開いて閉じてもポーズのまま', async ({ page }) => {
		await mockEndpoint(page);
		await openPreview(page);
		await page.keyboard.press('Escape');
		await expect(page.locator('#pause-overlay')).toBeVisible();
		await page.keyboard.press('n');
		await expect(page.locator('#pnote-overlay')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('#pnote-overlay')).toBeHidden();
		await expect(page.locator('#pause-overlay')).toBeVisible();
		expect((await state(page)).isPaused).toBe(true);
	});

	test('⑥ サーバに届かなければ控えに残し、次の保存でまとめて送る', async ({ page }) => {
		const ctl = await mockEndpoint(page);
		await openPreview(page);
		ctl.fail = true;
		await page.keyboard.press('n');
		await page.locator('#pnote-text').fill('一件目');
		await page.keyboard.press('Control+Enter');
		await expect(page.locator('#pnote-status')).toContainText('控えに残しました');
		await expect(page.locator('#pnote-overlay')).toBeVisible();   // 閉じずに知らせる
		const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('bladeOfLumiaPlaytestNotesPending')));
		expect(pending.map((n) => n.text)).toEqual(['一件目']);

		ctl.fail = false;
		await page.locator('#pnote-text').fill('二件目');
		await page.keyboard.press('Control+Enter');
		await expect(page.locator('#pnote-overlay')).toBeHidden();
		expect(ctl.posts).toHaveLength(1);
		expect(ctl.posts[0].notes.map((n) => n.text)).toEqual(['一件目', '二件目']);
		expect(await page.evaluate(() => localStorage.getItem('bladeOfLumiaPlaytestNotesPending'))).toBeNull();
	});
});

test('⑦ 通常プレイ（fromEditor なし）では出ない', async ({ page }) => {
	await gotoFreshGame(page);
	await expect(page.locator('#pnote-btn')).toBeHidden();
	await page.keyboard.press('n');
	await expect(page.locator('#pnote-overlay')).toBeHidden();
});

// Phase 6-4: 嘘をつくNPC テスト
//
// 検証:
//  1) 3体の嘘つきNPCがJSON内に正しく配置されている（データレベル）
//  2) 各NPCに嘘らしい台詞（矛盾する情報）が設定されている
//  3) field 6,13 (3,2) の冒険者が実際にダイアログを開く（E2E）
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const GAME = '/blade-of-lumia/game/';

test.describe('Blade of Lumia – 嘘をつくNPC', () => {
	test('field 6,13 (3,2) に嘘つき冒険者が配置されている', () => {
		const stage = MAP.layers.field.stages['6,13'];
		const row3 = stage.tiles[3];
		const arr = Array.isArray(row3) ? row3 : row3.split('');
		expect(arr[2]).toBe('a');
		const npc = stage.npcData?.['3,2'];
		expect(npc).toBeDefined();
		expect(npc.name).toBeTruthy();
		// 嘘の内容：ブーメランや宝箱は無意味・何もないと言っている
		const allLines = npc.lines.join(' ');
		expect(allLines).toMatch(/ブーメラン|宝箱|何もない/);
	});

	test('field 9,9 (4,5) に嘘つき旅人が配置されている', () => {
		const stage = MAP.layers.field.stages['9,9'];
		const row4 = stage.tiles[4];
		const arr = Array.isArray(row4) ? row4 : row4.split('');
		expect(arr[5]).toBe('a');
		const npc = stage.npcData?.['4,5'];
		expect(npc).toBeDefined();
		expect(npc.name).toBeTruthy();
		// 嘘の内容：茂みの先は行き止まりと言っているが実際は隠し入口がある
		const allLines = npc.lines.join(' ');
		expect(allLines).toMatch(/茂み|行き止まり|何もない/);
	});

	test('field 7,14 (7,3) に諦めた老人が配置されている', () => {
		const stage = MAP.layers.field.stages['7,14'];
		const row7 = stage.tiles[7];
		const arr = Array.isArray(row7) ? row7 : row7.split('');
		expect(arr[3]).toBe('b');
		const npc = stage.npcData?.['7,3'];
		expect(npc).toBeDefined();
		expect(npc.name).toBeTruthy();
		// 嘘の内容：祭壇は無意味・女王を助けられないと言っている
		const allLines = npc.lines.join(' ');
		expect(allLines).toMatch(/祭壇|女王|あきらめ/);
	});

	test('field 6,13 の嘘つき冒険者に話しかけるとダイアログが開く（JSエラーなし）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '6,13',
			row: '3', col: '1',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
		// 右向きに移動して剣で話しかける（NPC は (3,2) = 右）
		await page.evaluate(() => window.__game.movePlayer('right'));
		await page.evaluate(() => window.__game.step(1));
		await page.evaluate(() => window.__game.swordAttack());
		await page.waitForTimeout(150);
		const dialogEl = page.locator('#dialog-overlay');
		await dialogEl.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
		const name = await page.locator('#dialog-name').textContent().catch(() => '');
		expect(name).not.toBe('');
		expect(errors).toHaveLength(0);
	});
});

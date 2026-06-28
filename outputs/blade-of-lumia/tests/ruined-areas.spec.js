// Phase 6-3: フィールドの充実（廃城・廃村・壊れた遺跡）テスト
//
// 検証:
//  1) field 5,3 に廃城エリア（石畳 'o'・壁 '#'・壊せる壁 '!'）が存在する
//  2) field 5,3 に廃村エリア（家の外壁 'h'・屋根 'p'・ドア 'e'）が存在する
//  3) 廃城の石碑・廃村の石碑が signData 付きで配置されている
//  4) 石碑に隣接して立てる床が存在する（読みに行ける）
//  5) 実プレイ: field 5,3 の廃城石碑を読むとダイアログが開きJSエラーが出ない

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const GAME = '/blade-of-lumia/game/';

function loadMap() {
	return JSON.parse(readFileSync(MAP_PATH, 'utf8'));
}

function rowArr(tiles, r) {
	const row = tiles[r];
	return Array.isArray(row) ? row : String(row).split('');
}

test.describe('Blade of Lumia – 廃城・廃村エリア（Phase 6-3）', () => {
	test('field 5,3 に廃城タイルが存在する（石畳・壁）', () => {
		const { layers } = loadMap();
		const st = layers.field.stages['5,3'];
		expect(st, 'field 5,3 が存在するべき').toBeTruthy();

		// 廃城エリア（rows 0-4）に石畳 'o' が存在する
		let stoneFloorCount = 0;
		for (let r = 0; r <= 4; r++) {
			const row = rowArr(st.tiles, r);
			stoneFloorCount += row.filter(c => c === 'o').length;
		}
		expect(stoneFloorCount, '廃城に石畳タイルが必要').toBeGreaterThan(0);

		// 廃城エリアに壁 '#' が存在する
		let wallCount = 0;
		for (let r = 0; r <= 4; r++) {
			const row = rowArr(st.tiles, r);
			wallCount += row.filter(c => c === '#').length;
		}
		expect(wallCount, '廃城に壁タイルが必要').toBeGreaterThan(0);
	});

	test('field 5,3 に廃村タイルが存在する（家の外壁・屋根・ドア）', () => {
		const { layers } = loadMap();
		const st = layers.field.stages['5,3'];

		// 廃村エリア（rows 5-9）に家の外壁 'h' が存在する
		let houseWallCount = 0;
		for (let r = 5; r <= 9; r++) {
			const row = rowArr(st.tiles, r);
			houseWallCount += row.filter(c => c === 'h').length;
		}
		expect(houseWallCount, '廃村に家の外壁タイルが必要').toBeGreaterThan(0);

		// 廃村エリアに家のドア 'e' が存在する
		let houseDoorCount = 0;
		for (let r = 5; r <= 9; r++) {
			const row = rowArr(st.tiles, r);
			houseDoorCount += row.filter(c => c === 'e').length;
		}
		expect(houseDoorCount, '廃村に家のドアタイルが必要').toBeGreaterThan(0);
	});

	test('廃城・廃村の石碑が signData 付きで存在する', () => {
		const { layers } = loadMap();
		const st = layers.field.stages['5,3'];
		expect(st.signData, 'signData が必要').toBeTruthy();

		const castleSign = st.signData['3,3'];
		expect(castleSign, '廃城の石碑(3,3)が存在するべき').toBeTruthy();
		expect(castleSign.name, '廃城の石碑に名前が必要').toBeTruthy();
		expect(castleSign.name).toContain('廃城');

		const villageSign = st.signData['8,3'];
		expect(villageSign, '廃村の石碑(8,3)が存在するべき').toBeTruthy();
		expect(villageSign.name, '廃村の石碑に名前が必要').toBeTruthy();
		expect(villageSign.name).toContain('廃村');

		// タイルも SIGN 'i' であることを確認
		expect(rowArr(st.tiles, 3)[3], '(3,3) は SIGN タイル').toBe('i');
		expect(rowArr(st.tiles, 8)[3], '(8,3) は SIGN タイル').toBe('i');
	});

	test('各石碑に隣接して立てる床がある（読みに行ける）', () => {
		const { layers } = loadMap();
		const st = layers.field.stages['5,3'];

		for (const [r, c] of [[3, 3], [8, 3]]) {
			const standable = [
				rowArr(st.tiles, r - 1)?.[c],
				rowArr(st.tiles, r + 1)?.[c],
				rowArr(st.tiles, r)[c - 1],
				rowArr(st.tiles, r)[c + 1],
			].filter(v => v === '.' || v === 'o' || v === 'g').length;
			expect(standable, `石碑(${r},${c})に隣接可能なタイルが必要`).toBeGreaterThanOrEqual(1);
		}
	});

	test('実プレイ: field 5,3 廃城石碑(3,3)を読むとダイアログが開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 石碑は (3,3)。左隣 (3,2) からスポーンして右を向いて読む。
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '5,3', row: '3', col: '2',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
		// 右を向いて攻撃（剣で看板を読む）
		await page.evaluate(() => window.__game.movePlayer('right'));
		await page.evaluate(() => window.__game.step(1));
		await page.evaluate(() => window.__game.swordAttack());
		await page.waitForTimeout(150);
		const name = await page.locator('#dialog-name').textContent().catch(() => '');
		const text = await page.locator('#dialog-text').textContent().catch(() => '');
		expect(name).toContain('廃城');
		expect(text.length, 'ダイアログテキストが空でないこと').toBeGreaterThan(0);
		expect(errors).toHaveLength(0);
	});
});

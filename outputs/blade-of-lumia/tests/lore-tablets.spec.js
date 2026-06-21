// Phase 6-2: 世界の歴史を語る石碑（ザーネルの記憶）テスト
//
// 検証:
//  1) 8つの「ザーネルの記憶」石碑が想定どおりのレイヤー/座標に SIGN タイル('i')
//     として存在し、signData に台詞が紐づいている（データレベル・決定論的）
//  2) 各石碑のセルに隣接して立てる床('.')が存在する（読みに行ける配置か）
//  3) 8断片が「其の一〜七＋終章」の順で揃っている（物語の連続性）
//  4) 実プレイ: dungeon_1 entry room (0,0) の石碑(1,9)を読むとダイアログに
//     「ザーネルの記憶」が表示され、JSエラーが出ない
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const GAME = '/blade-of-lumia/game/';

// 期待する8石碑（読む順 = 物語の順）
const TABLETS = [
	{ layer: 'dungeon_1', stage: '0,0', key: '1,9', frag: '其の一' },
	{ layer: 'dungeon_2', stage: '0,0', key: '1,1', frag: '其の二' },
	{ layer: 'dungeon_3', stage: '0,0', key: '1,9', frag: '其の三' },
	{ layer: 'dungeon_4', stage: '0,0', key: '1,5', frag: '其の四' },
	{ layer: 'dungeon_5', stage: '0,0', key: '1,5', frag: '其の五' },
	{ layer: 'dungeon_6', stage: '0,0', key: '1,5', frag: '其の六' },
	{ layer: 'dungeon_7', stage: '0,0', key: '1,5', frag: '其の七' },
	{ layer: 'dark_tower', stage: '0,1', key: '1,1', frag: '終章' },
];

function loadMap() {
	return JSON.parse(readFileSync(MAP_PATH, 'utf8'));
}

function rowArr(tiles, r) {
	const row = tiles[r];
	return Array.isArray(row) ? row : String(row).split('');
}

test.describe('Blade of Lumia – ザーネルの記憶 石碑（Phase 6-2）', () => {
	test('8つの石碑が SIGN タイル＋signData として配置されている', () => {
		const { layers } = loadMap();
		for (const t of TABLETS) {
			const st = layers[t.layer].stages[t.stage];
			const [r, c] = t.key.split(',').map(Number);
			expect(rowArr(st.tiles, r)[c], `${t.layer}/${t.stage} @${t.key} は SIGN タイルであるべき`).toBe('i');
			const data = st.signData?.[t.key];
			expect(data, `${t.layer}/${t.stage} @${t.key} に signData があるべき`).toBeTruthy();
			expect(data.name).toContain('ザーネルの記憶');
			expect(data.name).toContain(t.frag);
			expect(Array.isArray(data.lines) && data.lines.length).toBeGreaterThan(0);
		}
	});

	test('各石碑には隣接して立てる床がある（読みに行ける）', () => {
		const { layers } = loadMap();
		for (const t of TABLETS) {
			const st = layers[t.layer].stages[t.stage];
			const [r, c] = t.key.split(',').map(Number);
			const neighbors = [
				rowArr(st.tiles, r - 1)?.[c],
				rowArr(st.tiles, r + 1)?.[c],
				rowArr(st.tiles, r)[c - 1],
				rowArr(st.tiles, r)[c + 1],
			];
			const standable = neighbors.filter((v) => v === '.').length;
			expect(standable, `${t.layer}/${t.stage} @${t.key} に隣接床が必要`).toBeGreaterThanOrEqual(1);
		}
	});

	test('8断片が其の一〜七＋終章まで揃っている', () => {
		const { layers } = loadMap();
		const frags = TABLETS.map((t) => layers[t.layer].stages[t.stage].signData[t.key].name);
		for (const expected of ['其の一', '其の二', '其の三', '其の四', '其の五', '其の六', '其の七', '終章']) {
			expect(frags.some((n) => n.includes(expected)), `${expected} の石碑が存在するべき`).toBe(true);
		}
	});

	test('実プレイ: dungeon_1 entry の石碑を読むと「ザーネルの記憶」が出る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 石碑は (1,9)。左隣 (1,8) からスポーンして右を向いて読む。
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'dungeon_1', stage: '0,0', row: '1', col: '8',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.movePlayer('right'));
		await page.evaluate(() => window.__game.step(1));
		// (1,9) は SIGN タイルなので右へは進めない。右向きのまま攻撃で読む。
		await page.evaluate(() => window.__game.swordAttack());
		await page.waitForTimeout(150);
		// 名前は #dialog-name、本文は #dialog-text に出る。
		const name = await page.locator('#dialog-name').textContent().catch(() => '');
		const text = await page.locator('#dialog-text').textContent().catch(() => '');
		expect(name).toContain('ザーネルの記憶');
		expect(text).toContain('むかし この国に');
		expect(errors).toHaveLength(0);
	});
});

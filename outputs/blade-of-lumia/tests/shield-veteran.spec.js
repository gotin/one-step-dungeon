// tests/shield-veteran.spec.js ── 実行キュー63（2026-10-14）
//
// 草原の洞窟の前（field 6,13 (8,10)）の老兵ガルドが、盾を手にした後に盾の使い方を話す。
// 🔴 当て所＝**盾を持たないときと持つときで台詞が切り替わる**（会話の版 `item:shield`）。
//    2状態で測る＝片方だけだと「常にその版が出る」実装でも緑になる。
//    盾は道具（`subItems`）ではなく装備（`player.shield`）∴`ownsItem()` が装備の置き場を
//    読まないと版が永久にヒットしない（`shared/items.js ITEM_OWNED_FLAG.shield` が歯）。
// 本文は「体当たりは盾で防げない／赤い×」まで全行送って読めることを見る（キュー59 の表示を言葉で補う）。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { itemVariantOptions, VARIANT_ITEM_IDS } from '../shared/dialog-variants.js';
import { ownsItem } from '../shared/items.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const VET = { stage: '6,13', pos: '8,10', rc: [8, 10] };
const entry = MAP.layers.field.stages[VET.stage].npcData[VET.pos];

// 老兵の西隣 (8,9) に立って右を向き、剣で話しかける（会話の口＝combat.js swordAttack）。
async function talkToVeteran(page, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage: VET.stage,
		row: String(VET.rc[0]), col: String(VET.rc[1] - 1), ...extra,
	});
	await page.goto(`${GAME_URL}?${p.toString()}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.setHeroDir('right'));
	await page.evaluate(() => window.__game.swordAttack());
	await expect(page.locator('#dialog-overlay')).toBeVisible();
	await expect(page.locator('#dialog-name')).toHaveText(entry.name);
}

// 1行ずつ Space で送って全行を集める（`window.__game` に advanceDialog は出ていない）。
async function readAllLines(page, max = 12) {
	const lines = [];
	for (let i = 0; i < max; i++) {
		lines.push((await page.locator('#dialog-text').textContent()) ?? '');
		const next = (await page.locator('#dialog-next').textContent()) ?? '';
		if (next.includes('閉じる')) break;
		await page.keyboard.press('Space');
		await page.waitForTimeout(80);
	}
	return lines;
}

test.describe('キュー63 盾の使い方を話す老兵', () => {
	test('① データ：盾の版は版の選択肢から選べる道具で、本文が体当たりと赤い×に触れる', () => {
		expect(entry, '老兵が field 6,13 (8,10) にいない').toBeTruthy();
		expect(MAP.layers.field.stages[VET.stage].tiles[VET.rc[0]][VET.rc[1]], '老兵のタイルが人でない').toBe('b');
		expect(VARIANT_ITEM_IDS, '盾が版の条件にできる一覧に無い').toContain('shield');
		expect(itemVariantOptions().map((o) => o.key), 'エディタの選択肢に盾の版が無い').toContain('item:shield');
		const body = entry.linesAfterBoss['item:shield'].join('\n');
		expect(body, '体当たりは盾で防げないことを言っていない').toMatch(/体ごと.*防げん/);
		expect(body, '赤い×（バツ印）に触れていない').toContain('赤い バツ印');
		// 所持の判定は装備の置き場（player.shield）を読む
		expect(ownsItem({ shield: 'shield', subItems: {} }, 'shield'), '盾の所持を読めない').toBe(true);
		expect(ownsItem({ shield: null, subItems: {} }, 'shield')).toBe(false);
	});

	test('② 盾を持たない＝基本の台詞（盾の在処）', async ({ page }) => {
		await talkToVeteran(page);
		const lines = await readAllLines(page);
		expect(lines, '盾を持たないのに台詞が基本のままでない').toEqual(entry.lines);
	});

	test('③ 盾を持つ＝盾の使い方を最後まで話す', async ({ page }) => {
		await talkToVeteran(page, { ps_shield: '0' });
		const lines = await readAllLines(page);
		expect(lines, '盾を手にしても盾の版に切り替わらない').toEqual(entry.linesAfterBoss['item:shield']);
	});
});

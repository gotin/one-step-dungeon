// tests/field-q13-rewards.spec.js
// 実行キュー13（2026-09-29）：field の「意味ありげなのに報酬がしょぼい」宝箱の差し替え。
// 割り当てはユーザー確定（DECISIONS 2026-09-29（2））＝`scripts/migrate-field-q13-rewards.mjs`。
//
// 縛るもの：
//   ① データ … 11 箱の中身が割り当てどおり・封印（showConditions）はそのまま
//   ② データ … ハートのかけら4個＝器1個ちょうど／爆弾袋・矢筒は各3個＝`shared/items.js` の「最大3個配置」
//   ③ 実プレイ … 宝箱を実際に開けると、かけら・爆弾袋・増額したルピーが手に入る
//      （中身の書き方がエンジンの受け口に合っている＝データだけ直して取れない、を防ぐ）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const FIELD = MAP.layers.field.stages;

const PIECE = { type: 'item', item: 'heartPiece', name: 'ハートのかけら' };
const BOMB_BAG = { type: 'item', item: 'bombBag', name: '爆弾袋' };
const QUIVER = { type: 'item', item: 'quiver', name: '矢筒' };
const rupee = (value) => ({ type: 'rupee', value, name: `ルピー×${value}` });

// [画面, 宝箱, 中身, 封印の trigger（無ければ null）]
const EXPECTED = [
	['15,0',  '3,5', PIECE,       null],
	['4,0',   '1,5', PIECE,       null],
	['3,19',  '4,5', PIECE,       null],
	['13,8',  '6,5', PIECE,       'flutePlayed'],
	['11,17', '7,8', BOMB_BAG,    null],
	['15,5',  '3,4', BOMB_BAG,    null],
	['15,7',  '7,5', QUIVER,      'switchOn'],
	['12,17', '6,5', rupee(150),  null],
	['8,19',  '5,5', rupee(150),  'flutePlayed'],
	['12,1',  '3,7', rupee(50),   null],
	['11,6',  '3,7', rupee(50),   null],
];

function placements(id) {
	const found = [];
	for (const [lk, ld] of Object.entries(MAP.layers)) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [cell, ct] of Object.entries(sd.chestContents ?? {})) {
				if (ct?.item === id) found.push(`${lk}/${sk}(${cell})`);
			}
		}
	}
	return found.sort();
}

test.describe('キュー13 field の報酬の差し替え ① ② データ', () => {
	for (const [room, cell, content, trigger] of EXPECTED) {
		test(`① ${room} (${cell}) は ${content.name}${trigger ? `（${trigger} の封印つき）` : ''}`, () => {
			const st = FIELD[room];
			const [r, c] = cell.split(',').map(Number);
			expect(st.tiles[r][c], '宝箱のタイルでない').toBe(TILE.CHEST);
			expect(st.chestContents?.[cell]).toEqual(content);
			expect(st.showConditions?.[cell]?.trigger ?? null, '封印が変わった').toBe(trigger);
		});
	}

	test('② かけら4個（器1個ちょうど）・爆弾袋3個・矢筒3個', () => {
		expect(placements('heartPiece')).toEqual(
			['field/15,0(3,5)', 'field/4,0(1,5)', 'field/3,19(4,5)', 'field/13,8(6,5)'].sort());
		expect(placements('bombBag'), '爆弾袋＝dark_tower 1,5 ＋ field 2個').toEqual(
			['dark_tower/1,5(3,2)', 'field/11,17(7,8)', 'field/15,5(3,4)'].sort());
		expect(placements('quiver'), '矢筒＝dark_tower 3,2・3,5 ＋ field 1個').toEqual(
			['dark_tower/3,2(5,5)', 'dark_tower/3,5(4,3)', 'field/15,7(7,5)'].sort());
	});
});

// ── ③ 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
async function open(page, stage, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: 'field', stage, row: String(row), col: String(col), ...extra });
	await page.goto(`${GAME_URL}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 1マス＝movePlayer 2回（[[blade-moveplayer-is-half-tile]]）
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const bomb = (page) => page.evaluate(() => {
	window.__game.getPlayer().activeSubItem = 'bomb';
	window.__game.useSubItem();
	for (let i = 0; i < 40; i++) window.__game.step(1);
});
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return {
		r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5),
		pieces: p.heartPieces ?? 0, maxBombs: p.maxBombs, rupees: p.rupees,
		opened: [...window.__game.getStageState().openedChests],
		msg: document.getElementById('msg-bar').textContent,
	};
});

test.describe('キュー13 field の報酬の差し替え ③ 実プレイ', () => {
	test('③ 15,0：宝箱を開けるとハートのかけらが1つ手に入る（あと3つ）', async ({ page }) => {
		const errors = await open(page, '15,0', 4, 5);
		expect((await snap(page)).pieces).toBe(0);
		await walk(page, 'up', 1);
		const s = await snap(page);
		expect(s.opened).toContain('3,5');
		expect(s.pieces, 'かけらが増えない').toBe(1);
		expect(s.msg).toContain('ハートのかけら');
		expect(errors).toEqual([]);
	});

	test('③ 4,0：はしごで穴を渡った先の宝箱でハートのかけら', async ({ page }) => {
		const errors = await open(page, '4,0', 1, 7, { ps_ladder: '1' });
		await walk(page, 'left', 2);
		const s = await snap(page);
		expect({ r: s.r, c: s.c }, '宝箱のセルに立てていない').toEqual({ r: 1, c: 5 });
		expect(s.pieces).toBe(1);
		expect(errors).toEqual([]);
	});

	test('③ 15,5：爆弾で壁を壊した奥の宝箱で爆弾袋＝爆弾の上限 8 → 16', async ({ page }) => {
		const errors = await open(page, '15,5', 3, 1, { ps_bomb: '1' });
		expect((await snap(page)).maxBombs).toBe(8);
		await walk(page, 'right', 2);   // 壁 !(3,3) の手前 (3,2) で止まり、右を向く
		await bomb(page);
		await walk(page, 'right', 2);
		const s = await snap(page);
		expect({ r: s.r, c: s.c }, '宝箱のセルに立てていない').toEqual({ r: 3, c: 4 });
		expect(s.maxBombs, '爆弾袋で上限が増えない').toBe(16);
		expect(s.msg).toContain('爆弾袋');
		expect(errors).toEqual([]);
	});

	test('③ 12,17：爆弾で壁を壊した奥の宝箱でルピー +150', async ({ page }) => {
		const errors = await open(page, '12,17', 6, 8, { ps_bomb: '1' });
		const r0 = (await snap(page)).rupees;
		await walk(page, 'left', 2);    // 壁 !(6,6) の手前 (6,7) で止まり、左を向く
		await bomb(page);
		await walk(page, 'left', 2);
		const s = await snap(page);
		expect({ r: s.r, c: s.c }, '宝箱のセルに立てていない').toEqual({ r: 6, c: 5 });
		expect(s.rupees - r0, 'ルピーが 150 増えない').toBe(150);
		expect(errors).toEqual([]);
	});
});

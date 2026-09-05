// tests/exits-resolve.spec.js – MAP_ENTER / 笛ワープの接続先解決（実行キュー 0w・2026-09-05）
//
// 何のためのテストか：エディタの MAP_ENTER 欄は「id」「destId」を素のテキスト入力で並べる
// だけで、実際にどこへ繋がるかは人間の記憶に頼っていた。`shared/exits.js`（新規）に
// `game/game.js` の走査（`buildExitRegistry`）を寄せ、エディタも同じ解決器から
// 「→ どこの何番か」を出す。∴ここで測るのは：
//   (a) shared/exits.js の buildExitRegistry が game.js の実行時 exitRegistry と
//       同値であること（layer/stage/row/col が一致・cell は posKey と一致）
//   (b)(c) resolveExit の3分岐（destId 空欄／解決できる／解決できない＝ dungeon_7 の実害）
//   (d) reverseRefs（逆引き）／resolveFluteWarp（笛ワープの2形式）
//   (e)(f) エディタの実表示（岩牢の入口で解決先が出る／dungeon_7 で ❌ が出る）

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
	buildExitRegistry, resolveExit, reverseRefs, resolveFluteWarp,
} from '../shared/exits.js';

const repoFile = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readRepo = (rel) => readFileSync(repoFile(rel), 'utf8');
const MAP = JSON.parse(readRepo('../work/blade-of-lumia.json'));

const GAME = '/blade-of-lumia/game/';
const EDITOR_URL = '/blade-of-lumia/editor/';

async function waitForBoard(page) {
	await page.waitForFunction(() => {
		const b = document.getElementById('board');
		return !!b && b.children.length > 0;
	}, { timeout: 10000 });
}

// ─── ① buildExitRegistry：実データの既知の id が正しく解決される ──────
test('exits: buildExitRegistry resolves known ids from the real map', () => {
	const reg = buildExitRegistry(MAP);
	// 岩牢の口（field 9,10 の (1,2)）↔ 岩牢の入口（darklord_prison 0,0 の (1,1)）は相互結線。
	expect(reg.darklordPrison).toEqual({ layer: 'darklord_prison', stage: '0,0', cell: '1,1', row: 1, col: 1 });
	expect(reg.fieldToDarklordPrison).toEqual({ layer: 'field', stage: '9,10', cell: '1,2', row: 1, col: 2 });
	// dungeon_7 は destId 'field_dungeon7' で行き先を指すが、その id を持つ出口は世界に無い
	// （実行キュー 0x の実害＝ここでは「無いこと」だけを固定し、0x で直す）。
	expect(reg.field_dungeon7).toBeUndefined();
});

// ─── ② resolveExit：3分岐（空欄／解決できる／解決できない） ─────────────
test('exits: resolveExit distinguishes empty / resolved / unresolved destId', () => {
	const reg = buildExitRegistry(MAP);
	// 空欄＝着地専用（相手から来るだけ）。darklord_prison 0,1（錠の間）は mapEnters が {} 。
	expect(MAP.layers.darklord_prison.stages['0,1'].mapEnters).toEqual({});
	// 解決できる＝岩牢の口。
	const ok = resolveExit(MAP, 'field', '9,10', '1,2', reg);
	expect(ok).toEqual({
		id: 'fieldToDarklordPrison', destId: 'darklordPrison',
		resolved: { layer: 'darklord_prison', stage: '0,0', cell: '1,1', row: 1, col: 1 },
	});
	// 解決できない＝dungeon_7 の戻り口（0x が直すまでの実害）。
	const bad = resolveExit(MAP, 'dungeon_7', '1,3', '7,2', reg);
	expect(bad).toEqual({ id: 'dungeon_7', destId: 'field_dungeon7', resolved: null });
});

// ─── ③ reverseRefs：この id を destId に指す側の逆引き ─────────────────
test('exits: reverseRefs finds the other side of a resolved link', () => {
	// darklordPrison（岩牢側の出口ID）を destId に指しているのは field 9,10 (1,2) だけ。
	expect(reverseRefs(MAP, 'darklordPrison')).toEqual([{ layer: 'field', stage: '9,10', cell: '1,2' }]);
	// 存在しない id を逆引きしても空配列（例外にしない）。
	expect(reverseRefs(MAP, 'no_such_id')).toEqual([]);
});

// ─── ④ resolveFluteWarp：座標直指定形式（実データ）＋ destId 形式（合成データ） ──
test('exits: resolveFluteWarp handles both the coordinate form and the destId form', () => {
	const reg = buildExitRegistry(MAP);
	// 座標直指定＝secret_grotto 0,0 → field 2,0（世界で唯一の笛ワープ）。
	expect(resolveFluteWarp(MAP, 'secret_grotto', '0,0', reg))
		.toEqual({ layer: 'field', stage: '2,0', row: 8, col: 6, destId: null, resolved: true });
	// destId 形式は実データに無い∴合成データで解決できる場合／できない場合の両方を確かめる。
	const synthetic = {
		layers: {
			a: { stages: { '0,0': { fluteEffect: { type: 'warp', destId: 'toB' } } } },
			b: { name: 'B', stages: { '0,0': { mapEnters: { '2,2': { id: 'toB' } } } } },
		},
	};
	expect(resolveFluteWarp(synthetic, 'a', '0,0'))
		.toEqual({ layer: 'b', stage: '0,0', cell: '2,2', row: 2, col: 2, destId: 'toB', resolved: true });
	const syntheticBroken = {
		layers: { a: { stages: { '0,0': { fluteEffect: { type: 'warp', destId: 'missing' } } } } },
	};
	expect(resolveFluteWarp(syntheticBroken, 'a', '0,0')).toEqual({ destId: 'missing', resolved: false });
	// fluteEffect が無い／warp でないステージは null。
	expect(resolveFluteWarp(MAP, 'field', '9,10')).toBeNull();
});

// ─── ⑤ 実機：shared の buildExitRegistry と game.js の実行時 exitRegistry が同値 ──
test('exits: shared buildExitRegistry matches the running game exitRegistry', async ({ page }) => {
	await page.goto(`${GAME}?fromEditor=1&layer=field&stage=9,10&row=1&col=1`);
	await waitForBoard(page);
	const runtime = await page.evaluate(() => window.__game.getExitRegistry());
	const expected = buildExitRegistry(MAP);

	expect(Object.keys(runtime).sort()).toEqual(Object.keys(expected).sort());
	for (const id of Object.keys(expected)) {
		expect(runtime[id].layer, id).toBe(expected[id].layer);
		expect(runtime[id].stage, id).toBe(expected[id].stage);
		expect(runtime[id].row, id).toBe(expected[id].row);
		expect(runtime[id].col, id).toBe(expected[id].col);
		expect(runtime[id].cell, id).toBe(expected[id].cell);
		expect(runtime[id].cell, id).toBe(`${expected[id].row},${expected[id].col}`);
	}
});

// ─── ⑥ エディタ：岩牢の入口を開くと解決先が「→ 魔王の岩牢 0,0 (1,1)」と出る ──
test('editor: opening the darklord_prison entrance shows the resolved destination', async ({ page }) => {
	const realMapJson = readRepo('../work/blade-of-lumia.json');
	await page.addInitScript((json) => {
		localStorage.setItem('bladeOfLumiaMapData', json);
	}, realMapJson);

	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid', { state: 'visible' });

	// field レイヤーは既定で選択されている＝ステージ (9,10) のセルを開く。
	const cell = page.locator('.world-cell').filter({ has: page.locator('.cell-coord', { hasText: '(9,10)' }) });
	await cell.click();
	await page.locator('#btn-edit-stage').click();
	await expect(page.locator('#view-stage')).not.toHaveClass(/hidden/);

	const resolvedLine = page.locator('[data-resolved="1,2"]');
	await expect(resolvedLine).toHaveText('→ 魔王の岩牢 0,0 (1,1)');
	await expect(resolvedLine).toHaveClass(/mapenter-resolved-ok/);
});

// ─── ⑦ エディタ：dungeon_7 の戻り口は「繋がっていない」と出る（0x の実害が見える） ──
test('editor: opening the dungeon_7 return exit shows the unresolved-link warning', async ({ page }) => {
	const realMapJson = readRepo('../work/blade-of-lumia.json');
	await page.addInitScript((json) => {
		localStorage.setItem('bladeOfLumiaMapData', json);
	}, realMapJson);

	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid', { state: 'visible' });

	// dungeon_7 レイヤータブへ切り替える。
	await page.locator('.layer-tab', { hasText: 'dungeon_7' }).click();
	const cell = page.locator('.world-cell').filter({ has: page.locator('.cell-coord', { hasText: '(1,3)' }) });
	await cell.click();
	await page.locator('#btn-edit-stage').click();
	await expect(page.locator('#view-stage')).not.toHaveClass(/hidden/);

	const resolvedLine = page.locator('[data-resolved="7,2"]');
	await expect(resolvedLine).toContainText('❌ 繋がっていない');
	await expect(resolvedLine).toContainText('field_dungeon7');
	await expect(resolvedLine).toHaveClass(/mapenter-resolved-bad/);
});

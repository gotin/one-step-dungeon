// tests/exits-resolve.spec.js – MAP_ENTER / 笛ワープの接続先解決（実行キュー 0w・2026-09-05）
//
// 何のためのテストか：エディタの MAP_ENTER 欄は「id」「destId」を素のテキスト入力で並べる
// だけで、実際にどこへ繋がるかは人間の記憶に頼っていた。`shared/exits.js`（新規）に
// `game/game.js` の走査（`buildExitRegistry`）を寄せ、エディタも同じ解決器から
// 「→ どこの何番か」を出す。∴ここで測るのは：
//   (a) shared/exits.js の buildExitRegistry が game.js の実行時 exitRegistry と
//       同値であること（layer/stage/row/col が一致・cell は posKey と一致）
//   (b)(c) resolveExit の3分岐（destId 空欄／解決できる／解決できない）
//   (d) reverseRefs（逆引き）／resolveFluteWarp（笛ワープの2形式）
//   (e)(f) エディタの実表示（岩牢の入口で解決先が出る／解決できない入口で ❌ が出る）
//
// ⚠️ 2026-09-05（実行キュー 0x）: このファイルは元々「解決できない」の実例として
//    `dungeon_7/1,3@7,2`（destId=field_dungeon7 の行き先が世界に無い）を固定していた。
//    0x でその実害を直した（`field/2,0 (6,5)` に受け側の入口を作った）∴実例は
//    **合成データ**に移し、実マップ側は逆に「解決できない出口が（検証レイヤーを除いて）
//    0 件」を固定する側に変えた＝同じ壊れ方が二度と入らないようにする。

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
	// D7（空中の遺跡）の入口↔戻り口も相互結線されている（0x で結線した）。
	expect(reg.field_dungeon7).toEqual({ layer: 'field', stage: '2,0', cell: '6,5', row: 6, col: 5 });
	expect(reg.dungeon_7).toEqual({ layer: 'dungeon_7', stage: '1,3', cell: '7,2', row: 7, col: 2 });
});

// ─── ①-2 実マップに「行き先の無い出口」が残っていない（0x の再発防止） ────────
// 0x の壊れ方＝`destId` が世界に存在しない id を指す＝`game/game.js` の遷移判定
// （`enter.destId && exitRegistry[enter.destId]`）が黙って false になり、その '>' は
// 一生踏めない飾りになる。プレイヤーが行ける全レイヤーで 0 件を断定する。
// `test_mechanics` は各機構の検証ステージ＝本編の外∴除く（`candle_gate_dest` は
// ロウソク門の単体検証用で行き先を持たない）。
test('exits: 本編の全レイヤーに「行き先が解決できない出口」が無い', () => {
	const reg = buildExitRegistry(MAP);
	const bad = [];
	for (const [ln, ld] of Object.entries(MAP.layers)) {
		if (ln === 'test_mechanics') continue;
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [cell, me] of Object.entries(sd.mapEnters ?? {})) {
				if (me.destId && !reg[me.destId]) bad.push(`${ln}/${sk}@${cell} destId=${me.destId}`);
			}
		}
	}
	expect(bad, '踏んでも何も起きない MAP_ENTER がある（行き先の id が世界に無い）:\n'
		+ bad.join('\n')).toEqual([]);
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
	// 解決できる＝D7 の戻り口（0x で結線した＝以前はここが resolved:null だった）。
	expect(resolveExit(MAP, 'dungeon_7', '1,3', '7,2', reg)).toEqual({
		id: 'dungeon_7', destId: 'field_dungeon7',
		resolved: { layer: 'field', stage: '2,0', cell: '6,5', row: 6, col: 5 },
	});
	// 解決できない＝行き先の id が世界に無い（実マップには残っていない∴合成データで測る）。
	const broken = {
		layers: { a: { stages: { '0,0': { mapEnters: { '3,3': { id: 'aOut', destId: 'nowhere' } } } } } },
	};
	expect(resolveExit(broken, 'a', '0,0', '3,3'))
		.toEqual({ id: 'aOut', destId: 'nowhere', resolved: null });
	// タイル（mapEnter）自体が無ければ null。
	expect(resolveExit(MAP, 'field', '2,0', '0,0', reg)).toBeNull();
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

// ─── ⑦ エディタ：行き先が解決できない出口は「繋がっていない」と出る ──────────
// 実マップにはもう解決できない出口が無い（0x で D7 を結線した）∴**エディタに読ませる
// コピーだけを壊して**表示を測る（実データを壊さない）。壊し方は 0x の元の壊れ方と
// 同じ形＝D7 の戻り口の destId が世界に無い id を指す。
test('editor: opening an unresolved return exit shows the unresolved-link warning', async ({ page }) => {
	const brokenMap = JSON.parse(readRepo('../work/blade-of-lumia.json'));
	brokenMap.layers.dungeon_7.stages['1,3'].mapEnters['7,2'].destId = 'field_dungeon7';
	delete brokenMap.layers.field.stages['2,0'].mapEnters['6,5'];   // 受け側を消す＝解決不能
	const realMapJson = JSON.stringify(brokenMap);
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

// tests/warp-stone.spec.js
// 石碑（`†`）と転移の石碑（`‡`）の番人（2026-10-03 / PLAN 実行キュー 27）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   「〜の石碑」も「道標」も同じ木の看板 `i` の絵だった（ユーザー指摘「そもそも、『石碑』じゃない
//   よね？看板じゃんただの。石碑らしい見た目の、看板とは違うギミックをつくるべき」）。
//
// 守るもの（✅ 2026-10-03 ユーザー判定＝絵は碑・機構は転移の石碑・選んだ8枚だけ・石碑から石碑へ・
//   転移するときにプレイヤーへ演出）:
//   ① データ＝転移碑はちょうど8枚（画面と名前を手書きで）・碑を名指しする看板は残っていない・
//      石碑の名前はどれも碑を名指ししている・木の看板（道標・立札…）は看板のまま
//   ② 8枚とも碑の隣に着地できるセルがある
//   ③ 実ゲーム＝読むと灯る（絵が変わる・保存される）→ 他の灯った碑があれば一覧 → 選ぶと演出つきで
//      行き先の碑の隣に立つ・演出の間は入力を飲む
//   ④ 一覧＝灯っていない碑は出ない・Escape でやめると動かない・「碑文を読む」で本文
//   ⑤ セーブ＝壊れた litWarpStones を直す
//   ⑥ 石碑 `†` は看板と同じく読めて・通れない
//   ⑦ エディタ＝パレットに石碑・転移の石碑のボタン（絵つき）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE, READABLE_SIGN_TILES } from '../shared/tiles.js';
import { listWarpStones, warpLandingCandidates } from '../shared/warp-stones.js';
import { HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { sanitizeLoadedPlayer } from '../game/save.js';
import { ITEM_META } from '../shared/items.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const WOOD  = /道標|道しるべ|立札|立て札|書き置き|手記|覚え書き/;
const STONE = /碑|石標|刻み|環状|ザーネルの記憶/;
const isStoneName = (n) => !WOOD.test(n ?? '') && STONE.test(n ?? '');
const nameAt = (sd, k) => (sd.signData?.[k] ?? sd.npcData?.[k])?.name;

function* readableCells() {
	for (const [lk, ld] of Object.entries(map.layers)) {
		if (lk === 'test_mechanics') continue;
		for (const [sk, sd] of Object.entries(ld.stages)) {
			for (let r = 0; r < sd.tiles.length; r++) for (let c = 0; c < sd.tiles[r].length; c++) {
				const t = sd.tiles[r][c];
				if (READABLE_SIGN_TILES.has(t)) yield { lk, sk, sd, r, c, t, name: nameAt(sd, `${r},${c}`) };
			}
		}
	}
}

test.describe('石碑・転移の石碑 ①②⑤（データ）', () => {
	test('① 転移碑は8枚・碑を名指しする看板は残っていない・木の看板は看板のまま', () => {
		const ws = listWarpStones(map).map((w) => `${w.layer} ${w.stage} ${w.r},${w.c} ${w.name}`);
		expect(ws.sort()).toEqual([
			'field 10,13 2,3 沼の 関の 石標',
			'field 12,0 6,6 火口の 石碑',
			'field 15,4 6,5 鐘楼の石碑',
			'field 2,15 6,5 砂漠の神殿の石碑',
			'field 3,5 1,9 苔むした石碑',
			'field 6,14 4,4 村を見守る碑',
			'field 8,1 7,2 天空の石碑',
			'field 9,9 3,9 水の迷宮の石碑',
		]);
		let monuments = 0, signs = 0;
		for (const { lk, sk, r, c, t, name } of readableCells()) {
			const at = `${lk} ${sk} (${r},${c}) ${name}`;
			if (t === TILE.SIGN) {
				signs++;
				expect(isStoneName(name), `碑を名指しする看板が残っている: ${at}`).toBe(false);
			} else {
				if (t === TILE.MONUMENT) monuments++;
				expect(isStoneName(name), `碑でない名前の石碑: ${at}`).toBe(true);
			}
		}
		expect(monuments, '石碑の数（2026-10-03 の移行で 96）').toBe(96);
		expect(signs).toBeGreaterThan(50);
		// 木の看板の現物は看板のまま
		expect(map.layers.field.stages['7,2'].tiles[3][6]).toBe(TILE.SIGN);   // 北原の 辻の道標
	});

	test('② 8枚とも碑の隣（南→東→西→北）に着地できるセルがある', () => {
		for (const w of listWarpStones(map)) {
			const sd = map.layers[w.layer].stages[w.stage];
			// 茂みは切れば通れる（field 3,5 の碑は茂みの奥＝読むには切る必要がある∴灯った時点で切れている）
			const ok = warpLandingCandidates(w).some(([r, c]) => {
				const t = sd.tiles[r]?.[c];
				if (t === undefined) return false;
				if (t === TILE.BUSH) return true;
				if (sd.bgTiles?.[`${r},${c}`] === TILE.WATER) return false;
				return !HARD_BLOCKED.has(t) && !READABLE_SIGN_TILES.has(t);
			});
			expect(ok, `${w.stage} ${w.name} の隣に立てるセルが無い`).toBe(true);
		}
	});

	test('⑤ セーブ＝litWarpStones の壊れた値を直す', () => {
		const fix = (v) => { const p = { subItems: {}, litWarpStones: v }; sanitizeLoadedPlayer(p, ITEM_META); return p.litWarpStones; };
		expect(fix(undefined)).toEqual([]);
		expect(fix('field:6,14:4,4')).toEqual([]);
		expect(fix(['a', 'a', 3, null, 'b'])).toEqual(['a', 'b']);
	});
});

// ── 実ゲーム ─────────────────────────────────────────────
const VILLAGE = 'field:6,14:4,4';
const DESERT  = 'field:2,15:6,5';
const LAKE    = 'field:9,9:3,9';
async function gotoVillage(page) {
	// 村の碑 (4,4) の南 (5,4) に立つ
	await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=6,14&row=5&col=4&ps_weapon=1`);
	await waitForBoard(page);
	await page.waitForTimeout(300);
}
const state = (page) => page.evaluate(() => {
	const s = window.__game.getState(), pl = window.__game.getPlayer();
	return {
		stage: s.stageKey, x: pl.x, y: pl.y, lit: [...(pl.litWarpStones ?? [])],
		menu: !document.getElementById('warp-overlay').classList.contains('hidden'),
		dialog: !document.getElementById('dialog-overlay').classList.contains('hidden'),
		rows: [...document.querySelectorAll('#warp-list .warp-row')].map((e) => e.textContent),
		msg: document.getElementById('msg-bar').textContent,
	};
});
const readStone = (page) => page.evaluate(() => { window.__game.setHeroDir('up'); window.__game.swordAttack(); });
const art = (page, r, c) => page.evaluate(([r, c]) => document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"]`)?.dataset.artSprite, [r, c]);
async function closeDialog(page) {
	for (let i = 0; i < 10 && (await state(page)).dialog; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(80); }
}

test.describe('転移の石碑 ③④（実ゲーム）', () => {
	test('③ 読むと灯る → 他の灯った碑へ一覧から転移する（演出つき・演出中は入力を飲む）', async ({ page }) => {
		await gotoVillage(page);
		expect(await art(page, 4, 4)).toBe('warpStone');
		await readStone(page);
		expect((await state(page)).dialog, '本文が出ない').toBe(true);
		await closeDialog(page);
		let s = await state(page);
		expect(s.lit).toEqual([VILLAGE]);
		expect(s.menu, '行き先が無いのに一覧が開いた').toBe(false);
		expect(s.msg).toContain('灯った');
		expect(await art(page, 4, 4), '灯った碑の絵').toBe('warpStoneLit');

		// 砂漠の碑も灯っていることにして読み直す＝本文は出さず一覧
		await page.evaluate((id) => window.__game.getPlayer().litWarpStones.push(id), DESERT);
		await readStone(page);
		s = await state(page);
		expect(s.dialog).toBe(false);
		expect(s.menu).toBe(true);
		expect(s.rows).toEqual(['砂漠の神殿の石碑', '碑文を読む']);

		await page.keyboard.press('Space');
		await page.waitForTimeout(150);
		expect(await page.evaluate(() => document.getElementById('char-player')?.classList.contains('warp-out')), '出発の演出が無い').toBe(true);
		expect(await page.locator('.warpstone-beam').count(), '光の柱が無い').toBeGreaterThan(0);
		// 演出の間のキーは飲む。⚠️ 歩きはループが止まっているので元々起きない＝歯にならない。
		// 害があるのは Escape＝ポーズが開き、到着でループが再開してポーズの裏でゲームが進む。
		await page.keyboard.press('Escape');
		expect((await state(page)).stage, '出発の途中で画面が変わった').toBe('6,14');
		await page.waitForFunction(() => document.getElementById('char-player')?.classList.contains('warp-in'), null, { timeout: 3000 });
		s = await state(page);
		expect(s.stage).toBe('2,15');
		expect([s.y, s.x], '碑の南に立つ').toEqual([7, 5]);
		await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(200); await page.keyboard.up('ArrowLeft');
		await page.waitForFunction(() => !document.getElementById('char-player')?.classList.contains('warp-in'), null, { timeout: 3000 });
		s = await state(page);
		expect([s.y, s.x], '到着の演出の途中で動いた').toEqual([7, 5]);
		expect(s.msg).toContain('転移した');
		expect(await page.evaluate(() => document.getElementById('pause-overlay').classList.contains('hidden')), '演出の間の Escape でポーズが開いた').toBe(true);
		// 行き先は灯ったまま・保存にも残る
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('blade-of-lumia-save') ?? 'null')?.player?.litWarpStones);
		expect(saved).toEqual(expect.arrayContaining([VILLAGE, DESERT]));
	});

	test('④ 一覧に灯っていない碑は出ない・Escape でやめる・「碑文を読む」で本文', async ({ page }) => {
		await gotoVillage(page);
		await page.evaluate((ids) => { window.__game.getPlayer().litWarpStones = ids; }, [VILLAGE, LAKE]);
		await readStone(page);
		let s = await state(page);
		expect(s.rows, '灯っていない砂漠の碑が出た').toEqual(['水の迷宮の石碑', '碑文を読む']);
		await page.keyboard.press('Escape');
		s = await state(page);
		expect(s.menu).toBe(false);
		expect(s.stage).toBe('6,14');
		await page.waitForTimeout(200);
		expect((await state(page)).stage, 'やめたのに転移した').toBe('6,14');

		await readStone(page);
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Space');
		s = await state(page);
		expect(s.menu).toBe(false);
		expect(s.dialog, '「碑文を読む」で本文が出ない').toBe(true);
		expect(await page.locator('#dialog-name').textContent()).toBe('村を見守る碑');
	});

	test('⑥ 石碑は看板と同じく読めて・通れない', async ({ page }) => {
		// dungeon_1 0,0 の「ザーネルの記憶 其の一」(1,9)。南 (2,9) に立つ
		expect(map.layers.dungeon_1.stages['0,0'].tiles[1][9]).toBe(TILE.MONUMENT);
		await page.goto(`${GAME_URL}?fromEditor=1&layer=dungeon_1&stage=0,0&row=2&col=9&ps_weapon=1`);
		await waitForBoard(page);
		await page.waitForTimeout(1500);   // ボス部屋の扉が閉まる演出を待つ
		expect(await art(page, 1, 9)).toBe('monument');
		await readStone(page);
		expect((await state(page)).dialog).toBe(true);
		expect(await page.locator('#dialog-name').textContent()).toBe('ザーネルの記憶 其の一');
		await closeDialog(page);
		for (let i = 0; i < 6; i++) await page.evaluate(() => window.__game.movePlayer('up'));
		expect((await state(page)).y, '石碑の上へ入った').toBe(2);
	});
});

test.describe('石碑 ⑦ エディタ', () => {
	test('⑦ パレットに石碑・転移の石碑のボタン（絵つき）', async ({ page }) => {
		page.on('dialog', (d) => d.dismiss().catch(() => {}));
		await page.goto('/blade-of-lumia/editor/');
		// パレットは画面を開くまで隠れている＝DOM に在ることだけ待つ
		await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });
		for (const label of ['石碑', '転移の石碑']) {
			const btn = page.locator(`#tile-palette .tile-btn[title="${label}"]`);
			await expect(btn, label).toHaveCount(1);
			await expect(btn.locator('canvas'), `${label} のボタンに絵が無い`).toHaveCount(1);
		}
	});

	// 2026-10-03 ユーザー指摘「スプライトが npcA に設定されているけどこれは問題ない？」＝絵はタイル文字で
	// 決まり `data.sprite` はゲームが読まない∴看板・石碑にはスプライト欄を出さない（村人には残す）。
	test('⑧ 会話パネル＝看板・石碑にスプライト欄が無い・村人にはある', async ({ page }) => {
		await page.goto('/blade-of-lumia/editor/');
		await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(map));
		await page.reload();
		await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
		// field 6,13＝看板 i(1,2)・村人 a(3,2)・石碑 †(4,8)
		const sd = map.layers.field.stages['6,13'];
		expect([sd.tiles[1][2], sd.tiles[3][2], sd.tiles[4][8]]).toEqual([TILE.SIGN, 'a', TILE.MONUMENT]);
		await page.locator('#world-grid .world-cell').filter({ has: page.locator('.cell-coord', { hasText: '(6,13)' }) }).first().click();
		await page.locator('#btn-edit-stage').click();
		const item = (pk) => page.locator('#npc-list .link-item').filter({ has: page.locator('.link-item-header', { hasText: `NPC (${pk})` }) });
		await expect(item('3,2').locator('select[data-f="sprite"]'), '村人のスプライト欄が消えた').toHaveCount(1);
		await expect(item('1,2').locator('select[data-f="sprite"]'), '看板にスプライト欄').toHaveCount(0);
		await expect(item('4,8').locator('select[data-f="sprite"]'), '石碑にスプライト欄').toHaveCount(0);
		await expect(item('4,8').locator('textarea[data-f="lines"]'), '石碑の本文欄が無い').toHaveCount(1);
	});
});

// 人物 NPC の見た目の差し替え（実行キュー56・2026-10-13）の番人。
//
// 老賢者（field 7,14 の 3,3）は商人のタイル 'b' を流用していた＝専用の絵 npcElder を作り、
// npcData[セル].sprite で人ごとに差し替える仕組み（shared/npcs.js PERSON_NPC_SPRITES）を足した。
// それまでエディタの NPC 欄の「スプライト」選択はゲームのどこからも読まれていなかった。
//
// 固定すること：
//   ① 仕組み：表のキーなら専用の絵・表に無い値（旧選択欄の 'npcA' など）は読まない・店の差し替えは従来どおり
//   ② データ：老賢者が npcElder・絵は 2 コマ 32×32・パレットがある
//   ③ ゲームとエディタ（describeCell）が同じ絵を引く／実ゲームの盤面に npcElder が描かれる
//   ④ エディタ：選択欄の候補は表から導く・「既定」を選ぶとキーごと消える
//   ⑤ 盤面の NPC（人・店）はプレイヤーと同じ表示寸法＝1ドットが同じ大きさ
//      （2026-10-13 ユーザー指摘「プレーヤーだけサイズが大きすぎない？」＝NPC だけ dot32 から漏れ 0.85 倍だった）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { npcSpriteOf, PERSON_NPC_SPRITES, NPC_SPRITE_MAP } from '../shared/npcs.js';
import { PLAYER_SPRITES, PLAYER_PAL } from '../shared/sprites-player.js';
import { describeCell } from '../shared/cell-appearance.js';
import { waitForBoard } from './helpers.js';

const map = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const village = map.layers.field.stages['7,14'];

test('① 表のキーなら専用の絵・表に無い値は読まない・店は従来どおり', () => {
	const sd = (sprite) => ({ npcData: { '1,1': sprite === undefined ? {} : { sprite } } });
	expect(npcSpriteOf(sd('npcElder'), '1,1', 'b')).toBe(PERSON_NPC_SPRITES.npcElder);
	expect(npcSpriteOf(sd('npcElder'), '1,1', 'a')).toBe(PERSON_NPC_SPRITES.npcElder);
	expect(npcSpriteOf(sd('npcA'), '1,1', 'b'), '旧選択欄の値で見た目が変わった').toBe(NPC_SPRITE_MAP.b);
	expect(npcSpriteOf(sd(undefined), '1,1', 'a')).toBe(NPC_SPRITE_MAP.a);
	// 看板や敵のタイルには効かない
	expect(npcSpriteOf(sd('npcElder'), '1,1', 'i')).toBe(null);
	// 店の差し替えは shopData のまま
	expect(npcSpriteOf({ shopData: { '1,1': { sprite: 'npcInfo' } } }, '1,1', '$').sprite).toBe('npcInfo');
});

test('② 老賢者が npcElder・絵は 2 コマ 32×32・パレットがある', () => {
	expect(village.npcData['3,3']).toMatchObject({ name: '老賢者', sprite: 'npcElder' });
	const f = PLAYER_SPRITES.npcElder;
	expect(f).toHaveLength(2);
	for (const fr of f) {
		expect(fr).toHaveLength(32);
		for (const row of fr) expect(row).toHaveLength(32);
	}
	const maxIdx = Math.max(...f.flat(2));
	expect(PLAYER_PAL.npcElder.length, 'パレットが絵の番号に足りない').toBeGreaterThan(maxIdx);
	// 頭（顔）は2コマで同じ＝交互に出しても顔が揺れない
	expect(f[1].slice(0, 21)).toEqual(f[0].slice(0, 21));
	expect(f[1], '2コマが同じ＝身ぶりが無い').not.toEqual(f[0]);
});

test('③-1 エディタの描画（describeCell）も老賢者の絵を引く', () => {
	expect(describeCell(village, 3, 3, undefined, 'field').obj).toMatchObject({ spr: 'npcElder', pal: 'npcElder' });
	expect(describeCell(village, 3, 5, undefined, 'field').obj, '村人タロまで変わった').toMatchObject({ spr: 'npcA' });
});

test('③-2 実ゲームの盤面に npcElder が描かれる', async ({ page }) => {
	await page.goto('/blade-of-lumia/game/?fromEditor=1&layer=field&stage=7,14&row=4&col=5');
	await waitForBoard(page);
	const sprites = await page.evaluate(() => {
		const at = (r, c) => document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"] canvas.char-sprite`)?.dataset.sprite;
		return { elder: at(3, 3), taro: at(3, 5) };
	});
	expect(sprites).toEqual({ elder: 'npcElder', taro: 'npcA' });
});

test('④ エディタ：候補は表から導く・既定を選ぶとキーごと消える', async ({ page }) => {
	await page.goto('/blade-of-lumia/editor/');
	await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(map));
	await page.reload();
	await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
	await page.locator('#world-grid .world-cell').filter({ has: page.locator('.cell-coord', { hasText: '(7,14)' }) }).first().click();
	await page.locator('#btn-edit-stage').click();
	const sel = page.locator('#npc-list .link-item').filter({ has: page.locator('.link-item-header', { hasText: 'NPC (3,3)' }) }).locator('select[data-f="sprite"]');
	await expect(sel).toHaveValue('npcElder');
	const labels = await sel.locator('option').allTextContents();
	expect(labels).toEqual(['既定（NPC（商人））', ...Object.values(PERSON_NPC_SPRITES).map((v) => v.label)]);
	await sel.selectOption('');
	// 保存すると localStorage の控えに書く（tests/editor-dialog-variants.spec.js savedMapData と同じ作法）
	await page.locator('#btn-save').click();
	const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData')));
	const elder = saved.layers.field.stages['7,14'].npcData['3,3'];
	expect(elder.name).toBe('老賢者');
	expect('sprite' in elder, '既定を選んでも sprite が残った（空文字も残さない）').toBe(false);
});

test('⑤ 盤面の NPC（人・店）はプレイヤーと同じ表示寸法', async ({ page }) => {
	// field 13,5＝人（賢者エルン・村人）／field 9,9＝店主 `$` と人 `a`
	for (const q of ['stage=13,5&row=8&col=5', 'stage=9,9&row=8&col=1']) {
		await page.goto(`/blade-of-lumia/game/?fromEditor=1&layer=field&${q}`);
		await waitForBoard(page);
		const sizes = await page.evaluate(() => {
			const wh = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
			return {
				player: wh(document.querySelector('#char-player canvas.sprite')),
				npcs: [...document.querySelectorAll('#board .cell canvas.char-sprite')].map(wh),
			};
		});
		expect(sizes.npcs.length, `${q}: NPC が描かれていない`).toBeGreaterThanOrEqual(2);
		for (const n of sizes.npcs) expect(n, `${q}: NPC の表示寸法がプレイヤーと違う`).toEqual(sizes.player);
	}
});

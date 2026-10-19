// キュー88（2026-10-19）：怨念のもや `Ψ`（TILE.CURSE_MIST）の番人。
//
// 直す前＝ロウソクの合図（bushBurned）で隠し入口を出す field 6,13 の (6,10) は**茂み**だった。
// 茂みは剣でも切れる∴敵と戦っているうちに先に切ると合図が立たず、切った跡はセーブに残る
// ＝隠し洞窟（hidden_cave）へ二度と入れなかった。→ 茂みとは別の「怨念のもや」に替えた：
//   ・剣は実体の無いもやをすり抜ける（消えない・通れないまま・言葉で知らせる）
//   ・ロウソク（炎の神殿の聖なる火）でだけ祓える＝合図が立ち、入口が出る
//   ・祓った状態は茂みと同じ ss.cutBushes（セーブの形を変えない・shared/tiles.js CANDLE_CLEARABLE_TILES）
//
// ① データ：合図（bushBurned）を使う画面に茂みが無い（全層を走査）＝同じ穴を作り直さない
// ② 実機：剣で振ってももやは残る → その後でもロウソクで祓えて入口が出る（直す前の手順で詰まない）
// ③ 実機：もやは絵（curseMist・2コマのアニメ）で描かれ、祓うと消える
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, CANDLE_CLEARABLE_TILES } from '../shared/tiles.js';

const MAP = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const LAYERS = MAP.layers ?? MAP;
const GAME = '/blade-of-lumia/game/';
const url = (extra = {}) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: 'field', stage: '6,13', row: '6', col: '9', ...extra,
})}`;

test('① 合図（bushBurned）を使う画面には茂みが無く、怨念のもやがある', () => {
	const found = [];
	for (const [lk, layer] of Object.entries(LAYERS)) {
		const stages = layer?.stages ?? layer;
		if (!stages || typeof stages !== 'object') continue;
		for (const [sk, st] of Object.entries(stages)) {
			if (!st?.tiles) continue;
			const usesBurn = Object.values(st.showConditions ?? {}).some((c) => c?.trigger === 'bushBurned');
			if (!usesBurn) continue;
			const cells = st.tiles.flatMap((row) => [...row]);
			found.push({ at: `${lk} ${sk}`, bush: cells.filter((ch) => ch === TILE.BUSH).length,
				mist: cells.filter((ch) => ch === TILE.CURSE_MIST).length });
		}
	}
	expect(found.length, '合図を使う画面が見つからない（測れていない）').toBeGreaterThanOrEqual(1);
	for (const f of found) {
		expect(f.bush, `${f.at}：剣で切れる茂みがある＝先に切ると合図が二度と立たない`).toBe(0);
		expect(f.mist, `${f.at}：怨念のもやが無い＝ロウソクで燃やす物が無い`).toBeGreaterThanOrEqual(1);
	}
	expect(CANDLE_CLEARABLE_TILES.has(TILE.CURSE_MIST)).toBe(true);
	expect(CANDLE_CLEARABLE_TILES.has(TILE.BUSH)).toBe(true);
});

test('② 剣はもやをすり抜ける（消えない・通れない）→ その後でもロウソクで祓えて入口が出る', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url({ ps_weapon: '1', ps_candle: '1' }));
	await waitForBoard(page);
	const r = await page.evaluate(() => {
		const g = window.__game;
		g.setHeroDir('right');
		g.swordAttack(); g.step(1);
		const msg = document.getElementById('msg-bar')?.textContent ?? '';
		const cut = g.getStageState().cutBushes.includes('6,10');
		// 右へ歩いても (6,10) に入れない
		for (let i = 0; i < 4; i++) { g.movePlayer('right'); g.step(1); }
		const x = g.getPlayer().x;
		// ロウソクで祓う
		for (let i = 0; i < 4; i++) g.step(1);
		g.setHeroDir('right');
		g.useSubItem(); g.step(1);
		const ss = g.getStageState();
		return { msg, cut, x, cutAfter: ss.cutBushes.includes('6,10'), burned: ss.bushBurned, shown: ss.conditionsMet.includes('6,11') };
	});
	expect(r.cut, '剣でもやが消えた').toBe(false);
	expect(r.msg).toContain('すり抜けた');
	expect(r.x, 'もやを通り抜けた').toBeLessThanOrEqual(9);
	expect(r.cutAfter, 'ロウソクで祓えない').toBe(true);
	expect(r.burned, '合図（bushBurned）が立たない').toBe(true);
	expect(r.shown, '隠し入口が出ない').toBe(true);
	expect(errors).toEqual([]);
});

test('③ もやは curseMist の絵（アニメ）で描かれ、祓うと消える', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url({ ps_candle: '1' }));
	await waitForBoard(page);
	const cell = (r, c) => `#board .cell[data-row="${r}"][data-col="${c}"]`;
	const before = await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		const cv = el?.querySelector('canvas');
		return { spr: el?.dataset.artSprite ?? null, animated: cv?.dataset.sprite ?? null, w: cv?.width ?? 0 };
	}, cell(6, 10));
	expect(before.spr).toBe('curseMist');
	expect(before.animated, 'アニメの印（dataset.sprite）が無い＝揺れない').toBe('curseMist');
	expect(before.w).toBe(32);
	await page.evaluate(() => { const g = window.__game; g.setHeroDir('right'); g.useSubItem(); g.step(1); });
	const after = await page.evaluate((sel) => document.querySelector(sel)?.dataset.artSprite ?? null, cell(6, 10));
	expect(after, '祓った後も絵が残っている').not.toBe('curseMist');
	expect(errors).toEqual([]);
});

// tests/d7-crumbled-landing.spec.js
// dungeon_7 `1,3`（入口）「崩れた着地台」の番人
// （2026-10-01 / PLAN 実行キュー 31 の第1陣・盤面は `scripts/migrate-d7-1-3-crumbled-landing.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `1,3` は `dungeon_6 1,3`（森の聖域の入口）と盤面がバイト一致＝空中の遺跡の入口なのに
//   木と茂みが立つ四角い箱だった。北東の看板 i(1,9)「空中の遺跡の入口」は北の角が崩れる∴
//   着地台の隅 (8,1) へ移した（本文は signData でなく npcData に持つ形＝キーごと動かす）。
//   最初の叩き台（行6 の一直線の帯＋橋 1 マス）はユーザー判定で「崩れた感が何も無い」
//   （2026-10-01）＝橋を 3 マスに伸ばし、裂け目の幅を列ごとに変えた（広い所 6・狭い所 1）。
//
// 守るものは3つ。
//   ① データ：森の植生が戻っていない／看板は石碑 (3,5) と入口の看板 (8,1) の2枚で、どちらも
//      本文がある（看板でないセルに本文が取り残されていない）／着地 `>`(7,2) の位置と行き先／
//      宝箱 (7,10) の中身／橋 3 マスと裂け目の形。
//   ② 挙動（道具なし）：着地台から橋 v(4..6,3) を渡って広間へ出られる＝入口で詰まない。
//      裂け目の穴へは歩いて入れない＝東の張り出しの宝箱は歩いては取れない。
//   ③ 挙動（はしご）：広間から裂け目の一番細い所 (6,9) を真下へ渡って宝箱を開けられる。
//      西の台から東の張り出しへは幅 5 の穴＝はしごでも横に渡れない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '1,3';
const st = map.layers[LAYER].stages[ROOM];
const LANDING = { r: 7, c: 2 };
const CHEST = '7,10';

const cellsOf = (ch) => {
	const out = [];
	st.tiles.forEach((row, r) => row.forEach((x, c) => { if (x === ch) out.push(`${r},${c}`); }));
	return out;
};

test.describe('D7 1,3 崩れた着地台 ① データ', () => {
	test('① 森の植生が無い・看板は本文のある石碑1枚・着地と宝箱', () => {
		expect(st.tiles.every((row) => Array.isArray(row) && row.length === 12), 'tiles が文字の配列の配列でない').toBe(true);
		expect(cellsOf(TILE.TREE), '木が戻っている').toEqual([]);
		expect(cellsOf(TILE.BUSH), '茂みが戻っている').toEqual([]);
		expect(cellsOf(TILE.SIGN), '看板は石碑 (3,5) と入口の看板 (8,1) の2枚').toEqual(['3,5', '8,1']);
		expect(st.signData['3,5']?.lines?.[0]).toBe('【空中の遺跡】');
		expect(st.npcData['8,1']?.lines?.[0], '入口の看板の本文が (8,1) に無い').toBe('ここは 道具の 試しの 場。');
		const stray = Object.keys({ ...st.signData, ...st.npcData })
			.filter((k) => { const [r, c] = k.split(',').map(Number); return st.tiles[r]?.[c] !== TILE.SIGN; });
		expect(stray, '看板でないセルに本文が取り残されている').toEqual([]);
		expect(cellsOf(TILE.MAP_ENTER)).toEqual([`${LANDING.r},${LANDING.c}`]);
		expect(st.mapEnters[`${LANDING.r},${LANDING.c}`]).toEqual({ id: 'dungeon_7', destId: 'field_dungeon7' });
		expect(cellsOf(TILE.CHEST)).toEqual([CHEST]);
		expect(st.chestContents[CHEST]).toEqual({ type: 'rupee', value: 30, name: 'ルピー×30' });
		// 橋は南北に 3 マス。裂け目は列ごとに幅が違う（ユーザー判定の「広い所・狭い所」）。
		expect(cellsOf(TILE.BRIDGE), '橋が 3 マスでない').toEqual(['4,3', '5,3', '6,3']);
		expect(st.tiles.slice(3, 9).map((row) => row.join('')), '裂け目の形が変わった').toEqual([
			'#...xi.....#',
			'..xvxxx.x...',
			'..xvxxxxx...',
			'#xxvxxxxxxx#',
			'#.>.xxxxx.B#',
			'#i..xxx....#',
		]);
	});
});

// ── 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
async function open(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ...extra });
	await page.goto(`${GAME_URL}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 1マス＝movePlayer 2回（[[blade-moveplayer-is-half-tile]]）
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const snap = (page) => page.evaluate(() => {
	const g = window.__game.getState();
	const p = window.__game.getPlayer();
	return {
		layer: g.currentLayer, stage: g.stageKey,
		r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5), rupees: p.rupees,
		opened: [...window.__game.getStageState().openedChests],
	};
});
const pos = (s) => ({ r: s.r, c: s.c });

test.describe('D7 1,3 崩れた着地台 ② 道具なし', () => {
	test('② 着地台から長い橋を渡って広間へ出られる', async ({ page }) => {
		const errors = await open(page, LANDING.r, LANDING.c + 1);   // 着地の右隣＝`>` を踏まずに始める
		await walk(page, 'up', 4);   // (7,3) → 橋 (6,3) → (5,3) → (4,3) → 広間 (3,3)
		const s = await snap(page);
		expect({ layer: s.layer, stage: s.stage }).toEqual({ layer: LAYER, stage: ROOM });
		expect(pos(s), '橋を渡って広間へ出られない').toEqual({ r: 3, c: 3 });
		expect(errors).toEqual([]);
	});

	test('② 裂け目の穴へは歩いて入れない＝東の宝箱は歩いては取れない', async ({ page }) => {
		const errors = await open(page, 5, 9);
		await walk(page, 'down', 2);
		const s = await snap(page);
		expect(pos(s), 'はしご無しで穴 (6,9) へ入れてしまった').toEqual({ r: 5, c: 9 });
		expect(s.opened).not.toContain(CHEST);
		expect(errors).toEqual([]);
	});

	test('② 着地台の東の端から先は穴（台の輪郭が効いている）', async ({ page }) => {
		const errors = await open(page, 7, 3);
		await walk(page, 'right', 3);
		expect(pos(await snap(page)), '穴 (7,4) へ入れてしまった').toEqual({ r: 7, c: 3 });
		expect(errors).toEqual([]);
	});
});

test.describe('D7 1,3 崩れた着地台 ③ はしご', () => {
	test('③ 広間から裂け目の細い所を真下へ渡って宝箱を開ける＝ルピー +30', async ({ page }) => {
		const errors = await open(page, 5, 9, { ps_ladder: '1' });
		const r0 = (await snap(page)).rupees;
		await walk(page, 'down', 2);    // 穴 (6,9) をはしごで渡って (7,9)
		expect(pos(await snap(page)), 'はしごで裂け目を渡れない').toEqual({ r: 7, c: 9 });
		await walk(page, 'right', 1);   // 宝箱 (7,10)
		const s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees - r0, 'ルピーが 30 増えない').toBe(30);
		expect(errors).toEqual([]);
	});

	test('③ 西の台から東の張り出しへは、はしごでも横に渡れない（幅 5 の穴）', async ({ page }) => {
		const errors = await open(page, 7, 3, { ps_ladder: '1' });
		await walk(page, 'right', 3);
		expect(pos(await snap(page)), '幅 5 の穴をはしごで渡れてしまった').toEqual({ r: 7, c: 3 });
		expect(errors).toEqual([]);
	});
});

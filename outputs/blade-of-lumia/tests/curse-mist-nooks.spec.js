// キュー89（2026-10-19）：怨念のもや `Ψ` を他の場所にも置く＝もやの奥の置き場の番人。
// 盤面は `scripts/migrate-89-curse-mist-nooks.mjs`。ご褒美の配分はユーザー判定「かけら4個で器1つ分」。
//
// ① データ：置き場ごとに、もやと宝箱（中身）があり、もやを祓わないと宝箱に届かない
//    （画面の中の歩行。対照＝もやを祓った扱いなら届く）
// ② データ：もやはロウソク（D4）より前の本筋を塞がない＝もやを壁と数えても D1〜D4 の入口へ歩ける
//    ＋もやの総数が「合図のもや（88）＋この一覧」と一致（一覧の外にもやが増えたら気づく）
// ③ 実機：A1（field 7,10）＝剣はすり抜ける → ロウソクで祓う → 宝箱でハートのかけら
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';

const MAP = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const PIECE = { type: 'item', item: 'heartPiece', name: 'ハートのかけら' };

// [層, 画面, もや, 宝箱, 中身, 画面の中の立ち位置（もやの手前）]
const NOOKS = [
	['field', '7,10', '7,9', '7,10', PIECE, '7,3'],          // A1 D3 へ向かう道の岩の切れ込み
	['field', '3,16', '6,9', '7,9', PIECE, '7,3'],           // A2 古の戦の碑の墓
	['field', '11,18', '4,9', '4,8', PIECE, '8,9'],          // C1 都の墓所の脇の墓
	['dark_tower', '1,4', '3,7', '3,8', PIECE, '5,5'],       // B1 塔の祠の間の右の壁龕
];
// キュー88 の合図のもや（bushBurned で隠し入口を出す）＝この一覧の外で唯一のもや
const SIGNAL_MIST = [['field', '6,13', '6,10']];

function reach(st, from, mist, cleared) {
	const [mr, mc] = mist.split(',').map(Number);
	const blocked = (r, c) => {
		if (r === mr && c === mc) return !cleared;
		const ch = st.tiles[r][c];
		return HARD_BLOCKED.has(ch) || ch === TILE.CHEST || st.bgTiles?.[`${r},${c}`] === TILE.WATER;
	};
	const seen = new Set([from]);
	const q = [from.split(',').map(Number)];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nc < 0 || nr >= st.rows || nc >= st.cols || seen.has(k) || blocked(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
const touches = (w, cell) => {
	const [r, c] = cell.split(',').map(Number);
	return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => w.has(`${r + dr},${c + dc}`));
};

test.describe('キュー89 もやの奥 ① ② データ', () => {
	for (const [layer, stage, mist, chest, content, from] of NOOKS) {
		test(`① ${layer} ${stage}：もや ${mist} を祓わないと宝箱 ${chest}（${content.name}）に届かない`, () => {
			const st = MAP.layers[layer].stages[stage];
			const at = (k) => { const [r, c] = k.split(',').map(Number); return st.tiles[r][c]; };
			expect(at(mist), 'もやが無い').toBe(TILE.CURSE_MIST);
			expect(at(chest), '宝箱が無い').toBe(TILE.CHEST);
			expect(st.chestContents?.[chest]).toEqual(content);
			expect(st.showConditions?.[chest], '宝箱に封印が付いている＝祓っても開かない').toBeUndefined();
			expect(touches(reach(st, from, mist, false), chest), 'もやを祓わずに届く').toBe(false);
			expect(touches(reach(st, from, mist, true), chest), 'もやを祓っても届かない').toBe(true);
		});
	}

	test('② もやは D1〜D4 の入口への道を塞がない／もやの総数が一覧どおり', () => {
		const field = MAP.layers.field.stages;
		const s = MAP.startPos;
		// bfsLayer はもやを「通れない」と数える（HARD_BLOCKED）∴ロウソク前の歩行と同じ
		expect(HARD_BLOCKED.has(TILE.CURSE_MIST)).toBe(true);
		const run = bfsLayer(field, { stage: s.stage, row: s.row, col: s.col });
		for (const d of ['dungeon_1', 'dungeon_2', 'dungeon_3', 'dungeon_4']) {
			expect(run.entrances.has(d), `${d} の入口へ歩けない＝もやが本筋を塞いだ`).toBe(true);
		}
		const found = [];
		for (const [lk, ld] of Object.entries(MAP.layers)) {
			if (lk === 'test_mechanics') continue;
			for (const [sk, st] of Object.entries(ld.stages ?? {})) {
				st.tiles.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.CURSE_MIST) found.push(`${lk} ${sk} ${r},${c}`); }));
			}
		}
		const expected = [...SIGNAL_MIST, ...NOOKS].map(([l, sk, m]) => `${l} ${sk} ${m}`);
		expect(found.sort()).toEqual(expected.sort());
	});
});

test('③ A1 field 7,10：剣はすり抜ける → ロウソクで祓う → 宝箱でハートのかけら', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`/blade-of-lumia/game/?${new URLSearchParams({
		fromEditor: '1', layer: 'field', stage: '7,10', row: '7', col: '8', ps_weapon: '1', ps_candle: '1',
	})}`);
	await waitForBoard(page);
	const r = await page.evaluate(() => {
		const g = window.__game;
		g.setHeroDir('right');
		g.swordAttack(); g.step(1);
		const msg = document.getElementById('msg-bar')?.textContent ?? '';
		const cutBySword = g.getStageState().cutBushes.includes('7,9');
		for (let i = 0; i < 4; i++) { g.movePlayer('right'); g.step(1); }
		const xBlocked = g.getPlayer().x;
		for (let i = 0; i < 4; i++) g.step(1);
		g.setHeroDir('right');
		g.useSubItem(); g.step(1);
		const cleared = g.getStageState().cutBushes.includes('7,9');
		for (let i = 0; i < 30; i++) g.step(1);
		const before = g.getState().player.heartPieces;
		for (let i = 0; i < 4; i++) { g.movePlayer('right'); g.step(1); }
		return { msg, cutBySword, xBlocked, cleared, before, after: g.getState().player.heartPieces };
	});
	expect(r.cutBySword, '剣でもやが消えた').toBe(false);
	expect(r.msg).toContain('すり抜けた');
	expect(r.xBlocked, 'もやを通り抜けた').toBeLessThanOrEqual(8);
	expect(r.cleared, 'ロウソクで祓えない').toBe(true);
	expect(r.after - r.before, '宝箱でかけらが手に入らない').toBe(1);
	expect(errors).toEqual([]);
});

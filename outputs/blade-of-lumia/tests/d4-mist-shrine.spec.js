// tests/d4-mist-shrine.spec.js
// dungeon_4 `0,3`「怨念の封じ祠」の番人
// （2026-10-24 / PLAN 実行キュー 92 の1室目・盤面は `scripts/migrate-d4-0-3-mist-shrine.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の真ん中に床のルピー（3）が1つだけ・敵なし＝「扉を開けたら空き部屋に r が1個」。
//
// 新しい盤面:
//      2 #.lllll....#   ← 溶岩の環
//      4 #.l.B.Ψ.....   ← 祠の宝箱 B(4,4)／怨念のもや Ψ(4,6)／東の口
//      6 #.lllll....#
//      7 #......φ...#   ← 火吐き亀 φ(7,7)
//   祠の入口はもや1枚だけ＝ロウソクの聖なる火でしか祓えない（D4 の報酬の予告）。
//
// 守るものは3つ。
//   ① データ：盤面・宝の中身・もや1枚・祓う前は宝箱に届かず祓うと届く・祓える足場は (4,7) だけ・
//      対照（もやを床／壁）・はしごで溶岩を渡れない・敵は φ 1体・層の接続は不変。
//   ② エンジンの前提：もやは徒歩で通れない・剣では消えない・ロウソクで消える（`CANDLE_CLEARABLE_TILES`）。
//   ③ 挙動（実機）：もやと溶岩に踏み込めない／剣で振ってももやは残る／ロウソクで祓って宝箱でルピー +20／
//      ロウソクを持たずに来た一周目は祓えない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, CANDLE_CLEARABLE_TILES, FOOT_SOLID_TILES } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED, LADDER_OVER } from '../scripts/lib/connectivity.mjs';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, CHEST, MIST, SEAT, TURTLE, OPENINGS, CHEST_CONTENTS, reach,
} from '../scripts/migrate-d4-0-3-mist-shrine.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 怨念の封じ祠 ① データ', () => {
	test('盤面・宝箱の中身・もや1枚（旧 床のルピーが残っていない）', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(grid.flat().filter((ch) => ch === TILE.CURSE_MIST).length, 'もやが1枚でない').toBe(1);
		expect(Object.keys(room.floorItems ?? {}), '床のアイテムが残っている').toEqual([]);
		expect(Object.keys(room.showConditions ?? {}), '宝箱に封印条件が付いている（もやが関門のはず）').toEqual([]);
	});

	test('祓う前は宝箱に届かず、祓うと届く・祓える足場は (4,7) だけ', () => {
		const pre = reach(grid, OPENINGS);
		const post = reach(grid, OPENINGS, { clearMist: true });
		expect(pre.has(CHEST), '祓う前に宝箱へ歩いて届く').toBe(false);
		expect(post.has(CHEST), '祓っても宝箱へ届かない').toBe(true);
		const [r, c] = MIST.split(',').map(Number);
		const outside = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
			.map(([a, b]) => `${a},${b}`).filter((k) => pre.has(k));
		expect(outside, '祠の外からもやに火を向けられる足場が (4,7) だけでない').toEqual([SEAT]);
	});

	test('対照：もやを床にすると祓わずに届く・壁にすると祓っても届かない（測定が空虚でない）', () => {
		const withCell = (ch) => grid.map((row, r) => row.map((x, c) => (`${r},${c}` === MIST ? ch : x)));
		expect(reach(withCell(TILE.FLOOR), OPENINGS).has(CHEST)).toBe(true);
		expect(reach(withCell(TILE.WALL), OPENINGS, { clearMist: true }).has(CHEST)).toBe(false);
	});

	test('敵は火吐き亀 1体・脅威度は看板部屋より軽い・はしごで溶岩を渡れない・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.FIRE_TURTLE}@${TURTLE}`]);
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(LADDER_OVER.has(TILE.LAVA), 'はしごで溶岩を渡れる').toBe(false);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D4 怨念の封じ祠 ② 前提：もやはロウソクでだけ消え、徒歩では通れない', () => {
	expect(CANDLE_CLEARABLE_TILES.has(TILE.CURSE_MIST), 'もやがロウソクで消える集合に無い').toBe(true);
	expect(HARD_BLOCKED.has(TILE.CURSE_MIST), '接続の検査がもやを壁とみなしていない').toBe(true);
	expect(FOOT_SOLID_TILES.has(TILE.LAVA), '溶岩が徒歩で通れる').toBe(true);
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	// 亀は通しの手順の外＝道を塞がないよう倒しておく（亀そのものの機構は facing-block-enemies が守る）
	await page.evaluate(() => {
		for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 99, 'sword');
	});
	await step(page, 2);
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// movePlayer 1回＝半マス（[[blade-moveplayer-is-half-tile]]）。
async function walk(page, dir, ops) {
	for (let i = 0; i < ops; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const pos = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return `${y},${x}`;
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);
async function candle(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.getPlayer().activeSubItem = 'candle';
	}, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 2);
}

test.describe('D4 怨念の封じ祠 ③ 実機', () => {
	test('もやと溶岩に踏み込めない・剣で振ってももやは残る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 9));
		await walk(page, 'left', 8);
		expect(await pos(page), 'もや (4,6) へ踏み込めた').toBe(SEAT);
		await page.evaluate(() => { window.__game.setHeroDir('left'); window.__game.swordAttack(); });
		await step(page, 6);
		expect((await ss(page)).cutBushes ?? [], '剣でもやが消えた').not.toContain(MIST);
		await walk(page, 'left', 4);
		expect(await pos(page), '剣を振った後にもやへ踏み込めた').toBe(SEAT);
		// 溶岩の環＝祠の北の外 (1,4) から南へ踏み出せない
		await boot(page, previewUrl(1, 4));
		await walk(page, 'down', 4);
		expect(await pos(page), '溶岩 (2,4) へ踏み出せた').toBe('1,4');
		expect(errors).toEqual([]);
	});

	test('ロウソクを持たずに来ると祓えない（一周目＝予告）', async ({ page }) => {
		await boot(page, previewUrl(4, 7));
		await page.evaluate(() => window.__game.setHeroDir('left'));
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 2);
		expect((await ss(page)).cutBushes ?? []).not.toContain(MIST);
		await walk(page, 'left', 4);
		expect(await pos(page)).toBe(SEAT);
	});

	test('通し：(4,7) から西へロウソク＝もやが祓われ、宝箱でルピー +20', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 7, { ps_candle: '1' }));
		await candle(page, 'left');
		expect((await ss(page)).cutBushes ?? [], 'ロウソクでもやが祓われない').toContain(MIST);
		const r0 = await rupees(page);
		await walk(page, 'left', 6);
		expect(await pos(page), '祠の宝箱へ歩いて行けない').toBe(CHEST);
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 20 増えない').toBe(r0 + 20);
		expect(errors).toEqual([]);
	});
});

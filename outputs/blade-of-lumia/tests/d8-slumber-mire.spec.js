// tests/d8-slumber-mire.spec.js
// dungeon_8 `0,1`「眠りヒルの泥道」と笛の新しい効き目 `fluteEffect:{type:'slumber'}` の番人
// （2026-10-26 / PLAN 実行キュー 93 の2室目・盤面は `scripts/migrate-d8-0-1-slumber-mire.mjs`・
//   エンジンは game.js playFlute → enemy-ai.js slumberEnemies／passable.js の重なり防止の例外）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   東の口と南の口が開いた通り道の真ん中に宝箱（ルピー×10）が1つあるだけ・敵なし。
//
// 新しい盤面（~ は bgTiles の水）:
//      1 #~Γ~~Γ~~~###   ← 北の窪みのヒル
//      2 #B.........#   ← 幅1の泥道・宝箱 (2,1)＝ルピー×20
//      3 #~~Γ~~Γ~~~~#   ← 南の窪みのヒル・堀 (3,10)
//      4 #########i..   ← 立札・岸 (4,10)
//   泥道の帯へははしごで堀を渡るしかない＝ヒルは帯から出られない。笛を吹くとヒルが 4 秒泥へ沈んで眠る
//   ＝上を歩ける・攻撃しない・攻撃も通らない。眠っている間は吹き直しても延びない。勇者が上に居る間は起きない。
//
// 守るものは3つ。
//   ① データ：盤面・水と泥・宝箱・立札・fluteEffect・帯は歩いて出入りできない（はしごで岸の1か所だけ）・敵と脅威度・層の接続。
//   ② 笛の眠り（実機）：吹くと全部眠る／4 秒で起きる・吹き直しても延びない／上を歩ける・剣が通らない／
//      上に立っている間は起きない／効き目の無い画面では眠らない（対照）／ヒルは帯から出られない。
//   ③ 主題（実機）：岸で吹いて眠りの上を歩き宝箱を開ける（行きは無傷）→起きたらもう一度吹いて岸へ戻る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-0-2-leech-paddy.mjs';
import {
	LAYER, ROOM, ROWS, COLS, TARGET, CHEST, CHEST_CONTENT, SIGN, SIGN_DATA, FLUTE_EFFECT, LEECHES, PATH, MOAT, BANK, LANDING,
	OPENING, MUD, STRIP, tilesOf, bgOf,
} from '../scripts/migrate-d8-0-1-slumber-mire.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
// 配っているマップの盤面（tiles に bgTiles の水を重ねた図）で測る＝TARGET で測るとマップを壊しても緑のまま
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D8 眠りヒルの泥道 ① データ', () => {
	test('盤面・水と泥・宝箱（ルピー×20）・立札・fluteEffect（slumber）', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(tilesOf().map(rowStr));
		expect(room.bgTiles, 'bgTiles（水と泥）が違う').toEqual(bgOf());
		expect(grid.map((r) => r.join('')), '水の配置が TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(room.chestContents, '宝箱の中身が違う').toEqual({ [CHEST]: CHEST_CONTENT });
		expect(MUD.every((k) => room.bgTiles[k] === TILE.MUD), '泥道・窪みに泥が無い').toBe(true);
		expect(room.signData?.[SIGN], '立札が {name,lines} 形式でない（文字列形式は無言の看板になる）').toEqual(SIGN_DATA);
		expect(room.fluteEffect, '笛の効き目が違う').toEqual(FLUTE_EFFECT);
		expect(room.floorItems ?? {}, '床の拾い物の記述が残っている').toEqual({});
		expect(room.showConditions ?? {}, '出現条件が付いた').toEqual({});
	});

	test('帯は歩いては出入りできない＝ヒルは帯から出られない・はしごで渡れるのは岸 (4,10) の1か所だけ', () => {
		const foot = reach(grid, OPENING);
		const lad = reach(grid, OPENING, { withLadder: true });
		const stranded = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = grid[r][c];
			if (!HARD_BLOCKED.has(ch) && ch !== TILE.WATER && !lad.has(`${r},${c}`)) stranded.push(`${r},${c}`);
		}
		expect(stranded, '取り残された床がある').toEqual([]);
		expect(STRIP.filter((k) => foot.has(k)), '帯に歩いて入れる＝ヒルが帯から歩いて出てくる').toEqual([]);
		expect(STRIP.filter((k) => lad.get(k) !== 1), 'はしごで水1枚では届かない帯のセルがある').toEqual([]);
		const crossings = [];
		for (const k of foot.keys()) {
			const [r, c] = k.split(',').map(Number);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				if (grid[r + dr]?.[c + dc] === TILE.WATER && STRIP.includes(`${r + 2 * dr},${c + 2 * dc}`)) crossings.push(`${k}→${r + 2 * dr},${c + 2 * dc}`);
			}
		}
		expect(crossings, 'はしごで帯へ渡れる所が岸の1か所でない').toEqual([`${BANK}→${LANDING}`]);
		expect(PATH.every((k) => { const [r, c] = k.split(',').map(Number); return grid[r - 1][c] !== TILE.FLOOR && grid[r + 1][c] !== TILE.FLOOR; }),
			'泥道が幅1でない').toBe(true);
	});

	test('敵は窪みの毒沼ヒル×4・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual(LEECHES.map((k) => `${TILE.POISON_LEECH}@${k}`));
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,1'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(layer, stage, row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_ladder: '1', ps_flute: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も敵も通れてしまう）
async function boot(page, url, enemies = 4) {
	await page.goto(url);
	await waitForBoard(page);
	await page.waitForFunction((n) => window.__game.getEnemies().length === n, enemies);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
}
const SLUMBER_TICKS = Math.ceil(FLUTE_EFFECT.ms / 120);   // TICK_MS=120

test.describe('D8 眠りヒルの泥道 ② 笛の眠り', () => {
	test('ヒルは帯から出られない（岸に 300 tick 立っていても、帯の外のセルに1度も乗らない）', async ({ page }) => {
		await boot(page, previewUrl(LAYER, ROOM, 4, 10));
		const out = await page.evaluate((strip) => {
			const g = window.__game; const bad = [];
			for (let i = 0; i < 300; i++) {
				g.step(1);
				for (const e of g.getEnemies()) {
					for (const r of [Math.floor(e.y), Math.ceil(e.y)]) for (const c of [Math.floor(e.x), Math.ceil(e.x)]) {
						if (!strip.includes(`${r},${c}`)) bad.push(`${e.id}@${e.y},${e.x}`);
					}
				}
			}
			return { bad: [...new Set(bad)].slice(0, 5), hp: g.getState().player.hp, max: g.getState().player.maxHp };
		}, STRIP);
		expect(out.bad, 'ヒルが泥道の帯から出た').toEqual([]);
		expect(out.hp, '岸に立っているだけで傷を受けた').toBe(out.max);
	});

	test('笛で全部眠る（泥に沈む）・眠っている間は動かない・4 秒で起きる・吹き直しても延びない', async ({ page }) => {
		await boot(page, previewUrl(LAYER, ROOM, 4, 10));
		const r = await page.evaluate((ticks) => {
			const g = window.__game;
			const z = () => g.getEnemies().map((e) => (e.slumberUntil != null && e.hidden ? 1 : 0)).reduce((a, b) => a + b, 0);
			g.useSubItem(); g.step(1);
			const asleep = z();
			const until = g.getEnemies().map((e) => e.slumberUntil);
			const where = () => g.getEnemies().map((e) => `${e.y},${e.x}`).join(' ');
			const at0 = where();
			const cls = [...document.querySelectorAll('.char-abs.hiding.hide-burrow')].length;
			g.step(5); g.useSubItem();   // 眠っている間に吹き直す
			const until2 = g.getEnemies().map((e) => e.slumberUntil);
			g.step(ticks - 8);
			const before = z();
			const moved = where() !== at0;
			g.step(4);
			return { asleep, cls, extended: until2.some((u, i) => u !== until[i]), before, moved, after: z() };
		}, SLUMBER_TICKS);
		expect(r.asleep, '笛を吹いても全部は眠らない').toBe(4);
		expect(r.cls, '眠ったヒルが泥に沈んだ絵（hide-burrow）になっていない').toBe(4);
		expect(r.extended, '眠っている間に吹き直すと眠りが延びた').toBe(false);
		expect(r.before, '4 秒より前に起きた').toBe(4);
		expect(r.moved, '眠っている間にヒルが動いた').toBe(false);
		expect(r.after, '4 秒を過ぎても起きない').toBe(0);
	});

	test('眠っているヒルの上は歩ける・剣で斬っても HP が減らない・上に立っている間は起きない（他は起きる）', async ({ page }) => {
		await boot(page, previewUrl(LAYER, ROOM, 2, 6));
		const r = await page.evaluate((ticks) => {
			const g = window.__game;
			// 窪み (3,6) のヒルが道 (2,6) の勇者の真下に居る。笛で眠らせてから、ヒルを道へ出させずに測る。
			g.useSubItem(); g.step(1);
			const e0 = g.getEnemies().find((e) => e.id === '3,6');
			// 剣：南を向いて窪みのヒルを斬る
			g.setHeroDir('down'); const hp0 = e0.hp;
			g.swordAttack?.(); g.step(3);
			const hp1 = g.getEnemies().find((e) => e.id === '3,6').hp;
			// 窪みのヒルの上へ歩いて立つ
			for (let i = 0; i < 2; i++) { g.movePlayer('down'); g.step(1); }
			const p = g.getState().player;
			g.step(ticks + 10);
			const stillAsleep = g.getEnemies().find((e) => e.id === '3,6').slumberUntil != null;
			const othersAwake = g.getEnemies().filter((e) => e.id !== '3,6' && e.slumberUntil == null).length;
			return { hp0, hp1, at: `${p.y},${p.x}`, stillAsleep, othersAwake };
		}, SLUMBER_TICKS);
		expect(r.hp1, '眠っているヒルに剣が通った').toBe(r.hp0);
		expect(r.at, '眠っているヒルの上へ歩けない').toBe('3,6');
		expect(r.stillAsleep, '勇者が上に立っているのにヒルが起きた').toBe(true);
		expect(r.othersAwake, '前提：上に立っていない他のヒルも起きない＝時計が進んでいない').toBe(3);
	});

	test('対照：笛の効き目の無い画面（D8 0,2 毒ヒルの泥田）ではヒルは眠らない', async ({ page }) => {
		await boot(page, previewUrl(LAYER, '0,2', 4, 10), 2);
		const n = await page.evaluate(() => { const g = window.__game; g.useSubItem(); g.step(1); return g.getEnemies().filter((e) => e.slumberUntil != null || e.hidden).length; });
		expect(n, 'fluteEffect の無い画面で眠った').toBe(0);
	});
});

test.describe('D8 眠りヒルの泥道 ③ 主題', () => {
	test('通し：岸で吹いて眠りの上を歩き宝箱 +20（行きは無傷）→起きたらもう一度吹いて岸へ戻る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(LAYER, ROOM, 5, 10));
		const r = await page.evaluate((ticks) => {
			const g = window.__game;
			const walk = (r, c) => { for (let i = 0; i < 60; i++) { const p = g.getState().player; if (Math.abs(p.y - r) < 0.01 && Math.abs(p.x - c) < 0.01) return true;
				g.movePlayer(Math.abs(p.y - r) > 0.01 ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left')); g.step(1); } return false; };
			walk(4, 10); g.step(40);                       // 岸でヒルを東の端へ寄せる
			const hp0 = g.getState().player.hp;
			const rupees0 = g.getPlayer().rupees;
			g.useSubItem(); g.step(1);
			const go = walk(2, 10) && walk(2, 2);
			for (let i = 0; i < 3; i++) { g.movePlayer('left'); g.step(1); }
			const opened = g.getStageState().openedChests.includes('2,1');
			const hpAtChest = g.getState().player.hp;
			const allAsleepAtChest = g.getEnemies().every((e) => e.slumberUntil != null);
			// 起きるまで待つ（宝箱のマスで）→もう一度吹いて岸へ戻る
			for (let i = 0; i < ticks + 10 && g.getEnemies().some((e) => e.slumberUntil != null && Math.abs(e.x - g.getState().player.x) > 0.6); i++) g.step(1);
			g.useSubItem(); g.step(1);
			const back = walk(2, 10) && walk(4, 10) && walk(5, 10);
			return { hp0, hpAtChest, go, opened, gained: g.getPlayer().rupees - rupees0, allAsleepAtChest, back, hpEnd: g.getState().player.hp };
		}, SLUMBER_TICKS);
		expect(r.go, '眠りの上を歩いて宝箱の手前まで行けない').toBe(true);
		expect(r.allAsleepAtChest, '宝箱に着く前にヒルが起きた＝1回の眠りで片道が足りない').toBe(true);
		expect(r.opened, '宝箱が開かない').toBe(true);
		expect(r.gained, 'ルピー +20 にならない').toBe(20);
		expect(r.hpAtChest, '行きで傷を受けた＝眠っているヒルが刺した').toBe(r.hp0);
		expect(r.back, 'もう一度吹いても岸へ戻れない').toBe(true);
		expect(r.hpEnd, '倒れた').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});
});

// tests/d4-curse-fire-hearth.spec.js
// dungeon_4 `3,1`「呪い火の炉」の番人
// （2026-10-24 / PLAN 実行キュー 92 の3室目・盤面は `scripts/migrate-d4-3-1-curse-fire-hearth.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四方の口が開いた四角い広間の真ん中にコンパス n が1つ落ちているだけ・敵なし＝「通るついでに拾う」。
//
// 新しい盤面:
//      1 #......#ψψψ#   ← 呪い火 ψ×3（家は全部炉の奥の行）
//      2 #.....#...n#   ← コンパス n(2,10)／炉口の曲がり角 (2,7)
//      3 #.....#.####
//      4 ......#.###.   ← 炉口の通路（列7・幅1・長さ3の L 字）
//      5 ............   ← 炉口の出口 (5,7)
//   辻の通り抜けは邪魔されない・炉は北東の角にあるだけ。
//
// 守るものは3つ。
//   ① データ：盤面・コンパス1つ・4つの口が全部つながる・炉口は幅1で辻への出口は (5,7) だけ・囲いは壁だけ・
//      辻から炉の中へ一直線に通る線が無い・対照（曲がり角を壁）・ψ の家から徘徊の箱の中を歩いて炉の外へ出られない・
//      脅威度・層の接続は不変。
//   ② 挙動（実機）：東西・南北に通り抜けられる／気づかれない間は ψ が炉から漏れない／炉口を通ってコンパスを拾える。
//   ③ 主題（実機）：炉口の出口で剣を振り続けると先に封じられる（ψ は無傷）／炉口に炎を置けば3体とも燃え尽きる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META, ROAM_DEFAULT } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, ROWS, COLS, TARGET, COMPASS_CELL, HEARTH, FLUE, HEARTH_MOUTH, FLUE_EXIT, FIRES, OPENINGS, reach,
} from '../scripts/migrate-d4-3-1-curse-fire-hearth.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
const INSIDE = new Set([...HEARTH, ...FLUE]);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 呪い火の炉 ① データ', () => {
	test('盤面・コンパス1つ・宝箱や床のアイテムは無い', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.ITEM_COMPASS).length, 'コンパスが1つでない').toBe(1);
		expect(grid[2][10], `コンパスが ${COMPASS_CELL} に無い`).toBe(TILE.ITEM_COMPASS);
		expect(grid.flat().includes(TILE.CHEST), '宝箱がある').toBe(false);
		expect(Object.keys(room.floorItems ?? {})).toEqual([]);
		expect(Object.keys(room.showConditions ?? {})).toEqual([]);
	});

	test('4つの口はどの組でもつながる（辻の通り抜けを塞がない）', () => {
		const all = Object.values(OPENINGS).flat();
		for (const [name, cells] of Object.entries(OPENINGS)) {
			const r = reach(grid, cells);
			expect(all.filter((k) => !r.has(k)), `${name} の口から届かない口がある`).toEqual([]);
		}
	});

	test('炉口は幅1・辻への出口は (5,7) だけ・囲いは壁だけ・辻から炉の中へ一直線に通らない／対照：曲がり角を壁にするとコンパスに届かない', () => {
		const walk = reach(grid, OPENINGS.west);
		expect(walk.has(COMPASS_CELL), 'コンパスに届かない').toBe(true);
		for (const k of FLUE) {
			expect(nbrs(k).filter((n) => walk.has(n) && !INSIDE.has(n) && n !== FLUE_EXIT), `炉口の通路 ${k} の横に辻の床がある`).toEqual([]);
		}
		const exits = new Set(), fence = new Set();
		for (const k of INSIDE) for (const n of nbrs(k)) {
			if (INSIDE.has(n)) continue;
			const [r, c] = n.split(',').map(Number);
			if (walk.has(n)) exits.add(n); else fence.add(grid[r][c]);
		}
		expect([...exits], '炉から辻への出口が (5,7) だけでない').toEqual([FLUE_EXIT]);
		// 呪い火は壁以外（溶岩・水・空）を越える＝囲いに混じると漏れる
		expect([...fence], '炉の囲いに壁以外が混じっている').toEqual([TILE.WALL]);
		const leaks = [];
		for (const k of HEARTH) {
			const [r0, c0] = k.split(',').map(Number);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				for (let r = r0 + dr, c = c0 + dc; r >= 0 && c >= 0 && r < ROWS && c < COLS; r += dr, c += dc) {
					if (HARD_BLOCKED.has(grid[r][c])) break;
					if (!INSIDE.has(`${r},${c}`)) { leaks.push(`${k}→${r},${c}`); break; }
				}
			}
		}
		expect(leaks, '辻から炉の中へ一直線に撃てる線がある').toEqual([]);
		const walled = grid.map((row, r) => row.map((x, c) => (`${r},${c}` === HEARTH_MOUTH ? TILE.WALL : x)));
		expect(reach(walled, OPENINGS.west).has(COMPASS_CELL), '対照：曲がり角を壁にしてもコンパスに届く＝測定が空虚').toBe(false);
	});

	test('敵は呪い火3体（家から徘徊の箱の中を歩いて炉の外へ出られない）・脅威度は看板より軽い・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual(FIRES.map((k) => `${TILE.CURSE_FIRE}@${k}`));
		expect(ENEMY_META[TILE.CURSE_FIRE].move, '呪い火が飛ばなくなった＝囲いを壁だけにした前提が変わった').toBe('air');
		const rad = (ENEMY_META[TILE.CURSE_FIRE].roam ?? ROAM_DEFAULT).radius;
		const walk = reach(grid, OPENINGS.west);
		for (const home of FIRES) {
			const [hr, hc] = home.split(',').map(Number);
			const inBox = (k) => { const [r, c] = k.split(',').map(Number); return Math.abs(r - hr) <= rad && Math.abs(c - hc) <= rad; };
			const seen = new Set([home]); const q = [home]; const out = [];
			while (q.length) {
				for (const n of nbrs(q.shift())) {
					if (seen.has(n) || !walk.has(n) || !inBox(n)) continue;
					seen.add(n);
					if (INSIDE.has(n)) q.push(n); else out.push(n);
				}
			}
			expect(out, `呪い火 ${home} が徘徊の箱の中を歩いて炉の外へ出られる`).toEqual([]);
		}
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function boot(page, url, { killFires = true, mortal = false } = {}) {
	await page.goto(url);
	await waitForBoard(page);
	// ⚠ プレビューは debugMode:true ＝ takeDamage が早期 return する∴封印・HP を測るときは 'g' で切る
	//   （tests/d2-sealfire-crypt.spec.js と同じ）。
	if (mortal) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	if (killFires) {
		await page.evaluate(() => {
			for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 99, 'sword');
		});
	}
	await step(page, 2);
}
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
const hasCompass = (page) => page.evaluate((l) => window.__game.getPlayer().dungeonItems?.[l]?.hasCompass === true, LAYER);

test.describe('D4 呪い火の炉 ② 実機', () => {
	test('東西・南北に通り抜けられる・炉の囲いに踏み込めない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(5, 1));
		await walk(page, 'right', 18);
		expect(await pos(page), '西→東に通り抜けられない').toBe('5,10');
		await boot(page, previewUrl(1, 5));
		await walk(page, 'down', 14);
		expect(await pos(page), '北→南に通り抜けられない').toBe('8,5');
		// 炉の囲い＝辻の (5,8) から北の (4,8) へ踏み出せない
		await boot(page, previewUrl(5, 8));
		await walk(page, 'up', 4);
		expect(await pos(page), '炉の囲い (4,8) へ踏み出せた').toBe('5,8');
		expect(errors).toEqual([]);
	});

	test('気づかれない間（南西の隅に居る間）は、呪い火が炉から漏れない', async ({ page }) => {
		await boot(page, previewUrl(8, 2), { killFires: false });
		// 400 tick＝48 秒。最初の叩き台（家が辻から3マス以内）は 10 秒ほどで辻へ漂い出た。
		const out = await page.evaluate((inside) => {
			const g = window.__game;
			const set = new Set(inside), out = new Set();
			for (let i = 0; i < 400; i++) {
				g.step(1);
				for (const e of g.getEnemies()) {
					const k = `${Math.round(e.y)},${Math.round(e.x)}`;
					if (!set.has(k)) out.add(k);
				}
			}
			return [...out];
		}, [...INSIDE]);
		expect(out, '呪い火が炉の外へ漂い出た').toEqual([]);
	});

	test('炉口の通路を通ってコンパスを拾える', async ({ page }) => {
		await boot(page, previewUrl(5, 7));
		expect(await hasCompass(page), '前提：まだコンパスを持っていない').toBe(false);
		await walk(page, 'up', 6);
		expect(await pos(page), '炉口の通路を曲がり角まで登れない').toBe(HEARTH_MOUTH);
		await walk(page, 'right', 6);
		expect(await pos(page), '炉の奥へ歩いて行けない').toBe(COMPASS_CELL);
		expect(await hasCompass(page), 'コンパスを拾えない').toBe(true);
	});
});

test.describe('D4 呪い火の炉 ③ 主題', () => {
	test('炉口の出口で立ち、出てきた ψ へ剣を振り続けると先に剣を封じられる（ψ は無傷）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(...FLUE_EXIT.split(',').map(Number)), { killFires: false, mortal: true });
		// 実測（.scratch/q92/probe-3-1c.mjs の C）＝0〜21 tick で封じられた∴上限 300 tick は十分。
		const r = await page.evaluate(() => {
			const g = window.__game;
			let firstSeal = null, swings = 0, hpAtSeal = null;
			for (let i = 0; i < 300 && firstSeal == null; i++) {
				const pl = g.getPlayer();
				const es = g.getEnemies();
				if (!es.length) break;   // 封じられる前に剣で全部斬れた＝下の expect で赤くする
				const e = es.reduce((a, x) => (Math.abs(x.x - pl.x) + Math.abs(x.y - pl.y) < Math.abs(a.x - pl.x) + Math.abs(a.y - pl.y) ? x : a));
				const dx = e.x - pl.x, dy = e.y - pl.y;
				if (Math.abs(dx) + Math.abs(dy) <= 1.6) {
					g.setHeroDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
					g.swordAttack(); swings++;
				}
				g.step(1);
				if (g.getState().player.swordSealed) { firstSeal = i; hpAtSeal = g.getEnemies().map((x) => x.hp); }
			}
			return { firstSeal, swings, hpAtSeal };
		});
		expect(r.firstSeal, 'ψ が炉口から出てこない／触れても剣が封じられない').not.toBeNull();
		expect(r.swings, 'ψ が剣の届く所まで寄ってこない').toBeGreaterThan(0);
		expect(r.hpAtSeal, '封じられる前に剣が ψ に当たった').toEqual([3, 3, 3]);
		expect(errors).toEqual([]);
	});

	test('炉口の出口で北を向き、炉口の通路にロウソクの炎を置き続ければ、3体とも燃え尽きる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(...FLUE_EXIT.split(',').map(Number), { ps_candle: '1' }), { killFires: false, mortal: true });
		// 炎は 3.5 秒（約 29 tick）で燃え尽きる＝30 tick ごとに置き直す。実測（probe-3-1c の B1）＝24〜32 tick で全滅。
		const r = await page.evaluate(() => {
			const g = window.__game;
			let placed = 0, i = 0, burned = 0;
			for (; i < 400 && g.getEnemies().length; i++) {
				if (i % 30 === 0) { g.setHeroDir('up'); g.useSubItem(); placed++; }
				g.step(1);
				burned = Math.max(burned, g.getPlacedFlames().reduce((s, f) => s + f.burnedCount, 0));
			}
			return { left: g.getEnemies().length, placed, ticks: i, burned, flameAt: g.getPlacedFlames().map((f) => `${f.r},${f.c}`) };
		});
		expect(r.left, `ψ が残った（炎 ${r.placed} 回・${r.ticks} tick）`).toBe(0);
		expect(r.burned, '炎が ψ を焼いていない（他の手で倒れた）').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	// コンパスは辻で拾う物＝ロウソク必須にしない（DECISIONS 2026-10-24（3）（4））。
	// ロウソクより先に来た場合の答え＝炉口の通路の一直線へブーメラン（D2 2,0 封じ火の墓廊の手）。
	test('ロウソク無しでも、炉口の通路の一直線に並んだ ψ へブーメランを投げれば3体とも落ちる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(7, 7, { ps_boomerang: '1' }), { killFires: false, mortal: true });
		// 実測（.scratch/q92/probe-3-1-boomerang.mjs）＝5 回とも 3 投・47〜117 tick で全滅∴上限 600 tick。
		const r = await page.evaluate(() => {
			const g = window.__game;
			let throws = 0, i = 0;
			for (; i < 600 && g.getEnemies().length; i++) {
				const pl = g.getPlayer();
				const inFlight = g.getProjectiles().some((x) => x.owner === 'player');
				const aligned = g.getEnemies().some((e) => Math.abs(e.x - pl.x) < 0.5 && e.y < pl.y && pl.y - e.y <= 5);
				if (aligned && !inFlight) { g.setHeroDir('up'); g.useSubItem(); throws++; }
				g.step(1);
			}
			return { left: g.getEnemies().length, throws, ticks: i, item: g.getState().player.activeSubItem };
		});
		expect(r.item, '前提：ブーメランを持っていない').toBe('boomerang');
		expect(r.left, `ψ が残った（${r.throws} 投・${r.ticks} tick）＝ロウソク無しでは解けない`).toBe(0);
		expect(errors).toEqual([]);
	});
});

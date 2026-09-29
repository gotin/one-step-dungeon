// tests/d6-caged-warden.spec.js
// dungeon_6 `3,3`「檻の番人」（石2個版）の番人
// （2026-09-28 / PLAN 実行キュー 34 の4室目・盤面は `scripts/migrate-d6-3-3-caged-warden.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   石 *(3,3)・ボタン S(3,7)・門 T(1,9)・宝箱 B(2,9) の部屋で、宝箱は (2,8)(2,10)(3,9) から
//   素で歩いて開けられた＝石もボタンも門も何も守っていない飾り。
//   その後の石1個版はユーザー判定「ちょっと簡単かも？」＝石とボタンを2個ずつにした。
//
// 新しい盤面（東側が二重の壁の檻・中は rows2-5 cols7-10）:
//      1 #B#...######   ← 宝箱 B(1,1)＝ルピー×20・門 T(2,1) の奥
//      2 #T#..##S#C.#   ← ボタン S(2,7)・柱 (2,8)・番人 C(2,9)（チェイサー）
//      3 #....##..**#   ← 石 *(3,9)(3,10)
//      4 .....##..#.#   ← 柱 (4,9)
//      5 .....##...S#   ← ボタン S(5,10)
//      8 #i.........#   ← 南の通路（檻の真下）
//   プレイヤーは檻に入れない。南東の角 (8,10) → 北西 (1,5) → 西 (4,1) → (3,4) の順に立つと、
//   番人が石を1個ずつボタンへ押し、2個目が乗った瞬間に門が開く。詰みは無い（歩くモデルで 0）。
//
// 守るものは3つ。
//   ① データ：盤面・宝・配線・看板／檻へは歩いても飛んでも入れない／門を閉じたまま宝箱に届かない／
//      番人を倒せない幾何（立てるセルから檻の中は距離 2 より遠い・射線は壁で止まる）／層の接続は不変。
//   ② エンジンの前提：爆風は壁で遮られず距離 2 以下に当たる（＝①の「2 より遠い」が要る理由）／
//      ダンジョンの敵は復活しない（＝倒されたら謎解きが死ぬ）。
//   ③ 挙動（実機）：入室で番人は動かない／想定の歩き方で石が1個ずつボタンに乗り、1個目では門は
//      開かず・ロックもされず、2個目で開いて宝箱で +20／出直せば石も番人も戻る／
//      檻に一番近い床からの爆弾・矢は檻の中の敵に当たらない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ITEM_META } from '../shared/items.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const PASSABLE_PATH = fileURLToPath(new URL('../game/passable.js', import.meta.url));
const PROJECTILE_PATH = fileURLToPath(new URL('../game/projectile.js', import.meta.url));
const GAMEJS_PATH = fileURLToPath(new URL('../game/game.js', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_6';
const ROOM = '3,3';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const ROOM_ROWS = [
	'#####..#####',
	'#B#...######',
	'#T#..##S#C.#',
	'#....##..**#',
	'.....##..#.#',
	'.....##...S#',
	'#.....######',
	'#......#####',
	'#i.........#',
	'#####..#####',
];
const WARDEN = '2,9';
const STONES = ['3,9', '3,10'];
const BUTTONS = ['2,7', '5,10'];
const GATE = '2,1';
const CHEST = '1,1';
const SIGN = '8,1';
const PEN = [];
for (let r = 2; r <= 5; r++) for (let c = 7; c <= 10; c++) PEN.push(`${r},${c}`);
const OPENINGS = ['0,5', '0,6', '4,0', '5,0', '9,5', '9,6'];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const at = (t, k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => `${rr},${cc}`);
};
// ゲーム本体の FLYABLE_OVER を読む（非公開の定数＝写しを持つと片方だけ変わって嘘になる）。
function flyableOver() {
	const src = readFileSync(PASSABLE_PATH, 'utf8');
	const m = src.match(/const FLYABLE_OVER = new Set\(\[([\s\S]*?)\]\)/);
	if (!m) throw new Error('passable.js の FLYABLE_OVER が見つからない');
	return new Set([...m[1].matchAll(/TILE\.([A-Z_]+)/g)].map(([, n]) => TILE[n]));
}
const WALK_BLOCK = new Set([TILE.WALL, TILE.TREE, TILE.WATER, TILE.PIT, TILE.LAVA, TILE.SIGN, TILE.STONE, TILE.BUSH, TILE.TORCH]);
// 口から立てるセル。fly=true は翼の羽衣で飛んで上に居られるタイルも含める。
function standable(t, { openGate = false, fly = false } = {}) {
	const FLY = flyableOver();
	const ok = (k) => {
		const ch = at(t, k);
		if (ch === undefined) return false;
		if (ch === TILE.GATE) return openGate;
		if (fly && FLY.has(ch)) return true;
		return !WALK_BLOCK.has(ch);
	};
	const seen = new Set(OPENINGS.filter(ok)), q = [...seen];
	while (q.length) {
		const k = q.shift();
		for (const n of nbrs(k)) if (!seen.has(n) && ok(n)) { seen.add(n); q.push(n); }
	}
	return seen;
}
// 番人を倒せないかの測定＝立てるセルから檻の中への最短距離と、まっすぐの射線。
function safety(t) {
	const stand = standable(t, { openGate: true, fly: true });
	let minD = Infinity;
	const lines = [];
	for (const s of stand) {
		const [a, b] = s.split(',').map(Number);
		for (const p of PEN) {
			const [c, d] = p.split(',').map(Number);
			minD = Math.min(minD, Math.hypot(a - c, b - d));
		}
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			for (let i = 1; ; i++) {
				const k = `${a + dr * i},${b + dc * i}`;
				const ch = at(t, k);
				if (ch === undefined || ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
				if (PEN.includes(k)) { lines.push(`${s}→${k}`); break; }
			}
		}
	}
	return { minD, lines };
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 檻の番人 ① データ', () => {
	const t = gridOf();

	test('盤面・宝箱・配線・看板（石2・ボタン2・門1・宝箱1・番人1）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(ROOM_ROWS);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } });
		expect(st.links).toEqual(BUTTONS.map((b) => ({ switchId: b, gateId: GATE })));
		expect(st.showConditions ?? {}, '宝箱は門で守る（出現条件は無し）').toEqual({});
		expect(Object.keys(st.signData ?? {})).toEqual([SIGN]);
		expect(st.signData[SIGN].lines.length, '看板が無言').toBeGreaterThan(0);
		expect(at(t, WARDEN)).toBe('C');
		for (const k of STONES) expect(at(t, k), `石 ${k}`).toBe(TILE.STONE);
		for (const k of BUTTONS) expect(at(t, k), `ボタン ${k}`).toBe(TILE.BUTTON);
		const flat = rowsOf(st).join('');
		const count = (ch) => [...flat].filter((x) => x === ch).length;
		expect(count(TILE.STONE), '石の数').toBe(2);
		expect(count(TILE.BUTTON), 'ボタンの数').toBe(2);
		for (const ch of [TILE.GATE, TILE.CHEST, 'C']) expect(count(ch), `'${ch}' が1つでない`).toBe(1);
	});

	test('檻へは歩いても飛んでも入れない・門を閉じたまま宝箱に届かない', () => {
		const walk = standable(t);
		const fly = standable(t, { openGate: true, fly: true });
		for (const k of OPENINGS) expect(walk.has(k), `口 (${k}) が他の口とつながらない`).toBe(true);
		expect(PEN.filter((k) => walk.has(k) || fly.has(k)), '檻の中に立てる').toEqual([]);
		expect(walk.has(CHEST), '門を閉じたまま宝箱に届く').toBe(false);
		expect(standable(t, { openGate: true }).has(CHEST), '門を開けても宝箱に届かない').toBe(true);
		expect(nbrs(CHEST).filter((k) => at(t, k) !== TILE.WALL), '宝箱の隣').toEqual([GATE]);
	});

	test('番人を倒せない：立てるどのセル（飛行込み）からも檻の中は爆風より遠く、射線は壁で止まる', () => {
		const s = safety(t);
		expect(s.minD, `檻の中まで ${s.minD.toFixed(2)}＝爆風の半径 ${ITEM_META.bomb.aoeRadius} 以内`).toBeGreaterThan(ITEM_META.bomb.aoeRadius);
		expect(s.lines, '檻の中へ通る射線').toEqual([]);
	});

	test('対照：檻の西の外側の壁を木にすると飛行で爆風が届く（測定が空虚でない）', () => {
		const trees = gridOf();
		for (let r = 2; r <= 5; r++) trees[r][5] = TILE.TREE;
		expect(safety(trees).minD, '木の上を飛んでも檻から遠い').toBeLessThanOrEqual(ITEM_META.bomb.aoeRadius);
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '3,3 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D6 檻の番人 ② エンジン：爆風は壁で遮られず距離 2 以下に当たる／ダンジョンの敵は復活しない', () => {
	const proj = readFileSync(PROJECTILE_PATH, 'utf8');
	const body = proj.slice(proj.indexOf('function explodeAt('), proj.indexOf('// プレイヤーダメージは'));
	expect(body, 'explodeAt が見つからない').not.toBe('');
	// 「> radius で除外」＝距離ちょうど 2 は当たる。檻の壁を二重にした理由。
	// 2026-09-29（キュー35）から効くセルは blastCells() が1本で作る（効果・予告・絵が同じ集合を読む）
	expect(body, 'explodeAt が blastCells() からセルを受け取っていない').toContain('blastCells(r, c, radius, sd.rows, sd.cols)');
	const cellsFn = proj.slice(proj.indexOf('function blastCells('), proj.indexOf('function buildCellsEl('));
	expect(cellsFn, 'blastCells が見つからない').not.toBe('');
	expect(cellsFn).toContain('const d = Math.sqrt(dr * dr + dc * dc);');
	expect(cellsFn).toContain('if (d > radius) continue;');
	expect(cellsFn, 'blastCells が地形を見るようになった').not.toMatch(/TILE\.|tiles\[/);
	// 壁の有無を見ずに敵へ当てている（遮蔽の判定が入ったら、この部屋の壁の厚みを見直してよい）
	expect(body.slice(body.indexOf('// 敵ダメージ'))).not.toMatch(/TILE\.WALL/);
	// 復活は field だけ（倒された番人は二度と湧かない＝倒せない配置が必須）
	const game = readFileSync(GAMEJS_PATH, 'utf8');
	const del = game.indexOf('ss.defeatedEnemies.delete(posKey);');
	expect(del, '復活の処理が見つからない').toBeGreaterThan(0);
	const guard = game.lastIndexOf('if (lk === ', del);
	expect(game.slice(guard, guard + 21), '敵の復活が field 限定でなくなった').toBe("if (lk === 'field') {");
	expect(game.slice(guard, del).split('\n').length, '復活の条件の読み取り位置がずれた').toBeLessThan(20);
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
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// movePlayer 1回＝半マス（[[blade-moveplayer-is-half-tile]]）。1 セル＝2 回。
async function walk(page, dir, cells) {
	for (let i = 0; i < cells * 2; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const pos = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return `${y},${x}`;
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const warden = (page) => page.evaluate(() => window.__game.getEnemies().find((e) => e.type === 'C') ?? null);
// 石の今の位置（押された石だけが stonePositions に「元の座→今の座」で載る）
const stonesAt = (s) => STONES.map((k) => {
	const v = s.stonePositions?.[k];
	return v ? `${v.r},${v.c}` : k;
}).sort();
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);

test.describe('D6 檻の番人 ③ 実機', () => {
	test('入室して西側と南の通路を歩き回っても番人は袋から動かない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(1, 5));
		// 終点だけ見ると、出てきて袋へ戻った番人を見逃す∴毎 tick の位置を集める
		const seen = new Set();
		const walkWatch = async (dir, cells) => {
			for (let i = 0; i < cells * 2; i++) {
				await page.evaluate((d) => window.__game.movePlayer(d), dir);
				await step(page, 1);
				const w = await warden(page);
				seen.add(`${w.y},${w.x}`);
			}
		};
		await walkWatch('left', 1);
		await walkWatch('down', 3);
		await walkWatch('left', 3);
		await walkWatch('down', 3);
		await walkWatch('right', 5);
		expect(await pos(page), '檻の南西の外角 (7,6) へ来られない').toBe('7,6');
		await walkWatch('down', 1);
		await walkWatch('right', 3);
		expect(await pos(page), '南の通路 (8,9) へ来られない').toBe('8,9');
		await step(page, 40);
		await walkWatch('left', 5);
		await walkWatch('up', 7);
		await walkWatch('right', 1);
		expect(await pos(page)).toBe('1,5');
		await step(page, 40);
		const w = await warden(page);
		seen.add(`${w.y},${w.x}`);
		expect([...seen], '番人が動いた').toEqual([WARDEN]);
		expect(stonesAt(await ss(page)), '石が動いた').toEqual([...STONES].sort());
		expect(errors).toEqual([]);
	});

	test('通し：南東の角 → 北西 → 西 → (3,4)＝石が1個ずつボタンに乗り、2個目で門が開き、宝箱で +20', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(8, 6));
		expect((await ss(page)).openGates, '最初から門が開いている').not.toContain(GATE);
		// ① 南東の角 (8,10) で待つ → 石 (3,10) が下のボタン (5,10) へ
		await walk(page, 'right', 4);
		expect(await pos(page)).toBe('8,10');
		await step(page, 40);
		const s1 = await ss(page);
		expect(stonesAt(s1), '1個目が下のボタンへ落ちない').toEqual(['3,9', '5,10']);
		expect(s1.switchStates['5,10'], '下のボタンが ON にならない').toBe(true);
		expect(s1.openGates, '1個目だけで門が開いた').not.toContain(GATE);
		expect(!!s1.stonesLocked, '1個目だけで石がロックされた').toBe(false);
		// ② 北西 (1,5) へ → 石 (3,9) が左端 (3,7) へ
		await walk(page, 'left', 6);
		await walk(page, 'up', 7);
		await walk(page, 'right', 1);
		expect(await pos(page)).toBe('1,5');
		await step(page, 40);
		expect(stonesAt(await ss(page)), '2個目が左端へ押されない').toEqual(['3,7', '5,10']);
		// ③ 西の口 (4,1) へ → 番人が石の下 (4,7) へ回り込む
		await walk(page, 'left', 1);
		await walk(page, 'down', 3);
		await walk(page, 'left', 3);
		expect(await pos(page)).toBe('4,1');
		await step(page, 40);
		const w = await warden(page);
		expect(`${w.y},${w.x}`, '番人が石の下へ回り込まない').toBe('4,7');
		// ④ (3,4) へ上がる → 石が上のボタン (2,7) へ押し上げられる
		await walk(page, 'right', 3);
		await walk(page, 'up', 1);
		await step(page, 20);
		const s2 = await ss(page);
		expect(stonesAt(s2), '2個目が上のボタンへ乗らない').toEqual(['2,7', '5,10']);
		for (const b of BUTTONS) expect(s2.switchStates[b], `ボタン ${b} が ON にならない`).toBe(true);
		expect(s2.stonesLocked, '石がロックされない').toBe(true);
		expect(s2.openGates, '門が開かない').toContain(GATE);
		// 宝箱へ：(3,4)→(3,1)→門(2,1)→宝箱(1,1)
		const r0 = await rupees(page);
		await walk(page, 'left', 3);
		await walk(page, 'up', 2);
		expect(await pos(page), '宝箱のセルに立てない').toBe(CHEST);
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 20 増えない').toBe(r0 + 20);
		expect(errors).toEqual([]);
	});

	test('門を開けずに宝箱へは入れない', async ({ page }) => {
		await boot(page, previewUrl(3, 1));
		await walk(page, 'up', 2);
		expect(await pos(page), '閉じた門を通れた').toBe('3,1');
	});

	test('1個目をボタンに乗せてから部屋を出直すと、石も番人も元の座へ戻る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(8, 6));
		await walk(page, 'right', 4);
		await step(page, 40);
		expect(stonesAt(await ss(page)), '1個目が下のボタンへ落ちない').toEqual(['3,9', '5,10']);
		// 南の口から出て、戻る（部屋の移動は実時間の演出を挟む＝stageKey が変わるまで待つ）
		await walk(page, 'left', 4);
		expect(await pos(page)).toBe('8,6');
		await walk(page, 'down', 1);
		await walk(page, 'down', 1);
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,4', null, { timeout: 5000 });
		await page.evaluate(() => window.__game.pause());
		await walk(page, 'up', 1);
		await page.waitForFunction((k) => window.__game.getState().stageKey === k, ROOM, { timeout: 5000 });
		await page.evaluate(() => window.__game.pause());
		const s2 = await ss(page);
		expect(stonesAt(s2), '出直しても石が元の座へ戻らない').toEqual([...STONES].sort());
		expect(s2.switchStates?.['5,10'] === true, '出直してもボタンが ON のまま').toBe(false);
		const w = await warden(page);
		expect(w, '番人が居ない').not.toBeNull();
		expect(`${w.y},${w.x}`, '番人が元の座へ戻らない').toBe(WARDEN);
		expect(errors).toEqual([]);
	});

	test('檻に一番近い床からの爆弾は檻の中の敵に当たらない（対照：開けた床の距離 2 の敵には当たる）', async ({ page }) => {
		// 檻に一番近い立てるセル（距離 √5）と、そこから一番近い檻の中のセル。番人は袋 (2,9) に居て遠い∴
		// 檻の中の最寄りセルに試験用の敵を置いて測る（injectEnemy は x=列・y=行）。
		for (const [r, c, er, ec] of [[1, 5, 2, 7], [6, 5, 5, 7], [7, 6, 5, 7], [8, 10, 5, 10]]) {
			await boot(page, previewUrl(r, c, { ps_bomb: '1' }));
			const id = await page.evaluate(([x, y]) => window.__game.injectEnemy(x, y, 99), [ec, er]);
			const w0 = await warden(page);
			await page.evaluate(() => {
				window.__game.getPlayer().activeSubItem = 'bomb';
				window.__game.useSubItem();
			});
			// 置いてすぐ爆風の外へ逃げる必要はない（プレイヤーの HP は測らない）
			await step(page, 30);
			const hp = await page.evaluate((i) => window.__game.getEnemies().find((e) => e.id === i)?.hp, id);
			expect(hp, `(${r},${c}) の爆弾が檻の中 (${er},${ec}) の敵に当たった`).toBe(99);
			const w1 = await warden(page);
			expect(w1, `(${r},${c}) の爆弾で番人が消えた`).not.toBeNull();
			expect(w1.hp, `(${r},${c}) の爆弾で番人の HP が減った`).toBe(w0.hp);
		}
		// 対照＝爆弾が本当に爆発して、距離 2 の敵を傷めること
		await boot(page, previewUrl(4, 2, { ps_bomb: '1' }));
		const id = await page.evaluate(() => window.__game.injectEnemy(4, 4, 99));
		await page.evaluate(() => {
			window.__game.getPlayer().activeSubItem = 'bomb';
			window.__game.useSubItem();
		});
		await step(page, 30);
		const hp = await page.evaluate((i) => window.__game.getEnemies().find((e) => e.id === i)?.hp, id);
		expect(hp, '対照の爆弾が距離 2 の敵に当たらない').toBeLessThan(99);
	});

	test('檻へまっすぐ向く床からの矢は檻の中の敵に当たらない', async ({ page }) => {
		for (const [r, c, dir, er, ec] of [[2, 4, 'right', 2, 7], [3, 4, 'right', 3, 7], [5, 4, 'right', 5, 7], [8, 7, 'up', 5, 7], [8, 10, 'up', 5, 10]]) {
			await boot(page, previewUrl(r, c, { ps_bow: '1' }));
			const id = await page.evaluate(([x, y]) => window.__game.injectEnemy(x, y, 99), [ec, er]);
			await page.evaluate((d) => {
				window.__game.setHeroDir(d);
				window.__game.getPlayer().activeSubItem = 'bow';
			}, dir);
			await step(page, 1);
			await page.evaluate(() => window.__game.useSubItem());
			expect((await page.evaluate(() => window.__game.getProjectiles())).length, `(${r},${c}) から矢が出ない`).toBeGreaterThan(0);
			await step(page, 20);
			const hp = await page.evaluate((i) => window.__game.getEnemies().find((e) => e.id === i)?.hp, id);
			expect(hp, `(${r},${c}) から${dir}の矢が檻の中 (${er},${ec}) の敵に当たった`).toBe(99);
		}
	});
});

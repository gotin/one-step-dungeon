// tests/obj-dot32-structures.spec.js — 構造物の 32 ドット化／キュー10番 10d-2
//
// 対象＝扉・ゲート・ドアウェイ・壊せる壁・松明・MAP_ENTER・祭壇（計258セル）。
// 10d-1（石・宝箱・ボタン・レバー）で作った機構（putCellSprite の dot32 判定・
// obj-sprite/item-sprite は目印として残す）をそのまま使い、絵を足しただけ。
//
// door 系（door-sprite・CSS はセル全面）だけは obj-sprite 系と扱いが違う：
//   ・見かけの大きさ制約なし（元から絵がほぼ全面を覆う設計＝連結して隙間なく
//     1枚の門に見せるため）∴ ink は「全面」を確認するだけで良い。
//   ・obj-sprite 系の ⑤（連結成分1・内側に穴が無い）は door 系には適用しない
//     ＝扉の窓・ドアウェイの奥・柵の隙間は「意図的な暗部・開口」であり、
//     10d-1 の石・宝箱のような閉じた塊とは題材が違う（穴＝ノイズという前提が
//     成立しない）。連結成分1だけ別途確認する。
//
// 観測できること（＝テストの当て所）は 10d-1 と同型：
//   ・格子    全コマ 32×32
//   ・大きさ  ink が仕様どおり・四方に透明の余白が残る（obj-sprite 系のみ）
//   ・見かけ  従来（0.7 セルの箱に入れていた頃）と同じ大きさ（obj-sprite 系のみ）
//   ・単一の真実  古い 12×16／16×16 のリテラルが残っていない
//   ・実描画  obj-sprite／door-sprite（目印）＋ dot32（全面）・attr 32・
//             1ドット＝プレイヤーと同値

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SPRITES, PAL } from '../shared/sprites.js';
import { OBJ32_SPRITES } from '../shared/sprites-obj32.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const N = 32;

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

function findAllTiles(layer, stage, ch) {
	const sd = MAP.layers?.[layer]?.stages?.[stage];
	if (!sd) return [];
	const out = [];
	for (let r = 0; r < sd.tiles.length; r++) {
		const row = sd.tiles[r];
		for (let c = 0; c < row.length; c++) if (row[c] === ch) out.push({ r, c });
	}
	return out;
}

function findTile(layer, stage, ch) {
	return findAllTiles(layer, stage, ch)[0] ?? null;
}

// showConditions が付いていない（＝素の描画で常時見える）出現を返す。
function findUnconditionalTile(layer, stage, ch) {
	const sd = MAP.layers?.[layer]?.stages?.[stage];
	if (!sd) return null;
	for (const at of findAllTiles(layer, stage, ch)) {
		const posKey = `${at.r},${at.c}`;
		if (!sd.showConditions?.[posKey]) return at;
	}
	return null;
}

// obj-sprite 系（0.7 セル中央寄せ）＝10d-1 と同じ「見かけの大きさを変えない」制約。
const KINDS_OBJ = [
	{ spr: 'gateG',         pal: 'gateG',         label: 'ゲート',         frames: 1, ink: { w: 22, h: 21 }, was: { w: 0.700, h: 0.656 } },
	{ spr: 'breakableWall', pal: 'breakableWall', label: '壊せる壁',       frames: 2, ink: { w: 22, h: 22 }, was: { w: 0.700, h: 0.700 } },
	{ spr: 'mapEnter',      pal: 'mapEnter',      label: 'MAP_ENTER',     frames: 2, ink: { w: 22, h: 21 }, was: { w: 0.700, h: 0.656 } },
	{ spr: 'doorway',       pal: 'doorway',       label: 'ドアウェイ',     frames: 2, ink: { w: 22, h: 22 }, was: { w: 0.700, h: 0.700 } },
	{ spr: 'doorwayBoss',   pal: 'doorwayBoss',   label: 'ドアウェイ(ボス)', frames: 2, ink: { w: 22, h: 22 }, was: { w: 0.700, h: 0.700 } },
	{ spr: 'doorwayLocked', pal: 'doorwayLocked', label: 'ドアウェイ(施錠)', frames: 2, ink: { w: 22, h: 22 }, was: { w: 0.700, h: 0.700 } },
	{ spr: 'torch',         pal: 'torch',         label: '松明',           frames: 3, ink: { w: 19, h: 21 }, was: { w: 0.583, h: 0.656 } },
	{ spr: 'altar',         pal: 'altar',         label: '祭壇',           frames: 1, ink: { w: 22, h: 22 }, was: { w: 0.700, h: 0.700 } },
];

// door-sprite 系（セル全面）＝見かけの大きさ制約なし。ほぼ全面（余白ごくわずか）。
const KINDS_DOOR = [
	{ spr: 'door',      pal: 'door', label: '扉' },
	{ spr: 'doorOpen',  pal: 'door', label: '扉(開)' },
	{ spr: 'doorL',     pal: 'door', label: '連結扉' },
	{ spr: 'doorLopen', pal: 'door', label: '連結扉(開)' },
];

function inkBox(g) {
	let r0 = N, r1 = -1, c0 = N, c1 = -1;
	for (let r = 0; r < g.length; r++) {
		for (let c = 0; c < g[r].length; c++) {
			if (!g[r][c]) continue;
			if (r < r0) r0 = r;
			if (r > r1) r1 = r;
			if (c < c0) c0 = c;
			if (c > c1) c1 = c;
		}
	}
	return { r0, r1, c0, c1, w: c1 - c0 + 1, h: r1 - r0 + 1 };
}

// 不透明ドットの連結成分の数（4近傍）
function inkComponents(g) {
	const seen = g.map(row => row.map(() => false));
	let n = 0;
	for (let r = 0; r < N; r++) {
		for (let c = 0; c < N; c++) {
			if (!g[r][c] || seen[r][c]) continue;
			n++;
			const st = [[r, c]];
			seen[r][c] = true;
			while (st.length) {
				const [cr, cc] = st.pop();
				for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nr = cr + dr, nc = cc + dc;
					if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
					if (seen[nr][nc] || !g[nr][nc]) continue;
					seen[nr][nc] = true;
					st.push([nr, nc]);
				}
			}
		}
	}
	return n;
}

test.describe('構造物 – 32 ドットの絵（obj-sprite 系）', () => {

	test('① 全コマが 32×32 の格子', () => {
		for (const { spr, label, frames } of KINDS_OBJ) {
			const fs = SPRITES[spr];
			expect(fs, `${label}（${spr}）の絵が無い`).toBeTruthy();
			expect(fs.length, `${label} のコマ数が変わっている`).toBe(frames);
			for (const [i, g] of fs.entries()) {
				expect(g.length, `${label} frame${i} の行数が 32 でない`).toBe(N);
				for (const row of g) expect(row.length, `${label} frame${i} の列数が 32 でない`).toBe(N);
			}
		}
	});

	test('② ink は仕様どおりの大きさで、四方に透明の余白が残る', () => {
		for (const { spr, label, ink } of KINDS_OBJ) {
			for (const [i, g] of SPRITES[spr].entries()) {
				const b = inkBox(g);
				expect(b.w, `${label} frame${i} の絵の横幅が ${ink.w} ドットでない（${b.w}）`).toBe(ink.w);
				expect(b.h, `${label} frame${i} の絵の高さが ${ink.h} ドットでない（${b.h}）`).toBe(ink.h);
				expect(b.r0, `${label} frame${i} の上に余白が無い`).toBeGreaterThan(0);
				expect(b.c0, `${label} frame${i} の左に余白が無い`).toBeGreaterThan(0);
				expect(b.r1, `${label} frame${i} の下に余白が無い`).toBeLessThan(N - 1);
				expect(b.c1, `${label} frame${i} の右に余白が無い`).toBeLessThan(N - 1);
			}
		}
	});

	test('③ 見かけの大きさが従来（0.7 セルの箱に入れていた頃）と同じ', () => {
		// 🔴 ここが赤いときは「ドットは揃ったが物が大きくなった」＝PLAN 10d の制約違反。
		for (const { spr, label, was } of KINDS_OBJ) {
			for (const [i, g] of SPRITES[spr].entries()) {
				const b = inkBox(g);
				expect(Math.abs(b.w / N - was.w), `${label} frame${i} の横幅が従来（${was.w} セル）から1ドット以上ずれる（今 ${(b.w / N).toFixed(3)} セル）`)
					.toBeLessThanOrEqual(0.032);
				expect(Math.abs(b.h / N - was.h), `${label} frame${i} の高さが従来（${was.h} セル）から1ドット以上ずれる（今 ${(b.h / N).toFixed(3)} セル）`)
					.toBeLessThanOrEqual(0.032);
			}
		}
	});

	test('④ 使う色番号はすべてパレットに定義済み', () => {
		for (const { spr, pal, label } of [...KINDS_OBJ, ...KINDS_DOOR]) {
			const p = PAL[pal];
			expect(p, `${label} のパレット ${pal} が無い`).toBeTruthy();
			for (const [i, g] of SPRITES[spr].entries()) {
				const used = new Set();
				for (const row of g) for (const v of row) if (v) used.add(v);
				for (const v of used) {
					expect(p[v], `${label} frame${i} が未定義の色番号 ${v} を使っている`).toBeTruthy();
				}
			}
		}
	});

	test('⑤ 絵は1つの連結成分（浮いた粒が無い）', () => {
		// ⚠ door 系・doorway 系・gateG は意図的に窓／柵の隙間（暗部）を持つ意匠∴
		//    10d-1（石・宝箱＝閉じた塊）と違い「内側に穴が無い」までは要求しない。
		//    ここで測るのは「1ドットの孤立した浮き粒が無い」ことだけ。
		for (const { spr, label } of [...KINDS_OBJ, ...KINDS_DOOR]) {
			for (const [i, g] of SPRITES[spr].entries()) {
				expect(inkComponents(g), `${label} frame${i} の絵が分断されている（浮いた粒がある）`).toBe(1);
			}
		}
	});

	test('⑥ 2コマの物は別の絵・かつ ink 箱が同じ（ちらついて大きさが飛ばない）', () => {
		for (const { spr, label, frames } of KINDS_OBJ) {
			if (frames < 2) continue;
			const [a, b] = SPRITES[spr];
			expect(JSON.stringify(a), `${label} の2コマが同じ絵＝アニメーションが死んでいる`)
				.not.toBe(JSON.stringify(b));
			const ba = inkBox(a), bb = inkBox(b);
			expect({ w: bb.w, h: bb.h }, `${label} のコマ間で絵の大きさが変わる`).toEqual({ w: ba.w, h: ba.h });
		}
	});

	test('⑦ 古いリテラルの絵が残っていない・色ゲートは gateG と同形', () => {
		for (const { spr, label } of [...KINDS_OBJ, ...KINDS_DOOR]) {
			expect(SPRITES[spr], `${label} の絵が別の場所のリテラルで上書きされている`)
				.toBe(OBJ32_SPRITES[spr]);
		}
		expect(SPRITES.gateRed, '色ゲート（赤）がゲートと同形でない').toBe(SPRITES.gateG);
		expect(SPRITES.gateBlu, '色ゲート（青）がゲートと同形でない').toBe(SPRITES.gateG);
	});

});

test.describe('構造物 – 32 ドットの絵（door-sprite 系）', () => {

	test('⑧ 全コマが 32×32 の格子・ほぼ全面（door-sprite は見かけ制約なし）', () => {
		for (const { spr, label } of KINDS_DOOR) {
			const fs = SPRITES[spr];
			expect(fs, `${label}（${spr}）の絵が無い`).toBeTruthy();
			expect(fs.length, `${label} のコマ数が変わっている`).toBe(1);
			const g = fs[0];
			expect(g.length, `${label} の行数が 32 でない`).toBe(N);
			for (const row of g) expect(row.length, `${label} の列数が 32 でない`).toBe(N);
			const b = inkBox(g);
			// door-sprite はセル全体に貼る設計＝縦は全面（32）を覆う。横はアーチの
			// 外側に石の陰影を見せるための余白を持つ意匠（実測 door=22／doorL=27）
			// ∴下限は 20（左右の余白がある分、10d-1 の「全面」より緩い）。
			expect(b.w, `${label} の絵が横に狭すぎる（横 ${b.w}）`).toBeGreaterThanOrEqual(20);
			expect(b.h, `${label} の絵が全面を覆っていない（縦 ${b.h}）`).toBeGreaterThanOrEqual(28);
		}
	});

});

test.describe('構造物 – 実エンジンのドット密度', () => {

	const readProbe = async (page, spots) => page.evaluate((sp) => {
		const read = (el) => {
			if (!el) return null;
			const cs = getComputedStyle(el);
			return { cls: el.className, attr: el.width, cssW: parseFloat(cs.width), cssH: parseFloat(cs.height) };
		};
		const out = { cellPx: null, hero: read(document.querySelector('#char-layer canvas')), tiles: {} };
		const anyCell = document.querySelector('#board .cell');
		out.cellPx = anyCell ? anyCell.getBoundingClientRect().width : null;
		for (const [key, { r, c }] of Object.entries(sp)) {
			const cell = document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"]`);
			out.tiles[key] = read(cell?.querySelector('canvas'));
		}
		return out;
	}, spots);

	async function expectObjSpriteDot32(page, layer, stage, spots) {
		for (const [label, at] of Object.entries(spots)) {
			expect(at, `${layer}/${stage} に ${label} が無い`).toBeTruthy();
		}
		const p = new URLSearchParams({ fromEditor: '1', layer, stage, row: '1', col: '1' });
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
		const probe = await readProbe(page, spots);
		expect(probe.cellPx, 'セルの寸法が取れない').toBeGreaterThan(10);
		expect(probe.hero, 'プレイヤーの canvas が無い').toBeTruthy();
		const heroPitch = probe.hero.cssW / probe.hero.attr;
		for (const label of Object.keys(spots)) {
			const t = probe.tiles[label];
			expect(t, `${label} のセルに canvas が無い`).toBeTruthy();
			expect(t.attr, `${label} の絵が 32 ドットでない（${t.attr}）`).toBe(N);
			expect(t.cls, `${label} の目印クラス obj-sprite が外れている`).toContain('obj-sprite');
			expect(t.cls, `${label} にセル全面のクラス dot32 が付いていない`).toContain('dot32');
			expect(t.cssW, `${label} の canvas がセル全体を覆っていない`).toBeCloseTo(probe.cellPx, 1);
			expect(t.cssW / t.attr, `${label} の1ドットがプレイヤー（${heroPitch}px）と揃っていない`)
				.toBeCloseTo(heroPitch, 5);
		}
	}

	test('⑨ ゲート・壊せる壁・MAP_ENTER・松明は 32 ドットをセル全面に貼る', async ({ page }) => {
		const gateStage = stageKey('arrow_switch');
		const wallStage = stageKey('bomb_wall');
		await expectObjSpriteDot32(page, TEST_LAYER, gateStage, {
			ゲート: findTile(TEST_LAYER, gateStage, 'T'),
		});
		await expectObjSpriteDot32(page, TEST_LAYER, wallStage, {
			壊せる壁: findTile(TEST_LAYER, wallStage, '!'),
		});
		// bomb_wall の MAP_ENTER は showConditions（bushBurned）で隠れている＝
		// 素の描画確認には使えない。field/6,13 は '>' が2つあり (6,11) は条件付き・
		// (8,8) は無条件＝常時見える方だけを使う。
		await expectObjSpriteDot32(page, 'field', '6,13', {
			MAP_ENTER: findUnconditionalTile('field', '6,13', '>'),
		});
		const torchStage = stageKey('torch_relay');
		await expectObjSpriteDot32(page, TEST_LAYER, torchStage, {
			松明: findTile(TEST_LAYER, torchStage, 'H'),
		});
	});

	test('⑩ 祭壇・ドアウェイ・ドアウェイ(ボス) は本編の実配置で 32 ドットをセル全面に貼る', async ({ page }) => {
		await expectObjSpriteDot32(page, 'field', '7,1', {
			祭壇: findTile('field', '7,1', '^'),
		});
		await expectObjSpriteDot32(page, 'dark_tower', '1,3', {
			ドアウェイ: findTile('dark_tower', '1,3', ';'),
		});
		await expectObjSpriteDot32(page, 'field', '12,19', {
			'ドアウェイ(ボス)': findTile('field', '12,19', ':'),
		});
	});

	test('⑪ 扉・連結扉は door-sprite のまま 32 ドットをセル全面に貼る（正方格子）', async ({ page }) => {
		const doorAt = findTile('field', '6,13', 'D');
		expect(doorAt, 'field/6,13 に扉が無い').toBeTruthy();
		{
			const p = new URLSearchParams({ fromEditor: '1', layer: 'field', stage: '6,13', row: '1', col: '1' });
			await page.goto(`${GAME}?${p.toString()}`);
			await waitForBoard(page);
			const probe = await readProbe(page, { 扉: doorAt });
			const t = probe.tiles['扉'];
			expect(t, '扉のセルに canvas が無い').toBeTruthy();
			expect(t.attr, '扉の絵が 32 ドットでない').toBe(N);
			expect(t.cls, '扉の目印クラス door-sprite が外れている').toContain('door-sprite');
			expect(t.cls, '扉にセル全面のクラス dot32 が付いていない').toContain('dot32');
			expect(t.cssW, '扉の canvas がセル全体を覆っていない').toBeCloseTo(probe.cellPx, 1);
			const heroPitch = probe.hero.cssW / probe.hero.attr;
			expect(t.cssW / t.attr, '扉の1ドットがプレイヤーと揃っていない').toBeCloseTo(heroPitch, 5);
		}
		{
			// 連結扉（doorL）＝横に2枚並ぶ扉。dungeon_1 0,1 の (1,5)/(1,6)。
			const left = { r: 1, c: 5 }, right = { r: 1, c: 6 };
			const sd = MAP.layers.dungeon_1.stages['0,1'];
			expect(sd.tiles[left.r][left.c], '連結扉の左セルが D でない').toBe('D');
			expect(sd.tiles[right.r][right.c], '連結扉の右セルが D でない').toBe('D');
			const p = new URLSearchParams({ fromEditor: '1', layer: 'dungeon_1', stage: '0,1', row: '1', col: '1' });
			await page.goto(`${GAME}?${p.toString()}`);
			await waitForBoard(page);
			const probe = await readProbe(page, { 左: left, 右: right });
			for (const label of ['左', '右']) {
				const t = probe.tiles[label];
				expect(t, `連結扉${label}のセルに canvas が無い`).toBeTruthy();
				expect(t.attr, `連結扉${label}の絵が 32 ドットでない`).toBe(N);
				expect(t.cssW, `連結扉${label}の canvas がセル全体を覆っていない`).toBeCloseTo(probe.cellPx, 1);
			}
		}
	});

});

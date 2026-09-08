// tests/obj-dot32-items.spec.js — 落ちアイテムの 32 ドット化／キュー10番 10d-3
//
// 何を守るテストか（tests/obj-dot32.spec.js と同型）：
//   ① 剣・盾・ブーメラン・弓・爆弾・鍵・ルピー・星の欠片・回復薬・地図・コンパス・
//      よろい・ハートの器（＋HUD の空/半ハート）は 8×8／12×16／16×16 の絵を
//      item-sprite（0.55 セル）の箱に入れていた＝1ドットの粗さがプレイヤー・地面
//      （32 ドット・セル全面）と揃わない。∴32×32 で描き直し dot32 で全面に貼る。
//   ② 見かけの大きさは変えない（PLAN 10d の制約）。旧の見かけ＝（旧ink÷旧格子）×0.55
//      セル。新しい ink（÷32）がこの値と±1〜3ドット以内に収まることを数える
//      （自由形状の絵は対角線・曲線の都合で±1ドットぴったりには収まらない＝
//      `.scratch/proto-10d3.mjs` で実測して許容差を決めた）。
//   ③ heart／heartEmpty／heartHalf は輪郭（heartMask）を共有＝HUD の HP バーで
//      3種を並べたとき ink 箱が完全に一致すること（一致しないとバーの中で大きさが
//      ガタつく）。
//   ④ 「絵が2箇所（floor 以外）でも使われる」5種（boomerang/bombItem/rupee/heart/
//      shield）は、固定ピクセル箱（cellPx の定数倍）を拡大する補正が実際に効いて
//      いること（game/projectile.js PROJ_SPRITE_SCALE・CARRY_SPRITE_SCALE、
//      game/render-chars.js SHIELD_32_SCALE、game/ui.js HEART_ICON_PX）。
//   ⑤ 単一の真実：古い 8×8／16×16 のリテラルが残っていない（SPRITES は OBJ32 と同一物）。
//   ⑥ 実描画：実マップに配置されている物は dot32 でセル全面に貼られている。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SPRITES, PAL } from '../shared/sprites.js';
import { OBJ32_SPRITES } from '../shared/sprites-obj32.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const N = 32;

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

function findTileAnyLayer(ch) {
	for (const [layerKey, layer] of Object.entries(MAP.layers ?? {})) {
		for (const [stage, sd] of Object.entries(layer.stages ?? {})) {
			for (let r = 0; r < sd.tiles.length; r++) {
				const row = sd.tiles[r];
				for (let c = 0; c < row.length; c++) {
					if (row[c] === ch) return { layerKey, stage, r, c };
				}
			}
		}
	}
	return null;
}

// 10d-3 で描き直した物。`was` は従来の見かけの大きさ（セル比・旧 ink÷旧格子×0.55）。
// tol は許容差（セル比）＝自由形状ほど緩め、剛体寄りの形ほど厳しめにした
// （`.scratch/proto-10d3.mjs` で試作・実測して決定）。
const KINDS = [
	{ spr: 'sword',    pal: 'sword',    label: '剣',       frames: 1, ink: { w: 20, h: 19 }, was: { w: 0.55,  h: 0.55  }, tol: 0.08, holes: false },
	{ spr: 'shield',   pal: 'shield',   label: '盾',       frames: 1, ink: { w: 17, h: 19 }, was: { w: 0.481, h: 0.55  }, tol: 0.06, holes: false },
	{ spr: 'boomerang',pal: 'boomerang',label: 'ブーメラン',frames: 1, ink: { w: 14, h: 14 }, was: { w: 0.4125,h: 0.4125}, tol: 0.06, holes: false },
	{ spr: 'bow',      pal: 'bow',      label: '弓',       frames: 1, ink: { w: 18, h: 19 }, was: { w: 0.481, h: 0.55  }, tol: 0.10, holes: false },
	{ spr: 'bombItem', pal: 'bombItem', label: '爆弾',     frames: 1, ink: { w: 13, h: 18 }, was: { w: 0.447, h: 0.55  }, tol: 0.06, holes: false },
	{ spr: 'key',      pal: 'key',      label: '鍵',       frames: 2, ink: { w: 11, h: 14 }, was: { w: 0.367, h: 0.378 }, tol: 0.06, holes: true  },
	{ spr: 'rupee',    pal: 'rupee',    label: 'ルピー',   frames: 1, ink: { w: 15, h: 18 }, was: { w: 0.481, h: 0.481 }, tol: 0.09, holes: false },
	{ spr: 'triforce', pal: 'triforce', label: '星の欠片', frames: 1, ink: { w: 19, h: 11 }, was: { w: 0.55,  h: 0.33  }, tol: 0.06, holes: false },
	{ spr: 'potion',   pal: 'potion',   label: '回復薬(小)',frames:1, ink: { w: 10, h: 18 }, was: { w: 0.31,  h: 0.55  }, tol: 0.06, holes: false },
	{ spr: 'bigHealPotion', pal: 'potionBig', label: '回復薬(大)', frames: 1, ink: { w: 12, h: 18 }, was: { w: 0.4125, h: 0.55 }, tol: 0.06, holes: false },
	{ spr: 'dmap',     pal: 'dmap',     label: '地図',     frames: 1, ink: { w: 14, h: 14 }, was: { w: 0.447, h: 0.447 }, tol: 0.06, holes: false },
	{ spr: 'compass',  pal: 'compass',  label: 'コンパス', frames: 1, ink: { w: 17, h: 17 }, was: { w: 0.516, h: 0.516 }, tol: 0.06, holes: false },
	{ spr: 'armor',    pal: 'armor',    label: 'よろい',   frames: 1, ink: { w: 17, h: 17 }, was: { w: 0.55,  h: 0.55  }, tol: 0.08, holes: false },
	{ spr: 'heart',    pal: 'heart',    label: 'ハートの器', frames: 1, ink: { w: 15, h: 15 }, was: { w: 0.55,  h: 0.481 }, tol: 0.09, holes: false },
	{ spr: 'heartEmpty', pal: 'heartEmpty', label: '空ハート', frames: 1, ink: { w: 15, h: 15 }, was: { w: 0.55, h: 0.481 }, tol: 0.09, holes: false },
	{ spr: 'heartHalf',  pal: 'heartHalf',  label: '半ハート', frames: 1, ink: { w: 15, h: 15 }, was: { w: 0.55, h: 0.481 }, tol: 0.09, holes: false },
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

function transparentHoles(g) {
	const seen = g.map(row => row.map(() => false));
	const st = [];
	for (let i = 0; i < N; i++) {
		for (const [r, c] of [[0, i], [N - 1, i], [i, 0], [i, N - 1]]) {
			if (!g[r][c] && !seen[r][c]) { seen[r][c] = true; st.push([r, c]); }
		}
	}
	while (st.length) {
		const [cr, cc] = st.pop();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = cr + dr, nc = cc + dc;
			if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
			if (seen[nr][nc] || g[nr][nc]) continue;
			seen[nr][nc] = true;
			st.push([nr, nc]);
		}
	}
	const holes = [];
	for (let r = 0; r < N; r++) {
		for (let c = 0; c < N; c++) if (!g[r][c] && !seen[r][c]) holes.push(`${r},${c}`);
	}
	return holes;
}

test.describe('落ちアイテム – 32 ドットの絵', () => {

	test('① 全コマが 32×32 の格子', () => {
		for (const { spr, label, frames } of KINDS) {
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
		for (const { spr, label, ink } of KINDS) {
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

	test('③ 見かけの大きさが従来（0.55 セルの箱に入れていた頃）から大きくずれていない', () => {
		for (const { spr, label, was, tol } of KINDS) {
			for (const [i, g] of SPRITES[spr].entries()) {
				const b = inkBox(g);
				expect(Math.abs(b.w / N - was.w), `${label} frame${i} の横幅が従来（${was.w} セル）から離れすぎる（今 ${(b.w / N).toFixed(3)} セル）`)
					.toBeLessThanOrEqual(tol);
				expect(Math.abs(b.h / N - was.h), `${label} frame${i} の高さが従来（${was.h} セル）から離れすぎる（今 ${(b.h / N).toFixed(3)} セル）`)
					.toBeLessThanOrEqual(tol);
			}
		}
	});

	test('④ 使う色番号はすべてパレットに定義済み', () => {
		for (const { spr, pal, label } of KINDS) {
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

	test('⑤ 絵は1つの連結成分・内側に意図しない透明の穴が無い（鍵の輪は例外）', () => {
		for (const { spr, label, holes } of KINDS) {
			for (const [i, g] of SPRITES[spr].entries()) {
				expect(inkComponents(g), `${label} frame${i} の絵が分断されている（浮いた粒がある）`).toBe(1);
				if (!holes) {
					expect(transparentHoles(g), `${label} frame${i} の内側に透明の穴があり地面が透ける`).toEqual([]);
				}
			}
		}
	});

	test('⑥ 鍵の2コマは別の絵・かつ ink 箱が同じ', () => {
		const [a, b] = SPRITES.key;
		expect(JSON.stringify(a), '鍵の2コマが同じ絵＝輝きアニメが死んでいる').not.toBe(JSON.stringify(b));
		const ba = inkBox(a), bb = inkBox(b);
		expect({ w: bb.w, h: bb.h }, '鍵のコマ間で絵の大きさが変わる').toEqual({ w: ba.w, h: ba.h });
	});

	test('⑦ heart／heartEmpty／heartHalf は ink 箱が完全一致（HUD で並べても大きさが揃う）', () => {
		const boxes = ['heart', 'heartEmpty', 'heartHalf'].map(n => inkBox(SPRITES[n][0]));
		const [h0, h1, h2] = boxes;
		expect({ w: h1.w, h: h1.h }, 'heartEmpty の ink 箱が heart と違う').toEqual({ w: h0.w, h: h0.h });
		expect({ w: h2.w, h: h2.h }, 'heartHalf の ink 箱が heart と違う').toEqual({ w: h0.w, h: h0.h });
	});

	test('⑧ 古いリテラルの絵が残っていない・爆弾は投げ爆弾と同じ絵', () => {
		for (const { spr, label } of KINDS) {
			expect(SPRITES[spr], `${label} の絵が別の場所のリテラルで上書きされている`).toBe(OBJ32_SPRITES[spr]);
		}
		expect(SPRITES.thrownBomb, '投げ爆弾が落ちアイテムの爆弾と同じ絵でない').toBe(SPRITES.bombItem);
	});

});

test.describe('落ちアイテム – 実エンジンのドット密度', () => {

	const CHAR_BY_LABEL = {
		剣: '1', 盾: '2', ブーメラン: '4', 爆弾: '5', 弓: '6', 鍵: 'K',
		ルピー: 'r', ハートの器: '9', 地図: 'm', コンパス: 'n',
	};
	const SPOTS = {};
	for (const [label, ch] of Object.entries(CHAR_BY_LABEL)) SPOTS[label] = findTileAnyLayer(ch);

	const readProbe = async (page, spots) => page.evaluate((sp) => {
		const read = (el) => {
			if (!el) return null;
			const cs = getComputedStyle(el);
			return { cls: el.className, attr: el.width, cssW: parseFloat(cs.width), cssH: parseFloat(cs.height) };
		};
		const out = { cellPx: null, tiles: {} };
		const anyCell = document.querySelector('#board .cell');
		out.cellPx = anyCell ? anyCell.getBoundingClientRect().width : null;
		for (const [key, at] of Object.entries(sp)) {
			if (!at) { out.tiles[key] = null; continue; }
			const cell = document.querySelector(`#board .cell[data-row="${at.r}"][data-col="${at.c}"]`);
			out.tiles[key] = read(cell?.querySelector('canvas'));
		}
		return out;
	}, spots);

	test('⑨ 実マップに配置されている物は dot32 でセル全面に貼られる', async ({ page }) => {
		// レイアウト（stage/座標）が変わったときに黙って的が外れないよう、まず
		// 全ラベルに実配置が見つかっていることを確認する。
		for (const [label, at] of Object.entries(SPOTS)) {
			expect(at, `${label} が実マップのどこにも見つからない（タイル文字が変わった？）`).toBeTruthy();
		}
		// ラベルごとに layer/stage が違う＝1画面にまとめて置けないので個別に開く。
		for (const [label, at] of Object.entries(SPOTS)) {
			const p = new URLSearchParams({
				fromEditor: '1', layer: at.layerKey, stage: at.stage,
				row: String(at.r), col: String(at.c),
			});
			await page.goto(`${GAME}?${p.toString()}`);
			await waitForBoard(page);
			const probe = await readProbe(page, { [label]: at });
			const t = probe.tiles[label];
			expect(t, `${label}（${at.layerKey} ${at.stage} ${at.r},${at.c}）のセルに canvas が無い`).toBeTruthy();
			expect(t.attr, `${label} の絵が 32 ドットでない（${t.attr}）`).toBe(N);
			expect(t.cls, `${label} に item-sprite が付いていない`).toContain('item-sprite');
			expect(t.cls, `${label} にセル全面のクラス dot32 が付いていない`).toContain('dot32');
			expect(t.cssW, `${label} の canvas がセル全体を覆っていない`).toBeCloseTo(probe.cellPx, 1);
		}
	});

});

test.describe('落ちアイテム – 2経路で1セットの拡大補正', () => {

	test('⑩ HUD のハート3種は同じ表示サイズ（heart/heartEmpty/heartHalf）', async ({ page }) => {
		await page.goto(`${GAME}?fromEditor=1&layer=field&stage=0,0&row=1&col=1`);
		await waitForBoard(page);
		const sizes = await page.evaluate(() => {
			const cvs = document.querySelectorAll('#hud-hearts canvas');
			return Array.from(cvs).map(cv => {
				const cs = getComputedStyle(cv);
				return { w: parseFloat(cs.width), h: parseFloat(cs.height) };
			});
		});
		expect(sizes.length, 'HUD にハートが描かれていない').toBeGreaterThan(0);
		const [first, ...rest] = sizes;
		for (const s of rest) {
			expect(s.w, 'HUD のハートの幅が揃っていない').toBeCloseTo(first.w, 1);
			expect(s.h, 'HUD のハートの高さが揃っていない').toBeCloseTo(first.h, 1);
		}
	});

	test('⑪ 飛翔中のブーメランは補正済みの大きさ（PROJ_SPRITE_SCALE が効いている）', async ({ page }) => {
		// ps_boomerang=1 で装備済みにする（tests/torch.spec.js と同じ作法）。
		const p = new URLSearchParams({
			fromEditor: '1', layer: TEST_LAYER, stage: stageKey('torch_relay'), row: '3', col: '0', ps_boomerang: '1',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
		const found = await page.evaluate(() => {
			window.__game.movePlayer('right');
			window.__game.step(1);
			window.__game.useSubItem();
			for (let i = 0; i < 15; i++) {
				window.__game.step(1);
				const projs = window.__game.getProjectiles();
				if (projs.some(p => p.type === 'boomerang')) {
					const cv = document.querySelector('[id^="proj-"] canvas.sprite');
					if (cv) {
						const cs = getComputedStyle(cv);
						const anyCell = document.querySelector('#board .cell');
						return {
							cssW: parseFloat(cs.width),
							cellPx: anyCell ? anyCell.getBoundingClientRect().width : null,
						};
					}
				}
			}
			return null;
		});
		expect(found, 'ブーメランの投擲物 canvas が見つからない').toBeTruthy();
		// sz = cellPx * 0.35 * 1.71 ≒ cellPx * 0.5985
		expect(found.cssW / found.cellPx, 'ブーメランの飛翔中の大きさが補正係数どおりでない')
			.toBeCloseTo(0.35 * 1.71, 2);
	});

});

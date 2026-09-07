// tests/obj-dot32.spec.js — 盤面に乗る「物」の 32 ドット化／キュー10番 10d-1
//
// 何を守るテストか：
//   ① 石・宝箱・ボタン・レバーは 12×16／32×32 の絵を 0.7 セルの箱（obj-sprite）に
//      入れて描いていた。1ドットは 12×16 なら 6.3px、32×32 なら 2.36px ＝プレイヤー・
//      地面・木（32 ドットをセル全面＝3.375px）と粗さが揃わない。
//      ∴ 32×32 の格子で描き直し、canvas はセル全面（.dot32）に貼る。
//   ② ただし**見かけの大きさは変えない**（PLAN 10d の制約）。∴絵の中に透明の余白を
//      持たせ、絵の実効範囲（ink）で従来と同じ大きさを作る。
//      従来の見かけ＝（旧 ink ÷ 旧格子）×0.7 セル。実測値（10d-1 着手時）：
//        石     12×16 の全面 → 0.70×0.70 セル
//        宝箱   ink 12×14/12×16 → 0.70×0.61 セル
//        ボタン ink 26×25/32×32 → 0.57×0.55 セル
//        レバー ink 28×25/32×32 → 0.61×0.55 セル
//      ∴新しい ink（÷32）がこの値と一致することを数える＝「大きくなっていない」。
//   ③ 絵そのものの品質。1ドットの孤立した粒・絵の内側の透明な穴は 3.375px の四角
//      として見える＝地面が透けたノイズになる。
//   ④ 実描画。canvas がセル全面に貼られ、1ドットがプレイヤーと厳密に一致すること。
//      **押して動かしている石**（char レイヤー側の別経路）も同じ大きさであること
//      ＝ここを 0.7 倍のままにすると「押した瞬間に石が縮む」。
//
// 観測できること（＝テストの当て所）：
//   ・格子    全コマ 32×32
//   ・大きさ  ink が仕様どおり・四方に透明の余白が残る・2コマの ink 箱が同じ
//   ・品質    ink は1つの連結成分・内部に透明の穴が無い・色番号は全部パレットにある
//   ・単一の真実  古い 12×16 のリテラルが残っていない（SPRITES は OBJ32 と同一物）
//   ・実描画  obj-sprite（目印）＋ dot32（全面）・attr 32・1ドット＝プレイヤーと同値
//   ・押した石 char レイヤーの石 canvas もセル全面

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SPRITES, PAL } from '../shared/sprites.js';
import { OBJ32_SPRITES } from '../shared/sprites-obj32.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const N = 32;

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

// 観測点の座標はマップから引く（手書きするとステージを触った時に黙って的が外れる）
function findTile(stage, ch) {
	const sd = MAP.layers?.[TEST_LAYER]?.stages?.[stage];
	if (!sd) return null;
	for (let r = 0; r < sd.tiles.length; r++) {
		const row = sd.tiles[r];
		for (let c = 0; c < row.length; c++) if (row[c] === ch) return { r, c };
	}
	return null;
}

// 10d-1 で描き直した物。`was` は従来の見かけの大きさ（セル比・上のコメントの実測値）。
const KINDS = [
	{ spr: 'block',  pal: 'block',  label: '石',     frames: 1, ink: { w: 22, h: 22 }, was: { w: 0.70, h: 0.70 } },
	{ spr: 'chest',  pal: 'chest',  label: '宝箱',   frames: 2, ink: { w: 22, h: 20 }, was: { w: 0.70, h: 0.61 } },
	{ spr: 'button', pal: 'button', label: 'ボタン', frames: 2, ink: { w: 18, h: 18 }, was: { w: 0.57, h: 0.55 } },
	{ spr: 'lever',  pal: 'lever',  label: 'レバー', frames: 2, ink: { w: 20, h: 18 }, was: { w: 0.61, h: 0.55 } },
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

// 外周から届かない透明ドット＝絵の内側の穴（地面が透けて見える）
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

test.describe('盤面の物 – 32 ドットの絵', () => {

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
				// 余白＝セル全面に貼っても物がセルを埋め切らないための命綱
				expect(b.r0, `${label} frame${i} の上に余白が無い`).toBeGreaterThan(0);
				expect(b.c0, `${label} frame${i} の左に余白が無い`).toBeGreaterThan(0);
				expect(b.r1, `${label} frame${i} の下に余白が無い`).toBeLessThan(N - 1);
				expect(b.c1, `${label} frame${i} の右に余白が無い`).toBeLessThan(N - 1);
			}
		}
	});

	test('③ 見かけの大きさが従来（0.7／0.55 セルの箱に入れていた頃）と同じ', () => {
		// 🔴 ここが赤いときは「ドットは揃ったが物が大きくなった」＝PLAN 10d の制約違反。
		//    セル全面の canvas では見かけ＝ink÷32 セル。旧値との差は 1 ドット（0.031）まで。
		// 絵から測る（仕様の表 ink ではなく実物を測る＝表を書き換えただけでは通らない）
		for (const { spr, label, was } of KINDS) {
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

	test('⑤ 絵は1つの連結成分・内側に透明の穴が無い', () => {
		for (const { spr, label } of KINDS) {
			for (const [i, g] of SPRITES[spr].entries()) {
				expect(inkComponents(g), `${label} frame${i} の絵が分断されている（浮いた粒がある）`).toBe(1);
				expect(transparentHoles(g), `${label} frame${i} の内側に透明の穴があり地面が透ける`).toEqual([]);
			}
		}
	});

	test('⑥ 2コマの物は別の絵・かつ ink 箱が同じ（ちらついて大きさが飛ばない）', () => {
		for (const { spr, label, frames } of KINDS) {
			if (frames < 2) continue;
			const [a, b] = SPRITES[spr];
			expect(JSON.stringify(a), `${label} の2コマが同じ絵＝アニメーションが死んでいる`)
				.not.toBe(JSON.stringify(b));
			const ba = inkBox(a), bb = inkBox(b);
			expect({ w: bb.w, h: bb.h }, `${label} のコマ間で絵の大きさが変わる`).toEqual({ w: ba.w, h: ba.h });
		}
	});

	test('⑦ 古いリテラルの絵が残っていない・色スイッチはレバーと同形', () => {
		// 同じ名前の絵が2箇所にあると「直したのに変わらない」事故になる
		// （[[blade-tile-sprite-single-source]]）∴ SPRITES はこのモジュールの物そのもの。
		for (const { spr, label } of KINDS) {
			expect(SPRITES[spr], `${label} の絵が別の場所のリテラルで上書きされている`)
				.toBe(OBJ32_SPRITES[spr]);
		}
		expect(SPRITES.switchRed, '色スイッチ（赤）がレバーと同形でない').toBe(SPRITES.lever);
		expect(SPRITES.switchBlu, '色スイッチ（青）がレバーと同形でない').toBe(SPRITES.lever);
	});

});

test.describe('盤面の物 – 実エンジンのドット密度', () => {

	// 検証ステージ enemy_stone = 石 '*'・ボタン 'S'・宝箱 'C' が同居し、さらに
	// チェイサーが石を押す＝「動いている石」の canvas も同じ画面で観測できる。
	// 静止画の観測は sokoban_easy＝石 '*'・ボタン 'S'・宝箱 'B'（TILE.CHEST）が
	// 同居し、かつ石を押す敵がいない∴読み取りが時間に依存しない。
	const STATIC_STAGE = stageKey('sokoban_easy');
	const SPOTS = {
		石:     findTile(STATIC_STAGE, '*'),
		ボタン: findTile(STATIC_STAGE, 'S'),
		宝箱:   findTile(STATIC_STAGE, 'B'),
	};
	// 「動いている石」は enemy_stone＝チェイサーが石をボタンへ押す画面で観測する。
	const PUSH_STAGE = stageKey('enemy_stone');

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

	test('⑧ 石・宝箱・ボタンは 32 ドットをセル全面に貼る＝1ドットがプレイヤーと同じ', async ({ page }) => {
		for (const [label, at] of Object.entries(SPOTS)) {
			expect(at, `検証ステージ ${STATIC_STAGE} に ${label} が無い`).toBeTruthy();
		}
		const p = new URLSearchParams({
			fromEditor: '1', layer: TEST_LAYER, stage: STATIC_STAGE, row: '3', col: '3',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await readProbe(page, SPOTS);
		expect(probe.cellPx, 'セルの寸法が取れない').toBeGreaterThan(10);
		expect(probe.hero, 'プレイヤーの canvas が無い').toBeTruthy();
		const heroPitch = probe.hero.cssW / probe.hero.attr;

		for (const label of Object.keys(SPOTS)) {
			const t = probe.tiles[label];
			expect(t, `${label} のセルに canvas が無い`).toBeTruthy();
			expect(t.attr, `${label} の絵が 32 ドットでない（${t.attr}）`).toBe(N);
			// 目印のクラスは残す（宝箱＝obj-sprite を数えているテストがある）
			expect(t.cls, `${label} の目印クラス obj-sprite が外れている`).toContain('obj-sprite');
			expect(t.cls, `${label} にセル全面のクラス dot32 が付いていない`).toContain('dot32');
			expect(t.cssW, `${label} の canvas がセル全体を覆っていない`).toBeCloseTo(probe.cellPx, 1);
			expect(t.cssW / t.attr, `${label} の1ドットがプレイヤー（${heroPitch}px）と揃っていない`)
				.toBeCloseTo(heroPitch, 5);
		}
	});

	test('⑨ 押して動いている石も同じ大きさ（押した瞬間に石が縮まない）', async ({ page }) => {
		const p = new URLSearchParams({
			fromEditor: '1', layer: TEST_LAYER, stage: PUSH_STAGE, row: '6', col: '5',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		// チェイサーが石をボタンへ押す＝stonePositions が入り、石は char レイヤー側の
		// 別経路（render-chars.js makeStoneCanvas）で描かれる。
		for (let i = 0; i < 80; i++) await page.evaluate(() => window.__game.step(1));

		const moved = await page.evaluate(() => {
			const anyCell = document.querySelector('#board .cell');
			const div = document.querySelector('#char-layer div[id^="char-stone-"]');
			const cv = div?.querySelector('canvas');
			if (!cv) return null;
			const cs = getComputedStyle(cv);
			return {
				attr: cv.width, cssW: parseFloat(cs.width), cssH: parseFloat(cs.height),
				cellPx: anyCell ? anyCell.getBoundingClientRect().width : null,
			};
		});
		expect(moved, '押された石の canvas が char レイヤーに無い（石が動いていない）').toBeTruthy();
		expect(moved.attr, '押された石の絵が 32 ドットでない').toBe(N);
		// 盤面に置かれている石（.dot32＝セル全面）と同じ寸法でなければ押した瞬間に縮む
		expect(moved.cssW, '押された石がセル全体を覆っていない＝押した瞬間に石が縮む')
			.toBeCloseTo(moved.cellPx, 1);
		expect(moved.cssH, '押された石の高さがセルと合っていない').toBeCloseTo(moved.cellPx, 1);
		expect(moved.cssW / moved.attr, '押された石の1ドットが 3.375px（セル÷32）でない')
			.toBeCloseTo(moved.cellPx / N, 5);
	});

	test('⑩ レバーも 32 ドットをセル全面に貼る', async ({ page }) => {
		// 検証ステージ arrow_switch にレバー 'Y'（武器でトグルするスイッチ）がある。
		const leverStage = stageKey('arrow_switch');
		const at = findTile(leverStage, 'Y');
		expect(at, `検証ステージ ${leverStage} にレバー 'Y' が無い`).toBeTruthy();

		const p = new URLSearchParams({
			fromEditor: '1', layer: TEST_LAYER, stage: leverStage, row: '1', col: '1',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await readProbe(page, { レバー: at });
		const t = probe.tiles['レバー'];
		expect(t, 'レバーのセルに canvas が無い').toBeTruthy();
		expect(t.attr, 'レバーの絵が 32 ドットでない').toBe(N);
		expect(t.cls, 'レバーにセル全面のクラス dot32 が付いていない').toContain('dot32');
		expect(t.cssW, 'レバーの canvas がセル全体を覆っていない').toBeCloseTo(probe.cellPx, 1);
	});

});

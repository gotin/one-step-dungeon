// ── tests/editor-game-parity.spec.js ── キュー11b ─────────────────────────
// 不変条件：**同じセルは3つの描画系で同じ絵になる**。
//   ① エディタのステージキャンバス（editor/editor-canvas.js drawCell）
//   ② エディタのワールドマップ右下のプレビュー（editor/editor-world.js drawWorldPreview）
//   ③ 実ゲームの盤面（game/render-board.js）
// 3系はいずれも shared/cell-appearance.js の describeCell() を設計図として読み、
// それぞれの画材（2Dキャンバス／DOM＋CSS）で描くだけになっている。
//
// 🔴 作法＝**「実際に描いた物」の記録を突き合わせる**。describeCell の答えを期待値として
//    並べるだけでは「期待値を自分で作るテスト」になり、どこかの系が共通化から外れても
//    緑になる。∴
//    ・エディタ／プレビュー … 描画手順の中で押した記録（`window.__editorDrawLog` /
//      `window.__previewDrawLog`）を読む。
//    ・実ゲーム … 盤面の DOM（`dataset.bgSprite` / `canvas.tile-sprite` の
//      `dataset.tileSprs` / `dataset.artSprite` / `dataset.objSprite`）と実際の
//      `computedStyle` を読む。
// 🔴 比べる画面はタイルを手で並べず**実マップから選ぶ**（カテゴリごとに最も多く含む画面）
//    ＝新しいタイル・新しい画面を足したときに自動で網に掛かる（11b の完了条件3）。
//
// 意図した差（比較から外すもの＝shared/cell-appearance.js の決め事と対応）：
//   ・敵とプレイヤー … 盤面には描かれない（render-chars.js が実体として描く）
//   ・状態で絵が変わる物（宝箱・鍵・トーチ・水・アイテム…） … ゲームは実行時の状態で描く
//   ・絵が無いタイルの文字アイコン（空・穴など） … エディタ／プレビューだけの目印
//   ⚠ 扉は「横の連なり（doorL＋左右反転）」がまさに食い違っていた現物∴ゲーム側も選択を
//     `dataset.objSprite` に残していて比較できる。
//   ・連結タイル（橋・家）のセルの平色と、その下の地面スプライト … ゲームはデッキ色を
//     直接セル背景に置き下地のスプライトを外す（滲み対策）。絵が不透明でセル全面を覆う
//     ∴見た目には出ない＝平色と「覆われた下地」の比較だけ外す。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { gameLayerEntries } from '../shared/layers.js';
import { describeCell, BG_TILE_STYLE, TILE_CELL_STYLE } from '../shared/cell-appearance.js';
import { FIELD_SPRITE_TILES } from '../game/render-board.js';
import { waitForBoard } from './helpers.js';

const GAME   = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));

const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// ゲームが「どの絵を選んだか」を dataset に残すタイル＝ここだけ実ゲームと突き合わせられる。
// 一覧は render-board.js から取る（手書きの写しを持たない）。他のタイル（水・祭壇・
// ドアウェイ・NPC・アイテム）は状態つきの専用分岐で描かれ選択を残さない∴比較から外す
// ＝エディタとプレビューの間では全部のセルを丸ごと比べる（下の②）。
const OBSERVED_OBJ_TILES = new Set([...FIELD_SPRITE_TILES, TILE.BUSH, TILE.DOOR]);

/** 実マップの画面を、比べたいカテゴリごとに「最も多く含む上位2画面」だけ選ぶ。 */
function pickScreens() {
	const rows = [];
	for (const [lk, ld] of gameLayerEntries(MAP)) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			if (!sd?.tiles) continue;
			const n = { ground: 0, connect: 0, skin: 0, door: 0 };
			for (let r = 0; r < sd.rows; r++) {
				for (let c = 0; c < sd.cols; c++) {
					const d = describeCell(sd, r, c);
					if (d.ground) n.ground++;
					if (d.groundConnect || d.objConnect) n.connect++;
					if (d.obj?.skin) n.skin++;
					if (d.tile === TILE.DOOR) n.door++;
				}
			}
			rows.push({ lk, sk, sd, ...n });
		}
	}
	const chosen = new Map();
	for (const cat of ['ground', 'connect', 'skin', 'door']) {
		for (const s of [...rows].sort((a, b) => b[cat] - a[cat]).slice(0, 2)) {
			if (s[cat] > 0) chosen.set(`${s.lk}/${s.sk}`, s);
		}
	}
	return [...chosen.values()];
}

/** その画面でプレイヤーを置いても安全なセル（床）＝ゲームをその画面で開くため。 */
function spawnCell(sd) {
	for (let r = 0; r < sd.rows; r++) {
		for (let c = 0; c < sd.cols; c++) if (sd.tiles[r][c] === TILE.FLOOR) return { r, c };
	}
	return { r: 1, c: 1 };
}

const hex = (rgb) => {
	const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb ?? '');
	return m ? `#${[1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, '0')).join('')}` : rgb;
};

const SCREENS = pickScreens();

// ── エディタを「実際のアプリとして」動かす ────────────────────────────────
// 🔴 モジュールを test から import() して描かせてはいけない。Vite は編集したモジュールを
//    `?t=…` 付きの URL で配る∴test の import は**別インスタンス**になり、アプリが動かして
//    いる state とは別の写しを触ることになる（記録が空のまま静かに緑になりかけた）。
//    ∴エディタ本来の UI を操作する＝「読み込み」ボタンで実マップを読ませ、レイヤータブ・
//    ワールドのセル・「ステージを編集」を実際にクリックし、アプリ自身が押した記録を読む。
async function loadRealMap(page) {
	page.on('dialog', d => d.dismiss().catch(() => {}));
	await page.goto(EDITOR);
	await page.waitForSelector('#world-grid');
	const chooser = page.waitForEvent('filechooser');
	await page.locator('#btn-load').click();
	await (await chooser).setFiles(MAP_PATH);
	await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
}

/** レイヤータブ → ワールドのセル → 「ステージを編集」を実際にクリックして画面を開く。 */
async function openScreen(page, lk, sk) {
	await page.locator('#tab-world').click();
	const tabs = page.locator('#layer-tabs button.layer-tab');
	const n = await tabs.count();
	let hit = false;
	for (let i = 0; i < n; i++) {
		// タブの中身は「レイヤーキー＋削除用の ✕」∴最初のテキストノードだけを見る
		const label = await tabs.nth(i).evaluate(el => el.childNodes[0]?.textContent ?? '');
		if (label === lk) { await tabs.nth(i).click(); hit = true; break; }
	}
	expect(hit, `レイヤータブ ${lk} が見つからない`).toBe(true);
	const [x, y] = sk.split(',').map(Number);
	const cell = page.locator('#world-grid .world-cell').filter({
		has: page.locator('.cell-coord', { hasText: new RegExp(`^\\(${x},${y}\\)`) }),
	});
	await cell.first().click();
	await page.locator('#btn-edit-stage').click();
	await page.waitForSelector('#stage-canvas', { state: 'visible' });
}

test.describe('11b：エディタ・プレビュー・ゲームで同じセルが同じ絵になる', () => {

	test('① 実マップの画面を横断して、3系が実際に描いた物が一致する', async ({ page }) => {
		// ── エディタ側：ステージキャンバスとワールドプレビューの記録を集める ──
		// エディタは localStorage から復元する＝古い可能性がある∴ゲームと同じ
		// work/blade-of-lumia.json を「読み込み」ボタンで読ませる（比べる相手とデータを揃える）。
		await loadRealMap(page);

		const editorSide = {};
		for (const s of SCREENS) {
			await openScreen(page, s.lk, s.sk);
			const logs = await page.evaluate(() => ({
				label:   document.getElementById('stage-coord-label')?.textContent ?? '',
				size:    { w: document.getElementById('stage-canvas').width, h: document.getElementById('stage-canvas').height },
				editor:  Object.fromEntries(window.__editorDrawLog ?? []),
				preview: Object.fromEntries(window.__previewDrawLog ?? []),
			}));
			// 空振り防止＝アプリが本当にこの画面を描いたか（別データ・別画面を見ていない）
			expect(logs.label, `${s.lk}/${s.sk} を開けていない`)
				.toContain(`[${s.lk}] ステージ (${s.sk.split(',')[0]}, ${s.sk.split(',')[1]})`);
			expect(logs.size, `${s.lk}/${s.sk} のキャンバスの大きさが読み込んだデータと違う`)
				.toEqual({ w: s.sd.cols * 40, h: s.sd.rows * 40 });
			editorSide[`${s.lk}/${s.sk}`] = logs;
		}

		// ── ゲーム側：盤面の DOM から「実際に描いた物」を読む ──
		const gameSide = {};
		for (const s of SCREENS) {
			const sp = spawnCell(s.sd);
			const p = new URLSearchParams({
				fromEditor: '1', layer: s.lk, stage: s.sk, row: String(sp.r), col: String(sp.c),
			});
			await page.goto(`${GAME}?${p.toString()}`);
			await waitForBoard(page);
			gameSide[`${s.lk}/${s.sk}`] = await page.evaluate(() => {
				const out = {};
				for (const el of document.querySelectorAll('#board .cell')) {
					const sprs = [];
					if (el.dataset.bgSprite) sprs.push(`${el.dataset.bgSprite}@${el.dataset.bgPal}`);
					for (const cv of el.querySelectorAll('canvas.tile-sprite')) {
						for (const n of (cv.dataset.tileSprs ?? '').split(' ').filter(Boolean)) {
							sprs.push(`${n}@${cv.dataset.tilePal}`);
						}
					}
					if (el.dataset.artSprite) sprs.push(`${el.dataset.artSprite}@${el.dataset.artPal}`);
					if (el.dataset.objSprite) sprs.push(`${el.dataset.objSprite}@${el.dataset.objPal}`);
					out[`${el.dataset.row},${el.dataset.col}`] = {
						sprs, bg: getComputedStyle(el).backgroundColor,
					};
				}
				return out;
			});
		}

		// ── 突き合わせ ──
		const bad = [];
		const seen = { ground: 0, connect: 0, skin: 0, door: 0, cells: 0, base: 0 };
		for (const s of SCREENS) {
			const key = `${s.lk}/${s.sk}`;
			const ed = editorSide[key].editor, pv = editorSide[key].preview, gm = gameSide[key];
			for (let r = 0; r < s.sd.rows; r++) {
				for (let c = 0; c < s.sd.cols; c++) {
					const pos = `${r},${c}`;
					const d = describeCell(s.sd, r, c);
					const e = ed[pos], p = pv[pos], g = gm[pos];
					if (!e || !p || !g) { bad.push(`${key} (${pos}) 記録が無い`); continue; }
					seen.cells++;
					if (d.ground) seen.ground++;
					if (d.groundConnect || d.objConnect) seen.connect++;
					if (d.obj?.skin) seen.skin++;
					if (d.tile === TILE.DOOR) seen.door++;

					// ② エディタとプレビューは全部（敵・状態つきの物・文字アイコンまで）一致する
					if (e.sprs.join(',') !== p.sprs.join(',') || e.base !== p.base || e.icon !== p.icon) {
						bad.push(`${key} (${pos}) エディタ≠プレビュー: [${e.base} ${e.sprs}|${e.icon}] vs [${p.base} ${p.sprs}|${p.icon}]`);
					}
					// ③ ゲームが選択を残す部分をエディタと比べる
					const obs = [...e.sprs];
					// 不透明な連結タイル（橋の板・家）が乗るセルは、ゲームは下地の地面
					// スプライトを外して単色を直接セルに置く（滲み対策）＝絵が全面を覆う∴
					// 見た目には出ない意図した差。キャンバス側は下から順に重ねるだけ。
					if (d.objConnect?.opaque && d.ground) obs.shift();
					if (!d.objConnect && d.obj && !OBSERVED_OBJ_TILES.has(d.tile)) obs.pop();
					if (obs.join(',') !== g.sprs.join(',')) {
						bad.push(`${key} (${pos}) t=${d.tile} bg=${d.bgTile} エディタ≠ゲーム: [${obs}] vs [${g.sprs}]`);
					}
					// 平色（連結タイルとグラデーションのタイルは除く＝冒頭の「意図した差」）
					const approx = TILE_CELL_STYLE[d.tile]?.approx;
					if (!d.groundConnect && !d.objConnect && !approx) {
						seen.base++;
						if (hex(g.bg) !== e.base) {
							bad.push(`${key} (${pos}) t=${d.tile} bg=${d.bgTile} 平色: エディタ ${e.base} vs ゲーム ${hex(g.bg)}`);
						}
					}
				}
			}
		}
		expect(bad.slice(0, 20).join('\n'), `食い違い 計 ${bad.length} 件`).toBe('');
		// 空振りで緑にならないこと＝4つのカテゴリすべてを実際に見たか
		expect(seen.cells).toBeGreaterThan(500);
		expect(seen.base).toBeGreaterThan(500);
		expect(seen.ground).toBeGreaterThan(100);
		expect(seen.connect).toBeGreaterThan(10);
		expect(seen.skin).toBeGreaterThan(5);
		expect(seen.door).toBeGreaterThan(0);
	});

	test('② 平色の表（cell-appearance.js）が実ゲームの CSS と一致する', async ({ page }) => {
		// 3系のうちキャンバス側は色を「値」で持つ∴CSS の写しになる。写し間違いをここで弾く
		// （エディタが TILE_META.color を使っていた頃は床・壁・水・溶岩がゲームと違っていた）。
		await page.goto(GAME);
		const entries = [
			...Object.entries(BG_TILE_STYLE).map(([t, v]) => [`bg:${t}`, v.cls, v.color]),
			...Object.entries(TILE_CELL_STYLE).filter(([, v]) => !v.approx).map(([t, v]) => [`tile:${t}`, v.cls, v.color]),
		];
		const got = await page.evaluate((list) => {
			const out = {};
			for (const [name, cls] of list) {
				const el = document.createElement('div');
				el.className = `cell ${cls}`.trim();
				document.body.appendChild(el);
				out[name] = getComputedStyle(el).backgroundColor;
				el.remove();
			}
			return out;
		}, entries);
		const diffs = entries
			.filter(([name, , color]) => hex(got[name]) !== color)
			.map(([name, cls, color]) => `${name} (.${cls || 'cell'}) 表 ${color} ≠ CSS ${hex(got[name])}`);
		expect(diffs.join('\n')).toBe('');
	});

	test('③ 島の角（下地のスプライト）がエディタでも平らな緑にならない', async ({ page }) => {
		// ユーザー報告の現物＝bgTiles に置いた島の角 'q/j/y/z' がエディタでは緑の四角。
		// 記録の一致（①）だけでなく、キャンバスに実際に絵が出ていることをドットで確かめる。
		const corners = [TILE.ISLAND_CORNER_NW, TILE.ISLAND_CORNER_NE, TILE.ISLAND_CORNER_SW, TILE.ISLAND_CORNER_SE];
		let target = null;
		for (const [lk, ld] of gameLayerEntries(MAP)) {
			for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
				for (const [pos, bg] of Object.entries(sd.bgTiles ?? {})) {
					if (!corners.includes(bg)) continue;
					const [r, c] = pos.split(',').map(Number);
					if (sd.tiles[r]?.[c] !== TILE.FLOOR) continue;   // 上に物が乗っていないセル
					target = { lk, sk, r, c };
					break;
				}
				if (target) break;
			}
			if (target) break;
		}
		expect(target, '実マップに島の角の下地があること').not.toBeNull();

		await loadRealMap(page);
		await openScreen(page, target.lk, target.sk);

		const colors = await page.evaluate(({ r, c }) => {
			const ctx = document.getElementById('stage-canvas').getContext('2d');
			const set = new Set();
			// セル 40px の内側（枠線 1px を避ける）を 4px 刻みで読む
			for (let dy = 3; dy < 38; dy += 4) {
				for (let dx = 3; dx < 38; dx += 4) {
					const d = ctx.getImageData(c * 40 + dx, r * 40 + dy, 1, 1).data;
					set.add(`#${[d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`);
				}
			}
			return [...set];
		}, target);

		// 平らな四角なら色は1つだけ（下地の色）。角のスプライトが敷かれていれば
		// 陸の色と水の色が同じセルに混ざる。
		expect(colors.length).toBeGreaterThan(2);
	});

});

// ── Blade of Lumia – 空（SKY・`%`）を流れる雲 ── キュー38 ──────────────────
//
// 何を直すか：空の絵（はるか下の海と雲）を止めたまま置くと「床に描いた空の絵」にしか
// 見えない（2026-10-02 ユーザー判定）。∴雲の層だけを流し、海は止める＝速さの差で
// 「雲は近く・海ははるか下」に見せる。崖の縁と影（覗き窓の枠）も止めたまま。
//
// 作り：
//   ① 海と雲はそれぞれ 128×128 の1枚の絵（shared/sprites-sky.js）を CSS の背景として
//      セルに敷く。位置は盤面の座標から引く＝隣の空のセルと絵が繋がる。
//   ② 雲の位置は #board の `--sky-cloud-x` / `--sky-cloud-y`（ドット単位の整数）を足す。
//      全セルが同じ変数を読む∴一斉に同じだけ動く（セルごとの CSS アニメーションだと
//      盤面を描き直した時刻でずれる）。ドット単位の整数＝ドット絵が滲まない。
//   ③ 縁の部品（崖の面・影）だけを canvas に描く。何を重ねるかは skyParts() が決める
//      （shared/cell-appearance.js＝エディタ・プレビューと同じ記述）。
//   ④ 画面の状態（ゲームの進行・テストの step）とは無関係の飾り＝時計は実時間。
//      prefers-reduced-motion のときは流さない。

import { SKY_SEA, SKY_CLOUD, SKY_PAL, SKY_N } from '../shared/sprites-sky.js';
import { drawSpriteLayers } from '../shared/sprites.js';

// 雲の速さ（1 ドット進むのにかかる ms）。左へ流れ、少しずつ下る。
export const SKY_CLOUD_MS_PER_DOT = { x: 110, y: 330 };

const urlCache = new Map();
function layerUrl(name, grid) {
	let url = urlCache.get(name);
	if (url) return url;
	const pal = SKY_PAL.sky;
	const cv = document.createElement('canvas');
	cv.width = SKY_N; cv.height = SKY_N;
	const ctx = cv.getContext('2d');
	for (let y = 0; y < SKY_N; y++) {
		for (let x = 0; x < SKY_N; x++) {
			const idx = grid[y][x];
			if (!idx) continue;
			ctx.fillStyle = pal[idx];
			ctx.fillRect(x, y, 1, 1);
		}
	}
	url = cv.toDataURL();
	urlCache.set(name, url);
	return url;
}

/**
 * 空のセルを塗る。parts＝skyParts() の戻り値（sprs の先頭2つが海・雲、残りが縁の部品）。
 */
export function paintSkyCell(cellEl, parts, r, c) {
	if (!parts) return;
	const size = `calc(var(--cell) * ${SKY_N / 32})`;
	const dot = (v) => `calc(${v} * var(--cell) / 32)`;
	cellEl.style.backgroundColor = SKY_PAL.sky[2];
	cellEl.style.backgroundImage = `url(${layerUrl('cloud', SKY_CLOUD)}), url(${layerUrl('sea', SKY_SEA)})`;
	cellEl.style.backgroundSize = `${size} ${size}, ${size} ${size}`;
	cellEl.style.backgroundRepeat = 'repeat, repeat';
	cellEl.style.backgroundPosition =
		`${dot(`(var(--sky-cloud-x, 0) - ${c * 32})`)} ${dot(`(var(--sky-cloud-y, 0) - ${r * 32})`)}, `
		+ `${dot(-c * 32)} ${dot(-r * 32)}`;

	// 縁の部品（崖の面・影）だけを canvas に重ねる。部品が無くても canvas は置く
	// ＝「何を描いたか」の記録（dataset）の置き場（エディタとの突き合わせに使う）。
	const cv = document.createElement('canvas');
	cv.className = 'sprite tile-sprite sky-edge';
	const edges = parts.sprs.slice(2);
	if (!edges.length || !drawSpriteLayers(cv, edges, SKY_PAL.sky)) { cv.width = 32; cv.height = 32; }
	cv.dataset.tileEdges = parts.edgeCode;
	cv.dataset.tileSprs = parts.sprs.join(' ');
	cv.dataset.tilePal = parts.pal;
	cellEl.appendChild(cv);
}

let started = false;
/** 雲を流す時計を1つだけ動かす（何度呼んでもよい）。 */
export function startSkyDrift() {
	if (started || typeof window === 'undefined') return;
	started = true;
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
	const t0 = performance.now();
	const tick = (now) => {
		requestAnimationFrame(tick);
		// 変数は :root でなく #board に置く＝書き換えで再計算されるのは盤面の中だけ。
		// 空のセルが無い画面では何もしない（盤面を描き直したら次のコマで追いつく）。
		const board = document.getElementById('board');
		if (!board || !board.querySelector('.cell.sky')) return;
		const t = now - t0;
		// 左へ（x が減る）・下へ（y が増える）。周期 128 で巻き戻す＝数が大きくならない。
		const x = String(((-Math.floor(t / SKY_CLOUD_MS_PER_DOT.x)) % SKY_N + SKY_N) % SKY_N);
		const y = String(Math.floor(t / SKY_CLOUD_MS_PER_DOT.y) % SKY_N);
		if (board.style.getPropertyValue('--sky-cloud-x') !== x) board.style.setProperty('--sky-cloud-x', x);
		if (board.style.getPropertyValue('--sky-cloud-y') !== y) board.style.setProperty('--sky-cloud-y', y);
	};
	requestAnimationFrame(tick);
}

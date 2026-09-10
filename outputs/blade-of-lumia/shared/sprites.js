// ── Blade of Lumia – Sprite System (aggregator) ──────────────
// サブファイルからスプライトデータをインポートしてマージする
// 外部からは今まで通り PAL / SPRITES を import して使用可能

import { PLAYER_PAL, PLAYER_SPRITES } from './sprites-player.js';
import { ENEMY_PAL, ENEMY_SPRITES }   from './sprites-enemies.js';
import { ITEM_PAL, ITEM_SPRITES }     from './sprites-items.js';
import { TILE_PAL, TILE_SPRITES }     from './sprites-tiles.js';
import { OBJ32_SPRITES }              from './sprites-obj32.js';

// ── パレット（全カテゴリをマージ）────────────────────────────
export const PAL = {
	...PLAYER_PAL,
	...ENEMY_PAL,
	...ITEM_PAL,
	...TILE_PAL,
};

// ── スプライトデータ（全カテゴリをマージ）────────────────────
export const SPRITES = {
	...PLAYER_SPRITES,
	...ENEMY_SPRITES,
	...ITEM_SPRITES,
	...TILE_SPRITES,
	// 盤面に乗る「物」を 32 ドットで描き直した絵（キュー10番 10d）。
	// 名前は従来と同じ＝呼び出し側（makeSprite('chest', …) 等）は変わらない。
	// パレットは ITEM_PAL / TILE_PAL のまま＝色は変えずドットの粗さだけ揃える。
	...OBJ32_SPRITES,
};

// ── 遅延登録 ───────────────────────────────────────────────────
// `SPRITES` は import 時の spread ∴サブファイル側で後から足しても届かない。
// 「組み合わせの数が多くて事前に全部作れない絵」だけここを通して足す。
// 現在の利用者＝地形の継ぎ目（`shared/ground-seams.js`／キュー10番 10b）＝
// 「自分の地面 × 変種 × 隣がどの地面か × セル座標」で決まる∴実際に画面へ出た
// 組み合わせだけを作る（1画面 120 セル・名前が同じなら絵も同じ＝使い回す）。
export function registerSprite(name, frames) {
	if (!SPRITES[name]) SPRITES[name] = frames;
	return SPRITES[name];
}

// ── Animation ──────────────────────────────────────────────────
export let animFrame = 0;
let animTimer = null;
const _tickCallbacks = [];

export function startAnimLoop(onTick) {
	if (onTick) _tickCallbacks.push(onTick);
	if (animTimer) return;
	animTimer = setInterval(() => {
		animFrame = (animFrame + 1) % 2;
		for (const cb of _tickCallbacks) cb();
	}, 400);
}

export function stopAnimLoop() {
	clearInterval(animTimer);
	animTimer = null;
}

// ── Sprite drawing ──────────────────────────────────────────────
// frameStart: 先頭の何コマを animFrame の巡回から外すか（例＝松明の消灯コマ）。
// 巡回するのは frames[frameStart..] だけ＝frameStart=0 なら従来どおり全コマ巡回。
export function drawSprite(canvas, frames, palette, flipX = false, frameStart = 0) {
	const cycle = frames.length - frameStart;
	const f    = frameStart + (animFrame % cycle);
	const grid = frames[f];
	const rows = grid.length;
	const cols = grid[0].length;
	canvas.width  = cols;
	canvas.height = rows;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, cols, rows);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const srcC = flipX ? (cols - 1 - c) : c;
			const idx = grid[r][srcC];
			if (idx === 0) continue;
			ctx.fillStyle = palette[idx] ?? 'transparent';
			ctx.fillRect(c, r, 1, 1);
		}
	}
}

export function makeSprite(spriteName, palName, animated = false, flipX = false) {
	const frames = SPRITES[spriteName];
	if (!frames) return null;
	const cv = document.createElement('canvas');
	cv.className = 'sprite';
	if (animated) {
		cv.dataset.sprite = spriteName;
		cv.dataset.pal    = palName;
		cv.dataset.flipX  = flipX ? '1' : '';
		drawSprite(cv, frames, PAL[palName] || PAL.hero, flipX);
	} else {
		// 非アニメーション：常にフレーム0で描画（animFrame に左右されない）
		drawSpriteFrame(cv, frames, 0, PAL[palName] || PAL.hero, flipX);
	}
	return cv;
}

// 指定フレームで描画（animFrame を使わない版）
export function drawSpriteFrame(canvas, frames, frameIdx, palette, flipX = false) {
	const grid = frames[frameIdx] ?? frames[0];
	const rows = grid.length;
	const cols = grid[0].length;
	canvas.width  = cols;
	canvas.height = rows;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, cols, rows);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const srcC = flipX ? (cols - 1 - c) : c;
			const idx = grid[r][srcC];
			if (idx === 0) continue;
			ctx.fillStyle = palette[idx] ?? 'transparent';
			ctx.fillRect(c, r, 1, 1);
		}
	}
}

// 複数のスプライトを同じパレットで1枚のcanvasに重ねて描く（連結タイル用）。
// 先頭が下＝以降が上。index 0（透明）は下の絵を残す。全部同じドット数を前提とする。
export function drawSpriteLayers(canvas, spriteNames, palette) {
	const base = SPRITES[spriteNames[0]];
	if (!base) return false;
	const grid0 = base[0];
	canvas.width  = grid0[0].length;
	canvas.height = grid0.length;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	for (const name of spriteNames) {
		const frames = SPRITES[name];
		if (!frames) continue;
		const grid = frames[0];
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < grid[r].length; c++) {
				const idx = grid[r][c];
				if (!idx) continue;
				ctx.fillStyle = palette[idx] ?? 'transparent';
				ctx.fillRect(c, r, 1, 1);
			}
		}
	}
	return true;
}

// アニメーションスプライトの再描画（アニメループ内から呼ぶ）
export function redrawAnimSprites() {
	document.querySelectorAll('canvas.sprite[data-sprite]').forEach(cv => {
		const frames = SPRITES[cv.dataset.sprite];
		const pal    = PAL[cv.dataset.pal] || PAL.hero;
		const flipX  = cv.dataset.flipX === '1';
		const frameStart = Number(cv.dataset.frameStart || 0);
		if (frames && frames.length - frameStart > 1) drawSprite(cv, frames, pal, flipX, frameStart);
	});
	// bgTile は原則アニメーションしない（草/砂/雪…は静止）。ただし水下地
	// （bgTiles 層の水 '~'）は tiles 層の水と同じ波アニメで揺らす（Phase 9-6 深洋O・
	// tiles 水→bgTiles 水移行後も湖/海の見た目を保つため）。ANIMATED_BG_SPRITES に
	// 載ったスプライトを敷いた cell だけ animFrame で background-image を作り直す。
	document.querySelectorAll('.cell[data-bg-sprite]').forEach(cell => {
		const sprName = cell.dataset.bgSprite;
		if (!ANIMATED_BG_SPRITES.has(sprName)) return;
		applyBgSpriteToCell(cell, sprName, cell.dataset.bgPal);
	});
}

// 水下地のようにアニメーションさせる bgTile スプライト（波の揺らぎ）。
// water 形状（普通の水／溶岩／潮ゲート）はこの集合に入れて背景でも動かす。
const ANIMATED_BG_SPRITES = new Set(['water']);

// 1フレーム分のスプライトを scale 倍のピクセルで描いた dataURL を返す（bg CSS repeat 用）
// scale=2 なら 1dot=2px でcanvasに描くのでCSS拡大不要・pixelated 不要
function makeBgDataUrl(frames, palette, scale = 1) {
	const f    = animFrame % frames.length;
	const grid = frames[f];
	const rows = grid.length;
	const cols = grid[0].length;
	const cv   = document.createElement('canvas');
	cv.width = cols * scale; cv.height = rows * scale;
	const ctx = cv.getContext('2d');
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const idx = grid[r][c];
			if (idx === 0) continue;
			ctx.fillStyle = palette[idx] ?? 'transparent';
			ctx.fillRect(c * scale, r * scale, scale, scale);
		}
	}
	return cv.toDataURL();
}

// 同じ絵を何度も canvas に描いて toDataURL するのを避けるキャッシュ。
// 1画面は 120 セル∴セルごとに描くと盤面を作り直すたび 120 回 toDataURL を呼ぶ。
// キーにコマ番号を含める＝水のアニメーションは従来どおり切り替わる。
const bgUrlCache = new Map();
function bgDataUrl(spriteName, frames, palette, palName, scale) {
	const key = `${spriteName}|${palName}|${animFrame % frames.length}|${scale}`;
	let url = bgUrlCache.get(key);
	if (url === undefined) {
		url = makeBgDataUrl(frames, palette, scale);
		bgUrlCache.set(key, url);
	}
	return url;
}

// セル1枚ぶんの地面スプライトの格子（キャラ・橋と同じ 32 ドット）。
// この寸法の絵は「セルに1枚だけ」敷く＝repeat しない（1ドット＝cellPx/32＝3.375px）。
export const CELL_GROUND_N = 32;

// bgTile を CSS background-image で cellEl に適用する。
//
// 🔴 32×32 の地面＝セル1枚に1枚だけ敷く（2026-09-06 ユーザー確定＝方針A）。
//    `background-size: 100% 100%` ∴1ドットは常に cellPx/32 で窓サイズに依らず
//    キャラ・橋と一致し、セル境界で模様が切れることも無い（`#board` に
//    `image-rendering: pixelated` があるので非整数倍率でも滲まない＝橋と同じ）。
//
// それ以外（水など）は従来どおり CSS repeat で敷く。BG_DOT_SCALE=2 が基準だが
// tilePx = dotCount×scale が cellPx を割り切れないとセル境界でパターンがズレるため、
// 「cellPx % (dotCount×s) === 0 を満たす s のうち 2 に最も近い値」を動的に選ぶ。
// --cell=48 → s=2（16px、3タイル/cell、元通り）
// --cell=72 → s=3（24px、3タイル/cell、1dot≒3px）
// --cell=108 → 水（12ドット幅）は s=3（36px、3タイル/cell、1dot=3px）
export function applyBgSpriteToCell(cellEl, spriteName, palName) {
	const frames = SPRITES[spriteName];
	if (!frames) return;
	const pal  = PAL[palName] || PAL.hero;
	const grid = frames[0];
	const dotCols = grid[0].length;
	const dotRows = grid.length;
	cellEl.dataset.bgSprite = spriteName;
	cellEl.dataset.bgPal    = palName;
	if (dotCols === CELL_GROUND_N && dotRows === CELL_GROUND_N) {
		cellEl.style.backgroundImage  = `url(${bgDataUrl(spriteName, frames, pal, palName, 1)})`;
		cellEl.style.backgroundSize   = '100% 100%';
		cellEl.style.backgroundRepeat = 'no-repeat';
		return;
	}
	const cellPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;
	// cellPx を (dotCount×s) で割り切れる s を探し、2 に最も近い値を選ぶ（同距離なら大きい方）
	let scale = 1, bestDist = Infinity;
	for (let s = 1; s <= 16; s++) {
		if (cellPx % (dotCols * s) === 0) {
			const dist = Math.abs(s - 2);
			if (dist < bestDist || (dist === bestDist && s > scale)) {
				bestDist = dist; scale = s;
			}
		}
	}
	const w = dotCols * scale;
	const h = dotRows * scale;
	cellEl.style.backgroundImage  = `url(${bgDataUrl(spriteName, frames, pal, palName, scale)})`;
	cellEl.style.backgroundSize   = `${w}px ${h}px`;
	cellEl.style.backgroundRepeat = 'repeat';
}

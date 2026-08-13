// ── Blade of Lumia – Sprite System (aggregator) ──────────────
// サブファイルからスプライトデータをインポートしてマージする
// 外部からは今まで通り PAL / SPRITES を import して使用可能

import { PLAYER_PAL, PLAYER_SPRITES } from './sprites-player.js';
import { ENEMY_PAL, ENEMY_SPRITES }   from './sprites-enemies.js';
import { ITEM_PAL, ITEM_SPRITES }     from './sprites-items.js';
import { TILE_PAL, TILE_SPRITES }     from './sprites-tiles.js';

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
};

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
export function drawSprite(canvas, frames, palette, flipX = false) {
	const f    = animFrame % frames.length;
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

// アニメーションスプライトの再描画（アニメループ内から呼ぶ）
export function redrawAnimSprites() {
	document.querySelectorAll('canvas.sprite[data-sprite]').forEach(cv => {
		const frames = SPRITES[cv.dataset.sprite];
		const pal    = PAL[cv.dataset.pal] || PAL.hero;
		const flipX  = cv.dataset.flipX === '1';
		if (frames && frames.length > 1) drawSprite(cv, frames, pal, flipX);
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

// bgTile を CSS background-image repeat で cellEl に適用する
// BG_DOT_SCALE=2 が基準（キャラスプライトと同等の粒感）。ただし
// tilePx = dotCount×scale が cellPx を割り切れないとセル境界でパターンがズレるため、
// 「cellPx % (dotCount×s) === 0 を満たす s のうち 2 に最も近い値」を動的に選ぶ。
// --cell=48 → s=2（16px、3タイル/cell、元通り）
// --cell=72 → s=3（24px、3タイル/cell、1dot≒3px）
export function applyBgSpriteToCell(cellEl, spriteName, palName) {
	const frames = SPRITES[spriteName];
	if (!frames) return;
	const pal  = PAL[palName] || PAL.hero;
	const grid = frames[0];
	const dotCols = grid[0].length;
	const dotRows = grid.length;
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
	cellEl.dataset.bgSprite = spriteName;
	cellEl.dataset.bgPal    = palName;
	cellEl.style.backgroundImage  = `url(${makeBgDataUrl(frames, pal, scale)})`;
	cellEl.style.backgroundSize   = `${w}px ${h}px`;
	cellEl.style.backgroundRepeat = 'repeat';
}

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
}

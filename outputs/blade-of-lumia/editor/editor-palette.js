// ── editor-palette.js ── タイルパレット・スプライト描画 ────────
import { TILE, TILE_META } from '../shared/tiles.js';
import { SPRITES, PAL, animFrame } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { state, tilePaletteEl } from './editor-state.js';

// タイル → スプライト対応は shared/tile-sprites.js（単一の真実）を再エクスポート。
// エディタとゲーム（render-board.js）が同じ表を見ることで見た目を一致させる。
export { TILE_SPRITE_MAP };

// エディタでは「状態で 2 フレームを切り替える」スプライト（ボタン押下・レバー
// ON/OFF）は frame0（OFF/浮き）で固定表示する。アニメ扱いだと配置物が
// 勝手に押された/ON 状態にチラついて紛らわしいため。
const STATIC_FRAME0 = new Set(['button', 'lever']);

export function drawSpriteAt(ctx, spriteName, palName, dx, dy, dw, dh) {
	const frames = SPRITES[spriteName];
	if (!frames) return false;
	const palette = PAL[palName] ?? PAL.hero;
	const fi   = STATIC_FRAME0.has(spriteName) ? 0 : (animFrame % frames.length);
	const grid = frames[fi];
	const rows = grid.length, cols = grid[0].length;
	const tmp  = document.createElement('canvas');
	tmp.width = cols; tmp.height = rows;
	const tctx = tmp.getContext('2d');
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const idx = grid[r][c];
			if (!idx) continue;
			tctx.fillStyle = palette[idx];
			tctx.fillRect(c, r, 1, 1);
		}
	}
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(tmp, dx, dy, dw, dh);
	return true;
}

// カテゴリ分け
const PALETTE_CATEGORIES = [
	{ label: '地形（背景）', tiles: [TILE.FLOOR, TILE.GRASS, TILE.SAND, TILE.STONE_FLOOR, TILE.BRIDGE, TILE.SNOW, TILE.ASH, TILE.MUD] },
	{ label: '障害物・建物', tiles: [TILE.WALL, TILE.WATER, TILE.LAVA, TILE.BREAKABLE_WALL, TILE.TREE, TILE.MOUNTAIN, TILE.BUSH, TILE.FENCE, TILE.HOUSE_WALL, TILE.HOUSE_DOOR, TILE.HOUSE_ROOF, TILE.SIGN] },
	{ label: 'プレイヤー', tiles: [TILE.PLAYER] },
	{ label: '敵',    tiles: [TILE.PATROL, TILE.CHASER, TILE.SENTRY, TILE.BOSS, TILE.MONSTER, TILE.DARK_LORD, TILE.FISH_SCHOOL] },
	{ label: 'NPC',   tiles: [TILE.PRINCESS, TILE.NPC_A, TILE.NPC_B, TILE.NPC_SHOP] },
	{ label: 'ギミック', tiles: [TILE.GATE, TILE.TIDE_GATE, TILE.BUTTON, TILE.SWITCH, TILE.TORCH, TILE.DOOR, TILE.KEY, TILE.CHEST, TILE.STONE, TILE.MAP_ENTER, TILE.ALTAR] },
	{ label: 'ドアウェイ', tiles: [TILE.DOORWAY, TILE.DOORWAY_BOSS, TILE.DOORWAY_LOCKED] },
	{ label: 'アイテム', tiles: [
		TILE.ITEM_SWORD, TILE.ITEM_SHIELD, TILE.ITEM_ARMOR,
		TILE.ITEM_BOOMERANG, TILE.ITEM_BOMB, TILE.ITEM_BOW,
		TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION,
		TILE.ITEM_HEART_CONTAINER, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE,
		TILE.ITEM_TRIFORCE_PIECE, TILE.ITEM_DUNGEON_MAP, TILE.ITEM_COMPASS,
	]},
];

export function buildTilePalette(updateToolButtons) {
	tilePaletteEl.innerHTML = '';
	for (const cat of PALETTE_CATEGORIES) {
		const sep = document.createElement('div');
		sep.className = 'tile-category';
		sep.textContent = cat.label;
		tilePaletteEl.appendChild(sep);
		for (const tileChar of cat.tiles) {
			const meta = TILE_META[tileChar];
			if (!meta) continue;
			const btn = document.createElement('button');
			btn.className = 'tile-btn' + (tileChar === state.selectedTile ? ' selected' : '');
			btn.title = meta.label;

			const si = TILE_SPRITE_MAP[tileChar];
			if (si && SPRITES[si.spr]) {
				const cv = document.createElement('canvas');
				cv.width = 28; cv.height = 28;
				cv.style.imageRendering = 'pixelated';
				cv.style.display = 'block';
				drawSpriteAt(cv.getContext('2d'), si.spr, si.pal, 0, 0, 28, 28);
				btn.appendChild(cv);
			} else {
				const icon = document.createElement('span');
				icon.className = 'tile-icon';
				icon.textContent = meta.icon ?? tileChar;
				btn.appendChild(icon);
			}
			const lbl = document.createElement('span');
			lbl.className = 'tile-label';
			lbl.textContent = meta.label;
			btn.appendChild(lbl);

			btn.addEventListener('click', () => {
				state.selectedTile = tileChar;
				state.currentTool  = 'draw';
				updateToolButtons();
				buildTilePalette(updateToolButtons);
			});
			tilePaletteEl.appendChild(btn);
		}
	}
}

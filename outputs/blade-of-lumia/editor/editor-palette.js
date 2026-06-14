// ── editor-palette.js ── タイルパレット・スプライト描画 ────────
import { TILE, TILE_META } from '../shared/tiles.js';
import { SPRITES, PAL, animFrame } from '../shared/sprites.js';
import { state, tilePaletteEl } from './editor-state.js';

// タイル → スプライト対応
export const TILE_SPRITE_MAP = {
	[TILE.SWITCH]:    { spr: 'swG',      pal: 'swG'      },
	[TILE.GATE]:      { spr: 'gateG',    pal: 'gateG'    },
	[TILE.DOOR]:      { spr: 'door',     pal: 'door'     },
	[TILE.KEY]:       { spr: 'key',      pal: 'key'      },
	[TILE.STONE]:     { spr: 'block',    pal: 'block'    },
	[TILE.CHEST]:     { spr: 'chest',    pal: 'chest'    },
	[TILE.WATER]:     { spr: 'water',    pal: 'water'    },
	[TILE.PATROL]:    { spr: 'patrol',   pal: 'patrol'   },
	[TILE.CHASER]:    { spr: 'chaser',   pal: 'chaser'   },
	[TILE.SENTRY]:    { spr: 'sentry',   pal: 'sentry'   },
	[TILE.BOSS]:      { spr: 'escape',   pal: 'escape'   },
	[TILE.MONSTER]:   { spr: 'monster',  pal: 'monster'  },
	[TILE.DARK_LORD]: { spr: 'darklord', pal: 'darklord' },
	[TILE.PRINCESS]:  { spr: 'princess', pal: 'princess' },
	[TILE.PLAYER]:    { spr: 'heroD',    pal: 'hero'     },
	[TILE.NPC_A]:     { spr: 'npcA',     pal: 'npcA'     },
	[TILE.NPC_B]:     { spr: 'npcB',     pal: 'npcB'     },
	[TILE.ITEM_SWORD]:           { spr: 'sword',    pal: 'sword'    },
	[TILE.ITEM_SHIELD]:          { spr: 'shield',   pal: 'shield'   },
	[TILE.ITEM_BOOMERANG]:       { spr: 'boomerang',pal: 'boomerang'},
	[TILE.ITEM_RUPEE]:           { spr: 'rupee',    pal: 'rupee'    },
	[TILE.ITEM_RUPEE_LARGE]:     { spr: 'rupee',    pal: 'rupeeBlue'},
	[TILE.ITEM_TRIFORCE_PIECE]:  { spr: 'triforce', pal: 'triforce' },
	[TILE.BREAKABLE_WALL]:       { spr: 'breakableWall', pal: 'breakableWall' },
	[TILE.MAP_ENTER]:            { spr: 'mapEnter', pal: 'mapEnter' },
	[TILE.ITEM_HEART_CONTAINER]: { spr: 'heart',     pal: 'heart'     },
	[TILE.DOORWAY]:              { spr: 'doorway',       pal: 'doorway'       },
	[TILE.DOORWAY_BOSS]:         { spr: 'doorwayBoss',   pal: 'doorwayBoss'   },
	[TILE.DOORWAY_LOCKED]:       { spr: 'doorwayLocked', pal: 'doorwayLocked' },
	[TILE.TREE]:        { spr: 'tree',      pal: 'tree'      },
	[TILE.MOUNTAIN]:    { spr: 'mountain',  pal: 'mountain'  },
	[TILE.BUSH]:        { spr: 'bush',      pal: 'bush'      },
	[TILE.FENCE]:       { spr: 'fence',     pal: 'fence'     },
	[TILE.HOUSE_WALL]:  { spr: 'houseWall', pal: 'houseWall' },
	[TILE.HOUSE_DOOR]:  { spr: 'houseDoor', pal: 'houseDoor' },
	[TILE.HOUSE_ROOF]:  { spr: 'houseRoof', pal: 'houseRoof' },
	[TILE.SIGN]:        { spr: 'sign',      pal: 'sign'      },
	[TILE.GRASS]:       { spr: 'grass',     pal: 'grass'     },
	[TILE.SAND]:        { spr: 'sand',      pal: 'sand'      },
	[TILE.STONE_FLOOR]: { spr: 'stoneFloor',pal: 'stoneFloor'},
	[TILE.BRIDGE]:      { spr: 'bridge',    pal: 'bridge'    },
};

export function drawSpriteAt(ctx, spriteName, palName, dx, dy, dw, dh) {
	const frames = SPRITES[spriteName];
	if (!frames) return false;
	const palette = PAL[palName] ?? PAL.hero;
	const fi   = animFrame % frames.length;
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
	{ label: '地形（背景）', tiles: [TILE.FLOOR, TILE.GRASS, TILE.SAND, TILE.STONE_FLOOR, TILE.BRIDGE] },
	{ label: '障害物・建物', tiles: [TILE.WALL, TILE.WATER, TILE.BREAKABLE_WALL, TILE.TREE, TILE.MOUNTAIN, TILE.BUSH, TILE.FENCE, TILE.HOUSE_WALL, TILE.HOUSE_DOOR, TILE.HOUSE_ROOF, TILE.SIGN] },
	{ label: 'プレイヤー', tiles: [TILE.PLAYER] },
	{ label: '敵',    tiles: [TILE.PATROL, TILE.CHASER, TILE.SENTRY, TILE.BOSS, TILE.MONSTER, TILE.DARK_LORD] },
	{ label: 'NPC',   tiles: [TILE.PRINCESS, TILE.NPC_A, TILE.NPC_B, TILE.NPC_SHOP] },
	{ label: 'ギミック', tiles: [TILE.GATE, TILE.SWITCH, TILE.DOOR, TILE.KEY, TILE.CHEST, TILE.STONE, TILE.MAP_ENTER] },
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

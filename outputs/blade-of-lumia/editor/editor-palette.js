// ── editor-palette.js ── タイルパレット・スプライト描画 ────────
import { TILE, TILE_META } from '../shared/tiles.js';
import { SPRITES, PAL, animFrame, drawSpriteLayers } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { connectTileIconSprites } from '../shared/tile-connect.js';
import { pitParts, wallParts } from '../shared/cell-appearance.js';

// 穴のボタンの絵＝草地に1マスだけ開いた穴（盤面と同じ pitParts の部品）。
// 実際の肌は置いた場所の下地で決まる＝ボタンは代表の1つ。
const PIT_ICON_STAGE = { tiles: [['.', '.', '.'], ['.', TILE.PIT, '.'], ['.', '.', '.']], bgTiles: { '1,1': TILE.GRASS } };
// 壁のボタンの絵＝床の中に1マスだけ立つ壁（盤面と同じ wallParts の部品＝天端＋前面＋縁）。
const WALL_ICON_STAGE = { tiles: [['.', '.', '.'], ['.', TILE.WALL, '.'], ['.', '.', '.']] };
const tileIconSprites = (tileChar) => connectTileIconSprites(tileChar)
	?? (tileChar === TILE.PIT ? pitParts(PIT_ICON_STAGE, 1, 1)
		: tileChar === TILE.WALL ? wallParts(WALL_ICON_STAGE, 1, 1) : null);
import { state, tilePaletteEl } from './editor-state.js';

// タイル → スプライト対応は shared/tile-sprites.js（単一の真実）を再エクスポート。
// エディタとゲーム（render-board.js）が同じ表を見ることで見た目を一致させる。
export { TILE_SPRITE_MAP };

// エディタでは「状態で 2 フレームを切り替える」スプライト（ボタン押下・レバー
// ON/OFF）は frame0（OFF/浮き）で固定表示する。アニメ扱いだと配置物が
// 勝手に押された/ON 状態にチラついて紛らわしいため。
const STATIC_FRAME0 = new Set(['button', 'lever']);

// flipX＝左右反転して描く（横に連なった扉の右半分など。ゲーム側の makeSprite と同じ引数）
export function drawSpriteAt(ctx, spriteName, palName, dx, dy, dw, dh, flipX = false) {
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
	if (flipX) {
		ctx.save();
		ctx.translate(dx + dw, dy);
		ctx.scale(-1, 1);
		ctx.drawImage(tmp, 0, 0, dw, dh);
		ctx.restore();
	} else {
		ctx.drawImage(tmp, dx, dy, dw, dh);
	}
	return true;
}

// カテゴリ分け
const PALETTE_CATEGORIES = [
	{ label: '地形（背景）', tiles: [TILE.FLOOR, TILE.GRASS, TILE.SAND, TILE.STONE_FLOOR, TILE.BRIDGE, TILE.SNOW, TILE.ASH, TILE.MUD, TILE.ISLAND_CORNER_NW, TILE.ISLAND_CORNER_NE, TILE.ISLAND_CORNER_SW, TILE.ISLAND_CORNER_SE] },
	// 10c-2：手すりを手で決める橋（'v' は自動導出・こちらは板の向きと手すりの辺を固定）
	{ label: '橋（手すり指定）', tiles: [
		TILE.BRIDGE_V_BOTH, TILE.BRIDGE_V_W, TILE.BRIDGE_V_E, TILE.BRIDGE_V_NONE,
		TILE.BRIDGE_H_BOTH, TILE.BRIDGE_H_N, TILE.BRIDGE_H_S, TILE.BRIDGE_H_NONE,
	] },
	// キュー22：穴（PIT）＝はしごで1マス渡れる。下地はそのまま残る＝肌（草・砂・雪・床…）は下地から決まる
	{ label: '障害物・建物', tiles: [TILE.WALL, TILE.WATER, TILE.LAVA, TILE.PIT, TILE.BREAKABLE_WALL, TILE.TREE, TILE.MOUNTAIN, TILE.BUSH, TILE.FENCE, TILE.HOUSE_WALL, TILE.HOUSE_DOOR, TILE.HOUSE_ROOF, TILE.SIGN] },
	{ label: 'プレイヤー', tiles: [TILE.PLAYER] },
	// ⚠️ 新しい敵タイルを shared/tiles.js に足したらここにも足す（ここに無い敵は
	// エディタで配置できない＝SKELETON と SEA_LORD が実際に漏れていた・5.5k で追加）。
	{ label: '敵',    tiles: [
		TILE.PATROL, TILE.CHASER, TILE.SENTRY, TILE.SKELETON, TILE.SWORD_BEAST,
		TILE.BURROW_WORM, TILE.LEAP_SPIDER, TILE.BAT_SWARM,
		TILE.SHIELD_KNIGHT, TILE.FIRE_TURTLE,
		TILE.SPLIT_SLIME, TILE.RUPEE_EATER,
		TILE.BOMB_OGRE, TILE.BOOMERANG_OGRE,
		TILE.CURSE_FIRE, TILE.POISON_LEECH,
		TILE.SORCERER, TILE.CHARGE_BOAR,
		TILE.BOSS, TILE.MONSTER, TILE.DARK_LORD,
		TILE.FISH_SCHOOL, TILE.LURK_SHARK, TILE.ARCHER_FISH, TILE.SEA_LORD,
	] },
	{ label: 'NPC',   tiles: [TILE.PRINCESS, TILE.NPC_A, TILE.NPC_B, TILE.NPC_SHOP] },
	{ label: 'ギミック', tiles: [
		TILE.GATE, TILE.TIDE_GATE, TILE.BUTTON, TILE.SWITCH, TILE.TORCH, TILE.DOOR, TILE.KEY,
		TILE.CHEST, TILE.STONE, TILE.MAP_ENTER, TILE.ALTAR,
		TILE.SWITCH_RED, TILE.SWITCH_BLUE, TILE.GATE_RED, TILE.GATE_BLUE,
	] },
	{ label: 'ドアウェイ', tiles: [TILE.DOORWAY, TILE.DOORWAY_BOSS, TILE.DOORWAY_LOCKED] },
	{ label: 'アイテム', tiles: [
		TILE.ITEM_SWORD, TILE.ITEM_SHIELD, TILE.ITEM_ARMOR,
		TILE.ITEM_BOOMERANG, TILE.ITEM_BOMB, TILE.ITEM_ARROWS,
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

			// 連結タイルのうち「文字で固定の意図を持つ」もの（手すりを名指しした橋）は
			// 本体＋手すりを重ねた絵をボタンに描く＝パレットで8種を見分けられる。
			const icon = tileIconSprites(tileChar);
			const si = TILE_SPRITE_MAP[tileChar];
			if (icon) {
				const cv = document.createElement('canvas');
				cv.width = 28; cv.height = 28;
				cv.style.imageRendering = 'pixelated';
				cv.style.display = 'block';
				const tmp = document.createElement('canvas');
				if (drawSpriteLayers(tmp, icon.sprs, PAL[icon.pal] ?? PAL.hero)) {
					const ctx = cv.getContext('2d');
					ctx.imageSmoothingEnabled = false;
					ctx.drawImage(tmp, 0, 0, 28, 28);
				}
				btn.appendChild(cv);
			} else if (si && SPRITES[si.spr]) {
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

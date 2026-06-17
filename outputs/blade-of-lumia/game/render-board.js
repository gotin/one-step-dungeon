// ── render-board.js ──────────────────────────────────────────
// Phase 0-2 Step 3: タイルグリッド描画を game.js から切り出し
//
// export: createRenderBoard(deps) → { renderBoard, setCellClass, addCellSprite }
//
// deps は以下の getter と参照を注入する（全て game.js スコープの可変状態）：
//   getStageData()    → stageData
//   getCurrentLayer() → currentLayer
//   getStageKey()     → stageKey
//   getSS(lk, sk)     → ステージ状態オブジェクト
//   getBoardEl()      → boardEl（DOM）
//   getStageLabelEl() → stageLabelEl（DOM）
//   getCharLayerElRef() → { value } ラッパー（charLayerEl への書き込み）
//   getDoorwayState(posKey) → ドアウェイ開閉状態
//
// shared モジュール（TILE / SPRITES / PAL / NPC_SPRITE_MAP / drawSpriteFrame / makeSprite）
// は直接 import する（game.js スコープ外・再代入なし）。

import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL, drawSpriteFrame, makeSprite } from '../shared/sprites.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';

// bgTile の背景色クラスマップ（renderBoard 内でのみ使う定数）
const BG_TILE_COLOR_CLASS = {
	[TILE.FLOOR]:       '',
	[TILE.GRASS]:       'bg-grass',
	[TILE.SAND]:        'bg-sand',
	[TILE.STONE_FLOOR]: 'bg-stonefloor',
	[TILE.BRIDGE]:      'bg-bridge',
};

/**
 * タイルグリッド描画関数群を生成して返す factory。
 * @param {object} deps
 * @param {()=>object} deps.getStageData
 * @param {()=>string} deps.getCurrentLayer
 * @param {()=>string} deps.getStageKey
 * @param {(lk:string,sk:string)=>object} deps.getSS
 * @param {()=>HTMLElement} deps.getBoardEl
 * @param {()=>HTMLElement} deps.getStageLabelEl
 * @param {{value:HTMLElement|null}} deps.charLayerElRef  ← 書き込み可能な参照ラッパー
 * @param {(posKey:string)=>string} deps.getDoorwayState
 */
export function createRenderBoard(deps) {
	const {
		getStageData,
		getCurrentLayer,
		getStageKey,
		getSS,
		getBoardEl,
		getStageLabelEl,
		charLayerElRef,
		getDoorwayState,
	} = deps;

	// bgTile 背景クラスを cellEl に適用するヘルパー（内部用）
	function applyBgTileClass(cellEl, posKey) {
		const stageData = getStageData();
		const bgTile = stageData.bgTiles?.[posKey] ?? TILE.FLOOR;
		const cls = BG_TILE_COLOR_CLASS[bgTile];
		if (cls) cellEl.classList.add(cls);
	}

	function setCellClass(cellEl, tile, posKey, ss) {
		const stageData = getStageData();
		switch (tile) {
			case TILE.WALL:           cellEl.classList.add('wall'); return;
			case TILE.WATER:          cellEl.classList.add('water'); return;
			case TILE.GATE:
				cellEl.classList.add(ss.openGates.has(posKey) ? 'switch-on' : 'gate');
				applyBgTileClass(cellEl, posKey); return;
			case TILE.DOOR:
				cellEl.classList.add('door');
				applyBgTileClass(cellEl, posKey); return;
			case TILE.SWITCH:
				cellEl.classList.add(ss.switchStates[posKey] ? 'switch-on' : 'switch-off');
				applyBgTileClass(cellEl, posKey); return;
			case TILE.BREAKABLE_WALL:
				cellEl.classList.add(ss.brokenWalls.has(posKey) ? 'floor' : 'breakable-wall');
				applyBgTileClass(cellEl, posKey); return;
			case TILE.MAP_ENTER:
				cellEl.classList.add('map-enter');
				applyBgTileClass(cellEl, posKey); return;
			case TILE.SKY:
				cellEl.classList.add('sky'); return;
			case TILE.PIT:
				cellEl.classList.add('pit'); return;
			case TILE.DOORWAY:
				cellEl.classList.add('doorway');
				applyBgTileClass(cellEl, posKey); return;
			case TILE.DOORWAY_BOSS: {
				const dwState = getDoorwayState(posKey);
				cellEl.classList.add(dwState === 'boss_closed' ? 'doorway-boss-closed' : 'doorway-boss');
				applyBgTileClass(cellEl, posKey); return;
			}
			case TILE.DOORWAY_LOCKED: {
				const dwState2 = getDoorwayState(posKey);
				cellEl.classList.add(dwState2 === 'open' ? 'doorway-locked-open' : 'doorway-locked');
				applyBgTileClass(cellEl, posKey); return;
			}
		}
		applyBgTileClass(cellEl, posKey);
	}

	function addCellSprite(cellEl, tile, posKey, ss) {
		const stageData    = getStageData();
		const currentLayer = getCurrentLayer();
		const stageKey     = getStageKey();

		if (tile === TILE.WALL || tile === TILE.FLOOR || tile === TILE.PLAYER) return;

		if (tile === TILE.CHEST && !ss.openedChests.has(posKey)) {
			const cond = stageData.showConditions?.[posKey];
			if (cond && !ss.conditionsMet.has(posKey)) return;
			const cv = makeSprite('chest', 'chest', true);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.KEY && !ss.pickedKeys.has(posKey)) {
			const cv = makeSprite('key', 'key', true);
			if (cv) { cv.classList.add('item-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.SWITCH) {
			const cv = makeSprite('swG', 'swG', true);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.GATE && !ss.openGates.has(posKey)) {
			const cv = makeSprite('gateG', 'gateG', false);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.DOOR) {
			const isOpen = ss.openedDoors?.has(posKey);
			const cv = makeSprite(isOpen ? 'doorOpen' : 'door', 'door', false);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.WATER) {
			const cv = makeSprite('water', 'water', true);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) {
			const cv = makeSprite('breakableWall', 'breakableWall', true);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.MAP_ENTER) {
			const cond = stageData.showConditions?.[posKey];
			if (cond && !ss.conditionsMet.has(posKey)) return;
			const cv = makeSprite('mapEnter', 'mapEnter', true);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.ALTAR) {
			// 古代の祭壇（専用スプライトは未作成のため絵文字フォールバック描画）
			const span = document.createElement('span');
			span.textContent = '⛩';
			span.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:calc(var(--cell)*0.8);pointer-events:none;z-index:3;';
			cellEl.appendChild(span);
			return;
		}
		if (tile === TILE.STONE) {
			const _ssSt = getSS(currentLayer, stageKey);
			if (_ssSt.stonePositions?.[posKey]) return;
			const cv = makeSprite('block', 'block', false);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.DOORWAY) {
			const cv = makeSprite('doorway', 'doorway', true);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.DOORWAY_BOSS) {
			const dwState = getDoorwayState(posKey);
			const frames = SPRITES['doorwayBoss'];
			const pal    = PAL['doorwayBoss'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite obj-sprite';
				const frameIdx = (dwState === 'boss_closed') ? 1 : 0;
				drawSpriteFrame(cv, frames, frameIdx, pal);
				cellEl.appendChild(cv);
			}
			return;
		}
		if (tile === TILE.DOORWAY_LOCKED) {
			const dwState = getDoorwayState(posKey);
			const frames = SPRITES['doorwayLocked'];
			const pal    = PAL['doorwayLocked'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite obj-sprite';
				const frameIdx = (dwState === 'open') ? 1 : 0;
				drawSpriteFrame(cv, frames, frameIdx, pal);
				cellEl.appendChild(cv);
			}
			return;
		}
		// NPC
		const npcMeta = NPC_SPRITE_MAP[tile];
		if (npcMeta) {
			const cv = makeSprite(npcMeta.sprite, npcMeta.pal, true);
			if (cv) { cv.classList.add('char-sprite'); cellEl.appendChild(cv); }
			return;
		}
		// 落ちているアイテム（スプライトのあるもの）
		const itemMap = {
			[TILE.ITEM_SWORD]:          ['sword',    'sword'],
			[TILE.ITEM_SHIELD]:         ['shield',   'shield'],
			[TILE.ITEM_BOOMERANG]:      ['boomerang','boomerang'],
			[TILE.ITEM_RUPEE]:          ['rupee',    'rupee'],
			[TILE.ITEM_RUPEE_LARGE]:    ['rupee',    'rupeeBlue'],
			[TILE.ITEM_TRIFORCE_PIECE]: ['triforce', 'triforce'],
		};
		if (itemMap[tile] && !ss.pickedKeys.has(posKey)) {
			const itemCond = stageData.showConditions?.[posKey];
			if (itemCond && !ss.conditionsMet.has(posKey)) return;
			const [spr, pal] = itemMap[tile];
			const cv = makeSprite(spr, pal, false);
			if (cv) { cv.classList.add('item-sprite'); cellEl.appendChild(cv); }
			return;
		}
		// フィールドタイルのスプライト描画
		const fieldSpriteMap = {
			[TILE.GRASS]:       ['grass',      'grass'],
			[TILE.SAND]:        ['sand',       'sand'],
			[TILE.STONE_FLOOR]: ['stoneFloor', 'stoneFloor'],
			[TILE.BRIDGE]:      ['bridge',     'bridge'],
			[TILE.TREE]:        ['tree',       'tree'],
			[TILE.MOUNTAIN]:    ['mountain',   'mountain'],
			[TILE.FENCE]:       ['fence',      'fence'],
			[TILE.HOUSE_WALL]:  ['houseWall',  'houseWall'],
			[TILE.HOUSE_DOOR]:  ['houseDoor',  'houseDoor'],
			[TILE.HOUSE_ROOF]:  ['houseRoof',  'houseRoof'],
			[TILE.SIGN]:        ['sign',       'sign'],
		};
		if (fieldSpriteMap[tile]) {
			const [spr, pal] = fieldSpriteMap[tile];
			if (SPRITES[spr]) {
				const cv = makeSprite(spr, pal, tile === TILE.GRASS || tile === TILE.TREE || tile === TILE.BUSH);
				if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			}
			return;
		}
		// 茂み
		if (tile === TILE.BUSH) {
			if (!ss.cutBushes?.has(posKey)) {
				const cv = makeSprite('bush', 'bush', true);
				if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			}
			return;
		}
		// スプライト未定義のアイテムは絵文字フォールバック
		const emojiItemMap = {
			[TILE.ITEM_ARMOR]:          '⚚',
			[TILE.ITEM_BOMB]:           '💣',
			[TILE.ITEM_BOW]:            '🏹',
			[TILE.ITEM_HEAL_POTION]:    '🧪',
			[TILE.ITEM_BIG_HEAL_POTION]:'💊',
			[TILE.ITEM_HEART_CONTAINER]:'❤',
			[TILE.ITEM_TRIFORCE_PIECE]: '◭',
			[TILE.ITEM_DUNGEON_MAP]:    '🗺',
			[TILE.ITEM_COMPASS]:        '🧭',
		};
		if (emojiItemMap[tile] && !ss.pickedKeys.has(posKey)) {
			const span = document.createElement('span');
			span.textContent = emojiItemMap[tile];
			span.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:calc(var(--cell)*0.55);pointer-events:none;z-index:3;';
			cellEl.appendChild(span);
		}
	}

	function renderBoard() {
		const stageData    = getStageData();
		const currentLayer = getCurrentLayer();
		const stageKey     = getStageKey();
		const boardEl      = getBoardEl();
		const stageLabelEl = getStageLabelEl();
		if (!stageData) return;

		const { cols, rows, tiles } = stageData;
		const ss = getSS(currentLayer, stageKey);

		boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
		boardEl.style.gridTemplateRows    = `repeat(${rows}, var(--cell))`;
		boardEl.innerHTML = '';

		// char-layer を作成（キャラクター絶対配置コンテナ）
		const newCharLayerEl = document.createElement('div');
		newCharLayerEl.id = 'char-layer';
		boardEl.style.position = 'relative';
		// 参照ラッパーを更新（render-chars.js 側も最新値を読める）
		charLayerElRef.value = newCharLayerEl;

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const tile   = tiles[r][c];
				const posKey = `${r},${c}`;
				const cellEl = document.createElement('div');
				cellEl.className    = 'cell';
				cellEl.dataset.row  = r;
				cellEl.dataset.col  = c;

				setCellClass(cellEl, tile, posKey, ss);
				addCellSprite(cellEl, tile, posKey, ss);
				boardEl.appendChild(cellEl);
			}
		}

		// char-layer を board の上に重ねる
		boardEl.appendChild(newCharLayerEl);
		stageLabelEl.textContent = `[${currentLayer}] ${stageKey}`;
	}

	return { renderBoard, setCellClass, addCellSprite };
}

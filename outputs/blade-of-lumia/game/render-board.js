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
import { SPRITES, PAL, drawSpriteFrame, makeSprite, applyBgSpriteToCell } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';

// bgTile の背景色クラスマップ（renderBoard 内でのみ使う定数）
const BG_TILE_COLOR_CLASS = {
	[TILE.FLOOR]:       '',
	[TILE.GRASS]:       'bg-grass',
	[TILE.SAND]:        'bg-sand',
	[TILE.STONE_FLOOR]: 'bg-stonefloor',
	[TILE.BRIDGE]:      'bg-bridge',
	[TILE.SNOW]:        'bg-snow',
	[TILE.ASH]:         'bg-ash',
	[TILE.MUD]:         'bg-mud',
};

// 末尾の共通スプライト fallback で「静的に描いてよい落ちアイテム」タイルの集合。
// 敵・プレイヤー・NPC は実体として render-chars が描くので含めない（重複描画防止）。
// 専用分岐を持つアイテム（剣/盾/ブーメラン/鍵/ルピー/星の欠片）も含めない。
const ITEM_FALLBACK_TILES = new Set([
	TILE.ITEM_ARMOR, TILE.ITEM_BOMB, TILE.ITEM_BOW,
	TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION,
	TILE.ITEM_HEART_CONTAINER, TILE.ITEM_DUNGEON_MAP, TILE.ITEM_COMPASS,
]);

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

	// bgTile 背景クラス＋スプライトを cellEl に適用するヘルパー（内部用）
	function applyBgTileClass(cellEl, posKey) {
		const stageData = getStageData();
		const bgTile = stageData.bgTiles?.[posKey] ?? TILE.FLOOR;
		const cls = BG_TILE_COLOR_CLASS[bgTile];
		if (cls) cellEl.classList.add(cls);
		// bgTile のスプライトを CSS background-image repeat で背景に敷く
		if (bgTile !== TILE.FLOOR) {
			const si = TILE_SPRITE_MAP[bgTile];
			if (si && SPRITES[si.spr]) {
				applyBgSpriteToCell(cellEl, si.spr, si.pal);
			}
		}
	}

	function setCellClass(cellEl, tile, posKey, ss) {
		const stageData = getStageData();
		switch (tile) {
			case TILE.WALL:           cellEl.classList.add('wall'); return;
			case TILE.WATER:          cellEl.classList.add('water'); return;
			case TILE.LAVA:           cellEl.classList.add('lava'); return;
			case TILE.GATE:
				// 開いたゲートは床と同じ背景に（bgTile に任せる）。閉じている時だけ gate 色。
				// ※ 以前は開時に switch-on を付けていたが、これはスイッチ ON の緑色で
				//    「ゲート跡が草地っぽく緑になる」誤表示の原因だった。
				if (!ss.openGates.has(posKey)) cellEl.classList.add('gate');
				applyBgTileClass(cellEl, posKey); return;
			case TILE.DOOR:
				cellEl.classList.add('door');
				applyBgTileClass(cellEl, posKey); return;
			case TILE.SWITCH_RED:
			case TILE.SWITCH_BLUE:
			case TILE.GATE_RED:
			case TILE.GATE_BLUE:
				// Phase 5-1: 色ゲート・色スイッチの背景は床に任せる
				applyBgTileClass(cellEl, posKey); return;
			case TILE.BUTTON:
			case TILE.SWITCH:
				// 背景は床（bgTile）に任せる。ON/OFF・押下の見た目はスプライト側の
				// クラス（button-pressed / switch-toggle-on）で表現する。
				// ※ 以前はセルに switch-on/off（緑）を付けていたが、これが床を緑に
				//    上書きし「床のはずが草地に見える」＋エディタとの不一致の原因だった。
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

		if (tile === TILE.CHEST) {
			// 未開封のときだけ宝箱を描く（開封済みは床）。必ず return すること
			// ＝末尾の共通 fallback が chest を再描画して「開けても宝箱が残る」のを防ぐ。
			if (!ss.openedChests.has(posKey)) {
				const cond = stageData.showConditions?.[posKey];
				if (cond && !ss.conditionsMet.has(posKey)) return;
				const cv = makeSprite('chest', 'chest', true);
				if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			}
			return;
		}
		if (tile === TILE.KEY && !ss.pickedKeys.has(posKey)) {
			const cv = makeSprite('key', 'key', true);
			if (cv) { cv.classList.add('item-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.BUTTON) {
			// ボタン：丸い床ボタン。frame0=浮いている／frame1=押し込まれ＋発光。
			// プレイヤー/石が乗って ON（switchStates）の間だけ押された見た目にする。
			const frames = SPRITES['button'];
			const pal    = PAL['button'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite obj-sprite';
				drawSpriteFrame(cv, frames, ss.switchStates[posKey] ? 1 : 0, pal);
				cellEl.appendChild(cv);
			}
			return;
		}
		if (tile === TILE.SWITCH) {
			// スイッチ：レバー。frame0=OFF（左倒し）／frame1=ON（右倒し＋発光）。
			// 武器の攻撃でトグルする（switchToggles）。
			const frames = SPRITES['lever'];
			const pal    = PAL['lever'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite obj-sprite';
				drawSpriteFrame(cv, frames, ss.switchToggles?.has(posKey) ? 1 : 0, pal);
				cellEl.appendChild(cv);
			}
			return;
		}
		if (tile === TILE.GATE) {
			// 閉じている時だけ柵スプライトを描く。開いている時は何も描かない（床）。
			// ※ return を忘れると末尾の共通スプライト fallback が gateG を再描画して
			//    「開いてもゲートが見えたまま」になる（実際に起きたバグ）。
			if (!ss.openGates.has(posKey)) {
				const cv = makeSprite('gateG', 'gateG', false);
				if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			}
			return;
		}
		// Phase 5-1: 色ゲート（赤/青）
		// activeColor が自色と一致 → 開いている（床として描かない）。不一致 → 閉じた格子を描く。
		if (tile === TILE.GATE_RED || tile === TILE.GATE_BLUE) {
			const color = tile === TILE.GATE_RED ? 'red' : 'blue';
			if (ss.activeColor !== color) {
				const sprName = tile === TILE.GATE_RED ? 'gateRed' : 'gateBlu';
				const palName = tile === TILE.GATE_RED ? 'gateRed' : 'gateBlu';
				const cv = makeSprite(sprName, palName, false);
				if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			}
			return;
		}
		// Phase 5-1: 色スイッチ（赤/青）
		// frame0=非アクティブ（自色でない）／frame1=アクティブ（自色が選ばれている）
		if (tile === TILE.SWITCH_RED || tile === TILE.SWITCH_BLUE) {
			const color    = tile === TILE.SWITCH_RED ? 'red' : 'blue';
			const sprName  = tile === TILE.SWITCH_RED ? 'switchRed' : 'switchBlu';
			const palName  = tile === TILE.SWITCH_RED ? 'switchRed' : 'switchBlu';
			const frames   = SPRITES[sprName];
			const pal      = PAL[palName];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite obj-sprite';
				drawSpriteFrame(cv, frames, ss.activeColor === color ? 1 : 0, pal);
				cellEl.appendChild(cv);
			}
			return;
		}
		if (tile === TILE.DOOR) {
			const isOpen = ss.openedDoors?.has(posKey);
			// 横に連なった扉は「1枚の大きな門」に見せる：左セルは doorL、右セルは
			// それを左右反転して描く（外枠が両端だけ・中央は合わせ目で繋がる）。
			// 単独の扉は従来の door スプライト。縦連結は今は単独扱い（横並びのみ対応）。
			const [r, c] = posKey.split(',').map(Number);
			const leftIsDoor  = stageData.tiles[r]?.[c - 1] === TILE.DOOR;
			const rightIsDoor = stageData.tiles[r]?.[c + 1] === TILE.DOOR;
			let sprName = isOpen ? 'doorOpen' : 'door';
			let flipX = false;
			if (rightIsDoor && !leftIsDoor) {            // 連結の左端 → 左半分
				sprName = isOpen ? 'doorLopen' : 'doorL';
			} else if (leftIsDoor && !rightIsDoor) {     // 連結の右端 → 左半分を反転
				sprName = isOpen ? 'doorLopen' : 'doorL';
				flipX = true;
			} else if (leftIsDoor && rightIsDoor) {       // 3枚以上の中間 → 縁なしの中身
				sprName = isOpen ? 'doorLopen' : 'doorL';  // 中間も左半分流用（枠は両端のみ見える）
			}
			const cv = makeSprite(sprName, 'door', false, flipX);
			if (cv) { cv.classList.add('door-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.WATER) {
			const cv = makeSprite('water', 'water', true);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.LAVA) {
			const cv = makeSprite('water', 'lava', true);   // water 形状＋lava 赤橙パレット
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.BREAKABLE_WALL) {
			// 未破壊のときだけ壁を描く（破壊後は床）。必ず return すること。
			if (!ss.brokenWalls.has(posKey)) {
				const cv = makeSprite('breakableWall', 'breakableWall', true);
				if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			}
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
			const cv = makeSprite('altar', 'altar', false);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.TORCH) {
			// frame0=消灯（暗い台座）／frame1=点灯（燃える炎）
			const frames = SPRITES['torch'];
			const pal    = PAL['torch'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite obj-sprite';
				drawSpriteFrame(cv, frames, ss.litTorches?.has(posKey) ? 1 : 0, pal);
				cellEl.appendChild(cv);
			}
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
			[TILE.SNOW]:        ['grass',      'snow'],
			[TILE.ASH]:         ['sand',       'ash'],
			[TILE.MUD]:         ['grass',      'mud'],
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
				const ANIMATED_FIELD = new Set([TILE.GRASS, TILE.SAND, TILE.SNOW, TILE.ASH, TILE.MUD, TILE.TREE, TILE.BUSH]);
				const cv = makeSprite(spr, pal, ANIMATED_FIELD.has(tile));
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
		// 残りの「落ちているアイテム」だけを共通表 TILE_SPRITE_MAP から描く
		// （よろい・爆弾・弓矢・回復薬・地図・コンパス・ハートの器）。
		// ※ 敵（W/E/C/F/ボス）・プレイヤー・NPC も共通表に載っているが、それらは
		//   buildEnemies→render-chars.js が動く実体として描くので、ここで静的描画しては
		//   いけない（盤面に動かない複製が出る不具合になる）。アイテムタイルに限定する。
		if (ITEM_FALLBACK_TILES.has(tile) && !ss.pickedKeys.has(posKey)) {
			const si = TILE_SPRITE_MAP[tile];
			if (si && SPRITES[si.spr]) {
				const itemCond = stageData.showConditions?.[posKey];
				if (itemCond && !ss.conditionsMet.has(posKey)) return;
				const cv = makeSprite(si.spr, si.pal, false);
				if (cv) { cv.classList.add('item-sprite'); cellEl.appendChild(cv); }
			}
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

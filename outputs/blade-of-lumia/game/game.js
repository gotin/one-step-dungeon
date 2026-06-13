// ── Blade of Lumia – game.js ──────────────────────────────────
// Phase 1: マップ読み込み・プレイヤー移動（半セル）・ステージ遷移
import { TILE, BG_TILES } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_NORMAL } from '../shared/enemies.js';
import { ITEM_META, EQUIP_META } from '../shared/items.js';
import { NPC_SPRITE_MAP, NPC_DEFAULT_DIALOG } from '../shared/npcs.js';
import {
	SPRITES, PAL, drawSpriteFrame,
	makeSprite, startAnimLoop, redrawAnimSprites,
} from '../shared/sprites.js';
import {
	playSound, playBgm, stopBgm, resumeAudio,
} from '../shared/sounds.js';

// ── 定数 ──────────────────────────────────────────────────────
// 座標系：x/y はセル単位の float（0.5 刻みで移動）
// 例: x=1.5 → タイル列 1 の右端 / タイル列 2 の左端の中間
const MOVE_STEP      = 0.5;   // 1 操作 = 0.5 セル
const TICK_MS        = 120;   // 敵行動 tick 間隔（ms）
const INVINCIBLE_MS  = 1500;  // 無敵時間（ms）
const HP_PER_HEART   = 2;
const MAP_JSON_URL   = '../work/blade-of-lumia.json';
const SAVE_KEY       = 'blade-of-lumia-save';

// 移動方向 → (dy, dx) セル単位
const DIR_DELTA = {
	up:    [-MOVE_STEP, 0],
	down:  [ MOVE_STEP, 0],
	left:  [0, -MOVE_STEP],
	right: [0,  MOVE_STEP],
};

// ── DOM ───────────────────────────────────────────────────────
const boardEl          = document.getElementById('board');
const heartsEl         = document.getElementById('hud-hearts');
const stageLabelEl     = document.getElementById('hud-stage-label');
const equipSwordEl     = document.getElementById('hud-equip-sword');
const equipShieldEl    = document.getElementById('hud-equip-shield');
const equipArmorEl     = document.getElementById('hud-equip-armor');
const subIconEl        = document.getElementById('hud-sub-icon');
const subCountEl       = document.getElementById('hud-sub-count');
const msgBarEl         = document.getElementById('msg-bar');
const dialogOverlayEl  = document.getElementById('dialog-overlay');
const dialogNameEl     = document.getElementById('dialog-name');
const dialogTextEl     = document.getElementById('dialog-text');
const pauseOverlayEl   = document.getElementById('pause-overlay');
const pauseItemsEl     = document.getElementById('pause-items');
const pauseStatsEl     = document.getElementById('pause-stats');
const gameoverOverlayEl= document.getElementById('gameover-overlay');
const gameoverRetryEl  = document.getElementById('gameover-retry');
// ボス・エンディング・ダンジョン HUD
const bossHpbarEl      = document.getElementById('boss-hpbar');
const bossNameEl       = document.getElementById('boss-name');
const bossHpFillEl     = document.getElementById('boss-hp-fill');
const endingOverlayEl  = document.getElementById('ending-overlay');
const endingRestartEl  = document.getElementById('ending-restart');
const dungeonInfoEl    = document.getElementById('hud-dungeon-info');
const dungeonNameEl    = document.getElementById('hud-dungeon-name');
const dungeonItemsEl   = document.getElementById('hud-dungeon-items');
const pauseDungeonMapEl= document.getElementById('pause-dungeon-map');
const pauseMapCanvasEl = document.getElementById('pause-map-canvas');
const pauseMapHintEl   = document.getElementById('pause-map-hint');

// ── 状態 ──────────────────────────────────────────────────────
let mapData      = null;
let currentLayer = 'field';
let stageKey     = null;
let stageData    = null;
let stageState   = {};
let exitRegistry = {};

// プレイヤー：x/y はセル単位 float
let player = {
	x: 1, y: 1,          // float 座標（セル）
	hp: 6, maxHp: 6, maxHearts: 3,
	atk: 2, def: 0, keys: 0,
	weapon: null, shield: null, armor: null,
	subItems: {}, activeSubItem: null,
	rupees: 0, triforceCount: 0,
};

let enemies = [];
let heroDir = 'down';

let gameTimer       = null;
let isPaused        = false;
let isDialog        = false;
let isGameover      = false;
let isTransitioning = false;
let invincibleUntil = 0;
// MAP_ENTER 遷移直後クールダウン：遷移先に着いた直後は同じ入り口に乗っても再遷移しない
let mapEnterCooldownUntil = 0;
let blinkTimer      = null;
let dialogLines     = [];
let dialogLineIdx   = 0;
let pauseItemKeys   = [];
let pauseItemIdx    = 0;
let msgTimer        = null;
let isShielding     = false;

// ── デバッグモード ────────────────────────────────────────────
// Gキーで切り替え。無敵 + 敵すり抜け + 全アイテム即取得可能
let debugMode = false;

// ── トライフォース待機位置（魔王撃破後に出現したカケラの位置） ──
// null = 出現していない。{ x, y } = 拾い待ち
let pendingTriforcePos = null;

// char-layer DOM 要素（キャラクター絶対配置コンテナ）
let charLayerEl = null;

// ── ユーティリティ ────────────────────────────────────────────
// float 座標 → タイル整数座標
function toTileRow(y) { return Math.floor(y + 0.5); }
function toTileCol(x) { return Math.floor(x + 0.5); }

// CSS セルサイズを取得（--cell 変数）
function getCellPx() {
	return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;
}

// セルサイズを整数px に計算して --cell を更新する（格子線防止）
// transform: scale() を使わず --cell を直接変更することでサブピクセルを完全排除
function updateBoardScale() {
	if (!stageData) return;
	const BASE_CELL = 48;
	const maxScaleX = window.innerWidth  / (stageData.cols * BASE_CELL);
	const maxScaleY = window.innerHeight / (stageData.rows * BASE_CELL);
	const rawScale = Math.min(maxScaleX, maxScaleY);
	// セルサイズを整数にすることでサブピクセル格子線を完全排除
	const newCell = Math.max(8, Math.floor(rawScale * BASE_CELL));
	document.documentElement.style.setProperty('--cell', `${newCell}px`);
	boardEl.style.transform = ''; // scaleは不使用
}

// ── セーブ・ロード ────────────────────────────────────────────
function getSS(lk, sk) {
	const k = `${lk}_${sk}`;
	if (!stageState[k]) {
		stageState[k] = {
			openGates:       new Set(),
			pickedKeys:      new Set(),
			defeatedEnemies: new Set(),
			openedChests:    new Set(),
			objects:         {},
			switchStates:    {},
			brokenWalls:     new Set(),
			conditionsMet:   new Set(),
			openedDoors:     new Set(),  // 鍵で開いたドア
			stonePositions:  {},         // { 'r,c': {r, c} } 石の移動後位置
		};
	}
	return stageState[k];
}

function saveGame() {
	try {
		const ss = {};
		for (const [k, v] of Object.entries(stageState)) {
			ss[k] = {
				openGates:       [...v.openGates],
				pickedKeys:      [...v.pickedKeys],
				defeatedEnemies: [...v.defeatedEnemies],
				openedChests:    [...v.openedChests],
				objects:         v.objects,
				switchStates:    v.switchStates,
				brokenWalls:     [...v.brokenWalls],
				conditionsMet:   [...v.conditionsMet],
				doorwayStates:   v.doorwayStates ?? {},  // Phase 6.5
				cutBushes:       [...(v.cutBushes ?? [])], // Phase 8.2
				openedDoors:     [...(v.openedDoors ?? [])], // 鍵で開いたドア
				stonePositions:  v.stonePositions ?? {},      // 石の移動後位置
			};
		}
		localStorage.setItem(SAVE_KEY, JSON.stringify({
			player, stageState: ss, currentLayer, stageKey, heroDir,
		}));
	} catch (e) { console.warn('saveGame failed:', e); }
}

function loadGame() {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (!raw) return false;
		const data = JSON.parse(raw);
		player       = { ...player, ...data.player };
		heroDir      = data.heroDir ?? 'down';
		currentLayer = data.currentLayer ?? 'field';
		stageKey     = data.stageKey ?? null;
		// 旧セーブデータの修正: passive アイテム（heartContainer 等）が subItems に混入していたら除去
		for (const k of Object.keys(player.subItems ?? {})) {
			if (ITEM_META[k]?.type === 'passive') {
				delete player.subItems[k];
			}
		}
		if (player.activeSubItem && ITEM_META[player.activeSubItem]?.type === 'passive') {
			player.activeSubItem = Object.keys(player.subItems)[0] ?? null;
		}
		for (const [k, v] of Object.entries(data.stageState ?? {})) {
			stageState[k] = {
				openGates:       new Set(v.openGates ?? []),
				pickedKeys:      new Set(v.pickedKeys ?? []),
				defeatedEnemies: new Set(v.defeatedEnemies ?? []),
				openedChests:    new Set(v.openedChests ?? []),
				objects:         v.objects ?? {},
				switchStates:    v.switchStates ?? {},
				brokenWalls:     new Set(v.brokenWalls ?? []),
				conditionsMet:   new Set(v.conditionsMet ?? []),
				doorwayStates:   v.doorwayStates ?? {},  // Phase 6.5
				cutBushes:       new Set(v.cutBushes ?? []), // Phase 8.2
				openedDoors:     new Set(v.openedDoors ?? []), // 鍵で開いたドア
				stonePositions:  {},         // 石の位置は常にリセット（セーブデータを引き継がない）
			};
		}
		return true;
	} catch (e) { console.warn('loadGame failed:', e); return false; }
}

// ── マップ読み込み ────────────────────────────────────────────
async function loadMapData() {
	const res = await fetch(MAP_JSON_URL);
	mapData   = await res.json();
	buildExitRegistry();
}

function buildExitRegistry() {
	exitRegistry = {};
	for (const [lk, ld] of Object.entries(mapData.layers ?? {})) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [posKey, enter] of Object.entries(sd.mapEnters ?? {})) {
				if (enter.id) {
					const [row, col] = posKey.split(',').map(Number);
					exitRegistry[enter.id] = { layer: lk, stage: sk, row, col };
				}
			}
		}
	}
}

function getStageData(lk, sk) {
	return mapData?.layers?.[lk]?.stages?.[sk] ?? null;
}

// ── ステージ開始 ──────────────────────────────────────────────
function enterStage(lk, sk, pRow, pCol) {
	// 別のステージに移動する場合、現在ステージの石を元の位置にリセット
	// （壁際に挟まって取り出せなくなった石をリセットするため）
	if (stageKey !== null && (currentLayer !== lk || stageKey !== sk)) {
		const prevSS = getSS(currentLayer, stageKey);
		if (prevSS.stonePositions && Object.keys(prevSS.stonePositions).length > 0) {
			prevSS.stonePositions = {};
			// 石がスイッチを押していた記録もリセット
			if (prevSS.stoneSwitches) prevSS.stoneSwitches = new Set();
		}
	}

	currentLayer = lk;
	stageKey     = sk;
	stageData    = getStageData(lk, sk);
	if (!stageData) { console.error(`Stage not found: ${lk}/${sk}`); return; }

	// float 座標でプレイヤーを配置（整数セル中央 = そのセルの中心）
	player.x = pCol ?? 1;
	player.y = pRow ?? 1;

	// ステージ遷移時に飛翔物・設置爆弾をリセット
	clearProjectiles();
	clearBombs();
	// ボス部屋ロックをリセット（非ボス部屋に移動したとき）
	if (!stageData.isBossRoom) bossRoomLocked = false;

	enemies = buildEnemies(stageData, lk, sk);

	renderBoard();
	updateBoardScale();
	renderChars();
	updateHud();

	const layerData = mapData.layers[lk];
	const bgm = layerData?.bgm ?? 'field';
	playBgm(bgm);
	updateDungeonHud(lk);
	if (stageData.isBossRoom) startBossBattle(lk, sk);
}

// ── レイヤー HUD 更新 ─────────────────────────────────────────
// field/dungeon の区別なく、name が設定されているレイヤーは HUD に表示する
function updateDungeonHud(lk) {
	const ld = mapData.layers[lk];
	const layerName = ld?.name ?? '';
	if (layerName) {
		dungeonInfoEl.classList.remove('hidden');
		dungeonNameEl.textContent = layerName;
		// 地図・コンパスの所持状況を表示
		const dm = player.dungeonItems?.[lk];
		let items = '';
		if (dm?.hasMap)     items += '🗺';
		if (dm?.hasCompass) items += '🧭';
		dungeonItemsEl.textContent = items;
	} else {
		dungeonInfoEl.classList.add('hidden');
	}
}

// ── 敵生成 ────────────────────────────────────────────────────
function buildEnemies(sd, lk, sk) {
	const ss = getSS(lk, sk);
	const result = [];
	sd.tiles.forEach((rowArr, r) => {
		rowArr.forEach((tile, c) => {
			if (!ENEMY_META[tile]) return;
			const posKey = `${r},${c}`;
			if (ss.defeatedEnemies.has(posKey)) return;
			const m = ENEMY_META[tile];
			result.push({
				id:    posKey,
				type:  tile,
				x:     c,     // float 座標
				y:     r,
				hp:    m.hp, maxHp: m.hp,
				atk:   m.atk, def: m.def,
				speed: m.speed ?? ENEMY_SPEED_NORMAL,
				sprite: m.sprite, pal: m.pal,
				accum:  0,
				dir:    sd.enemyDirs?.[posKey] ?? 'down',
				el:     null,   // DOM element（後で設定）
			});
		});
	});
	return result;
}

// ── ボード（タイルグリッド）レンダリング ───────────────────────
function renderBoard() {
	if (!stageData) return;
	const { cols, rows, tiles } = stageData;
	const ss = getSS(currentLayer, stageKey);

	boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
	boardEl.style.gridTemplateRows    = `repeat(${rows}, var(--cell))`;
	boardEl.innerHTML = '';

	// char-layer を作成（キャラクター絶対配置コンテナ）
	charLayerEl = document.createElement('div');
	charLayerEl.id = 'char-layer';
	// boardEl と同サイズにする（後で調整）
	boardEl.style.position = 'relative';

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
	boardEl.appendChild(charLayerEl);
	stageLabelEl.textContent = `[${currentLayer}] ${stageKey}`;
}

// bgTile の背景色を cellEl に適用するヘルパー
const BG_TILE_COLOR_CLASS = {
	[TILE.FLOOR]:       '',           // デフォルト（CSS変数そのまま）
	[TILE.GRASS]:       'bg-grass',
	[TILE.SAND]:        'bg-sand',
	[TILE.STONE_FLOOR]: 'bg-stonefloor',
	[TILE.BRIDGE]:      'bg-bridge',
};
function applyBgTileClass(cellEl, posKey) {
	const bgTile = stageData.bgTiles?.[posKey] ?? TILE.FLOOR;
	const cls = BG_TILE_COLOR_CLASS[bgTile];
	if (cls) cellEl.classList.add(cls);
}

function setCellClass(cellEl, tile, posKey, ss) {
	// 構造タイル（壁・水など）は bgTile を無視
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
		// ── Phase 6.5: ドアウェイ ────────────────────────────────
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
	// それ以外（FLOOR・アイテム・NPC・フィールドタイルなど）→ bgTile を背景に
	applyBgTileClass(cellEl, posKey);
}

function addCellSprite(cellEl, tile, posKey, ss) {
	if (tile === TILE.WALL || tile === TILE.FLOOR || tile === TILE.PLAYER) return;

	if (tile === TILE.CHEST && !ss.openedChests.has(posKey)) {
		// 表示条件が設定されていて未達成なら非表示
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
		// 開いているドア → doorOpen スプライト（枠のみ）
		// 閉じているドア → door スプライト（扉あり）
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
	if (tile === TILE.STONE) {
		// 元のタイル位置にある石（移動されていない場合）
		const _ssSt = getSS(currentLayer, stageKey);
		if (_ssSt.stonePositions?.[posKey]) return; // 移動済み → 元の場所には描画しない
		const cv = makeSprite('block', 'block', false);
		if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
		return;
	}
	// ── Phase 6.5: ドアウェイスプライト描画 ─────────────────────
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
	// アニメーションなし（animated=false）：床に置いてあるものは静止表示
	const itemMap = {
		[TILE.ITEM_SWORD]:          ['sword',    'sword'],
		[TILE.ITEM_SHIELD]:         ['shield',   'shield'],
		[TILE.ITEM_BOOMERANG]:      ['boomerang','boomerang'],
		[TILE.ITEM_RUPEE]:          ['rupee',    'rupee'],
		[TILE.ITEM_RUPEE_LARGE]:    ['rupee',    'rupeeBlue'],
		[TILE.ITEM_TRIFORCE_PIECE]: ['triforce', 'triforce'],
	};
	if (itemMap[tile] && !ss.pickedKeys.has(posKey)) {
		// 表示条件が設定されていて未達成なら非表示
		const itemCond = stageData.showConditions?.[posKey];
		if (itemCond && !ss.conditionsMet.has(posKey)) return;
		const [spr, pal] = itemMap[tile];
		const cv = makeSprite(spr, pal, false);  // 静止表示
		if (cv) { cv.classList.add('item-sprite'); cellEl.appendChild(cv); }
		return;
	}
	// ── Phase 8: フィールドタイルのスプライト描画 ────────────────
	// 通行可タイル（草・砂・石畳・橋）は背景色のみ（CSS color で表現）
	// 通行不可タイル（木・山・茂み・柵・建物）はスプライト表示
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
	// 茂み：切られていなければスプライト表示
	if (tile === TILE.BUSH) {
		if (!ss.cutBushes?.has(posKey)) {
			const cv = makeSprite('bush', 'bush', true);
			if (cv) { cv.classList.add('obj-sprite'); cellEl.appendChild(cv); }
		}
		return;
	}

	// スプライト未定義のアイテムは絵文字フォールバック表示
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

// ── キャラクター（プレイヤー＋敵）の絶対配置レンダリング ─────────
// 毎 tick ではなく、位置変化があった時だけ呼ぶ
function renderChars() {
	if (!charLayerEl) return;
	charLayerEl.innerHTML = '';

	// プレイヤー（上向き時は盾を先に描いてキャラを上レイヤーに重ねる）
	const playerDiv = document.createElement('div');
	playerDiv.className = 'char-abs';
	playerDiv.id        = 'char-player';
	const cellPx0 = getCellPx();
	playerDiv.style.left = `${player.x * cellPx0}px`;
	playerDiv.style.top  = `${player.y * cellPx0}px`;
	charLayerEl.appendChild(playerDiv);

	if (heroDir === 'up') addShieldOverlay(playerDiv);
	const heroSpr = getHeroSpriteName();
	const heroFlip = heroDir === 'left';
	const heroCv = makeSprite(heroSpr, getHeroPalName(), true, heroFlip);
	if (heroCv) playerDiv.appendChild(heroCv);
	if (heroDir !== 'up') addShieldOverlay(playerDiv);

	// 移動済みの石を描画（プレイヤーの後ろに配置）
	{
		const _ssRc = getSS(currentLayer, stageKey);
		const _cellPxSt = getCellPx();
		const _stSize = Math.round(_cellPxSt * 0.7) + 'px'; // obj-sprite と同じ70%サイズ
		for (const [origKey, st] of Object.entries(_ssRc.stonePositions ?? {})) {
			const stDiv = document.createElement('div');
			stDiv.className = 'char-abs';
			stDiv.id = `char-stone-${origKey.replace(',', '-')}`;
			stDiv.style.left   = `${st.c * _cellPxSt}px`;
			stDiv.style.top    = `${st.r * _cellPxSt}px`;
			stDiv.style.zIndex = '1'; // プレイヤー(z-index:2相当)より下
			// 石のキャンバスを直接描画（spriteクラスなし→CSSの位置上書きを回避）
			const stoneCv = document.createElement('canvas');
			stoneCv.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${_stSize};height:${_stSize};image-rendering:pixelated;`;
			const _stFrames = SPRITES['block'];
			const _stPal = PAL['block'];
			if (_stFrames && _stPal) {
				const _stGrid = _stFrames[0];
				stoneCv.width = _stGrid[0].length;
				stoneCv.height = _stGrid.length;
				const _stCtx = stoneCv.getContext('2d');
				for (let _r = 0; _r < _stGrid.length; _r++) {
					for (let _c = 0; _c < _stGrid[_r].length; _c++) {
						const idx = _stGrid[_r][_c];
						if (idx === 0) continue;
						_stCtx.fillStyle = _stPal[idx] ?? 'transparent';
						_stCtx.fillRect(_c, _r, 1, 1);
					}
				}
			}
			stDiv.appendChild(stoneCv);
			// 石がスイッチの上にある場合は緑色のグローを追加
			const onSwitch = stageData.tiles[st.r]?.[st.c] === TILE.SWITCH;
			if (onSwitch) {
				const glow = document.createElement('div');
				glow.style.cssText = 'position:absolute;inset:0;background:rgba(80,255,100,0.38);border-radius:3px;box-shadow:0 0 8px 4px rgba(60,255,80,0.6);pointer-events:none;z-index:5;animation:stone-glow 1.2s ease-in-out infinite;';
				stDiv.appendChild(glow);
			}
			charLayerEl.appendChild(stDiv);
		}
	}
	// 敵
	for (const e of enemies) {
		const wrapper = addCharEl(e.x, e.y, `enemy-${e.id}`, () => {
			return makeSprite(e.sprite, e.pal, true);
		});
		if (wrapper) {
			wrapper.dataset.enemyId = e.id;
			// 魔王オーラ（aura: true の敵に追加）
			if (ENEMY_META[e.type]?.aura) {
				const smoke = document.createElement('div');
				smoke.className = 'dark-lord-aura-smoke';
				wrapper.appendChild(smoke);
				const ring2 = document.createElement('div');
				ring2.className = 'dark-lord-aura-2';
				wrapper.appendChild(ring2);
				const ring1 = document.createElement('div');
				ring1.className = 'dark-lord-aura';
				wrapper.appendChild(ring1);
			}
		}
	}
}

// float 座標 (x, y) にキャラ要素を配置して返す
function addCharEl(x, y, id, makeSpriteFn) {
	if (!charLayerEl) return null;
	const cellPx = getCellPx();
	const div    = document.createElement('div');
	div.className = 'char-abs';
	div.id        = `char-${id}`;
	div.style.left = `${x * cellPx}px`;
	div.style.top  = `${y * cellPx}px`;
	const cv = makeSpriteFn();
	if (cv) div.appendChild(cv);
	charLayerEl.appendChild(div);
	return div;
}

// 既存の char 要素の位置だけ更新（再生成しない）
function moveCharEl(id, x, y) {
	const el = document.getElementById(`char-${id}`);
	if (!el) return;
	const cellPx   = getCellPx();
	el.style.left  = `${x * cellPx}px`;
	el.style.top   = `${y * cellPx}px`;
}

function removeCharEl(id) {
	const el = document.getElementById(`char-${id}`);
	if (el) el.remove();
}

function getHeroSpriteName() {
	return { down: 'heroD', right: 'heroR', left: 'heroR', up: 'heroU' }[heroDir] ?? 'heroD';
}

// クリア済みなら姫パレット、未クリアなら勇者パレットを返す
function getHeroPalName() {
	return hasCleared() ? 'princess' : 'hero';
}

// ── HUD ──────────────────────────────────────────────────────
function updateHud() {
	// ハートをスプライト canvas で描画（半ハート対応）
	heartsEl.innerHTML = '';
	for (let i = 0; i < player.maxHearts; i++) {
		let sprName, palName;
		const hpForThis = player.hp - i * HP_PER_HEART;
		if (hpForThis >= HP_PER_HEART) {
			sprName = 'heart'; palName = 'heart';
		} else if (hpForThis === 1) {
			sprName = 'heartHalf'; palName = 'heartHalf';
		} else {
			sprName = 'heartEmpty'; palName = 'heartEmpty';
		}
		const frames = SPRITES[sprName];
		const palette = PAL[palName];
		if (frames && palette) {
			const cv = document.createElement('canvas');
			const grid = frames[0];
			cv.width  = grid[0].length;
			cv.height = grid.length;
			cv.style.cssText = 'width:16px;height:16px;image-rendering:pixelated;display:inline-block;flex-shrink:0;';
			const ctx = cv.getContext('2d');
			for (let r = 0; r < grid.length; r++) {
				for (let c = 0; c < grid[0].length; c++) {
					const idx = grid[r][c];
					if (idx === 0) continue;
					ctx.fillStyle = palette[idx] ?? 'transparent';
					ctx.fillRect(c, r, 1, 1);
				}
			}
			heartsEl.appendChild(cv);
		}
	}
	equipSwordEl.classList.toggle('has-item',  !!player.weapon);
	equipShieldEl.classList.toggle('has-item', !!player.shield);
	equipArmorEl.classList.toggle('has-item',  !!player.armor);
	document.getElementById('hud-rupees').textContent   = player.rupees;
	document.getElementById('hud-triforce').textContent = player.triforceCount;
	const ai = player.activeSubItem;
	if (ai && player.subItems[ai]) {
		const meta = ITEM_META[ai];
		subIconEl.textContent  = meta?.icon ?? ai;
		const cnt = player.subItems[ai].count;
		subCountEl.textContent = (cnt && cnt !== Infinity) ? `×${cnt}` : '';
	} else {
		subIconEl.textContent  = '—';
		subCountEl.textContent = '';
	}
}

function pulse(text, duration = 2000) {
	if (msgTimer) clearTimeout(msgTimer);
	msgBarEl.textContent = text;
	msgBarEl.classList.remove('hidden');
	msgTimer = setTimeout(() => msgBarEl.classList.add('hidden'), duration);
}

// ── 通行可否（半セル移動 対応） ───────────────────────────────
// x/y はキャラの「左上角」のセル単位 float 座標
// キャラは 1×1 セルの大きさ
//
// キャラが占めるタイル範囲：
//   列方向: floor(x) 〜 floor(x + 0.999)  （x が整数のとき 1列、0.5のとき 2列）
//   行方向: floor(y) 〜 floor(y + 0.999)
//
// 例: x=1.5 → 列 1 と 列 2 に跨る → 両方チェック
function isPassable(nx, ny) {
	if (!stageData) return false;
	const c0 = Math.floor(nx);
	const c1 = Math.floor(nx + 0.999);
	const r0 = Math.floor(ny);
	const r1 = Math.floor(ny + 0.999);

	for (let r = r0; r <= r1; r++) {
		for (let c = c0; c <= c1; c++) {
			// マップ外 → ステージ端遷移なので通行可として扱う
			if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) continue;
			if (!tilePassable(r, c)) return false;
		}
	}

	// デバッグモード中は敵すり抜け可能
	if (debugMode) return true;

	// 移動後の石があるセルには移動できない（範囲チェック）
	if (stageData && !debugMode) {
		const _ssp = getSS(currentLayer, stageKey);
		for (const st of Object.values(_ssp.stonePositions ?? {})) {
			if (st.r >= r0 && st.r <= r1 && st.c >= c0 && st.c <= c1) return false;
		}
	}

	// 敵と同じタイルセルには移動できない（重なり防止）
	// ※ 「0.6未満」判定だと半セル移動時に動けなくなるため、タイル単位で比較する
	for (const e of enemies) {
		if (toTileRow(ny) === toTileRow(e.y) && toTileCol(nx) === toTileCol(e.x)) return false;
	}

	return true;
}

function tilePassable(r, c) {
	const tile   = stageData.tiles[r]?.[c];
	if (!tile) return false;
	const posKey = `${r},${c}`;
	const ss     = getSS(currentLayer, stageKey);
	if (tile === TILE.WALL) return false;
	if (tile === TILE.WATER) return false;
	if (tile === TILE.GATE   && !ss.openGates.has(posKey)) return false;
	// デバッグモード中はドアを素通り（鍵不要）
	if (tile === TILE.DOOR   && !ss.openedDoors?.has(posKey) && !debugMode) return false;
	if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) return false;
	if (NPC_SPRITE_MAP[tile]) return false;
	// Phase 8: フィールドタイル通行判定
	if (tile === TILE.TREE)        return false;
	if (tile === TILE.MOUNTAIN)    return false;
	if (tile === TILE.FENCE)       return false;
	if (tile === TILE.HOUSE_WALL)  return false;
	if (tile === TILE.HOUSE_ROOF)  return false;
	if (tile === TILE.SIGN)        return false; // 看板は通行不可（隣接して剣で読む）
	if (tile === TILE.BUSH) {
		// 茂み：切られていれば通行可
		if (ss.cutBushes?.has(posKey)) return true;
		return false;
	}
	// 石（STONE）の通行判定：元のタイル位置で判断
	if (tile === TILE.STONE) {
		const _ss = getSS(currentLayer, stageKey);
		// stonePositions に登録されていれば石は移動済み → 元の位置は床として通行可
		if (_ss.stonePositions?.[posKey]) return true;
		return false; // 移動されていない → 石がある → 通れない
	}
	// Phase 6.5: ドアウェイの通行判定
	if (tile === TILE.DOORWAY_BOSS || tile === TILE.DOORWAY_LOCKED) {
		const dwState = ss.doorwayStates?.[posKey];
		// DOORWAY_LOCKED: 閉じている間は通れない
		if (tile === TILE.DOORWAY_LOCKED) {
			const state = dwState ?? 'closed';
			if (state !== 'open') return false;
		}
		// DOORWAY_BOSS: boss_closed 状態は通れない
		if (tile === TILE.DOORWAY_BOSS) {
			if (dwState === 'boss_closed') return false;
		}
	}
	return true;
}

// 敵向けの通行可否（同じ 1セル占有チェック）
function isPassableForEnemy(ny, nx, self) {
	if (!stageData) return false;
	const c0 = Math.floor(nx);
	const c1 = Math.floor(nx + 0.999);
	const r0 = Math.floor(ny);
	const r1 = Math.floor(ny + 0.999);

	for (let r = r0; r <= r1; r++) {
		for (let c = c0; c <= c1; c++) {
			if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) return false;
			if (!tilePassable(r, c)) return false;
		}
	}
	// 移動後の石があるセルには通れない
	if (stageData) {
		const _sspe = getSS(currentLayer, stageKey);
		for (const st of Object.values(_sspe.stonePositions ?? {})) {
			if (toTileRow(ny) === st.r && toTileCol(nx) === st.c) return false;
		}
	}
	// 他の敵と大きく重なっているなら通れない
	for (const e of enemies) {
		if (e === self) continue;
		if (Math.abs(e.x - nx) < 0.6 && Math.abs(e.y - ny) < 0.6) return false;
	}
	// プレイヤーと同じタイルセルには移動できない（重なり防止）
	// 隣接セルへの移動は許可するので体当たり攻撃は成立する
	if (toTileRow(ny) === toTileRow(player.y) && toTileCol(nx) === toTileCol(player.x)) return false;
	return true;
}

// ── ドアウェイシステム（Phase 6.5） ──────────────────────────
// ボス部屋ロック状態：true の間はステージ遷移・MAP_ENTER を完全ブロック
let bossRoomLocked = false;

// ステージ内のドアウェイ開閉状態を管理
// getSS().doorwayStates["r,c"] = 'open' | 'closed' | 'boss_open' | 'boss_closed'
// DOORWAY       : 常に open（変化なし）
// DOORWAY_BOSS  : 初期 'open'、入室後 'boss_closed'、ボス撃破で 'open'
// DOORWAY_LOCKED: 初期 'closed'、条件達成で 'open'

function getDoorwayState(posKey) {
	const ss = getSS(currentLayer, stageKey);
	if (!ss.doorwayStates) ss.doorwayStates = {};
	const tile = stageData?.tiles
		?.[parseInt(posKey.split(',')[0])]
		?.[parseInt(posKey.split(',')[1])];
	if (tile === TILE.DOORWAY) return 'open';
	return ss.doorwayStates[posKey] ?? (tile === TILE.DOORWAY_LOCKED ? 'closed' : 'open');
}

function setDoorwayState(posKey, state) {
	const ss = getSS(currentLayer, stageKey);
	if (!ss.doorwayStates) ss.doorwayStates = {};
	ss.doorwayStates[posKey] = state;
}

// ボス入室時：DOORWAY_BOSS タイルを全て閉じる
function lockBossDoors() {
	if (!stageData) return;
	for (let r = 0; r < stageData.rows; r++) {
		for (let c = 0; c < stageData.cols; c++) {
			if (stageData.tiles[r][c] === TILE.DOORWAY_BOSS) {
				setDoorwayState(`${r},${c}`, 'boss_closed');
			}
		}
	}
	renderBoard(); renderChars();
}

// ボス撃破時：DOORWAY_BOSS タイルを全て開く
function unlockBossDoors() {
	if (!stageData) return;
	for (let r = 0; r < stageData.rows; r++) {
		for (let c = 0; c < stageData.cols; c++) {
			if (stageData.tiles[r][c] === TILE.DOORWAY_BOSS) {
				setDoorwayState(`${r},${c}`, 'open');
			}
		}
	}
	renderBoard(); renderChars();
}

// 条件達成時：DOORWAY_LOCKED タイルを開く（posKey指定または全て）
function unlockLockedDoor(posKey) {
	setDoorwayState(posKey, 'open');
	playSound('gateOpen');
	renderBoard(); renderChars();
}

// ── ステージ端遷移チェック ────────────────────────────────────
function checkStageTransition() {
	if (isTransitioning) return;
	// ボス部屋ロック中は全方向の退出を禁止
	if (bossRoomLocked) {
		pulse('扉が閉じている！', 1200);
		return;
	}
	const { x, y } = player;
	const { rows, cols } = stageData;

	let newKey = null, newLayer = currentLayer;
	let newRow = Math.round(y), newCol = Math.round(x);
	const [sx, sy] = stageKey.split(',').map(Number);

	if (y < 0)    { newKey = `${sx},${sy - 1}`; newRow = rows - 1.5; newCol = x; }
	else if (y >= rows) { newKey = `${sx},${sy + 1}`; newRow = 0.5; newCol = x; }
	else if (x < 0)    { newKey = `${sx - 1},${sy}`; newRow = y; newCol = cols - 1.5; }
	else if (x >= cols) { newKey = `${sx + 1},${sy}`; newRow = y; newCol = 0.5; }

	if (newKey && getStageData(newLayer, newKey)) {
		isTransitioning = true;
		playSound('stageTransition');
		saveGame();
		setTimeout(() => {
			enterStage(newLayer, newKey, newRow, newCol);
			isTransitioning = false;
		}, 100);
		return;
	}

	// MAP_ENTER タイル（'>' タイルが実際に置かれている場所のみ発動）
	// mapEnters のメタデータだけ存在してもタイルが '>' でなければ遷移しない
	if (Date.now() < mapEnterCooldownUntil) return;
	const r = toTileRow(y), c = toTileCol(x);
	const posKey = `${r},${c}`;
	const tileAtPos = stageData.tiles[r]?.[c];
	const enter  = stageData.mapEnters?.[posKey];
	if (tileAtPos === TILE.MAP_ENTER && enter?.destId && exitRegistry[enter.destId]) {
		const dest = exitRegistry[enter.destId];
		isTransitioning = true;
		playSound('stageTransition');
		saveGame();
		setTimeout(() => {
			enterStage(dest.layer, dest.stage, dest.row, dest.col);
			isTransitioning = false;
			// 遷移後 1.5 秒間は MAP_ENTER 再遷移を無効化
			mapEnterCooldownUntil = Date.now() + 1500;
		}, 100);
	}
}

// ── ドアを鍵で開ける ─────────────────────────────────────────
// 移動先セルに TILE.DOOR があり、かつ鍵を持っていれば開扉してから通す
// 戻り値: true = ドアを開けた（通行可）、false = 鍵なし（通行不可のまま）
function tryOpenDoor(nr, nc) {
	const posKey = `${nr},${nc}`;
	const tile   = stageData?.tiles[nr]?.[nc];
	if (tile !== TILE.DOOR) return false;
	const ss = getSS(currentLayer, stageKey);
	if (ss.openedDoors?.has(posKey)) return true; // 既に開いている

	// 鍵を持っていれば消費して開ける
	if (player.keys <= 0) {
		pulse('🗝 鍵がない！', 1500);
		return false;
	}
	player.keys--;
	if (!ss.openedDoors) ss.openedDoors = new Set();
	ss.openedDoors.add(posKey);

	// ドア開扉アニメーション
	showDoorOpenEffect(nr, nc);
	playSound('gateOpen');
	pulse('🗝 扉を開けた！', 1500);
	renderBoard(); renderChars(); updateHud(); saveGame();
	return true;
}

// ドアが開くアニメーションエフェクト（タイルセル上でフラッシュ）
function showDoorOpenEffect(r, c) {
	const cellPx = getCellPx();
	// char-layer に一時的なフラッシュ要素を配置
	if (!charLayerEl) return;
	const el = document.createElement('div');
	el.style.cssText = `
		position:absolute;
		left:${c * cellPx}px;
		top:${r * cellPx}px;
		width:${cellPx}px;
		height:${cellPx}px;
		background:rgba(255,220,80,0.75);
		z-index:20;
		pointer-events:none;
		border-radius:4px;
		animation:door-open-flash 0.5s ease-out forwards;
	`;
	charLayerEl.appendChild(el);
	setTimeout(() => el.remove(), 550);
}


// ── 石を押す処理 ──────────────────────────────────────────────
// r,c: 石のタイル座標（元のタイル位置 or 移動後位置）
// dir: 押す方向（プレイヤーの移動方向）
// origKey: stonePositions のキー（移動後の石の場合）
// 戻り値: true = 石を押せた
function tryPushStone(r, c, dir, origKey) {
	const [pdy, pdx] = DIR_DELTA[dir];
	const ndr = Math.sign(pdy); // -1, 0, +1
	const ndc = Math.sign(pdx);
	const tr = r + ndr; // 石の押し先の行
	const tc = c + ndc; // 石の押し先の列
	console.log(`[STONE] tryPushStone(${r},${c}) dir=${dir} → dest=(${tr},${tc}) origKey=${origKey}`);
	if (tr < 0 || tr >= stageData.rows || tc < 0 || tc >= stageData.cols) { console.log('[STONE] blocked: out of bounds'); return false; }
	// 押し先が壁・水・ゲート（閉）・他の石などならブロック
	const destTile = stageData.tiles[tr]?.[tc];
	const passable = tilePassable(tr, tc);
	console.log(`[STONE] destTile=${destTile} tilePassable=${passable}`);
	if (!passable) return false;
	// 押し先に他の移動済み石がいないか確認
	const ss = getSS(currentLayer, stageKey);
	if (!ss.stonePositions) ss.stonePositions = {};
	for (const st of Object.values(ss.stonePositions)) {
		if (st.r === tr && st.c === tc) { console.log('[STONE] blocked: another moved stone'); return false; }
	}
	// 押し先に敵がいないか
	for (const e of enemies) {
		if (toTileRow(e.y) === tr && toTileCol(e.x) === tc) { console.log('[STONE] blocked: enemy'); return false; }
	}

	// origKey が指定されている場合は既存エントリを更新、なければ新規作成
	const key = origKey ?? `${r},${c}`;
	console.log(`[STONE] PUSHED! key=${key} → (${tr},${tc}) stonePositions=`, JSON.stringify(ss.stonePositions));
	ss.stonePositions[key] = { r: tr, c: tc };

	// スイッチとの判定
	checkStoneOnSwitch();

	playSound('move');
	renderBoard();
	renderChars();
	evaluateConditions();
	saveGame();
	return true;
}

// 石がスイッチの上に乗っているかチェックしてスイッチ状態を更新
function checkStoneOnSwitch() {
	const ss = getSS(currentLayer, stageKey);
	if (!ss.stonePositions) return;
	// まずスイッチ状態を「石によるON」をリセット（石がないスイッチはOFF）
	// ただしプレイヤーが踏んでいる場合は維持する
	for (let r = 0; r < stageData.rows; r++) {
		for (let c = 0; c < stageData.cols; c++) {
			if (stageData.tiles[r][c] !== TILE.SWITCH) continue;
			const pk = `${r},${c}`;
			// 石がこのスイッチの上にあるか確認
			const stoneHere = Object.values(ss.stonePositions).some(st => st.r === r && st.c === c);
			// プレイヤーが踏んでいるか確認
			const playerHere = toTileRow(player.y) === r && toTileCol(player.x) === c;
			if (stoneHere || playerHere) {
				if (!ss.switchStates[pk]) {
					ss.switchStates[pk] = true;
					// スイッチに連動するゲートを開く
					for (const link of stageData.links ?? []) {
						if (link.switchId === pk) {
							ss.openGates.add(link.gateId);
							playSound('gateOpen');
						}
					}
				}
			} else {
				// 石もプレイヤーもいない → スイッチを最初に踏んだプレイヤーによる永続ONでない場合のみOFF
				// ※ STONE タイル元位置でのスイッチ（石が最初からスイッチの上）は永続ON扱い
				// プレイヤーが踏んでONになったスイッチは石が離れてもON維持
				// → 石による一時スイッチ = ss.stoneSwitches に記録している場合のみリセット
				if (!ss.stoneSwitches) ss.stoneSwitches = new Set();
				if (ss.stoneSwitches.has(pk)) {
					ss.switchStates[pk] = false;
					// 閉じるゲート処理
					for (const link of stageData.links ?? []) {
						if (link.switchId === pk) ss.openGates.delete(link.gateId);
					}
				}
			}
		}
	}
	// 今石が乗っているスイッチを stoneSwitches に記録
	if (!ss.stoneSwitches) ss.stoneSwitches = new Set();
	for (const st of Object.values(ss.stonePositions)) {
		const pk = `${st.r},${st.c}`;
		if (stageData.tiles[st.r]?.[st.c] === TILE.SWITCH) {
			ss.stoneSwitches.add(pk);
		}
	}
}

// ── プレイヤー移動 ────────────────────────────────────────────
function movePlayer(dir) {
	if (isDialog || isPaused || isGameover || isTransitioning) return;
	heroDir = dir;

	const [dy, dx] = DIR_DELTA[dir];
	const nx = player.x + dx;
	const ny = player.y + dy;

	// ── 石の押し判定（整数セル単位） ─────────────────────────
	// プレイヤーの現在タイル位置から1セル先に石があれば押す
	const pr = toTileRow(player.y);
	const pc = toTileCol(player.x);
	const pdr = Math.sign(dy); // 移動方向（行）
	const pdc = Math.sign(dx); // 移動方向（列）
	const nextR = pr + pdr;    // 1セル先の行
	const nextC = pc + pdc;    // 1セル先の列
	const ss = getSS(currentLayer, stageKey);

	// 1セル先に石（元位置 or 移動後位置）があるか確認
	let stoneKey = null;
	if (stageData.tiles[nextR]?.[nextC] === TILE.STONE && !ss.stonePositions?.[`${nextR},${nextC}`]) {
		stoneKey = `${nextR},${nextC}`; // 元位置の石
	} else {
		// 移動後の石を確認
		for (const [k, st] of Object.entries(ss.stonePositions ?? {})) {
			if (st.r === nextR && st.c === nextC) { stoneKey = k; break; }
		}
	}

	if (stoneKey !== null) {
		// 石を押す：クールダウンチェック（重い石はゆっくりしか押せない）
		const nowSt = Date.now();
		if (nowSt - lastStonePushTime < STONE_PUSH_COOLDOWN_MS) {
			// クールダウン中 → 向きだけ変えて終わり（石に触れているが動かせない状態）
			updatePlayerCharEl();
			return;
		}
		// 石を押す：石の移動先
		const stoneDestR = nextR + pdr;
		const stoneDestC = nextC + pdc;
		// 石の移動先が壁・水等でないか、他の石がないか
		const stoneDestOk = stageData.tiles[stoneDestR]?.[stoneDestC] != null
			&& tilePassable(stoneDestR, stoneDestC)
			&& !Object.values(ss.stonePositions ?? {}).some(st => st.r === stoneDestR && st.c === stoneDestC);
		if (stoneDestOk) {
			// 石を1セル移動
			if (!ss.stonePositions) ss.stonePositions = {};
			// 石の「元の描画位置」を取得（アニメーション開始座標）
			const stoneFromR = (ss.stonePositions[stoneKey] ?? { r: nextR, c: nextC }).r;
			const stoneFromC = (ss.stonePositions[stoneKey] ?? { r: nextR, c: nextC }).c;
			// 位置を更新（アニメーション後の正式座標）
			ss.stonePositions[stoneKey] = { r: stoneDestR, c: stoneDestC };
			lastStonePushTime = nowSt; // クールダウンタイマーを更新
			checkStoneOnSwitch();
			evaluateConditions();

			// プレイヤーも1セル整数移動（石を押す時だけ整数単位）
			player.x = nextC;
			player.y = nextR;
			playSound('move');

			// ── 石の移動アニメーション ─────────────────────────
			// renderBoard()でcharLayerElを再作成してから、
			// 石をアニメーション付きで描画し、完了後にrenderChars()を呼ぶ
			renderBoard(); // タイル再描画（charLayerElリセット）

			// プレイヤーを押す前の位置に配置して、石と同じ速度でアニメーション移動
			const _animCellPx = getCellPx();
			const _animPlayerDiv = document.createElement('div');
			_animPlayerDiv.className = 'char-abs';
			_animPlayerDiv.id = 'char-player';
			// 移動前の位置（player.x/y はすでに nextC/nextR に更新済みなので元の位置 = pr, pc）
			_animPlayerDiv.style.left = `${pc * _animCellPx}px`;
			_animPlayerDiv.style.top  = `${pr * _animCellPx}px`;
			const _animHeroSpr = getHeroSpriteName();
			const _animHeroCv  = makeSprite(_animHeroSpr, getHeroPalName(), true, heroDir === 'left');
			if (_animHeroCv) _animPlayerDiv.appendChild(_animHeroCv);
			charLayerEl.appendChild(_animPlayerDiv);

			// アニメーションしない他の移動済み石を先に描画（グローも含む）
			{
				const _otherCellPx = getCellPx();
				const _otherStSize = Math.round(_otherCellPx * 0.7) + 'px';
				for (const [otherKey, otherSt] of Object.entries(ss.stonePositions ?? {})) {
					if (otherKey === stoneKey) continue; // 今動かしている石はスキップ
					const otherDiv = document.createElement('div');
					otherDiv.className = 'char-abs';
					otherDiv.id = `char-stone-${otherKey.replace(',', '-')}`;
					otherDiv.style.left   = `${otherSt.c * _otherCellPx}px`;
					otherDiv.style.top    = `${otherSt.r * _otherCellPx}px`;
					otherDiv.style.zIndex = '1';
					const otherCv = document.createElement('canvas');
					otherCv.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${_otherStSize};height:${_otherStSize};image-rendering:pixelated;`;
					const _otherFrames = SPRITES['block'];
					const _otherPal    = PAL['block'];
					if (_otherFrames && _otherPal) {
						const _otherGrid = _otherFrames[0];
						otherCv.width  = _otherGrid[0].length;
						otherCv.height = _otherGrid.length;
						const _otherCtx = otherCv.getContext('2d');
						for (let _r = 0; _r < _otherGrid.length; _r++) {
							for (let _c = 0; _c < _otherGrid[_r].length; _c++) {
								const idx = _otherGrid[_r][_c];
								if (idx === 0) continue;
								_otherCtx.fillStyle = _otherPal[idx] ?? 'transparent';
								_otherCtx.fillRect(_c, _r, 1, 1);
							}
						}
					}
					otherDiv.appendChild(otherCv);
					// スイッチの上にある石はグロー追加
					const otherOnSwitch = stageData.tiles[otherSt.r]?.[otherSt.c] === TILE.SWITCH;
					if (otherOnSwitch) {
						const glow = document.createElement('div');
						glow.style.cssText = 'position:absolute;inset:0;background:rgba(80,255,100,0.38);border-radius:3px;box-shadow:0 0 8px 4px rgba(60,255,80,0.6);pointer-events:none;z-index:5;animation:stone-glow 1.2s ease-in-out infinite;';
						otherDiv.appendChild(glow);
					}
					charLayerEl.appendChild(otherDiv);
				}
			}

			// 石をアニメーション用要素として古い位置に配置
			const _animStDiv = document.createElement('div');
			_animStDiv.className = 'char-abs';
			_animStDiv.id = `char-stone-${stoneKey.replace(',', '-')}`;
			_animStDiv.style.zIndex = '1';
			const _animStSize = Math.round(_animCellPx * 0.7) + 'px';
			const _animStCv = document.createElement('canvas');
			_animStCv.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${_animStSize};height:${_animStSize};image-rendering:pixelated;`;
			const _animFrames = SPRITES['block'];
			const _animPal    = PAL['block'];
			if (_animFrames && _animPal) {
				const _animGrid = _animFrames[0];
				_animStCv.width  = _animGrid[0].length;
				_animStCv.height = _animGrid.length;
				const _animCtx = _animStCv.getContext('2d');
				for (let _r = 0; _r < _animGrid.length; _r++) {
					for (let _c = 0; _c < _animGrid[_r].length; _c++) {
						const idx = _animGrid[_r][_c];
						if (idx === 0) continue;
						_animCtx.fillStyle = _animPal[idx] ?? 'transparent';
						_animCtx.fillRect(_c, _r, 1, 1);
					}
				}
			}
			_animStDiv.appendChild(_animStCv);
			// 古い位置に配置してからtransitionで新しい位置へ移動
			_animStDiv.style.left = `${stoneFromC * _animCellPx}px`;
			_animStDiv.style.top  = `${stoneFromR * _animCellPx}px`;
			charLayerEl.appendChild(_animStDiv);

			// 2フレーム待ってからtransitionを有効にして移動
			// （1回のrAFだと古い位置set→新位置setが同フレームに最適化されtransitionが発動しない場合がある）
			const _animDuration = STONE_PUSH_COOLDOWN_MS - 60; // クールダウンより少し短く
			requestAnimationFrame(() => {
				// 1フレーム目: ブラウザに古い位置を確定させる（レイアウト強制）
				void _animStDiv.offsetLeft;    // reflow強制
				void _animPlayerDiv.offsetLeft;
				requestAnimationFrame(() => {
					// 2フレーム目: transition設定 + 移動先を指定
					const _t = `left ${_animDuration}ms linear, top ${_animDuration}ms linear`;
					_animStDiv.style.transition = _t;
					_animStDiv.style.left = `${stoneDestC * _animCellPx}px`;
					_animStDiv.style.top  = `${stoneDestR * _animCellPx}px`;
					_animPlayerDiv.style.transition = _t;
					_animPlayerDiv.style.left = `${nextC * _animCellPx}px`;
					_animPlayerDiv.style.top  = `${nextR * _animCellPx}px`;
				});
			});

			// アニメーション完了後に正式再描画
			// handleTileEvent/checkSwitchOff はここでは呼ばない:
			// プレイヤーがスイッチの上に乗った場合、renderBoard/renderCharsを呼んでアニメを中断してしまうため
			updateHud();
			setTimeout(() => {
				renderChars();   // transition なし・正式座標で再描画
				saveGame();
				handleTileEvent();   // ← アニメ完了後に実行
				checkSwitchOff();    // ← アニメ完了後に実行
				checkStageTransition(); // ← アニメ完了後に実行
			}, _animDuration + 10);
			return;
		}
		// 石を押せない → 向きだけ変える
		updatePlayerCharEl();
		return;
	}

	// 壁チェック（通常移動）
	if (!isPassable(nx, ny)) {
		// ドア判定
		const c0 = Math.floor(nx), c1 = Math.floor(nx + 0.999);
		const r0 = Math.floor(ny), r1 = Math.floor(ny + 0.999);
		let doorOpened = false;
		for (let r = r0; r <= r1 && !doorOpened; r++) {
			for (let c = c0; c <= c1 && !doorOpened; c++) {
				if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) continue;
				if (stageData.tiles[r]?.[c] === TILE.DOOR) {
					doorOpened = tryOpenDoor(r, c);
				}
			}
		}
		if (!doorOpened) {
			updatePlayerCharEl();
			return;
		}
		if (!isPassable(nx, ny)) {
			updatePlayerCharEl();
			return;
		}
	}

	player.x = nx;
	player.y = ny;

	playSound('move');
	moveCharEl('player', player.x, player.y);
	updatePlayerCharEl();
	updateHud();

	handleTileEvent();
	checkSwitchOff();
	checkStageTransition();
}

// プレイヤーがスイッチから離れた時にOFFにする
function checkSwitchOff() {
	const ss = getSS(currentLayer, stageKey);
	let changed = false;
	for (let r = 0; r < stageData.rows; r++) {
		for (let c = 0; c < stageData.cols; c++) {
			if (stageData.tiles[r][c] !== TILE.SWITCH) continue;
			const pk = `${r},${c}`;
			if (!ss.switchStates[pk]) continue;
			// 石が乗っているスイッチは維持
			const stoneHere = Object.values(ss.stonePositions ?? {}).some(st => st.r === r && st.c === c);
			if (stoneHere) continue;
			// プレイヤーが乗っているか
			const playerHere = toTileRow(player.y) === r && toTileCol(player.x) === c;
			if (!playerHere) {
				// プレイヤーが離れた → OFF
				ss.switchStates[pk] = false;
				for (const link of stageData.links ?? []) {
					if (link.switchId === pk) ss.openGates.delete(link.gateId);
				}
				changed = true;
			}
		}
	}
	if (changed) { renderBoard(); renderChars(); evaluateConditions(); saveGame(); }
}

// 盾オーバーレイを char-abs div に追加する（ゼルダスタイル）
// ※ .char-abs canvas.sprite に width/height: var(--cell) !important があるため
//   setProperty('width', ..., 'important') で強制上書きする
function addShieldOverlay(div) {
	if (!player.shield) return;

	// 向きに応じてスプライトを選択
	let spriteName = 'shield';
	let flipX = false;
	if (heroDir === 'right') { spriteName = 'shieldSide'; }
	else if (heroDir === 'left') { spriteName = 'shieldSide'; flipX = true; }

	const cv = makeSprite(spriteName, 'shield', false, flipX);
	if (!cv) return;
	cv.style.position      = 'absolute';
	cv.style.imageRendering= 'pixelated';
	cv.style.pointerEvents = 'none';
	// !important で CSS 強制上書き
	const cellPx = getCellPx();

	if (heroDir === 'down') {
		// 下向き：右手側（左端）。右に1px、下に1px
		const sz = Math.round(cellPx * 0.40) + 'px';  // 1回り大きく
		cv.style.setProperty('width',  sz, 'important');
		cv.style.setProperty('height', sz, 'important');
		cv.style.zIndex = '4';
		cv.style.left   = `${Math.round(cellPx * 0.08 + 1)}px`;
		cv.style.top    = `${Math.round(cellPx * 0.48 + 1)}px`;
		cv.style.transform = 'none';
	} else if (heroDir === 'right') {
		const w = Math.round(cellPx * 0.17) + 'px';
		const h = Math.round(cellPx * 0.44) + 'px';
		cv.style.setProperty('width',  w, 'important');
		cv.style.setProperty('height', h, 'important');
		cv.style.zIndex = '4';
		cv.style.right  = '7px';
		cv.style.left   = 'auto';
		cv.style.top    = '50%';
		cv.style.transform = 'none';
	} else if (heroDir === 'left') {
		const w = Math.round(cellPx * 0.17) + 'px';
		const h = Math.round(cellPx * 0.44) + 'px';
		cv.style.setProperty('width',  w, 'important');
		cv.style.setProperty('height', h, 'important');
		cv.style.zIndex = '4';
		cv.style.left   = '7px';
		cv.style.top    = '50%';
		cv.style.transform = 'none';
	} else {
		const sz = Math.round(cellPx * 0.34) + 'px';
		cv.style.setProperty('width',  sz, 'important');
		cv.style.setProperty('height', sz, 'important');
		cv.style.setProperty('z-index', '-1', 'important');
		const rPx  = Math.round(cellPx * 0.08) - 3;
		const tPct = Math.round(cellPx * 0.45 + 4);
		cv.style.right  = `${rPx + 4}px`;
		cv.style.left   = 'auto';
		cv.style.top    = `${tPct + 3}px`;
		cv.style.opacity = '1';
		cv.style.transform = 'none';
	}
	div.appendChild(cv);
}

// プレイヤーのスプライトだけ差し替え（向き変更時）
function updatePlayerCharEl() {
	const el = document.getElementById('char-player');
	if (!el) return;
	el.innerHTML = '';

	// 上向きのとき盾を先に追加（プレイヤースプライトの下に表示）
	if (heroDir === 'up') addShieldOverlay(el);

	const spr   = getHeroSpriteName();
	const flipX = heroDir === 'left';
	const cv    = makeSprite(spr, getHeroPalName(), true, flipX);
	if (cv) el.appendChild(cv);

	// 上向き以外は盾をあとで追加（プレイヤースプライトの上に表示）
	if (heroDir !== 'up') addShieldOverlay(el);
}

// ── タイルイベント（踏んだセルを整数変換して判定） ──────────────
function handleTileEvent() {
	const r   = toTileRow(player.y);
	const c   = toTileCol(player.x);
	const posKey = `${r},${c}`;
	const tile   = stageData.tiles[r]?.[c];
	const ss     = getSS(currentLayer, stageKey);
	if (!tile) return;

	if (tile === TILE.KEY && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey); player.keys++;
		playSound('key'); pulse('🗝 鍵を手に入れた！');
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.SWITCH) {
		// プレッシャープレート方式：乗っている間だけON
		if (!ss.switchStates[posKey]) {
			ss.switchStates[posKey] = true;
			playSound('switch');
			for (const link of stageData.links ?? []) {
				if (link.switchId === posKey) { ss.openGates.add(link.gateId); playSound('gateOpen'); }
			}
			evaluateConditions();
			renderBoard(); renderChars(); saveGame();
		}
		return;
	}
	if (tile === TILE.ITEM_SWORD && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		// floorItems に atkBonus が設定されていればそちらを使う
		const swordBonus = stageData.floorItems?.[posKey]?.atkBonus ?? EQUIP_META.sword?.atkBonus ?? 2;
		// 現在の武器より強い場合のみ装備を更新（ATKが下がらないようにする）
		const swordName = stageData.floorItems?.[posKey]?.name ?? '剣';
		if (!player.weapon) {
			player.weapon = 'sword';
			if (!player._equip) player._equip = {};
			player._equip.swordBonus = swordBonus;
			player._equip.swordName  = swordName;
			player.atk += swordBonus;
			playSound('item'); pulse(`⚔ ${swordName}を手に入れた！（ATK+${swordBonus}）`);
		} else if (swordBonus > (player._equip?.swordBonus ?? 0)) {
			const diff = swordBonus - (player._equip?.swordBonus ?? 0);
			if (!player._equip) player._equip = {};
			player._equip.swordBonus = swordBonus;
			player._equip.swordName  = swordName;
			player.atk += diff;
			playSound('item'); pulse(`⚔ ${swordName}を手に入れた！（ATK+${diff}）`);
		} else {
			playSound('item'); pulse(`⚔ ${swordName}を拾った（今の剣の方が強い）`);
		}
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.ITEM_SHIELD && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey); player.shield = 'shield';
		playSound('item'); pulse('🛡 たてを手に入れた！');
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.ITEM_ARMOR && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		// floorItems に defBonus が設定されていればそちらを使う
		const armorBonus = stageData.floorItems?.[posKey]?.defBonus ?? EQUIP_META.armor?.defBonus ?? 2;
		// 現在の防具より強い場合のみ装備を更新（DEFが下がらないようにする）
		const armorName = stageData.floorItems?.[posKey]?.name ?? '防具';
		if (!player.armor) {
			player.armor = 'armor';
			if (!player._equip) player._equip = {};
			player._equip.armorBonus = armorBonus;
			player._equip.armorName  = armorName;
			player.def += armorBonus;
			playSound('item'); pulse(`⚚ ${armorName}を手に入れた！（DEF+${armorBonus}）`);
		} else if (armorBonus > (player._equip?.armorBonus ?? 0)) {
			const diff = armorBonus - (player._equip?.armorBonus ?? 0);
			if (!player._equip) player._equip = {};
			player._equip.armorBonus = armorBonus;
			player._equip.armorName  = armorName;
			player.def += diff;
			playSound('item'); pulse(`⚚ ${armorName}を手に入れた！（DEF+${diff}）`);
		} else {
			playSound('item'); pulse(`⚚ ${armorName}を拾った（今の防具の方が強い）`);
		}
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.ITEM_BOOMERANG && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		if (!player.subItems.boomerang) {
			player.subItems.boomerang = { count: Infinity };
		}
		if (!player.activeSubItem) player.activeSubItem = 'boomerang';
		playSound('item'); pulse('🪃 ブーメランを手に入れた！');
		renderBoard(); renderChars(); updateHud(); saveGame();
		maybeShowSubItemHint(); return;
	}
	if (tile === TILE.ITEM_BOMB && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		const bombCount = stageData.floorItems?.[posKey]?.count ?? 3;
		if (!player.subItems.bomb) player.subItems.bomb = { count: 0 };
		player.subItems.bomb.count += bombCount;
		if (!player.activeSubItem) player.activeSubItem = 'bomb';
		playSound('item'); pulse(`💣 爆弾 ×${bombCount} を手に入れた！`);
		renderBoard(); renderChars(); updateHud(); saveGame();
		maybeShowSubItemHint(); return;
	}
	if (tile === TILE.ITEM_BOW && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		const arrowCount = stageData.floorItems?.[posKey]?.count ?? 10;
		if (!player.subItems.bow) player.subItems.bow = { count: 0 };
		player.subItems.bow.count += arrowCount;
		if (!player.activeSubItem) player.activeSubItem = 'bow';
		playSound('item'); pulse(`🏹 弓矢 ×${arrowCount} を手に入れた！`);
		renderBoard(); renderChars(); updateHud(); saveGame();
		maybeShowSubItemHint(); return;
	}
	if (tile === TILE.ITEM_HEAL_POTION && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		giveSubItem('healPotion');
		playSound('item'); pulse('🧪 回復薬（小）を手に入れた！');
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.ITEM_BIG_HEAL_POTION && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		giveSubItem('bigHealPotion');
		playSound('item'); pulse('💊 回復薬（大）を手に入れた！');
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.ITEM_HEART_CONTAINER && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		gainHeartContainer();
		playSound('item'); pulse('❤ ハートコンテナを手に入れた！');
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.ITEM_RUPEE && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey); player.rupees += 1;
		playSound('rupee'); pulse('◆ ルピー ×1');
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.ITEM_RUPEE_LARGE && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey); player.rupees += 5;
		playSound('rupee'); pulse('◇ ルピー ×5');
		renderBoard(); renderChars(); updateHud(); saveGame(); return;
	}
	if (tile === TILE.ITEM_TRIFORCE_PIECE && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey); player.triforceCount++;
		console.log(`[TRIFORCE] handleTileEvent: ITEM_TRIFORCE_PIECE picked at ${posKey}, triforceCount=${player.triforceCount}`);
		playSound('item'); pulse('◭ トライフォースのカケラを手に入れた！');
		renderBoard(); renderChars(); updateHud(); saveGame();
		checkTriforceClear(); // 全収集チェック
		return;
	}
	if ((tile === TILE.ITEM_DUNGEON_MAP || tile === TILE.ITEM_COMPASS) && !ss.pickedKeys.has(posKey)) {
		pickDungeonItem(tile, posKey, ss); return;
	}
	if (tile === TILE.CHEST && !ss.openedChests.has(posKey)) {
		// 表示条件が設定されていて未達成なら取得不可
		const chestCond = stageData.showConditions?.[posKey];
		if (chestCond && !ss.conditionsMet.has(posKey)) {
			pulse('？ 何かが封印されているようだ…', 1500);
			return;
		}
		openChest(posKey, ss); return;
	}
	if (tile === TILE.MAP_ENTER) { checkStageTransition(); return; }

	// HOUSE_DOOR を踏んだとき：開閉アニメーション演出
	if (tile === TILE.HOUSE_DOOR) {
		showHouseDoorAnimation(r, c);
		return;
	}
}

// 家のドアを通過する時の開閉アニメーション
function showHouseDoorAnimation(r, c) {
	if (!charLayerEl) return;
	const cellPx = getCellPx();
	// 左右に開く扉エフェクト（2枚の半開き板）
	// 左側
	const left = document.createElement('div');
	left.style.cssText = `
		position:absolute;
		left:${c * cellPx}px;
		top:${r * cellPx}px;
		width:${cellPx / 2}px;
		height:${cellPx}px;
		background:rgba(138,64,32,0.85);
		z-index:20;
		pointer-events:none;
		transform-origin:left center;
		animation:house-door-open-left 0.4s ease-out forwards;
	`;
	// 右側
	const right = document.createElement('div');
	right.style.cssText = `
		position:absolute;
		left:${c * cellPx + cellPx / 2}px;
		top:${r * cellPx}px;
		width:${cellPx / 2}px;
		height:${cellPx}px;
		background:rgba(138,64,32,0.85);
		z-index:20;
		pointer-events:none;
		transform-origin:right center;
		animation:house-door-open-right 0.4s ease-out forwards;
	`;
	charLayerEl.appendChild(left);
	charLayerEl.appendChild(right);
	setTimeout(() => { left.remove(); right.remove(); }, 450);
}

function openChest(posKey, ss) {
	ss.openedChests.add(posKey); playSound('chest');
	const content = stageData.chestContents?.[posKey];
	if (content) {
		if (content.type === 'item') { giveSubItem(content.item); pulse(`☐ ${content.name ?? content.item} を手に入れた！`); }
		else if (content.type === 'weapon') {
			player.weapon = 'sword';
			const atkBonus = content.atkBonus ?? content.value ?? 2;
			player.atk += atkBonus;
			pulse(`☐ ${content.name ?? '剣'} を手に入れた！（ATK+${atkBonus}）`);
			updateHud();
		}
		else if (content.type === 'armor') {
			player.armor = 'armor';
			const defBonus = content.defBonus ?? content.value ?? 2;
			player.def += defBonus;
			pulse(`☐ ${content.name ?? '防具'} を手に入れた！（DEF+${defBonus}）`);
			updateHud();
		}
		else if (content.type === 'rupee') { player.rupees += content.value ?? 1; pulse(`☐ ルピー ×${content.value ?? 1}`); }
		else if (content.type === 'heartContainer') { gainHeartContainer(); pulse('❤ ハートの器を手に入れた！'); }
	} else { pulse('☐ 宝箱は空だった…'); }
	renderBoard(); renderChars(); updateHud(); saveGame();
}

function giveSubItem(id) {
	const meta = ITEM_META[id];
	// passive アイテムは subItems に追加しない（heartContainer は gainHeartContainer で処理）
	if (meta?.type === 'passive') {
		if (id === 'heartContainer') gainHeartContainer();
		return;
	}
	if (!player.subItems[id]) player.subItems[id] = { count: meta?.uses === Infinity ? Infinity : 1 };
	else if (meta?.uses !== Infinity) player.subItems[id].count++;
	if (!player.activeSubItem) player.activeSubItem = id;
	maybeShowSubItemHint();
}

// ── サブアイテム初取得ヒントダイアログ ────────────────────────
// 初めてBボタン用のサブアイテムを取得した時、Escape画面での切り替え方法を説明する
function maybeShowSubItemHint() {
	if (player._shownSubItemHint) return;
	player._shownSubItemHint = true;
	dialogLines = [
		'サブアイテムを手に入れた！',
		'Escapeキー（または ≡ボタン）を押すと\nアイテム切り替え画面を開けます。',
		'左右キーでBボタンに使うアイテムを\n切り替えることができます。',
	];
	dialogLineIdx = 0;
	isDialog = true; stopGameLoop();
	dialogNameEl.textContent = '！ ヒント';
	showDialogLine();
	dialogOverlayEl.classList.remove('hidden');
	playSound('talk');
}

function gainHeartContainer() {
	player.maxHearts++; player.maxHp += HP_PER_HEART; player.hp = player.maxHp;
}

// ── 剣攻撃 ────────────────────────────────────────────────────
// 剣リーチ：プレイヤーの正面 1.2 セル以内（半セル移動に合わせた範囲）
const SWORD_REACH = 1.2;
// 剣攻撃クールダウン：100ms（1秒10回まで）
// Phase 3 で攻撃速度UP装備が実装されたらここを短縮する
const SWORD_COOLDOWN_MS = 100;
let lastSwordTime = 0;

// 石を押すクールダウン：600ms（重い石はゆっくりしか押せない）
const STONE_PUSH_COOLDOWN_MS = 600;
let lastStonePushTime = 0;

function swordAttack() {
	if (isDialog || isPaused || isGameover) return;
	if (!player.weapon) { pulse('剣を持っていない！'); return; }
	// クールダウンチェック（デバッグモードはスキップしない）
	const now = Date.now();
	if (now - lastSwordTime < SWORD_COOLDOWN_MS) return;
	lastSwordTime = now;
	resumeAudio(); playSound('slash');

	// 向き方向の単位ベクトル（半セルで正規化）
	const [dy, dx] = DIR_DELTA[heroDir]; // 例: right → [0, 0.5]
	const ndx = dx / MOVE_STEP; // 正規化: 0, +1, -1
	const ndy = dy / MOVE_STEP;

	// 剣エフェクト：プレイヤーのセル中心から 1 セル先（float座標）
	const slashX = player.x + ndx;
	const slashY = player.y + ndy;
	showSwordSlashFloat(slashX, slashY);

	// 当たり判定：プレイヤー中心から SWORD_REACH セル以内の正面にいる敵
	// プレイヤー中心座標
	const pcx = player.x + 0.5;
	const pcy = player.y + 0.5;

	let hitEnemy = null;
	let hitDist  = Infinity;
	for (const e of enemies) {
		const ecx = e.x + 0.5;
		const ecy = e.y + 0.5;
		const relX = ecx - pcx;
		const relY = ecy - pcy;

		// 敵が「正面方向」にいるかチェック（内積 > 0）
		const dot = relX * ndx + relY * ndy;
		if (dot < 0) continue; // 背後は無視

		// 剣方向に射影した距離
		const projDist = dot; // = dot / |direction| = dot（単位ベクトルなので）
		if (projDist > SWORD_REACH) continue;

		// 横方向のずれが小さいか（横幅 0.8 セル以内）
		const perpX = relX - ndx * projDist;
		const perpY = relY - ndy * projDist;
		const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
		if (perpDist > 0.8) continue;

		if (projDist < hitDist) { hitDist = projDist; hitEnemy = e; }
	}

	// 二周目（姫パレット）は攻撃力2倍
	const swordAtk = hasCleared() ? player.atk * 2 : player.atk;
	if (hitEnemy) { dealDamageToEnemy(hitEnemy, swordAtk); return; }

	// NPC・ギミックとのインタラクション（プレイヤーの正面 1 セルのタイル）
	const tr = toTileRow(player.y + ndy);
	const tc = toTileCol(player.x + ndx);
	const tile = stageData.tiles[tr]?.[tc];
	const posKey3 = `${tr},${tc}`;

	if (tile === TILE.NPC_SHOP) {
		const shopData = stageData.shopData?.[posKey3];
		if (shopData) { openShop(shopData); } else { startDialog(tr, tc, tile); }
		return;
	}
	if (tile && NPC_SPRITE_MAP[tile]) { startDialog(tr, tc, tile); return; }

	// Phase 8.3: 看板を読む
	if (tile === TILE.SIGN) {
		const signData = stageData.signData?.[posKey3] ?? stageData.npcData?.[posKey3] ?? { name: '看板', lines: ['（何も書かれていない）'] };
		dialogLines = signData.lines ?? ['（何も書かれていない）'];
		dialogLineIdx = 0;
		isDialog = true; stopGameLoop();
		dialogNameEl.textContent = signData.name ?? '看板';
		showDialogLine();
		dialogOverlayEl.classList.remove('hidden');
		playSound('talk');
		return;
	}

	// Phase 8.2: 茂みを切る
	if (tile === TILE.BUSH) {
		const ss = getSS(currentLayer, stageKey);
		if (!ss.cutBushes) ss.cutBushes = new Set();
		if (!ss.cutBushes.has(posKey3)) {
			ss.cutBushes.add(posKey3);
			playSound('slash');
			// ランダムドロップ
			const rand = Math.random();
			if (rand < 0.12) {
				// ハート（HP+1）
				player.hp = Math.min(player.maxHp, player.hp + 1);
				updateHud();
				spawnDropEffect(tr, tc, '❤', '#ff4040');
				pulse('🌿 ❤ HP+1');
			} else if (rand < 0.16) {
				// ルピー（小）
				player.rupees += 1;
				updateHud();
				spawnDropEffect(tr, tc, '◆', '#20c040');
				pulse('🌿 ルピー ×1');
			}
			renderBoard(); renderChars(); saveGame();
		}
		return;
	}
}

// 剣エフェクト：Dungeon World の sword-thrust 方式で char-layer 上に絶対配置
function showSwordSlashFloat(fx, fy) {
	if (!charLayerEl) return;
	const cellPx = getCellPx();
	const el = document.createElement('div');
	// Dungeon World と同じクラス名・スタイルを使用
	el.className    = `sword-thrust dir-${heroDir}`;
	el.style.left   = `${fx * cellPx}px`;
	el.style.top    = `${fy * cellPx}px`;
	el.style.width  = `${cellPx}px`;
	el.style.height = `${cellPx}px`;
	charLayerEl.appendChild(el);
	setTimeout(() => el.remove(), 260);
}

// 敵の剣エフェクト（敵 e の位置からプレイヤー方向に）
function showEnemySwordSlash(e) {
	if (!charLayerEl) return;
	const dx = player.x - e.x, dy = player.y - e.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < 0.01) return;
	const fx = e.x + dx / dist;
	const fy = e.y + dy / dist;
	const dir = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
	const cellPx = getCellPx();
	const el = document.createElement('div');
	el.className = `sword-thrust dir-${dir}`;
	el.style.left   = `${fx * cellPx}px`;
	el.style.top    = `${fy * cellPx}px`;
	el.style.width  = `${cellPx}px`;
	el.style.height = `${cellPx}px`;
	charLayerEl.appendChild(el);
	setTimeout(() => el.remove(), 260);
}

function dealDamageToEnemy(e, dmg) {
	// HP が既に 0 以下（ボス撃破アニメーション中など）は無視
	if (e.hp <= 0) return;
	const actual = Math.max(1, dmg - e.def);
	e.hp -= actual;
	playSound('hit');
	showDmgPopupFloat(e.x, e.y, actual, true);
	// ボスなら HP バー更新・フェーズチェック
	if (ENEMY_META[e.type]?.isBoss) {
		updateBossHpBar(e);
		checkBossPhase(e);
	}
	if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
	const meta = ENEMY_META[e.type];
	if (meta?.isBoss) {
		// ボス撃破演出（非同期）
		onBossDefeated(e);
		return;
	}
	playSound('enemyDie');
	getSS(currentLayer, stageKey).defeatedEnemies.add(e.id);
	removeCharEl(`enemy-${e.id}`);
	enemies = enemies.filter(x => x !== e);
	evaluateConditions();
	saveGame();
}

// ── デバッグモード切り替え ─────────────────────────────────────
function toggleDebugMode() {
	debugMode = !debugMode;
	const label = debugMode ? '🛠 DEBUG ON（無敵・すり抜け）' : '🛠 DEBUG OFF';
	pulse(label, 1500);
	// HUD ラベルに [DBG] 表示
	stageLabelEl.textContent = `[${currentLayer}] ${stageKey}${debugMode ? ' [DBG]' : ''}`;
}

// ── ダメージ ──────────────────────────────────────────────────
function takeDamage(amount) {
	if (debugMode) return; // デバッグモード中は無敵
	if (Date.now() < invincibleUntil || isGameover) return;
	// 二周目（姫パレット）は防御力2倍
	const effectiveDef = hasCleared() ? player.def * 2 : player.def;
	const actual = Math.max(1, amount - effectiveDef);
	player.hp = Math.max(0, player.hp - actual);
	invincibleUntil = Date.now() + INVINCIBLE_MS;
	playSound('playerHit');
	showPlayerBlink();
	updateHud();
	if (player.hp <= 0) gameOver();
}

function showPlayerBlink() {
	if (blinkTimer) clearInterval(blinkTimer);
	let cnt = 0;
	blinkTimer = setInterval(() => {
		const el = document.getElementById('char-player');
		if (el) el.style.opacity = (cnt % 2 === 0) ? '0.2' : '1';
		cnt++;
		if (cnt >= 10) {
			clearInterval(blinkTimer); blinkTimer = null;
			const el2 = document.getElementById('char-player');
			if (el2) el2.style.opacity = '1';
		}
	}, 150);
}

// ── ダメージポップアップ（float 座標版） ─────────────────────
function showDmgPopupFloat(ex, ey, dmg, isEnemy) {
	const cellPx = getCellPx();
	const el = document.createElement('div');
	el.className = `dmg-popup ${isEnemy ? 'enemy-dmg' : 'player-dmg'}`;
	el.textContent = `-${dmg}`;
	el.style.cssText = `
		position:absolute;
		left:${(ex + 0.5) * cellPx}px;
		top:${(ey - 0.3) * cellPx}px;
		transform:translateX(-50%);
		z-index:30;
	`;
	charLayerEl?.appendChild(el);
	setTimeout(() => el.remove(), 700);
}

// ── ゲームオーバー ────────────────────────────────────────────
function gameOver() {
	isGameover = true; stopGameLoop(); stopBgm(); playSound('gameover');
	gameoverOverlayEl.classList.remove('hidden');
}

function retryGame() {
	isGameover = isPaused = isDialog = isTransitioning = false;
	invincibleUntil = 0;
	gameoverOverlayEl.classList.add('hidden');
	player.hp = player.maxHp;
	updateHud();
	enterStage(currentLayer, stageKey, player.y, player.x);
	startGameLoop();
}

// ── 条件評価 ──────────────────────────────────────────────────
function evaluateConditions() {
	if (!stageData?.showConditions) return;
	const ss = getSS(currentLayer, stageKey);
	for (const [posKey, cond] of Object.entries(stageData.showConditions)) {
		if (ss.conditionsMet.has(posKey)) continue;
		let met = false;
		if (cond.trigger === 'killAll')    met = enemies.length === 0;
		else if (cond.trigger === 'switchOn') met = ss.switchStates?.[cond.switchId] === true;
		else if (cond.trigger === 'wallBroken') met = ss.brokenWalls?.has(cond.wallId);
		else if (cond.trigger === 'hasItem') met = !!player.subItems[cond.item] || player.weapon === cond.item;
		else if (cond.trigger === 'allSwitchesOn') {
			const allSw = [];
			for (let _r = 0; _r < stageData.rows; _r++) {
				for (let _c = 0; _c < stageData.cols; _c++) {
					if (stageData.tiles[_r][_c] === TILE.SWITCH) allSw.push(`${_r},${_c}`);
				}
			}
			met = allSw.length > 0 && allSw.every(pk => ss.switchStates?.[pk] === true);
		}
		if (met) {
			ss.conditionsMet.add(posKey);
			playSound('appear');
			renderBoard(); renderChars();
		}
	}
}

// ── NPC 会話 ──────────────────────────────────────────────────
function startDialog(r, c, tileChar) {
	const posKey = `${r},${c}`;
	const data   = stageData.npcData?.[posKey] ?? NPC_DEFAULT_DIALOG[tileChar] ?? { name: 'NPC', lines: ['…'] };
	dialogLines = data.lines ?? ['…'];
	dialogLineIdx = 0;
	isDialog = true; stopGameLoop();
	dialogNameEl.textContent = data.name ?? '';
	showDialogLine();
	dialogOverlayEl.classList.remove('hidden');
	playSound('talk');
}

function showDialogLine() {
	dialogTextEl.textContent = dialogLines[dialogLineIdx] ?? '';
	const isLast = dialogLineIdx >= dialogLines.length - 1;
	document.getElementById('dialog-next').textContent =
		isLast ? '▼ 閉じる（Spaceキー）' : '▼ 次へ（Spaceキー）';
}

function advanceDialog() {
	dialogLineIdx++;
	if (dialogLineIdx >= dialogLines.length) {
		isDialog = false; dialogOverlayEl.classList.add('hidden'); startGameLoop();
	} else { showDialogLine(); playSound('talk'); }
}

// ── ポーズ ────────────────────────────────────────────────────
function togglePause() {
	if (isDialog || isGameover) return;
	isPaused = !isPaused;
	if (isPaused) {
		stopGameLoop(); pauseOverlayEl.classList.remove('hidden'); renderPauseMenu();
	} else {
		pauseOverlayEl.classList.add('hidden'); startGameLoop();
	}
}

function renderPauseMenu() {
	pauseItemKeys = Object.keys(player.subItems).filter(k => {
		const s = player.subItems[k];
		if (!s || (s.count !== Infinity && s.count <= 0)) return false;
		// passive アイテム（heartContainer等）はサブアイテムスロットに表示しない
		const meta = ITEM_META[k];
		if (meta?.type === 'passive') return false;
		return true;
	});
	if (pauseItemIdx >= pauseItemKeys.length) pauseItemIdx = 0;
	pauseItemsEl.innerHTML = '';
	if (pauseItemKeys.length === 0) {
		pauseItemsEl.innerHTML = '<div style="color:#4a6a8a;font-size:13px;">サブアイテムなし</div>';
	} else {
		for (let i = 0; i < pauseItemKeys.length; i++) {
			const id = pauseItemKeys[i];
			const meta = ITEM_META[id];
			const cnt  = player.subItems[id].count;
			const div  = document.createElement('div');
			div.className = `pause-item-slot${i === pauseItemIdx ? ' selected' : ''}`;
			// アイコン部分：スプライトがあればcanvas、なければ絵文字
			const iconDiv = document.createElement('div');
			iconDiv.className = 'pause-item-icon';
			const sprName = meta?.sprite;
			const palName = meta?.pal ?? sprName;
			if (sprName && SPRITES[sprName]) {
				// ポーズメニュー用：spriteクラスを付けずに直接描画
				const frames = SPRITES[sprName];
				const palette = PAL[palName] || PAL[sprName] || PAL.hero;
				const cv = document.createElement('canvas');
				// spriteクラスは付けない（position:absoluteが適用されないよう）
				cv.style.cssText = 'width:24px;height:24px;image-rendering:pixelated;display:block;';
				const grid = frames[0];
				const rows = grid.length;
				const cols = grid[0].length;
				cv.width  = cols;
				cv.height = rows;
				const ctx = cv.getContext('2d');
				for (let rr = 0; rr < rows; rr++) {
					for (let cc = 0; cc < cols; cc++) {
						const idx = grid[rr][cc];
						if (idx === 0) continue;
						ctx.fillStyle = palette[idx] ?? 'transparent';
						ctx.fillRect(cc, rr, 1, 1);
					}
				}
				iconDiv.appendChild(cv);
			} else {
				iconDiv.textContent = meta?.icon ?? id;
			}
			div.appendChild(iconDiv);
			const nameDiv = document.createElement('div');
			nameDiv.className = 'pause-item-name';
			nameDiv.textContent = meta?.name ?? id;
			div.appendChild(nameDiv);
			const cntDiv = document.createElement('div');
			cntDiv.className = 'pause-item-count';
			cntDiv.textContent = cnt === Infinity ? '∞' : `×${cnt}`;
			div.appendChild(cntDiv);
			div.addEventListener('click', () => {
				pauseItemIdx = i; player.activeSubItem = pauseItemKeys[i];
				updateHud(); togglePause();
			});
			pauseItemsEl.appendChild(div);
		}
	}
	// 装備名を含むステータス表示
	const swordLabel = player.weapon ? `⚔${player._equip?.swordName ?? '剣'}(ATK${player.atk})` : '⚔なし';
	const armorLabel = player.armor  ? `⚚${player._equip?.armorName ?? '防具'}(DEF${player.def})` : '⚚なし';
	// ハートをスプライト canvas で描画（半ハート対応）
	pauseStatsEl.innerHTML = '';
	const heartRow = document.createElement('div');
	heartRow.style.cssText = 'display:flex;align-items:center;gap:2px;margin-bottom:4px;';
	for (let i = 0; i < player.maxHearts; i++) {
		const hpForThis = player.hp - i * HP_PER_HEART;
		let sprName, palName;
		if (hpForThis >= HP_PER_HEART) {
			sprName = 'heart'; palName = 'heart';
		} else if (hpForThis === 1) {
			sprName = 'heartHalf'; palName = 'heartHalf';
		} else {
			sprName = 'heartEmpty'; palName = 'heartEmpty';
		}
		const frames = SPRITES[sprName];
		const palette = PAL[palName];
		if (frames && palette) {
			const grid = frames[0];
			const cv = document.createElement('canvas');
			cv.width  = grid[0].length;
			cv.height = grid.length;
			cv.style.cssText = 'width:16px;height:16px;image-rendering:pixelated;display:inline-block;flex-shrink:0;';
			const ctx = cv.getContext('2d');
			for (let rr = 0; rr < grid.length; rr++) {
				for (let cc = 0; cc < grid[0].length; cc++) {
					const idx = grid[rr][cc];
					if (idx === 0) continue;
					ctx.fillStyle = palette[idx] ?? 'transparent';
					ctx.fillRect(cc, rr, 1, 1);
				}
			}
			heartRow.appendChild(cv);
		}
	}
	pauseStatsEl.appendChild(heartRow);
	const statsLine = document.createElement('div');
	statsLine.textContent = `💰${player.rupees}　${swordLabel}　${armorLabel}`;
	pauseStatsEl.appendChild(statsLine);
	// ダンジョン地図を描画（現在ダンジョン内かつ地図入手済みの場合のみ）
	renderPauseDungeonMap();
}

// ── ポーズ画面：レイヤーマップ描画 ───────────────────────────
// field/dungeon 問わず、地図を持っているレイヤーならマップを表示する
function renderPauseDungeonMap() {
	const lk = currentLayer;
	const dm = player.dungeonItems?.[lk];
	if (!dm?.hasMap) { pauseDungeonMapEl.classList.add('hidden'); return; }

	pauseDungeonMapEl.classList.remove('hidden');

	// コンパス：ボス部屋の場所を表示（コンパス入手済みの場合）
	const ld = mapData.layers[lk];
	const hasCompass = !!dm.hasCompass;
	const bossStageKey = ld?.bossStage ?? null;

	// ステージ一覧からグリッド範囲を算出
	const stages = Object.keys(ld.stages ?? {});
	if (stages.length === 0) { pauseDungeonMapEl.classList.add('hidden'); return; }

	// ステージキーは "x,y" 形式（x=列方向=右、y=行方向=下）
	const coords = stages.map(k => k.split(',').map(Number));
	const minX = Math.min(...coords.map(c => c[0]));
	const maxX = Math.max(...coords.map(c => c[0]));
	const minY = Math.min(...coords.map(c => c[1]));
	const maxY = Math.max(...coords.map(c => c[1]));
	const gridW = maxX - minX + 1;
	const gridH = maxY - minY + 1;

	// canvas サイズ設定（1ステージ = 24px、最大10ステージ幅まで想定）
	const CELL = 24;
	const PAD  = 3;
	const cw = gridW * (CELL + PAD) + PAD;
	const ch = gridH * (CELL + PAD) + PAD;
	pauseMapCanvasEl.width  = cw;
	pauseMapCanvasEl.height = ch;
	// display サイズ（2倍でピクセルくっきり）
	pauseMapCanvasEl.style.width  = `${cw * 2}px`;
	pauseMapCanvasEl.style.height = `${ch * 2}px`;

	const ctx = pauseMapCanvasEl.getContext('2d');
	ctx.clearRect(0, 0, cw, ch);

	// 背景
	ctx.fillStyle = '#0a0e12';
	ctx.fillRect(0, 0, cw, ch);

	// 現在ステージ（stageKey も "x,y" 形式）
	const [curX, curY] = stageKey.split(',').map(Number);

	// stageキー集合（隣接チェック用）
	const stageSet = new Set(stages);

	stages.forEach(sk => {
		const [sx, sy] = sk.split(',').map(Number);
		// x → 横（列）、y → 縦（行）
		const x = PAD + (sx - minX) * (CELL + PAD);
		const y = PAD + (sy - minY) * (CELL + PAD);

		const isCurrent  = (sx === curX && sy === curY);
		const isBoss     = (sk === bossStageKey && hasCompass);
		const isVisited  = getSS(lk, sk).defeatedEnemies.size > 0 || isCurrent;

		// ステージ背景色
		if (isCurrent)   ctx.fillStyle = '#80c0f0';
		else if (isBoss) ctx.fillStyle = '#c04040';
		else             ctx.fillStyle = isVisited ? '#3a5060' : '#1a2a38';

		ctx.fillRect(x, y, CELL, CELL);

		// 隣接ステージとの通路を描画（上下左右）
		const PASS_W = Math.floor(CELL * 0.4);  // 通路の幅
		const PASS_H = PAD;                      // 通路の長さ（= PAD分）
		const passColor = isCurrent ? '#80c0f0' : (isVisited ? '#3a5060' : '#1a2a38');
		ctx.fillStyle = passColor;
		// 右
		if (stageSet.has(`${sx + 1},${sy}`)) {
			ctx.fillRect(x + CELL, y + (CELL - PASS_W) / 2, PASS_H, PASS_W);
		}
		// 下
		if (stageSet.has(`${sx},${sy + 1}`)) {
			ctx.fillRect(x + (CELL - PASS_W) / 2, y + CELL, PASS_W, PASS_H);
		}
		// 左（左の部屋が通路を引く）
		if (stageSet.has(`${sx - 1},${sy}`)) {
			ctx.fillRect(x - PASS_H, y + (CELL - PASS_W) / 2, PASS_H, PASS_W);
		}
		// 上（上の部屋が通路を引く）
		if (stageSet.has(`${sx},${sy - 1}`)) {
			ctx.fillRect(x + (CELL - PASS_W) / 2, y - PASS_H, PASS_W, PASS_H);
		}

		// ボス部屋マーク
		if (isBoss) {
			ctx.fillStyle = '#ffffff';
			ctx.font = `${CELL - 4}px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('!', x + CELL / 2, y + CELL / 2 + 1);
		}
		// 現在地マーク
		if (isCurrent) {
			ctx.fillStyle = '#0a1418';
			const s = 4;
			ctx.fillRect(x + CELL / 2 - s / 2, y + CELL / 2 - s / 2, s, s);
		}
	});

	// ヒント（コンパス入手でボス部屋表示）
	if (hasCompass && bossStageKey && ld.stages[bossStageKey]) {
		pauseMapHintEl.classList.remove('hidden');
	} else {
		pauseMapHintEl.classList.add('hidden');
	}
}

function pauseSelectPrev() {
	if (!pauseItemKeys.length) return;
	pauseItemIdx = (pauseItemIdx - 1 + pauseItemKeys.length) % pauseItemKeys.length;
	player.activeSubItem = pauseItemKeys[pauseItemIdx];
	playSound('switch');
	updateHud(); renderPauseMenu();
}
function pauseSelectNext() {
	if (!pauseItemKeys.length) return;
	pauseItemIdx = (pauseItemIdx + 1) % pauseItemKeys.length;
	player.activeSubItem = pauseItemKeys[pauseItemIdx];
	playSound('switch');
	updateHud(); renderPauseMenu();
}

// ── ショップ ──────────────────────────────────────────────────
const shopOverlayEl = document.getElementById('shop-overlay');
const shopItemsEl   = document.getElementById('shop-items');
const shopRupeesEl  = document.getElementById('shop-rupees');
let isShop       = false;
let shopGoods    = [];   // { id, name, icon, count, price } の配列
let shopIdx      = 0;

function openShop(shopData) {
	if (!shopData?.items?.length) return;
	isShop   = true;
	shopGoods = shopData.items;
	shopIdx   = 0;
	stopGameLoop();
	renderShop();
	shopOverlayEl.classList.remove('hidden');
	playSound('talk');
}

function closeShop() {
	isShop = false;
	shopOverlayEl.classList.add('hidden');
	startGameLoop();
}

function renderShop() {
	shopRupeesEl.textContent = player.rupees;
	shopItemsEl.innerHTML = '';
	shopGoods.forEach((g, i) => {
		const meta = ITEM_META[g.id];
		const icon = meta?.icon ?? g.id;
		const name = g.name ?? meta?.name ?? g.id;
		const row  = document.createElement('div');
		const canBuy = player.rupees >= g.price;
		row.className = `shop-item-row${i === shopIdx ? ' selected' : ''}${canBuy ? '' : ' cannot-afford'}`;
		row.innerHTML = `<span class="shop-item-icon">${icon}</span>
			<span class="shop-item-name">${name}${g.count ? ` ×${g.count}` : ''}</span>
			<span class="shop-item-price">💰${g.price}</span>`;
		row.addEventListener('click', () => { shopIdx = i; renderShop(); shopBuy(); });
		shopItemsEl.appendChild(row);
	});
}

function shopSelectPrev() {
	if (!shopGoods.length) return;
	shopIdx = (shopIdx - 1 + shopGoods.length) % shopGoods.length;
	renderShop();
}
function shopSelectNext() {
	if (!shopGoods.length) return;
	shopIdx = (shopIdx + 1) % shopGoods.length;
	renderShop();
}

function shopBuy() {
	const g = shopGoods[shopIdx];
	if (!g) return;
	if (player.rupees < g.price) { pulse('ルピーが足りない！', 1500); return; }
	player.rupees -= g.price;
	const meta = ITEM_META[g.id];
	if (g.id === 'bomb') {
		if (!player.subItems.bomb) player.subItems.bomb = { count: 0 };
		player.subItems.bomb.count += g.count ?? 1;
		if (!player.activeSubItem) player.activeSubItem = 'bomb';
	} else if (g.id === 'healPotion' || g.id === 'bigHealPotion') {
		giveSubItem(g.id);
	} else if (g.id === 'boomerang') {
		if (!player.subItems.boomerang) player.subItems.boomerang = { count: Infinity };
		if (!player.activeSubItem) player.activeSubItem = 'boomerang';
	} else {
		giveSubItem(g.id);
	}
	playSound('item');
	pulse(`${meta?.name ?? g.id} を購入した！`, 1500);
	updateHud();
	saveGame();
	renderShop();
}

// ── ダンジョンアイテム（地図・コンパス）取得ユーティリティ ─────
function pickDungeonItem(tile, posKey, ss) {
	if (ss.pickedKeys.has(posKey)) return false;
	ss.pickedKeys.add(posKey);
	if (!player.dungeonItems) player.dungeonItems = {};
	if (!player.dungeonItems[currentLayer]) {
		player.dungeonItems[currentLayer] = { hasMap: false, hasCompass: false };
	}
	if (tile === TILE.ITEM_DUNGEON_MAP) {
		player.dungeonItems[currentLayer].hasMap = true;
		playSound('item'); pulse('🗺 ダンジョンの地図を手に入れた！');
	} else if (tile === TILE.ITEM_COMPASS) {
		player.dungeonItems[currentLayer].hasCompass = true;
		playSound('item'); pulse('🧭 コンパスを手に入れた！');
	}
	updateDungeonHud(currentLayer);
	renderBoard(); renderChars(); updateHud(); saveGame();
	return true;
}

// ── ボス HPバー ───────────────────────────────────────────────
function showBossHpBar(boss) {
	bossHpbarEl.classList.remove('hidden');
	bossNameEl.textContent = ENEMY_META[boss.type]?.name ?? 'ボス';
	updateBossHpBar(boss);
}

function updateBossHpBar(boss) {
	const pct = Math.max(0, boss.hp / boss.maxHp * 100);
	bossHpFillEl.style.width = `${pct}%`;
	// HP が低いほど赤くなる
	if (pct < 25) bossHpFillEl.style.background = 'linear-gradient(90deg,#880000,#cc0000)';
	else if (pct < 50) bossHpFillEl.style.background = 'linear-gradient(90deg,#aa2000,#ee4010)';
	else bossHpFillEl.style.background = 'linear-gradient(90deg,#cc2020,#ff5050)';
}

function hideBossHpBar() {
	bossHpbarEl.classList.add('hidden');
}

// ── ボス多段フェーズ ──────────────────────────────────────────
function checkBossPhase(boss) {
	const meta = ENEMY_META[boss.type];
	if (!meta?.phases) return;
	for (const phase of meta.phases) {
		const ratio = boss.hp / boss.maxHp;
		if (ratio <= phase.hpThreshold && !boss.phasesTriggered?.includes(phase.hpThreshold)) {
			if (!boss.phasesTriggered) boss.phasesTriggered = [];
			boss.phasesTriggered.push(phase.hpThreshold);
			// 速度倍率適用
			if (phase.speedMultiplier) boss.speed = (meta.speed) * phase.speedMultiplier;
			// 攻撃クールダウン倍率適用
			if (phase.attackCooldownMultiplier && boss.attack?.cooldown) {
				boss.attack = { ...boss.attack, cooldown: Math.round(boss.attack.cooldown * phase.attackCooldownMultiplier) };
			}
			// フェーズ変化エフェクト
			const bossEl = document.getElementById(`char-enemy-${boss.id}`);
			if (bossEl) {
				let cnt = 0;
				const t = setInterval(() => {
					bossEl.style.opacity = (cnt % 2 === 0) ? '0.2' : '1';
					if (++cnt >= 8) { clearInterval(t); bossEl.style.opacity = '1'; }
				}, 120);
			}
			pulse(`${meta.name} が 怒り狂った！`, 2500);
		}
	}
}

// ── ボス撃破演出（非同期） ────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function onBossDefeated(boss) {
	// 二重実行防止：同じボスで既に撃破演出が始まっていたらスキップ
	if (_bossDefeating) return;
	_bossDefeating = true;
	stopGameLoop();
	// 1. ボスを点滅
	const bossEl = document.getElementById(`char-enemy-${boss.id}`);
	if (bossEl) {
		for (let i = 0; i < 10; i++) {
			bossEl.style.opacity = (i % 2 === 0) ? '0.15' : '1';
			await sleep(140);
		}
		bossEl.remove();
	}
	// 2. 爆発エフェクト複数
	const br = toTileRow(boss.y), bc = toTileCol(boss.x);
	for (let i = 0; i < 4; i++) {
		showExplosionEffect(br + (Math.random() - 0.5), bc + (Math.random() - 0.5));
		await sleep(200);
	}
	// 3. BGM 停止・SE
	stopBgm();
	playSound('fanfare');
	// 4. 敵リストから除去（renderChars より前に行う）
	getSS(currentLayer, stageKey).defeatedEnemies.add(boss.id);
	enemies = enemies.filter(x => x !== boss);
	// 5. ボス HP バー非表示・ロック解除・ドアウェイ開放
	hideBossHpBar();
	bossRoomLocked = false;
	// DOORWAY_BOSS タイルが存在する場合のみ開放メッセージを表示
	const hasBossDoors = stageData?.tiles?.some(row => row.includes(TILE.DOORWAY_BOSS));
	unlockBossDoors();
	if (hasBossDoors) pulse('🔓 扉が開いた！', 2000);
	// 6. 条件評価
	evaluateConditions(); // ボス撃破後の showConditions（killAll など）を評価
	// 6. トライフォース付与（DARK_LORD のみ：フィールドにカケラを出現させる）
	if (boss.type === TILE.DARK_LORD) {
		spawnTriforcePiece(boss);
		await sleep(600);
		pulse('◭ トライフォースのカケラが 現れた！', 3000);
		// カケラの位置を「取得待ち」として登録
		// ※ 少し待ってから有効化（ボス撃破直後の即時収集を防ぐ）
		pendingTriforcePos = null; // 一旦無効
		const tfx = boss.x, tfy = boss.y;
		setTimeout(() => { pendingTriforcePos = { x: tfx, y: tfy }; }, 1500);
		saveGame();
	} else {
		// BOSS（魔将）など：トライフォースなし、撃破メッセージのみ
		await sleep(400);
		pulse(`${ENEMY_META[boss.type]?.name ?? 'ボス'} を倒した！`, 2500);
		saveGame();
	}
	// ループ再開
	_bossDefeating = false; // 演出完了でフラグをリセット
	startGameLoop();
}

// ボス撃破演出実行中フラグ（二重実行防止）
let _bossDefeating = false;

// トライフォースのカケラをボスの位置に表示（DOM要素への参照を返す）
let _pendingTriforcePieceEl = null;

function spawnTriforcePiece(boss) {
	if (!charLayerEl) return;
	const cellPx = getCellPx();
	const el = document.createElement('div');
	el.id = 'pending-triforce-piece';
	el.style.cssText = `
		position:absolute;
		left:${boss.x * cellPx}px;
		top:${boss.y * cellPx}px;
		width:${cellPx}px; height:${cellPx}px;
		display:flex; align-items:center; justify-content:center;
		font-size:${Math.round(cellPx * 0.65)}px;
		z-index:12; pointer-events:none;
		animation:triforce-pulse 1.5s ease-in-out infinite;
	`;
	el.textContent = '◭';
	charLayerEl.appendChild(el);
	_pendingTriforcePieceEl = el;
}

// ── クリア済みフラグ保存キー ──────────────────────────────────
const CLEARED_KEY = 'blade-of-lumia-cleared';

function hasCleared() {
	return !!localStorage.getItem(CLEARED_KEY);
}

function saveCleared() {
	localStorage.setItem(CLEARED_KEY, '1');
}

// ── エンディング ──────────────────────────────────────────────
async function startEnding() {
	isGameover = true; // ゲーム操作を無効化
	stopGameLoop(); stopBgm();

	// クリア済みフラグを保存
	saveCleared();
	// ゲームのセーブデータは削除
	localStorage.removeItem(SAVE_KEY);

	// エンディングオーバーレイ表示
	endingOverlayEl.classList.remove('hidden');

	// エンディング BGM 再生
	playBgm('ending');

	// ── フェーズ1：スタッフロール ─────────────────────────
	const phase1El = document.getElementById('ending-phase1');
	const phase2El = document.getElementById('ending-phase2');
	phase1El.style.display = '';
	phase2El.classList.add('hidden');

	// スタッフロールHTML生成
	const scrollEl = document.getElementById('ending-scroll');
	scrollEl.innerHTML = buildStaffRollHtml();

	// スタッフロールのアニメーション（40秒）が終わるのを待たずに即フェーズ2へ
	// CSSアニメーションの終了を検知して切り替える
	const scrollEl2 = document.getElementById('ending-scroll');
	await new Promise(r => {
		scrollEl2.addEventListener('animationend', r, { once: true });
	});

	// ── フェーズ2：THE END シーン ─────────────────────────
	phase1El.style.display = 'none';
	phase2El.classList.remove('hidden');

	// 姫・主人公・姫のスプライトをアニメーション付きで表示
	// makeSprite(animated=true) を使うとゲーム内と同じアニメーションが動く
	// spriteクラスのposition:absoluteが邪魔するので除去してインラインで設定
	function placeBigSprite(canvasId, spriteName, palName) {
		const container = document.getElementById(canvasId);
		if (!container) return;
		container.innerHTML = '';
		const cv = makeSprite(spriteName, palName, true);
		if (!cv) return;
		// sprite クラスはそのまま残す（redrawAnimSprites が canvas.sprite[data-sprite] を検索するため）
		// CSS の .ending-big-sprite canvas.sprite でレイアウトを上書き済み
		container.appendChild(cv);
	}

	placeBigSprite('ending-princess1-canvas', 'princess', 'princess');
	placeBigSprite('ending-hero-canvas',      'heroD',    'hero');
	placeBigSprite('ending-princess2-canvas', 'princess', 'princess');

	// エンディングメッセージ
	const msgEl = document.getElementById('ending-msg');
	if (msgEl) {
		msgEl.innerHTML = '魔王を倒し、すべてのトライフォースのカケラを集めた！<br>ルミアの平和は守られた……';
	}
}

/** スタッフロール HTML を生成して返す */
function buildStaffRollHtml() {
	const AUTHOR = 'Go Kojima';
	const roles = [
		'Game Director',
		'Executive Producer',
		'Game Designer',
		'Level Designer',
		'Programmer',
		'Lead Programmer',
		'Character Designer',
		'Pixel Artist',
		'Background Artist',
		'UI/UX Designer',
		'Sound Designer',
		'Music Composer',
		'Story Writer',
		'World Builder',
		'Dungeon Architect',
		'Monster Designer',
		'Lore Creator',
		'QA Lead',
		'Playtester',
	];
	let html = `<div class="scroll-game-title">⚔ Blade of Lumia</div>`;
	html += `<div class="scroll-subtitle">～ ルミアの剣 ～</div>`;
	for (const role of roles) {
		html += `<div class="scroll-role">${role}</div>`;
		html += `<div class="scroll-name">${AUTHOR}</div>`;
		html += `<div class="scroll-divider"></div>`;
	}
	// Special Thanks to は別名で表示
	html += `<div class="scroll-role">Special Thanks to</div>`;
	html += `<div class="scroll-name">Kojima's family</div>`;
	html += `<div class="scroll-divider"></div>`;
	html += `<div class="scroll-thanks">Thank you for playing!</div>`;
	html += `<div class="scroll-copyright">© 2026 ${AUTHOR}</div>`;
	return html;
}

// ── ボス部屋ロック演出（扉が閉まるフラッシュ） ───────────────
function showBossRoomLockEffect() {
	if (!charLayerEl) return;
	// 画面全体を赤く一瞬フラッシュ
	const flash = document.createElement('div');
	flash.style.cssText = `
		position:fixed;
		inset:0;
		background:rgba(180,0,0,0.45);
		pointer-events:none;
		z-index:50;
		animation:flash-anim 0.4s ease-out forwards;
	`;
	document.body.appendChild(flash);
	setTimeout(() => flash.remove(), 420);
}

// ── ボス戦 ────────────────────────────────────────────────────
function startBossBattle(lk, sk) {
	// ボスが既に倒されている（defeatedEnemies に登録済み）なら演出なし
	const ss = getSS(lk, sk);
	const boss = enemies.find(e => ENEMY_META[e.type]?.isBoss);
	if (!boss) {
		// ボス撃破済み → ロック不要
		bossRoomLocked = false;
		return;
	}

	// 入室から少し待って扉閉鎖演出 → ロック
	setTimeout(() => {
		lockBossDoors();              // DOORWAY_BOSS タイルを閉じる
		showBossRoomLockEffect();
		playSound('stageTransition'); // 扉が閉まる音（暫定）
		bossRoomLocked = true;
		pulse('⚠ 扉が閉じた！ボスを倒さないと出られない！', 3000);

		// さらに少し待ってBGMとHPバー表示
		setTimeout(() => {
			const ld = mapData.layers[lk];
			const bossBgm = ld?.bossBgm ?? 'boss';
			playBgm(bossBgm);
			showBossHpBar(boss);
			pulse(`${ENEMY_META[boss.type].name} が 現れた！`, 2500);
		}, 800);
	}, 400);
}

// ── リアルタイムループ ────────────────────────────────────────
function startGameLoop() {
	if (gameTimer) clearInterval(gameTimer);
	gameTimer = setInterval(gameTick, TICK_MS);
}
function stopGameLoop() {
	if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
}

function gameTick() {
	if (isPaused || isDialog || isGameover || isTransitioning) return;
	processHeldKeys();   // 押しっぱなしキーで毎tick移動
	enemyTick();
	projectileTick();
	bombTick();
	checkEnemyContact();
	checkPendingTriforce(); // 魔王撃破後のトライフォース収集チェック
	redrawAnimSprites();
}

// ── 魔王撃破後トライフォース収集チェック ─────────────────────
// プレイヤーがカケラに近づいたら収集 → エンディングチェック
let _collectingTriforce = false; // 二重収集防止フラグ

function checkPendingTriforce() {
	if (!pendingTriforcePos || _collectingTriforce) return;
	const dist = Math.sqrt(
		(player.x - pendingTriforcePos.x) ** 2 +
		(player.y - pendingTriforcePos.y) ** 2,
	);
	if (dist > 1.0) return; // まだ遠い

	// 二重収集を防ぐ
	_collectingTriforce = true;
	pendingTriforcePos = null;

	// DOM 要素を消す
	if (_pendingTriforcePieceEl) {
		_pendingTriforcePieceEl.remove();
		_pendingTriforcePieceEl = null;
	}
	document.getElementById('pending-triforce-piece')?.remove();

	player.triforceCount++;
	console.log(`[TRIFORCE] checkPendingTriforce: collected, triforceCount=${player.triforceCount}`, new Error().stack);
	playSound('item');
	pulse('◭ トライフォースのカケラを 手に入れた！', 4000);
	updateHud();
	saveGame();

	// フラグを解除（次の pendingTriforce のために）
	_collectingTriforce = false;

	// 全カケラ収集チェック
	checkTriforceClear();
}

// ── トライフォース全収集チェック ──────────────────────────────
// マップ全体の ITEM_TRIFORCE_PIECE 数 + DARK_LORD 数 = 全カケラ数
// プレイヤーのtriforceCountが全カケラ数に達したらエンディング
function calcTotalTriforces() {
	if (!mapData) return 0;
	let total = 0;
	for (const ld of Object.values(mapData.layers ?? {})) {
		for (const sd of Object.values(ld.stages ?? {})) {
			for (const row of sd.tiles ?? []) {
				for (const tile of row) {
					if (tile === TILE.ITEM_TRIFORCE_PIECE) total++;
					if (tile === TILE.DARK_LORD) total++; // 魔王撃破後に出現
				}
			}
		}
	}
	return total;
}

function checkTriforceClear() {
	const total = calcTotalTriforces();
	if (total <= 0) return;
	if (player.triforceCount >= total) {
		stopGameLoop();
		setTimeout(() => startEnding(), 2500);
	}
}

// ── 敵 AI ────────────────────────────────────────────────────
function enemyTick() {
	for (const e of enemies) {
		const meta = ENEMY_META[e.type];
		if (!meta) continue;
		if (meta.hitAndAway) {
			bossTickHitAndAway(e, meta);
		} else {
			enemyChase(e, meta.speed);
		}
		enemyAttack(e, meta);
	}
}

// ── ヒット＆アウェイ AI ───────────────────────────────────────
function pickApproachMode(e) {
	const meta = e.type ? ENEMY_META[e.type] : null;
	// attacks[] に stone がある敵だけ strafe を選択肢に入れる
	const hasStone = meta?.attacks?.some(a => a.type === 'stone');
	// meta.initialModeWeights が定義されていればそれをデフォルト重みとして使う
	const defaultWeights = meta?.initialModeWeights ?? (hasStone
		? { flank: 0.8, direct: 0.6, wander: 1.0, strafe: 1.2 }
		: { flank: 1.0, direct: 1.0, wander: 1.0, strafe: 0 });
	const w = e._modeWeights ?? defaultWeights;
	const total = (w.flank ?? 0) + (w.direct ?? 0) + (w.wander ?? 0) + (w.strafe ?? 0);
	let r = Math.random() * total;
	if ((r -= (w.flank  ?? 0)) <= 0) return 'flank';
	if ((r -= (w.direct ?? 0)) <= 0) return 'direct';
	if ((r -= (w.strafe ?? 0)) <= 0) return 'strafe';
	return 'wander';
}

function bossTickHitAndAway(e, meta) {
	const now = Date.now();
	if (!e._haPhase) {
		e._haPhase = 'approach';
		e._haTimer = now + 2500 + Math.random() * 1500;
		// モード重みを初期化（初回のみ）
		// meta.initialModeWeights が定義されていればそれを初期値として使う
		if (!e._modeWeights) {
			const meta2 = e.type ? ENEMY_META[e.type] : null;
			e._modeWeights = meta2?.initialModeWeights
				? { ...meta2.initialModeWeights }
				: { flank: 1.0, direct: 1.0, wander: 1.0 };
		}
		// approach 開始時に重みを使ってモードを決定
		// flank=背後回り込み / direct=直接突進 / wander=ランダム大移動（ループ脱出）
		e._approachMode = pickApproachMode(e);
		if (e._approachMode === 'wander') {
			// wander: マップ内のランダム位置を目標にセット
			e._wanderX = 1 + Math.random() * ((stageData?.cols ?? 12) - 2);
			e._wanderY = 1 + Math.random() * ((stageData?.rows ?? 10) - 2);
		}
		if (debugMode) console.log(`[AI] ${e.id} approach start mode=${e._approachMode}`);
	}
	const dx = player.x - e.x;
	const dy = player.y - e.y;

	// 向きを常にプレイヤー方向に更新（条件なし・毎tick）
	{
		const newDir = Math.abs(dy) >= Math.abs(dx)
			? (dy > 0 ? 'down' : 'up')
			: (dx > 0 ? 'right' : 'left');
		if (e.dir !== newDir) {
			e.dir = newDir;
			// 方向別スプライト名に切り替える
			// escape → escapeD/escapeR/escapeU（左向きはescapeRをflipX）
			// darklord → darklordD/darklordR/darklordU
			const baseName = ENEMY_META[e.type]?.sprite ?? e.sprite;
			// baseName の末尾にすでに方向文字がある場合は除去してbaseを取得
			const base = baseName.replace(/[DRLU]$/, '');// 大文字方向文字のみ除去;
			const dirSuffix = { down:'D', right:'R', left:'R', up:'U' }[newDir] ?? 'D';
			e.sprite = `${base}${dirSuffix}`;
			e.flipX  = (newDir === 'left');  // 左向きは右向きスプライトをflip
			const el = document.getElementById(`char-enemy-${e.id}`);
			if (el) {
				const oldCv = el.querySelector('canvas.sprite');
				if (oldCv) oldCv.remove();
				const cv = makeSprite(e.sprite, e.pal, true, e.flipX);
				if (cv) el.insertBefore(cv, el.firstChild);
			}
		}
	}
	if (e._haPhase === 'approach') {
		if (now >= e._haTimer) {
			e._haPhase = 'retreat';
			e._haTimer = now + 800 + Math.random() * 600;
			// retreat 終了後の次 approach でランダムにモード再選択
			e._approachMode = null;
		} else {
			// _approachMode: 'direct' = 単純突進、'flank' = 背後回り込み
			const mode = e._approachMode ?? 'direct';

			let tdx, tdy;

			if (mode === 'wander') {
				// ── ワンダーモード：ランダム目標位置へ大きく移動（ループ脱出） ──
				const wx = (e._wanderX ?? player.x) - e.x;
				const wy = (e._wanderY ?? player.y) - e.y;
				const wDist = Math.sqrt(wx*wx + wy*wy);
				if (wDist < 1.0) {
					// 目標到達 → direct に切り替え
					e._approachMode = 'direct';
					tdx = dx; tdy = dy;
				} else {
					tdx = wx; tdy = wy;
				}
				if (debugMode) {
					e._dbgTick = (e._dbgTick ?? 0) + 1;
					if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} WANDER pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → wander=(${(e._wanderX??0).toFixed(1)},${(e._wanderY??0).toFixed(1)}) dist=${wDist.toFixed(1)}`);
				}
			} else if (mode === 'strafe') {
				// ── ストレイフモード：盾でブロックされない角度から移動しながら石投げ ──
				// 目標：プレーヤーから見て斜め70°相当の方向（横成分大・縦成分小）
				// 盾ブロック判定は純粋な上下左右のみ有効。
				// 横に大きく外れた方向から来る石は確実にブロックされない。
				// 目標到達後も止まらず同じ方向に移動し続けながら石を投げる。
				if (e._strafeTargetX == null || !e._strafeBasePlayerX
					|| Math.abs(player.x - e._strafeBasePlayerX) > 2.5
					|| Math.abs(player.y - e._strafeBasePlayerY) > 2.5) {
					const STRAFE_DIST = 4.0 + Math.random() * 2.0; // 4〜6 セル
					const stageW = stageData?.cols ?? 12;
					const stageH = stageData?.rows ?? 10;
					// 約70°の角度：横(cos70°≈0.34)より縦(sin70°≈0.94)のほうが大きい
					// → 横に大きくずれた位置 = 縦比が大きい方向
					// heroDir が right/left → 敵は上か下に 0.94 ずれ、左右に 0.34 ずれ
					// heroDir が up/down → 敵は左か右に 0.94 ずれ、上下に 0.34 ずれ
					const heroFwd = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[heroDir] ?? [0,1];
					const sideA = [-heroFwd[1],  heroFwd[0]]; // 90° CCW（左側）
					const sideB = [ heroFwd[1], -heroFwd[0]]; // 90° CW（右側）
					const chosenSide = Math.random() < 0.5 ? sideA : sideB;
					// 縦(側面方向)に大きく、横(前後)に少しずれた位置
					const tx = player.x + chosenSide[0] * STRAFE_DIST * 0.94 + heroFwd[0] * STRAFE_DIST * 0.34 * (Math.random() < 0.5 ? 1 : -1);
					const ty = player.y + chosenSide[1] * STRAFE_DIST * 0.94 + heroFwd[1] * STRAFE_DIST * 0.34 * (Math.random() < 0.5 ? 1 : -1);
					e._strafeTargetX = Math.max(1, Math.min(stageW - 2, tx));
					e._strafeTargetY = Math.max(1, Math.min(stageH - 2, ty));
					// 移動方向ベクトルを保存（目標到達後も同方向に進み続ける）
					const dirLen = Math.sqrt(chosenSide[0]**2 + chosenSide[1]**2) || 1;
					e._strafeDirX = chosenSide[0] / dirLen;
					e._strafeDirY = chosenSide[1] / dirLen;
					e._strafeBasePlayerX = player.x;
					e._strafeBasePlayerY = player.y;
					if (debugMode) console.log(`[AI] ${e.id} STRAFE target=(${e._strafeTargetX.toFixed(1)},${e._strafeTargetY.toFixed(1)}) dist=${STRAFE_DIST.toFixed(1)}`);
				}
				const stx = e._strafeTargetX;
				const sty = e._strafeTargetY;
				const toStrafeDist = Math.sqrt((stx-e.x)**2 + (sty-e.y)**2);
				if (toStrafeDist < 1.5) {
					// 目標到達 → 同方向に移動し続けながら石を投げる（enemyAttack が石投げを処理）
					// 同じサイド方向に進み続け、角度をさらに深める
					tdx = e._strafeDirX ?? (stx - e.x);
					tdy = e._strafeDirY ?? (sty - e.y);
					if (debugMode) {
						e._dbgTick = (e._dbgTick ?? 0) + 1;
						if (e._dbgTick % 8 === 0) console.log(`[AI] ${e.id} STRAFE continuing dir=(${tdx.toFixed(2)},${tdy.toFixed(2)}) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)})`);
					}
				} else {
					tdx = stx - e.x; tdy = sty - e.y;
					if (debugMode) {
						e._dbgTick = (e._dbgTick ?? 0) + 1;
						if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} STRAFE moving pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → target=(${stx.toFixed(1)},${sty.toFixed(1)}) dist=${toStrafeDist.toFixed(1)}`);
					}
				}
			} else if (mode === 'direct') {
				// ── 直接突進モード：単純にプレイヤーに向かう ──────
				tdx = dx; tdy = dy;
				if (debugMode) {
					e._dbgTick = (e._dbgTick ?? 0) + 1;
					if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} DIRECT pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → player=(${player.x.toFixed(1)},${player.y.toFixed(1)}) dist=${Math.sqrt(dx*dx+dy*dy).toFixed(1)}`);
				}
			} else {
				// ── 背後回り込みモード（flank） ───────────────────
				// 戦略：
				//   1. プレイヤーの左右 or 上下のどちらかに「固定目標」を設定する
				//   2. 固定目標に到達したら直接プレイヤーへ突進
				//   3. 固定目標は approach 開始時に一度だけ計算 → 毎 tick 変わらないので振動しない
				//   4. プレイヤーが大きく移動したら（2セル以上）目標を再計算する

				const heroFwd = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[heroDir] ?? [0,1];
				// プレイヤー背後 1.5 セル先
				const backX = player.x - heroFwd[0] * 1.5;
				const backY = player.y - heroFwd[1] * 1.5;

				// 固定目標を計算・保持（_flankTargetX/Y）
				// 「プレイヤー基準の目標」と「プレイヤーの位置」を別々に保存しておき、
				// プレイヤーが 2 セル以上動いたら再計算する
				const playerMoved = !e._flankBasePlayerX
					|| Math.abs(player.x - e._flankBasePlayerX) > 2.0
					|| Math.abs(player.y - e._flankBasePlayerY) > 2.0;

				if (e._flankTargetX == null || playerMoved) {
					// 目標を再計算：背後・左側面・右側面の3候補から選択する
					// heroFwd の垂直方向がサイド（90度回転）
					const sideA = [-heroFwd[1],  heroFwd[0]]; // 90° CCW
					const sideB = [ heroFwd[1], -heroFwd[0]]; // 90° CW
					const BACK_DIST = 1.5;
					const SIDE_DIST = 3.0 + Math.random() * 1.5; // 3〜4.5 セル
					const stageW = stageData?.cols ?? 12;
					const stageH = stageData?.rows ?? 10;
					// 3候補：背後・左側面・右側面
					const candidates3 = [
						// 背後（プレーヤーが向いている反対側）
						{ x: player.x - heroFwd[0] * BACK_DIST, y: player.y - heroFwd[1] * BACK_DIST },
						// 左側面（heroFwd の 90° 回転）
						{ x: player.x + sideA[0] * SIDE_DIST, y: player.y + sideA[1] * SIDE_DIST },
						// 右側面（heroFwd の -90° 回転）
						{ x: player.x + sideB[0] * SIDE_DIST, y: player.y + sideB[1] * SIDE_DIST },
					];
					// マップ内にクランプして通行可能な候補をフィルタ（マップ端よりは手前に制限）
					const validCandidates = candidates3.map(p => ({
						x: Math.max(1, Math.min(stageW - 2, p.x)),
						y: Math.max(1, Math.min(stageH - 2, p.y)),
					}));
					// ランダムに選択（全候補が等確率）
					const chosen = validCandidates[Math.floor(Math.random() * validCandidates.length)];
					e._flankTargetX = chosen.x;
					e._flankTargetY = chosen.y;
					e._flankBasePlayerX = player.x;
					e._flankBasePlayerY = player.y;
					e._flankDodgeDist = null; // リセット
					if (debugMode) {
						const which = ['back','sideA','sideB'];
						const idx = validCandidates.indexOf(chosen);
						console.log(`[AI] ${e.id} FLANK target=(${e._flankTargetX.toFixed(1)},${e._flankTargetY.toFixed(1)}) type=${which[idx] ?? '?'} reason=${playerMoved?'playerMoved':'init'}`);
					}
				}

				const ftx = e._flankTargetX;
				const fty = e._flankTargetY;
				const toTargetDist = Math.sqrt((ftx-e.x)**2 + (fty-e.y)**2);
				const toBkDist = Math.sqrt((backX-e.x)**2 + (backY-e.y)**2);

				const _prevFlankStep = e._flankStep ?? 'to_target';
				if (toBkDist < 1.0) {
					// 背後に到達 → 突進
					tdx = dx; tdy = dy;
					if (e._flankStep !== 'charge') {
						if (debugMode) console.log(`[AI] ${e.id} FLANK→charge (back reached) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
						e._flankStep = 'charge';
					}
					e._flankTargetX = null; // 次回のためにリセット
				} else if (toTargetDist < 0.8) {
					// 固定目標に到達 → 背後へ向かう
					tdx = backX - e.x; tdy = backY - e.y;
					if (e._flankStep !== 'to_back') {
						if (debugMode) console.log(`[AI] ${e.id} FLANK→to_back (target reached) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) back=(${backX.toFixed(1)},${backY.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
						e._flankStep = 'to_back';
					}
				} else {
					// 固定目標へ向かう
					tdx = ftx - e.x; tdy = fty - e.y;
					if (e._flankStep !== 'to_target') {
						if (debugMode) console.log(`[AI] ${e.id} FLANK→to_target pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) target=(${ftx.toFixed(1)},${fty.toFixed(1)}) dist=${toTargetDist.toFixed(1)}`);
						e._flankStep = 'to_target';
					}
				}

				if (debugMode) {
					e._dbgTick = (e._dbgTick ?? 0) + 1;
					if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} FLANK step=${e._flankStep} pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) target=(${ftx?.toFixed(1)},${fty?.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
				}
			}

			e.accum = (e.accum ?? 0) + meta.speed;
			if (e.accum >= 1.0) {
				e.accum -= 1.0;
				const step = MOVE_STEP;
				const candidates = [];
				// 移動候補の優先順位：
				//   1. 主軸方向（目標に向かう方向）
				//   2. 副軸方向（垂直に横切る ±）
				//   3. 逆方向（主軸の逆）← 最終手段。袋小路脱出用。振動を避けるため最後に置く
				if (Math.abs(tdy) >= Math.abs(tdx)) {
					if (tdy !== 0) candidates.push([Math.sign(tdy)*step, 0]);
					if (tdx !== 0) { candidates.push([0, Math.sign(tdx)*step]); candidates.push([0, -Math.sign(tdx)*step]); }
					else           { candidates.push([0, step]); candidates.push([0, -step]); }
					if (tdy !== 0) candidates.push([-Math.sign(tdy)*step, 0]); // 逆方向（最終手段）
				} else {
					if (tdx !== 0) candidates.push([0, Math.sign(tdx)*step]);
					if (tdy !== 0) { candidates.push([Math.sign(tdy)*step, 0]); candidates.push([-Math.sign(tdy)*step, 0]); }
					else           { candidates.push([step, 0]); candidates.push([-step, 0]); }
					if (tdx !== 0) candidates.push([0, -Math.sign(tdx)*step]); // 逆方向（最終手段）
				}
				const prevX = e.x, prevY = e.y;
				for (const [my, mx] of candidates) {
					if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
						e.y += my; e.x += mx; break;
					}
				}
				// スタック検知：位置が変わらなかった tick をカウント
				if (e.x === prevX && e.y === prevY) {
					e._stuckTick = (e._stuckTick ?? 0) + 1;
					if (e._stuckTick >= 3) {
						// 3tick動けない → ランダム方向に脱出を試みる
						e._stuckTick = 0;
						const escapes = [[step,0],[-step,0],[0,step],[0,-step]];
						for (const [my,mx] of escapes.sort(()=>Math.random()-0.5)) {
							if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
								e.y += my; e.x += mx; break;
							}
						}
					}
					e._directChargeTick = (e._directChargeTick ?? 0) + 1;
					// 8tick経っても届けない → 背後狙いをあきらめて直接突進モードへ
					if (e._directChargeTick >= 8) {
						e._directChargeTick = 0;
						// タイマーを即終了させて retreat → 再 approach サイクルに移行
						//（直接プレイヤーへ向かい、次 tick の enemyAttack で攻撃可能になる）
						e._haPhase = 'retreat';
						e._haTimer = now + 400 + Math.random() * 200;
					}
				} else {
					e._stuckTick = 0;
					e._directChargeTick = 0;
				}
				moveCharEl(`enemy-${e.id}`, e.x, e.y);
			}
		}
	} else {
		if (now >= e._haTimer) {
			// ── approach 終了時の成功/失敗評価と重み更新 ───────────
			{
				if (!e._modeWeights) e._modeWeights = { flank: 1.0, direct: 1.0, wander: 1.0 };
				const atk = ENEMY_META[e.type]?.attack;
				const range = atk?.range ?? 1.5;
				const distNow = Math.sqrt(dx*dx + dy*dy);
				const succeeded = (e._approachMode === 'direct' || e._approachMode === 'flank')
					&& distNow <= range + 1.0;

				const mode = e._approachMode;
				if (mode === 'flank' || mode === 'direct') {
					if (succeeded) {
						e._modeWeights[mode] = Math.min(2.0, e._modeWeights[mode] * 1.5);
					} else {
						e._modeWeights[mode] = Math.max(0.2, e._modeWeights[mode] * 0.5);
					}
				}
				// wander が選ばれた後は重みをリセット（新鮮な挑戦）
				if (mode === 'wander') {
					e._modeWeights = { flank: 1.0, direct: 1.0, wander: 1.0 };
				}
			}

			e._haPhase = 'approach';
			e._haTimer = now + 2000 + Math.random() * 1000;
			// retreat → approach 切り替え時に重みを使ってモード再選択（wander含む）
			{
				e._approachMode = pickApproachMode(e);
				if (e._approachMode === 'wander') {
					e._wanderX = 1 + Math.random() * ((stageData?.cols ?? 12) - 2);
					e._wanderY = 1 + Math.random() * ((stageData?.rows ?? 10) - 2);
				}
				e._dbgTick = 0;
				if (debugMode) {
					const w = e._modeWeights;
					const total = w.flank + w.direct + w.wander;
					console.log(
						`[AI] ${e.id} retreat→approach mode=${e._approachMode}` +
						` weights=F${(w.flank/total*100).toFixed(0)}%` +
						`/D${(w.direct/total*100).toFixed(0)}%` +
						`/W${(w.wander/total*100).toFixed(0)}%` +
						(e._approachMode === 'wander' ? ` wander=(${e._wanderX?.toFixed(1)},${e._wanderY?.toFixed(1)})` : '')
					);
				}
			}
		} else {
			// retreat：プレイヤーから 3 セル以上離れたら早期終了（離れすぎ防止）
			const retreatDist = Math.sqrt(dx*dx + dy*dy);
			if (retreatDist >= 3.0) {
				// 十分離れた → 即 approach へ
				e._haPhase = 'approach';
				e._haTimer = now + 500 + Math.random() * 500;
				e._approachMode = pickApproachMode(e);
				if (e._approachMode === 'wander') {
					e._wanderX = 1 + Math.random() * ((stageData?.cols ?? 12) - 2);
					e._wanderY = 1 + Math.random() * ((stageData?.rows ?? 10) - 2);
				}
				e._dbgTick = 0;
				if (debugMode) {
					const w = e._modeWeights ?? { flank:1, direct:1, wander:1 };
					const total = w.flank + w.direct + w.wander;
					console.log(
						`[AI] ${e.id} retreat→approach (dist limit) mode=${e._approachMode}` +
						` dist=${retreatDist.toFixed(1)}` +
						` weights=F${(w.flank/total*100).toFixed(0)}%/D${(w.direct/total*100).toFixed(0)}%/W${(w.wander/total*100).toFixed(0)}%` +
						(e._approachMode === 'wander' ? ` wander=(${e._wanderX?.toFixed(1)},${e._wanderY?.toFixed(1)})` : '')
					);
				}
			} else {
				const rdx = -Math.sign(dx), rdy = -Math.sign(dy);
				const step = MOVE_STEP;
				const cands = Math.abs(dy) >= Math.abs(dx)
					? [[rdy*step,0],[0,rdx*step]] : [[0,rdx*step],[rdy*step,0]];
				e.accum = (e.accum ?? 0) + meta.speed;
				if (e.accum >= 1.0) {
					e.accum -= 1.0;
					for (const [my,mx] of cands) {
						if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
							e.y += my; e.x += mx; break;
						}
					}
					moveCharEl(`enemy-${e.id}`, e.x, e.y);
				}
			}
		}
	}
}

// 敵の攻撃処理（spear/stone/sword）
// meta.attacks[] 配列があれば複数攻撃を個別cooldownで管理する
function enemyAttack(e, meta) {
	// attacks[] 配列対応：各攻撃を独立したクールダウンで処理
	const attackList = meta.attacks ?? (meta.attack ? [meta.attack] : []);
	if (attackList.length === 0) return;

	const now = Date.now();
	if (!e._attackTimes) e._attackTimes = {};

	const dx = player.x - e.x;
	const dy = player.y - e.y;
	const dist = Math.sqrt(dx * dx + dy * dy);

	for (let i = 0; i < attackList.length; i++) {
		const atk = attackList[i];
		if (!atk || atk.type === 'charge') continue;

		// 個別クールダウンチェック
		const lastTime = e._attackTimes[i] ?? 0;
		const cooldown = atk.cooldown ?? 3000;
		if (now - lastTime < cooldown) continue;

		// 射程チェック
		if (dist > (atk.range ?? 5)) continue;

		if (atk.type === 'spear') {
			// やり投げ：同列か同行のときのみ発射
			const sameCol = Math.abs(dx) < 1.0;
			const sameRow = Math.abs(dy) < 1.0;
			if (!sameCol && !sameRow) continue;
			const ndx = sameCol ? 0 : Math.sign(dx);
			const ndy = sameRow ? 0 : Math.sign(dy);
			fireEnemyProjectile(e, 'spear', ndx, ndy, atk.projectileSpeed ?? 1.5);
			e._attackTimes[i] = now;
		} else if (atk.type === 'stone') {
			// 石つぶて：プレイヤーに向かって直線発射
			const ndx = dx / dist;
			const ndy = dy / dist;
			fireEnemyProjectile(e, 'stone', ndx, ndy, atk.projectileSpeed ?? 1.0);
			e._attackTimes[i] = now;
		} else if (atk.type === 'sword') {
			// 剣振り：射程内 + 横幅チェックでダメージ
			const range = atk.range ?? 1.5;
			if (dist <= range) {
				const rawDx = player.x - e.x, rawDy = player.y - e.y;
				const absDx = Math.abs(rawDx), absDy = Math.abs(rawDy);
				let ux, uy;
				if (absDy >= absDx) { ux = 0; uy = (rawDy > 0 ? 1 : -1); }
				else                { ux = (rawDx > 0 ? 1 : -1); uy = 0; }
				const projDist = Math.abs(rawDx * ux + rawDy * uy);
				const perpDist = Math.abs(rawDx * (-uy) + rawDy * ux);
				if (projDist <= range && perpDist <= 0.8) {
					let sdx = rawDx, sdy = rawDy;
					if (absDx < 0.01 && absDy < 0.01) {
						const dv = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[e.dir] ?? [0,1];
						sdx = dv[0]; sdy = dv[1];
					}
					const blocked = player.shield && isShieldBlockingDir(sdx, sdy);
					if (blocked) {
						playSound('shieldBlock');
						showShieldBlockEffect(e.x, e.y);
						// 盾ブロック → 現在の approach モードの重みを下げる（学習）
						if (meta.hitAndAway && e._modeWeights && e._approachMode) {
							const m = e._approachMode;
							if (m === 'direct' || m === 'flank') {
								e._modeWeights[m] = Math.max(0.1, e._modeWeights[m] * 0.6);
								if (debugMode) {
									const w = e._modeWeights;
									const total = w.flank + w.direct + w.wander;
									console.log(`[AI] ${e.id} shield-blocked mode=${m} → weights=F${(w.flank/total*100).toFixed(0)}%/D${(w.direct/total*100).toFixed(0)}%/W${(w.wander/total*100).toFixed(0)}%`);
								}
							}
						}
					} else {
						takeDamage(meta.atk);
					}
					showEnemySwordSlash(e);
					e._attackTimes[i] = now;
					// 攻撃後即 retreat（hitAndAway のボス系のみ）
					if (meta.hitAndAway && e._haPhase === 'approach') {
						e._haPhase = 'retreat';
						e._haTimer = now + 600 + Math.random() * 400;
						break; // 同 tick で複数攻撃しない
					}
				}
			}
		}
	}
}

function fireEnemyProjectile(e, type, ndx, ndy, speed) {
	const proj = {
		id:     nextProjId++,
		owner:  'enemy',
		type,
		x: e.x + ndx * 0.8, // 敵の少し前から発射
		y: e.y + ndy * 0.8,
		dx: ndx, dy: ndy,
		speed,
		atk: ENEMY_META[e.type]?.atk ?? 2,
	};
	projectiles.push(proj);
	createProjEl(proj);
}

function enemyChase(e, speed) {
	e.accum = (e.accum ?? 0) + speed;
	if (e.accum < 1.0) return;
	e.accum -= 1.0;

	const dy = player.y - e.y;
	const dx = player.x - e.x;
	const dist = Math.sqrt(dy * dy + dx * dx);
	if (dist < 0.01) return;

	// 方向を正規化して MOVE_STEP 分だけ動く
	const step = MOVE_STEP;
	const candidates = [];
	if (Math.abs(dy) >= Math.abs(dx)) {
		candidates.push([Math.sign(dy) * step, 0]);
		candidates.push([0, Math.sign(dx) * step]);
	} else {
		candidates.push([0, Math.sign(dx) * step]);
		candidates.push([Math.sign(dy) * step, 0]);
	}

	for (const [my, mx] of candidates) {
		const ny = e.y + my;
		const nx = e.x + mx;
		if (isPassableForEnemy(ny, nx, e)) {
			e.y = ny; e.x = nx;
			break;
		}
	}

	// 方向更新
	if (Math.abs(dy) >= Math.abs(dx)) e.dir = dy > 0 ? 'down' : 'up';
	else e.dir = dx > 0 ? 'right' : 'left';

	moveCharEl(`enemy-${e.id}`, e.x, e.y);
}

function checkEnemyContact() {
	for (const e of enemies) {
		// 体当たり攻撃：float距離で判定
		// 敵はプレイヤーと同タイルに入れないため実距離は 0.4〜1.5 程度
		// 0.9 セル以内ならダメージ（隣接タイルに敵がいる状態に相当）
		if (Math.abs(e.x - player.x) < 0.9 && Math.abs(e.y - player.y) < 0.9) {
			takeDamage(ENEMY_META[e.type]?.atk ?? 1);
		}
	}
}

// ── 投擲物（プロジェクタイル）管理 ───────────────────────────
// { id, owner:'player'|'enemy', type:'boomerang'|'spear'|'stone',
//   x, y, dx, dy, speed, atk, returning, maxRange, startX, startY, el }
let projectiles = [];
let nextProjId  = 1;

function projectileTick() {
	for (const proj of [...projectiles]) {
		const step = proj.speed * MOVE_STEP;

		if (proj.type === 'boomerang' && proj.owner === 'player') {
			boomerangStep(proj, step);
		} else {
			// 直線飛翔（spear / stone など）
			proj.x += proj.dx * step;
			proj.y += proj.dy * step;
			if (!isInBounds(proj.x, proj.y)) {
				removeProjEl(proj);
				projectiles = projectiles.filter(p => p !== proj);
				continue;
			}
			// 壁衝突で消滅
			if (!isTilePassableForProj(toTileRow(proj.y), toTileCol(proj.x))) {
				removeProjEl(proj);
				projectiles = projectiles.filter(p => p !== proj);
				continue;
			}
			// プレイヤー or 敵への当たり判定
			checkProjHit(proj);
			// checkProjHit で消滅済みなら moveProjEl しない
			if (!projectiles.includes(proj)) continue;
		}
		moveProjEl(proj);
	}
}

function boomerangStep(proj, step) {
	const dist = Math.sqrt(
		(proj.x - proj.startX) ** 2 + (proj.y - proj.startY) ** 2,
	);

	if (!proj.returning) {
		// 往路：前進
		proj.x += proj.dx * step;
		proj.y += proj.dy * step;

		// 壁 or 最大射程で折り返し
		const hitWall = !isInBounds(proj.x, proj.y) ||
			!isTilePassableForProj(toTileRow(proj.y), toTileCol(proj.x));
		if (hitWall || dist >= proj.maxRange) {
			proj.returning = true;
		}
		// 敵への当たり判定（往路）
		checkProjHit(proj);
	} else {
		// 復路：プレイヤーへ向かう
		const tdx = player.x - proj.x;
		const tdy = player.y - proj.y;
		const d   = Math.sqrt(tdx * tdx + tdy * tdy);
		if (d < step + 0.3) {
			// キャッチ：ブーメランを手元に戻す
			removeProjEl(proj);
			projectiles = projectiles.filter(p => p !== proj);
			// uses が Infinity なら再使用可（消費なし）
			playSound('item'); pulse('🪃 ブーメランをキャッチした！');
			return;
		}
		proj.x += (tdx / d) * step;
		proj.y += (tdy / d) * step;
	}
}

function checkProjHit(proj) {
	if (proj.owner === 'player') {
		// 敵に当たる
		for (const e of [...enemies]) {
			if (Math.abs(e.x - proj.x) < 0.6 && Math.abs(e.y - proj.y) < 0.6) {
				dealDamageToEnemy(e, proj.atk);
				if (proj.type !== 'boomerang') {
					removeProjEl(proj);
					projectiles = projectiles.filter(p => p !== proj);
				} else {
					proj.returning = true; // 当たったら折り返す
				}
				return;
			}
		}
	} else {
		// プレイヤーに当たる
		if (Math.abs(player.x - proj.x) < 0.5 && Math.abs(player.y - proj.y) < 0.5) {
			// 盾でブロック判定
			// 盾を持っていて、やりが来る向きに正面を向いていれば完全ブロック（Shiftキー不要）
			const blocked = player.shield && isShieldBlocking(proj);
			if (blocked) {
				playSound('shieldBlock');
				showShieldBlockEffect(proj.x, proj.y);  // 投擲物が消えた位置（盾に当たった場所）
			} else {
				takeDamage(proj.atk);
			}
			removeProjEl(proj);
			projectiles = projectiles.filter(p => p !== proj);
		}
	}
}

// 盾で投擲物をブロックできるか判定（ボタン操作不要・初代ゼルダ方式）
// 飛翔方向の「逆向き」にプレイヤーが向いていれば正面でブロック
// 座標系：y増加 = 下方向
//   proj.dx > 0 → 右へ飛ぶ（＝左から来る）→ 左向きならブロック
//   proj.dx < 0 → 左へ飛ぶ（＝右から来る）→ 右向きならブロック
//   proj.dy > 0 → 下へ飛ぶ（＝上から来る）→ 上向きならブロック
//   proj.dy < 0 → 上へ飛ぶ（＝下から来る）→ 下向きならブロック
function isShieldBlocking(proj) {
	return isShieldBlockingDir(proj.dx, proj.dy);
}

// dx/dy（攻撃の飛んでくる方向）に対して盾でブロックできるか判定
// 例：敵が左にいてプレイヤーの方向に来る（dx>0）→ プレイヤーが左向きならブロック
function isShieldBlockingDir(dx, dy) {
	if (!player.shield) return false;
	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);

	if (absDx >= absDy) {
		if (dx > 0 && heroDir === 'left')  return true;
		if (dx < 0 && heroDir === 'right') return true;
	} else {
		if (dy > 0 && heroDir === 'up')   return true;
		if (dy < 0 && heroDir === 'down') return true;
	}
	return false;
}

// 盾ブロックエフェクト：盾のある側（heroDir 方向）の端にフラッシュを表示
function showShieldBlockEffect(_px, _py) {
	if (!charLayerEl) return;
	const cellPx = getCellPx();

	// プレーヤー中心を起点に、向いている方向へ 0.6 セルずらす
	const offset = 0.6;
	const cx = player.x + 0.5;
	const cy = player.y + 0.5;
	let fx = cx, fy = cy;
	if (heroDir === 'left')  fx = cx - offset;
	else if (heroDir === 'right') fx = cx + offset;
	else if (heroDir === 'up')    fy = cy - offset;
	else if (heroDir === 'down')  fy = cy + offset;

	const el = document.createElement('div');
	el.style.cssText = `
		position:absolute;
		left:${fx * cellPx}px;
		top:${fy * cellPx}px;
		width:0; height:0;
		transform:translate(-50%,-50%);
		z-index:25;
		pointer-events:none;
		font-size:${Math.round(cellPx * 0.7)}px;
		line-height:1;
		animation:shield-block-anim 0.35s ease-out forwards;
	`;
	el.textContent = '✦';
	charLayerEl.appendChild(el);
	setTimeout(() => el.remove(), 380);
}

function isInBounds(x, y) {
	if (!stageData) return false;
	return x >= 0 && x < stageData.cols && y >= 0 && y < stageData.rows;
}

function isTilePassableForProj(r, c) {
	const tile = stageData?.tiles[r]?.[c];
	if (!tile) return false;
	if (tile === TILE.WALL) return false;
	const posKey = `${r},${c}`;
	const ss = getSS(currentLayer, stageKey);
	if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) return false;
	return true;
}

// 投擲物の DOM 要素を作成
function createProjEl(proj) {
	if (!charLayerEl) return;
	const cellPx = getCellPx();
	const div = document.createElement('div');
	div.className = 'char-abs proj-el';
	div.id = `proj-${proj.id}`;
	div.style.left = `${proj.x * cellPx}px`;
	div.style.top  = `${proj.y * cellPx}px`;
	const cv = makeSprite(proj.type, proj.type, false);  // 静止表示（アニメなし）
	if (cv) {
		// !important で CSS を強制上書きしてサイズを小さくする
		const sz = Math.round(cellPx * 0.35) + 'px';
		cv.style.setProperty('width',  sz, 'important');
		cv.style.setProperty('height', sz, 'important');
		// 矢（arrow）は向きに応じてスプライトを回転する
		// SPRITES.arrow は右向き（→）が基準
		if (proj.type === 'arrow') {
			const adx = proj.dx, ady = proj.dy;
			let deg = 0;
			if (adx > 0 && ady === 0)  deg = 0;    // 右
			else if (adx < 0 && ady === 0) deg = 180; // 左
			else if (ady < 0 && adx === 0) deg = 270; // 上
			else if (ady > 0 && adx === 0) deg = 90;  // 下
			else if (adx > 0 && ady > 0)   deg = 45;  // 右下
			else if (adx < 0 && ady > 0)   deg = 135; // 左下
			else if (adx < 0 && ady < 0)   deg = 225; // 左上
			else if (adx > 0 && ady < 0)   deg = 315; // 右上
			if (deg !== 0) cv.style.setProperty('transform', `translate(-50%,-50%) rotate(${deg}deg)`, 'important');
		}
		div.appendChild(cv);
	}
	charLayerEl.appendChild(div);
	proj.el = div;
}

function moveProjEl(proj) {
	const el = document.getElementById(`proj-${proj.id}`);
	if (!el) return;
	const cellPx = getCellPx();
	el.style.left = `${proj.x * cellPx}px`;
	el.style.top  = `${proj.y * cellPx}px`;
}

function removeProjEl(proj) {
	document.getElementById(`proj-${proj.id}`)?.remove();
}

// 全投擲物を消去（ステージ遷移時など）
function clearProjectiles() {
	for (const p of projectiles) removeProjEl(p);
	projectiles = [];
}

// ── 爆弾管理 ─────────────────────────────────────────────────
// { id, r, c, fuseEnd, el }
let placedBombs = [];

// 全設置爆弾を消去（ステージ遷移時など）
function clearBombs() {
	for (const b of placedBombs) b.el?.remove();
	placedBombs = [];
}

function placeBomb() {
	const id  = player.activeSubItem;
	const si  = player.subItems[id];
	if (!si || si.count <= 0) { pulse('爆弾がない！'); return; }

	const r = toTileRow(player.y);
	const c = toTileCol(player.x);
	si.count--;
	if (si.count <= 0) {
		delete player.subItems[id];
		player.activeSubItem = Object.keys(player.subItems)[0] ?? null;
	}
	updateHud();

	// DOM に爆弾アイコンを配置
	const cellPx = getCellPx();
	const el = document.createElement('div');
	el.className = 'char-abs bomb-placed';
	el.id = `bomb-${nextProjId}`;
	el.style.left = `${c * cellPx}px`;
	el.style.top  = `${r * cellPx}px`;
	el.style.zIndex = '8';
	el.textContent = '💣';
	el.style.fontSize = `${cellPx * 0.55}px`;
	el.style.lineHeight = `${cellPx}px`;
	el.style.textAlign = 'center';
	charLayerEl?.appendChild(el);

	playSound('item');
	const bomb = { id: nextProjId++, r, c, fuseEnd: Date.now() + 2000, el };
	placedBombs.push(bomb);
}

function bombTick() {
	const now = Date.now();
	for (const bomb of [...placedBombs]) {
		if (now < bomb.fuseEnd) continue;
		explodeBomb(bomb);
	}
}

function explodeBomb(bomb) {
	// DOM 除去
	bomb.el?.remove();
	placedBombs = placedBombs.filter(b => b !== bomb);

	// 爆発エフェクト
	showExplosionEffect(bomb.r, bomb.c);
	playSound('bomb');

	const AOE = ITEM_META.bomb?.aoeRadius ?? 2;
	const ss  = getSS(currentLayer, stageKey);

	// 爆発範囲内の処理
	for (let dr = -AOE; dr <= AOE; dr++) {
		for (let dc = -AOE; dc <= AOE; dc++) {
			if (Math.sqrt(dr * dr + dc * dc) > AOE) continue;
			const tr = bomb.r + dr;
			const tc = bomb.c + dc;
			if (tr < 0 || tr >= stageData.rows || tc < 0 || tc >= stageData.cols) continue;
			const posKey = `${tr},${tc}`;
			const tile   = stageData.tiles[tr][tc];

			// 壊せる壁の破壊
			if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) {
				const bwDef = stageData.breakableWalls?.[posKey]?.breakDef ?? 1;
				if ((ITEM_META.bomb?.breakPower ?? 3) >= bwDef) {
					ss.brokenWalls.add(posKey);
					evaluateConditions();
					renderBoard(); renderChars();
				}
			}

			// 敵ダメージ
			for (const e of [...enemies]) {
				if (toTileRow(e.y) === tr && toTileCol(e.x) === tc) {
					dealDamageToEnemy(e, ITEM_META.bomb?.damage ?? 5);
				}
			}

			// ※ 自爆ダメージなし（プレイヤーは爆弾に当たらない）
		}
	}
	saveGame();
}

function showExplosionEffect(r, c) {
	if (!charLayerEl) return;
	const cellPx = getCellPx();
	const el = document.createElement('div');
	el.className = 'explosion-effect';
	el.style.cssText = `
		position:absolute;
		left:${(c - 1) * cellPx}px;
		top:${(r - 1) * cellPx}px;
		width:${cellPx * 3}px;
		height:${cellPx * 3}px;
		z-index:20;
		pointer-events:none;
		border-radius:50%;
		background:radial-gradient(circle, rgba(255,220,60,0.92) 0%, rgba(255,100,20,0.7) 40%, rgba(255,40,0,0.3) 70%, transparent 100%);
		animation:explosion-anim 0.45s ease-out forwards;
	`;
	charLayerEl.appendChild(el);
	setTimeout(() => el.remove(), 500);
}

// ── サブアイテム使用 ─────────────────────────────────────────
function useSubItem() {
	if (isDialog || isPaused || isGameover) return;
	const id = player.activeSubItem;
	if (!id) { pulse('サブアイテムがない！'); return; }
	const meta = ITEM_META[id];
	const si   = player.subItems[id];
	if (!si || (!si.count && si.count !== Infinity)) { pulse('アイテムがない！'); return; }
	if (meta?.type === 'consumable') {
		if (player.hp >= player.maxHp) { pulse('HP は満タン！'); return; }
		player.hp = Math.min(player.maxHp, player.hp + (meta.healAmount ?? 5));
		if (si.count !== Infinity) si.count--;
		if (si.count <= 0) { delete player.subItems[id]; player.activeSubItem = Object.keys(player.subItems)[0] ?? null; }
		playSound('heal'); pulse(`HP を回復した！ (${player.hp}/${player.maxHp})`);
		updateHud(); saveGame(); return;
	}
	if (id === 'boomerang') {
		// 飛翔中ならキャッチ待ち
		if (projectiles.some(p => p.type === 'boomerang' && p.owner === 'player')) {
			pulse('ブーメランが戻ってくる！'); return;
		}
		const [dy, dx] = DIR_DELTA[heroDir];
		const ndx = dx / MOVE_STEP;
		const ndy = dy / MOVE_STEP;
		resumeAudio(); playSound('slash');
		const proj = {
			id: nextProjId++, owner: 'player', type: 'boomerang',
			x: player.x + ndx * 0.5, y: player.y + ndy * 0.5,
			startX: player.x, startY: player.y,
			dx: ndx, dy: ndy,
			speed: hasCleared() ? 4.0 : 2.0,  // 二周目は2倍速
			atk: 3,  // ブーメランは固定ダメージ（剣ATK不使用）
			returning: false,
			maxRange: 3,
		};
		projectiles.push(proj);
		createProjEl(proj);
		return;
	}
	if (id === 'bomb') {
		placeBomb(); return;
	}
	if (id === 'bow') {
		// 矢を発射（ブーメランより大幅に速い・貫通・1消費）
		if (si.count <= 0) { pulse('矢がない！'); return; }
		si.count--;
		if (si.count <= 0) { delete player.subItems[id]; player.activeSubItem = Object.keys(player.subItems)[0] ?? null; }
		const [dy, dx] = DIR_DELTA[heroDir];
		const ndx = dx / MOVE_STEP;
		const ndy = dy / MOVE_STEP;
		resumeAudio(); playSound('slash');
		const proj = {
			id: nextProjId++, owner: 'player', type: 'arrow',
			x: player.x + ndx * 0.5, y: player.y + ndy * 0.5,
			dx: ndx, dy: ndy,
			speed: hasCleared() ? 9.0 : 4.5,  // 二周目は2倍速
			atk: 5,  // 弓矢は固定ダメージ（剣ATK不使用）
			piercing: true, // 貫通フラグ（checkProjHitで利用）
		};
		projectiles.push(proj);
		createProjEl(proj);
		updateHud(); saveGame(); return;
	}
	pulse(`${meta?.name ?? id} を使用！`);
}

// ── キーボード ────────────────────────────────────────────────
// 現在押されているキーを管理（押しっぱなし移動用）
const heldKeys = new Set();

document.addEventListener('keydown', e => {
	resumeAudio();
	if (isDialog) {
		if ([' ','Enter','z','Z'].includes(e.key)) { e.preventDefault(); advanceDialog(); }
		return;
	}
	if (isShop) {
		if (e.key === 'Escape') { e.preventDefault(); closeShop(); return; }
		if (e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') { e.preventDefault(); shopSelectPrev(); return; }
		if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); shopSelectNext(); return; }
		if ([' ','Enter','z','Z'].includes(e.key)) { e.preventDefault(); shopBuy(); return; }
		return;
	}
	if (isPaused) {
		if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); togglePause(); return; }
		if (e.key === 'ArrowLeft')  { e.preventDefault(); pauseSelectPrev(); return; }
		if (e.key === 'ArrowRight') { e.preventDefault(); pauseSelectNext(); return; }
		return;
	}
	// 方向キーは heldKeys で管理（gameTick で処理）
	if (['ArrowUp','w','W','ArrowDown','s','S','ArrowLeft','a','A','ArrowRight','d','D'].includes(e.key)) {
		e.preventDefault();
		heldKeys.add(e.key);
		return;
	}
	if ([' ','z','Z'].includes(e.key)) { e.preventDefault(); swordAttack(); return; }
	if (e.key === 'b' || e.key === 'B') { e.preventDefault(); useSubItem(); return; }
	// Mac: Commandキー / Windows: Altキー でもサブアイテム使用
	if (e.key === 'Meta' || e.key === 'Alt') { e.preventDefault(); useSubItem(); return; }
	if (e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
	if (e.key === 'g' || e.key === 'G') { e.preventDefault(); toggleDebugMode(); return; }
});
document.addEventListener('keyup', e => {
	heldKeys.delete(e.key);
});

// 二周目移動速度ブースト用アキュムレータ
let _moveSpeedAccum = 0;

// 押しっぱなし移動処理（gameTick から呼ぶ）
function processHeldKeys() {
	let dir = null;
	if (heldKeys.has('ArrowUp')    || heldKeys.has('w') || heldKeys.has('W')) dir = 'up';
	else if (heldKeys.has('ArrowDown')  || heldKeys.has('s') || heldKeys.has('S')) dir = 'down';
	else if (heldKeys.has('ArrowLeft')  || heldKeys.has('a') || heldKeys.has('A')) dir = 'left';
	else if (heldKeys.has('ArrowRight') || heldKeys.has('d') || heldKeys.has('D')) dir = 'right';
	if (!dir) { _moveSpeedAccum = 0; return; }

	// 二周目（姫パレット）は移動速度1.2倍
	// アキュムレータに 1.2 を加算し、整数部を消費して movePlayer を呼ぶ
	const speed = hasCleared() ? 1.2 : 1.0;
	_moveSpeedAccum += speed;
	const times = Math.floor(_moveSpeedAccum);
	_moveSpeedAccum -= times;
	for (let i = 0; i < times; i++) movePlayer(dir);
}

function updateShieldHud() {
	document.getElementById('btn-shield')?.classList.toggle('defending', isShielding);
}

// ── モバイル ──────────────────────────────────────────────────
document.querySelectorAll('.dpad-btn[data-dir]').forEach(btn => {
	const dir = btn.dataset.dir;
	if (!dir) return;
	btn.addEventListener('touchstart', e => { e.preventDefault(); resumeAudio(); movePlayer(dir); }, { passive: false });
	btn.addEventListener('mousedown', () => { resumeAudio(); movePlayer(dir); });
});
document.getElementById('btn-sword').addEventListener('click', () => { resumeAudio(); swordAttack(); });
document.getElementById('btn-sub').addEventListener('click',   () => { resumeAudio(); useSubItem(); });
document.getElementById('btn-menu').addEventListener('click',  () => { resumeAudio(); togglePause(); });
const shieldBtn = document.getElementById('btn-shield');
shieldBtn.addEventListener('touchstart', e => { e.preventDefault(); isShielding = true;  updateShieldHud(); }, { passive: false });
shieldBtn.addEventListener('touchend',   () => { isShielding = false; updateShieldHud(); });
shieldBtn.addEventListener('mousedown',  () => { isShielding = true;  updateShieldHud(); });
shieldBtn.addEventListener('mouseup',    () => { isShielding = false; updateShieldHud(); });
gameoverRetryEl.addEventListener('click', () => { resumeAudio(); retryGame(); });
// エンディング「はじめから」ボタン
endingRestartEl.addEventListener('click', () => {
	endingOverlayEl.classList.add('hidden');
	isGameover = false;
	startNewGame();
});

// スワイプ
let touchStartX = 0, touchStartY = 0;
document.addEventListener('touchstart', e => {
	if (e.target.closest('#mobile-ctrl')) return;
	touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
	if (e.target.closest('#mobile-ctrl')) return;
	const dx = e.changedTouches[0].clientX - touchStartX;
	const dy = e.changedTouches[0].clientY - touchStartY;
	if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
	if (Math.abs(dx) > Math.abs(dy)) movePlayer(dx > 0 ? 'right' : 'left');
	else movePlayer(dy > 0 ? 'down' : 'up');
}, { passive: true });

// ── Phase 8.2: ドロップエフェクト（茂み切り等でアイテムが飛び出す） ──
function spawnDropEffect(r, c, icon, color) {
	if (!charLayerEl) return;
	const cellPx = getCellPx();
	const el = document.createElement('div');
	el.style.cssText = `
		position:absolute;
		left:${(c + 0.5) * cellPx}px;
		top:${(r + 0.2) * cellPx}px;
		transform:translateX(-50%);
		font-size:${Math.round(cellPx * 0.55)}px;
		color:${color};
		z-index:25;
		pointer-events:none;
		animation:drop-popup 0.6s ease-out forwards;
	`;
	el.textContent = icon;
	charLayerEl.appendChild(el);
	setTimeout(() => el.remove(), 650);
}

// ── アニメーション ────────────────────────────────────────────
startAnimLoop(() => { redrawAnimSprites(); });

// ── 初期化 ────────────────────────────────────────────────────
const titleOverlayEl  = document.getElementById('title-overlay');
const confirmOverlayEl = document.getElementById('confirm-overlay');
const btnContinueEl   = document.getElementById('btn-continue');
const btnNewgameEl    = document.getElementById('btn-newgame');
const btnConfirmYesEl = document.getElementById('btn-confirm-yes');
const btnConfirmNoEl  = document.getElementById('btn-confirm-no');

// 新規ゲーム開始（セーブデータを消して最初から）
// startPos（mapData.startPos）を優先して使用し、field ハードコードを排除
function startNewGame() {
	localStorage.removeItem(SAVE_KEY);
	// ※ CLEARED_KEY はここで削除しない：クリア済みフラグは二周目（姫状態）に引き継ぐ
	stageState = {};

	// startPos がある場合はそちらを使う
	const sp = mapData?.startPos;
	if (sp?.layer && sp?.stage) {
		currentLayer = sp.layer;
		stageKey     = sp.stage;
	} else {
		// fallback: 全レイヤーの最初のステージを使う
		currentLayer = Object.keys(mapData?.layers ?? {})[0] ?? 'field';
		stageKey     = Object.keys(mapData?.layers?.[currentLayer]?.stages ?? {})[0] ?? '0,0';
	}

	// PLAYER タイルまたは startPos の row/col から開始位置を決定
	let startRow = sp?.row ?? 1;
	let startCol = sp?.col ?? 1;
	const sd = getStageData(currentLayer, stageKey);
	if (sd && sp == null) {
		// startPos がない場合は PLAYER タイルを探す
		outer: for (let r = 0; r < sd.rows; r++) {
			for (let c = 0; c < sd.cols; c++) {
				if (sd.tiles[r][c] === TILE.PLAYER) { startRow = r; startCol = c; break outer; }
			}
		}
	}

	// player を初期状態にリセット
	player = {
		x: startCol, y: startRow,
		hp: 6, maxHp: 6, maxHearts: 3,
		atk: 2, def: 0, keys: 0,
		weapon: null, shield: null, armor: null,
		subItems: {}, activeSubItem: null,
		rupees: 0, triforceCount: 0,
	};
	heroDir = 'down';
	enterStage(currentLayer, stageKey, player.y, player.x);
	startGameLoop();
	resumeAudio();
}

// タイトルダイアログのボタンイベント
btnContinueEl.addEventListener('click', () => {
	titleOverlayEl.classList.add('hidden');
	enterStage(currentLayer, stageKey, player.y, player.x);
	startGameLoop();
	resumeAudio();
});

btnNewgameEl.addEventListener('click', () => {
	// 確認ダイアログを表示
	titleOverlayEl.classList.add('hidden');
	confirmOverlayEl.classList.remove('hidden');
});

btnConfirmYesEl.addEventListener('click', () => {
	confirmOverlayEl.classList.add('hidden');
	startNewGame();
});

btnConfirmNoEl.addEventListener('click', () => {
	// タイトルに戻る
	confirmOverlayEl.classList.add('hidden');
	titleOverlayEl.classList.remove('hidden');
});

async function init() {
	// URL パラメータ解析
	const params     = new URLSearchParams(location.search);
	const fromEditor = params.get('fromEditor') === '1';
	const paramLayer = params.get('layer');
	const paramStage = params.get('stage');
	const paramRow   = params.get('row');
	const paramCol   = params.get('col');

	if (fromEditor) {
		// エディタプレビューモード：実際のJSONを優先して読み込み（確実に最新データを使う）
		// localStorage は古い可能性があるためフォールバックのみ
		try {
			await loadMapData(); // 実際のJSONファイルを読む
		} catch {
			// JSONファイルが読めない場合はlocalStorageにフォールバック
			const saved = localStorage.getItem('bladeOfLumiaMapData');
			if (saved) {
				try { mapData = JSON.parse(saved); } catch { /* 無視 */ }
			}
		}
		if (!mapData) {
			const saved = localStorage.getItem('bladeOfLumiaMapData');
			if (saved) try { mapData = JSON.parse(saved); } catch { /* 無視 */ }
		}
		buildExitRegistry();

		// 開始位置をパラメータから取得
		const lk = paramLayer ?? 'field';
		const sk = paramStage ?? Object.keys(mapData.layers?.[lk]?.stages ?? {})[0] ?? '0,0';
		const pr = parseInt(paramRow ?? '1', 10);
		const pc = parseInt(paramCol ?? '1', 10);

		// ── プレビュー設定パラメータを適用 ──────────────────────
		const psAtk      = params.get('ps_atk');
		const psDef      = params.get('ps_def');
		const psRupees   = params.get('ps_rupees');
		const psTriforce = params.get('ps_triforce');
		const psWeapon   = params.get('ps_weapon');
		const psShield   = params.get('ps_shield');
		const psArmor    = params.get('ps_armor');
		const psBow      = params.get('ps_bow');
		const psBoomerang= params.get('ps_boomerang');
		const psCleared  = params.get('ps_cleared');

		if (psAtk      !== null) player.atk    = parseInt(psAtk,  10) || 2;
		if (psDef      !== null) player.def    = parseInt(psDef,  10) || 0;
		if (psRupees   !== null) player.rupees = parseInt(psRupees, 10) || 0;
		if (psTriforce !== null) player.triforceCount = parseInt(psTriforce, 10) || 0;
		if (psWeapon   === '1') { player.weapon = 'sword'; if (!player._equip) player._equip = {}; player._equip.swordName = '剣'; }
		if (psShield   === '1') player.shield = 'shield';
		if (psArmor    === '1') { player.armor  = 'armor'; if (!player._equip) player._equip = {}; player._equip.armorName = '防具'; }
		if (psBow      === '1') { player.subItems.bow       = { count: 10 };       if (!player.activeSubItem) player.activeSubItem = 'bow'; }
		if (psBoomerang=== '1') { player.subItems.boomerang = { count: Infinity };  if (!player.activeSubItem) player.activeSubItem = 'boomerang'; }
		// 姫状態（クリア済みフラグ）の設定
		if (psCleared === '1') {
			localStorage.setItem(CLEARED_KEY, '1');
		} else {
			localStorage.removeItem(CLEARED_KEY);
		}

		console.log('[Game] player after ps apply:', JSON.stringify({
			atk: player.atk, def: player.def, rupees: player.rupees,
			weapon: player.weapon, shield: player.shield, armor: player.armor,
			subItems: player.subItems, activeSubItem: player.activeSubItem,
			triforceCount: player.triforceCount,
		}));

		// デバッグモード ON（エディタプレビューは常に無敵）
		debugMode = true;
		enterStage(lk, sk, pr, pc);
		startGameLoop();
		return;
	}

	await loadMapData();
	const hasSave = loadGame();

	if (!hasSave || !stageKey) {
		// セーブデータなし → 即新規ゲーム開始
		startNewGame();
	} else {
		// セーブデータあり → タイトルダイアログを表示
		titleOverlayEl.classList.remove('hidden');
		// 「続きから」ボタンのみ有効にする（セーブあり前提）
		btnContinueEl.style.display = '';
	}
}

init().catch(err => {
	console.error('init failed:', err);
	document.body.innerHTML = `<p style="color:red;padding:20px">読み込みエラー: ${err.message}</p>`;
});

// ウィンドウリサイズ時にボードのスケールを再計算
window.addEventListener('resize', () => updateBoardScale());

// ── デバッグ用：コンソールから呼び出せるようにグローバルに公開 ──
window._debugEnding = () => startEnding();

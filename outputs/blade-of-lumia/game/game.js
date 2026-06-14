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
// ── 定数（Phase 0-2 Step 1a: constants.js へ切り出し済み）──────
import {
	MOVE_STEP, TICK_MS, INVINCIBLE_MS, HP_PER_HEART,
	MAP_JSON_URL, SAVE_KEY, CLEARED_KEY, DIR_DELTA,
	SWORD_REACH, SWORD_COOLDOWN_MS, STONE_PUSH_COOLDOWN_MS,
} from './constants.js';
// ── セーブ/ロードの純粋変換ロジック（Phase 0-2 Step 1b: save.js へ切り出し）──
import {
	createStageState, serializeStageState, deserializeStageState, sanitizeLoadedPlayer,
} from './save.js';
// ── 通行可否判定・条件評価（Phase 0-2 Step 2: passable.js / conditions.js へ切り出し）──
import { createPassable } from './passable.js';
import { createConditions } from './conditions.js';
// ── 描画系（Phase 0-2 Step 3: render-board.js / render-chars.js へ切り出し）──────
import { createRenderBoard } from './render-board.js';
import { createRenderChars } from './render-chars.js';
// ── 入力・UI（Phase 0-2 Step 4: input.js / ui.js へ切り出し）──────────────────
import { initInput } from './input.js';
import { createUi } from './ui.js';
// ── 投擲物・爆弾（Phase 0-2 Step 5: projectile.js へ切り出し）───────────────
import { createProjectile } from './projectile.js';
// ── 敵AI（Phase 0-2 Step 5: enemy-ai.js へ切り出し）──────────────────────────
import { createEnemyAi } from './enemy-ai.js';
// ── プレイヤー移動・タイルイベント（Phase 0-2 Step 5: player.js へ切り出し）──
import { createPlayer } from './player.js';
// ── 剣攻撃・ダメージ（Phase 0-2 Step 5: combat.js へ切り出し）───────────────
import { createCombat } from './combat.js';
// ── ボス戦・エンディング（Phase 0-2 Step 5: boss.js へ切り出し）─────────────
import { createBoss } from './boss.js';


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
// ── 論理時間（Phase 0-1）─────────────────────────────────────
// gameTime は step() が 1 フレームごとに TICK_MS 加算する「ゲーム内の論理時刻」(ms)。
// クールダウン・無敵時間・敵AI・爆弾の導火線などゲーム状態に影響するタイマーは
// すべて gameNow() を基準にする（Date.now() ではなく）。これによりテストから
// step(frames) でフレーム単位に決定論的な検証ができる。視覚演出（setTimeout 等）は
// 実時間のままで構わない。
let gameTime        = 0;
function gameNow() { return gameTime; }
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
// Phase 0-2 Step 3: render-board.js と render-chars.js が共有する参照ラッパー。
// renderBoard() が新しい charLayerEl を作成したとき .value を更新し、
// renderChars() 側は .value 経由で常に最新の要素を読む。
let charLayerEl = null;
const charLayerElRef = { value: null };  // ← 両モジュールが共有する参照ラッパー

// ── Phase 0-2 Step 4: input.js factory の戻り値を保持（window.__game から参照）──
// initInput 後に _inputModule に代入される。宣言はここに置くことで TDZ を回避。
let _inputModule = null;

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
// シリアライズ/デシリアライズ等の純粋ロジックは save.js に切り出し済み。
// ここでは localStorage への read/write と状態の再代入（game.js のスコープ
// に閉じた副作用）のみを担当する。
function getSS(lk, sk) {
	const k = `${lk}_${sk}`;
	if (!stageState[k]) {
		stageState[k] = createStageState();
	}
	return stageState[k];
}

function saveGame() {
	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify({
			player,
			stageState: serializeStageState(stageState),
			currentLayer, stageKey, heroDir,
		}));
	} catch (e) { console.warn('saveGame failed:', e); }
}

function loadGame() {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (!raw) return false;
		const data = JSON.parse(raw);
		player       = sanitizeLoadedPlayer({ ...player, ...data.player }, ITEM_META);
		heroDir      = data.heroDir ?? 'down';
		currentLayer = data.currentLayer ?? 'field';
		stageKey     = data.stageKey ?? null;
		stageState   = deserializeStageState(data.stageState);
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

// ── Phase 0-2 Step 4: factory で上書きされる関数の let 宣言 ──────────────────
// ui.js / input.js の factory が生成した実装で上書きするため、事前に let 宣言する。
// （function 宣言は下方で定義済みだが、updateShieldHud / processHeldKeys は
//   旧インライン実装が削除されたため宣言が必要）
let updateShieldHud  = () => {};   // ui.js の _ui.updateShieldHud で上書き
let processHeldKeys  = () => {};   // input.js の _in.processHeldKeys で上書き
// projectile.js factory の addProjectile / getProjectiles は useSubItem から参照するため事前宣言
let addProjectile    = () => {};
let getProjectiles   = () => [];
// enemy-ai.js factory で上書きされる関数の事前宣言（旧 function 本体は削除済み）
let enemyTick           = () => {};
let enemyChase          = () => {};
let bossTickHitAndAway  = () => {};
let enemyAttack         = () => {};
let checkEnemyContact   = () => {};
let fireEnemyProjectile = () => {};
// projectile.js factory で上書きされる関数の事前宣言（旧 function 本体は削除済み）
let projectileTick       = () => {};
let clearProjectiles     = () => {};
let clearBombs           = () => {};
let bombTick             = () => {};
let placeBomb            = () => {};
let isShieldBlocking     = () => false;
let isShieldBlockingDir  = () => false;
let showShieldBlockEffect= () => {};
let showExplosionEffect  = () => {};


// openDialog は ui.js の _ui.openDialog で上書き（看板・ヒントダイアログ等から参照）
let openDialog       = () => {};

// ── 状態フラグ getter/setter（Phase 0-2 Step 4: ui.js / input.js に注入するため）──
// game.js の let 変数を外部モジュールが読み書きできるよう getter/setter を用意する。
// 直接参照を避けることで read-only binding 問題を回避する。
function getIsDialog()    { return isDialog; }
function setIsDialog(v)   { isDialog = v; }
function getIsShop()      { return isShop; }
function setIsShop(v)     { isShop = v; }
function getIsPaused()    { return isPaused; }
function setIsPaused(v)   { isPaused = v; }
function getIsShielding() { return isShielding; }
function setIsShielding(v){ isShielding = v; }

// ── 通行可否・条件評価（Phase 0-2 Step 2: passable.js / conditions.js へ切り出し）──
// これらの関数は再代入される可変状態を参照するため、状態 getter と依存関数を
// factory に注入して生成する（getter 経由で常に最新状態を読む）。生成された
// 関数は呼び出し側を変えずにそのまま使える。
const { isPassable, tilePassable, isPassableForEnemy } = createPassable({
	getStageData:    () => stageData,
	getEnemies:      () => enemies,
	getPlayer:       () => player,
	getCurrentLayer: () => currentLayer,
	getStageKey:     () => stageKey,
	getDebugMode:    () => debugMode,
	getSS,
	toTileRow,
	toTileCol,
});

const { checkStoneOnSwitch, evaluateConditions } = createConditions({
	getStageData:    () => stageData,
	getEnemies:      () => enemies,
	getPlayer:       () => player,
	getCurrentLayer: () => currentLayer,
	getStageKey:     () => stageKey,
	getSS,
	toTileRow,
	toTileCol,
	renderBoard:     () => renderBoard(),
	renderChars:     () => renderChars(),
});

// 旧 function 本体を削除したため、factory 代入先を let で事前宣言する
// （旧 function 宣言のホイスティングに依存しなくなるため）
let renderBoard;
let renderChars;
let addCharEl;
let moveCharEl;
let removeCharEl;
let addShieldOverlay;
let updatePlayerCharEl;

// ── 描画系（Phase 0-2 Step 3: render-board.js / render-chars.js へ切り出し）──────
// renderBoard / renderChars / addCharEl / moveCharEl / removeCharEl /
// addShieldOverlay / updatePlayerCharEl を factory + getter 注入で生成する。

// 呼び出し側（game.js 内）は関数名を変えずにそのまま使える（上書き代入）。
//
// render-board は charLayerElRef.value に新しい charLayerEl を書き込む。
// render-chars はその .value を読む。game.js は charLayerEl も同期させる。

{
	const _rb = createRenderBoard({
		getStageData:    () => stageData,
		getCurrentLayer: () => currentLayer,
		getStageKey:     () => stageKey,
		getSS,
		getBoardEl:      () => boardEl,
		getStageLabelEl: () => stageLabelEl,
		charLayerElRef,
		getDoorwayState,
	});

	const _rc = createRenderChars({
		getPlayer:         () => player,
		getEnemies:        () => enemies,
		getCurrentLayer:   () => currentLayer,
		getStageKey:       () => stageKey,
		getStageData:      () => stageData,
		getHeroDir:        () => heroDir,
		getSS,
		getCellPx,
		charLayerElRef,
		getHeroSpriteName: () => getHeroSpriteName(),
		getHeroPalName:    () => getHeroPalName(),
	});

	// factory が生成した関数で旧実装を上書き
	// renderBoard は呼び出し後に charLayerEl を同期する（game.js 内の直接参照のため）
	renderBoard = () => { _rb.renderBoard(); charLayerEl = charLayerElRef.value; };
	renderChars = _rc.renderChars;
	addCharEl   = _rc.addCharEl;
	moveCharEl  = _rc.moveCharEl;
	removeCharEl= _rc.removeCharEl;
	addShieldOverlay    = _rc.addShieldOverlay;
	updatePlayerCharEl  = _rc.updatePlayerCharEl;
}

// ── UI・入力（Phase 0-2 Step 4: ui.js / input.js へ切り出し）────────────────
// createUi: HUD/ポーズ/ダイアログ/ショップを factory で生成し旧実装を上書き
// initInput: キーボード・モバイル・スワイプリスナーを登録し heldKeys / processHeldKeys を返す

{
	const _ui = createUi({
		getPlayer:         () => player,
		getMapData:        () => mapData,
		getCurrentLayer:   () => currentLayer,
		getStageKey:       () => stageKey,
		getSS,
		startGameLoop,
		stopGameLoop,
		saveGame,
		getIsDialog,  setIsDialog,
		getIsShop,    setIsShop,
		getIsPaused,  setIsPaused,
		getIsShielding, setIsShielding,
	});

	// factory が生成した関数で旧実装を上書き
	updateHud        = _ui.updateHud;
	pulse            = _ui.pulse;
	updateDungeonHud = _ui.updateDungeonHud;
	updateShieldHud  = _ui.updateShieldHud;
	startDialog      = (r, c, tileChar) => _ui.startDialog(r, c, tileChar, stageData, NPC_DEFAULT_DIALOG);
	showDialogLine   = _ui.showDialogLine;
	advanceDialog    = _ui.advanceDialog;
	togglePause      = _ui.togglePause;
	renderPauseMenu  = _ui.renderPauseMenu;
	renderPauseDungeonMap = _ui.renderPauseDungeonMap;
	pauseSelectPrev  = _ui.pauseSelectPrev;
	pauseSelectNext  = _ui.pauseSelectNext;
	openShop         = _ui.openShop;
	closeShop        = _ui.closeShop;
	renderShop       = _ui.renderShop;
	shopSelectPrev   = _ui.shopSelectPrev;
	shopSelectNext   = _ui.shopSelectNext;
	shopBuy          = () => _ui.shopBuy(giveSubItem, updateHud);
	openDialog       = (name, lines) => _ui.openDialog(name, lines);

	// maybeShowSubItemHint は ui.js の openDialog を通して開く
	maybeShowSubItemHint = () => {
		if (player._shownSubItemHint) return;
		player._shownSubItemHint = true;
		_ui.openDialog('！ ヒント', [
			'サブアイテムを手に入れた！',
			'Escapeキー（または ≡ボタン）を押すと\nアイテム切り替え画面を開けます。',
			'左右キーでBボタンに使うアイテムを\n切り替えることができます。',
		]);
	};

	const _in = initInput({
		getIsDialog:     () => getIsDialog(),
		getIsShop:       () => getIsShop(),
		getIsPaused:     () => getIsPaused(),
		getIsShielding:  () => getIsShielding(),
		setIsShielding,
		movePlayer,
		swordAttack,
		useSubItem,
		togglePause,
		toggleDebugMode,
		advanceDialog,
		closeShop,
		shopSelectPrev,
		shopSelectNext,
		shopBuy,
		pauseSelectPrev,
		pauseSelectNext,
		hasCleared,
		updateShieldHud,
	});

	// heldKeys と processHeldKeys を factory 生成版で上書き
	// _inputModule に保存することで window.__game 定義後も参照できる
	processHeldKeys = _in.processHeldKeys;
	_inputModule = _in;  // window.__game の queueInput/releaseInput から参照するため保持
}

// ── 投擲物・爆弾 / 敵AI（Phase 0-2 Step 5: projectile.js / enemy-ai.js へ切り出し）──
// createProjectile / createEnemyAi の factory を生成し、旧インライン実装を上書きする。
// deps は getters 経由で常に最新の game.js 状態を読む。
{
	const _proj = createProjectile({
		getStageData:       () => stageData,
		getPlayer:          () => player,
		getEnemies:         () => enemies,
		getCurrentLayer:    () => currentLayer,
		getStageKey:        () => stageKey,
		getHeroDir:         () => heroDir,
		getCharLayerEl:     () => charLayerEl,
		getCellPx,
		toTileRow,
		toTileCol,
		gameNow,
		getSS,
		dealDamageToEnemy:  (e, dmg) => dealDamageToEnemy(e, dmg),
		takeDamage:         (amt) => takeDamage(amt),
		evaluateConditions: () => evaluateConditions(),
		renderBoard:        () => renderBoard(),
		renderChars:        () => renderChars(),
		saveGame:           () => saveGame(),
		updateHud:          () => updateHud(),
		pulse:              (t, d) => pulse(t, d),
		hasCleared,
	});

	const _ai = createEnemyAi({
		getStageData:          () => stageData,
		getPlayer:             () => player,
		getEnemies:            () => enemies,
		getHeroDir:            () => heroDir,
		getCharLayerEl:        () => charLayerEl,
		getCellPx,
		toTileRow,
		toTileCol,
		gameNow,
		isPassableForEnemy,
		moveCharEl:            (id, x, y) => moveCharEl(id, x, y),
		takeDamage:            (amt) => takeDamage(amt),
		dealDamageToEnemy:     (e, dmg) => dealDamageToEnemy(e, dmg),
		fireEnemyProjectile:   _proj.fireEnemyProjectile,
		isShieldBlockingDir:   _proj.isShieldBlockingDir,
		showShieldBlockEffect: _proj.showShieldBlockEffect,
		getDebugMode:          () => debugMode,
	});

	// factory が生成した関数で旧インライン実装を上書き
	projectileTick       = _proj.projectileTick;
	clearProjectiles     = _proj.clearProjectiles;
	clearBombs           = _proj.clearBombs;
	bombTick             = _proj.bombTick;
	placeBomb            = _proj.placeBomb;
	addProjectile        = (config) => _proj.addProjectile(config);
	getProjectiles       = () => _proj.getProjectiles();
	fireEnemyProjectile  = _proj.fireEnemyProjectile;
	isShieldBlocking     = (proj) => _proj.isShieldBlocking(proj);
	isShieldBlockingDir  = _proj.isShieldBlockingDir;
	showShieldBlockEffect= _proj.showShieldBlockEffect;
	showExplosionEffect  = _proj.showExplosionEffect;
	enemyTick            = _ai.enemyTick;
	enemyChase           = _ai.enemyChase;
	bossTickHitAndAway   = _ai.bossTickHitAndAway;
	enemyAttack          = _ai.enemyAttack;
	checkEnemyContact    = _ai.checkEnemyContact;
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
	if (gameNow() < mapEnterCooldownUntil) return;
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
			mapEnterCooldownUntil = gameNow() + 1500;
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

// checkStoneOnSwitch は conditions.js へ切り出し（factory で生成済み）

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
		// ※ 石押しは setTimeout（実時間 _animDuration）で石とプレイヤーを同時に
		//   セル単位でゆっくり移動させる「特別なアニメーションモード」。
		//   クールダウンもその実時間アニメと同期させる必要があるため、ここだけは
		//   論理時間 gameNow() ではなく Date.now()（実時間）を使う。
		//   gameNow() にすると実時間アニメと時間系がズレ、アニメ完了後もクールダウンが
		//   解けず「2回目が押せない」「石要素が残って重なり大きく見える」不具合になる。
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
// SWORD_REACH / SWORD_COOLDOWN_MS / STONE_PUSH_COOLDOWN_MS は constants.js から import 済み
let lastSwordTime = 0;
let lastStonePushTime = 0;

function swordAttack() {
	if (isDialog || isPaused || isGameover) return;

	// 向き方向の単位ベクトル（半セルで正規化）
	const [dy, dx] = DIR_DELTA[heroDir]; // 例: right → [0, 0.5]
	const ndx = dx / MOVE_STEP; // 正規化: 0, +1, -1
	const ndy = dy / MOVE_STEP;

	// NPC・ギミックとのインタラクション（剣なしでも可能）
	// プレイヤーの正面 1 セルのタイルをチェック
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

	// Phase 8.3: 看板を読む（剣なしでも可能）
	if (tile === TILE.SIGN) {
		const signData = stageData.signData?.[posKey3] ?? stageData.npcData?.[posKey3] ?? { name: '看板', lines: ['（何も書かれていない）'] };
		openDialog(signData.name ?? '看板', signData.lines ?? ['（何も書かれていない）']);
		return;
	}

	// 以降は剣が必要な操作
	if (!player.weapon) { pulse('剣を持っていない！'); return; }

	// クールダウンチェック（デバッグモードはスキップしない）
	const now = gameNow();
	if (now - lastSwordTime < SWORD_COOLDOWN_MS) return;
	lastSwordTime = now;
	resumeAudio(); playSound('slash');

	// 剣エフェクト：プレイヤーのセル中心から 0.7 セル先（float座標）
	const slashX = player.x + ndx * 0.7;
	const slashY = player.y + ndy * 0.7;
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

	// Phase 8.2: 茂みを切る（剣が必要）
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
	if (gameNow() < invincibleUntil || isGameover) return;
	// 二周目（姫パレット）は防御力2倍
	const effectiveDef = hasCleared() ? player.def * 2 : player.def;
	const actual = Math.max(1, amount - effectiveDef);
	player.hp = Math.max(0, player.hp - actual);
	invincibleUntil = gameNow() + INVINCIBLE_MS;
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

// evaluateConditions は conditions.js へ切り出し（factory で生成済み）

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
// CLEARED_KEY は constants.js から import 済み

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
// driver（setInterval）は「実時間で step(1) を駆動」するだけ。
// 世界を進めるロジックは step() に集約し、テストからは __game.step(n) を
// 直接呼ぶことで実時間ゼロ・決定論的にフレームを進められる（Phase 0-1）。
function startGameLoop() {
	if (gameTimer) clearInterval(gameTimer);
	gameTimer = setInterval(() => step(1), TICK_MS);
}
function stopGameLoop() {
	if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
}

// gameTick: 1 フレーム分の「世界の更新」（純粋ロジック）。
// 互換のため関数名は残すが、実体は step(1) と同じ。
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

// step(frames): frames 分だけ世界を進める。
// 1 フレームごとに論理時間 gameTime を TICK_MS 加算してから gameTick() を実行する。
// 凍結状態（ポーズ・ダイアログ・ゲームオーバー・遷移中）では gameTick が早期 return し、
// gameTime も進めない（＝世界が止まる）。
function step(frames = 1) {
	for (let i = 0; i < frames; i++) {
		if (isPaused || isDialog || isGameover || isTransitioning) return;
		gameTime += TICK_MS;
		gameTick();
	}
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
		if (getProjectiles().some(p => p.type === 'boomerang' && p.owner === 'player')) {
			pulse('ブーメランが戻ってくる！'); return;
		}
		const [dy, dx] = DIR_DELTA[heroDir];
		const ndx = dx / MOVE_STEP;
		const ndy = dy / MOVE_STEP;
		resumeAudio(); playSound('slash');
		addProjectile({
			owner: 'player', type: 'boomerang',
			x: player.x + ndx * 0.5, y: player.y + ndy * 0.5,
			startX: player.x, startY: player.y,
			dx: ndx, dy: ndy,
			speed: hasCleared() ? 4.0 : 2.0,  // 二周目は2倍速
			atk: 3,  // ブーメランは固定ダメージ（剣ATK不使用）
			returning: false,
			maxRange: 3,
		});
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
		addProjectile({
			owner: 'player', type: 'arrow',
			x: player.x + ndx * 0.5, y: player.y + ndy * 0.5,
			dx: ndx, dy: ndy,
			speed: hasCleared() ? 9.0 : 4.5,  // 二周目は2倍速
			atk: 5,  // 弓矢は固定ダメージ（剣ATK不使用）
			piercing: true, // 貫通フラグ（checkProjHitで利用）
		});
		updateHud(); saveGame(); return;
	}
	pulse(`${meta?.name ?? id} を使用！`);
}

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

// ── Phase 0-2 Step 6: main.js へのエントリポイント切り出し用 export ────────────
// main.js が import して使う。game.js 自身は init() を自動実行しない。
export {
	init,
	updateBoardScale,
	step,
	movePlayer,
	swordAttack,
	useSubItem,
	getProjectiles,
	startEnding,
};
export { startAnimLoop, redrawAnimSprites } from '../shared/sprites.js';

// テスト用フック（main.js 側の window.__game から呼ばれる）
export function getGameState() {
	return {
		gameTime,
		currentLayer,
		stageKey,
		player: { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp },
		heroDir,
		enemyCount: enemies.length,
		isPaused, isDialog, isGameover, isTransitioning,
	};
}

export function getInputModule() {
	return _inputModule;
}

// 敵のスナップショットを返す（テスト用：hp などの状態確認）
export function getEnemiesSnapshot() {
	return enemies.map(e => ({
		id: e.id, type: e.type,
		x: e.x, y: e.y,
		hp: e.hp, maxHp: e.maxHp,
	}));
}

// テスト用：任意の座標に擬似敵を注入する
// ゲーム中の敵データに直接追加するため、DOM 要素は作らない（hp 減少だけ確認）
export function injectTestEnemy(x, y, hp = 5) {
	const id = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	enemies.push({
		id, type: 'E', // ダミータイプ（ENEMY_META にないため isBoss=false）
		x, y,
		hp, maxHp: hp,
		atk: 0, def: 0,
		speed: 0,
		sprite: 'slime', pal: 'slime',
		accum: 0, dir: 'down', el: null,
	});
	return id;
}


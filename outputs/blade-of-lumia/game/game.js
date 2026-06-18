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
	DARK_TOWER_EXIT_ID,
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
// ── チャージ攻撃・剣ビーム（Phase 3-1: charge.js へ切り出し）──────────────────
import { createCharge } from './charge.js';


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
	// Phase 1-3: 翼の羽衣（古代の祭壇で授かる）。暗黒の塔の入り口を通れるようになる。
	hasWingRobe: false,
	// Phase 1-5: 飛行中フラグ（翼の羽衣で離陸中。SKY/WATER を越えられる）。
	flying: false,
	// Phase 4-1: はしご所持フラグ。両隣が地上の水/穴を1セルだけ自動で渡れる。
	hasLadder: false,
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

// ── 星の欠片・待機位置（魔王撃破後に出現した欠片の位置） ──
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

// ── ボス撃破・星の欠片収集の状態フラグ（boss.js factory が参照） ──────
// boss.js（createBoss）の deps が getter/setter 経由で読み書きするため、
// factory 呼び出し時点で初期化済みになるよう前方で宣言する。
let _bossDefeating = false;          // ボス撃破演出 実行中フラグ（二重実行防止）
let _pendingTriforcePieceEl = null;  // 出現中の星の欠片 DOM 要素
let _collectingTriforce = false;     // 二重収集防止フラグ
// 剣・石押しのクールダウン論理時刻（combat.js / player.js factory が参照）
let lastSwordTime = 0;
let lastStonePushTime = 0;

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

	// Phase 1-5: ステージ遷移時の着陸処理。到着セルが地上なら自動着陸する。
	// 到着セルが空・水（塔の空島入口など）なら飛行を維持してその場に留まれる。
	if (player.flying) {
		const arrTile = stageData.tiles?.[Math.floor((pRow ?? 1) + 0.5)]?.[Math.floor((pCol ?? 1) + 0.5)];
		if (arrTile !== TILE.SKY && arrTile !== TILE.WATER) player.flying = false;
	}

	// ステージ遷移時に飛翔物・設置爆弾をリセット
	clearProjectiles();
	clearBombs();
	cancelCharge();   // チャージ中の遷移はキャンセル（Phase 3-1）
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
				// Phase 3-2: 占有セル数（大型敵）。省略時は 1×1。
				w:      m.size?.w ?? 1,
				h:      m.size?.h ?? 1,
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

// ── Phase 0-2 で factory（外部モジュール）に切り出した関数の事前宣言 ────────
// 各 factory は createXxx(deps) で生成され、その戻り値で下記 let を上書きする。
// 旧 function 本体は削除済みなので、ホイスティングに頼らず let で前方宣言する。
// ── ui.js / input.js ──
let updateHud        = () => {};
let pulse            = (t, d) => {};
let updateShieldHud  = () => {};
let processHeldKeys  = () => {};
// ── charge.js（Phase 3-1）──
let startCharge        = () => {};
let releaseCharge      = () => {};
let cancelCharge       = () => {};
let tickCharge         = () => {};
let getChargeMoveSpeedFactor = () => 1;
let startDialog      = () => {};
let showDialogLine   = () => {};
let advanceDialog    = () => {};
let togglePause      = () => {};
let renderPauseMenu  = () => {};
let renderPauseDungeonMap = () => {};
let pauseSelectPrev  = () => {};
let pauseSelectNext  = () => {};
let openShop         = () => {};
let closeShop        = () => {};
let renderShop       = () => {};
let shopSelectPrev   = () => {};
let shopSelectNext   = () => {};
let shopBuy          = () => {};
let openDialog       = () => {};
let maybeShowSubItemHint = () => {};
// updateDungeonHud は上で function 宣言済みなので let 不要
// ── projectile.js / enemy-ai.js ──
let addProjectile    = () => {};
let getProjectiles   = () => [];
let enemyTick           = () => {};
let enemyChase          = () => {};
let bossTickHitAndAway  = () => {};
let enemyAttack         = () => {};
let checkEnemyContact   = () => {};
let fireEnemyProjectile = () => {};
let projectileTick       = () => {};
let clearProjectiles     = () => {};
let clearBombs           = () => {};
let bombTick             = () => {};
let placeBomb            = () => {};
let isShieldBlocking     = () => false;
let isShieldBlockingDir  = () => false;
let showShieldBlockEffect= () => {};
let showExplosionEffect  = () => {};
// ── player.js ──
let movePlayer          = () => {};
let handleTileEvent     = () => {};
let tryPushStone        = () => {};
let checkSwitchOff      = () => {};
let giveSubItem         = () => {};
let gainHeartContainer  = () => {};
let spawnDropEffect     = () => {};
let toggleFlight        = () => {};
// ── combat.js ──
let swordAttack         = () => {};
let dealDamageToEnemy   = () => {};
let takeDamage          = () => {};
let gameOver            = () => {};
let showDmgPopupFloat   = () => {};
let killEnemy           = () => {};
// ── boss.js ──
let onBossDefeated      = () => {};
let startBossBattle     = () => {};
let startEnding         = () => {};
let updateBossHpBar     = () => {};
let checkBossPhase      = () => {};
let checkTriforceClear  = () => {};
let checkPendingTriforce= () => {};
let showBossHpBar       = () => {};
let hideBossHpBar       = () => {};
let showBossRoomLockEffect = () => {};
// ── 描画系（render-board.js / render-chars.js）──
let renderBoard;
let renderChars;
let addCharEl;
let moveCharEl;
let removeCharEl;
let addShieldOverlay;
let updatePlayerCharEl;

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
const { isPassable, tilePassable, isPassableForEnemy, ladderOrientationAt } = createPassable({
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

// ── 描画系（Phase 0-2 Step 3: render-board.js / render-chars.js へ切り出し）──────
// render-board は charLayerElRef.value に新しい charLayerEl を書き込み、
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
		ladderOrientationAt,
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
		movePlayer:  (dir) => movePlayer(dir),
		swordAttack: () => swordAttack(),
		startCharge:   () => startCharge(),
		releaseCharge: () => releaseCharge(),
		useSubItem:  () => useSubItem(),
		toggleFlight: () => toggleFlight(),
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
		getChargeMoveSpeedFactor: () => getChargeMoveSpeedFactor(),
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
		dealDamageToEnemy:  (e, dmg, atkType) => dealDamageToEnemy(e, dmg, atkType),
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
		dealDamageToEnemy:     (e, dmg, atkType) => dealDamageToEnemy(e, dmg, atkType),
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

// ── チャージ攻撃・剣ビーム（Phase 3-1）──────────────────────────
// addProjectile が上のブロックで設定済みなので、ここで charge factory を生成する。
{
	const _charge = createCharge({
		gameNow,
		getPlayer:           () => player,
		getHeroDir:          () => heroDir,
		getIsDialog:         () => isDialog,
		getIsPaused:         () => isPaused,
		getIsGameover:       () => isGameover,
		getIsTransitioning:  () => isTransitioning,
		addProjectile:       (config) => addProjectile(config),
		hasCleared,
	});
	startCharge        = _charge.startCharge;
	releaseCharge      = _charge.releaseCharge;
	cancelCharge       = _charge.cancelCharge;
	tickCharge         = _charge.tickCharge;
	getChargeMoveSpeedFactor = _charge.getMoveSpeedFactor;
}

// ── プレイヤー / 戦闘 / ボス（Phase 0-2b: player.js / combat.js / boss.js 統合）──
// 3 モジュールは相互依存（combat→boss の onBossDefeated、player→combat/boss の
// swordAttack/checkTriforceClear、boss→proj の showExplosionEffect）するため、
// 1 つのブロックでまとめて factory を生成し、旧インライン実装を上書きする。
// deps はすべて getter/wrapper 経由なので、後方で宣言される let（bossRoomLocked 等）も
// 呼び出し時には初期化済みで TDZ にかからない。
{
	const _boss = createBoss({
		getStageData:   () => stageData,
		getPlayer:      () => player,
		getEnemies:     () => enemies,
		setEnemies:     (v) => { enemies = v; },
		getMapData:     () => mapData,
		getCurrentLayer:() => currentLayer,
		getStageKey:    () => stageKey,
		getCharLayerEl: () => charLayerEl,
		getBossRoomLocked:  () => bossRoomLocked,
		setBossRoomLocked:  (v) => { bossRoomLocked = v; },
		getBossDefeating:   () => _bossDefeating,
		setBossDefeating:   (v) => { _bossDefeating = v; },
		getPendingTriforcePieceEl: () => _pendingTriforcePieceEl,
		setPendingTriforcePieceEl: (v) => { _pendingTriforcePieceEl = v; },
		getCellPx, toTileRow, toTileCol,
		getSS,
		getExitRegistry: () => exitRegistry,
		evaluateConditions: () => evaluateConditions(),
		lockBossDoors:   () => lockBossDoors(),
		unlockBossDoors: () => unlockBossDoors(),
		renderBoard:  () => renderBoard(),
		renderChars:  () => renderChars(),
		updateHud:    () => updateHud(),
		pulse:        (t, d) => pulse(t, d),
		saveGame:     () => saveGame(),
		stopGameLoop, startGameLoop,
		showExplosionEffect: (r, c) => showExplosionEffect(r, c),
		bossHpbarEl, bossNameEl, bossHpFillEl,
		endingOverlayEl,
		hasCleared, saveCleared,
		getPendingTriforcePos: () => pendingTriforcePos,
		setPendingTriforcePos: (v) => { pendingTriforcePos = v; },
		getCollectingTriforce: () => _collectingTriforce,
		setCollectingTriforce: (v) => { _collectingTriforce = v; },
		setIsGameover: (v) => { isGameover = v; },
	});

	const _combat = createCombat({
		getStageData:   () => stageData,
		getPlayer:      () => player,
		getEnemies:     () => enemies,
		setEnemies:     (v) => { enemies = v; },
		getCurrentLayer:() => currentLayer,
		getStageKey:    () => stageKey,
		getHeroDir:     () => heroDir,
		getCharLayerEl: () => charLayerEl,
		getIsDialog:    () => isDialog,
		getIsPaused:    () => isPaused,
		getIsGameover:  () => isGameover,
		setIsGameover:  (v) => { isGameover = v; },
		getInvincibleUntil: () => invincibleUntil,
		setInvincibleUntil: (v) => { invincibleUntil = v; },
		getLastSwordTime:   () => lastSwordTime,
		setLastSwordTime:   (v) => { lastSwordTime = v; },
		getDebugMode:   () => debugMode,
		gameNow, getCellPx,
		toTileRow, toTileCol,
		getSS,
		evaluateConditions: () => evaluateConditions(),
		removeCharEl:  (id) => removeCharEl(id),
		updateHud:     () => updateHud(),
		pulse:         (t, d) => pulse(t, d),
		saveGame:      () => saveGame(),
		stopGameLoop, startGameLoop,
		onBossDefeated:  (b) => _boss.onBossDefeated(b),
		updateBossHpBar: (b) => _boss.updateBossHpBar(b),
		checkBossPhase:  (b) => _boss.checkBossPhase(b),
		openShop:    (sd) => openShop(sd),
		startDialog: (r, c, t) => startDialog(r, c, t),
		hasCleared,
		isShieldBlockingDir:   (dx, dy) => isShieldBlockingDir(dx, dy),
		showShieldBlockEffect: (x, y) => showShieldBlockEffect(x, y),
		spawnDropEffect: (r, c, icon, color) => spawnDropEffect(r, c, icon, color),
		gameoverOverlayEl,
		openSignDialog: (sd) => openDialog(sd.name ?? '看板', sd.lines ?? ['（何も書かれていない）']),
		renderBoard:  () => renderBoard(),
		renderChars:  () => renderChars(),
	});

	const _player = createPlayer({
		getStageData:   () => stageData,
		getPlayer:      () => player,
		getEnemies:     () => enemies,
		getCurrentLayer:() => currentLayer,
		getStageKey:    () => stageKey,
		getHeroDir:     () => heroDir,
		setHeroDir:     (v) => { heroDir = v; },
		getCharLayerEl: () => charLayerEl,
		getIsDialog:    () => isDialog,
		getIsPaused:    () => isPaused,
		getIsGameover:  () => isGameover,
		getIsTransitioning: () => isTransitioning,
		getLastStonePushTime: () => lastStonePushTime,
		setLastStonePushTime: (v) => { lastStonePushTime = v; },
		getLastSwordTime:     () => lastSwordTime,
		setLastSwordTime:     (v) => { lastSwordTime = v; },
		gameNow, getCellPx,
		toTileRow, toTileCol,
		getSS,
		isPassable:   (nx, ny, axis) => isPassable(nx, ny, axis),
		tilePassable: (r, c) => tilePassable(r, c),
		checkStoneOnSwitch: () => checkStoneOnSwitch(),
		evaluateConditions: () => evaluateConditions(),
		checkStageTransition: () => checkStageTransition(),
		updatePlayerCharEl: () => updatePlayerCharEl(),
		moveCharEl:   (id, x, y) => moveCharEl(id, x, y),
		renderBoard:  () => renderBoard(),
		renderChars:  () => renderChars(),
		updateHud:    () => updateHud(),
		pulse:        (t, d) => pulse(t, d),
		saveGame:     () => saveGame(),
		stopGameLoop, startGameLoop,
		checkTriforceClear:   () => _boss.checkTriforceClear(),
		offerAtAltar:         () => _boss.offerAtAltar(),
		maybeShowSubItemHint: () => maybeShowSubItemHint(),
		getHeroSpriteName, getHeroPalName,
		hasCleared,
		updateDungeonHud: (lk) => updateDungeonHud(lk),
	});

	// factory が生成した関数で旧インライン実装を上書き
	movePlayer        = _player.movePlayer;
	handleTileEvent   = _player.handleTileEvent;
	tryPushStone      = _player.tryPushStone;
	checkSwitchOff    = _player.checkSwitchOff;
	giveSubItem       = _player.giveSubItem;
	gainHeartContainer= _player.gainHeartContainer;
	spawnDropEffect   = _player.spawnDropEffect;
	toggleFlight      = _player.toggleFlight;

	swordAttack       = _combat.swordAttack;
	dealDamageToEnemy = _combat.dealDamageToEnemy;
	takeDamage        = _combat.takeDamage;
	gameOver          = _combat.gameOver;
	showDmgPopupFloat = _combat.showDmgPopupFloat;
	killEnemy         = _combat.killEnemy;

	onBossDefeated    = _boss.onBossDefeated;
	startBossBattle   = _boss.startBossBattle;
	startEnding       = _boss.startEnding;
	updateBossHpBar   = _boss.updateBossHpBar;
	checkBossPhase    = _boss.checkBossPhase;
	checkTriforceClear= _boss.checkTriforceClear;
	checkPendingTriforce = _boss.checkPendingTriforce;
	showBossHpBar     = _boss.showBossHpBar;
	hideBossHpBar     = _boss.hideBossHpBar;
	showBossRoomLockEffect = _boss.showBossRoomLockEffect;
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

	// Phase 1-5: 遷移先ステージが無い端に出てしまった場合（飛行で木境界を
	// 越えると、隣ステージの無い縁に到達できる）はマップ内へクランプして
	// 引き戻す。これで「場外の虚空に出て詰む」のを防ぐ。
	if (newKey && !getStageData(newLayer, newKey)) {
		const margin = 0.5;
		player.x = Math.min(Math.max(x, margin), cols - 1 - margin);
		player.y = Math.min(Math.max(y, margin), rows - 1 - margin);
		moveCharEl('player', player.x, player.y);
		updatePlayerCharEl();
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
		// Phase 4-2: 隠し入口（showConditions で gate された MAP_ENTER）は、
		// 条件未達のうちは描画されないだけでなく遷移もしない（笛で出現させるまで通れない）。
		const ssTr = getSS(currentLayer, stageKey);
		if (stageData.showConditions?.[posKey] && !ssTr.conditionsMet.has(posKey)) return;
		// Phase 1-5: 暗黒の塔の入り口は翼の羽衣がないと通れない（飛行ゲート）。
		// 入り口自体が空島にあり飛行しないと到達できないが、安全策として明示判定する。
		if (enter.destId === DARK_TOWER_EXIT_ID && !player.hasWingRobe) {
			pulse('🪽 翼の羽衣が なければ 暗黒の塔へは 渡れない', 2500);
			return;
		}
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

// ── プレイヤー移動・タイルイベント・石押し・宝箱・サブアイテム付与は player.js へ ──
// ── 剣攻撃・ダメージ・撃破・ゲームオーバーは combat.js へ ──
// ── ボス戦・HPバー・撃破演出・エンディング・星の欠片収集は boss.js へ ──
//   （Phase 0-2b で旧本体を削除。factory 生成版で上書き済み）

// ── デバッグモード切り替え ─────────────────────────────────────
function toggleDebugMode() {
	debugMode = !debugMode;
	const label = debugMode ? '🛠 DEBUG ON（無敵・すり抜け）' : '🛠 DEBUG OFF';
	pulse(label, 1500);
	// HUD ラベルに [DBG] 表示
	stageLabelEl.textContent = `[${currentLayer}] ${stageKey}${debugMode ? ' [DBG]' : ''}`;
}

// ── ゲームオーバー後のリトライ ────────────────────────────────
function retryGame() {
	isGameover = isPaused = isDialog = isTransitioning = false;
	invincibleUntil = 0;
	gameoverOverlayEl.classList.add('hidden');
	player.hp = player.maxHp;
	updateHud();
	enterStage(currentLayer, stageKey, player.y, player.x);
	startGameLoop();
}

// ── クリア済みフラグ（CLEARED_KEY は constants.js から import 済み）──────────
function hasCleared() {
	return !!localStorage.getItem(CLEARED_KEY);
}

function saveCleared() {
	localStorage.setItem(CLEARED_KEY, '1');
}

// ── ショップ状態（ui.js factory が getter/setter 経由で操作）────────────────
let isShop = false;

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
	tickCharge();        // チャージゲージ更新（剣ビーム・Phase 3-1）
	enemyTick();
	projectileTick();
	bombTick();
	checkEnemyContact();
	checkPendingTriforce(); // 魔王撃破後の星の欠片収集チェック
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

// ── 笛を奏でる（Phase 4-2）─────────────────────────────────────
// 効果は現在ステージの stageData.fluteEffect で決まる：
//   { type:'reveal' } → ss.flutePlayed=true → evaluateConditions() で
//                       flutePlayed トリガーの隠しタイル（入口/アイテム）が出現
//   { type:'warp', destId } → exitRegistry[destId] のワープポイントへ移動
//   未設定           → 何も起きない（音だけ鳴る）
function playFlute() {
	if (isDialog || isPaused || isGameover || isTransitioning) return;
	resumeAudio();
	playSound('flute');  // 魔法の音色（笛の短いメロディ）
	const fx = stageData?.fluteEffect;
	if (!fx) {
		pulse('🎵 不思議な音色が響いた…… 特に何も起きない', 1800);
		return;
	}
	if (fx.type === 'reveal') {
		const ss = getSS(currentLayer, stageKey);
		if (ss.flutePlayed) { pulse('🎵 もう何かが現れている', 1500); return; }
		ss.flutePlayed = true;
		evaluateConditions();
		renderBoard(); renderChars();
		pulse(fx.message ?? '🎵 音色に応えて 何かが現れた！', 2200);
		saveGame();
		return;
	}
	if (fx.type === 'warp') {
		const dest = exitRegistry[fx.destId];
		if (!dest) { pulse('🎵 音色は響いたが 行き先が見つからない', 1800); return; }
		if (isTransitioning) return;
		isTransitioning = true;
		showFluteWarpEffect();
		playSound('stageTransition');
		saveGame();
		pulse(fx.message ?? '🎵 竜巻が巻き起こり 運ばれていく！', 2000);
		setTimeout(() => {
			enterStage(dest.layer, dest.stage, dest.row, dest.col);
			isTransitioning = false;
			mapEnterCooldownUntil = gameNow() + 1500;
		}, 400);
		return;
	}
	pulse('🎵 不思議な音色が響いた……', 1800);
}

// 笛ワープの渦巻き演出（プレイヤーの上に一時 div を出す）
function showFluteWarpEffect() {
	if (!charLayerEl) return;
	const cellPx = getCellPx();
	const el = document.createElement('div');
	el.className = 'flute-warp';
	el.style.cssText = `position:absolute;left:${(player.x - 0.5) * cellPx}px;top:${(player.y - 0.5) * cellPx}px;width:${cellPx * 2}px;height:${cellPx * 2}px;z-index:30;pointer-events:none;`;
	charLayerEl.appendChild(el);
	setTimeout(() => el.remove(), 700);
}

// ── ロウソクを使う（Phase 4-3）─────────────────────────────────
// 前方の茂み（BUSH）を燃やす（既存の cutBushes を再利用して通行可化）。
// 燃やしたら ss.bushBurned=true → evaluateConditions() で showConditions の
// 新トリガー bushBurned で gate された隠し通路/入口/アイテムが出現する。
// 前方が茂みでなければ「炎が揺らめくだけ」のメッセージのみ。
function playCandle() {
	if (isDialog || isPaused || isGameover || isTransitioning) return;
	resumeAudio();
	const [dy, dx] = DIR_DELTA[heroDir];
	const ndx = dx / MOVE_STEP;
	const ndy = dy / MOVE_STEP;
	const tr = toTileRow(player.y + ndy);
	const tc = toTileCol(player.x + ndx);
	const tile = stageData.tiles[tr]?.[tc];
	const posKey = `${tr},${tc}`;

	playSound('fire');

	if (tile !== TILE.BUSH) {
		showCandleFireEffect(player.x + ndx, player.y + ndy);
		pulse('🕯 炎が揺らめいた…… 前に燃やせる茂みはない', 1600);
		return;
	}

	const ss = getSS(currentLayer, stageKey);
	if (!ss.cutBushes) ss.cutBushes = new Set();
	if (ss.cutBushes.has(posKey)) { pulse('🕯 もう燃え尽きている', 1400); return; }

	ss.cutBushes.add(posKey);   // 茂みを燃やす（通行可化・既存パイプライン）
	ss.bushBurned = true;       // ロウソク固有：bushBurned トリガーを立てる
	evaluateConditions();       // 隠し通路/入口/アイテムを出現させる
	renderBoard(); renderChars();
	// 炎演出は renderBoard/renderChars が charLayerEl を作り直した後に出す
	// （先に出すと再描画で消えてしまうため）。
	showCandleFireEffect(player.x + ndx, player.y + ndy);
	pulse('🔥 茂みが燃え上がった！', 1800);
	saveGame();
}

// ロウソクの炎演出（前方セルに一時 div を出す）
function showCandleFireEffect(cx, cy) {
	if (!charLayerEl) return;
	const cellPx = getCellPx();
	const el = document.createElement('div');
	el.className = 'candle-fire';
	el.style.cssText = `position:absolute;left:${(cx - 0.5) * cellPx}px;top:${(cy - 0.5) * cellPx}px;width:${cellPx}px;height:${cellPx}px;z-index:25;pointer-events:none;`;
	charLayerEl.appendChild(el);
	setTimeout(() => el.remove(), 600);
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
	if (id === 'flute') {
		playFlute(); return;
	}
	if (id === 'candle') {
		playCandle(); return;
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
		hasWingRobe: false,
		flying: false,
		hasLadder: false,
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

// ゲームオーバー「リトライ」ボタン
gameoverRetryEl?.addEventListener('click', () => { retryGame(); });
// エンディング「もう一度」ボタン
endingRestartEl?.addEventListener('click', () => { location.reload(); });

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
		const psFlute    = params.get('ps_flute');
		const psCandle   = params.get('ps_candle');
		const psCleared  = params.get('ps_cleared');
		const psWingRobe = params.get('ps_wingrobe');
		const psLadder   = params.get('ps_ladder');

		if (psAtk      !== null) player.atk    = parseInt(psAtk,  10) || 2;
		if (psDef      !== null) player.def    = parseInt(psDef,  10) || 0;
		if (psRupees   !== null) player.rupees = parseInt(psRupees, 10) || 0;
		if (psTriforce !== null) player.triforceCount = parseInt(psTriforce, 10) || 0;
		if (psWeapon   === '1') { player.weapon = 'sword'; if (!player._equip) player._equip = {}; player._equip.swordName = '剣'; }
		if (psShield   === '1') player.shield = 'shield';
		if (psArmor    === '1') { player.armor  = 'armor'; if (!player._equip) player._equip = {}; player._equip.armorName = '防具'; }
		if (psWingRobe === '1') player.hasWingRobe = true;
		if (psLadder   === '1') player.hasLadder = true;
		if (psBow      === '1') { player.subItems.bow       = { count: 10 };       if (!player.activeSubItem) player.activeSubItem = 'bow'; }
		if (psBoomerang=== '1') { player.subItems.boomerang = { count: Infinity };  if (!player.activeSubItem) player.activeSubItem = 'boomerang'; }
		if (psFlute    === '1') { player.subItems.flute     = { count: Infinity };  if (!player.activeSubItem) player.activeSubItem = 'flute'; }
		if (psCandle   === '1') { player.subItems.candle    = { count: Infinity };  if (!player.activeSubItem) player.activeSubItem = 'candle'; }
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
// テスト用：飛行トグルを公開（main.js の __game から呼ぶ）
export function callToggleFlight() { return toggleFlight(); }
// テスト用：チャージ攻撃（剣ビーム）を公開（Phase 3-1）
export function callStartCharge() { return startCharge(); }
export function callReleaseCharge() { return releaseCharge(); }
export { startAnimLoop, redrawAnimSprites } from '../shared/sprites.js';

// テスト用フック（main.js 側の window.__game から呼ばれる）
export function getGameState() {
	return {
		gameTime,
		currentLayer,
		stageKey,
		player: {
			x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
			hasWingRobe: !!player.hasWingRobe, flying: !!player.flying,
			hasLadder: !!player.hasLadder,
			hasFlute: !!player.subItems?.flute,
			hasCandle: !!player.subItems?.candle,
			activeSubItem: player.activeSubItem,
		},
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
		stunUntil: e.stunUntil ?? null,
	}));
}

// テスト用：任意の座標に擬似敵を注入する
// ゲーム中の敵データに直接追加するため、DOM 要素は作らない（hp 減少だけ確認）
export function injectTestEnemy(x, y, hp = 5, w = 1, h = 1, type = 'E') {
	const id = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	enemies.push({
		id, type, // 既定 'E'（ENEMY_META にないため isBoss=false）。弱点テストは実タイプを渡す
		x, y,
		hp, maxHp: hp,
		atk: 0, def: 0,
		speed: 0,
		w, h,            // Phase 3-2: 占有セル数（大型敵テスト用）
		sprite: 'slime', pal: 'slime',
		accum: 0, dir: 'down', el: null,
	});
	return id;
}

// テスト用：指定 id の敵に直接ダメージを与える（弱点属性 Phase 3-3 の検証用）。
// atkType を渡すと弱点判定（倍率）が効く。
export function dealDamageToEnemyById(id, dmg, atkType) {
	const e = enemies.find(x => x.id === id);
	if (e) dealDamageToEnemy(e, dmg, atkType);
}

// テスト用：指定 id の敵をスタンさせる（ブーメランスタン Phase 3-4 の検証用）。
export function stunEnemyById(id, durationMs) {
	const e = enemies.find(x => x.id === id);
	if (e) e.stunUntil = gameTime + durationMs;
}

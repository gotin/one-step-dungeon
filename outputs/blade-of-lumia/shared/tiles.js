// ── Blade of Lumia – Tile Definitions ────────────────────────
// Dungeon World の全タイルを継承した上で Blade of Lumia 追加分を定義

export const TILE = {
	// 地形
	FLOOR:   '.',  // 床
	WALL:    '#',  // 壁
	WATER:   '~',  // 水（通行不可）
	// プレイヤー
	PLAYER:  '@',  // プレイヤー開始位置
	// 敵
	PATROL:    'E',  // 巡回兵（ランダム移動）
	CHASER:    'C',  // 追跡者（プレイヤーを追いかける）
	SENTRY:    'F',  // 騎士（強い追跡者）
	BOSS:      'V',  // 魔将（ボス）
	DARK_LORD: 'X',  // 魔王（最終ボス）
	// NPC（Dungeon World 継承）
	PRINCESS: 'P',   // 姫
	// ギミック（Dungeon World 継承）
	GATE:    'T',  // ゲート（スイッチで開く）
	SWITCH:  'S',  // スイッチ（踏むとゲートが開く）
	DOOR:    'D',  // 扉（鍵で開く）
	KEY:     'K',  // 鍵アイテム
	CHEST:   'B',  // 宝箱
	STONE:   '*',  // 石（押せる）

	// ── Blade of Lumia 追加タイル ─────────────────────────────
	// 壊せる壁・マップ入り口
	BREAKABLE_WALL: '!',  // 壊せる壁（爆弾で破壊可能）
	MAP_ENTER:      '>',  // 別マップへの入り口

	// NPC（複数種）
	NPC_A:     'a',  // NPC（村人など）
	NPC_B:     'b',  // NPC（商人など）
	NPC_SHOP:  '$',  // ショップ NPC

	// マップ上に落ちているアイテム（直接拾える）
	ITEM_SWORD:          '1',  // 剣
	ITEM_SHIELD:         '2',  // たて
	ITEM_ARMOR:          '3',  // 防具
	ITEM_BOOMERANG:      '4',  // ブーメラン
	ITEM_BOMB:           '5',  // 爆弾
	ITEM_BOW:            '6',  // 弓矢（将来拡張）
	ITEM_HEAL_POTION:    '7',  // 回復薬（小）
	ITEM_BIG_HEAL_POTION:'8',  // 回復薬（大）
	ITEM_HEART_CONTAINER:'9',  // ハートコンテナ
	ITEM_RUPEE:          'r',  // ルピー（小）
	ITEM_RUPEE_LARGE:    'R',  // ルピー（大）
	ITEM_TRIFORCE_PIECE: 'Q',  // トライフォースのカケラ
	// ── Phase 6.5: ドアウェイシステム ────────────────────────
	DOORWAY:        ';',  // 常時開放出入り口（ステージ境界の通路）
	DOORWAY_BOSS:   ':',  // 入室ロック型（ボス部屋専用：入ると内側から閉じる）
	DOORWAY_LOCKED: '|',  // 条件付き開放型（敵全滅・スイッチON等で開く）

	// ダンジョン専用アイテム
	ITEM_DUNGEON_MAP:    'm',  // ダンジョン地図
	ITEM_COMPASS:        'n',  // コンパス
};

// タイルのメタ情報
export const TILE_META = {
	[TILE.FLOOR]:   { label: '床',           color: '#2a3540', passable: true,  icon: '　' },
	[TILE.WALL]:    { label: '壁',           color: '#4a5560', passable: false, icon: '█' },
	[TILE.WATER]:   { label: '水',           color: '#1a3a5a', passable: false, icon: '≈' },
	[TILE.PLAYER]:  { label: 'プレイヤー開始', color: '#2a5020', passable: true,  icon: '＠' },
	// 敵
	[TILE.PATROL]:  { label: '巡回兵',       color: '#8a2a2a', passable: true,  icon: 'Ｅ' },
	[TILE.CHASER]:  { label: '追跡者',       color: '#aa2040', passable: true,  icon: 'Ｃ' },
	[TILE.SENTRY]:  { label: '騎士',         color: '#501880', passable: true,  icon: 'Ｆ' },
	[TILE.BOSS]:    { label: '魔将',         color: '#184060', passable: true,  icon: 'Ｖ' },
	[TILE.DARK_LORD]:{ label: '魔王',        color: '#0a0a18', passable: true,  icon: 'Ｘ' },
	// NPC
	[TILE.PRINCESS]:{ label: '姫',           color: '#aa4488', passable: true,  icon: '♀' },
	[TILE.NPC_A]:   { label: 'NPC（村人）',  color: '#448844', passable: true,  icon: 'Ａ' },
	[TILE.NPC_B]:   { label: 'NPC（商人）',  color: '#886644', passable: true,  icon: 'Ｂ' },
	[TILE.NPC_SHOP]:{ label: 'ショップ',     color: '#aa8800', passable: true,  icon: '＄' },
	// ギミック
	[TILE.GATE]:    { label: 'ゲート',       color: '#204060', passable: false, icon: '⊟' },
	[TILE.SWITCH]:  { label: 'スイッチ',     color: '#406020', passable: true,  icon: '⊙' },
	[TILE.DOOR]:    { label: '扉（鍵）',     color: '#604020', passable: false, icon: '⊞' },
	[TILE.KEY]:     { label: '鍵',           color: '#a08020', passable: true,  icon: '🗝' },
	[TILE.CHEST]:   { label: '宝箱',         color: '#806010', passable: true,  icon: '☐' },
	[TILE.STONE]:   { label: '石',           color: '#506070', passable: false, icon: '●' },
	// Blade of Lumia 追加
	[TILE.BREAKABLE_WALL]: { label: '壊せる壁',    color: '#3a3028', passable: false, icon: '✦' },
	[TILE.MAP_ENTER]:      { label: 'マップ入り口', color: '#202840', passable: true,  icon: '◎' },
	// アイテム
	[TILE.ITEM_SWORD]:           { label: '剣',           color: '#607080', passable: true, icon: '⚔' },
	[TILE.ITEM_SHIELD]:          { label: 'たて',         color: '#607080', passable: true, icon: '🛡' },
	[TILE.ITEM_ARMOR]:           { label: '防具',         color: '#607080', passable: true, icon: '⚚' },
	[TILE.ITEM_BOOMERANG]:       { label: 'ブーメラン',   color: '#806040', passable: true, icon: '🪃' },
	[TILE.ITEM_BOMB]:            { label: '爆弾',         color: '#404040', passable: true, icon: '💣' },
	[TILE.ITEM_BOW]:             { label: '弓矢',         color: '#605040', passable: true, icon: '🏹' },
	[TILE.ITEM_HEAL_POTION]:     { label: '回復薬（小）', color: '#206020', passable: true, icon: '🧪' },
	[TILE.ITEM_BIG_HEAL_POTION]: { label: '回復薬（大）', color: '#208020', passable: true, icon: '💊' },
	[TILE.ITEM_HEART_CONTAINER]: { label: 'ハートコンテナ',color: '#c02040', passable: true, icon: '❤' },
	[TILE.ITEM_RUPEE]:           { label: 'ルピー（小）', color: '#20a040', passable: true, icon: '◆' },
	[TILE.ITEM_RUPEE_LARGE]:     { label: 'ルピー（大）', color: '#2060c0', passable: true, icon: '◇' },
	[TILE.ITEM_TRIFORCE_PIECE]:  { label: 'トライフォースのカケラ', color: '#c0a020', passable: true, icon: '◭' },
	// Phase 6.5: ドアウェイ
	[TILE.DOORWAY]:        { label: '出入り口（常時開）',   color: '#102020', passable: true,  icon: '∪' },
	[TILE.DOORWAY_BOSS]:   { label: '出入り口（ボス部屋）', color: '#300820', passable: true,  icon: '⛩' },
	[TILE.DOORWAY_LOCKED]: { label: '出入り口（条件開）',   color: '#182030', passable: false, icon: '🚪' },
};

// タイルの一覧（パレット表示用）
export const TILE_LIST = Object.keys(TILE_META);

// デフォルトのステージサイズ
export const DEFAULT_COLS = 10;
export const DEFAULT_ROWS = 10;

// 空のステージデータを生成する
export function makeEmptyStage(cols = DEFAULT_COLS, rows = DEFAULT_ROWS) {
	return {
		cols,
		rows,
		tiles: Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => {
				if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return TILE.WALL;
				return TILE.FLOOR;
			})
		),
		links: [],
		enemyDirs: {},
		chestContents: {},
		objects: {},
		// Blade of Lumia 追加フィールド
		npcData: {},        // { "row,col": { name, lines: [] } }
		shopData: {},       // { "row,col": { name, items: [] } }
		mapEnters: {},      // { "row,col": { id, destId } }
		showConditions: {}, // { "row,col": { trigger, ... } }
		breakableWalls: {}, // { "row,col": { breakDef } }
		isBossRoom: false,
	};
}

// ワールドマップデータの雛形
export function makeEmptyWorld(worldCols = 3, worldRows = 3) {
	return {
		worldCols,
		worldRows,
		stages: [],
	};
}

// マップデータ全体の雛形（レイヤー構造）
export function makeEmptyMapData() {
	return {
		version: 1,
		layers: {
			field: {
				stages: {},
			},
		},
	};
}

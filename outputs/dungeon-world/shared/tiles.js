// ── Dungeon World – Tile Definitions ────────────────────────
// エディタとゲーム本体で共有するタイル定義

export const TILE = {
	FLOOR:   '.',  // 床
	WALL:    '#',  // 壁
	WATER:   '~',  // 水（通行不可）
	PLAYER:  '@',  // プレイヤー開始位置
	// 敵
	PATROL:    'E',  // 巡回兵（ランダム移動）
	CHASER:    'C',  // 追跡者（プレイヤーを追いかける）
	SENTRY:    'F',  // 騎士（強い追跡者）
	BOSS:      'V',  // 魔将（最強の追跡者）
	DARK_LORD: 'X',  // 魔王（オーラを纏う最強敵）
	// ギミック
	GATE:    'T',  // ゲート（スイッチで開く）
	SWITCH:  'S',  // スイッチ（踏むとゲートが開く）
	DOOR:    'D',  // 扉（鍵で開く）
	KEY:     'K',  // 鍵アイテム
	CHEST:   'B',  // 宝箱
	STONE:   '*',  // 石（押せる）
};

// タイルのメタ情報
export const TILE_META = {
	[TILE.FLOOR]:  { label: '床',         color: '#2a3540', passable: true,  icon: '　' },
	[TILE.WALL]:   { label: '壁',         color: '#4a5560', passable: false, icon: '█' },
	[TILE.WATER]:  { label: '水',         color: '#1a3a5a', passable: false, icon: '≈' },
	[TILE.PLAYER]: { label: 'プレイヤー開始', color: '#2a5020', passable: true,  icon: '＠' },
	[TILE.PATROL]: { label: '巡回兵',     color: '#8a2a2a', passable: true,  icon: 'Ｅ' },
	[TILE.CHASER]: { label: '追跡者',     color: '#aa2040', passable: true,  icon: 'Ｃ' },
	[TILE.SENTRY]: { label: '騎士',       color: '#501880', passable: true,  icon: 'Ｆ' },
	[TILE.BOSS]:      { label: '魔将', color: '#184060', passable: true,  icon: 'Ｖ' },
	[TILE.DARK_LORD]: { label: '魔王', color: '#0a0a18', passable: true,  icon: 'Ｘ' },
	[TILE.GATE]:   { label: 'ゲート',     color: '#204060', passable: false, icon: '⊟' },
	[TILE.SWITCH]: { label: 'スイッチ',   color: '#406020', passable: true,  icon: '⊙' },
	[TILE.DOOR]:   { label: '扉（鍵）',   color: '#604020', passable: false, icon: '⊞' },
	[TILE.KEY]:    { label: '鍵',         color: '#a08020', passable: true,  icon: '🗝' },
	[TILE.CHEST]:  { label: '宝箱',       color: '#806010', passable: true,  icon: '☐' },
	[TILE.STONE]:  { label: '石',         color: '#506070', passable: false, icon: '●' },
};

// タイルの一覧（パレット表示用）
export const TILE_LIST = Object.keys(TILE_META);

// デフォルトのステージサイズ
export const DEFAULT_COLS = 10;
export const DEFAULT_ROWS = 10;

// オブジェクトレイヤーとして置ける要素
// 「床タイルの上に重ねて置ける」オブジェクト
export const OBJECT = {
	STONE: '*',  // 石（スイッチや床の上に乗っている）
};

// オブジェクトのメタ情報
export const OBJECT_META = {
	[OBJECT.STONE]: { label: '石（上乗せ）', icon: '●', color: '#506070' },
};

// 空のステージデータを生成する
export function makeEmptyStage(cols = DEFAULT_COLS, rows = DEFAULT_ROWS) {
	return {
		cols,
		rows,
		// tiles: 2次元配列 [row][col] = TILE文字
		tiles: Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => {
				// 外周は壁、内側は床
				if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return TILE.WALL;
				return TILE.FLOOR;
			})
		),
		// ゲートとスイッチの対応関係 [{ gateId, switchId }]
		links: [],
		// 敵の初期向き設定 { "row,col": "up"|"down"|"left"|"right" }
		enemyDirs: {},
		// 宝箱の内容 { "row,col": { type: "weapon"|"armor"|"hp", name, value } }
		chestContents: {},
		// オブジェクトレイヤー: タイルの上に重ねて置くオブジェクト
		// { "row,col": OBJECT文字 } 例: { "3,4": "*" } = (col4,row3)に石
		objects: {},
	};
}

// ワールドマップデータの雛形
export function makeEmptyWorld(worldCols = 3, worldRows = 3) {
	return {
		worldCols,
		worldRows,
		// stages: 存在するステージの座標リスト [{ x, y }]
		stages: [],
	};
}

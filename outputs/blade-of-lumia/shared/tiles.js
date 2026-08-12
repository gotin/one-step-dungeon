// ── Blade of Lumia – Tile Definitions ────────────────────────
// Dungeon World の全タイルを継承した上で Blade of Lumia 追加分を定義

export const TILE = {
	// 地形
	FLOOR:   '.',  // 床
	WALL:    '#',  // 壁
	WATER:   '~',  // 水（通行不可）
	LAVA:    'l',  // 溶岩（通行不可・水と全く同じ挙動＝飛行/はしごで越える・投擲物は飛び越える。見た目のみ赤橙）
	// プレイヤー
	PLAYER:  '@',  // プレイヤー開始位置
	// 敵
	PATROL:    'E',  // 巡回兵（ランダム移動）
	CHASER:    'C',  // 追跡者（プレイヤーを追いかける）
	SENTRY:    'F',  // 騎士（強い追跡者）
	// ── Phase 5.5k: 新規の陸上通常敵15種はギリシャ小文字/大文字を1文字タイルに使う ──
	// 理由＝ASCII の空き文字は残り14個しか無く（英字 A-Z は全て使用済み・空きは
	// j q y z 0 と記号 " + , - ? _ ` } ' だけ）、敵15種でちょうど使い切ってしまう＝
	// 今後のギミック/地形タイル（氷ダンジョン等）に1文字も残らない。タイル文字は
	// 「文字列の1要素」としてしか扱われないので（コード中に charCodeAt / A-Z の
	// 文字クラス判定は無い・tiles は文字の配列）非 ASCII の BMP 1文字でも動く。
	// ラテン文字と紛らわしい字形（ε ι κ ν ο ρ τ υ γ χ）は除外する＝マップの
	// ダンプを目で読むときに o/ο・v/ν を見間違えるのを防ぐ。
	SKELETON:    'θ',  // 骸骨剣士（陸上通常敵・徘徊近接＋ガード）
	SWORD_BEAST: 'μ',  // 剣獣（陸上通常敵の最強格・高速接近＋飛ぶ斬撃＝剣ビーム）
	BOSS:      'V',  // 魔将（ボス）
	MONSTER:   'W',  // 魔物（中ボス）
	DARK_LORD: 'X',  // 魔王（ダンジョンボス・星の欠片を落とす）
	ZARNEL:    'Z',  // ザーネル（ラスボス・撃破でエンディング。Phase 1-3）
	ROCK_GOLEM:   'G',  // 岩のゴーレム（2×2 大型ボス・dungeon_1）
	SAND_SCORPION:'N',  // 砂嵐の蠍王（2×2 大型ボス・dungeon_2）
	SEA_SERPENT:  'J',  // 深海の海蛇（2×2 大型ボス・dungeon_3）
	FIRE_SALAMANDER:'A',  // 炎のサラマンドラ（2×2 大型ボス・dungeon_4）
	ICE_LEVIATHAN:'L',  // 氷のリヴァイアサン（2×2 大型ボス・dungeon_5）
	FOREST_GIANT: 'O',  // 古森の巨人（2×2 大型ボス・dungeon_6）
	STORM_EAGLE:  'U',  // 嵐の鷲王（2×2 大型ボス・dungeon_7）
	SWAMP_TOAD:   'I',  // 沼地の大蝦蟇（2×2 大型ボス・cave_1）
	// ── Phase 9-6 深洋O: 海棲雑魚（記号タイル。英大文字 A〜Z は全て使用済み＝
	//   ユーザー確定で記号タイルを敵に割り当てる。色スイッチ [ ] ( ) が記号タイルの前例）──
	FISH_SCHOOL:  '&',  // 魚群（水棲・低HP多数で包囲する雑魚。水しか泳げない＝陸に上がれない）
	LURK_SHARK:   '<',  // 潜み鮫（水棲・接近型。潜行↔浮上を繰り返す＝潜行中は無敵で寄ってくる）
	ARCHER_FISH:  '/',  // 射水魚（水棲・遠隔型。水中から水弾を任意角で飛ばす＝陸のプレイヤーを狙う）
	SEA_LORD:     '{',  // 海の主（両生・2×2 ミニボス。聖域の門番＝倒さず「認められる」＝欠片は落とさない）
	// NPC（Dungeon World 継承）
	PRINCESS: 'P',   // 姫
	// ギミック（Dungeon World 継承）
	GATE:    'T',  // ゲート（ボタン/スイッチで開く）
	BUTTON:  'S',  // ボタン（プレイヤー/石が乗っている間だけ ON＝モーメンタリ式。離すと OFF）
	SWITCH:  'Y',  // スイッチ（矢や剣など武器の攻撃で ON↔OFF をトグル。攻撃するまで状態維持。Phase 4-5 ①）
	DOOR:    'D',  // 扉（鍵で開く）
	KEY:     'K',  // 鍵アイテム
	CHEST:   'B',  // 宝箱
	STONE:   '*',  // 石（押せる）

	// ── Blade of Lumia 追加タイル ─────────────────────────────
	// 壊せる壁・マップ入り口
	BREAKABLE_WALL: '!',  // 壊せる壁（爆弾で破壊可能）
	MAP_ENTER:      '>',  // 別マップへの入り口
	ALTAR:          '^',  // 古代の祭壇（星の欠片を全部捧げると翼の羽衣を授かる。Phase 1-4）
	SKY:            '%',  // 空（虚空）。徒歩では通れない。翼の羽衣で飛行中のみ越えられる（Phase 1-5）
	PIT:            'x',  // 穴（落とし穴）。徒歩では通れない。はしごで両隣が地上の1セルだけ渡れる（Phase 4-1）
	TORCH:          'H',  // かがり火（点灯/消灯。ブーメランで炎を運べる。Phase 4-5 ②）

	// ── Phase 5-1: 色スイッチ・色ゲート（色セレクタ式） ──────────
	SWITCH_RED:  '[',  // 色スイッチ（赤）。武器で叩くと ss.activeColor = 'red'
	SWITCH_BLUE: ']',  // 色スイッチ（青）。武器で叩くと ss.activeColor = 'blue'
	GATE_RED:    '(',  // 色ゲート（赤）。activeColor==='red' のときだけ通行可（開く）
	GATE_BLUE:   ')',  // 色ゲート（青）。activeColor==='blue' のときだけ通行可（開く）

	// ── Phase 9-6 深洋O: 潮ゲート（潮の満ち引き・スイッチ式／タイマー無し） ──
	// GATE(T) と同じ links→openGates 機構で開閉する（リアルタイム tick 不要）。
	// 閉（openGates に無い）＝潮が満ちて水（徒歩不可・飛行で越え可・はしご不可）／
	// 開（openGates に有る）＝潮が引いて床（通行可）。GATE との違いは「閉じたときの
	// 見た目と挙動が『壁』ではなく『水』」である点だけ。
	TIDE_GATE:   '=',  // 潮ゲート。スイッチ/ボタン ON で潮が引き通行可になる

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
	ITEM_HEART_CONTAINER:'9',  // ハートの器
	ITEM_RUPEE:          'r',  // ルピー（小）
	ITEM_RUPEE_LARGE:    'R',  // ルピー（大）
	ITEM_TRIFORCE_PIECE: 'Q',  // 星の欠片
	// ── Phase 6.5: ドアウェイシステム ────────────────────────
	DOORWAY:        ';',  // 常時開放出入り口（ステージ境界の通路）
	DOORWAY_BOSS:   ':',  // 入室ロック型（ボス部屋専用：入ると内側から閉じる）
	DOORWAY_LOCKED: '|',  // 条件付き開放型（敵全滅・スイッチON等で開く）

	// ダンジョン専用アイテム
	ITEM_DUNGEON_MAP:    'm',  // ダンジョン地図
	ITEM_COMPASS:        'n',  // コンパス

	// ── Phase 8: フィールドタイル ──────────────────────────────
	// 地形（通行可）
	GRASS:       'g',  // 草地（フィールド基本地面）
	SAND:        'd',  // 砂地・砂漠
	STONE_FLOOR: 'o',  // 石畳（町・城内）
	BRIDGE:      'v',  // 橋（水の上を渡れる）
	SNOW:        's',  // 雪原（通行可・白系）
	ASH:         'c',  // 火山灰/岩肌（通行可・黒赤系）
	MUD:         'w',  // 泥/沼床（通行可・暗緑褐色）
	// 地形（通行不可）
	TREE:        't',  // 木（通行不可）
	MOUNTAIN:    'M',  // 山（通行不可）
	BUSH:        'u',  // 茂み（剣で切れる → GRASS 化）
	FENCE:       'f',  // 柵（通行不可）
	// 建物系
	HOUSE_WALL:  'h',  // 家の外壁（通行不可）
	HOUSE_DOOR:  'e',  // 家のドア（通行可）
	HOUSE_ROOF:  'p',  // 家の屋根（通行不可）
	SIGN:        'i',  // 看板（通行可・近づいて読める）
};

// タイルのメタ情報
export const TILE_META = {
	[TILE.FLOOR]:   { label: '床',           color: '#2a3540', passable: true,  icon: '　' },
	[TILE.WALL]:    { label: '壁',           color: '#4a5560', passable: false, icon: '█' },
	[TILE.WATER]:   { label: '水',           color: '#1a3a5a', passable: false, icon: '≈' },
	[TILE.LAVA]:    { label: '溶岩',         color: '#8a2a10', passable: false, icon: '≈' },
	[TILE.PLAYER]:  { label: 'プレイヤー開始', color: '#2a5020', passable: true,  icon: '＠' },
	// 敵
	[TILE.PATROL]:  { label: '巡回兵',       color: '#8a2a2a', passable: true,  icon: 'Ｅ' },
	[TILE.CHASER]:  { label: '追跡者',       color: '#aa2040', passable: true,  icon: 'Ｃ' },
	[TILE.SENTRY]:  { label: '騎士',         color: '#501880', passable: true,  icon: 'Ｆ' },
	[TILE.SKELETON]:{ label: '骸骨剣士',     color: '#c9a06a', passable: true,  icon: '骸' },
	[TILE.SWORD_BEAST]:{ label: '剣獣',      color: '#a02838', passable: true,  icon: '獣' },
	[TILE.BOSS]:    { label: '魔将',         color: '#184060', passable: true,  icon: 'Ｖ' },
	[TILE.MONSTER]: { label: '魔物',         color: '#2a1060', passable: true,  icon: 'Ｗ' },
	[TILE.DARK_LORD]:{ label: '魔王',        color: '#0a0a18', passable: true,  icon: 'Ｘ' },
	[TILE.ZARNEL]:  { label: 'ザーネル',     color: '#180828', passable: true,  icon: 'Ｚ' },
	[TILE.ROCK_GOLEM]:     { label: '岩のゴーレム',         color: '#3a3026', passable: true, icon: 'Ｇ' },
	[TILE.SAND_SCORPION]:  { label: '砂嵐の蠍王',           color: '#6a4010', passable: true, icon: 'Ｎ' },
	[TILE.SEA_SERPENT]:    { label: '深海の海蛇',           color: '#0a2848', passable: true, icon: 'Ｊ' },
	[TILE.FIRE_SALAMANDER]:{ label: '炎のサラマンドラ',     color: '#6a1008', passable: true, icon: 'Ａ' },
	[TILE.ICE_LEVIATHAN]:  { label: '氷のリヴァイアサン',   color: '#0a2850', passable: true, icon: 'Ｌ' },
	[TILE.FOREST_GIANT]:   { label: '古森の巨人',           color: '#1a3c14', passable: true, icon: 'Ｏ' },
	[TILE.STORM_EAGLE]:    { label: '嵐の鷲王',             color: '#1e2840', passable: true, icon: 'Ｕ' },
	[TILE.SWAMP_TOAD]:     { label: '沼地の大蝦蟇',         color: '#274a1e', passable: true, icon: 'Ｉ' },
	[TILE.FISH_SCHOOL]:    { label: '魚群',                 color: '#1a6a7a', passable: true, icon: '＆' },
	[TILE.LURK_SHARK]:     { label: '潜み鮫',               color: '#14485c', passable: true, icon: '＜' },
	[TILE.ARCHER_FISH]:    { label: '射水魚',               color: '#2a7a9a', passable: true, icon: '／' },
	[TILE.SEA_LORD]:       { label: '海の主',               color: '#123a5a', passable: true, icon: '｛' },
	// NPC
	[TILE.PRINCESS]:{ label: '姫',           color: '#aa4488', passable: true,  icon: '♀' },
	[TILE.NPC_A]:   { label: 'NPC（村人）',  color: '#448844', passable: true,  icon: 'Ａ' },
	[TILE.NPC_B]:   { label: 'NPC（商人）',  color: '#886644', passable: true,  icon: 'Ｂ' },
	[TILE.NPC_SHOP]:{ label: 'ショップ',     color: '#aa8800', passable: true,  icon: '＄' },
	// ギミック
	[TILE.GATE]:    { label: 'ゲート',       color: '#204060', passable: false, icon: '⊟' },
	[TILE.BUTTON]:  { label: 'ボタン',       color: '#406020', passable: true,  icon: '⊙' },
	[TILE.SWITCH]:  { label: 'スイッチ',     color: '#604060', passable: true,  icon: '◎' },
	[TILE.DOOR]:    { label: '扉（鍵）',     color: '#604020', passable: false, icon: '⊞' },
	[TILE.KEY]:     { label: '鍵',           color: '#a08020', passable: true,  icon: '🗝' },
	[TILE.CHEST]:   { label: '宝箱',         color: '#806010', passable: true,  icon: '☐' },
	[TILE.STONE]:   { label: '石',           color: '#506070', passable: false, icon: '●' },
	// Blade of Lumia 追加
	[TILE.BREAKABLE_WALL]: { label: '壊せる壁',    color: '#3a3028', passable: false, icon: '✦' },
	[TILE.MAP_ENTER]:      { label: 'マップ入り口', color: '#202840', passable: true,  icon: '◎' },
	[TILE.ALTAR]:          { label: '古代の祭壇',  color: '#4a3a6a', passable: true,  icon: '⛩' },
	[TILE.SKY]:            { label: '空（飛行）',  color: '#0a0a20', passable: false, icon: '☁' },
	[TILE.PIT]:            { label: '穴（はしご）', color: '#050608', passable: false, icon: '□' },
	[TILE.TORCH]:          { label: 'かがり火',    color: '#6a3010', passable: false, icon: '🔥' },
	// Phase 5-1
	[TILE.SWITCH_RED]:  { label: '色スイッチ（赤）', color: '#602020', passable: true,  icon: '◎' },
	[TILE.SWITCH_BLUE]: { label: '色スイッチ（青）', color: '#203060', passable: true,  icon: '◎' },
	[TILE.GATE_RED]:    { label: '色ゲート（赤）',   color: '#601010', passable: false, icon: '⊟' },
	[TILE.GATE_BLUE]:   { label: '色ゲート（青）',   color: '#102050', passable: false, icon: '⊟' },
	// Phase 9-6 深洋O: 潮ゲート（閉＝水／開＝床。デフォルトは閉＝通行不可）
	[TILE.TIDE_GATE]:   { label: '潮ゲート',         color: '#1a3a5a', passable: false, icon: '≋' },
	// アイテム
	[TILE.ITEM_SWORD]:           { label: '剣',           color: '#607080', passable: true, icon: '⚔' },
	[TILE.ITEM_SHIELD]:          { label: 'たて',         color: '#607080', passable: true, icon: '🛡' },
	[TILE.ITEM_ARMOR]:           { label: '防具',         color: '#607080', passable: true, icon: '⚚' },
	[TILE.ITEM_BOOMERANG]:       { label: 'ブーメラン',   color: '#806040', passable: true, icon: '🪃' },
	[TILE.ITEM_BOMB]:            { label: '爆弾',         color: '#404040', passable: true, icon: '💣' },
	[TILE.ITEM_BOW]:             { label: '弓矢',         color: '#605040', passable: true, icon: '🏹' },
	[TILE.ITEM_HEAL_POTION]:     { label: '回復薬（小）', color: '#206020', passable: true, icon: '🧪' },
	[TILE.ITEM_BIG_HEAL_POTION]: { label: '回復薬（大）', color: '#208020', passable: true, icon: '💊' },
	[TILE.ITEM_HEART_CONTAINER]: { label: 'ハートの器',color: '#c02040', passable: true, icon: '❤' },
	[TILE.ITEM_RUPEE]:           { label: 'ルピー（小）', color: '#20a040', passable: true, icon: '◆' },
	[TILE.ITEM_RUPEE_LARGE]:     { label: 'ルピー（大）', color: '#2060c0', passable: true, icon: '◇' },
	[TILE.ITEM_TRIFORCE_PIECE]:  { label: '星の欠片', color: '#c0a020', passable: true, icon: '◭' },
	[TILE.ITEM_DUNGEON_MAP]:     { label: 'ダンジョン地図', color: '#205080', passable: true, icon: '🗺' },
	[TILE.ITEM_COMPASS]:         { label: 'コンパス',       color: '#2050a0', passable: true, icon: '🧭' },
	// Phase 6.5: ドアウェイ
	[TILE.DOORWAY]:        { label: '出入り口（常時開）',   color: '#102020', passable: true,  icon: '∪' },
	[TILE.DOORWAY_BOSS]:   { label: '出入り口（ボス部屋）', color: '#300820', passable: true,  icon: '⛩' },
	[TILE.DOORWAY_LOCKED]: { label: '出入り口（条件開）',   color: '#182030', passable: false, icon: '🚪' },
	// Phase 8: フィールドタイル
	[TILE.GRASS]:       { label: '草地',       color: '#3a6e28', passable: true,  icon: '🌿' },
	[TILE.SAND]:        { label: '砂地',       color: '#c8a84a', passable: true,  icon: '﹒' },
	[TILE.STONE_FLOOR]: { label: '石畳',       color: '#6a6878', passable: true,  icon: '▦' },
	[TILE.BRIDGE]:      { label: '橋',         color: '#8a6030', passable: true,  icon: '〓' },
	[TILE.TREE]:        { label: '木',         color: '#1a4810', passable: false, icon: '🌲' },
	[TILE.MOUNTAIN]:    { label: '山',         color: '#6a6060', passable: false, icon: '▲' },
	[TILE.BUSH]:        { label: '茂み',       color: '#2a6018', passable: false, icon: '🌿' },
	[TILE.FENCE]:       { label: '柵',         color: '#8a6830', passable: false, icon: '╫' },
	[TILE.HOUSE_WALL]:  { label: '家の外壁',   color: '#c09060', passable: false, icon: '⊡' },
	[TILE.HOUSE_DOOR]:  { label: '家のドア',   color: '#8a4020', passable: true,  icon: '⊟' },
	[TILE.HOUSE_ROOF]:  { label: '家の屋根',   color: '#c03020', passable: false, icon: '△' },
	[TILE.SIGN]:        { label: '看板',       color: '#b08040', passable: true,  icon: '📋' },
	// Phase 9-4a: テーマ地形タイル
	[TILE.SNOW]:        { label: '雪原',       color: '#c8dce8', passable: true,  icon: '❄' },
	[TILE.ASH]:         { label: '火山灰',     color: '#4a3028', passable: true,  icon: '▪' },
	[TILE.MUD]:         { label: '泥/沼床',   color: '#3a4a28', passable: true,  icon: '∿' },
};

// タイルの一覧（パレット表示用）
export const TILE_LIST = Object.keys(TILE_META);

// デフォルトのステージサイズ
export const DEFAULT_COLS = 12;
export const DEFAULT_ROWS = 10;

// フィールド地形タイル（bgTiles に書き込む通行可タイル）
export const BG_TILES = new Set([
	TILE.FLOOR, TILE.GRASS, TILE.SAND, TILE.STONE_FLOOR, TILE.BRIDGE,
	TILE.SNOW, TILE.ASH, TILE.MUD,
	// Phase 9-6 深洋O: 水は「地形」なので bgTiles 層に置ける（下地）。これにより
	// 敵（tiles 層）と水（bgTiles 層）が同一セルに共存できる＝水棲敵を水上に立たせられる。
	// tilePassable は bgTiles 水も不通と判定する（passable.js の isWaterAt）。
	TILE.WATER,
]);

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
		// bgTiles: 背景地形レイヤー。キー "r,c" → タイル文字。省略時は FLOOR 扱い
		bgTiles: {},
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

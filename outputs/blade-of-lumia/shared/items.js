// ── Blade of Lumia – Item Definitions ────────────────────────

// ── 剣ティア定義（Phase 7-1）── 剣の段階の単一の真実 ─────────
// player.swordTier (-1=剣なし, 0..3=ティア) で管理する。
// player.atk = BASE_ATK + SWORD_TIERS[tier].atk で再計算する（加算廃止）。
export const SWORD_TIERS = [
	// index 0: 木の剣
	{ key: 'wood',   name: '木の剣',  atk: 2,  sprite: 'swordWood',   pal: 'swordWood',
	  beam: false, pierce: false },
	// index 1: 銅の剣
	{ key: 'bronze', name: '銅の剣',  atk: 4,  sprite: 'swordBronze', pal: 'swordBronze',
	  beam: true,  pierce: false },
	// index 2: 銀の剣
	{ key: 'silver', name: '銀の剣',  atk: 7,  sprite: 'swordSilver', pal: 'swordSilver',
	  beam: true,  pierce: false },
	// index 3: 聖剣
	{ key: 'holy',   name: '聖剣',    atk: 12, sprite: 'swordHoly',   pal: 'swordHoly',
	  beam: true,  pierce: true  },
];
export const BASE_ATK = 2;  // 剣なし時の基礎ATK

// ── 防具ティア定義（Phase 7-2）── 防具の段階の単一の真実 ─────
// player.armorTier (-1=防具なし, 0..2=ティア) で管理する。
// player.def = BASE_DEF + ARMOR_TIERS[tier].def で再計算する（加算廃止）。
// 剣（SWORD_TIERS）と同型：ティア番号で持ち替え判定する（下位は無視）。
export const ARMOR_TIERS = [
	// index 0: 布の服
	{ key: 'cloth',  name: '布の服',     def: 2, sprite: 'armorCloth',  pal: 'armorCloth'  },
	// index 1: 鎖かたびら
	{ key: 'chain',  name: '鎖かたびら', def: 4, sprite: 'armorChain',  pal: 'armorChain'  },
	// index 2: 伝説の鎧
	{ key: 'legend', name: '伝説の鎧',   def: 7, sprite: 'armorLegend', pal: 'armorLegend' },
];
export const BASE_DEF = 0;  // 防具なし時の基礎DEF

// ── 盾ティア定義（Phase 7-2）── 盾の段階の単一の真実 ─────────
// player.shieldTier (-1=盾なし, 0..2=ティア) で管理する。
// 正面ブロック（完全ブロック）は全ティア共通。剣振り中・チャージ中は盾オフ。
// reflect: 正面ブロック成立時に敵の「投擲物」を打ち返す係数（0=跳ね返さない）。
//   跳ね返した投擲物は owner→player・atk=元atk×reflect で敵に当たる（剣＝近接はガードのみ）。
export const SHIELD_TIERS = [
	// index 0: 木の盾（ガードのみ）
	{ key: 'wood',   name: '木の盾',         sprite: 'shieldWood',   pal: 'shieldWood',   reflect: 0   },
	// index 1: 鉄の盾（跳ね返し 0.5 倍）
	{ key: 'iron',   name: '鉄の盾',         sprite: 'shieldIron',   pal: 'shieldIron',   reflect: 0.5 },
	// index 2: ミラーシールド（跳ね返し 1.0 倍）
	{ key: 'mirror', name: 'ミラーシールド', sprite: 'shieldMirror', pal: 'shieldMirror', reflect: 1.0 },
];

// ── ITEM_META: サブアイテム定義 ───────────────────────────────
export const ITEM_META = {
	boomerang: {
		name: 'ブーメラン', icon: '🪃', sprite: 'boomerang',
		type: 'throwable',
		breakPower: 0,
		uses: Infinity,    // 回数無制限（戻ってきたら再使用可）
	},
	bomb: {
		name: '爆弾', icon: '💣', sprite: 'bomb',
		type: 'placeable',
		breakPower: 3,
		aoeRadius: 2,      // 爆風半径（セル）
		damage: 20,
		uses: null,        // スタック数で管理
	},
	bow: {
		name: '弓矢', icon: '🏹', sprite: 'arrow',
		type: 'throwable',
		breakPower: 0,
		piercing: true,    // 貫通
		uses: null,
	},
	healPotion: {
		name: '回復薬（小）', icon: '🧪', sprite: 'healPotion',
		type: 'consumable',
		healAmount: 5,
		uses: null,
	},
	bigHealPotion: {
		name: '回復薬（大）', icon: '💊', sprite: 'bigHealPotion',
		type: 'consumable',
		healAmount: 999,   // HP 全回復
		uses: null,
	},
	dungeonMap: {
		name: '地図', icon: '🗺', sprite: 'dungeonMap',
		type: 'passive',
		uses: null,
	},
	compass: {
		name: 'コンパス', icon: '🧭', sprite: 'compass',
		type: 'passive',
		uses: null,
	},
	heartContainer: {
		name: 'ハートの器', icon: '❤', sprite: 'heart', pal: 'heart',
		type: 'passive',
		uses: null,
	},
	flute: {
		// Phase 4-2: 笛。active サブアイテム（使うと魔法の音色を奏でる）。
		// 効果はステージ単位の stageData.fluteEffect で決まる：
		//   reveal → 隠しダンジョン入口/隠しアイテムが出現（showConditions の
		//            flutePlayed トリガーで gate されたタイルを表示）
		//   warp   → exitRegistry[destId] のワープポイントへ移動
		// hasFlute フラグは作らず subItems.flute で管理（boomerang と同型）。
		name: '笛', icon: '🎵', sprite: 'flute', pal: 'flute',
		type: 'magic',
		uses: Infinity,
	},
	candle: {
		// Phase 4-3: ロウソク。active サブアイテム（使うと前方の茂みを燃やす）。
		// 既存の「茂み切り」(cutBushes) を再利用して前方の BUSH を燃やし通行可化する。
		// さらに燃やすとステージ単位の ss.bushBurned=true を立て、showConditions の
		// 新トリガー bushBurned で gate された隠し通路/入口/アイテムを出現させる
		// （笛の flutePlayed と同型）。剣で切っても bushBurned は立たない＝ロウソク固有
		// の発見役割。hasCandle フラグは作らず subItems.candle で管理（flute と同型）。
		name: 'ロウソク', icon: '🕯', sprite: 'candle', pal: 'candle',
		type: 'magic',
		uses: Infinity,
	},
	ladder: {
		// Phase 4-1: はしご。所持しているだけで効果を発揮する「自動わたり」装備。
		// サブアイテムスロットでは使わず player.hasLadder フラグで管理する
		// （hasWingRobe と同型）。両隣が地上の水/穴を1セルだけ自動で渡れる。
		name: 'はしご', icon: '🪜', sprite: 'ladder', pal: 'ladder',
		type: 'passive',
		uses: null,
	},
};

// ── 各攻撃の breakPower ────────────────────────────────────────
export const ATTACK_BREAK_POWER = {
	sword:     0,  // 剣では壊せない
	boomerang: 0,  // ブーメランでは壊せない
	bow:       0,  // 弓矢では壊せない
	bomb:      3,  // 爆弾なら壊せる（breakDef <= 2 を破壊）
	// 将来拡張: hammer: 5
};

// ── 装備メタ ────────────────────────────────────────────────────
export const EQUIP_META = {
	sword: {
		name: '剣', icon: '⚔', slot: 'weapon',
		atkBonus: 2,
	},
	shield: {
		name: 'たて', icon: '🛡', slot: 'shield',
		damageReduction: 0.5,  // 防御中ダメージ50%軽減
	},
	armor: {
		name: '防具', icon: '⚚', slot: 'armor',
		defBonus: 2,
	},
};

// ── ルピー額面 ───────────────────────────────────────────────────
export const RUPEE_VALUE = {
	rupee:      1,
	rupeeBlue:  5,
};

// ── スタック上限 ─────────────────────────────────────────────────
export const ITEM_STACK_MAX = {
	bomb:          10,
	bow:           30,   // 矢の本数
	healPotion:    9,
	bigHealPotion: 3,
};

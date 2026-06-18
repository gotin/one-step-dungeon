// ── Blade of Lumia – Item Definitions ────────────────────────

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

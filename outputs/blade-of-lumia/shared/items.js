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
	// index 4: ルミアの剣（寄道「魔王の岩牢」の主 X の討伐報酬・0o-2・2026-09-05）
	// ⚠️ ATK は最小の刻み（+2）だけ上げる＝ユーザー確定「攻撃力はちょっとだけの強化に
	//    して、ビームのため時間を短くしよう」∴この剣の売りは火力ではなく**溜めの速さ**。
	// chargeMs … 満タンビームまでの所要時間（ms）。**この列を持つのはこのティアだけ**で、
	//    書かないティアは `game/charge.js` の既定（`CHARGE_FULL_MS` 720）に落ちる。
	//    ⚠️ 読み手は `game/charge.js getChargeRatio()` と `scripts/audit-balance.mjs`
	//    `statsOf()` の2か所だけ＝定数を直接読む箇所を残すと「表に書いたのに効かない
	//    死んだ数」になる（`guardRange` で踏んだのと同型）。
	{ key: 'lumia',  name: 'ルミアの剣', atk: 14, sprite: 'swordLumia', pal: 'swordLumia',
	  beam: true,  pierce: true, chargeMs: 480 },
];
export const BASE_ATK = 2;  // 剣なし時の基礎ATK

// ── 防具ティア定義（Phase 7-2）── 防具の段階の単一の真実 ─────
// player.armorTier (-1=防具なし, 0..2=ティア) で管理する。
// player.def = BASE_DEF + ARMOR_TIERS[tier].def で再計算する（加算廃止）。
// 剣（SWORD_TIERS）と同型：ティア番号で持ち替え判定する（下位は無視）。
// ⚠️ Phase 8-4（2026-08-23）で def 2/4/7 → 1/2/3 に下げた。理由＝被弾は
//    `max(1, atk - def)` の**減算**∴def 4 は敵の atk 3-4 を丸ごと食い切って
//    「どの敵に触っても 1 ダメージ」になっていた（雑魚も鎧も差が消える）。
//    敵の atk 帯（1-8）に対して 1/2/3 なら軽減が効きつつ床（1）に張り付かない。
export const ARMOR_TIERS = [
	// index 0: 布の服
	{ key: 'cloth',  name: '布の服',     def: 1, sprite: 'armorCloth',  pal: 'armorCloth'  },
	// index 1: 鎖かたびら
	{ key: 'chain',  name: '鎖かたびら', def: 2, sprite: 'armorChain',  pal: 'armorChain'  },
	// index 2: 伝説の鎧
	{ key: 'legend', name: '伝説の鎧',   def: 3, sprite: 'armorLegend', pal: 'armorLegend' },
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

// ── ブーメランティア定義（Phase 9-6 深洋O）── ブーメランの段階の単一の真実 ──
// player.boomerangTier (-1=未所持, 0..1=ティア) で管理する。
// 「銀のブーメラン」を別サブアイテムにせず**木のブーメランを置き換える**（ユーザー確定
// 2026-07-26）。理由＝サブアイテム枠を2つ使うと「木と銀を持ち替える」無意味な選択が
// 生まれる。剣/防具/盾（SWORD_TIERS 等）と同じティア方式に揃える＝下位は拾っても無視。
//   atk      … ブーメランの固定ダメージ（剣 ATK は使わない）
//   speed    … 飛翔速度（projectile.js boomerangStep が proj.speed を参照）
//   maxRange … 折り返し距離（同 proj.maxRange を参照）
// ∴ 発射時に値を差し替えるだけでよく、飛翔ロジックの改変は不要。
// pal … 飛翔中の見た目（game/projectile.js createProjEl が makeSprite に渡す）。
// 形状（shared/sprites-obj32.js boomerangGrid）はティア間で共通＝色だけ変える
// （剣/防具/盾ティアと同じ「形は共通・パレットだけ差し替え」の作法＝SHIELD_TIERS参照）。
export const BOOMERANG_TIERS = [
	// index 0: 木のブーメラン（従来の値そのまま＝既存挙動の回帰）
	{ key: 'wood',   name: 'ブーメラン',     atk: 3, speed: 2.0, maxRange: 3, pal: 'boomerang' },
	// index 1: 銀のブーメラン（海の主の報酬。速く・遠く・強い）
	// speed 5.0 ＝ 20.8セル/秒＝弓矢（4.5＝18.8）より速い（ユーザー確定 2026-07-26
	// 「もっと速くてよさそう」＝3.0 では上位品なのに矢より鈍かった）。
	// pal='boomerangSilver'（ユーザー指摘 2026-09-09＝「銀のブーメランの場合は銀色にしてほしい」）。
	{ key: 'silver', name: '銀のブーメラン', atk: 6, speed: 5.0, maxRange: 6, pal: 'boomerangSilver' },
];

// ── ITEM_META: サブアイテム定義 ───────────────────────────────
// 🔴 `sprite` / `pal` は **SPRITES / PAL に実在する名前**を書くこと。
//    2026-09-09（10e）までは bomb / healPotion / dungeonMap / ladder など6件が実在しない
//    名前で、読み手（`game/ui.js` のポーズのアイテム一覧・`editor/editor-item.js`）が
//    黙って `icon`（絵文字）に落ちていた＝「絵はあるのに出ない」事故。
//    実在の確認＝`node -e "import('./shared/sprites.js').then(({SPRITES,PAL})=>…)"` で
//    両方を引く（`icon` があるせいで欠落が例外にならない∴目で見ても気づけない）。
export const ITEM_META = {
	boomerang: {
		name: 'ブーメラン', icon: '🪃', sprite: 'boomerang', pal: 'boomerang',
		type: 'throwable',
		breakPower: 0,
		uses: Infinity,    // 回数無制限（戻ってきたら再使用可）
	},
	bomb: {
		name: '爆弾', icon: '💣', sprite: 'bombItem', pal: 'bombItem',
		type: 'placeable',
		breakPower: 3,
		aoeRadius: 2,      // 爆風半径（セル）
		damage: 20,
		uses: null,        // スタック数で管理
	},
	bow: {
		name: '弓矢', icon: '🏹', sprite: 'bow', pal: 'bow',
		type: 'throwable',
		breakPower: 0,
		piercing: true,    // 貫通
		uses: null,
	},
	healPotion: {
		name: '回復薬（小）', icon: '🧪', sprite: 'potion', pal: 'potion',
		type: 'consumable',
		healAmount: 5,
		uses: null,
	},
	bigHealPotion: {
		name: '回復薬（大）', icon: '💊', sprite: 'bigHealPotion', pal: 'potionBig',
		type: 'consumable',
		healAmount: 999,   // HP 全回復
		uses: null,
	},
	dungeonMap: {
		// ⚠️ 宝箱・報酬からは渡せない（`grantable: false`）＝地図とコンパスは
		// **床タイル専用**（`game/player.js pickDungeonItem()` が
		// `player.dungeonItems[layer]` に立てる）。`giveSubItem()` の passive 分岐は
		// この2つを扱わない∴宝箱に指定すると「手に入れた！」と出るだけで何も起きない。
		// 宝箱から渡したくなったら先に `giveSubItem` を直す（この旗も外す）。
		name: '地図', icon: '🗺', sprite: 'dmap', pal: 'dmap',
		type: 'passive',
		grantable: false,
		uses: null,
	},
	compass: {
		// ⚠️ 宝箱・報酬からは渡せない（上の `dungeonMap` と同じ理由）。
		name: 'コンパス', icon: '🧭', sprite: 'compass', pal: 'compass',
		type: 'passive',
		grantable: false,
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
		name: 'はしご', icon: '🪜', sprite: 'ladderV', pal: 'ladder',
		type: 'passive',
		uses: null,
	},
	quiver: {
		// Phase 9-5a: 矢筒。所持するだけで矢の上限 +8（player.maxArrows+=8）。
		// 最大3個配置 → 上限 8+8+8+8=32。heartContainer/ladder と同型の passive。
		name: '矢筒', icon: '🏹', sprite: 'arrow', pal: 'arrow',
		type: 'passive',
		uses: null,
	},
	bombBag: {
		// Phase 9-5a: 爆弾袋。所持するだけで爆弾の上限 +8（player.maxBombs+=8）。
		// 最大3個配置 → 上限 8+8+8+8=32。heartContainer/ladder と同型の passive。
		name: '爆弾袋', icon: '💣', sprite: 'bombItem', pal: 'bombItem',
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
// sprite / pal（10e で追加）＝HUD・ポーズの装備欄に出す絵。`pal` は**ティア未所持時の
// 既定**で、持っている時は SWORD_TIERS / SHIELD_TIERS / ARMOR_TIERS の `pal` で上書きする
// （形は共通・色だけティアで変わる＝SHIELD_TIERS の注記と同じ作法）。
export const EQUIP_META = {
	sword: {
		name: '剣', icon: '⚔', slot: 'weapon', sprite: 'sword', pal: 'swordWood',
		atkBonus: 2,
	},
	shield: {
		name: 'たて', icon: '🛡', slot: 'shield', sprite: 'shield', pal: 'shieldWood',
		damageReduction: 0.5,  // 防御中ダメージ50%軽減
	},
	armor: {
		name: '防具', icon: '⚚', slot: 'armor', sprite: 'armor', pal: 'armorCloth',
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

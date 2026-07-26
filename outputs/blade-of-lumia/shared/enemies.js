// ── Blade of Lumia – Enemy Definitions ───────────────────────
// Dungeon World から継承し、速度・攻撃タイプを拡張
import { TILE } from './tiles.js';

// ── 行動モード初期重み ────────────────────────────────────────
// pickApproachMode がこの値を参照して初期重みを決定する
// stone 攻撃なし敵: { flank, direct, wander }
// stone 攻撃あり敵: { flank, direct, wander, strafe }

// ── 速度定数 ─────────────────────────────────────────────────
export const ENEMY_SPEED_SLOW   = 0.25; // 鈍足敵
export const ENEMY_SPEED_NORMAL = 0.5;  // 通常敵
export const ENEMY_SPEED_FAST   = 1.0;  // 高速敵

// ── 敵パラメータ ──────────────────────────────────────────────
// attack.type: 'charge' | 'spear' | 'stone' | 'sword' | 'waterShot' | 'waterBlade'
//
// attack.range   … この距離以内なら出す（上限）
// attack.minRange（任意・Phase 9-6）… この距離より近いと出さない（下限）。
//   近接と遠隔を1体に持たせるとき「隣接では遠隔を撃たず噛みつきに切り替わる」を
//   宣言的に書くためのフィールド。省略時は下限なし＝従来挙動（後方互換）。
//
// weakness（Phase 3-3・任意）: { type, multiplier }
//   type … 弱点となる攻撃種別 'sword' | 'beam' | 'arrow' | 'boomerang' | 'bomb'
//   multiplier … その攻撃でのダメージ倍率（def 適用前の素ダメージに掛ける）
//   弱点ヒット時は combat.js の dealDamageToEnemy が倍率＋専用エフェクト/SE を出す。
//   未定義なら弱点なし＝全攻撃が等倍（後方互換）。
export const ENEMY_META = {
	[TILE.PATROL]: {
		name: 'パトロール',
		hp: 3, atk: 1, def: 0, exp: 3,
		speed: ENEMY_SPEED_SLOW,
		sprite: 'patrol',
		pal:    'patrol',
		isBoss: false,
		attack: { type: 'charge' },
	},
	[TILE.CHASER]: {
		name: 'チェイサー',
		hp: 5, atk: 2, def: 0, exp: 5,
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'chaser',
		pal:    'chaser',
		isBoss: false,
		attack: { type: 'charge' },
	},
	[TILE.SENTRY]: {
		name: 'センチネル',
		hp: 6, atk: 2, def: 1, exp: 8,
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'sentry',
		pal:    'sentry',
		isBoss: false,
		attack: {
			type:            'spear',
			range:           4,       // 射程（セル数）
			cooldown:        3000,    // 攻撃間隔（ms）
			projectileSpeed: 1.5,     // 飛翔速度（セル/tick）
		},
	},
	[TILE.MONSTER]: {
		name: '魔物',
		hp: 12, atk: 3, def: 1, exp: 18,
		speed: ENEMY_SPEED_FAST * 0.45,  // 魔将より大幅に遅い (0.45)
		sprite: 'monster',
		pal:    'monster',
		isBoss: true,
		hitAndAway: true,   // ヒット＆アウェイ行動
		attacks: [
			{
				type:     'sword',
				range:    1.5,
				cooldown: 600,    // 近接剣（魔将より遅い）
			},
			{
				type:            'stone',
				range:           4,
				cooldown:        2800,  // 石投げ（魔将より頻度低）
				projectileSpeed: 1.0,
			},
		],
		attack: { type: 'sword', range: 1.5, cooldown: 600 },
		// 背後・横回り込みの初期重み（魔将より低頻度）
		initialModeWeights: { flank: 0.2, direct: 1.5, wander: 0.3, strafe: 0.2 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.3 }, // HP50%以下でやや加速
		],
	},
	[TILE.BOSS]: {
		name: '魔将',
		hp: 20, atk: 4, def: 2, exp: 30,
		speed: ENEMY_SPEED_FAST,
		sprite: 'escape',
		pal:    'escape',
		isBoss: true,
		hitAndAway: true,   // ヒット＆アウェイ行動
		// attacks: 配列で複数攻撃パターン。cooldown は各攻撃個別に管理
		attacks: [
			{
				type:     'sword',
				range:    1.5,
				cooldown: 400,    // 近接剣攻撃
			},
			{
				type:            'stone',
				range:           5,
				cooldown:        1800,  // 中距離から石投げ
				projectileSpeed: 1.2,
			},
		],
		// 後方互換用（単体参照される場合のフォールバック）
		attack: { type: 'sword', range: 1.5, cooldown: 400 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5 }, // HP50%以下で加速
		],
	},
	[TILE.DARK_LORD]: {
		name: '魔王',
		hp: 50, atk: 6, def: 3, exp: 100,
		speed: ENEMY_SPEED_SLOW,  // デバッグ用に低速化
		sprite: 'darklord',
		pal:    'darklord',
		isBoss: true,
		aura:   true,   // 魔王オーラエフェクト
		hitAndAway: true,   // ヒット＆アウェイ行動
		attacks: [
			{
				type:            'stone',
				range:           6,
				cooldown:        2000,
				projectileSpeed: 1.0,
			},
			{
				type:     'sword',
				range:    1.5,
				cooldown: 800,    // 近距離に来たら剣も使う
			},
		],
		attack: { type: 'stone', range: 6, cooldown: 2000, projectileSpeed: 1.0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5 },
			{ hpThreshold: 0.25, attackCooldownMultiplier: 0.6 }, // HP25%以下で攻撃頻度UP
		],
	},
	// ── ラスボス：ザーネル（Phase 1-3）─────────────────────────
	// 暗黒の塔の最奥で待ち受ける最終ボス。撃破するとエンディングへ。
	// isFinalBoss: true が boss.js のエンディング発火分岐の目印になる。
	// 専用スプライトは未作成のため当面 darklord を流用（新規スプライトは
	// Phase 0-4 / スプライトエディタの管轄。最優先5点の1つ）。
	[TILE.ZARNEL]: {
		name: 'ザーネル',
		hp: 80, atk: 8, def: 4, exp: 0,  // 撃破でクリアなので exp は不要
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'darklord',
		pal:    'darklord',
		isBoss: true,
		isFinalBoss: true,  // ← ラスボス。撃破でエンディング
		aura:   true,
		hitAndAway: true,
		attacks: [
			{
				type:            'stone',
				range:           7,
				cooldown:        1600,
				projectileSpeed: 1.2,
			},
			{
				type:     'sword',
				range:    1.5,
				cooldown: 700,
			},
		],
		attack: { type: 'stone', range: 7, cooldown: 1600, projectileSpeed: 1.2 },
		phases: [
			{ hpThreshold: 0.66, speedMultiplier: 1.3 },
			{ hpThreshold: 0.33, speedMultiplier: 1.6, attackCooldownMultiplier: 0.55 },
		],
	},
	// ── 炎のサラマンドラ（Phase 3-2）：2×2 大型ボス・dungeon_4（炎の神殿）─────
	// 炎をまとった巨大トカゲ型の守護者。体全体が溶岩のように輝き、
	// 尻尾の一撃と炎の石投げで戦う。hitAndAway でジグザグに接近する。
	// dropsTriforce:true で撃破時に星の欠片を落とす。
	[TILE.FIRE_SALAMANDER]: {
		name: '炎のサラマンドラ',
		hp: 35, atk: 5, def: 2, exp: 50,
		speed: ENEMY_SPEED_SLOW * 1.2,   // ゴーレムより少し速い
		sprite: 'fireSalamander',
		pal:    'fireSalamander',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'arrow', multiplier: 2 },  // 矢で炎を射抜く
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 2.2, cooldown: 800 },   // 尻尾なぎ払い
			{ type: 'stone', range: 7, cooldown: 2200, projectileSpeed: 1.2 }, // 炎の石
		],
		attack: { type: 'sword', range: 2.2, cooldown: 800 },
		initialModeWeights: { flank: 0.3, direct: 1.3, wander: 0.3, strafe: 0.1 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5, attackCooldownMultiplier: 0.8 },
		],
	},
	// ── 氷のリヴァイアサン（Phase 3-2）：2×2 大型ボス・dungeon_5（氷の廃墟）──
	// 凍てつく海竜。全身が霜に覆われた巨体で、氷の息と咬みつきで戦う。
	// 動きは遅いが防御力が高く、遠距離からの石投げが主な攻撃手段。
	// dropsTriforce:true で撃破時に星の欠片を落とす。
	[TILE.ICE_LEVIATHAN]: {
		name: '氷のリヴァイアサン',
		hp: 40, atk: 4, def: 3, exp: 55,
		speed: ENEMY_SPEED_SLOW,          // 重厚で鈍足
		sprite: 'iceLeviathan',
		pal:    'iceLeviathan',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'fire', multiplier: 3 },   // ロウソクの炎で氷が溶ける
		meleeOnly: true,           // 遠隔（arrow/beam/boomerang/bomb）は無効
		reflectsProjectiles: true, // 投擲物はそのままプレイヤーへ打ち返す
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 2.5, cooldown: 1100 },  // 咬みつき（リーチが長い）
			{ type: 'stone', range: 8, cooldown: 2800, projectileSpeed: 0.9 }, // 氷の礫
		],
		attack: { type: 'sword', range: 2.5, cooldown: 1100 },
		initialModeWeights: { flank: 0.2, direct: 1.6, wander: 0.2, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.75 },
		],
	},
	// ── 砂嵐の蠍王（Phase 3-2）：2×2 大型ボス・dungeon_2（砂漠の神殿）──
	// 砂漠の守護者。8本の鉗肢と曲がった毒針を持つ巨大蠍。
	// 打撃と毒針投げで戦い、HP半減で猛スピードで突進してくる。
	[TILE.SAND_SCORPION]: {
		name: '砂嵐の蠍王',
		hp: 32, atk: 5, def: 1, exp: 45,
		speed: ENEMY_SPEED_SLOW * 1.1,
		sprite: 'sandScorpion',
		pal:    'sandScorpion',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'boomerang', multiplier: 3 },  // 旋回刃で鉗肢を断つ
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 2.3, cooldown: 750 },   // 鉗肢なぎ払い
			{ type: 'stone', range: 7, cooldown: 2400, projectileSpeed: 1.3 }, // 毒針投げ
		],
		attack: { type: 'sword', range: 2.3, cooldown: 750 },
		initialModeWeights: { flank: 0.4, direct: 1.2, wander: 0.2, strafe: 0.2 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.6, attackCooldownMultiplier: 0.75 },
		],
	},
	// ── 深海の海蛇（Phase 3-2）：2×2 大型ボス・dungeon_3（水の迷宮）──
	// 深淵から召喚された巨大海蛇。長い胴体を波打たせて接近し、
	// 咬みつきと水球投げで圧倒する。鱗の防御力が高い。
	[TILE.SEA_SERPENT]: {
		name: '深海の海蛇',
		hp: 38, atk: 4, def: 3, exp: 52,
		speed: ENEMY_SPEED_SLOW * 0.95,
		sprite: 'seaSerpent',
		pal:    'seaSerpent',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'beam', multiplier: 2 },   // 光の刃で鱗を貫く
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 2.6, cooldown: 1000 },  // 咬みつき（リーチ長）
			{ type: 'stone', range: 8, cooldown: 2600, projectileSpeed: 1.0 }, // 水球
		],
		attack: { type: 'sword', range: 2.6, cooldown: 1000 },
		initialModeWeights: { flank: 0.2, direct: 1.5, wander: 0.3, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.4, attackCooldownMultiplier: 0.7 },
		],
	},
	// ── 古森の巨人（Phase 3-2）：2×2 大型ボス・dungeon_6（森の聖域）──
	// 大樹の精霊が宿った樹人の守護者。巨木の腕で叩きつけ、
	// 木の実や胞子弾を飛ばして広範囲を制圧する。
	[TILE.FOREST_GIANT]: {
		name: '古森の巨人',
		hp: 42, atk: 5, def: 2, exp: 58,
		speed: ENEMY_SPEED_SLOW * 0.9,
		sprite: 'forestGiant',
		pal:    'forestGiant',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'fire', multiplier: 2 },   // 炎で樹皮を焼き払う
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 2.4, cooldown: 950 },   // 枝腕なぎ払い
			{ type: 'stone', range: 6, cooldown: 2200, projectileSpeed: 0.9 }, // 木の実投げ
		],
		attack: { type: 'sword', range: 2.4, cooldown: 950 },
		initialModeWeights: { flank: 0.15, direct: 1.7, wander: 0.15, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.8 },
		],
	},
	// ── 嵐の鷲王（Phase 3-2）：2×2 大型ボス・dungeon_7（空中の遺跡）──
	// 嵐を纏う翼王。翼から放つ雷撃と突進で戦場を制圧する。
	// 素早く動き回り、HP半減後は雷撃の頻度が大幅に増加する。
	[TILE.STORM_EAGLE]: {
		name: '嵐の鷲王',
		hp: 36, atk: 6, def: 1, exp: 55,
		speed: ENEMY_SPEED_SLOW * 1.3,   // 鷲なので速め
		sprite: 'stormEagle',
		pal:    'stormEagle',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'arrow', multiplier: 2 },  // 矢で翼を射落とす
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 2.1, cooldown: 700 },   // 鉤爪（速い）
			{ type: 'stone', range: 7, cooldown: 2000, projectileSpeed: 1.4 }, // 雷撃弾
		],
		attack: { type: 'sword', range: 2.1, cooldown: 700 },
		initialModeWeights: { flank: 0.5, direct: 1.0, wander: 0.3, strafe: 0.2 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.7, attackCooldownMultiplier: 0.65 },
		],
	},
	// ── 岩のゴーレム（Phase 3-2）：2×2 大型ボス ──────────────────
	// size:{w,h} を持つ最初の大型敵。dungeon_1（最初のダンジョン）の
	// ボスとして採用。hitAndAway AI で接近戦闘し、向きを変えながら戦う
	// （正面固定にならないよう左右反転＋CSS の巨体揺れアニメを併用）。
	// dropsTriforce: true で撃破時に星の欠片を落とす（DARK_LORD と同等）。
	// スプライトは 2×2 セル相当の 24×24（向きエイリアス rockGolemR/L/D/U）。
	[TILE.ROCK_GOLEM]: {
		name: '岩のゴーレム',
		hp: 30, atk: 4, def: 2, exp: 40,
		speed: ENEMY_SPEED_SLOW,   // 大型なので鈍重
		sprite: 'rockGolem',
		pal:    'rockGolem',
		size:   { w: 2, h: 2 },    // ← 2×2 セルを占有
		isBoss: true,
		dropsTriforce: true,       // 撃破で星の欠片を落とす（boss.js が参照）
		weakness: { type: 'bomb', multiplier: 3 },  // 爆弾で岩体を砕く
		hitAndAway: true,          // 接近→攻撃→後退（向きも切り替わる）
		attacks: [
			{ type: 'sword', range: 2.2, cooldown: 900 },   // 大型なのでリーチ長め
			{ type: 'stone', range: 6, cooldown: 2600, projectileSpeed: 1.0 }, // 岩투げ
		],
		attack: { type: 'sword', range: 2.2, cooldown: 900 },
		// 直進寄り（大型は回り込みより正面から押す）
		initialModeWeights: { flank: 0.2, direct: 1.4, wander: 0.4, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.4 }, // HP50%以下で加速
		],
	},
	// ── 沼地の大蝦蟇（Phase 9-2c）：2×2 大型ボス・cave_1（沼地の洞窟）────
	// 沼地の主＝膨れ上がった毒蝦蟇。長い舌の打撃と毒沫の投擲で戦う。
	// 鈍重だが体力が高く、HP半減で跳ねるように加速する。
	// 8体目の dropsTriforce ボス（cave_1）。これで「大型ボス8＝欠片8」が揃う。
	// 弱点は炎（ロウソク＝cave_1 入場前に入手済み）。剣でも倒せる。
	[TILE.SWAMP_TOAD]: {
		name: '沼地の大蝦蟇',
		hp: 40, atk: 5, def: 2, exp: 56,
		speed: ENEMY_SPEED_SLOW,          // 鈍重
		sprite: 'swampToad',
		pal:    'swampToad',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'fire', multiplier: 2 },   // 炎で焼かれると弱い両生類
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 2.4, cooldown: 900 },   // 舌の打撃（リーチ長）
			{ type: 'stone', range: 7, cooldown: 2400, projectileSpeed: 1.1 }, // 毒沫
		],
		attack: { type: 'sword', range: 2.4, cooldown: 900 },
		initialModeWeights: { flank: 0.25, direct: 1.4, wander: 0.35, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5, attackCooldownMultiplier: 0.8 },
		],
	},

	// ── Phase 9-6 深洋O: 海棲雑魚 ─────────────────────────────────
	// move: 敵の移動媒体を表す（passable.js / enemy-ai.js が参照）。
	//   undefined | 'land' … 従来の陸棲（水/溶岩/空は通れない）。既存の全敵はこれ。
	//   'water'            … 水棲（水は泳げる／乾いた陸には上がれない）。溶岩/空は不可。
	//   'amphibious'       … 両生（水も陸も通れる。moveSpeed で地形別に速度を変える）。
	// moveSpeed: { water, land } … amphibious 専用。地形ごとの速度倍率（省略時は speed）。
	[TILE.FISH_SCHOOL]: {
		name: '魚群',
		hp: 2, atk: 1, def: 0, exp: 4,     // 1体は脆い＝数で包囲する
		speed: ENEMY_SPEED_FAST,           // 素早く群がる
		sprite: 'fishSchool',
		pal:    'fishSchool',
		isBoss: false,
		move:   'water',                   // 水しか泳げない＝陸に上がれない（海の顔）
		attack: { type: 'charge' },        // 接触ダメージのみ（飛び道具なし）
	},
	// ── ②接近型：潜み鮫（潜行↔浮上のリズム戦闘）────────────────
	// submerge: { hiddenMs, surfacedMs } … 潜行/浮上を繰り返す敵の周期（enemy-ai.js が管理）。
	//   潜行中（e.submerged=true）＝水中に隠れて寄ってくるが「無敵・攻撃なし・接触ダメージなし」。
	//   浮上中（e.submerged=false）＝噛みつき（sword）で攻撃し、こちらの攻撃も通る。
	// ∴「浮上した瞬間だけ殴れる」＝海のリズム戦闘（ユーザー確定 2026-07-25）。
	//
	// 攻撃は二段構え＝**離れていれば遠隔（水刃）・隣接すれば噛みつき**（ユーザー確定 2026-07-25）。
	//   理由＝鮫は move:'water' で陸に上がれない∴近接だけだと「岸から2マス離れて立つ」
	//   だけで完全に無害な置物になる（敵単体で成立しない）。遠隔を持たせて岸から離れた
	//   プレイヤーも狙う＝海が危ないという体験になる。
	//   代替案（飛びかかって陸に乗る）は却下＝論理座標が陸に出ると move:'water' の通行判定を
	//   破りスタックする（ユーザー指摘）。∴座標は水から出さず、届く手段を増やす。
	[TILE.LURK_SHARK]: {
		name: '潜み鮫',
		hp: 6, atk: 3, def: 1, exp: 12,    // 浮上の一瞬に殴る＝手数が限られるぶん硬め
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'lurkShark',
		pal:    'lurkShark',
		sideView: true,                    // 横向きシルエット＝プレイヤーの左右で反転する
		isBoss: false,
		move:   'water',
		submerge: { hiddenMs: 2000, surfacedMs: 1200 },
		attacks: [
			// 噛みつき（岸のプレイヤーに届く）。minRange 無し＝どんなに近くても出る。
			{ type: 'sword', range: 1.6, cooldown: 800 },
			// 水刃＝噛みつきリーチの外だけで撃つ（minRange）。射水魚の水弾より
			// 重く遅い1発＝「連射で削る射水魚」との役割差。
			{ type: 'waterBlade', minRange: 1.6, range: 6, cooldown: 1800, projectileSpeed: 1.4 },
		],
		// 単発 attack も残す＝attacks を持たないコード経路（テスト・将来の参照）向けの代表値。
		attack: { type: 'sword', range: 1.6, cooldown: 800 },
	},
	// ── ③遠隔型：射水魚（水中から水弾を任意角で撃つ）──────────
	// attack.type:'waterShot' は 'stone' と同じ「任意角へ飛ばす」型（斜めにも撃つ）。
	// 投擲物スプライトは ITEM_SPRITES.waterShot / ITEM_PAL.waterShot（projectile.js の
	// createProjEl が makeSprite(proj.type, proj.type) を呼ぶ＝type 名がスプライト名も兼ねる）。
	[TILE.ARCHER_FISH]: {
		name: '射水魚',
		hp: 3, atk: 2, def: 0, exp: 8,     // 脆いが遠くから削る＝近づけば早く潰せる
		speed: ENEMY_SPEED_SLOW,           // 撃つのが仕事＝あまり動かない
		sprite: 'archerFish',
		pal:    'archerFish',
		sideView: true,                    // 横向きシルエット＝プレイヤーの左右で反転する
		isBoss: false,
		move:   'water',
		attack: { type: 'waterShot', range: 6, cooldown: 2200, projectileSpeed: 1.2 },
	},

	// ── Phase 9-6 深洋O: 海の主（2×2 ミニボス・聖域の門番）───────────
	// デルタ最奥の聖域を守る巨大クジラ。既存8ボスと決定的に違うのは
	// **倒すのではなく「認められる」** こと（ユーザー確定 2026-07-26）：
	//   ・dropsTriforce を持たない … 星の欠片の総数8を狂わせない
	//   ・isFinalBoss を持たない   … エンディングを誤発火しない
	//   ・yieldAt: 0.25（新設）    … HP が 25% 以下になった時点で戦闘終了＝合格。
	//     killEnemy（爆発→消滅）ではなく「戦闘終了→報酬授与→深みへ退場」に分岐する
	//     （combat.js の dealDamageToEnemy が yieldAt を見て boss.js の yieldBoss を呼ぶ）。
	//   ・報酬は stageData.bossReward（データ駆動）… 何を配るかは stage JSON 側が決める。
	//     ∴ ここは「配るタイミング（yieldAt）」だけを定義し、中身を知らない。
	// move:'amphibious' … クジラなので水では速く、陸に乗り上げると鈍い（moveSpeed）。
	// 弱点は持たない＝「腕試し」なので特定装備の有無で難度が激変しないようにする。
	[TILE.SEA_LORD]: {
		name: '海の主',
		hp: 48, atk: 5, def: 4, exp: 0,    // exp0＝撃破しない相手（経験値の概念で報われない）
		speed: ENEMY_SPEED_SLOW,
		sprite: 'seaLord',
		pal:    'seaLord',
		size:   { w: 2, h: 2 },
		isBoss: true,
		// 撃破ではなく合格。HP 25% 以下で戦闘終了する。
		yieldAt: 0.25,
		move:   'amphibious',
		moveSpeed: { water: 1.0, land: 0.5 },   // 水では定速・陸では半速
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 2.8, cooldown: 1100 },   // 巨体の体当たり
			// 潮吹き＝水弾（射水魚と同じ waterShot 型。任意角へ飛ぶ）
			{ type: 'waterShot', range: 8, cooldown: 2400, projectileSpeed: 1.3 },
		],
		attack: { type: 'sword', range: 2.8, cooldown: 1100 },
		initialModeWeights: { flank: 0.3, direct: 1.4, wander: 0.3, strafe: 0 },
		phases: [
			// 半分削ると本気になる（＝合格ラインの 25% までが一番の山場）
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.75 },
		],
	},
};

// ── 敵タイルの集合（ENEMY_META から自動導出＝単一の真実）────────────
// 「このタイルは敵か？」を判定したい側（エディタのステージ情報の敵カウント等）は
// タイル文字を並べたローカル表を持たず、必ずここを使う。
// 理由＝ハードコードした表は敵を足すたびに更新漏れが起きる（実例：記号タイルの
// 海棲雑魚 & < / だけでなく、名前付きボス Z A L N J O U G I も
// エディタの敵カウントから漏れていた＝13種が 0 と表示されていた）。
export const ENEMY_TILES = Object.freeze(Object.keys(ENEMY_META));
export function isEnemyTile(tileChar) {
	return Object.hasOwn(ENEMY_META, tileChar);
}

// 投擲物のスプライト対応表
export const PROJECTILE_SPRITE = {
	spear:     'spear',
	stone:     'stone',
	boomerang: 'boomerang',
	arrow:     'arrow',
	waterShot: 'waterShot',  // Phase 9-6: 射水魚の水弾（ITEM_SPRITES/ITEM_PAL に同名で存在）
	waterBlade: 'waterBlade', // Phase 9-6: 潜み鮫の水刃（尾で薙いだ三日月型の衝撃波）
};

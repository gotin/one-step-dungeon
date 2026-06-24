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
// attack.type: 'charge' | 'spear' | 'stone' | 'sword'
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
};

// 投擲物のスプライト対応表
export const PROJECTILE_SPRITE = {
	spear:     'spear',
	stone:     'stone',
	boomerang: 'boomerang',
	arrow:     'arrow',
};

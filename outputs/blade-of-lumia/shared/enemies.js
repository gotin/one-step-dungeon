// ── Blade of Lumia – Enemy Definitions ───────────────────────
// Dungeon World から継承し、速度・攻撃タイプを拡張
import { TILE } from './tiles.js';

// ── 速度定数 ─────────────────────────────────────────────────
export const ENEMY_SPEED_SLOW   = 0.25; // 鈍足敵
export const ENEMY_SPEED_NORMAL = 0.5;  // 通常敵
export const ENEMY_SPEED_FAST   = 1.0;  // 高速敵

// ── 敵パラメータ ──────────────────────────────────────────────
// attack.type: 'charge' | 'spear' | 'stone' | 'sword'
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
	[TILE.BOSS]: {
		name: 'ボス',
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
};

// 投擲物のスプライト対応表
export const PROJECTILE_SPRITE = {
	spear:     'spear',
	stone:     'stone',
	boomerang: 'boomerang',
	arrow:     'arrow',
};

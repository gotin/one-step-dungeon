// game/carry-over.js ── クリア時の強さを女王の周回へ引き継ぐ（実行キュー109・2026-11-16）
//
// ユーザー確定（PLAN キュー109 ①〜④）：
//   ① 引き継ぐのは「強さ」だけ＝剣・盾・鎧（段）・ハートの器の数・光の紋章・剣技の巻物・金の装束。
//      道具（subItems・はしご・翼の羽衣・疾風の靴）・ルピー・妖精は引き継がない
//      ＝道具は道のふさがりを越える鍵∴周回でも探索と仕掛けの順番を崩さない。
//   ② 周回の上乗せ＝剣の威力 ×1.2（旧 ×2）・守りの上乗せなし（旧 ×2）・歩く速さの上乗せなし（旧 ×1.2）。
//      ブーメランと矢の速さ ×2 は残す（game.js 側）。古いクリア（引き継ぎの記録が無い人）も同じ規則。
//   ③ ハートの器・紋章・巻物は「引き継いだ数まで」＝周回で拾っても max(引き継いだ数, 素の数＋この周回で得た数)。
//   ④ 金の装束を持つ女王は髪が金・体全体の光（見た目は game.js / render-chars.js）。
//
// 記録は CLEARED_KEY とは別のキー（CARRY_KEY）に JSON で置く＝CLEARED_KEY の '1' を読む既存の口
// （hasCleared・ps_cleared）を変えない。読み手は startNewGame（はじめから）だけ。

import { SWORD_TIERS, ARMOR_TIERS, SHIELD_TIERS, BASE_ATK, BASE_DEF,
	EMBLEMS_FOR_AURA, SCROLLS_FOR_WIDE_SPIN } from '../shared/items.js';
import { HP_PER_HEART } from './constants.js';

export const CARRY_KEY = 'blade-of-lumia-carry';
// 周回（クリア後）の剣の威力の上乗せ。整数に丸める＝敵の体力の刻み（木の剣で一撃 4 など）を小数で崩さない。
export const QUEEN_SWORD_MULT = 1.2;
// 素の周回の始まりのハートの器（game.js startNewGame の maxHearts と同じ）
const BASE_HEARTS = 3;

/** 周回の剣の威力（クリア後だけ ×1.2・四捨五入）。剣・回転斬り・ビームが同じ式を通る。 */
export function clearedSwordAtk(atk, cleared) {
	return cleared ? Math.round(atk * QUEEN_SWORD_MULT) : atk;
}

function tierOf(v, table) {
	const n = Math.floor(Number(v));
	return Number.isFinite(n) && n >= 0 && n < table.length ? n : -1;
}
function countOf(v, max) {
	const n = Math.floor(Number(v));
	return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

/** クリアした瞬間の player から引き継ぐ強さを写し取る。 */
export function snapshotCarry(player) {
	return normalizeCarry({
		swordTier:  player?.swordTier,
		shieldTier: player?.shieldTier,
		armorTier:  player?.armorTier,
		maxHearts:  player?.maxHearts,
		emblems:    player?.emblems,
		scrolls:    player?.scrolls,
		goldGarb:   player?.hasGoldGarb,
	});
}

/** 壊れた値・古い形を安全な形に丸める（読めない物は「引き継がない」に倒す）。 */
export function normalizeCarry(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const hearts = Math.floor(Number(raw.maxHearts));
	return {
		swordTier:  tierOf(raw.swordTier,  SWORD_TIERS),
		shieldTier: tierOf(raw.shieldTier, SHIELD_TIERS),
		armorTier:  tierOf(raw.armorTier,  ARMOR_TIERS),
		maxHearts:  Number.isFinite(hearts) ? Math.max(BASE_HEARTS, hearts) : BASE_HEARTS,
		emblems:    countOf(raw.emblems, EMBLEMS_FOR_AURA),
		scrolls:    countOf(raw.scrolls, SCROLLS_FOR_WIDE_SPIN),
		goldGarb:   raw.goldGarb === true,
	};
}

export function writeCarry(storage, carry) {
	const c = normalizeCarry(carry);
	if (c) storage.setItem(CARRY_KEY, JSON.stringify(c));
}

export function readCarry(storage) {
	try { return normalizeCarry(JSON.parse(storage.getItem(CARRY_KEY) ?? 'null')); }
	catch { return null; }
}

/**
 * 新しい周回の player に引き継いだ強さを載せる。atk/def は段から導く（player.js equip* と同じ式）。
 * `player.carryFloor`＝③の「引き継いだ数」・`player.carryEarned`＝この周回で拾った数（セーブに乗る）。
 */
export function applyCarry(player, carry) {
	const c = normalizeCarry(carry);
	if (!c) return false;
	player._equip = player._equip ?? {};
	if (c.swordTier >= 0) {
		const t = SWORD_TIERS[c.swordTier];
		player.weapon = 'sword'; player.swordTier = c.swordTier;
		player._equip.swordName = t.name; player._equip.swordBonus = t.atk;
		player.atk = BASE_ATK + t.atk;
	}
	if (c.armorTier >= 0) {
		const t = ARMOR_TIERS[c.armorTier];
		player.armor = 'armor'; player.armorTier = c.armorTier;
		player._equip.armorName = t.name; player._equip.armorBonus = t.def;
		player.def = BASE_DEF + t.def;
	}
	if (c.shieldTier >= 0) {
		player.shield = 'shield'; player.shieldTier = c.shieldTier;
		player._equip.shieldName = SHIELD_TIERS[c.shieldTier].name;
	}
	player.maxHearts = c.maxHearts;
	player.maxHp     = c.maxHearts * HP_PER_HEART;
	player.hp        = player.maxHp;
	player.emblems   = c.emblems;
	player.scrolls   = c.scrolls;
	if (c.goldGarb) player.hasGoldGarb = true;
	player.carryFloor  = { hearts: c.maxHearts, emblems: c.emblems, scrolls: c.scrolls };
	player.carryEarned = { hearts: 0, emblems: 0, scrolls: 0 };
	return true;
}

/**
 * 引き継いだ周回で器・紋章・巻物を拾ったときの新しい値（③）。引き継ぎの無い周回は null＝呼び手は従来どおり +1。
 * kind: 'hearts' | 'emblems' | 'scrolls'
 */
export function carriedGain(player, kind) {
	const floor = player?.carryFloor;
	if (!floor || typeof floor !== 'object') return null;
	const earned = player.carryEarned && typeof player.carryEarned === 'object'
		? player.carryEarned : (player.carryEarned = { hearts: 0, emblems: 0, scrolls: 0 });
	earned[kind] = (Number.isFinite(earned[kind]) ? earned[kind] : 0) + 1;
	const base = kind === 'hearts' ? BASE_HEARTS : 0;
	const max  = kind === 'emblems' ? EMBLEMS_FOR_AURA : (kind === 'scrolls' ? SCROLLS_FOR_WIDE_SPIN : Infinity);
	return Math.min(max, Math.max(Number(floor[kind]) || 0, base + earned[kind]));
}

// キュー110：ボスが強い剣に「溶ける」のを抑える規則（単一の真実）。
//
// ユーザーの条件（2026-11-15）＝「剣がつよくなったほうがそうじゃないときより難しくなるようなことは
// したくない。基本剣が強い方が有利にはしたい」＝**倒すのに要る振りの数は剣が強いほど必ず少ない**。
//
// やり方＝ボスの体力は変えず、**ボスに入る剣のダメージ（剣・回転斬り・ビーム）だけ**を抑える。
//   基準の剣（既定＝木の剣）で入るダメージ d0、今の剣で入るダメージ d、比 r = d / d0 として
//   入るダメージ = d × r^(-TEMPER_EXP)（r ≤ 1 なら抑えない）。
//   TEMPER_EXP = 0.5 ＝ 剣の強さの差が平方根で効く（威力 6 倍の剣でも振り数は 1/√6 ≒ 0.41 倍）。
//   振り数 ∝ r^(TEMPER_EXP − 1) ＝ 指数が負∴剣が強いほど必ず減る。
//
// 体力を増やす形にしない理由＝矢・爆弾・ブーメラン・炎は剣で強くならない∴体力を増やすと
//   道具が答えの局面（嵐の鷲王の滞空＝矢だけが届く 等）が強い剣ほど長引く＝条件に反する。
//
// 端数＝敵ごとに持ち越す（`carry`）。整数に丸めるだけだと木の剣のダメージが小さいボス
//   （ザーネル＝2）で聖剣とルミアの剣が同じ振り数に並ぶ。
//
// 基準の剣＝`ENEMY_META[t].swordTemperRef`（剣のティア番号・既定 0＝木の剣）。
//   裏ボス Ω はルミアの剣（4）で戦う前提で体力が決めてある∴基準を 4 にする
//   （木の剣を基準にすると、ルミアの剣で今の 3 倍以上振ることになる）。
// 対象＝ボス部屋の `isBoss` の敵（中ボスの魔物 W は道中の敵＝含めない）。クリア後の周回（剣 ×1.2）も同じ式。

import { SWORD_TIERS, BASE_ATK } from './items.js';

export const TEMPER_EXP = 0.5;
export const TEMPERED_ATK_TYPES = new Set(['sword', 'beam']);

// 剣ティア t の素の攻撃力（周回の ×1.2 は呼び出し側が渡す swordAtk に含める）。
export function swordAtkOfTier(t) {
	return BASE_ATK + (t >= 0 && SWORD_TIERS[t] ? SWORD_TIERS[t].atk : 0);
}

// 入るダメージに掛ける倍率（0 < f ≤ 1）。
// swordAtk＝今の剣の攻撃力（周回の上乗せ込み）・def＝ボスの守り・refTier＝基準の剣。
export function temperFactor(swordAtk, def, refTier = 0) {
	const d  = Math.max(1, swordAtk - def);
	const d0 = Math.max(1, swordAtkOfTier(refTier) - def);
	const r = d / d0;
	return r > 1 ? Math.pow(r, -TEMPER_EXP) : 1;
}

// この一撃が規則の対象か。ボス部屋（`isBossRoom` の画面）の戦いだけ＝道中に何度も出る中ボス
// （魔物 W）は抑えない（ユーザーの感想は「ボス」・道中の敵が強い剣で長引くと寄り道の得が消える）。
export function isTempered(meta, atkType, inBossRoom) {
	return !!meta?.isBoss && !!inBossRoom && TEMPERED_ATK_TYPES.has(atkType);
}

// 抑えた後のダメージ（整数）と、次へ持ち越す端数を返す。
// actual＝守りを引いた後の素のダメージ（≥1）。
export function temperDamage(actual, factor, carry = 0) {
	if (factor >= 1) return { dmg: actual, carry: 0 };
	const raw = actual * factor + carry;
	const dmg = Math.max(1, Math.floor(raw + 1e-9));
	return { dmg, carry: Math.max(0, raw - dmg) };
}

// 監査とテスト用：剣だけで倒すのに要る振りの数（弱点・相の変化は数えない）。
export function swingsToKill(hp, swordAtk, def, refTier = 0) {
	const f = temperFactor(swordAtk, def, refTier);
	const actual = Math.max(1, swordAtk - def);
	let left = hp, carry = 0, n = 0;
	while (left > 0) {
		const r = temperDamage(actual, f, carry);
		left -= r.dmg; carry = r.carry; n++;
	}
	return n;
}

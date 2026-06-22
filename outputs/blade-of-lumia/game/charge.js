// game/charge.js ── チャージ攻撃（剣ビーム）（Phase 3-1）
// createCharge(deps) factory で生成する。
//
// 仕様（ユーザー確定）：
//   - 攻撃ボタンを「押した瞬間」に通常の剣が出る（剣の発火は input.js / combat.js 側）。
//   - 押しっぱなしでチャージが溜まる（論理時間 gameNow 基準なのでテストで決定的）。
//   - 離した時のチャージ量でビームが変わる：
//       1/4(CHARGE_MIN_RATIO)未満 … ビームなし（剣は既に振っている）
//       1/4以上〜満タン未満        … 弱ビーム（剣ATK・非貫通）
//       満タン(CHARGE_FULL_MS)     … 強ビーム（剣ATK×BEAM_STRONG_MULT・貫通）
//   - チャージ中は移動速度が落ちる（getMoveSpeedFactor）。
//
// ビーム本体は projectile.js の addProjectile に type:'beam' で乗せる（飛翔・当たり判定を共有）。

import { playSound, resumeAudio } from '../shared/sounds.js';
import { SWORD_TIERS } from '../shared/items.js';
import {
	DIR_DELTA, MOVE_STEP,
	CHARGE_FULL_MS, CHARGE_MIN_RATIO, BEAM_SPEED, BEAM_STRONG_MULT,
} from './constants.js';

/**
 * createCharge(deps) – factory
 *
 * deps:
 *   gameNow()              – 論理時間(ms)
 *   getPlayer()            – player
 *   getHeroDir()           – heroDir
 *   getIsDialog()          – isDialog
 *   getIsPaused()          – isPaused
 *   getIsGameover()        – isGameover
 *   getIsTransitioning()   – isTransitioning
 *   addProjectile(config)  – 投擲物追加（projectile.js）
 *   hasCleared()           – 二周目か（剣ATK2倍）
 */
export function createCharge(deps) {
	const {
		gameNow, getPlayer, getHeroDir,
		getIsDialog, getIsPaused, getIsGameover, getIsTransitioning,
		addProjectile, hasCleared,
	} = deps;

	// 押下した論理時刻（ms）。null のときは非チャージ。
	let _chargeStart = null;

	function canAct() {
		const player = getPlayer();
		return !!player && !!player.weapon
			&& !getIsDialog() && !getIsPaused()
			&& !getIsGameover() && !getIsTransitioning();
	}

	// 攻撃ボタン押下時に呼ぶ（剣の発火は呼び出し側で別途行う）。
	// キーの auto-repeat 対策として、既にチャージ中なら何もしない（リセットしない）。
	function startCharge() {
		if (_chargeStart !== null) return;
		if (!canAct()) return;
		const tier = SWORD_TIERS[getPlayer()?.swordTier ?? -1];
		if (!tier?.beam) return;  // ビーム不可ティアではオーラもチャージも出さない
		_chargeStart = gameNow();
	}

	function isCharging() { return _chargeStart !== null; }

	// 0〜1 のチャージ割合
	function getChargeRatio() {
		if (_chargeStart === null) return 0;
		return Math.min(1, (gameNow() - _chargeStart) / CHARGE_FULL_MS);
	}

	// 攻撃ボタンを離した時に呼ぶ。チャージ量でビーム発射を判定する。
	function releaseCharge() {
		if (_chargeStart === null) return;
		const ratio = getChargeRatio();
		_chargeStart = null;
		clearAura();
		if (ratio < CHARGE_MIN_RATIO) return;   // 剣のみ（既に振っている）
		fireBeam(ratio >= 1);
	}

	// チャージを中断（ステージ遷移・ポーズ等）
	function cancelCharge() {
		_chargeStart = null;
		clearAura();
	}

	function fireBeam(full) {
		const player = getPlayer();
		if (!player?.weapon) return;
		const tier = SWORD_TIERS[player.swordTier ?? -1];
		if (!tier?.beam) return;   // ビーム解禁はティアに紐づく
		const heroDir  = getHeroDir();
		const [dy, dx] = DIR_DELTA[heroDir];
		const ndx = dx / MOVE_STEP;
		const ndy = dy / MOVE_STEP;
		const baseAtk = hasCleared() ? player.atk * 2 : player.atk;
		const piercing = full && !!tier.pierce;  // 満タン＆聖剣のみ貫通
		const strong   = full && !!tier.pierce;  // 聖剣満タンのみ強ビーム演出
		const atk = strong ? baseAtk * BEAM_STRONG_MULT : baseAtk;
		resumeAudio();
		playSound('slash');
		addProjectile({
			owner: 'player', type: 'beam',
			x: player.x + ndx * 0.5,
			y: player.y + ndy * 0.5,
			dx: ndx, dy: ndy,
			speed: BEAM_SPEED,
			atk,
			piercing,
			strong,     // 描画用フラグ（金色ビームは聖剣満タンのみ）
		});
	}

	// 毎フレーム呼ぶ：チャージ中のオーラ表示を更新する（gameTick から）
	function tickCharge() {
		if (_chargeStart === null) { clearAura(); return; }
		if (!canAct()) { cancelCharge(); return; }
		updateAura(getChargeRatio());
	}

	// ── チャージオーラ（CSS 演出。専用スプライトは後回し）──────────
	function updateAura(ratio) {
		const playerEl = document.getElementById('char-player');
		if (!playerEl) return;
		let aura = playerEl.querySelector('.charge-aura');
		if (!aura) {
			aura = document.createElement('div');
			aura.className = 'charge-aura';
			playerEl.appendChild(aura);
		}
		const player  = getPlayer();
		const tier    = SWORD_TIERS[player?.swordTier ?? -1];
		const canPierce = !!tier?.pierce;          // 聖剣のみ true
		const full    = ratio >= 1;
		const ready   = ratio >= CHARGE_MIN_RATIO;
		aura.classList.toggle('charge-ready', ready && !(full && canPierce));
		aura.classList.toggle('charge-full',  full  &&   canPierce);  // 金色は聖剣満タンのみ
		aura.style.opacity = String(0.25 + ratio * 0.75);
	}

	function clearAura() {
		document.querySelectorAll('.charge-aura').forEach(el => el.remove());
	}

	// 移動速度係数：チャージ中は半速
	function getMoveSpeedFactor() {
		return _chargeStart !== null ? 0.5 : 1;
	}

	return {
		startCharge, releaseCharge, cancelCharge,
		isCharging, getChargeRatio, tickCharge,
		getMoveSpeedFactor,
	};
}

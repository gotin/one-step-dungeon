// game/debuff.js ── プレイヤー側の一時デバフ窓（Phase 5.5k k-7）
// createDebuff(deps) factory で生成する。
//
// ■ 何のためのモジュールか
// 敵の攻撃の結果が「HP が減る」だけで終わらない敵（#13 呪い火＝剣封じ・#15 毒沼ヒル＝毒）
// を支える共通機構。敵側の攻撃ポーズ窓（`e._atkUntil`）とまったく同型の
// **論理時間の窓**（gameNow() 基準）を player 側に置く：
//     player._sealUntil    … この論理時刻まで剣が封じられている
//     player._poisonUntil  … この論理時刻まで毒が続く
//     player._poisonNextAt … 次に毒が刻む論理時刻
//     player._poisonDmg    … 次の刻みのダメージ（時間で減衰する＝毎刻み decay だけ弱まる）
// 論理時間なので `__game.step(n)` の手動 tick でも実時間ループでも同じ挙動になる
// （実時間の setTimeout でデバフを切ると、テストが実時間待ちになり決定論も失われる）。
//
// ■ 窓を1か所に集める理由
// デバフの「立てる／効いているか訊く／切れたか見る」を敵ごとに書くと、
// 新しいデバフを足すたびに combat.js / charge.js / game.js の3か所を触ることになる。
// ∴ 立てる = inflictDebuff(meta)／訊く = isSwordSealed()／進める = tickPlayerDebuffs()
// の3関数だけを外に出し、窓の形はこのモジュールの外から見えないようにする。
//
// ■ 設計上の確定事項（k-7a）
//  1. **デバフは無敵窓では防げない。** 接触無敵（INVINCIBLE_MS）は「HP を守る窓」で
//     あって「触れた事実」を消す窓ではない∴無敵中の接触でも封印/毒は入る。
//     でないと「1回触れてから無敵の間ずっと張り付いていれば妨害が効かない」＝
//     呪い火の機構（触れたら剣が使えない）が無敵窓で無効化されてしまう。
//  2. **毒は無敵窓を貫通するが、無敵窓を与えない。**（takeDamage の opts）
//     貫通しないと「毒が刻む → 無敵が付く」の繰り返しで接触ダメージを毒が肩代わりし、
//     毒が**盾として働く**（毒を受けている方が安全）＝機構が反転する。
//  3. **剣封じはサブアイテムを封じない**（弓/爆弾/ブーメランは使える）。
//     PLAN 5.5k 名簿 #13 の「妨害特化＝弓/爆弾で処理」がそのまま実装の規則。
//     剣を封じるとチャージ（剣ビーム）も止まる＝charge.js canAct() が isSwordSealed()
//     を見る＝溜め中に封じられたらチャージは即キャンセルされる（tickCharge）。
//  4. **窓はセーブに持ち越さない。** game.js saveGame() は player を丸ごと直列化し
//     `gameTime` は 0 から再開する∴保存された `_sealUntil` はロード直後「未来」に
//     見えて剣が封じられたままになる。save.js sanitizeLoadedPlayer が窓を消す
//     （ここで消すのは「純粋関数1か所」の原則＝ロード経路が増えても漏れない）。

import { playSound } from '../shared/sounds.js';

/**
 * createDebuff(deps) – factory
 *
 * deps:
 *   getPlayer()                  – player
 *   gameNow()                    – 論理時間(ms)
 *   takeDamage(amount, opts)     – プレイヤーダメージ（combat.js・opts で無敵の扱いを変える）
 *   pulse(text, dur)             – メッセージ表示
 *   updatePlayerCharEl()         – プレイヤー要素の作り直し（デバフの class を貼り替える）
 */
export function createDebuff(deps) {
	const { getPlayer, gameNow, takeDamage, pulse, updatePlayerCharEl } = deps;

	// ── 立てる ───────────────────────────────────────────────
	// 接触した敵の meta.inflict を見てデバフ窓を立てる（meta.inflict が無ければ何もしない）。
	// 呼び出しは接触判定の唯一の入口（enemy-ai.js checkEnemyContact）1か所だけ。
	//
	// ⚠️ **接触は「触れている間ずっと毎 tick」起きる**（enemy-ai.js は重なりを毎 tick 見る）
	//    ∴再接触の扱いを間違えると機構が死ぬ：
	//      剣封じ … 窓の終わりを引き直す（触り続けている間は封じられたまま）。
	//      毒     … 窓の終わりだけ延ばし、**刻みの予定（_poisonNextAt）と減衰の進み
	//               （_poisonDmg）は引き継ぐ**。毎 tick 予定を引き直すと
	//               「次の刻み」が永久に先送りされ、**張り付かれている間は毒が
	//               1度も刻まない**（＝DoT が消える）。これは実装の都合ではなく
	//               機構の芯∴ここを「毎回引き直し」に戻すとテスト⑦が赤くなる。
	function inflictDebuff(meta) {
		const cfg = meta?.inflict;
		if (!cfg) return false;
		const player = getPlayer();
		if (!player) return false;
		const now = gameNow();
		if (cfg.type === 'sealSword') {
			const wasSealed = isSwordSealed(now);
			player._sealUntil = now + (cfg.ms ?? 3000);
			if (!wasSealed) {
				playSound('doorLock');   // 「封じられた」＝鍵が掛かる音を流用（専用SEは持たない）
				pulse?.('剣が封じられた！', 900);
				updatePlayerCharEl?.();
			}
			return true;
		}
		if (cfg.type === 'poison') {
			const ms     = cfg.ms ?? 2400;
			const tickMs = cfg.tickMs ?? 1200;
			// ⚠️ 「もう毒か」は窓を書き換える**前**に見る（後で見ると常に true になる）。
			const wasPoisoned = isPoisoned(now);
			// 窓の終わりは「今から ms」まで延ばす（既存の窓より手前へ縮めない）。
			player._poisonUntil  = Math.max(player._poisonUntil ?? 0, now + ms);
			player._poisonTickMs = tickMs;
			player._poisonDecay  = cfg.decay ?? 1;
			if (!wasPoisoned || player._poisonNextAt == null) {
				// 新規の毒＝刻みの予定と威力をここで決める
				player._poisonNextAt = now + tickMs;
				player._poisonDmg    = cfg.damage ?? 2;
				pulse?.('毒を受けた！', 900);
				updatePlayerCharEl?.();
			}
			return true;
		}
		return false;
	}

	// ── 訊く ────────────────────────────────────────────────
	function isSwordSealed(now = gameNow()) {
		const player = getPlayer();
		return player?._sealUntil != null && now < player._sealUntil;
	}

	function isPoisoned(now = gameNow()) {
		const player = getPlayer();
		return player?._poisonUntil != null && now < player._poisonUntil;
	}

	// ── 進める（gameTick から毎 tick）───────────────────────────
	// game.js gameTick の checkEnemyContact() の直後に置く＝「触れた結果」を
	// 同じ tick の中で処理する（接触で立った窓がその tick から効く）。
	function tickPlayerDebuffs() {
		const player = getPlayer();
		if (!player) return;
		const now = gameNow();

		// 剣封じ：窓が切れたら解除（切れた瞬間だけ絵とメッセージを出す）
		if (player._sealUntil != null && now >= player._sealUntil) {
			player._sealUntil = null;
			pulse?.('剣の封印が解けた', 900);
			updatePlayerCharEl?.();
		}

		// 毒：窓の中では tickMs ごとに刻む。1刻みごとに decay だけ弱まる（下限 1）
		// ＝名簿 #15 の「時間で減衰」。刻みの取りこぼしを防ぐため while で回す
		// （step(n) で一気に進めても刻んだ回数は tickMs 刻みで一定になる）。
		if (player._poisonUntil != null) {
			const tickMs = player._poisonTickMs ?? 1200;
			const decay  = player._poisonDecay ?? 1;
			while (player._poisonNextAt != null
				&& now >= player._poisonNextAt
				&& player._poisonNextAt <= player._poisonUntil) {
				const dmg = Math.max(1, player._poisonDmg ?? 1);
				// 毒は無敵窓を貫通し（ignoreInvincible）、無敵窓を与えない（noInvincible）
				// ＝毒を盾にできない（このモジュール冒頭 2.）。
				// （SE は takeDamage が 'playerHit' を鳴らす＝ここで重ねない）
				takeDamage?.(dmg, { ignoreInvincible: true, noInvincible: true });
				player._poisonDmg    = Math.max(1, dmg - decay);
				player._poisonNextAt = player._poisonNextAt + tickMs;
			}
			if (now >= player._poisonUntil) {
				clearPoison(player);
				pulse?.('毒が抜けた', 900);
				updatePlayerCharEl?.();
			}
		}
	}

	function clearPoison(player) {
		player._poisonUntil  = null;
		player._poisonNextAt = null;
		player._poisonDmg    = null;
		player._poisonTickMs = null;
		player._poisonDecay  = null;
	}

	// ステージ遷移やゲームオーバー後の再開など「デバフを持ち越さない」場面用。
	// ⚠️ 部屋移動では**呼ばない**（毒/封印は部屋を跨いで後を引く＝gameTime は連続）。
	function clearDebuffs() {
		const player = getPlayer();
		if (!player) return;
		player._sealUntil = null;
		clearPoison(player);
		updatePlayerCharEl?.();
	}

	return { inflictDebuff, isSwordSealed, isPoisoned, tickPlayerDebuffs, clearDebuffs };
}

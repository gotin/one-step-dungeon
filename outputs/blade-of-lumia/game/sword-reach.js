// game/sword-reach.js ── 剣の当たり判定（キュー85 #26 で combat.js swordAttack から切り出した）
//
// **剣の当たり判定の持ち主はこの1か所だけ。** 振った向きで一番近い相手を1つ選んで返す。
// 何も変えない純関数（DOM もゲームの状態も読まない）＝当てた後の処理は combat.js strikeTarget。
// 呼び出し側が「今いる敵・幻影・金の棘」と「届く距離」を渡す。
//
// 選び方（分ける前の swordAttack と1文字も違わない順）：
//   1. 敵（隠れ中は除く）のうち一番近いもの
//   2. 幻影がそれより**厳密に**近ければ幻影（同じ距離なら本物が勝つ）
//   3. 幻影に届いていたら棘は見ない（棘の方が近くても幻影）
//   4. 立っている棘が今の一番より**厳密に**近ければ棘（同じ距離なら竜が勝つ）

import { enemyW, enemyH, enemyCenter } from './hitbox.js';

// 剣が届いているか。戻り値＝振った向きに沿った距離（近い方が優先される）／届かないなら null。
// 占有範囲（AABB）対応：大型敵は中心が遠く半身が広いので、
// body の半幅ぶんだけ「届く距離」と「横の許容幅」を広げる。
// 1×1 敵では halfFwd=halfSide=0 となり従来挙動と一致する。
// ⚠️ Phase 8-4 (4) 0d-3（12体目 Z）: **幻影（`mirage`）にも同じ関数を通す**＝像は敵ではない
//    （`getEnemies()` に居ない）が、剣の間合いだけは本体と1文字も違ってはいけない
//    （違うと「像だけ届かない位置」が生まれて見分けられる＝機構が死ぬ）。
export function swordReachOf(t, { pcx, pcy, ndx, ndy, reach }) {
	const { cx: ecx, cy: ecy } = enemyCenter(t);
	const relX = ecx - pcx;
	const relY = ecy - pcy;

	const dot = relX * ndx + relY * ndy;
	if (dot < 0) return null;

	// 攻撃方向(ndx,ndy)に沿った body 半サイズ・直交方向の body 半サイズ
	const halfW = (enemyW(t) - 1) / 2;
	const halfH = (enemyH(t) - 1) / 2;
	const halfFwd  = Math.abs(ndx) * halfW + Math.abs(ndy) * halfH;
	const halfSide = Math.abs(ndy) * halfW + Math.abs(ndx) * halfH;

	const projDist = dot;
	if (projDist - halfFwd > reach) return null;

	const perpX = relX - ndx * projDist;
	const perpY = relY - ndy * projDist;
	const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
	if (perpDist > 0.8 + halfSide) return null;

	return projDist;
}

// 戻り値＝{ kind: 'enemy' | 'mirage' | 'thorn', target } ／何にも届かないなら null。
//   swing＝{ pcx, pcy（プレイヤーの中心）, ndx, ndy（振った向き）, reach（届く距離） }
export function findSwordTarget(swing, { enemies = [], mirages = [], thorns = [] } = {}) {
	let best = null;
	let bestDist = Infinity;
	for (const e of enemies) {
		// Phase 5.5k k-3: 隠れ中（潜行/地中/滞空）は攻撃対象にしない＝剣は空を切る。
		// ここで外さないと「無敵の敵が剣を吸う」＝背後の茂み切りや
		// 別の敵への攻撃まで潰れる（2026-08-14 ユーザー報告の同型）。
		if (e.hidden) continue;
		const d = swordReachOf(e, swing);
		if (d != null && d < bestDist) { bestDist = d; best = { kind: 'enemy', target: e }; }
	}

	// Phase 8-4 (4) 0d-3（12体目 Z）: 幻影＝**HP を持たない置き物**。同じ距離なら
	// **本物が勝つ**（`<` で比較＝重なって見えるときに剣が像に吸われて本体を殴れない、を作らない）。
	for (const m of mirages) {
		const d = swordReachOf(m, swing);
		if (d != null && d < bestDist) { bestDist = d; best = { kind: 'mirage', target: m }; }
	}
	// 幻影に届いたら棘は見ない（棘の方が近くても幻影が消える＝分ける前の順のまま）。
	if (best?.kind === 'mirage') return best;

	// キュー76③-3（Ω）: 金の棘＝幻影と同じ「HP を持たない置き物」。同じ距離なら
	// **竜が勝つ**（`<` で比較＝棘の向こうの竜を殴りたいとき棘に吸われない）。
	for (const t of thorns) {
		if (t.phase !== 'up') continue;
		const d = swordReachOf(t, swing);
		if (d != null && d < bestDist) { bestDist = d; best = { kind: 'thorn', target: t }; }
	}
	return best;
}

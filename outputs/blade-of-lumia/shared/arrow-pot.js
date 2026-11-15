// 矢の壺（TILE.ARROW_POT '0'・2026-11-15）の決まり＝純関数（ゲームとテストが同じものを見る）。
//
// ■ きっかけ（ユーザー指摘）
//   D8 二色の鐘の間は、鐘を矢（か銅の剣以上のビーム）で遠くから鳴らさないと出られない区画がある。
//   木の剣のまま矢を撃ち尽くすと閉じ込められる。「決まった数の矢を置くだけじゃだめ。関係ないところに
//   打てば消費されるだけで出られなくなる。矢の数が0になったら矢が自動的に現れるツボ、みたいなギミック」。
//
// ■ 決まり
//   ・弓を持っていて、矢が 0 本のときだけ使える（光る）。隣で剣のキー（話す・読むと同じ）を押すと
//     ARROW_POT_REFILL 本に戻る（矢筒の上限を超えない）。
//   ・矢が 1 本でもあれば何もしない＝壺で矢を集めることはできない（ただの補給所にしない）。
//   ・弓が無ければ何もしない（矢束と同じ「弓矢が無いと持っていけない」）。
import { ownsItem } from './items.js';

export const ARROW_POT_REFILL = 5;

export function arrowCount(player) {
	return player?.subItems?.bow?.count ?? 0;
}

/** 'ready'（矢が湧く）／'hasArrows'（まだ矢がある）／'noBow'（弓が無い） */
export function arrowPotState(player) {
	if (!ownsItem(player, 'bow')) return 'noBow';
	return arrowCount(player) <= 0 ? 'ready' : 'hasArrows';
}

/** 壺を使った後の矢の本数（ready 以外は今のまま） */
export function arrowPotRefillCount(player) {
	if (arrowPotState(player) !== 'ready') return arrowCount(player);
	const cap = player.maxArrows ?? ARROW_POT_REFILL;
	return Math.min(ARROW_POT_REFILL, cap);
}

// game/stone-return.js
// 笛で石が元の位置へ戻るときの演出（キュー112b・2026-11-22 ユーザー提案「石が浮いて元の位置に戻るのを
// アニメーションで動かす感じ」）。
//
// 状態（ss.stonePositions）は吹いた瞬間に戻し終えている＝この演出は見た目だけ。
// 盤面はもう元の位置に石を描いているので、飛んでいる間はそのセルの石の絵を隠し、
// 盤の上に重ねた別の層（#stone-return-layer）で石を「持ち上げる → 元の位置へ飛ぶ → 降ろす」。
// 別の層にするのは、途中で renderChars が char-layer を作り直しても石が消えないため。
// 途中で renderBoard が盤を作り直したら層ごと消える＝石は元の位置に描かれているだけ（壊れない）。
//
// 時間：持ち上げ LIFT_MS → 1マスあたり FLY_MS_PER_CELL（下限・上限つき）→ 降ろし LAND_MS。
// 石が複数あるときは同時に飛ぶ＝全体の長さは一番遠い石で決まる。
import { makeStoneEl } from './render-chars.js';

export const STONE_RETURN_LIFT_MS = 160;
export const STONE_RETURN_LAND_MS = 140;
const FLY_MS_PER_CELL = 90;
const FLY_MS_MIN = 260;
const FLY_MS_MAX = 900;
const LIFT_CELLS = 0.35;   // 持ち上げる高さ（マス）

/** 戻る石の一覧から、飛ぶ時間（持ち上げ・降ろしを除く）を出す。 */
export function stoneReturnFlyMs(flights) {
	const far = Math.max(0, ...flights.map((f) => Math.hypot(f.or - f.fr, f.oc - f.fc)));
	return Math.min(FLY_MS_MAX, Math.max(FLY_MS_MIN, Math.round(far * FLY_MS_PER_CELL)));
}

/** 演出全体の長さ（ms）。 */
export function stoneReturnTotalMs(flights) {
	return STONE_RETURN_LIFT_MS + stoneReturnFlyMs(flights) + STONE_RETURN_LAND_MS;
}

/**
 * 石を飛ばす。renderBoard()（と renderChars()）の直後に呼ぶ。
 * @param {HTMLElement} boardEl
 * @param {number} cellPx
 * @param {{key:string, fr:number, fc:number, or:number, oc:number, sprite:string}[]} flights
 *        fr,fc＝今いた所（沈んだ石は沈んだセル）・or,oc＝元の位置
 * @returns {number} 演出全体の長さ（ms）
 */
export function playStoneReturnFx(boardEl, cellPx, flights) {
	if (!boardEl || flights.length === 0) return 0;
	boardEl.querySelector('#stone-return-layer')?.remove();
	const layer = document.createElement('div');
	layer.id = 'stone-return-layer';
	boardEl.appendChild(layer);

	const fly = stoneReturnFlyMs(flights);
	const total = STONE_RETURN_LIFT_MS + fly + STONE_RETURN_LAND_MS;
	const o1 = STONE_RETURN_LIFT_MS / total;          // 持ち上げ終わり
	const o2 = (STONE_RETURN_LIFT_MS + fly) / total;  // 着いた（まだ浮いている）
	const lift = -LIFT_CELLS * cellPx;
	const hidden = [];

	for (const f of flights) {
		// 元の位置のセルに描かれた石を、着くまで隠す
		const cellSpr = boardEl.querySelector(`.cell[data-row="${f.or}"][data-col="${f.oc}"] > canvas.obj-sprite`);
		if (cellSpr) { cellSpr.style.visibility = 'hidden'; hidden.push(cellSpr); }

		const from = { left: `${f.fc * cellPx}px`, top: `${f.fr * cellPx}px` };
		const to = { left: `${f.oc * cellPx}px`, top: `${f.or * cellPx}px` };

		// 影＝地面に残る。浮くほど小さく薄く
		const shadow = document.createElement('div');
		shadow.className = 'stone-return-shadow';
		shadow.style.width = `${cellPx}px`;
		shadow.style.height = `${cellPx}px`;
		Object.assign(shadow.style, from);
		layer.appendChild(shadow);
		shadow.animate([
			{ ...from, transform: 'scale(1)', opacity: 0.45, offset: 0 },
			{ ...from, transform: 'scale(0.7)', opacity: 0.3, offset: o1 },
			{ ...to, transform: 'scale(0.7)', opacity: 0.3, offset: o2 },
			{ ...to, transform: 'scale(1)', opacity: 0.45, offset: 1 },
		], { duration: total, fill: 'forwards' });

		const stone = makeStoneEl(f.key, f.fr, f.fc, cellPx, { sprite: f.sprite });
		stone.id = `stone-return-${f.key.replace(',', '-')}`;
		stone.classList.add('stone-return');
		layer.appendChild(stone);
		stone.animate([
			{ ...from, transform: 'translateY(0)', offset: 0 },
			{ ...from, transform: `translateY(${lift}px)`, offset: o1, easing: 'ease-in-out' },
			{ ...to, transform: `translateY(${lift}px)`, offset: o2, easing: 'ease-in' },
			{ ...to, transform: 'translateY(0)', offset: 1 },
		], { duration: total, fill: 'forwards', easing: 'linear' });
	}

	setTimeout(() => {
		for (const el of hidden) el.style.visibility = '';
		layer.remove();
	}, total + 20);
	return total;
}

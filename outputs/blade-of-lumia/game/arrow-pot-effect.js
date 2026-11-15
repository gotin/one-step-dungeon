// game/arrow-pot-effect.js ── 矢の壺を叩いたときの演出（2026-11-15 ユーザー指定）
// ⚠️ ファイル名に「fx.js」を含めない＝tests/game-fx-wiring.spec.js が game.js の「fx.名前」を拾う（旧名 arrow-pot-fx.js で落ちた）。
//
// ユーザー指定「ツボはちゃんと攻撃できるようにして、攻撃をしたら壺から矢が飛び出てプレーヤーに届くところを
// アニメーション演出したい」。
//   ・壺が揺れる（.arrow-pot-burst）→ 矢が1本ずつ壺の口から上へ飛び出し、弧を描いて勇者の位置へ届く。
//   ・矢は進む向きに回す（矢の絵は右向き＝0°・game/projectile.js と同じ）。
//   ・届くたびに onEach（音）、最後の1本が届いたら onDone（本数を増やす・HUD）。
//   ・見た目だけの要素（#char-layer）。ゲームの状態は onDone でしか変えない。
//   ・動きを減らす設定（prefers-reduced-motion）では演出を省いてすぐ onDone。
import { makeSprite } from '../shared/sprites.js';

export const ARROW_POT_FX = {
	STAGGER_MS: 110,   // 1本ごとの飛び出しの間隔
	FLIGHT_MS:  420,   // 1本が壺から勇者に届くまで
	RISE_CELLS: 1.1,   // 弧の高さ（セル数）
};

/**
 * @param {object} o
 * @param {HTMLElement} o.layer   #char-layer
 * @param {number} o.cellPx
 * @param {{r:number,c:number}} o.pot     壺のセル
 * @param {{x:number,y:number}} o.hero    勇者の位置（セル単位・左上基準）
 * @param {number} o.count  飛ばす本数
 * @param {HTMLElement|null} o.potCell   壺のセル要素（揺らす）
 * @param {()=>void} [o.onEach]
 * @param {()=>void} o.onDone
 */
export function playArrowPotFx({ layer, cellPx, pot, hero, count, potCell, onEach, onDone }) {
	const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (!layer || reduced || typeof Element === 'undefined' || !Element.prototype.animate) { onDone(); return; }

	potCell?.classList.remove('arrow-pot-burst');
	void potCell?.offsetWidth;
	potCell?.classList.add('arrow-pot-burst');

	const { STAGGER_MS, FLIGHT_MS, RISE_CELLS } = ARROW_POT_FX;
	const size = Math.round(cellPx * 0.5);
	// 壺の口（セルの上寄り）→ 勇者の胸のあたり
	const sx = (pot.c + 0.5) * cellPx, sy = (pot.r + 0.25) * cellPx;
	const ex = (hero.x + 0.5) * cellPx, ey = (hero.y + 0.45) * cellPx;
	let arrived = 0;
	for (let i = 0; i < count; i++) {
		const el = document.createElement('div');
		el.className = 'arrow-pot-flyer';
		el.style.width = el.style.height = `${size}px`;
		const cv = makeSprite('arrow', 'arrow', false);
		if (cv) { cv.style.width = cv.style.height = '100%'; el.appendChild(cv); }
		layer.appendChild(el);
		// 本ごとに左右へ扇形に広げる（束が壺から噴き出す見た目・壺の真下に勇者が居ても壺に重ならない）
		// 真ん中（side 0）を作らない＝真上に上がって真下に落ちる矢は壺の胴を縦に横切る（途中経過で確認）
		const side = (i % 2 === 0 ? -1 : 1) * (Math.floor(i / 2) + 1);
		const spread = side * cellPx * 0.6;
		const mx = (sx + ex) / 2 + spread, my = Math.min(sy, ey) - RISE_CELLS * cellPx;
		// ❌ 初版＝矢を進む向き（接線）に回した → 落ちてくるとき矢先が勇者の頭に向き「撃たれている」に見えた
		//    （headless の途中経過で確認）。∴矢先は上向きのまま、少し傾けて揺らし、届く所で小さくなって消える（受け取る）。
		const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => {
			const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t ** 2 * ex;
			const y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t ** 2 * ey;
			const deg = -90 + side * 14 * (1 - t);
			const scale = t < 0.75 ? 1 : 1 - (t - 0.75) * 1.6;
			return { transform: `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${deg}deg) scale(${scale})`, offset: t };
		});
		pts[0].opacity = 0; pts[1].opacity = 1; pts[3].opacity = 1; pts[4].opacity = 0.3;
		const anim = el.animate(pts, { duration: FLIGHT_MS, delay: i * STAGGER_MS, easing: 'ease-in-out', fill: 'both' });
		anim.onfinish = () => {
			el.remove();
			onEach?.();
			if (++arrived === count) {
				potCell?.classList.remove('arrow-pot-burst');
				onDone();
			}
		};
	}
}

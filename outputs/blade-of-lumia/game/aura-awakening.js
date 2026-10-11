// game/aura-awakening.js ── 光の紋章が8つそろった瞬間の演出（実行キュー 0o・2026-10-11）
//
// ユーザー提案＝「紋章がひとつになって剣に光を注いで剣にオーラがまとった感じ」。
// 流れ（AURA_AWAKEN_MS ≒ 2.8 秒・その間は世界を止める＝呼び手が setFrozen で isTransitioning を立てる）：
//   ① 0〜300ms     画面が少し暗くなり、勇者が剣を頭上に掲げる
//   ② 300〜1500ms  紋章8つが勇者のまわりに1つずつ現れ、輪になって回る
//   ③ 1500〜1900ms 輪が渦を巻いて剣先の上の1点へ縮み、大きな紋章1つに合わさる（閃光）
//   ④ 1900〜2450ms 大きな紋章が沈みながら剣へ光の柱を注ぐ
//   ⑤ 2350〜2800ms 剣が光り、光の刃が上へ伸びて光の輪が弾ける → 片付けて世界を戻す
// 絵は既存の物だけ（紋章＝UI の絵・剣＝構えの剣の絵・光の刃＝`.sword-aura` の CSS）。
// 時間は実時間（setTimeout／Web Animations）＝世界は止まっているので論理時間を進めない。
import { makeSprite } from '../shared/sprites.js';
import { iconCanvas } from '../shared/ui-icons.js';
import { SWORD_TIERS, EMBLEMS_FOR_AURA } from '../shared/items.js';

export const AURA_AWAKEN_MS = 2800;

/**
 * deps:
 *   getCharLayerEl() / getCellPx() / getPlayer()
 *   setFrozen(bool)      – 世界を止める／戻す（isTransitioning）
 *   setHeroDir(dir) / refreshPlayer() – 勇者を正面に向けて描き直す
 *   clearSwordHeld()     – 振っていた剣を消す
 *   playSound(name)
 */
export function createAuraAwakening(deps) {
	let running = false;

	function play(onDone) {
		const layer = deps.getCharLayerEl();
		if (!layer || running) { onDone?.(); return; }
		running = true;
		deps.setFrozen(true);
		deps.clearSwordHeld?.();
		deps.setHeroDir?.('down');
		deps.refreshPlayer?.();

		const cell = deps.getCellPx();
		const p = deps.getPlayer();
		const cx = (p.x + 0.5) * cell;             // 勇者の中心
		const top = p.y * cell;                     // 勇者のセルの上辺
		const root = document.createElement('div');
		root.className = 'aura-awakening';
		// ⚠️ 文字の層（char-layer）は大きさを持たない＝inset:0 だと暗転が0×0になる∴盤面の大きさで張る。
		const board = document.getElementById('board');
		root.style.cssText = `position:absolute;left:0;top:0;width:${board?.offsetWidth ?? 0}px;height:${board?.offsetHeight ?? 0}px;pointer-events:none;z-index:40;`;
		layer.appendChild(root);
		const add = (el, css) => { el.style.cssText = `position:absolute;pointer-events:none;${css}`; root.appendChild(el); return el; };
		const anim = (el, frames, delay, dur, extra = {}) =>
			el.animate(frames, { delay, duration: dur, fill: 'both', easing: 'ease-out', ...extra });

		// ① 暗転と掲げた剣（刃は上向き・柄が頭のすぐ上）
		// 暗転は盤面だけ＝勇者より下に敷く（char-layer 内で z-index:-1＝盤面より上・キャラより下＝はしごの重ねと同じ手）。
		const dim = document.createElement('div');
		dim.className = 'aura-awakening-dim';
		dim.style.cssText = `position:absolute;left:0;top:0;width:${board?.offsetWidth ?? 0}px;height:${board?.offsetHeight ?? 0}px;`
			+ 'pointer-events:none;z-index:-1;background:rgba(5,10,30,0.5);';
		layer.appendChild(dim);
		anim(dim, [{ opacity: 0 }, { opacity: 1 }], 0, 300);
		anim(dim, [{ opacity: 1 }, { opacity: 0 }], AURA_AWAKEN_MS - 300, 300, { fill: 'forwards' });

		const swW = cell * 0.24, swH = cell * 0.84;
		const swordTop = top - swH + cell * 0.12;   // 剣の切っ先の y
		const tier = SWORD_TIERS[p.swordTier ?? 0];
		const sword = makeSprite('swordHeldUp', tier?.pal ?? 'sword');
		const swordBox = add(document.createElement('div'),
			`left:${cx - swW / 2}px;top:${swordTop}px;width:${swW}px;height:${swH}px;`);
		swordBox.className = 'aura-awakening-sword';
		if (sword) {
			sword.style.cssText = 'position:absolute;left:0;top:0;transform:none;image-rendering:pixelated;';
			sword.style.setProperty('width', '100%', 'important');
			sword.style.setProperty('height', '100%', 'important');
			swordBox.appendChild(sword);
		}
		anim(swordBox, [{ transform: `translateY(${cell * 0.4}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], 0, 300);

		// ② 紋章8つの輪（輪ごと回し、③で剣先の上の1点へ縮める）
		const P = { x: cx, y: swordTop - cell * 0.55 };   // 合わさる点＝剣先の少し上
		const ring = add(document.createElement('div'), `left:${cx}px;top:${top + cell * 0.5}px;width:0;height:0;`);
		const R = cell * 1.5, icon = Math.round(cell * 0.62);
		for (let i = 0; i < EMBLEMS_FOR_AURA; i++) {
			const a = (i / EMBLEMS_FOR_AURA) * Math.PI * 2 - Math.PI / 2;
			const cv = iconCanvas('emblem', icon, { fit: 'box' });
			if (!cv) continue;
			cv.classList.add('aura-awakening-emblem');
			cv.style.cssText = `position:absolute;left:${Math.cos(a) * R - icon / 2}px;top:${Math.sin(a) * R - icon / 2}px;`
				+ `width:${icon}px;height:${icon}px;image-rendering:pixelated;filter:drop-shadow(0 0 ${Math.round(cell * 0.08)}px #ffe9a0);`;
			ring.appendChild(cv);
			anim(cv, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], 300 + i * 90, 260);
		}
		const dx = P.x - cx, dy = P.y - (top + cell * 0.5);
		anim(ring, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(200deg)' }], 300, 1200, { easing: 'linear' });
		anim(ring, [
			{ transform: 'translate(0,0) rotate(200deg) scale(1)', opacity: 1 },
			{ transform: `translate(${dx}px,${dy}px) rotate(560deg) scale(0.05)`, opacity: 1 },
		], 1500, 400, { easing: 'ease-in' });
		anim(ring, [{ opacity: 1 }, { opacity: 0 }], 1880, 40);

		// ③ 合わさった大きな紋章＋閃光
		setTimeout(() => { if (root.isConnected) deps.playSound?.('item'); }, 1880);
		const bigPx = Math.round(cell * 1.1);
		const big = iconCanvas('emblem', bigPx, { fit: 'box' });
		if (big) {
			big.classList.add('aura-awakening-big');
			add(big, `left:${P.x - bigPx / 2}px;top:${P.y - bigPx / 2}px;width:${bigPx}px;height:${bigPx}px;`
				+ `image-rendering:pixelated;filter:drop-shadow(0 0 ${Math.round(cell * 0.15)}px #fff3c0) drop-shadow(0 0 ${Math.round(cell * 0.3)}px #8fd8ff);`);
			anim(big, [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.35)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], 1880, 320);
			// ④ 沈みながら剣へ注ぎ込む
			anim(big, [{ transform: 'scale(1)', opacity: 1 }, { transform: `translateY(${cell * 0.55}px) scale(0.35)`, opacity: 0 }], 2200, 300, { easing: 'ease-in', fill: 'forwards' });
		}
		const flash = add(document.createElement('div'),
			`left:${P.x - cell}px;top:${P.y - cell}px;width:${cell * 2}px;height:${cell * 2}px;border-radius:50%;`
			+ 'background:radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(200,240,255,0.6) 35%, rgba(150,210,255,0) 70%);');
		anim(flash, [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.6)', opacity: 0 }], 1860, 420);

		// ④ 光の柱（紋章から剣の柄まで）
		const colW = cell * 0.36;
		const column = add(document.createElement('div'),
			`left:${cx - colW / 2}px;top:${P.y}px;width:${colW}px;height:${top - P.y}px;border-radius:${colW}px;`
			+ 'background:linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(170,225,255,0.75));'
			+ `box-shadow:0 0 ${cell * 0.2}px rgba(150,220,255,0.9);transform-origin:50% 0;`);
		column.className = 'aura-awakening-column';
		anim(column, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }], 1950, 220);
		anim(column, [{ opacity: 1 }, { opacity: 0 }], 2380, 200, { fill: 'forwards' });

		// ⑤ 剣が光り、光の刃が上へ伸び、光の輪が弾ける
		setTimeout(() => {
			if (!root.isConnected) return;
			sword && (sword.style.filter = `drop-shadow(0 0 ${Math.max(2, Math.round(cell * 0.08))}px #e8f8ff) drop-shadow(0 0 ${Math.max(2, Math.round(cell * 0.08)) * 2}px #8fd8ff)`);
			deps.playSound?.('fanfare');
		}, 2350);
		// 光の刃は伸びるところを見せたい＝CSS の伸びのアニメが走るよう、出す瞬間に作る。
		const auraLen = cell * 1.2;
		setTimeout(() => {
			if (!root.isConnected) return;
			const aura = add(document.createElement('div'),
				`left:${cx - swW * 0.65}px;top:${swordTop - auraLen + swH * 0.5}px;width:${swW * 1.3}px;height:${auraLen}px;--aura-ms:420ms;`);
			aura.className = 'sword-aura dir-up aura-awakening-blade';
			for (const part of ['blade', 'core']) {
				const d = document.createElement('div');
				d.className = `sword-aura-${part}`;
				aura.appendChild(d);
			}
		}, 2380);
		const burst = add(document.createElement('div'),
			`left:${cx - cell}px;top:${swordTop - cell * 0.6}px;width:${cell * 2}px;height:${cell * 2}px;border-radius:50%;`
			+ `border:${Math.max(2, Math.round(cell * 0.06))}px solid rgba(200,240,255,0.9);box-shadow:0 0 ${cell * 0.2}px rgba(150,220,255,0.9);`);
		anim(burst, [{ transform: 'scale(0.1)', opacity: 0 }, { transform: 'scale(0.4)', opacity: 1, offset: 0.2 }, { transform: 'scale(1.6)', opacity: 0 }], 2380, 420);

		setTimeout(() => {
			root.remove();
			dim.remove();
			running = false;
			deps.setFrozen(false);
			deps.refreshPlayer?.();
			onDone?.();
		}, AURA_AWAKEN_MS);
	}

	return { play, isRunning: () => running };
}

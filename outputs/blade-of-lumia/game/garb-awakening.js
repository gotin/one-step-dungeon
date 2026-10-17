// game/garb-awakening.js ── 金の装束を手に入れた瞬間の演出（キュー76⑤ の追い・2026-10-17）
//
// ユーザー提案＝「光の紋章8つそろえたときと同じ感じのアニメーションエフェクト。まさにドラゴンボールの
// スーパーサイヤ人みたいに、ボワーっとオーラがついてその間に見た目がかわる」。
// 流れ（GARB_AWAKEN_MS ≒ 2.8 秒・その間は世界を止める＝呼び手が setFrozen で isTransitioning を立てる）：
//   ① 0〜300ms     盤面が暗くなり、勇者が正面を向く（まだ元の見た目）
//   ② 300〜1500ms  足元から金のオーラが燃え上がって大きくなる（炎の舌が揺れ、光の粒が昇る）・勇者が震える
//   ③ 1500ms       白い閃光 → その瞬間に金の装束の見た目へ切り替わる（hasGoldGarb を立てて描き直す）
//   ④ 1500〜2500ms オーラが一段と大きく燃え、稲妻の火花が散る → 静まる
//   ⑤ 2800ms       片付けて世界を戻す
// 絵は既存の物だけ（勇者の絵は通常／金の装束の2種・オーラと火花は CSS）。
// 時間は実時間（setTimeout／Web Animations）＝世界は止まっているので論理時間を進めない（aura-awakening.js と同じ）。

export const GARB_AWAKEN_MS = 2800;
const CHANGE_AT_MS = 1500;   // 見た目が変わる瞬間（閃光の頂点）

/**
 * deps:
 *   getCharLayerEl() / getCellPx() / getPlayer()
 *   setFrozen(bool)      – 世界を止める／戻す（isTransitioning）
 *   setHeroDir(dir) / refreshPlayer() – 勇者を正面に向けて描き直す
 *   clearSwordHeld()     – 振っていた剣を消す
 *   playSound(name)
 */
export function createGarbAwakening(deps) {
	let running = false;

	function play(onDone) {
		const layer = deps.getCharLayerEl();
		const p = deps.getPlayer();
		if (!layer || !p || running) { onDone?.(); return; }
		running = true;
		deps.setFrozen(true);
		deps.clearSwordHeld?.();
		deps.setHeroDir?.('down');
		// 変わる前の姿を見せる（装束は入手時に立っている＝閃光の瞬間まで一時的に下ろす）。
		// ⚠️ 世界は止まっている＝この間にセーブ・判定は走らない。終わりに必ず立て直す（下の finish）。
		p.hasGoldGarb = false;
		deps.refreshPlayer?.();

		const cell = deps.getCellPx();
		const cx = (p.x + 0.5) * cell;
		const cy = (p.y + 0.5) * cell;
		const foot = (p.y + 1) * cell;
		const board = document.getElementById('board');
		const W = board?.offsetWidth ?? 0, H = board?.offsetHeight ?? 0;
		const anim = (el, frames, delay, dur, extra = {}) =>
			el.animate(frames, { delay, duration: dur, fill: 'both', easing: 'ease-out', ...extra });

		// ① 暗転（盤面だけ＝勇者より下・z-index:-1）
		const dim = document.createElement('div');
		dim.className = 'garb-awakening-dim';
		dim.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:-1;`
			+ 'background:rgba(10,6,0,0.55);';
		layer.appendChild(dim);
		anim(dim, [{ opacity: 0 }, { opacity: 1 }], 0, 300);
		anim(dim, [{ opacity: 1 }, { opacity: 0 }], GARB_AWAKEN_MS - 300, 300, { fill: 'forwards' });

		// ② オーラ（勇者の後ろ＝暗転と同じ -1 で後から足す＝暗転より上・キャラより下）
		const back = document.createElement('div');
		back.className = 'garb-awakening-aura';
		// 根元は足より少し下＝体を包む（足元で水平に切れると「カーテン」に見えた・撮って確認）
		back.style.cssText = `position:absolute;left:${cx}px;top:${foot + cell * 0.3}px;width:0;height:0;pointer-events:none;z-index:-1;`;
		layer.appendChild(back);
		const glowW = cell * 1.9, glowH = cell * 2.6;
		const glow = document.createElement('div');
		glow.style.cssText = `position:absolute;left:${-glowW / 2}px;top:${-glowH}px;width:${glowW}px;height:${glowH}px;`
			+ 'border-radius:50% 50% 45% 45% / 60% 60% 40% 40%;transform-origin:50% 100%;'
			+ 'background:radial-gradient(ellipse at 50% 70%, rgba(255,255,220,0.95) 0%, rgba(255,226,90,0.85) 30%, rgba(255,170,20,0.55) 55%, rgba(255,140,0,0) 75%);'
			+ `filter:blur(${Math.max(1, Math.round(cell * 0.04))}px);`;
		back.appendChild(glow);
		anim(glow, [{ transform: 'scale(0.2, 0.1)', opacity: 0 }, { transform: 'scale(1, 1)', opacity: 1 }], 300, 1000, { easing: 'cubic-bezier(.2,.8,.3,1)' });
		anim(glow, [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.35, 1.3)' }, { transform: 'scale(1.15, 1.12)' }], CHANGE_AT_MS, 700);
		anim(glow, [{ opacity: 1 }, { opacity: 0 }], 2300, 450, { fill: 'forwards' });
		// 揺らぎ（燃えている感じ＝拡大の上に小さな脈を重ねる）
		glow.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.25)' }, { filter: 'brightness(1)' }],
			{ duration: 180, iterations: Math.ceil(GARB_AWAKEN_MS / 180) });

		// 炎の舌＝左右に並べた細長い炎が、ずれた拍で伸び縮みしながら揺れる
		const TONGUES = 9;
		for (let i = 0; i < TONGUES; i++) {
			const u = i / (TONGUES - 1) - 0.5;                 // -0.5..0.5
			const w = cell * (0.28 + 0.12 * (1 - Math.abs(u) * 2));
			const h = cell * (1.3 + 0.9 * (1 - Math.abs(u) * 2));
			const t = document.createElement('div');
			t.className = 'garb-awakening-flame';
			t.style.cssText = `position:absolute;left:${u * cell * 1.3 - w / 2}px;top:${-h}px;width:${w}px;height:${h}px;`
				+ 'border-radius:50% 50% 50% 50% / 80% 80% 20% 20%;transform-origin:50% 100%;'
				+ 'background:linear-gradient(to top, rgba(255,240,170,0) 0%, rgba(255,250,200,0.95) 18%, rgba(255,215,60,0.85) 50%, rgba(255,160,0,0) 100%);';
			back.appendChild(t);
			const start = 300 + Math.abs(u) * 400;
			anim(t, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 0.9 }], start, 500);
			const tilt = (u * 18).toFixed(1);
			t.animate([
				{ transform: `rotate(${tilt}deg) scale(1, 1)` },
				{ transform: `rotate(${(-tilt / 2).toFixed(1)}deg) scale(0.85, 1.25)` },
				{ transform: `rotate(${tilt}deg) scale(1, 1)` },
			], { delay: start + 500, duration: 220 + (i % 3) * 60, iterations: Infinity });
			anim(t, [{ opacity: 0.9 }, { opacity: 0 }], 2200 + (i % 4) * 60, 400, { fill: 'forwards' });
		}

		// 前面（閃光・光の粒・火花）
		const front = document.createElement('div');
		front.className = 'garb-awakening';
		front.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:40;`;
		layer.appendChild(front);
		const add = (css, cls = '') => {
			const el = document.createElement('div');
			if (cls) el.className = cls;
			el.style.cssText = `position:absolute;pointer-events:none;${css}`;
			front.appendChild(el);
			return el;
		};
		// 光の粒が足元から昇る（決定的にばらす＝乱数なし）
		for (let i = 0; i < 14; i++) {
			const s = Math.max(2, Math.round(cell * (0.06 + (i % 3) * 0.02)));
			const x0 = cx + (((i * 37) % 13) / 12 - 0.5) * cell * 1.4;
			const dot = add(`left:${x0}px;top:${foot - s}px;width:${s}px;height:${s}px;border-radius:50%;`
				+ 'background:#fff6c8;box-shadow:0 0 4px 1px rgba(255,220,90,0.9);');
			const d = 350 + (i * 83) % 1700;
			anim(dot, [{ transform: 'translateY(0)', opacity: 0 }, { transform: `translateY(${-cell * 0.6}px)`, opacity: 1, offset: 0.2 },
				{ transform: `translateY(${-cell * (1.8 + (i % 4) * 0.3)}px)`, opacity: 0 }], d, 650, { easing: 'ease-in' });
		}
		// ③ 閃光
		const flash = add(`left:${cx - cell * 1.4}px;top:${cy - cell * 1.4}px;width:${cell * 2.8}px;height:${cell * 2.8}px;border-radius:50%;`
			+ 'background:radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,245,200,0.8) 35%, rgba(255,220,100,0) 70%);', 'garb-awakening-flash');
		anim(flash, [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.35 }, { transform: 'scale(1.5)', opacity: 0 }],
			CHANGE_AT_MS - 140, 460);
		// ④ 稲妻の火花（細い折れ線を体のまわりに一瞬ずつ）
		const bolts = [[-0.7, -0.6, 25], [0.65, -0.9, -30], [-0.5, 0.2, -60], [0.6, 0.1, 50], [0.05, -1.25, 5], [-0.85, -1.1, 70]];
		bolts.forEach(([ox, oy, rot], i) => {
			const bw = cell * 0.5, bh = cell * 0.5;
			const b = add(`left:${cx + ox * cell - bw / 2}px;top:${cy + oy * cell - bh / 2}px;width:${bw}px;height:${bh}px;transform:rotate(${rot}deg);`);
			b.innerHTML = `<svg viewBox="0 0 10 10" width="100%" height="100%" style="overflow:visible">`
				+ '<polyline points="1,0 5,4 3,5 9,10" fill="none" stroke="#fffbe0" stroke-width="1.1" stroke-linejoin="bevel"'
				+ ' style="filter:drop-shadow(0 0 1.5px #ffd84a)"/></svg>';
			anim(b, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], CHANGE_AT_MS + 60 + i * 130, 200);
		});

		// ② の間の震え（勇者の要素を小刻みに揺らす）
		const hero = document.getElementById('char-player');
		const shake = hero?.animate([
			{ translate: '0 0' }, { translate: `${cell * 0.03}px 0` }, { translate: `${-cell * 0.03}px 0` }, { translate: '0 0' },
		], { delay: 600, duration: 90, iterations: Math.round((CHANGE_AT_MS - 600) / 90) });

		// 音：溜め（オーラの立ち上がり）→ 変わる瞬間
		setTimeout(() => { if (front.isConnected) deps.playSound?.('appear'); }, 300);
		setTimeout(() => {
			if (!front.isConnected) return;
			p.hasGoldGarb = true;
			deps.refreshPlayer?.();
			deps.playSound?.('fanfare');
		}, CHANGE_AT_MS);

		setTimeout(() => {
			shake?.cancel();
			front.remove();
			back.remove();
			dim.remove();
			running = false;
			p.hasGoldGarb = true;   // 途中で片付いても装束は必ず立っている
			deps.setFrozen(false);
			deps.refreshPlayer?.();
			onDone?.();
		}, GARB_AWAKEN_MS);
	}

	return { play, isRunning: () => running };
}

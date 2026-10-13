// ── sound-toggle.js ───────────────────────────────────────────
// 実行キュー58：消音の切り替え。音そのものの出口は shared/sounds.js（BGM と効果音の2つのゲイン）。
// ここは画面側＝ポーズ画面のボタン2つ（片方ずつ）と M キー（input.js から呼ぶ・両方まとめて）。
// 通常プレイでもプレビューでも効く。

import { getSoundSettings, setBgmEnabled, setSeEnabled, toggleAllSound } from '../shared/sounds.js';

/**
 * @param {object} deps
 * @param {(msg:string, ms:number) => void} deps.pulse
 */
export function initSoundToggle({ pulse }) {
	const bgmBtn = document.getElementById('pause-sound-bgm');
	const seBtn  = document.getElementById('pause-sound-se');

	function render() {
		const s = getSoundSettings();
		if (bgmBtn) {
			bgmBtn.textContent = `BGM：${s.bgm ? 'ON' : 'OFF'}`;
			bgmBtn.classList.toggle('pause-sound-btn--off', !s.bgm);
		}
		if (seBtn) {
			seBtn.textContent = `効果音：${s.se ? 'ON' : 'OFF'}`;
			seBtn.classList.toggle('pause-sound-btn--off', !s.se);
		}
	}

	// ⚠️ クリックの後にボタンからフォーカスを外す＝残すと次の Space がブラウザの既定動作で
	//    ボタンを押し直す（ポーズ中の Space はゲーム側で何もしない＝止める者がいない）。
	bgmBtn?.addEventListener('click', () => { setBgmEnabled(!getSoundSettings().bgm); render(); bgmBtn.blur(); });
	seBtn?.addEventListener('click',  () => { setSeEnabled(!getSoundSettings().se);   render(); seBtn.blur(); });
	render();

	/** M キー：両方まとめて切り替え、短く知らせる。 */
	function toggleAll() {
		const s = toggleAllSound();
		render();
		pulse(s.bgm ? '音：ON（BGM・効果音）' : '音：OFF（BGM・効果音）', 1200);
	}

	return { toggleAll, render };
}

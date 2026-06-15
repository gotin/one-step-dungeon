// ── input.js ──────────────────────────────────────────────────
// Phase 0-2 Step 4: キーボード・モバイル・スワイプ入力を game.js から切り出し
//
// export: initInput(deps) → { heldKeys, processHeldKeys }
//
// initInput() を呼ぶと document にイベントリスナーが登録される。
// 返り値の heldKeys（Set）は gameTick が参照し、
// processHeldKeys() は gameTick から毎フレーム呼ばれる。
//
// deps は以下の getter と関数を注入する：
//   getIsDialog()      → isDialog
//   getIsShop()        → isShop
//   getIsPaused()      → isPaused
//   getIsGameover()    → isGameover（retryGame 用）
//   getIsShielding()   → isShielding
//   setIsShielding(v)  → isShielding = v
//   movePlayer(dir)    → プレイヤー移動
//   swordAttack()      → 剣攻撃
//   useSubItem()       → サブアイテム使用
//   togglePause()      → ポーズ切り替え
//   toggleDebugMode()  → デバッグモード切り替え
//   advanceDialog()    → ダイアログ次へ
//   closeShop()        → ショップを閉じる
//   shopSelectPrev()   → ショップ選択前へ
//   shopSelectNext()   → ショップ選択次へ
//   shopBuy()          → ショップ購入
//   pauseSelectPrev()  → ポーズ選択前へ
//   pauseSelectNext()  → ポーズ選択次へ
//   resumeAudio()      → オーディオ再開
//   hasCleared()       → クリア済みフラグ
//   getMovePlayer()    → movePlayer 参照（processHeldKeys 用）
//
// MOVE_STEP / DIR_DELTA は直接 import する。

import { MOVE_STEP } from './constants.js';
import { resumeAudio } from '../shared/sounds.js';

/**
 * 入力ハンドラを登録し、heldKeys と processHeldKeys を返す factory。
 * @param {object} deps
 */
export function initInput(deps) {
	const {
		getIsDialog,
		getIsShop,
		getIsPaused,
		getIsShielding,
		setIsShielding,
		movePlayer,
		swordAttack,
		useSubItem,
		toggleFlight,
		togglePause,
		toggleDebugMode,
		advanceDialog,
		closeShop,
		shopSelectPrev,
		shopSelectNext,
		shopBuy,
		pauseSelectPrev,
		pauseSelectNext,
		hasCleared,
		updateShieldHud,
	} = deps;

	// 現在押されているキーを管理（押しっぱなし移動用）
	const heldKeys = new Set();

	document.addEventListener('keydown', e => {
		resumeAudio();
		if (getIsDialog()) {
			if ([' ','Enter','z','Z'].includes(e.key)) { e.preventDefault(); advanceDialog(); }
			return;
		}
		if (getIsShop()) {
			if (e.key === 'Escape') { e.preventDefault(); closeShop(); return; }
			if (e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') { e.preventDefault(); shopSelectPrev(); return; }
			if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); shopSelectNext(); return; }
			if ([' ','Enter','z','Z'].includes(e.key)) { e.preventDefault(); shopBuy(); return; }
			return;
		}
		if (getIsPaused()) {
			if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); togglePause(); return; }
			if (e.key === 'ArrowLeft')  { e.preventDefault(); pauseSelectPrev(); return; }
			if (e.key === 'ArrowRight') { e.preventDefault(); pauseSelectNext(); return; }
			return;
		}
		// 方向キーは heldKeys で管理（gameTick で処理）
		if (['ArrowUp','w','W','ArrowDown','s','S','ArrowLeft','a','A','ArrowRight','d','D'].includes(e.key)) {
			e.preventDefault();
			heldKeys.add(e.key);
			return;
		}
		if ([' ','z','Z'].includes(e.key)) { e.preventDefault(); swordAttack(); return; }
		if (e.key === 'b' || e.key === 'B') { e.preventDefault(); useSubItem(); return; }
		if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFlight?.(); return; }
		// Mac: Commandキー / Windows: Altキー でもサブアイテム使用
		if (e.key === 'Meta' || e.key === 'Alt') { e.preventDefault(); useSubItem(); return; }
		if (e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
		if (e.key === 'g' || e.key === 'G') { e.preventDefault(); toggleDebugMode(); return; }
	});

	document.addEventListener('keyup', e => {
		heldKeys.delete(e.key);
	});

	// ── モバイル ──────────────────────────────────────────────
	document.querySelectorAll('.dpad-btn[data-dir]').forEach(btn => {
		const dir = btn.dataset.dir;
		if (!dir) return;
		btn.addEventListener('touchstart', e => { e.preventDefault(); resumeAudio(); movePlayer(dir); }, { passive: false });
		btn.addEventListener('mousedown', () => { resumeAudio(); movePlayer(dir); });
	});

	document.getElementById('btn-sword')?.addEventListener('click', () => { resumeAudio(); swordAttack(); });
	document.getElementById('btn-sub')?.addEventListener('click',   () => { resumeAudio(); useSubItem(); });
	document.getElementById('btn-fly')?.addEventListener('click',   () => { resumeAudio(); toggleFlight?.(); });
	document.getElementById('btn-menu')?.addEventListener('click',  () => { resumeAudio(); togglePause(); });

	const shieldBtn = document.getElementById('btn-shield');
	if (shieldBtn) {
		shieldBtn.addEventListener('touchstart', e => { e.preventDefault(); setIsShielding(true);  updateShieldHud(); }, { passive: false });
		shieldBtn.addEventListener('touchend',   () => { setIsShielding(false); updateShieldHud(); });
		shieldBtn.addEventListener('mousedown',  () => { setIsShielding(true);  updateShieldHud(); });
		shieldBtn.addEventListener('mouseup',    () => { setIsShielding(false); updateShieldHud(); });
	}

	// ── スワイプ ──────────────────────────────────────────────
	let touchStartX = 0, touchStartY = 0;
	document.addEventListener('touchstart', e => {
		if (e.target.closest('#mobile-ctrl')) return;
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}, { passive: true });
	document.addEventListener('touchend', e => {
		if (e.target.closest('#mobile-ctrl')) return;
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
		if (Math.abs(dx) > Math.abs(dy)) movePlayer(dx > 0 ? 'right' : 'left');
		else movePlayer(dy > 0 ? 'down' : 'up');
	}, { passive: true });

	// ── 押しっぱなし移動処理（gameTick から呼ぶ） ────────────
	let _moveSpeedAccum = 0;

	function processHeldKeys() {
		let dir = null;
		if (heldKeys.has('ArrowUp')    || heldKeys.has('w') || heldKeys.has('W')) dir = 'up';
		else if (heldKeys.has('ArrowDown')  || heldKeys.has('s') || heldKeys.has('S')) dir = 'down';
		else if (heldKeys.has('ArrowLeft')  || heldKeys.has('a') || heldKeys.has('A')) dir = 'left';
		else if (heldKeys.has('ArrowRight') || heldKeys.has('d') || heldKeys.has('D')) dir = 'right';
		if (!dir) { _moveSpeedAccum = 0; return; }

		// 二周目（姫パレット）は移動速度1.2倍
		const speed = hasCleared() ? 1.2 : 1.0;
		_moveSpeedAccum += speed;
		const times = Math.floor(_moveSpeedAccum);
		_moveSpeedAccum -= times;
		for (let i = 0; i < times; i++) movePlayer(dir);
	}

	return { heldKeys, processHeldKeys };
}

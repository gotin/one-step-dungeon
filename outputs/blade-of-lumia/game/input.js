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
//   getIsCutscene()    → ボス終幕の演出中（true の間は入力を一切受けない）
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

import { MOVE_STEP, DASH_SPEED } from './constants.js';
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
		getIsCutscene,
		getIsShielding,
		setIsShielding,
		movePlayer,
		swordAttack,
		startCharge,
		releaseCharge,
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
		pauseMarkPrev,
		pauseMarkNext,
		hasCleared,
		canDash,
		setDashing,
		updateShieldHud,
	} = deps;

	// 現在押されているキーを管理（押しっぱなし移動用）
	const heldKeys = new Set();

	// ボス終幕（boss.js の onBossDefeated / onBossYielded）の間は演出だけを見せる。
	// ⚠️ ゲームループを止めても入力ハンドラは生きている＝連打すると swordAttack /
	// useSubItem が走り、その失敗メッセージ（「剣を持っていない！」「アイテムがない！」
	// 「矢がない！」…）が **共有バー1本の #msg-bar** へ割り込んで
	// 終幕の台詞を消してしまう（2026-08-20 実測で再現＝ユーザー報告の実因）。
	// ∴ここで飲む。押しっぱなしも捨てる（演出明けに勝手に歩き出さない）。
	const inCutscene = () => !!getIsCutscene?.();

	// ボタンを選ぶ枠（タイトル・削除確認・ゲームオーバー・エンディング）が出ているか。
	// この間だけ Tab の既定動作（次の要素へフォーカス）を通す＝マウスを使わずボタンへ届く道を残す。
	const BUTTON_OVERLAYS = ['title-overlay', 'confirm-overlay', 'gameover-overlay', 'ending-overlay'];
	const buttonOverlayOpen = () => BUTTON_OVERLAYS.some(id => {
		const el = document.getElementById(id);
		return !!el && !el.classList.contains('hidden');
	});

	document.addEventListener('keydown', e => {
		resumeAudio();
		// ⚠️ Tab は遊んでいる間ずっと飲む（2026-09-15 ユーザー報告）。
		// 既定動作はフォーカスを次の要素へ送る＝送り先が尽きるとブラウザ側（アドレス欄など）へ抜け、
		// **カーソルキーがゲームに届かなくなる**＝キーボードだけでは戻れない。
		// ポーズの Tab（旧モード切替）を消したことで「何も起きないキー」になった∴ここで塞ぐ。
		if (e.key === 'Tab' && !buttonOverlayOpen()) { e.preventDefault(); return; }
		if (inCutscene()) { e.preventDefault(); heldKeys.clear(); return; }
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
			if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) togglePause(); return; }
			if (e.key === 'ArrowLeft')  { e.preventDefault(); pauseSelectPrev(); return; }
			if (e.key === 'ArrowRight') { e.preventDefault(); pauseSelectNext(); return; }
			// ↑↓＝目的地マーク。**モードは無い**（2026-09-15 ユーザー決定で Tab の
			// フォーカス切替を廃止）＝←→＝アイテム／↑↓＝マークが常に同時に生きている。
			// ∴「今どっちのモードか」を画面で示す必要が無い。
			if (e.key === 'ArrowUp')    { e.preventDefault(); pauseMarkPrev?.(); return; }
			if (e.key === 'ArrowDown')  { e.preventDefault(); pauseMarkNext?.(); return; }
			return;
		}
		// 方向キーは heldKeys で管理（gameTick で処理）
		if (['ArrowUp','w','W','ArrowDown','s','S','ArrowLeft','a','A','ArrowRight','d','D'].includes(e.key)) {
			e.preventDefault();
			heldKeys.add(e.key);
			return;
		}
		// 疾風の靴（実行キュー13）：Shift は押しっぱなしの間だけ効く＝方向キーと同じ heldKeys で持つ。
		// 靴を持っていなくても記録だけはする（判定は processHeldKeys の canDash が見る）。
		if (e.key === 'Shift') { heldKeys.add('Shift'); return; }
		// 攻撃キー：押した瞬間に剣を振り、押しっぱなしでチャージ開始（Phase 3-1）。
		// キーリピート（e.repeat）では再発火させず、チャージ開始も一度だけにする。
		if ([' ','z','Z'].includes(e.key)) {
			e.preventDefault();
			if (!e.repeat) { swordAttack(); startCharge?.(); }
			return;
		}
		// ⚠️ サブアイテム使用も `!e.repeat` で守る（2026-08-30 ユーザー報告＝弓が連打できて
		// しまう）。同時2本の上限はあるが、押しっぱなしだと OS のキーリピート（秒間30回
		// 前後）が1本消えた瞬間の tick に必ず次を補充する＝「押し続ける＝ほぼ途切れず飛ぶ」
		// になり、上限があっても連打に見える。攻撃キー（上の `swordAttack`）と同じ
		// press-edge のみ（離して押し直すたびに1本）の作法へ揃えた。
		if (e.key === 'b' || e.key === 'B') { e.preventDefault(); if (!e.repeat) useSubItem(); return; }
		// ⚠️ トグル系（飛行・ポーズ・デバッグ）は必ず `!e.repeat` で守る。
		// OS のキーリピートは押しっぱなしで keydown を秒間 30 回前後投げてくる∴
		// ガードが無いと状態が反転し続ける（2026-08-23 ユーザー報告＝F を押し続けると
		// 離陸と着陸を繰り返す。副作用として playSound / saveGame も毎リピート走っていた）。
		if (e.key === 'f' || e.key === 'F') { e.preventDefault(); if (!e.repeat) toggleFlight?.(); return; }
		// Mac: Commandキー / Windows: Altキー でもサブアイテム使用（同じ理由で `!e.repeat`）
		if (e.key === 'Meta' || e.key === 'Alt') { e.preventDefault(); if (!e.repeat) useSubItem(); return; }
		if (e.key === 'Escape') { e.preventDefault(); if (!e.repeat) togglePause(); return; }
		if (e.key === 'g' || e.key === 'G') { e.preventDefault(); if (!e.repeat) toggleDebugMode(); return; }
	});

	document.addEventListener('keyup', e => {
		heldKeys.delete(e.key);
		// ⚠️ 文字キーは大文字・小文字の両方を消す（実行キュー13）。Shift を押したまま W を押すと
		// keydown は 'W'、先に Shift を離してから W を離すと keyup は 'w' で届く＝'W' が
		// heldKeys に残り、**指を離しても歩き続ける**。Shift で走る操作を足したので必ず踏む。
		if (e.key.length === 1) { heldKeys.delete(e.key.toLowerCase()); heldKeys.delete(e.key.toUpperCase()); }
		// 終幕中は離しても溜めを解放しない（演出の途中でビームが飛ぶのを防ぐ）
		if (inCutscene()) return;
		// 攻撃キーを離したらチャージ解放（剣ビーム発射判定）（Phase 3-1）
		if ([' ','z','Z'].includes(e.key)) releaseCharge?.();
	});
	// ウィンドウからフォーカスが外れると keyup が届かない（Cmd+Shift+4 のスクリーンショット・
	// アプリ切り替えなど）＝押しっぱなしが残って勝手に歩き／走り続ける∴全部離したことにする。
	window.addEventListener('blur', () => heldKeys.clear());

	// ── モバイル ──────────────────────────────────────────────
	// ⚠️ 終幕の入力封じはキーボードだけでは足りない（同じ操作が別の経路で来る）。
	document.querySelectorAll('.dpad-btn[data-dir]').forEach(btn => {
		const dir = btn.dataset.dir;
		if (!dir) return;
		btn.addEventListener('touchstart', e => { e.preventDefault(); resumeAudio(); if (!inCutscene()) movePlayer(dir); }, { passive: false });
		btn.addEventListener('mousedown', () => { resumeAudio(); if (!inCutscene()) movePlayer(dir); });
	});

	// 剣ボタン：押した瞬間に剣＋チャージ開始、離してビーム発射（Phase 3-1）。
	// touch と mouse の両方に対応（click だと押しっぱなしを取れないため使わない）。
	const swordBtn = document.getElementById('btn-sword');
	if (swordBtn) {
		let _swordHeld = false;
		const pressSword = () => {
			if (_swordHeld || inCutscene()) return; _swordHeld = true;
			resumeAudio(); swordAttack(); startCharge?.();
		};
		const releaseSword = () => {
			if (!_swordHeld) return; _swordHeld = false;
			if (inCutscene()) return;
			releaseCharge?.();
		};
		swordBtn.addEventListener('touchstart', e => { e.preventDefault(); pressSword(); }, { passive: false });
		swordBtn.addEventListener('touchend',   e => { e.preventDefault(); releaseSword(); }, { passive: false });
		swordBtn.addEventListener('touchcancel', () => releaseSword());
		swordBtn.addEventListener('mousedown',  () => pressSword());
		swordBtn.addEventListener('mouseup',    () => releaseSword());
		swordBtn.addEventListener('mouseleave', () => releaseSword());
	}
	document.getElementById('btn-sub')?.addEventListener('click',   () => { resumeAudio(); if (!inCutscene()) useSubItem(); });
	document.getElementById('btn-fly')?.addEventListener('click',   () => { resumeAudio(); if (!inCutscene()) toggleFlight?.(); });
	document.getElementById('btn-menu')?.addEventListener('click',  () => { resumeAudio(); if (!inCutscene()) togglePause(); });

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
		if (inCutscene()) return;
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
		if (!dir) { _moveSpeedAccum = 0; setDashing?.(false); return; }

		// 二周目（姫パレット）は移動速度1.2倍
		// チャージ中の半速は撤去した（Phase 5.5g5）＝溜め中は movePlayer 側で
		// 足が止まる∴ここで係数を掛ける意味が無い（規則を2箇所に置かない）。
		// 疾風の靴＋Shift は DASH_SPEED（二周目の 1.2 倍とは掛け合わせない＝整数のまま保つ
		// ＝毎 tick 同じ歩数で足取りが揃う）。速くなるのは movePlayer（半マス）を呼ぶ回数だけ
		// ＝1歩ずつ壁・床・入口を判定する∴位置は常にセルの中央か半セルの位置に乗る。
		const dashing = !!canDash?.() && heldKeys.has('Shift');
		setDashing?.(dashing);
		const speed = dashing ? DASH_SPEED : (hasCleared() ? 1.2 : 1.0);
		_moveSpeedAccum += speed;
		const times = Math.floor(_moveSpeedAccum);
		_moveSpeedAccum -= times;
		for (let i = 0; i < times; i++) movePlayer(dir);
	}

	return { heldKeys, processHeldKeys };
}

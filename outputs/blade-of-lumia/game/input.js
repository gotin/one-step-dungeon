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
//   movePlayer(dir)    → プレイヤー移動
//   swordAttack()      → 剣攻撃
//   useSubItem()       → サブアイテム使用
//   togglePause()      → ポーズ切り替え
//   toggleDebugMode()  → デバッグモード切り替え
//   toggleSound()      → BGM・効果音をまとめて消音／解除（M キー・実行キュー58）
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
		movePlayer,
		swordAttack,
		startCharge,
		releaseCharge,
		cancelCharge,
		useSubItem,
		toggleFlight,
		togglePause,
		toggleDebugMode,
		toggleSound,
		advanceDialog,
		closeShop,
		shopSelectPrev,
		shopSelectNext,
		shopBuy,
		pauseSelectPrev,
		pauseSelectNext,
		pauseMarkPrev,
		pauseMarkNext,
		getIsWarpMenu,
		getIsWarping,
		warpMenuPrev,
		warpMenuNext,
		warpMenuChoose,
		warpMenuClose,
		hasCleared,
		canDash,
		setDashing,
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

	// 今出ている枠の、見えているボタン（エンディングは THE END の場面になるまでボタンが隠れている）。
	const overlayButtons = () => {
		const ov = BUTTON_OVERLAYS.map(id => document.getElementById(id))
			.find(el => el && !el.classList.contains('hidden'));
		if (!ov) return [];
		return [...ov.querySelectorAll('button')].filter(b => b.offsetParent !== null && b.style.display !== 'none');
	};
	// 枠が出た瞬間に1つ目のボタンを選んでおく＝最初の Space がそのまま決定になる。
	// 削除確認だけは安全側（「戻る」＝危険でない方）を選ぶ。
	const focusDefaultButton = () => {
		const btns = overlayButtons();
		if (!btns.length || btns.includes(document.activeElement)) return;
		(btns.find(b => !b.classList.contains('title-btn--danger')) ?? btns[0]).focus();
	};
	const overlayWatch = new MutationObserver(() => requestAnimationFrame(focusDefaultButton));
	for (const id of [...BUTTON_OVERLAYS, 'ending-phase2']) {
		const el = document.getElementById(id);
		if (el) overlayWatch.observe(el, { attributes: true, attributeFilter: ['class'] });
	}
	focusDefaultButton();

	document.addEventListener('keydown', e => {
		resumeAudio();
		// ⚠️ Tab は遊んでいる間ずっと飲む（2026-09-15 ユーザー報告）。
		// 既定動作はフォーカスを次の要素へ送る＝送り先が尽きるとブラウザ側（アドレス欄など）へ抜け、
		// **カーソルキーがゲームに届かなくなる**＝キーボードだけでは戻れない。
		// ポーズの Tab（旧モード切替）を消したことで「何も起きないキー」になった∴ここで塞ぐ。
		if (e.key === 'Tab' && !buttonOverlayOpen()) { e.preventDefault(); return; }
		// ボタンを選ぶ枠の間はゲームの操作を一切通さず、枠のボタン選びに使う（キュー21 F3）。
		// タイトル（続きから／はじめから）はステージを読む前に出る＝Space が swordAttack に届くと
		// currentStage が null のまま読まれて例外になる。矢印も heldKeys に溜まり、
		// 「続きから」の直後に勝手に歩き出す。
		// 矢印＝選ぶボタンを移す／Space・Enter・Z＝選んでいるボタンを押す（ユーザー報告＝
		// 「タイトル画面で矢印キーを押しても何もうごかない。スペースキーもなにもうごかない」）。
		if (buttonOverlayOpen()) {
			heldKeys.clear();
			if (e.key === 'Tab') return;              // 既定のフォーカス移動を残す
			const btns = overlayButtons();
			if (!btns.length) return;
			const cur = btns.indexOf(document.activeElement);
			const prev = ['ArrowUp', 'ArrowLeft', 'w', 'W', 'a', 'A'].includes(e.key);
			const next = ['ArrowDown', 'ArrowRight', 's', 'S', 'd', 'D'].includes(e.key);
			if (prev || next) {
				e.preventDefault();
				const i = cur < 0 ? 0 : (cur + (next ? 1 : -1) + btns.length) % btns.length;
				btns[i].focus();
				return;
			}
			if ([' ', 'Enter', 'z', 'Z'].includes(e.key)) {
				e.preventDefault();                      // 既定の押下（Space は keyup で発火）と二重にしない
				if (e.repeat) return;
				if (cur < 0) { btns[0].focus(); return; } // 何も選んでいなければ、まず選ぶだけ
				btns[cur].click();
			}
			return;
		}
		// 消音（実行キュー58）：M＝BGM・効果音をまとめて切り替え。会話中・ポーズ中・店でも効く
		// ＝どの場面でも「今すぐ音を消したい」に応える∴場面ごとの分岐より前に置く。
		if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			if (!e.repeat) toggleSound?.();
			return;
		}
		if (inCutscene()) { e.preventDefault(); heldKeys.clear(); return; }
		if (getIsDialog()) {
			if ([' ','Enter','z','Z'].includes(e.key)) { e.preventDefault(); advanceDialog(); }
			return;
		}
		// キュー27: 転移の石碑の行き先一覧（店と同じキー）。転移の演出中は何も受けない
		// （出発から到着まで約1.3秒＝その間に歩く・剣を振ると演出の途中で動いてしまう）。
		if (getIsWarping?.()) { e.preventDefault(); heldKeys.clear(); return; }
		if (getIsWarpMenu?.()) {
			if (e.key === 'Escape') { e.preventDefault(); warpMenuClose(); return; }
			if (e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') { e.preventDefault(); warpMenuPrev(); return; }
			if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); warpMenuNext(); return; }
			if ([' ','Enter','z','Z'].includes(e.key)) { e.preventDefault(); if (!e.repeat) warpMenuChoose(); return; }
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
		// 攻撃キーを離したらチャージ解放（剣ビーム発射判定）（Phase 3-1）。
		// 終幕中は解放しない（演出の途中でビームが飛ぶのを防ぐ）が、**離したこと自体は捨てずに溜めを取り消す**。
		// 旧＝終幕中は return で捨てていた∴演出の後も溜め（_chargeStart）が残り、溜め中の足止め
		// （player.js movePlayer）で攻撃キーを押し直すまで動けなかった（2026-10-17 バグ報告・全ボス共通）。
		if ([' ','z','Z'].includes(e.key)) {
			if (inCutscene()) cancelCharge?.();
			else releaseCharge?.();
		}
	});
	// ウィンドウからフォーカスが外れると keyup が届かない（Cmd+Shift+4 のスクリーンショット・
	// アプリ切り替えなど）＝押しっぱなしが残って勝手に歩き／走り続ける∴全部離したことにする。
	// 溜めも同じ＝フォーカスが外れている間に攻撃キーを離すと keyup が届かず、溜めが残って動けなくなる
	// ∴ビームは撃たずに取り消す（2026-10-17・上の終幕中と同じ形の穴）。
	window.addEventListener('blur', () => { heldKeys.clear(); cancelCharge?.(); });

	// ── モバイル ──────────────────────────────────────────────
	// ⚠️ 終幕の入力封じはキーボードだけでは足りない（同じ操作が別の経路で来る）。
	// 十字キー＝押しっぱなしで歩く（実行キュー70）。旧実装は押すたびに movePlayer を1回
	// （＝半マス）呼ぶだけ＝1マス歩くのに2回タップが要った。今はキーボードと同じく
	// 「押している向き」を持ち、processHeldKeys が毎 tick 歩かせる。
	// 指を押したまま別のボタンへ滑らせると向きが変わる（中央・外へ外れたら止まる）。
	// 短いタップ（最初の tick より前に離した）は離した時に1歩だけ歩く＝タップが無反応にならない。
	let touchDir = null;        // 十字キーで押している向き（null＝押していない）
	let touchStepped = false;   // 今の向きで processHeldKeys が1歩でも歩いたか
	let dpadTouchId = null;     // 十字キーを押している指（2本目の指は無視する）
	let dpadMouseDown = false;
	let touchDash = false;      // 走るボタンを押しているか（Shift の代わり）
	const dpadDirAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.dpad-btn[data-dir]')?.dataset.dir || null;
	const setTouchDir = (dir) => {
		if (inCutscene()) dir = null;
		if (dir === touchDir) return;
		if (touchDir && !touchStepped) movePlayer(touchDir);
		touchDir = dir;
		touchStepped = false;
		// 押している向きのボタンを光らせる（滑らせた先は :active にならない）
		document.querySelectorAll('.dpad-btn[data-dir]').forEach(b => b.classList.toggle('pressed', !!dir && b.dataset.dir === dir));
	};
	const dpad = document.getElementById('dpad');
	if (dpad) {
		const findTouch = (list) => [...list].find(t => t.identifier === dpadTouchId);
		dpad.addEventListener('touchstart', e => {
			e.preventDefault();
			resumeAudio();
			if (dpadTouchId !== null) return;
			const t = e.changedTouches[0];
			dpadTouchId = t.identifier;
			setTouchDir(dpadDirAt(t.clientX, t.clientY));
		}, { passive: false });
		dpad.addEventListener('touchmove', e => {
			e.preventDefault();
			const t = findTouch(e.changedTouches);
			if (t) setTouchDir(dpadDirAt(t.clientX, t.clientY));
		}, { passive: false });
		const endTouch = e => {
			if (!findTouch(e.changedTouches)) return;
			dpadTouchId = null;
			setTouchDir(null);
		};
		dpad.addEventListener('touchend', e => { e.preventDefault(); endTouch(e); }, { passive: false });
		dpad.addEventListener('touchcancel', endTouch);
		dpad.addEventListener('mousedown', e => { resumeAudio(); dpadMouseDown = true; setTouchDir(dpadDirAt(e.clientX, e.clientY)); });
		dpad.addEventListener('mousemove', e => { if (dpadMouseDown) setTouchDir(dpadDirAt(e.clientX, e.clientY)); });
		window.addEventListener('mouseup', () => { if (!dpadMouseDown) return; dpadMouseDown = false; setTouchDir(null); });
	}
	// キーボードと同じく、フォーカスが外れたら離したことにする（離した時の1歩は歩かせない）
	window.addEventListener('blur', () => { dpadTouchId = null; dpadMouseDown = false; touchDash = false; document.getElementById('btn-dash')?.classList.remove('dashing'); touchStepped = true; setTouchDir(null); });

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
			// 終幕中は撃たずに取り消す（キーボードの keyup と同じ・2026-10-17 バグ報告）
			if (inCutscene()) { cancelCharge?.(); return; }
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
	// ポーズ画面の「戻る」（実行キュー70）＝タッチでは MENU がポーズ画面の下に隠れる∴閉じる手段がこれしか無い
	document.getElementById('pause-close')?.addEventListener('click', () => { if (getIsPaused()) togglePause(); });
	// 店・転移の行き先も Escape でしか閉じられなかった（2026-10-15 iPhone 実機のユーザー報告から全走査）
	document.getElementById('shop-close')?.addEventListener('click', () => { if (getIsShop()) closeShop(); });
	document.getElementById('warp-close')?.addEventListener('click', () => { if (getIsWarpMenu?.()) warpMenuClose(); });
	// 会話＝枠のどこをタップしても次へ（2026-10-15 iPhone 実機のユーザー報告＝Space が無く会話が進められない）。
	// 会話の枠は画面全体を覆う（z-index 50 > 操作盤 30）＝剣ボタンにも届かない∴枠そのものを押させる。
	document.getElementById('dialog-overlay')?.addEventListener('click', () => { resumeAudio(); if (getIsDialog()) advanceDialog(); });

	// 走るボタン（実行キュー70・旧盾ボタンの場所）＝Shift と同じく押している間だけ走る。
	// 靴を持つまではボタン自体が隠れている（ui.js updateHud）。判定は processHeldKeys の canDash。
	const dashBtn = document.getElementById('btn-dash');
	if (dashBtn) {
		const setDashHeld = (v) => { touchDash = v; dashBtn.classList.toggle('dashing', v); };
		dashBtn.addEventListener('touchstart',  e => { e.preventDefault(); resumeAudio(); setDashHeld(true); }, { passive: false });
		dashBtn.addEventListener('touchend',    e => { e.preventDefault(); setDashHeld(false); }, { passive: false });
		dashBtn.addEventListener('touchcancel', () => setDashHeld(false));
		dashBtn.addEventListener('mousedown',   () => { resumeAudio(); setDashHeld(true); });
		dashBtn.addEventListener('mouseup',     () => setDashHeld(false));
		dashBtn.addEventListener('mouseleave',  () => setDashHeld(false));
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
		// キーボードが優先。キーを押していなければ十字キー（タッチ）の向き。
		const fromTouch = !dir && !!touchDir;
		if (fromTouch) dir = touchDir;
		if (!dir) { _moveSpeedAccum = 0; setDashing?.(false); return; }

		// 二周目（姫パレット）は移動速度1.2倍
		// チャージ中の半速は撤去した（Phase 5.5g5）＝溜め中は movePlayer 側で
		// 足が止まる∴ここで係数を掛ける意味が無い（規則を2箇所に置かない）。
		// 疾風の靴＋Shift は DASH_SPEED（二周目の 1.2 倍とは掛け合わせない＝整数のまま保つ
		// ＝毎 tick 同じ歩数で足取りが揃う）。速くなるのは movePlayer（半マス）を呼ぶ回数だけ
		// ＝1歩ずつ壁・床・入口を判定する∴位置は常にセルの中央か半セルの位置に乗る。
		const dashing = !!canDash?.() && (heldKeys.has('Shift') || touchDash);
		setDashing?.(dashing);
		const speed = dashing ? DASH_SPEED : (hasCleared() ? 1.2 : 1.0);
		_moveSpeedAccum += speed;
		const times = Math.floor(_moveSpeedAccum);
		_moveSpeedAccum -= times;
		for (let i = 0; i < times; i++) movePlayer(dir);
		if (fromTouch && times > 0) touchStepped = true;
	}

	return { heldKeys, processHeldKeys };
}

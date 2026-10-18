// ── Blade of Lumia – 道具の早替え（X 長押し／SUB ボタン長押し）── 実行キュー84 ──────────────
//
// ユーザー決定（2026-10-18・ブレスオブワイルド風）：
//   - X を押し続けると、道具の一覧だけの小さな枠が開く（ポーズ画面とは別）。開いている間は世界を止める。
//   - X を押したまま ←→（↑↓ も同じ）で選ぶ → X を離すとその道具に持ち替える。
//   - X を押したまま Escape ＝持ち替えずに閉じる。
//   - 開く前に離した（ちょっと押しただけ）＝何もしない。B で今の道具を使う、は今のまま。
// 旧＝Cmd／Alt の単押しで道具を使っていた（input.js）＝Cmd+R・Cmd+Shift+4 などの前半で矢が飛んだ∴消した。
// Cmd／Alt を長押しのキーにしない理由＝Mac は Cmd を押している間ほかのキーの keyup が届かない・
// Cmd+W／Q／Tab はページが止められない・Option は e.key の文字を変える（PLAN 84）。
//
// スマホ＝SUB ボタンの長押し（2026-10-18 ユーザー決定・iPhone 実機で試して）：
//   「カーソルキーがないから、アイテムを直接タップで選択」「押しっぱなしにする必要はなくて、ダイアログは出しっぱなし、
//    選択するか、ダイアログ外を押して選択をやめるかで閉じる」
//   ＝長押しで開いたら指を離しても開いたまま（sticky）。道具をタップ＝持ち替えて閉じる／枠の外をタップ＝持ち替えずに閉じる。
//   ❌ 失効（2026-10-18）：指を横に滑らせて選び、離して持ち替える版（`76af389`）＝タップで選べるので操作を1つにした。
//
// 実装時に決めたこと（2026-10-18）：
//   - 開くまでの長押し＝HOLD_MS。押した瞬間に開くと、B の隣のキーを触っただけで世界が止まる。
//   - 道具が0個＝開かない（選ぶ物が無い）。1個＝開く（持ち物が1つだと分かる・押して何も起きないより誤解が無い）。
//   - 開いた瞬間に剣の溜めを取り消す（止まった世界で攻撃キーを離すとビームが残る＝キュー82⑤ と同じ形の穴）。
//   - 状態（開いているか・選んでいる道具）はここが持つ。止め方は転移の石碑の一覧（warp-menu.js）と同じ
//     ＝ゲームループを止め、input.js が ←→／Escape／X の離しをここへ渡す。gameTick も isOpen を見る
//     （テストの step() やループの外から tick が来ても世界が進まない）。

export const QUICK_SWAP_HOLD_MS = 220;
// SUB ボタンは「離したときに使う」（旧 click）∴長押しを足してもタップの感触は変わらない。
// 連打の1回（100〜150ms）より十分長く、X より長めに取る。
export const QUICK_SWAP_TOUCH_HOLD_MS = 400;

export function createQuickSwap(deps) {
	const {
		getPlayer,
		listItems,       // (player) => 並べる道具の id（ポーズの持ち物欄と同じ並び＝ui.js listSubItemKeys）
		iconOf,          // (id, player, px) => canvas | null
		nameOf,          // (id, player) => 表示名
		canOpen,         // () => 今開いてよいか（会話・ポーズ・店・演出・遷移・倒れた の間は false）
		stopGameLoop, startGameLoop,
		cancelCharge,
		updateHud,
		playSound,
	} = deps;

	const overlayEl = document.getElementById('quickswap-overlay');
	const boxEl     = document.getElementById('quickswap-box');
	const listEl    = document.getElementById('quickswap-items');
	const nameEl    = document.getElementById('quickswap-name');
	const hintEl    = document.getElementById('quickswap-hint');
	const HINT_KEY   = '← → で選ぶ　X を離して持ち替え　Escape でやめる';
	const HINT_TOUCH = '道具をタップで持ち替え　外をタップでやめる';

	let timer  = null;    // 長押しを待っている間の setTimeout
	let open   = false;
	let sticky = false;   // SUB ボタンから開いた＝指を離しても開いたまま・タップで選ぶ
	let items  = [];
	let idx    = 0;

	function render() {
		const player = getPlayer();
		listEl.innerHTML = '';
		items.forEach((id, i) => {
			const slot = document.createElement('div');
			slot.className = `quickswap-slot${i === idx ? ' selected' : ''}`;
			slot.dataset.item = id;
			const cv = iconOf(id, player, 'var(--qs-icon)');
			if (cv) slot.appendChild(cv);
			else slot.textContent = id;
			const cnt = player.subItems[id]?.count;
			const cntEl = document.createElement('div');
			cntEl.className = 'quickswap-count';
			cntEl.textContent = cnt === Infinity || cnt == null ? '∞' : `×${cnt}`;
			slot.appendChild(cntEl);
			listEl.appendChild(slot);
		});
		nameEl.textContent = items[idx] ? nameOf(items[idx], player) : '';
	}

	function openPanel() {
		timer = null;
		if (open || !canOpen()) return;
		const player = getPlayer();
		items = listItems(player);
		if (!items.length) return;
		const cur = items.indexOf(player.activeSubItem);
		idx = cur >= 0 ? cur : 0;
		open = true;
		cancelCharge?.();
		stopGameLoop();
		render();
		overlayEl.classList.toggle('qs-touch', sticky);
		overlayEl.classList.remove('hidden');
		playSound('talk');
	}

	function closePanel() {
		open = false;
		sticky = false;
		overlayEl.classList.add('hidden');
		overlayEl.classList.remove('qs-touch');
		startGameLoop();
	}

	// 選んでいる道具に持ち替えて閉じる
	function equipAndClose() {
		const id = items[idx];
		if (id) getPlayer().activeSubItem = id;
		updateHud();
		closePanel();
	}

	// 長押しを始めた。holdMs＝開くまでの時間（X＝QUICK_SWAP_HOLD_MS／SUB ボタン＝QUICK_SWAP_TOUCH_HOLD_MS）。
	// touch＝SUB ボタンから（開いたら開いたまま・タップで選ぶ）。
	function press(holdMs = QUICK_SWAP_HOLD_MS, touch = false) {
		if (open || timer) return;
		sticky = !!touch;
		if (hintEl) hintEl.textContent = touch ? HINT_TOUCH : HINT_KEY;
		timer = setTimeout(openPanel, holdMs);
	}

	// 長押しをやめた（X／SUB ボタンを離した）。
	// 開く前なら何もしない。X で開いていたら持ち替えて閉じる。SUB ボタンで開いていたら開いたまま。
	// 戻り値＝枠が開いていたら true（SUB ボタンは false のとき＝タップだったときだけ道具を使う）。
	function release() {
		if (timer) { clearTimeout(timer); timer = null; }
		if (!open) return false;
		if (!sticky) equipAndClose();
		return true;
	}

	// Escape・フォーカスが外れた・枠の外をタップ＝持ち替えずに閉じる（長押しを待っていたら待つのもやめる）
	function cancel() {
		if (timer) { clearTimeout(timer); timer = null; }
		if (open) closePanel();
	}

	function select(delta) {
		if (!open || items.length < 2) return;
		idx = (idx + delta + items.length) % items.length;
		playSound('switch');
		render();
	}

	// タップで選ぶ（枠は SUB ボタンから開いたときだけ押せる＝css の .qs-touch）。
	// 道具＝持ち替えて閉じる／枠の外（暗い所）＝持ち替えずに閉じる／枠の中の道具以外＝何もしない。
	overlayEl?.addEventListener('click', (e) => {
		if (!open) return;
		const slot = e.target.closest?.('.quickswap-slot');
		if (slot) {
			const i = items.indexOf(slot.dataset.item);
			if (i >= 0) idx = i;
			if (items[idx] !== getPlayer().activeSubItem) playSound('switch');
			equipAndClose();
			return;
		}
		if (!boxEl?.contains(e.target)) cancel();
	});

	return {
		isOpen: () => open,
		press, release, cancel,
		selectPrev: () => select(-1),
		selectNext: () => select(1),
		// テスト用：選んでいる道具
		selected: () => (open ? items[idx] ?? null : null),
	};
}

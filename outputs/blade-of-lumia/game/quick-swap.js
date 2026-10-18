// ── Blade of Lumia – 道具の早替え（X 長押し）── 実行キュー84 ──────────────
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
// 実装時に決めたこと（2026-10-18）：
//   - 開くまでの長押し＝HOLD_MS。押した瞬間に開くと、B の隣のキーを触っただけで世界が止まる。
//   - 道具が0個＝開かない（選ぶ物が無い）。1個＝開く（持ち物が1つだと分かる・押して何も起きないより誤解が無い）。
//   - 開いた瞬間に剣の溜めを取り消す（止まった世界で攻撃キーを離すとビームが残る＝キュー82⑤ と同じ形の穴）。
//   - 状態（開いているか・選んでいる道具）はここが持つ。止め方は転移の石碑の一覧（warp-menu.js）と同じ
//     ＝ゲームループを止め、input.js が ←→／Escape／X の離しをここへ渡す。gameTick も isOpen を見る
//     （テストの step() やループの外から tick が来ても世界が進まない）。

export const QUICK_SWAP_HOLD_MS = 220;
// スマホ＝SUB ボタンの長押し（2026-10-18 ユーザー「連打のつもりが長押しになって枠が出てうざい、にならないなら」）。
// SUB ボタンは今も「離したときに使う」（旧 click）∴長押しを足してもタップの感触は変わらない。
// 連打の1回（100〜150ms）より十分長く、X より長めに取る。
export const QUICK_SWAP_TOUCH_HOLD_MS = 400;
// 指で選ぶ：横に動かした距離 STEP_PX ごとに1つ隣へ（枠は画面の中央＝ボタンから遠い∴道具の上まで指を運ばせない）。
// 指が道具の上にあればそれを選ぶ。
const TOUCH_STEP_PX = 40;

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
	const listEl    = document.getElementById('quickswap-items');
	const nameEl    = document.getElementById('quickswap-name');
	const hintEl    = document.getElementById('quickswap-hint');
	const HINT_KEY   = '← → で選ぶ　X を離して持ち替え　Escape でやめる';
	const HINT_TOUCH = '指を横に滑らせて選ぶ　離して持ち替え';

	let timer = null;   // 長押しを待っている間の setTimeout
	let open  = false;
	let items = [];
	let idx   = 0;

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
		pointerStart = lastX != null ? { x: lastX, idx } : null;
		open = true;
		cancelCharge?.();
		stopGameLoop();
		render();
		overlayEl.classList.remove('hidden');
		playSound('talk');
	}

	function closePanel() {
		open = false;
		overlayEl.classList.add('hidden');
		startGameLoop();
	}

	// X を押した（キーリピートは呼び元が捨てる）
	// holdMs＝開くまでの長押し（X＝QUICK_SWAP_HOLD_MS／SUB ボタン＝QUICK_SWAP_TOUCH_HOLD_MS）
	// touch＝SUB ボタンから開いた（ヒントの文を指の操作に替える）
	// x＝押した指の位置（開く瞬間までの指の動きは pointerMove が追う）＝開いた瞬間の位置を選びの基点にする
	function press(holdMs = QUICK_SWAP_HOLD_MS, touch = false, x = null) {
		if (open || timer) return;
		lastX = x;
		if (hintEl) hintEl.textContent = touch ? HINT_TOUCH : HINT_KEY;
		timer = setTimeout(openPanel, holdMs);
	}

	// X を離した＝開いていれば選んでいる道具に持ち替えて閉じる。開く前なら何もしない。
	// 戻り値＝枠を閉じたら true（SUB ボタンは false のとき＝タップだったときだけ道具を使う）。
	function release() {
		if (timer) { clearTimeout(timer); timer = null; }
		pointerStart = null;
		if (!open) return false;
		const player = getPlayer();
		const id = items[idx];
		if (id) player.activeSubItem = id;
		updateHud();
		closePanel();
		return true;
	}

	// Escape・フォーカスが外れた＝持ち替えずに閉じる（長押しを待っていたら待つのもやめる）
	function cancel() {
		if (timer) { clearTimeout(timer); timer = null; }
		pointerStart = null;
		if (open) closePanel();
	}

	function select(delta) {
		if (!open || items.length < 2) return;
		idx = (idx + delta + items.length) % items.length;
		playSound('switch');
		render();
	}

	// 指（マウス）で選ぶ。開いた後の最初の位置を基点に、横へ TOUCH_STEP_PX ごとに1つ隣へ。
	// 指が道具の枠の上にあれば、その道具を選ぶ（枠は pointer-events:none＝座標で引く）。
	let pointerStart = null;   // { x, idx }
	let lastX = null;          // 開く前の指の位置（開いた瞬間の基点になる）
	function pointerMove(x, y) {
		if (!open) { lastX = x; return; }
		const slots = [...listEl.querySelectorAll('.quickswap-slot')];
		const hit = slots.findIndex((el) => {
			const r = el.getBoundingClientRect();
			return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
		});
		let next;
		if (hit >= 0) {
			next = hit;
			pointerStart = { x, idx: hit };
		} else {
			if (!pointerStart) pointerStart = { x, idx };
			const steps = Math.trunc((x - pointerStart.x) / TOUCH_STEP_PX);
			next = Math.max(0, Math.min(items.length - 1, pointerStart.idx + steps));
		}
		if (next === idx) return;
		idx = next;
		playSound('switch');
		render();
	}

	return {
		isOpen: () => open,
		press, release, cancel, pointerMove,
		selectPrev: () => select(-1),
		selectNext: () => select(1),
		// テスト用：選んでいる道具
		selected: () => (open ? items[idx] ?? null : null),
	};
}

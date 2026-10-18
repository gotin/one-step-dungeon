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
	function press() {
		if (open || timer) return;
		timer = setTimeout(openPanel, QUICK_SWAP_HOLD_MS);
	}

	// X を離した＝開いていれば選んでいる道具に持ち替えて閉じる。開く前なら何もしない。
	function release() {
		if (timer) { clearTimeout(timer); timer = null; }
		if (!open) return;
		const player = getPlayer();
		const id = items[idx];
		if (id) player.activeSubItem = id;
		updateHud();
		closePanel();
	}

	// Escape・フォーカスが外れた＝持ち替えずに閉じる（長押しを待っていたら待つのもやめる）
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

	return {
		isOpen: () => open,
		press, release, cancel,
		selectPrev: () => select(-1),
		selectNext: () => select(1),
		// テスト用：選んでいる道具
		selected: () => (open ? items[idx] ?? null : null),
	};
}

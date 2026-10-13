// ── playtest-notes.js ─────────────────────────────────────────
// 実行キュー57：プレビュー（`fromEditor=1`）で遊びながら、その画面についてのメモを残す。
//
// N キー（または右上の「メモ」ボタン）でゲームを止めて入力欄を開き、
// `{layer, stage, row, col, text, createdAt, preview}` を開発サーバへ送る。
// サーバ（scripts/vite-playtest-notes.mjs）が `work/playtest-notes.json` に書く＝Claude はそれを読んで直す。
//
// ⚠️ 入力欄で打ったキーをゲームへ渡さない。ゲームの keydown/keyup は document で聞いている
//    （input.js）∴枠の上で stopPropagation すれば届かない。W/A/S/D・Space・Escape を
//    そのまま打てるようにするための要（ここが抜けると打つたびに勇者が歩き、Esc でポーズが開く）。
// ⚠️ サーバに届かなかったメモは localStorage の控えに残し、次に書けたときにまとめて送る
//    （本番の静的配信・古い開発サーバ＝受け口が無い）。書いたメモを黙って失わない。

// サーバ側（scripts/vite-playtest-notes.mjs の NOTES_ENDPOINT）と同じ口。
// import しない＝あちらは node:fs を読むのでブラウザでは読めない。
const NOTES_ENDPOINT = '/__playtest-notes';
const PENDING_KEY = 'bladeOfLumiaPlaytestNotesPending';

/**
 * @param {object} deps
 * @param {() => {layer:string, stage:string, row:number, col:number}} deps.getLocation
 * @param {() => boolean} deps.getIsPaused
 * @param {(v:boolean) => void} deps.setIsPaused
 * @param {() => void} deps.stopGameLoop
 * @param {() => void} deps.startGameLoop
 * @param {() => void} deps.clearHeldKeys
 * @param {(msg:string, ms:number) => void} deps.pulse
 */
export function initPlaytestNotes(deps) {
	const btnEl     = document.getElementById('pnote-btn');
	const countEl   = document.getElementById('pnote-count');
	const overlayEl = document.getElementById('pnote-overlay');
	const whereEl   = document.getElementById('pnote-where');
	const textEl    = document.getElementById('pnote-text');
	const statusEl  = document.getElementById('pnote-status');
	const listTitleEl = document.getElementById('pnote-list-title');
	const listEl    = document.getElementById('pnote-list');
	if (!btnEl || !overlayEl || !textEl) return null;

	let isOpen = false;
	let weStopped = false;   // 開いたときにこちらでゲームを止めたか（ポーズ中に開いたなら触らない）
	let openLoc = null;      // 開いた瞬間の居場所（書いている間に変わらない）

	const readPending = () => {
		try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
	};
	const writePending = (arr) => {
		try {
			if (arr.length) localStorage.setItem(PENDING_KEY, JSON.stringify(arr));
			else localStorage.removeItem(PENDING_KEY);
		} catch { /* 書けなくても続ける */ }
	};

	// 再現用＝プレビュー設定（ps_ で始まるパラメータ）だけを残す
	const previewParams = () => {
		const src = new URLSearchParams(location.search);
		const out = new URLSearchParams();
		for (const [k, v] of src) if (k.startsWith('ps_')) out.append(k, v);
		return out.toString();
	};

	const fmtWhere = (n) => `${n.layer} ${n.stage}（行${n.row}・列${n.col}）`;

	function setStatus(msg, isError = false) {
		statusEl.textContent = msg;
		statusEl.classList.toggle('pnote-status--error', isError);
	}

	async function fetchNotes() {
		try {
			const res = await fetch(NOTES_ENDPOINT, { cache: 'no-store' });
			if (!res.ok) return null;
			const arr = await res.json();
			return Array.isArray(arr) ? arr : null;
		} catch { return null; }
	}

	async function postNotes(notes) {
		try {
			const res = await fetch(NOTES_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes }),
			});
			if (!res.ok) return null;
			return await res.json();
		} catch { return null; }
	}

	function updateCount(total) {
		const pending = readPending().length;
		countEl.textContent = pending ? `${total ?? '?'}+控え${pending}` : String(total ?? '?');
	}

	// 開いている画面のメモだけを並べる（ほかの画面のメモは件数だけ）
	async function refreshList() {
		const all = await fetchNotes();
		listEl.innerHTML = '';
		if (!all) {
			listTitleEl.textContent = 'メモの一覧を読めませんでした（開発サーバの受け口がありません）';
			updateCount(null);
			return;
		}
		updateCount(all.length);
		const here = all.filter((n) => n.layer === openLoc?.layer && n.stage === openLoc?.stage);
		listTitleEl.textContent = `この画面のメモ ${here.length} 件（全 ${all.length} 件）`;
		for (const n of here) {
			const li = document.createElement('li');
			const body = document.createElement('div');
			body.className = 'pnote-item-text';
			const where = document.createElement('div');
			where.className = 'pnote-item-where';
			where.textContent = `行${n.row}・列${n.col}`;
			body.append(where, document.createTextNode(n.text));
			const del = document.createElement('button');
			del.type = 'button';
			del.className = 'pnote-del';
			del.textContent = '削除';
			del.addEventListener('click', async () => {
				try {
					await fetch(`${NOTES_ENDPOINT}?id=${encodeURIComponent(n.id)}`, { method: 'DELETE' });
				} catch { /* 一覧の読み直しで分かる */ }
				refreshList();
				textEl.focus();
			});
			li.append(body, del);
			listEl.append(li);
		}
	}

	function open() {
		if (isOpen) return;
		isOpen = true;
		openLoc = deps.getLocation();
		deps.clearHeldKeys();
		if (!deps.getIsPaused()) {
			deps.setIsPaused(true);
			deps.stopGameLoop();
			weStopped = true;
		}
		whereEl.textContent = fmtWhere(openLoc);
		const pending = readPending().length;
		setStatus(pending ? `送れていない控えが ${pending} 件あります（次の保存でまとめて送ります）` : '');
		overlayEl.classList.remove('hidden');
		textEl.focus();
		refreshList();
	}

	function close() {
		if (!isOpen) return;
		isOpen = false;
		overlayEl.classList.add('hidden');
		textEl.blur();
		btnEl.blur();
		deps.clearHeldKeys();
		if (weStopped) {
			weStopped = false;
			deps.setIsPaused(false);
			deps.startGameLoop();
		}
	}

	async function save() {
		const text = textEl.value.trim();
		if (!text) { setStatus('本文が空です', true); return; }
		const note = { ...openLoc, text, createdAt: new Date().toISOString(), preview: previewParams() };
		const batch = [...readPending(), note];
		const result = await postNotes(batch);
		if (!result) {
			writePending(batch);
			textEl.value = '';
			updateCount(null);
			setStatus(`開発サーバに届きませんでした。この端末の控えに残しました（${batch.length} 件）。`
				+ '開発サーバを起動し直すと、次の保存でまとめて送ります', true);
			return;
		}
		writePending([]);
		textEl.value = '';
		updateCount(result.count);
		close();
		deps.pulse(`メモを保存しました（全 ${result.count} 件）`, 1500);
	}

	// ── キー：N で開く（どの場面でも＝会話中・ポーズ中の「この台詞が変」も書ける）──
	// window の capture で聞く＝input.js（document）より先に取れる。
	window.addEventListener('keydown', (e) => {
		if (isOpen) return;
		if (e.key !== 'n' && e.key !== 'N') return;
		if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
		e.preventDefault();
		e.stopPropagation();
		open();
	}, true);

	// 入力欄で打ったキーはゲームへ渡さない（冒頭の ⚠️）
	overlayEl.addEventListener('keydown', (e) => {
		e.stopPropagation();
		if (e.isComposing) return;   // 日本語変換中の Esc/Enter は変換に使う
		if (e.key === 'Escape') { e.preventDefault(); close(); return; }
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
	});
	overlayEl.addEventListener('keyup', (e) => e.stopPropagation());

	document.getElementById('pnote-save')?.addEventListener('click', () => save());
	document.getElementById('pnote-close')?.addEventListener('click', () => close());
	btnEl.addEventListener('click', () => { btnEl.blur(); open(); });

	btnEl.classList.remove('hidden');
	fetchNotes().then((all) => updateCount(all ? all.length : null));

	return { open, close, save, isOpen: () => isOpen };
}

// ── Blade of Lumia – 転移の石碑の行き先一覧と転移の演出 ── キュー27 ──────────────
//
// 流れ（✅ 2026-10-03 ユーザー判定＝「石碑から石碑へ」）：
//   ① まだ灯っていない転移碑を読む → 本文を読み終えたら灯る（`player.litWarpStones`）
//      → 灯った他の碑が1つでもあれば、そのまま行き先の一覧を開く
//   ② 灯った転移碑を読む → 本文は出さずに一覧を開く（一覧の最後に「碑文を読む」）
//   ③ 一覧で選ぶ → 転移の演出（出発：プレイヤーが光の柱に吸われて消える → 到着：
//      光の柱から現れる）→ 行き先の碑の前（南 → 東 → 西 → 北の空いたセル）に立つ
// ユーザーの要望「ワープするときに、プレーヤーに対するワープをしてる感じのアニメーション
// も入れるようにしてね」（2026-10-03）＝③の演出。笛のワープ（竜巻＝`.flute-warp`）とは
// 絵を分ける＝転移碑は碑の紋と同じ水色の光の柱（`.warpstone-beam`）。
//
// 状態（開いているか・選んでいる行）はここが持つ。ゲームの止め方・入力の受け方は店
// （ui.js openShop）と同じ＝開いている間はゲームループを止め、input.js が ↑↓/決定/Escape
// をここへ渡す。
import { listWarpStones, warpStoneId } from '../shared/warp-stones.js';

export const WARP_OUT_MS = 650;   // 出発の演出（プレイヤーが消えるまで）
export const WARP_IN_MS  = 650;   // 到着の演出（プレイヤーが現れるまで）

export function createWarpMenu(deps) {
	const {
		getMapData, getPlayer,
		stopGameLoop, startGameLoop,
		setIsTransitioning,
		playSound, pulse, saveGame,
		readLines,          // (ws) => 本文を読む（「碑文を読む」の行）
		travelTo,           // (ws) => 行き先の碑の前へ移す（enterStage）。成否を返す
		renderBoard, renderChars,
		getCharLayerEl, getCellPx,
	} = deps;

	const overlayEl = document.getElementById('warp-overlay');
	const listEl    = document.getElementById('warp-list');
	let open = false;
	let rows = [];      // { kind:'dest', ws } | { kind:'read' }
	let idx  = 0;
	let here = null;    // 今いる碑
	let warping = false;   // 転移の演出中（入力を全部飲む＝input.js getIsWarping）

	const lit = () => new Set(getPlayer().litWarpStones ?? []);

	function isLit(id) { return lit().has(id); }

	// 灯す。灯ったら true（もう灯っていたら false）
	function light(ws) {
		const player = getPlayer();
		if (!Array.isArray(player.litWarpStones)) player.litWarpStones = [];
		if (player.litWarpStones.includes(ws.id)) return false;
		player.litWarpStones.push(ws.id);
		return true;
	}

	function destinations(fromId) {
		const s = lit();
		return listWarpStones(getMapData()).filter((ws) => ws.id !== fromId && s.has(ws.id));
	}

	function render() {
		listEl.innerHTML = '';
		rows.forEach((row, i) => {
			const el = document.createElement('div');
			el.className = `warp-row${i === idx ? ' selected' : ''}${row.kind === 'read' ? ' warp-row--read' : ''}`;
			el.textContent = row.kind === 'read' ? '碑文を読む' : row.ws.name;
			el.addEventListener('click', () => { idx = i; render(); choose(); });
			listEl.appendChild(el);
			if (i === idx) el.scrollIntoView?.({ block: 'nearest' });
		});
	}

	function openMenu(ws, withRead) {
		here = ws;
		rows = destinations(ws.id).map((d) => ({ kind: 'dest', ws: d }));
		if (withRead) rows.push({ kind: 'read' });
		if (!rows.length) return false;
		idx = 0;
		open = true;
		stopGameLoop();
		render();
		overlayEl.classList.remove('hidden');
		playSound('talk');
		return true;
	}

	function close() {
		if (!open) return;
		open = false;
		overlayEl.classList.add('hidden');
		startGameLoop();
	}

	function selectPrev() { if (rows.length) { idx = (idx - 1 + rows.length) % rows.length; render(); } }
	function selectNext() { if (rows.length) { idx = (idx + 1) % rows.length; render(); } }

	function choose() {
		const row = rows[idx];
		if (!row) return;
		close();
		if (row.kind === 'read') { readLines(here); return; }
		warp(row.ws);
	}

	// ── 演出 ──────────────────────────────────────────────
	// 光の柱をプレイヤーの位置に立てる。dir＝'out'（立ち上がって細る）/'in'（降りて消える）
	function beam(dir) {
		const layerEl = getCharLayerEl();
		const p = getPlayer();
		if (!layerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = `warpstone-beam warpstone-beam--${dir}`;
		// 背丈はプレイヤーの上に1セル＝碑（プレイヤーの隣）や上の地形まで覆わない（3セルにしたら上の山まで染まった）
		el.style.cssText = `position:absolute;left:${(p.x - 0.1) * cellPx}px;top:${(p.y - 1.1) * cellPx}px;width:${cellPx * 1.2}px;height:${cellPx * 2.2}px;z-index:31;pointer-events:none;`;
		layerEl.appendChild(el);
		setTimeout(() => el.remove(), dir === 'out' ? WARP_OUT_MS + 80 : WARP_IN_MS + 80);
	}

	function playerEl() { return document.getElementById('char-player'); }

	function warp(dest) {
		warping = true;
		setIsTransitioning(true);
		stopGameLoop();
		playSound('flute');
		beam('out');
		playerEl()?.classList.add('warp-out');
		setTimeout(() => {
			const ok = travelTo(dest);
			if (!ok) {
				playerEl()?.classList.remove('warp-out');
				warping = false;
				setIsTransitioning(false);
				startGameLoop();
				pulse('碑の光が 揺らいで 消えた……', 1800);
				return;
			}
			renderBoard(); renderChars();
			const el = playerEl();
			el?.classList.remove('warp-out');
			el?.classList.add('warp-in');
			beam('in');
			playSound('stageTransition');
			setTimeout(() => {
				playerEl()?.classList.remove('warp-in');
				warping = false;
				setIsTransitioning(false);
				startGameLoop();
				pulse(`${dest.name}へ 転移した`, 1800);
				saveGame();
			}, WARP_IN_MS);
		}, WARP_OUT_MS);
	}

	// ── 読んだときの入口（game.js の openSignDialog から）──────────────
	// ws＝今読んだ碑。showDialog(onClose)＝本文を出す（閉じたら onClose）。
	function onRead(ws, showDialog) {
		if (isLit(ws.id)) {
			// 灯っている碑：行き先があれば一覧（最後に「碑文を読む」）。無ければ本文だけ
			if (!openMenu(ws, true)) showDialog(null);
			return;
		}
		showDialog(() => {
			light(ws);
			renderBoard(); renderChars();
			playSound('item');
			saveGame();
			// 灯った知らせは必ず出す。行き先が1つでもあれば続けて一覧を開く
			pulse('碑の紋が 水色に 灯った！', 2200);
			openMenu(ws, false);
		});
	}

	return {
		isOpen: () => open,
		isWarping: () => warping,
		onRead, close, selectPrev, selectNext, choose,
		isLit, warp,
		// テスト用：id から碑を引く
		find: (id) => listWarpStones(getMapData()).find((ws) => ws.id === id) ?? null,
		idOf: warpStoneId,
	};
}

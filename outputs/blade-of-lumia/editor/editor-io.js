// ── editor-io.js ── 保存・読み込み・プレビュー ─────────────────
import { state, cellInfoEl, getCurrentStages, getCurrentStage } from './editor-state.js';
import { canvas } from './editor-canvas.js';

// ── 保存データ構築 ────────────────────────────────────────────
export function buildSaveData() {
	// startPos：fieldレイヤーの最初のステージのPLAYERタイル位置
	let startPos = { layer: 'field', stage: '0,0', row: 1, col: 1 };
	const { TILE } = await_TILE_import();
	outer: for (const [sk, sd] of Object.entries(state.mapData.layers.field?.stages ?? {})) {
		for (let r = 0; r < sd.rows; r++) {
			for (let c = 0; c < sd.cols; c++) {
				if (sd.tiles[r][c] === TILE.PLAYER) {
					startPos = { layer: 'field', stage: sk, row: r, col: c };
					break outer;
				}
			}
		}
	}
	return {
		version: state.mapData.version ?? 1,
		startPos,
		layers: state.mapData.layers,
	};
}

// TILE は同期インポートが必要なため外部からの注入で渡す
let _TILE = null;
function await_TILE_import() { return _TILE; }
export function setTILE(t) { _TILE = t; }

export function buildSaveDataSync(TILE) {
	let startPos = { layer: 'field', stage: '0,0', row: 1, col: 1 };
	outer: for (const [sk, sd] of Object.entries(state.mapData.layers.field?.stages ?? {})) {
		for (let r = 0; r < sd.rows; r++) {
			for (let c = 0; c < sd.cols; c++) {
				if (sd.tiles[r][c] === TILE.PLAYER) {
					startPos = { layer: 'field', stage: sk, row: r, col: c };
					break outer;
				}
			}
		}
	}
	return {
		version: state.mapData.version ?? 1,
		startPos,
		layers: state.mapData.layers,
	};
}

// ── データ読み込み ────────────────────────────────────────────
export function loadMapData(data, renderLayerTabs, renderDungeonMeta, renderWorldGrid) {
	if (!data || !data.layers) { alert('データ形式が無効です'); return; }
	state.mapData     = { version: data.version ?? 1, layers: data.layers };
	state.currentLayer = 'field';
	state.currentCoord = null;
	renderLayerTabs();
	renderDungeonMeta();
	document.getElementById('world-cols').value = 3;
	document.getElementById('world-rows').value = 3;
	renderWorldGrid();
	// showView は editor.js 側で注入する
	document.dispatchEvent(new CustomEvent('editor:showWorld'));
}

// ── File System Access API で保存 ───────────────────────────
let _workDirHandle = null;

async function saveToFile(json) {
	try {
		if (!window.showDirectoryPicker) throw new Error('unsupported');
		if (!_workDirHandle) {
			_workDirHandle = await window.showDirectoryPicker({
				id: 'blade-of-lumia-work',
				mode: 'readwrite',
				startIn: 'documents',
			});
		}
		const fh = await _workDirHandle.getFileHandle('blade-of-lumia.json', { create: true });
		const wr = await fh.createWritable();
		await wr.write(json);
		await wr.close();
		return true;
	} catch (e) {
		if (e.name === 'AbortError') return false;
		return false;
	}
}

// ── プレビュー状態 ────────────────────────────────────────────
let _previewPending = false;
export function getPreviewPending() { return _previewPending; }
export function setPreviewPending(v) {
	_previewPending = v;
	if (!v) {
		canvas.style.cursor  = '';
		canvas.style.outline = '';
		if (cellInfoEl) cellInfoEl.textContent = '';
	}
}

// ── プレビュー設定ダイアログ ──────────────────────────────────
function showPreviewSettingsDialog(onStart) {
	const overlay = document.getElementById('preview-settings-overlay');
	overlay.classList.remove('hidden');
	const btnStart  = document.getElementById('ps-btn-start');
	const btnCancel = document.getElementById('ps-btn-cancel');
	const newStart  = btnStart.cloneNode(true);
	const newCancel = btnCancel.cloneNode(true);
	btnStart.replaceWith(newStart);
	btnCancel.replaceWith(newCancel);

	newStart.addEventListener('click', () => {
		overlay.classList.add('hidden');
		onStart(getPreviewSettings());
	});
	newCancel.addEventListener('click', () => {
		overlay.classList.add('hidden');
		setPreviewPending(false);
	});
}

function getPreviewSettings() {
	return {
		atk:       parseInt(document.getElementById('ps-atk').value, 10) || 2,
		def:       parseInt(document.getElementById('ps-def').value, 10) || 0,
		rupees:    parseInt(document.getElementById('ps-rupees').value, 10) || 0,
		triforce:  parseInt(document.getElementById('ps-triforce').value, 10) || 0,
		weapon:    document.getElementById('ps-weapon').checked,
		shield:    document.getElementById('ps-shield').checked,
		armor:     document.getElementById('ps-armor').checked,
		bow:       document.getElementById('ps-bow').checked,
		boomerang: document.getElementById('ps-boomerang').checked,
		ladder:    document.getElementById('ps-ladder').checked,
		wingrobe:  document.getElementById('ps-wingrobe').checked,
		cleared:   document.getElementById('ps-cleared').checked,
	};
}

export function openPreview(stX, stY, row, col, ps, TILE) {
	const json = JSON.stringify(buildSaveDataSync(TILE), null, 2);
	localStorage.setItem('bladeOfLumiaMapData', json);
	const overlayEl = document.getElementById('preview-overlay');
	const frameEl   = document.getElementById('preview-frame');

	let url = `../game/index.html?layer=${encodeURIComponent(state.currentLayer)}&stage=${stX},${stY}&row=${row}&col=${col}&fromEditor=1&t=${Date.now()}`;
	if (ps) {
		url += `&ps_atk=${ps.atk}&ps_def=${ps.def}&ps_rupees=${ps.rupees}&ps_triforce=${ps.triforce}`;
		url += `&ps_weapon=${ps.weapon?1:0}&ps_shield=${ps.shield?1:0}&ps_armor=${ps.armor?1:0}`;
		url += `&ps_bow=${ps.bow?1:0}&ps_boomerang=${ps.boomerang?1:0}&ps_cleared=${ps.cleared?1:0}`;
		url += `&ps_ladder=${ps.ladder?1:0}&ps_wingrobe=${ps.wingrobe?1:0}`;
	}
	frameEl.src = 'about:blank';
	requestAnimationFrame(() => {
		frameEl.src = url;
		overlayEl.classList.remove('hidden');
	});
}

// ── イベント登録 ──────────────────────────────────────────────
export function initIOEvents(renderLayerTabs, renderDungeonMeta, renderWorldGrid, showView, TILE) {
	// 保存
	document.getElementById('btn-save').addEventListener('click', async () => {
		const json = JSON.stringify(buildSaveDataSync(TILE), null, 2);
		localStorage.setItem('bladeOfLumiaMapData', json);
		const saved = await saveToFile(json);
		if (saved) {
			alert('work/blade-of-lumia.json に保存しました！');
			return;
		}
		const blob = new Blob([json], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'blade-of-lumia.json';
		a.click();
		alert('保存しました！（ダウンロードされたファイルを work/ に配置してください）');
	});

	// 読み込み
	document.getElementById('btn-load').addEventListener('click', () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.addEventListener('change', e => {
			const file = e.target.files[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = ev => {
				try {
					const data = JSON.parse(ev.target.result);
					loadMapData(data, renderLayerTabs, renderDungeonMeta, renderWorldGrid);
					localStorage.setItem('bladeOfLumiaMapData', ev.target.result);
				} catch {
					alert('JSON の読み込みに失敗しました');
				}
			};
			reader.readAsText(file);
		});
		input.click();
	});

	// プレビューボタン
	document.getElementById('btn-preview').addEventListener('click', () => {
		const stages = getCurrentStages();
		if (!state.currentCoord) {
			const firstKey = Object.keys(stages)[0];
			if (!firstKey) { alert('ステージを選択してください'); return; }
			const [x, y] = firstKey.split(',').map(Number);
			state.currentCoord = { x, y };
		}
		const json = JSON.stringify(buildSaveDataSync(TILE), null, 2);
		localStorage.setItem('bladeOfLumiaMapData', json);

		const viewStageEl = document.getElementById('view-stage');
		if (viewStageEl.classList.contains('hidden')) {
			showPreviewSettingsDialog(ps => {
				openPreview(state.currentCoord.x, state.currentCoord.y, 1, 1, ps, TILE);
			});
		} else {
			setPreviewPending(true);
			canvas.style.cursor  = 'crosshair';
			canvas.style.outline = '3px solid #f0c040';
			if (cellInfoEl) cellInfoEl.textContent = '▶ クリックした位置からプレビューを開始します';
		}
	});

	// プレビュー終了
	document.getElementById('btn-exit-preview').addEventListener('click', () => {
		document.getElementById('preview-overlay').classList.add('hidden');
		document.getElementById('preview-frame').src = '';
		setPreviewPending(false);
	});

	// editor:resetPreview（editor-world.js から dispatch される）
	document.addEventListener('editor:resetPreview', () => {
		setPreviewPending(false);
		document.getElementById('preview-overlay').classList.add('hidden');
		document.getElementById('preview-frame').src = '';
	});

	// editor:showWorld（loadMapData から dispatch される）
	document.addEventListener('editor:showWorld', () => showView('world'));
}

// ── localStorage から復元 ─────────────────────────────────────
export function tryRestoreFromStorage(renderLayerTabs, renderDungeonMeta, renderWorldGrid) {
	const saved = localStorage.getItem('bladeOfLumiaMapData');
	if (saved) {
		try { loadMapData(JSON.parse(saved), renderLayerTabs, renderDungeonMeta, renderWorldGrid); } catch { /* 無視 */ }
	}
}

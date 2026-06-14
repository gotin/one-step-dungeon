// ── editor.js ── エントリポイント（オーケストレーション） ───────
import { TILE } from '../shared/tiles.js';
import { startAnimLoop } from '../shared/sprites.js';

import { state, viewWorldEl, viewStageEl, tabWorldEl, tabStageEl, cellInfoEl, getCurrentStages } from './editor-state.js';
import { renderLayerTabs, renderDungeonMeta, initLayerEvents } from './editor-layers.js';
import { renderWorldGrid, initWorldEvents } from './editor-world.js';
import { buildTilePalette, TILE_SPRITE_MAP } from './editor-palette.js';
import { canvas, renderStageCanvas, initCanvasEvents, initToolButtons } from './editor-canvas.js';
import { renderSidePanel, initLinksEvents, initConditionEvents, initDoorwayEvents } from './editor-props.js';
import {
	tryRestoreFromStorage, initIOEvents,
	getPreviewPending, setPreviewPending, openPreview,
} from './editor-io.js';

// ── タブ切り替え ───────────────────────────────────────────────
function showView(view) {
	// ビュー切り替え時はプレビュー待機状態を必ずリセット
	setPreviewPending(false);

	if (view === 'world') {
		viewWorldEl.classList.remove('hidden');
		viewStageEl.classList.add('hidden');
		tabWorldEl.classList.add('active');
		tabStageEl.classList.remove('active');
		renderLayerTabs(() => renderWorldGrid(), () => renderDungeonMeta());
		renderWorldGrid();
	} else {
		viewWorldEl.classList.add('hidden');
		viewStageEl.classList.remove('hidden');
		tabWorldEl.classList.remove('active');
		tabStageEl.classList.add('active');
		// currentCoord が未設定の場合は最初のステージを選択
		if (!state.currentCoord) {
			const firstKey = Object.keys(getCurrentStages())[0];
			if (firstKey) {
				const [x, y] = firstKey.split(',').map(Number);
				state.currentCoord = { x, y };
			}
		}
		renderStageCanvas(renderSidePanel);
		renderSidePanel();
	}
}

tabWorldEl.addEventListener('click', () => showView('world'));
tabStageEl.addEventListener('click', () => showView('stage'));

// ── 各モジュールのイベント登録 ────────────────────────────────
const updateToolButtons = initToolButtons(
	() => buildTilePalette(updateToolButtons)
);

initLayerEvents(
	() => renderWorldGrid(),
	() => renderDungeonMeta()
);

initWorldEvents(showView);

initCanvasEvents(
	renderSidePanel,
	() => renderWorldGrid(),
	getPreviewPending,
	setPreviewPending,
	(row, col) => {
		// canvas クリックで位置確定 → プレビュー設定ダイアログへ
		// editor-io.js の openPreview を呼ぶためダイアログを開く
		// showPreviewSettingsDialog は editor-io.js 内部なので CustomEvent で通知
		document.dispatchEvent(new CustomEvent('editor:previewClickAt', { detail: { row, col } }));
	}
);

// canvas クリック位置確定後の処理
document.addEventListener('editor:previewClickAt', e => {
	const { row, col } = e.detail;
	// プレビュー設定ダイアログを開いて openPreview を呼ぶ
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
		const ps = {
			atk:       parseInt(document.getElementById('ps-atk').value, 10) || 2,
			def:       parseInt(document.getElementById('ps-def').value, 10) || 0,
			rupees:    parseInt(document.getElementById('ps-rupees').value, 10) || 0,
			triforce:  parseInt(document.getElementById('ps-triforce').value, 10) || 0,
			weapon:    document.getElementById('ps-weapon').checked,
			shield:    document.getElementById('ps-shield').checked,
			armor:     document.getElementById('ps-armor').checked,
			bow:       document.getElementById('ps-bow').checked,
			boomerang: document.getElementById('ps-boomerang').checked,
			cleared:   document.getElementById('ps-cleared').checked,
		};
		openPreview(state.currentCoord.x, state.currentCoord.y, row, col, ps, TILE);
	});
	newCancel.addEventListener('click', () => {
		overlay.classList.add('hidden');
		setPreviewPending(false);
	});
});

initLinksEvents();
initConditionEvents();
initDoorwayEvents();

initIOEvents(
	() => renderLayerTabs(() => renderWorldGrid(), () => renderDungeonMeta()),
	() => renderDungeonMeta(),
	() => renderWorldGrid(),
	showView,
	TILE
);

// ── アニメーションループ ──────────────────────────────────────
startAnimLoop(() => {
	buildTilePalette(updateToolButtons);
	if (!viewStageEl.classList.contains('hidden')) renderStageCanvas(renderSidePanel);
});

// ── 初期化 ────────────────────────────────────────────────────
function init() {
	buildTilePalette(updateToolButtons);
	updateToolButtons();
	tryRestoreFromStorage(
		() => renderLayerTabs(() => renderWorldGrid(), () => renderDungeonMeta()),
		() => renderDungeonMeta(),
		() => renderWorldGrid()
	);
	renderLayerTabs(() => renderWorldGrid(), () => renderDungeonMeta());
	renderDungeonMeta();
	renderWorldGrid();
	showView('world');
}

init();

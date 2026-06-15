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
import { initSpriteEditor, onLeaveSpriteEditor } from './editor-sprite.js';
import { initCharacterEditor, onLeaveCharacterEditor } from './editor-character.js';
import { initItemEditor, onLeaveItemEditor } from './editor-item.js';
import { initTileEditor, onLeaveTileEditor } from './editor-tile.js';

const viewSpriteEl = document.getElementById('view-sprite');
const tabSpriteEl  = document.getElementById('tab-sprite');
const viewCharacterEl = document.getElementById('view-character');
const tabCharacterEl  = document.getElementById('tab-character');
const viewItemEl      = document.getElementById('view-item');
const tabItemEl       = document.getElementById('tab-item');
const viewTileEl      = document.getElementById('view-tile');
const tabTileEl       = document.getElementById('tab-tile');

// ── タブ切り替え ───────────────────────────────────────────────
function showView(view) {
	// ビュー切り替え時はプレビュー待機状態を必ずリセット
	setPreviewPending(false);
	// スプライトビューを離れる場合は再生を止める
	if (view !== 'sprite') onLeaveSpriteEditor();
	// キャラクタービューを離れる場合の処理
	if (view !== 'character') onLeaveCharacterEditor();
	// アイテムビューを離れる場合の処理
	if (view !== 'item') onLeaveItemEditor();
	// タイルビューを離れる場合の処理
	if (view !== 'tile') onLeaveTileEditor();

	// 全ビュー・全タブを一旦リセット
	viewWorldEl.classList.add('hidden');
	viewStageEl.classList.add('hidden');
	if (viewSpriteEl) viewSpriteEl.classList.add('hidden');
	if (viewCharacterEl) viewCharacterEl.classList.add('hidden');
	if (viewItemEl) viewItemEl.classList.add('hidden');
	if (viewTileEl) viewTileEl.classList.add('hidden');
	tabWorldEl.classList.remove('active');
	tabStageEl.classList.remove('active');
	if (tabSpriteEl) tabSpriteEl.classList.remove('active');
	if (tabCharacterEl) tabCharacterEl.classList.remove('active');
	if (tabItemEl) tabItemEl.classList.remove('active');
	if (tabTileEl) tabTileEl.classList.remove('active');

	if (view === 'world') {
		viewWorldEl.classList.remove('hidden');
		tabWorldEl.classList.add('active');
		renderLayerTabs(() => renderWorldGrid(), () => renderDungeonMeta());
		renderWorldGrid();
	} else if (view === 'sprite') {
		if (viewSpriteEl) viewSpriteEl.classList.remove('hidden');
		if (tabSpriteEl) tabSpriteEl.classList.add('active');
	} else if (view === 'character') {
		if (viewCharacterEl) viewCharacterEl.classList.remove('hidden');
		if (tabCharacterEl) tabCharacterEl.classList.add('active');
	} else if (view === 'item') {
		if (viewItemEl) viewItemEl.classList.remove('hidden');
		if (tabItemEl) tabItemEl.classList.add('active');
	} else if (view === 'tile') {
		if (viewTileEl) viewTileEl.classList.remove('hidden');
		if (tabTileEl) tabTileEl.classList.add('active');
	} else {
		viewStageEl.classList.remove('hidden');
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
if (tabSpriteEl) tabSpriteEl.addEventListener('click', () => showView('sprite'));
if (tabCharacterEl) tabCharacterEl.addEventListener('click', () => showView('character'));
if (tabItemEl) tabItemEl.addEventListener('click', () => showView('item'));
if (tabTileEl) tabTileEl.addEventListener('click', () => showView('tile'));

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
	initSpriteEditor();
	initCharacterEditor();
	initItemEditor();
	initTileEditor();
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

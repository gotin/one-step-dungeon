// ── editor-state.js ── 共有状態・DOM参照・ユーティリティ ──────
import { TILE } from '../shared/tiles.js';

// ── 状態管理 ──────────────────────────────────────────────────
export const state = {
	mapData: {               // blade-of-lumia.json の構造
		version: 1,
		layers: {
			field: { bgm: 'field', stages: {} },
		},
	},
	currentLayer: 'field',   // 現在選択中のレイヤーキー
	currentCoord: null,       // { x, y } 現在編集中ステージ座標
	selectedTile: TILE.WALL,
	currentTool:  'draw',
	isDrawing:    false,
};

// ── DOM refs ──────────────────────────────────────────────────
export const viewWorldEl      = document.getElementById('view-world');
export const viewStageEl      = document.getElementById('view-stage');
export const tabWorldEl       = document.getElementById('tab-world');
export const tabStageEl       = document.getElementById('tab-stage');
export const worldGridEl      = document.getElementById('world-grid');
export const tilePaletteEl    = document.getElementById('tile-palette');
export const stageLabelEl     = document.getElementById('stage-coord-label');
export const stageInfoEl      = document.getElementById('stage-info');
export const borderWarnEl     = document.getElementById('border-warnings');
export const cellInfoEl       = document.getElementById('cell-info');
export const layerTabsEl      = document.getElementById('layer-tabs');
export const dungeonMetaPanel = document.getElementById('dungeon-meta-panel');
export const worldStageInfoEl = document.getElementById('world-stage-info');
export const worldActionsEl   = document.getElementById('world-stage-actions');
export const worldPreviewWrap = document.getElementById('world-preview-wrap');
export const worldPreviewCv   = document.getElementById('world-preview-canvas');
export const worldShardSummaryEl = document.getElementById('world-shard-summary');

// ── ユーティリティ ────────────────────────────────────────────
export function getCurrentLayerData() {
	return state.mapData.layers[state.currentLayer];
}
export function getCurrentStages() {
	return getCurrentLayerData()?.stages ?? {};
}
export function getCurrentStage() {
	if (!state.currentCoord) return null;
	const key = `${state.currentCoord.x},${state.currentCoord.y}`;
	return getCurrentStages()[key] ?? null;
}
export function stageKey(x, y) { return `${x},${y}`; }

export function countTile(stage, tileChars) {
	let n = 0;
	for (const row of stage.tiles) for (const t of row) if (tileChars.includes(t)) n++;
	return n;
}
export function findTilePositions(stage, tileChar) {
	const out = [];
	for (let r = 0; r < stage.rows; r++)
		for (let c = 0; c < stage.cols; c++)
			if (stage.tiles[r][c] === tileChar) out.push({ r, c });
	return out;
}

// ── editor-canvas.js ── ステージキャンバス描画・マウス操作 ────
import { TILE, TILE_META, BG_TILES, makeEmptyStage } from '../shared/tiles.js';
import {
	state, stageKey, getCurrentStage, getCurrentStages,
	stageLabelEl, stageInfoEl, borderWarnEl, cellInfoEl, countTile,
} from './editor-state.js';
import { TILE_SPRITE_MAP, drawSpriteAt } from './editor-palette.js';

export const canvas    = document.getElementById('stage-canvas');
export const canvasCtx = canvas.getContext('2d');
export const CELL_SIZE = 40;

// bgTile → エディタ上での背景色マップ
const BG_TILE_EDITOR_COLORS = {
	[TILE.GRASS]:       '#3a6e28',
	[TILE.SAND]:        '#c8a84a',
	[TILE.STONE_FLOOR]: '#6a6878',
	[TILE.BRIDGE]:      '#8a6030',
};

export function drawCell(c, r, tileChar) {
	const sd = getCurrentStage();
	const posKey = `${r},${c}`;
	const bgTile = sd?.bgTiles?.[posKey] ?? TILE.FLOOR;
	const x = c * CELL_SIZE, y = r * CELL_SIZE;

	let bgColor;
	if (tileChar === TILE.WALL || tileChar === TILE.WATER) {
		bgColor = (TILE_META[tileChar] ?? TILE_META[TILE.FLOOR]).color;
	} else {
		bgColor = BG_TILE_EDITOR_COLORS[bgTile] ?? TILE_META[TILE.FLOOR].color;
	}
	canvasCtx.fillStyle = bgColor;
	canvasCtx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
	canvasCtx.strokeStyle = 'rgba(0,0,0,0.3)';
	canvasCtx.lineWidth = 0.5;
	canvasCtx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);

	const si = TILE_SPRITE_MAP[tileChar];
	if (si && drawSpriteAt(canvasCtx, si.spr, si.pal, x, y, CELL_SIZE, CELL_SIZE)) {
		// drawn
	} else if (tileChar !== TILE.FLOOR && tileChar !== TILE.WALL) {
		const m = TILE_META[tileChar];
		canvasCtx.font = `${CELL_SIZE * 0.5}px sans-serif`;
		canvasCtx.textAlign = 'center'; canvasCtx.textBaseline = 'middle';
		canvasCtx.fillStyle = '#fff';
		canvasCtx.fillText(m?.icon ?? '?', x + CELL_SIZE / 2, y + CELL_SIZE / 2);
	}
}

function drawNeighborEdges(sd) {
	if (!state.currentCoord) return;
	const { x, y } = state.currentCoord;
	const dirs = [
		{ dx:  0, dy: -1, edge: 'top' },
		{ dx:  0, dy:  1, edge: 'bottom' },
		{ dx: -1, dy:  0, edge: 'left' },
		{ dx:  1, dy:  0, edge: 'right' },
	];
	for (const { dx, dy, edge } of dirs) {
		const nb = getCurrentStages()[stageKey(x + dx, y + dy)];
		if (!nb) continue;
		canvasCtx.globalAlpha = 0.25;
		const { cols, rows } = sd;
		if (edge === 'top') {
			for (let c = 0; c < cols; c++) drawCell(c, -0.5, nb.tiles[nb.rows - 1][c]);
		} else if (edge === 'bottom') {
			for (let c = 0; c < cols; c++) drawCell(c, rows - 0.5, nb.tiles[0][c]);
		} else if (edge === 'left') {
			for (let r = 0; r < rows; r++) {
				if (r < nb.rows && nb.tiles[r]) drawCell(-0.5, r, nb.tiles[r][nb.cols - 1]);
			}
		} else {
			for (let r = 0; r < rows; r++) {
				if (r < nb.rows && nb.tiles[r]) drawCell(cols - 0.5, r, nb.tiles[r][0]);
			}
		}
		canvasCtx.globalAlpha = 1;
	}
}

function updateStageInfo(sd) {
	stageInfoEl.innerHTML = `
		<div>プレイヤー: <b>${countTile(sd,[TILE.PLAYER])}</b></div>
		<div>敵: <b>${countTile(sd,[TILE.PATROL,TILE.CHASER,TILE.SENTRY,TILE.BOSS,TILE.MONSTER,TILE.DARK_LORD])}</b></div>
		<div>宝箱: <b>${countTile(sd,[TILE.CHEST])}</b>　鍵: <b>${countTile(sd,[TILE.KEY])}</b></div>
		<div>NPC: <b>${countTile(sd,[TILE.NPC_A,TILE.NPC_B,TILE.NPC_SHOP,TILE.PRINCESS])}</b></div>
		<div>MAP_ENTER: <b>${countTile(sd,[TILE.MAP_ENTER])}</b></div>
		<div>ドアウェイ: <b>${countTile(sd,[TILE.DOORWAY,TILE.DOORWAY_BOSS,TILE.DOORWAY_LOCKED])}</b></div>
	`;
}

function updateBorderWarnings(sd) {
	if (!state.currentCoord) return;
	const { x, y } = state.currentCoord;
	const warns = [];
	const dirs = [
		{ dx: 0, dy: -1, myEdge: 'top',    myRow: 0 },
		{ dx: 0, dy:  1, myEdge: 'bottom',  myRow: sd.rows - 1 },
	];
	for (const d of dirs) {
		const nb = getCurrentStages()[stageKey(x + d.dx, y + d.dy)];
		if (!nb) continue;
		let wallCnt = 0;
		for (let c = 1; c < sd.cols - 1; c++) {
			if (sd.tiles[d.myRow][c] === TILE.WALL) wallCnt++;
		}
		if (wallCnt === sd.cols - 2) {
			warns.push(`⚠ ${d.myEdge}側が全部壁（隣ステージ ${stageKey(x+d.dx,y+d.dy)} と繋がれない可能性）`);
		}
	}
	borderWarnEl.innerHTML = warns.join('<br>');
}

export function renderStageCanvas(renderSidePanel) {
	const sd = getCurrentStage();
	if (!sd) return;
	const { cols, rows } = sd;
	canvas.width  = cols * CELL_SIZE;
	canvas.height = rows * CELL_SIZE;

	if (document.getElementById('show-neighbors').checked) {
		drawNeighborEdges(sd);
	}
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			drawCell(c, r, sd.tiles[r][c]);
		}
	}
	if (state.currentCoord) {
		stageLabelEl.textContent = `[${state.currentLayer}] ステージ (${state.currentCoord.x}, ${state.currentCoord.y})`;
	}
	updateStageInfo(sd);
	updateBorderWarnings(sd);
	document.getElementById('stage-is-boss-room').checked = !!sd.isBossRoom;
	document.getElementById('stage-bgm-override').value  = sd.bgm ?? '';
	const fluteEl = document.getElementById('stage-flute-effect');
	if (fluteEl) fluteEl.value = sd.fluteEffect ? JSON.stringify(sd.fluteEffect) : '';
}

// タイルに紐づくメタデータを削除するユーティリティ
function cleanTileMetaData(sd, r, c) {
	const posKey = `${r},${c}`;
	const tile = sd.tiles[r]?.[c];
	if (tile === TILE.MAP_ENTER) {
		delete sd.mapEnters?.[posKey];
	} else if (tile === TILE.CHEST) {
		delete sd.chestContents?.[posKey];
	} else if (tile === TILE.NPC_A || tile === TILE.NPC_B || tile === TILE.PRINCESS || tile === TILE.SIGN) {
		delete sd.npcData?.[posKey];
	} else if (tile === TILE.NPC_SHOP) {
		delete sd.shopData?.[posKey];
	} else if (tile === TILE.BREAKABLE_WALL) {
		delete sd.breakableWalls?.[posKey];
	} else if (tile === TILE.ITEM_SWORD || tile === TILE.ITEM_ARMOR) {
		delete sd.floorItems?.[posKey];
	}
	if (tile === TILE.MAP_ENTER || tile === TILE.DOORWAY_LOCKED) {
		delete sd.showConditions?.[posKey];
	}
}

function floodFillBg(sd, sc, sr, fromBg, toBg) {
	if (!sd.bgTiles) sd.bgTiles = {};
	const stack = [{ c: sc, r: sr }];
	const visited = new Set();
	while (stack.length) {
		const { c, r } = stack.pop();
		const posKey = `${r},${c}`;
		if (c < 0 || r < 0 || c >= sd.cols || r >= sd.rows) continue;
		if (visited.has(posKey)) continue;
		const cur = sd.bgTiles[posKey] ?? TILE.FLOOR;
		if (cur !== fromBg) continue;
		visited.add(posKey);
		if (toBg === TILE.FLOOR) delete sd.bgTiles[posKey];
		else sd.bgTiles[posKey] = toBg;
		stack.push({ c:c+1,r }, { c:c-1,r }, { c,r:r+1 }, { c,r:r-1 });
	}
}

function floodFill(sd, sc, sr, from, to) {
	if (from === to) return;
	const stack = [{ c: sc, r: sr }];
	while (stack.length) {
		const { c, r } = stack.pop();
		if (c < 0 || r < 0 || c >= sd.cols || r >= sd.rows) continue;
		if (sd.tiles[r][c] !== from) continue;
		sd.tiles[r][c] = to;
		stack.push({ c:c+1,r }, { c:c-1,r }, { c,r:r+1 }, { c,r:r-1 });
	}
}

function applyTool(c, r, renderSidePanel) {
	const sd = getCurrentStage();
	if (!sd || c < 0 || r < 0 || c >= sd.cols || r >= sd.rows) return;
	if (!sd.bgTiles) sd.bgTiles = {};

	if (state.currentTool === 'draw') {
		if (BG_TILES.has(state.selectedTile)) {
			const posKey = `${r},${c}`;
			if (state.selectedTile === TILE.FLOOR) {
				delete sd.bgTiles[posKey];
			} else {
				sd.bgTiles[posKey] = state.selectedTile;
			}
			const curTile = sd.tiles[r][c];
			if (curTile === TILE.FLOOR || BG_TILES.has(curTile)) {
				sd.tiles[r][c] = TILE.FLOOR;
			}
		} else {
			if (state.selectedTile === TILE.PLAYER) {
				for (const ld of Object.values(state.mapData.layers)) {
					for (const s of Object.values(ld.stages ?? {})) {
						for (let pr = 0; pr < s.rows; pr++)
							for (let pc = 0; pc < s.cols; pc++)
								if (s.tiles[pr][pc] === TILE.PLAYER) s.tiles[pr][pc] = TILE.FLOOR;
					}
				}
			}
			sd.tiles[r][c] = state.selectedTile;
		}
	} else if (state.currentTool === 'erase') {
		cleanTileMetaData(sd, r, c);
		sd.tiles[r][c] = TILE.FLOOR;
		delete sd.bgTiles[`${r},${c}`];
	} else if (state.currentTool === 'fill') {
		if (BG_TILES.has(state.selectedTile)) {
			const posKey = `${r},${c}`;
			const fromBg = sd.bgTiles[posKey] ?? TILE.FLOOR;
			floodFillBg(sd, c, r, fromBg, state.selectedTile);
		} else {
			floodFill(sd, c, r, sd.tiles[r][c], state.selectedTile);
		}
	}
	renderStageCanvas(renderSidePanel);
}

function getCellFromEvent(e) {
	const rect = canvas.getBoundingClientRect();
	const sx = canvas.width  / rect.width;
	const sy = canvas.height / rect.height;
	const px = (e.clientX - rect.left) * sx;
	const py = (e.clientY - rect.top)  * sy;
	return { c: Math.floor(px / CELL_SIZE), r: Math.floor(py / CELL_SIZE) };
}

export function initCanvasEvents(renderSidePanel, renderWorldGrid, getPreviewPending, setPreviewPending, onPreviewClick) {
	canvas.addEventListener('mousedown', () => {
		if (getPreviewPending()) return;
		state.isDrawing = true;
	});
	canvas.addEventListener('click', e => {
		if (getPreviewPending()) return;
		const { c, r } = getCellFromEvent(e);
		applyTool(c, r, renderSidePanel);
		renderSidePanel();
	});
	canvas.addEventListener('mousemove', e => {
		const { c, r } = getCellFromEvent(e);
		const sd = getCurrentStage();
		if (sd && c >= 0 && r >= 0 && c < sd.cols && r < sd.rows) {
			const tile = sd.tiles[r][c];
			cellInfoEl.textContent = `(${c}, ${r}) : ${TILE_META[tile]?.label ?? '?'}  [${tile}]`;
		}
		if (state.isDrawing && state.currentTool !== 'fill') {
			applyTool(c, r, renderSidePanel);
		}
	});
	canvas.addEventListener('mouseup',    () => { state.isDrawing = false; renderSidePanel(); });
	canvas.addEventListener('mouseleave', () => { state.isDrawing = false; cellInfoEl.textContent = ''; });

	// previewPending 時のクリック（最優先ハンドラ）
	canvas.addEventListener('click', e => {
		if (!getPreviewPending()) return;
		e.stopImmediatePropagation();
		setPreviewPending(false);
		canvas.style.cursor  = '';
		canvas.style.outline = '';
		cellInfoEl.textContent = '';
		const { c, r } = getCellFromEvent(e);
		onPreviewClick(r, c);
	}, true);

	document.getElementById('show-neighbors').addEventListener('change', () => renderStageCanvas(renderSidePanel));

	document.getElementById('btn-clear-stage').addEventListener('click', () => {
		const sd = getCurrentStage();
		if (!sd || !confirm('このステージをクリアしますか？')) return;
		const { cols, rows } = sd;
		const fresh = makeEmptyStage(cols, rows);
		sd.tiles = fresh.tiles;
		sd.links = [];
		sd.chestContents = {};
		sd.npcData = {};
		sd.shopData = {};
		sd.mapEnters = {};
		sd.showConditions = {};
		sd.breakableWalls = {};
		sd.isBossRoom = false;
		sd.bgm = undefined;
		renderStageCanvas(renderSidePanel);
		renderSidePanel();
	});

	document.getElementById('btn-save-stage-settings').addEventListener('click', () => {
		const sd = getCurrentStage();
		if (!sd) return;
		sd.isBossRoom = document.getElementById('stage-is-boss-room').checked;
		const bgmVal  = document.getElementById('stage-bgm-override').value;
		if (bgmVal) sd.bgm = bgmVal;
		else delete sd.bgm;
		// 🎵 笛の効果（fluteEffect）：JSON をパースして保存（空欄なら削除）
		const fluteVal = document.getElementById('stage-flute-effect').value.trim();
		if (fluteVal) {
			try { sd.fluteEffect = JSON.parse(fluteVal); }
			catch { alert('🎵 笛の効果が不正な JSON です（例: {"type":"reveal"}）'); return; }
		} else {
			delete sd.fluteEffect;
		}
		renderWorldGrid();
		alert('ステージ設定を保存しました');
	});
}

export function initToolButtons(buildTilePalette) {
	function updateToolButtons() {
		document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
		document.getElementById(`tool-${state.currentTool}`)?.classList.add('active');
	}
	['draw', 'erase', 'fill'].forEach(tool => {
		document.getElementById(`tool-${tool}`).addEventListener('click', () => {
			state.currentTool = tool;
			updateToolButtons();
		});
	});
	return updateToolButtons;
}

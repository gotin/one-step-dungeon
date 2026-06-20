// ── editor-world.js ── ワールドグリッド・ミニマップ・プレビュー ─
import { TILE, TILE_META, makeEmptyStage, DEFAULT_COLS, DEFAULT_ROWS } from '../shared/tiles.js';
import { countTriforces, listTriforceEntries } from '../shared/triforce.js';
import {
	state, stageKey, countTile, getCurrentStages,
	worldGridEl, worldStageInfoEl, worldActionsEl, worldPreviewWrap, worldPreviewCv,
	worldShardSummaryEl,
} from './editor-state.js';
import { TILE_SPRITE_MAP, drawSpriteAt } from './editor-palette.js';

const MINIMAP_BG_COLORS = {
	[TILE.GRASS]:       '#3a6e28',
	[TILE.SAND]:        '#c8a84a',
	[TILE.STONE_FLOOR]: '#6a6878',
	[TILE.BRIDGE]:      '#8a6030',
};

const MINIMAP_COLORS = {
	[TILE.WALL]: '#3a4448', [TILE.FLOOR]: '#1a2228', [TILE.WATER]: '#0e2040',
	[TILE.PLAYER]: '#4cd964',
	[TILE.PATROL]: '#4888c0', [TILE.CHASER]: '#c03030', [TILE.SENTRY]: '#9040c0',
	[TILE.BOSS]: '#f0c040', [TILE.MONSTER]: '#9060d0', [TILE.DARK_LORD]: '#8800ff',
	[TILE.NPC_A]: '#44aa44', [TILE.NPC_B]: '#aa8844', [TILE.NPC_SHOP]: '#aaaa00',
	[TILE.PRINCESS]: '#ff66aa',
	[TILE.GATE]: '#1a2c40', [TILE.BUTTON]: '#5a9a40', [TILE.SWITCH]: '#9a5aa0', [TILE.DOOR]: '#9b7048',
	[TILE.KEY]: '#f2c14e', [TILE.CHEST]: '#c09060', [TILE.STONE]: '#6a7470',
	[TILE.MAP_ENTER]: '#2040a0', [TILE.BREAKABLE_WALL]: '#6a5040',
	[TILE.DOORWAY]: '#204040', [TILE.DOORWAY_BOSS]: '#601020', [TILE.DOORWAY_LOCKED]: '#203060',
};

const PREVIEW_CELL = 40;
const PREVIEW_BG = {
	[TILE.WALL]: '#3a4448', [TILE.FLOOR]: '#1a2228', [TILE.WATER]: '#0e2040',
	[TILE.PLAYER]: '#2a5020',
	[TILE.PATROL]: '#1a3060', [TILE.CHASER]: '#3a0808', [TILE.SENTRY]: '#2a0840',
	[TILE.BOSS]: '#1a1a0a', [TILE.MONSTER]: '#180830', [TILE.DARK_LORD]: '#0a0a18',
};

export function drawMinimap(sd) {
	const cv = document.createElement('canvas');
	cv.width = sd.cols; cv.height = sd.rows;
	cv.className = 'minimap-canvas';
	const ctx = cv.getContext('2d');
	for (let r = 0; r < sd.rows; r++) {
		for (let c = 0; c < sd.cols; c++) {
			const t = sd.tiles[r][c];
			const posKey = `${r},${c}`;
			const bgTile = sd.bgTiles?.[posKey];

			let bgColor;
			if (t === TILE.WALL || t === TILE.WATER) {
				bgColor = MINIMAP_COLORS[t] ?? '#1a2228';
			} else if (bgTile && MINIMAP_BG_COLORS[bgTile]) {
				bgColor = MINIMAP_BG_COLORS[bgTile];
			} else {
				bgColor = MINIMAP_COLORS[TILE.FLOOR] ?? '#1a2228';
			}
			ctx.fillStyle = bgColor;
			ctx.fillRect(c, r, 1, 1);

			if (t !== TILE.FLOOR && t !== TILE.WALL && t !== TILE.WATER) {
				const fgColor = MINIMAP_COLORS[t];
				if (fgColor) {
					ctx.fillStyle = fgColor;
					ctx.fillRect(c, r, 1, 1);
				}
			}
		}
	}
	return cv;
}

export function drawWorldPreview(sd) {
	const { rows, cols, tiles } = sd;
	const pw = cols * PREVIEW_CELL;
	const ph = rows * PREVIEW_CELL;
	worldPreviewCv.width  = pw;
	worldPreviewCv.height = ph;
	const panelInner = worldPreviewWrap.clientWidth || 400;
	if (pw > panelInner) {
		const scale = panelInner / pw;
		worldPreviewCv.style.width  = `${Math.round(pw * scale)}px`;
		worldPreviewCv.style.height = `${Math.round(ph * scale)}px`;
	} else {
		worldPreviewCv.style.width  = `${pw}px`;
		worldPreviewCv.style.height = `${ph}px`;
	}
	const ctx = worldPreviewCv.getContext('2d');
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const t = tiles[r][c];
			const posKey = `${r},${c}`;
			const bgTile = sd.bgTiles?.[posKey];
			const x = c * PREVIEW_CELL, y = r * PREVIEW_CELL;
			let bgColor;
			if (t === TILE.WALL || t === TILE.WATER) {
				bgColor = PREVIEW_BG[t] ?? '#1a2228';
			} else {
				bgColor = (bgTile && MINIMAP_BG_COLORS[bgTile])
					? MINIMAP_BG_COLORS[bgTile]
					: (PREVIEW_BG[t] ?? '#1a2228');
			}
			ctx.fillStyle = bgColor;
			ctx.fillRect(x, y, PREVIEW_CELL, PREVIEW_CELL);
			ctx.strokeStyle = 'rgba(255,255,255,0.04)';
			ctx.lineWidth = 0.5;
			ctx.strokeRect(x + 0.5, y + 0.5, PREVIEW_CELL - 1, PREVIEW_CELL - 1);
			const si = TILE_SPRITE_MAP[t];
			if (si) {
				drawSpriteAt(ctx, si.spr, si.pal, x, y, PREVIEW_CELL, PREVIEW_CELL);
			} else if (t !== TILE.FLOOR && t !== TILE.WALL) {
				const meta = TILE_META[t];
				ctx.font = `${PREVIEW_CELL * 0.5}px sans-serif`;
				ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
				ctx.fillStyle = '#fff';
				ctx.fillText(meta?.icon ?? '?', x + PREVIEW_CELL / 2, y + PREVIEW_CELL / 2);
			}
		}
	}
}

export function updateWorldSidePanel(x, y) {
	const key = stageKey(x, y);
	const sd  = getCurrentStages()[key];
	if (!sd) {
		worldStageInfoEl.innerHTML = '<p class="hint">ステージを選択してください</p>';
		worldActionsEl.classList.add('hidden');
		worldPreviewWrap.classList.add('hidden');
		return;
	}
	const enemyTiles = [TILE.PATROL, TILE.CHASER, TILE.SENTRY, TILE.BOSS, TILE.MONSTER, TILE.DARK_LORD];
	worldStageInfoEl.innerHTML = `
		<div class="info-row"><span class="info-label">座標</span><span class="info-value">(${x}, ${y})</span></div>
		<div class="info-row"><span class="info-label">サイズ</span><span class="info-value">${sd.cols}×${sd.rows}</span></div>
		<div class="info-row"><span class="info-label">プレイヤー</span><span class="info-value">${countTile(sd,[TILE.PLAYER])}</span></div>
		<div class="info-row"><span class="info-label">敵</span><span class="info-value">${countTile(sd,enemyTiles)}</span></div>
		<div class="info-row"><span class="info-label">宝箱</span><span class="info-value">${countTile(sd,[TILE.CHEST])}</span></div>
		<div class="info-row"><span class="info-label">MAP_ENTER</span><span class="info-value">${countTile(sd,[TILE.MAP_ENTER])}</span></div>
		<div class="info-row"><span class="info-label">NPC</span><span class="info-value">${countTile(sd,[TILE.NPC_A,TILE.NPC_B,TILE.NPC_SHOP,TILE.PRINCESS])}</span></div>
		<div class="info-row"><span class="info-label">ボス部屋</span><span class="info-value">${sd.isBossRoom ? '✅' : '—'}</span></div>
		<div class="info-row"><span class="info-label">BGM上書き</span><span class="info-value">${sd.bgm ?? '(なし)'}</span></div>
	`;
	worldActionsEl.classList.remove('hidden');
	drawWorldPreview(sd);
	worldPreviewWrap.classList.remove('hidden');
}

// ── 星の欠片サマリ（全レイヤー横断）────────────────────────────
// shared/triforce.js の listTriforceEntries を使い、ゲーム側 calcTotalTriforces()
// と同じ定義（Q＋X＋dropsTriforce ボス）で総数と内訳を表示する。
export function updateShardSummary() {
	if (!worldShardSummaryEl) return;
	const entries = listTriforceEntries(state.mapData);
	const total      = entries.length;
	const pieceCount = entries.filter(e => e.kind === 'piece').length;
	const bossCount  = entries.filter(e => e.kind === 'boss').length;

	let html = `
		<div class="shard-summary-head">
			<span class="shard-summary-title">★ 星の欠片 合計</span>
			<span class="shard-summary-total">${total}</span>
		</div>
		<div class="shard-summary-sub">直接拾える欠片(◭) ${pieceCount} ＋ ボス撃破で出現 ${bossCount}</div>
		<p class="hint" style="margin:4px 0">この ${total} 個すべて集めると終盤フローが進む（祭壇があれば祭壇へ誘導／無ければ即エンディング）。プレビューの「星の欠片」初期値を ${total} にすると祭壇の挙動を確認できる。</p>
	`;
	if (total === 0) {
		html += `<p class="hint">マップに星の欠片(Q)もボス(dropsTriforce)もありません。</p>`;
	} else {
		html += `<ul class="shard-list">`;
		for (const e of entries) {
			const icon = e.kind === 'piece' ? '◭' : e.tile;
			html += `<li class="shard-list-item"><span class="shard-list-icon">${icon}</span>`
				+ `<span class="shard-list-loc">${e.layer} / ${e.stage} / (row ${e.r}, col ${e.c})</span>`
				+ `<span class="shard-list-kind">${e.label}</span></li>`;
		}
		html += `</ul>`;
	}
	worldShardSummaryEl.innerHTML = html;
}

function getWorldSize() {
	const stages = getCurrentStages();
	const coords = Object.keys(stages).map(k => k.split(',').map(Number));
	if (!coords.length) return { cols: 3, rows: 3 };
	const maxX = Math.max(2, ...coords.map(c => c[0]));
	const maxY = Math.max(2, ...coords.map(c => c[1]));
	return { cols: maxX + 1, rows: maxY + 1 };
}

function insertRow(insertY) {
	const stages = getCurrentStages();
	const keys = Object.keys(stages)
		.map(k => { const [x, y] = k.split(',').map(Number); return { k, x, y }; })
		.filter(e => e.y >= insertY).sort((a, b) => b.y - a.y);
	for (const { k, x, y } of keys) {
		stages[stageKey(x, y + 1)] = stages[k];
		delete stages[k];
	}
	if (state.currentCoord && state.currentCoord.y >= insertY) state.currentCoord.y++;
	renderWorldGrid();
}

function insertCol(insertX) {
	const stages = getCurrentStages();
	const keys = Object.keys(stages)
		.map(k => { const [x, y] = k.split(',').map(Number); return { k, x, y }; })
		.filter(e => e.x >= insertX).sort((a, b) => b.x - a.x);
	for (const { k, x, y } of keys) {
		stages[stageKey(x + 1, y)] = stages[k];
		delete stages[k];
	}
	if (state.currentCoord && state.currentCoord.x >= insertX) state.currentCoord.x++;
	renderWorldGrid();
}

export function renderWorldGrid() {
	const colsInput = parseInt(document.getElementById('world-cols').value, 10) || 3;
	const rowsInput = parseInt(document.getElementById('world-rows').value, 10) || 3;
	const { cols: dataMaxCols, rows: dataMaxRows } = getWorldSize();
	const worldCols = Math.max(colsInput, dataMaxCols);
	const worldRows = Math.max(rowsInput, dataMaxRows);

	document.getElementById('world-cols').value = worldCols;
	document.getElementById('world-rows').value = worldRows;

	const stages = getCurrentStages();
	worldGridEl.style.gridTemplateColumns = `18px repeat(${worldCols}, 100px 18px)`;
	worldGridEl.innerHTML = '';

	for (let y = 0; y <= worldRows; y++) {
		const corner = document.createElement('div');
		corner.style.cssText = 'height:18px;';
		worldGridEl.appendChild(corner);
		for (let x = 0; x < worldCols; x++) {
			const rowBtn = document.createElement('button');
			rowBtn.className = 'world-insert-btn world-insert-row';
			rowBtn.title = `${y}行の上に行挿入`;
			rowBtn.textContent = '＋';
			const cy = y;
			rowBtn.addEventListener('click', () => insertRow(cy));
			worldGridEl.appendChild(rowBtn);
			const sp = document.createElement('div');
			sp.style.cssText = 'height:18px;';
			worldGridEl.appendChild(sp);
		}
		if (y === worldRows) break;

		for (let x = 0; x <= worldCols; x++) {
			const colBtn = document.createElement('button');
			colBtn.className = 'world-insert-btn world-insert-col';
			colBtn.title = `${x}列の左に列挿入`;
			colBtn.textContent = '＋';
			const cx = x;
			colBtn.addEventListener('click', () => insertCol(cx));
			worldGridEl.appendChild(colBtn);
			if (x === worldCols) break;

			const key      = stageKey(x, y);
			const hasStage = !!stages[key];
			const isSel    = state.currentCoord && state.currentCoord.x === x && state.currentCoord.y === y;
			const sd       = stages[key];

			const cell = document.createElement('div');
			cell.className = 'world-cell' +
				(hasStage ? ' has-stage' : '') +
				(isSel    ? ' selected'  : '') +
				(sd?.isBossRoom ? ' boss-room-mark' : '');

			if (hasStage) {
				const mm = drawMinimap(sd);
				cell.appendChild(mm);
				const coord = document.createElement('div');
				coord.className = 'cell-coord';
				coord.textContent = `(${x},${y})${sd.isBossRoom ? '👑' : ''}`;
				cell.appendChild(coord);
			} else {
				const e = document.createElement('div');
				e.className = 'cell-empty';
				e.textContent = '＋';
				const l = document.createElement('div');
				l.className = 'cell-add-label';
				l.textContent = `(${x},${y})`;
				cell.appendChild(e);
				cell.appendChild(l);
			}

			cell.addEventListener('click', () => {
				if (!hasStage) {
					stages[key] = makeEmptyStage(DEFAULT_COLS, DEFAULT_ROWS);
				}
				state.currentCoord = { x, y };
				renderWorldGrid();
				updateWorldSidePanel(x, y);
			});
			worldGridEl.appendChild(cell);
		}
	}
	if (state.currentCoord) {
		updateWorldSidePanel(state.currentCoord.x, state.currentCoord.y);
	}
	updateShardSummary();
}

export function initWorldEvents(showView) {
	document.getElementById('btn-resize-world').addEventListener('click', () => { renderWorldGrid(); });

	document.getElementById('btn-edit-stage').addEventListener('click', () => {
		if (!state.currentCoord) return;
		// _previewPending を完全リセットしてからステージ編集へ（editor-io 側で管理）
		document.dispatchEvent(new CustomEvent('editor:resetPreview'));
		showView('stage');
	});

	document.getElementById('btn-delete-stage').addEventListener('click', () => {
		if (!state.currentCoord) return;
		const key = stageKey(state.currentCoord.x, state.currentCoord.y);
		if (!confirm(`ステージ (${key}) を削除しますか？`)) return;
		delete getCurrentStages()[key];
		state.currentCoord = null;
		renderWorldGrid();
		worldStageInfoEl.innerHTML = '<p class="hint">ステージを選択してください</p>';
		worldActionsEl.classList.add('hidden');
		worldPreviewWrap.classList.add('hidden');
	});
}

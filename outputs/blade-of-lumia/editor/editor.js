// ── Blade of Lumia – Map Editor ──────────────────────────────
import { TILE, TILE_META, DEFAULT_COLS, DEFAULT_ROWS, makeEmptyStage, BG_TILES } from '../shared/tiles.js';
import { SPRITES, PAL, animFrame, startAnimLoop } from '../shared/sprites.js';

// ── 状態管理 ──────────────────────────────────────────────────
const state = {
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

// ── Canvas ────────────────────────────────────────────────────
const canvas    = document.getElementById('stage-canvas');
const canvasCtx = canvas.getContext('2d');
const CELL_SIZE = 40;

// ── DOM refs ──────────────────────────────────────────────────
const viewWorldEl      = document.getElementById('view-world');
const viewStageEl      = document.getElementById('view-stage');
const tabWorldEl       = document.getElementById('tab-world');
const tabStageEl       = document.getElementById('tab-stage');
const worldGridEl      = document.getElementById('world-grid');
const tilePaletteEl    = document.getElementById('tile-palette');
const stageLabelEl     = document.getElementById('stage-coord-label');
const stageInfoEl      = document.getElementById('stage-info');
const borderWarnEl     = document.getElementById('border-warnings');
const cellInfoEl       = document.getElementById('cell-info');
const layerTabsEl      = document.getElementById('layer-tabs');
const dungeonMetaPanel = document.getElementById('dungeon-meta-panel');
const worldStageInfoEl = document.getElementById('world-stage-info');
const worldActionsEl   = document.getElementById('world-stage-actions');
const worldPreviewWrap = document.getElementById('world-preview-wrap');
const worldPreviewCv   = document.getElementById('world-preview-canvas');

// ── ユーティリティ ────────────────────────────────────────────
function getCurrentLayerData() {
	return state.mapData.layers[state.currentLayer];
}
function getCurrentStages() {
	return getCurrentLayerData()?.stages ?? {};
}
function getCurrentStage() {
	if (!state.currentCoord) return null;
	const key = `${state.currentCoord.x},${state.currentCoord.y}`;
	return getCurrentStages()[key] ?? null;
}
function stageKey(x, y) { return `${x},${y}`; }

function countTile(stage, tileChars) {
	let n = 0;
	for (const row of stage.tiles) for (const t of row) if (tileChars.includes(t)) n++;
	return n;
}
function findTilePositions(stage, tileChar) {
	const out = [];
	for (let r = 0; r < stage.rows; r++)
		for (let c = 0; c < stage.cols; c++)
			if (stage.tiles[r][c] === tileChar) out.push({ r, c });
	return out;
}

// ── タブ切り替え ───────────────────────────────────────────────
function showView(view) {
	// ビュー切り替え時はプレビュー待機状態を必ずリセット
	_previewPending = false;
	canvas.style.cursor  = '';
	canvas.style.outline = '';
	if (cellInfoEl) cellInfoEl.textContent = '';

	if (view === 'world') {
		viewWorldEl.classList.remove('hidden');
		viewStageEl.classList.add('hidden');
		tabWorldEl.classList.add('active');
		tabStageEl.classList.remove('active');
		renderLayerTabs();
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
		renderStageCanvas();
		renderSidePanel();
	}
}
tabWorldEl.addEventListener('click', () => showView('world'));
tabStageEl.addEventListener('click', () => showView('stage'));

// ── レイヤー管理 ──────────────────────────────────────────────
function renderLayerTabs() {
	layerTabsEl.innerHTML = '';
	for (const lk of Object.keys(state.mapData.layers)) {
		const btn = document.createElement('button');
		btn.className = 'layer-tab' + (lk === state.currentLayer ? ' active' : '');
		btn.textContent = lk;
		btn.addEventListener('click', () => {
			state.currentLayer = lk;
			state.currentCoord = null;
			renderLayerTabs();
			renderDungeonMeta();
			renderWorldGrid();
		});
		// 長押しで削除（fieldは削除不可）
		if (lk !== 'field') {
			const delBtn = document.createElement('span');
			delBtn.textContent = '✕';
			delBtn.style.cssText = 'margin-left:4px;cursor:pointer;opacity:0.5;font-size:0.7rem;';
			delBtn.title = 'レイヤー削除';
			delBtn.addEventListener('click', e => {
				e.stopPropagation();
				if (!confirm(`レイヤー「${lk}」を削除しますか？（全ステージも削除されます）`)) return;
				delete state.mapData.layers[lk];
				if (state.currentLayer === lk) state.currentLayer = 'field';
				renderLayerTabs();
				renderDungeonMeta();
				renderWorldGrid();
			});
			btn.appendChild(delBtn);
		}
		layerTabsEl.appendChild(btn);
	}
}

document.getElementById('btn-add-layer').addEventListener('click', () => {
	const name = prompt('ダンジョンキーを入力してください（例: dungeon_2）');
	if (!name || state.mapData.layers[name]) return;
	state.mapData.layers[name] = {
		name:    '',
		bgm:     'dungeon',
		bossBgm: 'boss',
		bossStage: '',
		triforceId: Object.keys(state.mapData.layers).filter(k => k !== 'field').length + 1,
		stages: {},
	};
	state.currentLayer = name;
	state.currentCoord = null;
	renderLayerTabs();
	renderDungeonMeta();
	renderWorldGrid();
});

// ── ダンジョンメタ情報パネル ──────────────────────────────────
function renderDungeonMeta() {
	dungeonMetaPanel.classList.remove('hidden');
	const ld = getCurrentLayerData();
	const isField = state.currentLayer === 'field';
	// field レイヤーはダンジョン専用項目（name/bossBgm/bossStage）を非表示
	document.querySelectorAll('.dungeon-only').forEach(el => {
		el.style.display = isField ? 'none' : '';
	});
	document.getElementById('dungeon-name').value       = ld?.name      ?? '';
	document.getElementById('dungeon-bgm').value        = ld?.bgm       ?? (isField ? 'field' : 'dungeon');
	document.getElementById('dungeon-bossBgm').value    = ld?.bossBgm   ?? 'boss';
	document.getElementById('dungeon-bossStage').value  = ld?.bossStage ?? '';
}

document.getElementById('btn-save-dungeon-meta').addEventListener('click', () => {
	const ld = getCurrentLayerData();
	const isField = state.currentLayer === 'field';
	if (!isField) {
		ld.name      = document.getElementById('dungeon-name').value.trim();
		ld.bossBgm   = document.getElementById('dungeon-bossBgm').value;
		ld.bossStage = document.getElementById('dungeon-bossStage').value.trim();
	}
	ld.bgm = document.getElementById('dungeon-bgm').value;
	renderLayerTabs();
	alert(`${isField ? 'フィールド' : 'ダンジョン'}設定を保存しました`);
});

// ── ワールドグリッド ──────────────────────────────────────────
function getWorldSize() {
	const stages = getCurrentStages();
	const coords = Object.keys(stages).map(k => k.split(',').map(Number));
	if (!coords.length) return { cols: 3, rows: 3 };
	const maxX = Math.max(2, ...coords.map(c => c[0]));
	const maxY = Math.max(2, ...coords.map(c => c[1]));
	return { cols: maxX + 1, rows: maxY + 1 };
}

function renderWorldGrid() {
	const colsInput = parseInt(document.getElementById('world-cols').value, 10) || 3;
	const rowsInput = parseInt(document.getElementById('world-rows').value, 10) || 3;
	const { cols: dataMaxCols, rows: dataMaxRows } = getWorldSize();
	const worldCols = Math.max(colsInput, dataMaxCols);
	const worldRows = Math.max(rowsInput, dataMaxRows);

	// input値も更新
	document.getElementById('world-cols').value = worldCols;
	document.getElementById('world-rows').value = worldRows;

	const stages = getCurrentStages();
	worldGridEl.style.gridTemplateColumns = `18px repeat(${worldCols}, 100px 18px)`;
	worldGridEl.innerHTML = '';

	for (let y = 0; y <= worldRows; y++) {
		// 行挿入ボタン行
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

		// ステージセル行
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
}

function updateWorldSidePanel(x, y) {
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

const MINIMAP_BG_COLORS = {
	[TILE.GRASS]:       '#3a6e28',
	[TILE.SAND]:        '#c8a84a',
	[TILE.STONE_FLOOR]: '#6a6878',
	[TILE.BRIDGE]:      '#8a6030',
};

function drawMinimap(sd) {
	const cv = document.createElement('canvas');
	cv.width = sd.cols; cv.height = sd.rows;
	cv.className = 'minimap-canvas';
	const ctx = cv.getContext('2d');
	for (let r = 0; r < sd.rows; r++) {
		for (let c = 0; c < sd.cols; c++) {
			const t = sd.tiles[r][c];
			const posKey = `${r},${c}`;
			const bgTile = sd.bgTiles?.[posKey];

			// ① 背景色（bgTile がある場合は bgTile 色、なければタイル色）
			let bgColor;
			if (t === TILE.WALL || t === TILE.WATER) {
				// 壁・水はタイル色のみ（bgTile を無視）
				bgColor = MINIMAP_COLORS[t] ?? '#1a2228';
			} else if (bgTile && MINIMAP_BG_COLORS[bgTile]) {
				bgColor = MINIMAP_BG_COLORS[bgTile];
			} else {
				bgColor = MINIMAP_COLORS[TILE.FLOOR] ?? '#1a2228';
			}
			ctx.fillStyle = bgColor;
			ctx.fillRect(c, r, 1, 1);

			// ② 前景色（FLOOR・壁・水以外はオブジェクト色を上に重ねる）
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

const MINIMAP_COLORS = {
	[TILE.WALL]: '#3a4448', [TILE.FLOOR]: '#1a2228', [TILE.WATER]: '#0e2040',
	[TILE.PLAYER]: '#4cd964',
	[TILE.PATROL]: '#4888c0', [TILE.CHASER]: '#c03030', [TILE.SENTRY]: '#9040c0',
	[TILE.BOSS]: '#f0c040', [TILE.MONSTER]: '#9060d0', [TILE.DARK_LORD]: '#8800ff',
	[TILE.NPC_A]: '#44aa44', [TILE.NPC_B]: '#aa8844', [TILE.NPC_SHOP]: '#aaaa00',
	[TILE.PRINCESS]: '#ff66aa',
	[TILE.GATE]: '#1a2c40', [TILE.SWITCH]: '#5a9a40', [TILE.DOOR]: '#9b7048',
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

function drawWorldPreview(sd) {
	const { rows, cols, tiles } = sd;
	const pw = cols * PREVIEW_CELL;
	const ph = rows * PREVIEW_CELL;
	worldPreviewCv.width  = pw;
	worldPreviewCv.height = ph;
	// パネル内幅に合わせてCSSサイズを設定（アスペクト比維持）
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
			// 背景色：壁・水はタイル色、それ以外は bgTile → タイル色の順
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
			if (si && SPRITES[si.spr]) {
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

// 行・列の挿入
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

document.getElementById('btn-resize-world').addEventListener('click', () => { renderWorldGrid(); });

document.getElementById('btn-edit-stage').addEventListener('click', () => {
	if (!state.currentCoord) return;
	// _previewPending を完全リセットしてからステージ編集へ
	_previewPending = false;
	canvas.style.cursor  = '';
	canvas.style.outline = '';
	document.getElementById('preview-overlay').classList.add('hidden');
	document.getElementById('preview-frame').src = '';
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

// ── タイルパレット ────────────────────────────────────────────
// カテゴリ分け
const PALETTE_CATEGORIES = [
	{ label: '地形（背景）', tiles: [TILE.FLOOR, TILE.GRASS, TILE.SAND, TILE.STONE_FLOOR, TILE.BRIDGE] },
	{ label: '障害物・建物', tiles: [TILE.WALL, TILE.WATER, TILE.BREAKABLE_WALL, TILE.TREE, TILE.MOUNTAIN, TILE.BUSH, TILE.FENCE, TILE.HOUSE_WALL, TILE.HOUSE_DOOR, TILE.HOUSE_ROOF, TILE.SIGN] },
	{ label: 'プレイヤー', tiles: [TILE.PLAYER] },
	{ label: '敵',    tiles: [TILE.PATROL, TILE.CHASER, TILE.SENTRY, TILE.BOSS, TILE.MONSTER, TILE.DARK_LORD] },
	{ label: 'NPC',   tiles: [TILE.PRINCESS, TILE.NPC_A, TILE.NPC_B, TILE.NPC_SHOP] },
	{ label: 'ギミック', tiles: [TILE.GATE, TILE.SWITCH, TILE.DOOR, TILE.KEY, TILE.CHEST, TILE.STONE, TILE.MAP_ENTER] },
	{ label: 'ドアウェイ', tiles: [TILE.DOORWAY, TILE.DOORWAY_BOSS, TILE.DOORWAY_LOCKED] },
	{ label: 'アイテム', tiles: [
		TILE.ITEM_SWORD, TILE.ITEM_SHIELD, TILE.ITEM_ARMOR,
		TILE.ITEM_BOOMERANG, TILE.ITEM_BOMB, TILE.ITEM_BOW,
		TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION,
		TILE.ITEM_HEART_CONTAINER, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE,
		TILE.ITEM_TRIFORCE_PIECE, TILE.ITEM_DUNGEON_MAP, TILE.ITEM_COMPASS,
	]},
];

function buildTilePalette() {
	tilePaletteEl.innerHTML = '';
	for (const cat of PALETTE_CATEGORIES) {
		const sep = document.createElement('div');
		sep.className = 'tile-category';
		sep.textContent = cat.label;
		tilePaletteEl.appendChild(sep);
		for (const tileChar of cat.tiles) {
			const meta = TILE_META[tileChar];
			if (!meta) continue;
			const btn = document.createElement('button');
			btn.className = 'tile-btn' + (tileChar === state.selectedTile ? ' selected' : '');
			btn.title = meta.label;

			const si = TILE_SPRITE_MAP[tileChar];
			if (si && SPRITES[si.spr]) {
				const cv = document.createElement('canvas');
				cv.width = 28; cv.height = 28;
				cv.style.imageRendering = 'pixelated';
				cv.style.display = 'block';
				drawSpriteAt(cv.getContext('2d'), si.spr, si.pal, 0, 0, 28, 28);
				btn.appendChild(cv);
			} else {
				const icon = document.createElement('span');
				icon.className = 'tile-icon';
				icon.textContent = meta.icon ?? tileChar;
				btn.appendChild(icon);
			}
			const lbl = document.createElement('span');
			lbl.className = 'tile-label';
			lbl.textContent = meta.label;
			btn.appendChild(lbl);

			btn.addEventListener('click', () => {
				state.selectedTile = tileChar;
				state.currentTool  = 'draw';
				updateToolButtons();
				buildTilePalette();
			});
			tilePaletteEl.appendChild(btn);
		}
	}
}

// タイル → スプライト対応
const TILE_SPRITE_MAP = {
	[TILE.SWITCH]:    { spr: 'swG',      pal: 'swG'      },
	[TILE.GATE]:      { spr: 'gateG',    pal: 'gateG'    },
	[TILE.DOOR]:      { spr: 'door',     pal: 'door'     },
	[TILE.KEY]:       { spr: 'key',      pal: 'key'      },
	[TILE.STONE]:     { spr: 'block',    pal: 'block'    },
	[TILE.CHEST]:     { spr: 'chest',    pal: 'chest'    },
	[TILE.WATER]:     { spr: 'water',    pal: 'water'    },
	[TILE.PATROL]:    { spr: 'patrol',   pal: 'patrol'   },
	[TILE.CHASER]:    { spr: 'chaser',   pal: 'chaser'   },
	[TILE.SENTRY]:    { spr: 'sentry',   pal: 'sentry'   },
	[TILE.BOSS]:      { spr: 'escape',   pal: 'escape'   },
	[TILE.MONSTER]:   { spr: 'monster',  pal: 'monster'  },
	[TILE.DARK_LORD]: { spr: 'darklord', pal: 'darklord' },
	[TILE.PRINCESS]:  { spr: 'princess', pal: 'princess' },
	[TILE.PLAYER]:    { spr: 'heroD',    pal: 'hero'     },
	[TILE.NPC_A]:     { spr: 'npcA',     pal: 'npcA'     },
	[TILE.NPC_B]:     { spr: 'npcB',     pal: 'npcB'     },
	[TILE.ITEM_SWORD]:           { spr: 'sword',    pal: 'sword'    },
	[TILE.ITEM_SHIELD]:          { spr: 'shield',   pal: 'shield'   },
	[TILE.ITEM_BOOMERANG]:       { spr: 'boomerang',pal: 'boomerang'},
	[TILE.ITEM_RUPEE]:           { spr: 'rupee',    pal: 'rupee'    },
	[TILE.ITEM_RUPEE_LARGE]:     { spr: 'rupee',    pal: 'rupeeBlue'},
	[TILE.ITEM_TRIFORCE_PIECE]:  { spr: 'triforce', pal: 'triforce' },
	[TILE.BREAKABLE_WALL]:       { spr: 'breakableWall', pal: 'breakableWall' },
	[TILE.MAP_ENTER]:            { spr: 'mapEnter', pal: 'mapEnter' },
	[TILE.ITEM_HEART_CONTAINER]: { spr: 'heart',     pal: 'heart'     },
	// ドアウェイ（ゲーム画面と同じスプライト）
	[TILE.DOORWAY]:              { spr: 'doorway',       pal: 'doorway'       },
	[TILE.DOORWAY_BOSS]:         { spr: 'doorwayBoss',   pal: 'doorwayBoss'   },
	[TILE.DOORWAY_LOCKED]:       { spr: 'doorwayLocked', pal: 'doorwayLocked' },
	// ITEM_COMPASS/ITEM_DUNGEON_MAP/ITEM_BOMB/ITEM_HEAL_POTION/ITEM_ARMOR
	// はゲーム画面と同様に絵文字フォールバックで表示（スプライトなし）
	[TILE.TREE]:        { spr: 'tree',      pal: 'tree'      },
	[TILE.MOUNTAIN]:    { spr: 'mountain',  pal: 'mountain'  },
	[TILE.BUSH]:        { spr: 'bush',      pal: 'bush'      },
	[TILE.FENCE]:       { spr: 'fence',     pal: 'fence'     },
	[TILE.HOUSE_WALL]:  { spr: 'houseWall', pal: 'houseWall' },
	[TILE.HOUSE_DOOR]:  { spr: 'houseDoor', pal: 'houseDoor' },
	[TILE.HOUSE_ROOF]:  { spr: 'houseRoof', pal: 'houseRoof' },
	[TILE.SIGN]:        { spr: 'sign',      pal: 'sign'      },
	[TILE.GRASS]:       { spr: 'grass',     pal: 'grass'     },
	[TILE.SAND]:        { spr: 'sand',      pal: 'sand'      },
	[TILE.STONE_FLOOR]: { spr: 'stoneFloor',pal: 'stoneFloor'},
	[TILE.BRIDGE]:      { spr: 'bridge',    pal: 'bridge'    },
};

function drawSpriteAt(ctx, spriteName, palName, dx, dy, dw, dh) {
	const frames = SPRITES[spriteName];
	if (!frames) return false;
	const palette = PAL[palName] ?? PAL.hero;
	const fi   = animFrame % frames.length;
	const grid = frames[fi];
	const rows = grid.length, cols = grid[0].length;
	const tmp  = document.createElement('canvas');
	tmp.width = cols; tmp.height = rows;
	const tctx = tmp.getContext('2d');
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const idx = grid[r][c];
			if (!idx) continue;
			tctx.fillStyle = palette[idx];
			tctx.fillRect(c, r, 1, 1);
		}
	}
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(tmp, dx, dy, dw, dh);
	return true;
}

// ── ツールボタン ──────────────────────────────────────────────
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

// ── ステージキャンバス描画 ────────────────────────────────────
function renderStageCanvas() {
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
	// ステージ設定を反映
	document.getElementById('stage-is-boss-room').checked = !!sd.isBossRoom;
	document.getElementById('stage-bgm-override').value  = sd.bgm ?? '';
}

// bgTile → エディタ上での背景色マップ
const BG_TILE_EDITOR_COLORS = {
	[TILE.GRASS]:       '#3a6e28',
	[TILE.SAND]:        '#c8a84a',
	[TILE.STONE_FLOOR]: '#6a6878',
	[TILE.BRIDGE]:      '#8a6030',
};

function drawCell(c, r, tileChar) {
	const sd = getCurrentStage();
	const posKey = `${r},${c}`;
	const bgTile = sd?.bgTiles?.[posKey] ?? TILE.FLOOR;
	const x = c * CELL_SIZE, y = r * CELL_SIZE;

	// ① 背景色を決定
	// 壁・水はそれ自身の色。それ以外は bgTile の色（FLOOR ならデフォルト）
	let bgColor;
	if (tileChar === TILE.WALL || tileChar === TILE.WATER) {
		bgColor = (TILE_META[tileChar] ?? TILE_META[TILE.FLOOR]).color;
	} else {
		// bgTile が FLOOR 以外ならその色、FLOOR ならデフォルト床色
		bgColor = BG_TILE_EDITOR_COLORS[bgTile] ?? TILE_META[TILE.FLOOR].color;
	}
	canvasCtx.fillStyle = bgColor;
	canvasCtx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
	canvasCtx.strokeStyle = 'rgba(0,0,0,0.3)';
	canvasCtx.lineWidth = 0.5;
	canvasCtx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);

	// ② フォアグラウンドスプライト / アイコン（FLOOR・WALL は何も描かない）
	const si = TILE_SPRITE_MAP[tileChar];
	if (si && SPRITES[si.spr]) {
		drawSpriteAt(canvasCtx, si.spr, si.pal, x, y, CELL_SIZE, CELL_SIZE);
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

// ── ステージ情報・ボーダー警告 ────────────────────────────────
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

// ── Canvas マウスイベント ──────────────────────────────────────
function getCellFromEvent(e) {
	const rect = canvas.getBoundingClientRect();
	const sx = canvas.width  / rect.width;
	const sy = canvas.height / rect.height;
	const px = (e.clientX - rect.left) * sx;
	const py = (e.clientY - rect.top)  * sy;
	return { c: Math.floor(px / CELL_SIZE), r: Math.floor(py / CELL_SIZE) };
}

function applyTool(c, r) {
	const sd = getCurrentStage();
	if (!sd || c < 0 || r < 0 || c >= sd.cols || r >= sd.rows) return;
	if (!sd.bgTiles) sd.bgTiles = {};

	if (state.currentTool === 'draw') {
		if (BG_TILES.has(state.selectedTile)) {
			// 背景地形タイル（GRASS/SAND等）→ bgTiles に書き込み
			// tiles[r][c] は FLOOR または既存タイルを維持（壁なら壁のまま）
			const posKey = `${r},${c}`;
			if (state.selectedTile === TILE.FLOOR) {
				delete sd.bgTiles[posKey]; // FLOOR はデフォルトなので削除
			} else {
				sd.bgTiles[posKey] = state.selectedTile;
			}
			// tiles が FLOOR か bgTile のときだけ FLOOR に戻す
			// それ以外（NPC・敵・アイテム・ギミック等）は上書きしない
			const curTile = sd.tiles[r][c];
			if (curTile === TILE.FLOOR || BG_TILES.has(curTile)) {
				sd.tiles[r][c] = TILE.FLOOR;
			}
			// 壁・水・NPC・敵・アイテム・ギミック等はそのまま維持
		} else {
			// 通常タイル → tiles に書き込み
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
		// 消去前のタイルに応じてメタデータも削除
		cleanTileMetaData(sd, r, c);
		sd.tiles[r][c] = TILE.FLOOR;
		delete sd.bgTiles[`${r},${c}`];
	} else if (state.currentTool === 'fill') {
		if (BG_TILES.has(state.selectedTile)) {
			// 背景タイルのfill：bgTilesを同じ値のセルに塗りつぶす
			const posKey = `${r},${c}`;
			const fromBg = sd.bgTiles[posKey] ?? TILE.FLOOR;
			floodFillBg(sd, c, r, fromBg, state.selectedTile);
		} else {
			floodFill(sd, c, r, sd.tiles[r][c], state.selectedTile);
		}
	}
	renderStageCanvas();
}

// ── タイルに紐づくメタデータを削除するユーティリティ ──────────
// タイルを消去・上書きするときにメタデータも合わせて削除する
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
	// showConditions は MAP_ENTER・DOORWAY_LOCKED と連動することがあるため削除
	if (tile === TILE.MAP_ENTER || tile === TILE.DOORWAY_LOCKED) {
		delete sd.showConditions?.[posKey];
	}
}

// bgTiles 用フラッドフィル
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

canvas.addEventListener('mousedown', () => {
	if (_previewPending) return; // 位置指定モード中は描画開始しない
	state.isDrawing = true;
});
canvas.addEventListener('click',     e => {
	if (_previewPending) return; // プレイヤー位置指定モード中はタイル描画しない
	const { c, r } = getCellFromEvent(e);
	applyTool(c, r);
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
		applyTool(c, r);
	}
});
canvas.addEventListener('mouseup',    () => { state.isDrawing = false; renderSidePanel(); });
canvas.addEventListener('mouseleave', () => { state.isDrawing = false; cellInfoEl.textContent = ''; });
document.getElementById('show-neighbors').addEventListener('change', renderStageCanvas);

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
	renderStageCanvas();
	renderSidePanel();
});

// ── ステージ設定 ──────────────────────────────────────────────
document.getElementById('btn-save-stage-settings').addEventListener('click', () => {
	const sd = getCurrentStage();
	if (!sd) return;
	sd.isBossRoom = document.getElementById('stage-is-boss-room').checked;
	const bgmVal  = document.getElementById('stage-bgm-override').value;
	if (bgmVal) sd.bgm = bgmVal;
	else delete sd.bgm;
	renderWorldGrid(); // ボス部屋マーク更新
	alert('ステージ設定を保存しました');
});

// ── 右パネル（ゲート・宝箱・NPC・ショップ・MAP_ENTER・条件・壊せる壁・ドアウェイ） ──
function renderSidePanel() {
	const sd = getCurrentStage();
	if (!sd) return;
	renderLinks(sd);
	renderEquipItems(sd);
	renderChests(sd);
	renderNPCs(sd);
	renderShops(sd);
	renderMapEnters(sd);
	renderConditions(sd);
	renderBreakableWalls(sd);
	renderDoorways(sd);
}

// ── ゲート/スイッチリンク ──────────────────────────────────────
function renderLinks(sd) {
	const el = document.getElementById('links-list');
	el.innerHTML = '';
	(sd.links ?? []).forEach((link, i) => {
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header">
				<span>連動 #${i+1}</span>
				<button class="btn btn-sm btn-danger">削除</button>
			</div>
			<label>ゲートID（行,列）<input type="text" value="${link.gateId ?? ''}" data-field="gateId" data-idx="${i}" placeholder="例: 3,5"></label>
			<label>スイッチID（行,列）<input type="text" value="${link.switchId ?? ''}" data-field="switchId" data-idx="${i}" placeholder="例: 5,3"></label>
		`;
		item.querySelector('.btn-danger').addEventListener('click', () => { sd.links.splice(i, 1); renderLinks(sd); });
		item.querySelectorAll('input').forEach(inp => {
			inp.addEventListener('input', () => { sd.links[parseInt(inp.dataset.idx)][inp.dataset.field] = inp.value; });
		});
		el.appendChild(item);
	});
}
document.getElementById('btn-add-link').addEventListener('click', () => {
	const sd = getCurrentStage(); if (!sd) return;
	if (!sd.links) sd.links = [];
	sd.links.push({ gateId: '', switchId: '' });
	renderLinks(sd);
});

// ── 剣・防具のフロアアイテム設定 ────────────────────────────
// ITEM_SWORD → atkBonus、ITEM_ARMOR → defBonus を floorItems に保存
function renderEquipItems(sd) {
	// 既存の宝箱設定パネルの直前に挿入する独立パネル
	const el = document.getElementById('equip-flooritems-list');
	if (!el) return;
	el.innerHTML = '';
	const swordItems = findTilePositions(sd, TILE.ITEM_SWORD).map(p => ({ ...p, tile: TILE.ITEM_SWORD }));
	const armorItems = findTilePositions(sd, TILE.ITEM_ARMOR).map(p => ({ ...p, tile: TILE.ITEM_ARMOR }));
	const allItems   = [...swordItems, ...armorItems];
	if (!allItems.length) { el.innerHTML = '<div class="hint">剣・防具なし</div>'; return; }
	for (const { r, c, tile } of allItems) {
		const key  = `${r},${c}`;
		const data = sd.floorItems?.[key] ?? {};
		const isSword = tile === TILE.ITEM_SWORD;
		const label   = isSword ? `⚔ 剣 (${r},${c})` : `⚚ 防具 (${r},${c})`;
		const field   = isSword ? 'atkBonus' : 'defBonus';
		const stat    = isSword ? 'ATK+' : 'DEF+';
		const defVal  = data[field] ?? (isSword ? 2 : 2);
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>${label}</span></div>
			<label>名前 <input type="text" value="${data.name ?? ''}" data-key="${key}" data-f="name" placeholder="例: 光の剣"></label>
			<label>${stat}ボーナス <input type="number" min="1" max="99" value="${defVal}" data-key="${key}" data-f="${field}"></label>
		`;
		item.querySelectorAll('input').forEach(inp => {
			inp.addEventListener('input', e => {
				if (!sd.floorItems) sd.floorItems = {};
				if (!sd.floorItems[key]) sd.floorItems[key] = {};
				const f = inp.dataset.f;
				sd.floorItems[key][f] = (f === field) ? (parseInt(inp.value, 10) || 1) : inp.value;
			});
		});
		el.appendChild(item);
	}
}

// ── 宝箱の内容 ────────────────────────────────────────────────
const CHEST_ITEM_OPTIONS = [
	{ value: 'healPotion',    label: '回復薬（小）' },
	{ value: 'bigHealPotion', label: '回復薬（大）' },
	{ value: 'boomerang',     label: 'ブーメラン' },
	{ value: 'bomb',          label: '爆弾' },
	{ value: 'bow',           label: '弓矢' },
	{ value: 'heartContainer',label: 'ハートコンテナ' },
	{ value: 'dungeonMap',    label: 'ダンジョン地図' },
	{ value: 'compass',       label: 'コンパス' },
];
const CHEST_TYPE_OPTIONS = [
	{ value: 'item',   label: 'アイテム（サブ）' },
	{ value: 'weapon', label: '武器（剣）' },
	{ value: 'armor',  label: '防具' },
	{ value: 'rupee',  label: 'ルピー' },
	{ value: 'heartContainer', label: 'ハートコンテナ' },
];

function renderChests(sd) {
	const el = document.getElementById('chest-list');
	el.innerHTML = '';
	const chests = findTilePositions(sd, TILE.CHEST);
	if (!chests.length) { el.innerHTML = '<div class="hint">宝箱なし</div>'; return; }
	for (const { r, c } of chests) {
		const key  = `${r},${c}`;
		const cont = sd.chestContents?.[key] ?? { type: 'item', item: 'healPotion', name: '', value: 0, count: 1 };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>宝箱 (${r},${c})</span></div>
			<label>種類
				<select data-key="${key}" data-f="type">
					${CHEST_TYPE_OPTIONS.map(o => `<option value="${o.value}"${cont.type===o.value?' selected':''}>${o.label}</option>`).join('')}
				</select>
			</label>
			<label class="item-id-row" style="${cont.type==='item'?'':'display:none'}">アイテム
				<select data-key="${key}" data-f="item">
					${CHEST_ITEM_OPTIONS.map(o => `<option value="${o.value}"${cont.item===o.value?' selected':''}>${o.label}</option>`).join('')}
				</select>
			</label>
			<label>個数 <input type="number" min="1" max="99" value="${cont.count??1}" data-key="${key}" data-f="count"></label>
			<label>名前 <input type="text" value="${cont.name??''}" data-key="${key}" data-f="name" placeholder="（省略可）"></label>
			<label>値（ルピー等）<input type="number" min="0" value="${cont.value??0}" data-key="${key}" data-f="value"></label>
		`;
		// 種類変更で item-id-row の表示切り替え
		item.querySelector('select[data-f="type"]').addEventListener('change', e => {
			if (!sd.chestContents) sd.chestContents = {};
			if (!sd.chestContents[key]) sd.chestContents[key] = {};
			sd.chestContents[key].type = e.target.value;
			item.querySelector('.item-id-row').style.display = e.target.value === 'item' ? '' : 'none';
		});
		item.querySelectorAll('[data-f]:not([data-f="type"])').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.chestContents) sd.chestContents = {};
				if (!sd.chestContents[key]) sd.chestContents[key] = {};
				const f = inp.dataset.f;
				sd.chestContents[key][f] = (f === 'count' || f === 'value') ? parseInt(inp.value,10) : inp.value;
			});
		});
		el.appendChild(item);
	}
}

// ── NPC 会話設定（SIGN含む） ───────────────────────────────────
function renderNPCs(sd) {
	const el = document.getElementById('npc-list');
	el.innerHTML = '';
	const npcTiles = [TILE.NPC_A, TILE.NPC_B, TILE.PRINCESS, TILE.SIGN];
	const npcs = npcTiles.flatMap(t => findTilePositions(sd, t).map(p => ({ ...p, tile: t })));
	if (!npcs.length) { el.innerHTML = '<div class="hint">NPC・看板なし</div>'; return; }
	for (const { r, c, tile } of npcs) {
		const key  = `${r},${c}`;
		const data = sd.npcData?.[key] ?? { name: '', lines: [] };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>NPC (${r},${c}) ${TILE_META[tile]?.icon??''}</span></div>
			<label>キャラ名 <input type="text" value="${data.name??''}" data-key="${key}" data-f="name" placeholder="例: 村人 タロ"></label>
			<label>スプライト
				<select data-key="${key}" data-f="sprite">
					<option value="npcA" ${(data.sprite??'npcA')==='npcA'?'selected':''}>npcA（村人）</option>
					<option value="npcB" ${(data.sprite??'')==='npcB'?'selected':''}>npcB（商人）</option>
					<option value="princess" ${(data.sprite??'')==='princess'?'selected':''}>princess（姫）</option>
				</select>
			</label>
			<label>セリフ（1行=1ページ）
				<textarea data-key="${key}" data-f="lines" rows="4">${(data.lines??[]).join('\n')}</textarea>
			</label>
		`;
		item.querySelectorAll('[data-key]').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.npcData) sd.npcData = {};
				if (!sd.npcData[key]) sd.npcData[key] = { name: '', lines: [] };
				const f = inp.dataset.f;
				if (f === 'lines') {
					sd.npcData[key].lines = inp.value.split('\n').filter(l => l.trim());
				} else {
					sd.npcData[key][f] = inp.value;
				}
			});
		});
		el.appendChild(item);
	}
}

// ── ショップ設定 ───────────────────────────────────────────────
function renderShops(sd) {
	const el = document.getElementById('shop-list');
	el.innerHTML = '';
	const shops = findTilePositions(sd, TILE.NPC_SHOP);
	if (!shops.length) { el.innerHTML = '<div class="hint">ショップ NPC なし</div>'; return; }
	for (const { r, c } of shops) {
		const key  = `${r},${c}`;
		const data = sd.shopData?.[key] ?? { name: '道具屋', items: [] };
		const item = document.createElement('div');
		item.className = 'link-item';
		const itemsJson = JSON.stringify(data.items ?? [], null, 2);
		item.innerHTML = `
			<div class="link-item-header"><span>ショップ (${r},${c})</span></div>
			<label>店名 <input type="text" value="${data.name??''}" data-key="${key}" data-f="name"></label>
			<label>商品リスト（JSON）
				<textarea data-key="${key}" data-f="items" rows="6" style="font-family:monospace;font-size:0.65rem">${itemsJson}</textarea>
			</label>
		`;
		item.querySelectorAll('[data-key]').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.shopData) sd.shopData = {};
				if (!sd.shopData[key]) sd.shopData[key] = { name: '', items: [] };
				const f = inp.dataset.f;
				if (f === 'items') {
					try { sd.shopData[key].items = JSON.parse(inp.value); } catch { /* invalid JSON */ }
				} else {
					sd.shopData[key][f] = inp.value;
				}
			});
		});
		el.appendChild(item);
	}
}

// ── MAP_ENTER 出口設定 ─────────────────────────────────────────
function renderMapEnters(sd) {
	const el = document.getElementById('mapenter-list');
	el.innerHTML = '';
	const enters = findTilePositions(sd, TILE.MAP_ENTER);
	if (!enters.length) { el.innerHTML = '<div class="hint">MAP_ENTER なし</div>'; return; }
	for (const { r, c } of enters) {
		const key  = `${r},${c}`;
		const data = sd.mapEnters?.[key] ?? { id: '', destId: '' };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>出口 (${r},${c})</span></div>
			<label>出口ID（このMAP_ENTERのID） <input type="text" value="${data.id??''}" data-key="${key}" data-f="id" placeholder="半角英数字（例: town_to_dungeon）"></label>
			<label>遷移先ID（どこに繋ぐか） <input type="text" value="${data.destId??''}" data-key="${key}" data-f="destId" placeholder="接続先の出口ID（例: dungeon_to_town）"></label>
		`;
		item.querySelectorAll('[data-key]').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.mapEnters) sd.mapEnters = {};
				if (!sd.mapEnters[key]) sd.mapEnters[key] = { id: '', destId: '' };
				sd.mapEnters[key][inp.dataset.f] = inp.value;
			});
		});
		el.appendChild(item);
	}
}

// ── 表示条件（showConditions）設定 ───────────────────────────
const TRIGGER_OPTIONS = [
	{ value: 'killAll',     label: '敵全滅（killAll）' },
	{ value: 'killGroup',   label: '指定グループ全滅（killGroup）' },
	{ value: 'switchOn',    label: 'スイッチON（switchOn）' },
	{ value: 'allSwitchesOn', label: '全スイッチON（allSwitchesOn）' },
	{ value: 'wallBroken',  label: '壁破壊（wallBroken）' },
	{ value: 'hasItem',     label: 'アイテム所持（hasItem）' },
];

function renderConditions(sd) {
	const el = document.getElementById('condition-list');
	el.innerHTML = '';
	const conds = sd.showConditions ?? {};
	if (!Object.keys(conds).length) { el.innerHTML = '<div class="hint">条件なし</div>'; }
	for (const [posKey, cond] of Object.entries(conds)) {
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header">
				<span>位置 ${posKey} <span class="cond-badge">${cond.trigger}</span></span>
				<button class="btn btn-sm btn-danger">削除</button>
			</div>
			<label>対象座標（行,列）<input type="text" value="${posKey}" data-f="posKey" readonly></label>
			<label>トリガー
				<select data-f="trigger">
					${TRIGGER_OPTIONS.map(o => `<option value="${o.value}"${cond.trigger===o.value?' selected':''}>${o.label}</option>`).join('')}
				</select>
			</label>
			<label class="extra-param">追加パラメータ（JSON）
				<input type="text" value="${extraCondParam(cond)}" data-f="extra" placeholder="例: {&quot;switchId&quot;:&quot;3,4&quot;}">
			</label>
		`;
		item.querySelector('.btn-danger').addEventListener('click', () => {
			delete sd.showConditions[posKey];
			renderConditions(sd);
		});
		item.querySelector('[data-f="trigger"]').addEventListener('change', e => {
			sd.showConditions[posKey].trigger = e.target.value;
		});
		item.querySelector('[data-f="extra"]').addEventListener('input', e => {
			try {
				const extra = JSON.parse(e.target.value || '{}');
				Object.assign(sd.showConditions[posKey], extra);
			} catch { /* invalid JSON */ }
		});
		el.appendChild(item);
	}
}

function extraCondParam(cond) {
	const extra = {};
	for (const [k, v] of Object.entries(cond)) {
		if (k === 'trigger') continue;
		extra[k] = v;
	}
	return Object.keys(extra).length ? JSON.stringify(extra) : '';
}

document.getElementById('btn-add-condition').addEventListener('click', () => {
	const sd = getCurrentStage(); if (!sd) return;
	const posKey = prompt('対象セルの座標（行,列）を入力してください（例: 3,5）');
	if (!posKey || !/^\d+,\d+$/.test(posKey)) return;
	if (!sd.showConditions) sd.showConditions = {};
	sd.showConditions[posKey] = { trigger: 'killAll' };
	renderConditions(sd);
});

// ── 壊せる壁 設定 ─────────────────────────────────────────────
function renderBreakableWalls(sd) {
	const el = document.getElementById('breakwall-list');
	el.innerHTML = '';
	const walls = findTilePositions(sd, TILE.BREAKABLE_WALL);
	if (!walls.length) { el.innerHTML = '<div class="hint">壊せる壁なし</div>'; return; }
	for (const { r, c } of walls) {
		const key  = `${r},${c}`;
		const data = sd.breakableWalls?.[key] ?? { breakDef: 2 };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>壊せる壁 (${r},${c})</span></div>
			<label>breakDef（強度）
				<select data-key="${key}">
					<option value="1" ${data.breakDef===1?'selected':''}>1（軽い）</option>
					<option value="2" ${(data.breakDef??2)===2?'selected':''}>2（中）爆弾で破壊可</option>
					<option value="3" ${data.breakDef===3?'selected':''}>3（重い）強力な爆弾のみ</option>
				</select>
			</label>
		`;
		item.querySelector('select').addEventListener('change', e => {
			if (!sd.breakableWalls) sd.breakableWalls = {};
			if (!sd.breakableWalls[key]) sd.breakableWalls[key] = {};
			sd.breakableWalls[key].breakDef = parseInt(e.target.value, 10);
		});
		el.appendChild(item);
	}
}

// ── ドアウェイ設定（Phase 6.5） ───────────────────────────────
function renderDoorways(sd) {
	const el = document.getElementById('doorway-list');
	el.innerHTML = '';
	const locked = findTilePositions(sd, TILE.DOORWAY_LOCKED);
	const boss   = findTilePositions(sd, TILE.DOORWAY_BOSS);
	const all    = [...boss.map(p => ({...p, type:'boss'})), ...locked.map(p => ({...p, type:'locked'}))];

	if (!all.length) { el.innerHTML = '<div class="hint">ドアウェイなし</div>'; }

	for (const { r, c, type } of all) {
		const key  = `${r},${c}`;
		const item = document.createElement('div');
		item.className = 'link-item';
		if (type === 'boss') {
			item.innerHTML = `
				<div class="link-item-header"><span>BOSS扉 (${r},${c}) 🔒</span></div>
				<p class="hint" style="margin:2px 0">ボス入室で自動ロック・撃破で自動解除</p>
			`;
		} else {
			const cond = (sd.showConditions ?? {})[key] ?? null;
			const condText = cond ? `${cond.trigger}` : '（条件なし）';
			item.innerHTML = `
				<div class="link-item-header">
					<span>条件扉 (${r},${c}) <span class="cond-badge">${condText}</span></span>
					<button class="btn btn-sm" data-action="set-cond">条件設定</button>
				</div>
				<p class="hint" style="margin:2px 0">表示条件パネルで条件を設定すると連動して開きます</p>
			`;
			item.querySelector('[data-action="set-cond"]').addEventListener('click', () => {
				if (!sd.showConditions) sd.showConditions = {};
				if (!sd.showConditions[key]) {
					sd.showConditions[key] = { trigger: 'killAll' };
				}
				renderConditions(sd);
				// 条件パネルまでスクロール
				document.getElementById('condition-list').closest('.props-section')
					.scrollIntoView({ behavior: 'smooth' });
			});
		}
		el.appendChild(item);
	}
}

document.getElementById('btn-add-doorway-cond').addEventListener('click', () => {
	const sd = getCurrentStage(); if (!sd) return;
	const posKey = prompt('DOORWAY_LOCKED の座標（行,列）を入力してください（例: 4,9）');
	if (!posKey || !/^\d+,\d+$/.test(posKey)) return;
	if (!sd.showConditions) sd.showConditions = {};
	sd.showConditions[posKey] = { trigger: 'killAll' };
	renderConditions(sd);
	renderDoorways(sd);
});

// ── 保存・読み込み ────────────────────────────────────────────
function buildSaveData() {
	// startPos：fieldレイヤーの最初のステージのPLAYERタイル位置
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

function loadMapData(data) {
	if (!data || !data.layers) { alert('データ形式が無効です'); return; }
	state.mapData     = { version: data.version ?? 1, layers: data.layers };
	state.currentLayer = 'field';
	state.currentCoord = null;
	renderLayerTabs();
	renderDungeonMeta();
	document.getElementById('world-cols').value = 3;
	document.getElementById('world-rows').value = 3;
	renderWorldGrid();
	showView('world');
}

// File System Access API で保存
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

document.getElementById('btn-save').addEventListener('click', async () => {
	const json = JSON.stringify(buildSaveData(), null, 2);
	localStorage.setItem('bladeOfLumiaMapData', json);

	const saved = await saveToFile(json);
	if (saved) {
		alert('work/blade-of-lumia.json に保存しました！');
		return;
	}
	// フォールバック：ダウンロード
	const blob = new Blob([json], { type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'blade-of-lumia.json';
	a.click();
	alert('保存しました！（ダウンロードされたファイルを work/ に配置してください）');
});

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
				loadMapData(data);
				localStorage.setItem('bladeOfLumiaMapData', ev.target.result);
			} catch {
				alert('JSON の読み込みに失敗しました');
			}
		};
		reader.readAsText(file);
	});
	input.click();
});

function tryRestoreFromStorage() {
	const saved = localStorage.getItem('bladeOfLumiaMapData');
	if (saved) {
		try { loadMapData(JSON.parse(saved)); } catch { /* 無視 */ }
	}
}

// ── プレビュー ────────────────────────────────────────────────
let _previewPending = false;

// ── プレビュー設定ダイアログ ──────────────────────────────────
let _previewStartCoord = null; // ステージビューで位置を選んでから設定ダイアログを出す場合に保持

function showPreviewSettingsDialog(onStart) {
	const overlay = document.getElementById('preview-settings-overlay');
	overlay.classList.remove('hidden');
	// OKボタン
	const btnStart = document.getElementById('ps-btn-start');
	const btnCancel = document.getElementById('ps-btn-cancel');
	// イベント重複防止のため一旦クローン差し替え
	const newStart = btnStart.cloneNode(true);
	const newCancel = btnCancel.cloneNode(true);
	btnStart.replaceWith(newStart);
	btnCancel.replaceWith(newCancel);

	newStart.addEventListener('click', () => {
		overlay.classList.add('hidden');
		const ps = getPreviewSettings();
		onStart(ps);
	});
	newCancel.addEventListener('click', () => {
		overlay.classList.add('hidden');
		// ステージビューの位置指定モードをリセット
		_previewPending = false;
		canvas.style.cursor  = '';
		canvas.style.outline = '';
		if (cellInfoEl) cellInfoEl.textContent = '';
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
		cleared:   document.getElementById('ps-cleared').checked,
	};
}

document.getElementById('btn-preview').addEventListener('click', () => {
	if (!state.currentCoord) {
		// ステージ選択がなければワールドマップから最初のステージを使う
		const stages = getCurrentStages();
		const firstKey = Object.keys(stages)[0];
		if (!firstKey) { alert('ステージを選択してください'); return; }
		const [x, y] = firstKey.split(',').map(Number);
		state.currentCoord = { x, y };
	}
	// 現在の状態をlocalStorageに保存
	const json = JSON.stringify(buildSaveData(), null, 2);
	localStorage.setItem('bladeOfLumiaMapData', json);

	if (viewStageEl.classList.contains('hidden')) {
		// ワールドビューからの場合：設定ダイアログを表示してからプレビュー
		showPreviewSettingsDialog(ps => {
			openPreview(state.currentCoord.x, state.currentCoord.y, 1, 1, ps);
		});
	} else {
		// ステージビューからの場合：まず位置指定、その後ダイアログ
		_previewPending = true;
		canvas.style.cursor  = 'crosshair';
		canvas.style.outline = '3px solid #f0c040';
		cellInfoEl.textContent = '▶ クリックした位置からプレビューを開始します';
	}
});

canvas.addEventListener('click', e => {
	if (!_previewPending) return;
	// 位置指定モードのクリックは描画ハンドラーに伝播させない
	e.stopImmediatePropagation();
	_previewPending = false;
	canvas.style.cursor  = '';
	canvas.style.outline = '';
	cellInfoEl.textContent = '';
	const { c, r } = getCellFromEvent(e);
	// 位置確定後にプレビュー設定ダイアログを表示
	showPreviewSettingsDialog(ps => {
		openPreview(state.currentCoord.x, state.currentCoord.y, r, c, ps);
	});
}, true);

function openPreview(stX, stY, row, col, ps) {
	const json = JSON.stringify(buildSaveData(), null, 2);
	localStorage.setItem('bladeOfLumiaMapData', json);
	const overlayEl = document.getElementById('preview-overlay');
	const frameEl   = document.getElementById('preview-frame');

	// プレビュー設定パラメータをURLに追加
	// &t= でキャッシュを防止（毎回確実に再読み込み）
	let url = `../game/index.html?layer=${encodeURIComponent(state.currentLayer)}&stage=${stX},${stY}&row=${row}&col=${col}&fromEditor=1&t=${Date.now()}`;
	if (ps) {
		url += `&ps_atk=${ps.atk}&ps_def=${ps.def}&ps_rupees=${ps.rupees}&ps_triforce=${ps.triforce}`;
		url += `&ps_weapon=${ps.weapon?1:0}&ps_shield=${ps.shield?1:0}&ps_armor=${ps.armor?1:0}`;
		url += `&ps_bow=${ps.bow?1:0}&ps_boomerang=${ps.boomerang?1:0}&ps_cleared=${ps.cleared?1:0}`;
	}
	console.log('[Editor] openPreview URL:', url);
	console.log('[Editor] ps settings:', ps);
	// iframe を確実にリロードするため一旦 about:blank に
	frameEl.src = 'about:blank';
	requestAnimationFrame(() => {
		frameEl.src = url;
		overlayEl.classList.remove('hidden');
	});
}

document.getElementById('btn-exit-preview').addEventListener('click', () => {
	document.getElementById('preview-overlay').classList.add('hidden');
	document.getElementById('preview-frame').src = '';
	// プレビュー待機状態を必ずリセット
	_previewPending = false;
	canvas.style.cursor  = '';
	canvas.style.outline = '';
	cellInfoEl.textContent = '';
});

// ── アニメーションループ ──────────────────────────────────────
startAnimLoop(() => {
	// パレット・キャンバスのスプライトを再描画
	buildTilePalette();
	if (!viewStageEl.classList.contains('hidden')) renderStageCanvas();
});

// ── 初期化 ────────────────────────────────────────────────────
function init() {
	buildTilePalette();
	updateToolButtons();
	tryRestoreFromStorage();
	renderLayerTabs();
	renderDungeonMeta();
	renderWorldGrid();
	showView('world');
}

init();

// ── Dungeon World Map Editor ─────────────────────────────────
import { TILE, TILE_META, TILE_LIST, DEFAULT_COLS, DEFAULT_ROWS, makeEmptyStage, makeEmptyWorld } from '../shared/tiles.js';
import { SPRITES, PAL, drawSprite, animFrame, startAnimLoop } from '../shared/sprites.js';

// ── State ─────────────────────────────────────────────────────
const state = {
	world: makeEmptyWorld(3, 4),      // ワールドマップ情報（3列×4行）
	stages: {},                        // { "x,y": stageData } 全ステージデータ
	currentCoord: null,                // 現在編集中のステージ座標 { x, y }
	selectedTile: TILE.WALL,           // 選択中のタイル
	currentTool: 'draw',               // draw | erase | fill
	isDrawing: false,                  // マウスドラッグ中フラグ
	endingStageOrder: [],              // エンディングステージ表示順 ["1,1","2,1",...] 空なら自動
};

// ── Canvas ────────────────────────────────────────────────────
const canvas = document.getElementById('stage-canvas');
const canvasCtx = canvas.getContext('2d');
const CELL_SIZE = 40; // px per cell

// ── DOM refs ──────────────────────────────────────────────────
const viewWorld    = document.getElementById('view-world');
const viewStage    = document.getElementById('view-stage');
const tabWorld     = document.getElementById('tab-world');
const tabStage     = document.getElementById('tab-stage');
const worldGrid    = document.getElementById('world-grid');
const tilePalette  = document.getElementById('tile-palette');
const linksListEl  = document.getElementById('links-list');
const chestListEl  = document.getElementById('chest-list');
const stageLabel   = document.getElementById('stage-coord-label');
const stageInfoEl  = document.getElementById('stage-info');
const borderWarnEl = document.getElementById('border-warnings');
const cellInfoEl   = document.getElementById('cell-info');

// ── Tab switching ─────────────────────────────────────────────
function showView(view) {
	if (view === 'world') {
		viewWorld.classList.remove('hidden');
		viewStage.classList.add('hidden');
		tabWorld.classList.add('active');
		tabStage.classList.remove('active');
		renderWorldGrid();
	} else {
		viewWorld.classList.add('hidden');
		viewStage.classList.remove('hidden');
		tabWorld.classList.remove('active');
		tabStage.classList.add('active');
		renderStageCanvas();
		renderSidePanel();
	}
}
tabWorld.addEventListener('click', () => showView('world'));
tabStage.addEventListener('click', () => showView('stage'));

// ── World Map ─────────────────────────────────────────────────

// ミニマップ描画（12×12px canvas → CSS で 80×80 に拡大）
const MINIMAP_TILE_COLORS = {
	[TILE.WALL]:   '#3a4448',
	[TILE.FLOOR]:  '#1a2228',
	[TILE.WATER]:  '#0e2040',
	[TILE.PLAYER]: '#4cd964',
	[TILE.PATROL]: '#4888c0',
	[TILE.CHASER]: '#c03030',
	[TILE.SENTRY]:    '#9040c0',
	[TILE.BOSS]:      '#f0c040',
	[TILE.DARK_LORD]: '#8800ff',
	[TILE.PRINCESS]:  '#ff66aa',
	[TILE.GATE]:   '#1a2c40',
	[TILE.SWITCH]: '#5a9a40',
	[TILE.DOOR]:   '#9b7048',
	[TILE.KEY]:    '#f2c14e',
	[TILE.CHEST]:  '#c09060',
	[TILE.STONE]:  '#6a7470',
};

function drawMinimap(stage) {
	const { rows, cols, tiles } = stage;
	const cv = document.createElement('canvas');
	cv.width  = cols;
	cv.height = rows;
	cv.className = 'minimap-canvas';
	const ctx = cv.getContext('2d');
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const t = tiles[r][c];
			ctx.fillStyle = MINIMAP_TILE_COLORS[t] ?? '#1a2228';
			ctx.fillRect(c, r, 1, 1);
		}
	}
	return cv;
}

// ── 行・列挿入ヘルパー ────────────────────────────────────────

/** insertY の位置に行を挿入（insertY 以降の y をすべて +1 シフト） */
function insertRow(insertY) {
	// y >= insertY のステージを y+1 にリネーム（降順処理でキー衝突を防ぐ）
	const keys = Object.keys(state.stages)
		.map(k => { const [x, y] = k.split(',').map(Number); return { k, x, y }; })
		.filter(e => e.y >= insertY)
		.sort((a, b) => b.y - a.y); // 降順
	for (const { k, x, y } of keys) {
		state.stages[`${x},${y + 1}`] = state.stages[k];
		delete state.stages[k];
	}
	state.world.worldRows += 1;
	// 選択中座標を追従
	if (state.currentCoord && state.currentCoord.y >= insertY) {
		state.currentCoord.y += 1;
	}
	renderWorldGrid();
}

/** insertX の位置に列を挿入（insertX 以降の x をすべて +1 シフト） */
function insertCol(insertX) {
	const keys = Object.keys(state.stages)
		.map(k => { const [x, y] = k.split(',').map(Number); return { k, x, y }; })
		.filter(e => e.x >= insertX)
		.sort((a, b) => b.x - a.x);
	for (const { k, x, y } of keys) {
		state.stages[`${x + 1},${y}`] = state.stages[k];
		delete state.stages[k];
	}
	state.world.worldCols += 1;
	if (state.currentCoord && state.currentCoord.x >= insertX) {
		state.currentCoord.x += 1;
	}
	renderWorldGrid();
}

function renderWorldGrid() {
	const { worldCols, worldRows } = state.world;
	// グリッドは「挿入ボタン行/列」も含めた構造で構築
	// 列レイアウト: [insBtn] [cell] [insBtn] [cell] ... [insBtn]
	// 行レイアウト: insBtn行 / cell行 / insBtn行 / cell行 / ... insBtn行
	const totalCols = worldCols * 2 + 1; // 挿入ボタン列込み
	worldGrid.style.gridTemplateColumns = `18px repeat(${worldCols}, 100px 18px)`;
	worldGrid.innerHTML = '';

	// 行ループ：各行の前に「行挿入ボタン行」を挿入
	for (let y = 0; y <= worldRows; y++) {
		// ── 行挿入ボタン行 ──────────────────────────────────────
		// 列挿入ボタンの上部スペーサー
		const rowBtnCorner = document.createElement('div');
		rowBtnCorner.style.cssText = 'height:18px;';
		worldGrid.appendChild(rowBtnCorner);

		for (let x = 0; x < worldCols; x++) {
			const rowInsertBtn = document.createElement('button');
			rowInsertBtn.className = 'world-insert-btn world-insert-row';
			rowInsertBtn.title = `${y}行目の上に行を挿入`;
			rowInsertBtn.textContent = '＋';
			const capturedY = y;
			rowInsertBtn.addEventListener('click', () => insertRow(capturedY));
			worldGrid.appendChild(rowInsertBtn);

			// 行区切りのスペーサー（右の列挿入ボタン分）
			const rowBtnSpacer = document.createElement('div');
			rowBtnSpacer.style.cssText = 'height:18px;';
			worldGrid.appendChild(rowBtnSpacer);
		}

		if (y === worldRows) break; // 最後の行の下の挿入ボタン行まで描いたら終了

		// ── ステージセル行 ─────────────────────────────────────
		for (let x = 0; x <= worldCols; x++) {
			// 列挿入ボタン
			const colInsertBtn = document.createElement('button');
			colInsertBtn.className = 'world-insert-btn world-insert-col';
			colInsertBtn.title = `${x}列目の左に列を挿入`;
			colInsertBtn.textContent = '＋';
			const capturedX = x;
			colInsertBtn.addEventListener('click', () => insertCol(capturedX));
			worldGrid.appendChild(colInsertBtn);

			if (x === worldCols) break;

			const key = `${x},${y}`;
			const hasStage = !!state.stages[key];
			const isSelected = state.currentCoord && state.currentCoord.x === x && state.currentCoord.y === y;

			const cell = document.createElement('div');
			cell.className = 'world-cell' + (hasStage ? ' has-stage' : '') + (isSelected ? ' selected' : '');

			if (hasStage) {
				const minimap = drawMinimap(state.stages[key]);
				cell.appendChild(minimap);
				const coordEl = document.createElement('div');
				coordEl.className = 'cell-coord';
				coordEl.textContent = `(${x},${y})`;
				cell.appendChild(coordEl);
			} else {
				const empty = document.createElement('div');
				empty.className = 'cell-empty';
				empty.textContent = '＋';
				const addLabel = document.createElement('div');
				addLabel.className = 'cell-add-label';
				addLabel.textContent = `(${x},${y})`;
				cell.appendChild(empty);
				cell.appendChild(addLabel);
			}

			cell.addEventListener('click', () => {
				if (!hasStage) {
					state.stages[key] = makeEmptyStage(DEFAULT_COLS, DEFAULT_ROWS);
				}
				state.currentCoord = { x, y };
				renderWorldGrid();
				updateWorldSidePanel(x, y);
			});

			worldGrid.appendChild(cell);
		}
	}

	if (state.currentCoord) {
		updateWorldSidePanel(state.currentCoord.x, state.currentCoord.y);
	}
}

// サイドパネル更新
function updateWorldSidePanel(x, y) {
	const key = `${x},${y}`;
	const stage = state.stages[key];
	const infoEl    = document.getElementById('world-stage-info');
	const actionsEl = document.getElementById('world-stage-actions');
	const previewWrap = document.getElementById('world-preview-wrap');
	if (!stage) {
		infoEl.innerHTML = '<p class="hint">ステージを選択してください</p>';
		actionsEl.classList.add('hidden');
		previewWrap.classList.add('hidden');
		return;
	}
	const enemyCount   = countTileInStage(stage, [TILE.PATROL, TILE.CHASER, TILE.SENTRY, TILE.BOSS]);
	const playerCount  = countTileInStage(stage, [TILE.PLAYER]);
	const chestCount   = countTileInStage(stage, [TILE.CHEST]);
	const keyCount     = countTileInStage(stage, [TILE.KEY]);
	const gateCount    = countTileInStage(stage, [TILE.GATE]);
	const switchCount  = countTileInStage(stage, [TILE.SWITCH]);

	infoEl.innerHTML = `
		<div class="info-row"><span class="info-label">座標</span><span class="info-value">(${x}, ${y})</span></div>
		<div class="info-row"><span class="info-label">サイズ</span><span class="info-value">${stage.cols}×${stage.rows}</span></div>
		<div class="info-row"><span class="info-label">プレイヤー</span><span class="info-value">${playerCount}</span></div>
		<div class="info-row"><span class="info-label">敵</span><span class="info-value">${enemyCount}</span></div>
		<div class="info-row"><span class="info-label">宝箱</span><span class="info-value">${chestCount}</span></div>
		<div class="info-row"><span class="info-label">鍵</span><span class="info-value">${keyCount}</span></div>
		<div class="info-row"><span class="info-label">ゲート</span><span class="info-value">${gateCount}</span></div>
		<div class="info-row"><span class="info-label">スイッチ</span><span class="info-value">${switchCount}</span></div>
	`;
	actionsEl.classList.remove('hidden');

	// フルサイズプレビュー描画（ゲームと同じ 40px/セル）
	drawWorldPreview(stage);
	previewWrap.classList.remove('hidden');
}

// ゲームと同じ 40px/セルでステージをプレビュー描画
const PREVIEW_CELL = 40;
const PREVIEW_TILE_BG = {
	[TILE.WALL]:   '#3a4448',
	[TILE.FLOOR]:  '#1a2228',
	[TILE.WATER]:  '#0e2040',
	[TILE.PLAYER]: '#2a5020',
	[TILE.PATROL]: '#1a3060',
	[TILE.CHASER]: '#3a0808',
	[TILE.SENTRY]: '#2a0840',
	[TILE.BOSS]:   '#1a1a0a',
	[TILE.GATE]:   '#1a2c40',
	[TILE.SWITCH]: '#1a3010',
	[TILE.DOOR]:   '#2a1a08',
	[TILE.KEY]:    '#1a2228',
	[TILE.CHEST]:  '#1a2228',
	[TILE.STONE]:  '#1a2228',
};

function drawWorldPreview(stage) {
	const cv = document.getElementById('world-preview-canvas');
	const { rows, cols, tiles } = stage;
	cv.width  = cols * PREVIEW_CELL;
	cv.height = rows * PREVIEW_CELL;
	const ctx = cv.getContext('2d');

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const t  = tiles[r][c];
			const x  = c * PREVIEW_CELL;
			const y  = r * PREVIEW_CELL;
			ctx.fillStyle = PREVIEW_TILE_BG[t] ?? '#1a2228';
			ctx.fillRect(x, y, PREVIEW_CELL, PREVIEW_CELL);

			// グリッド線
			ctx.strokeStyle = 'rgba(255,255,255,0.04)';
			ctx.lineWidth = 0.5;
			ctx.strokeRect(x + 0.5, y + 0.5, PREVIEW_CELL - 1, PREVIEW_CELL - 1);

			// スプライトがあれば描画
			const sprInfo = TILE_SPRITE_MAP[t];
			if (sprInfo) {
				const frames = SPRITES[sprInfo.spr];
				const palette = PAL[sprInfo.pal] || PAL.hero;
				if (frames) {
					const grid = frames[0]; // frame0 のみ
					const gr = grid.length, gc = grid[0].length;
					const tmp = document.createElement('canvas');
					tmp.width = gc; tmp.height = gr;
					const tctx = tmp.getContext('2d');
					for (let pr = 0; pr < gr; pr++) {
						for (let pc = 0; pc < gc; pc++) {
							const idx = grid[pr][pc];
							if (!idx) continue;
							tctx.fillStyle = palette[idx];
							tctx.fillRect(pc, pr, 1, 1);
						}
					}
					ctx.imageSmoothingEnabled = false;
					ctx.drawImage(tmp, x, y, PREVIEW_CELL, PREVIEW_CELL);
				}
			} else if (t === TILE.PLAYER) {
				// プレイヤー開始位置は緑のマーク
				ctx.fillStyle = '#4cd964';
				ctx.font = `${PREVIEW_CELL * 0.55}px sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('＠', x + PREVIEW_CELL / 2, y + PREVIEW_CELL / 2);
			}
		}
	}
}

function countTileInStage(stage, tileChars) {
	let count = 0;
	for (const row of stage.tiles) {
		for (const cell of row) {
			if (tileChars.includes(cell)) count++;
		}
	}
	return count;
}

document.getElementById('btn-resize-world').addEventListener('click', () => {
	const cols = parseInt(document.getElementById('world-cols').value, 10);
	const rows = parseInt(document.getElementById('world-rows').value, 10);
	if (cols < 1 || rows < 1 || cols > 10 || rows > 10) return;
	state.world.worldCols = cols;
	state.world.worldRows = rows;
	renderWorldGrid();
});

document.getElementById('btn-new-stage').addEventListener('click', () => {
	showView('world');
});

// ワールドマップ：ステージ編集ボタン
document.getElementById('btn-edit-stage').addEventListener('click', () => {
	if (!state.currentCoord) return;
	showView('stage');
});

// ── Tile Palette ──────────────────────────────────────────────
function buildTilePalette() {
	tilePalette.innerHTML = '';
	for (const char of TILE_LIST) {
		const meta = TILE_META[char];
		const btn = document.createElement('button');
		btn.className = 'tile-btn' + (char === state.selectedTile ? ' selected' : '');
		btn.title = meta.label;

		// スプライトがあれば小さい canvas で表示、なければアイコン文字
		const sprInfo = TILE_SPRITE_MAP[char];
		if (sprInfo && SPRITES[sprInfo.spr]) {
			const frames = SPRITES[sprInfo.spr];
			const palette = PAL[sprInfo.pal] || PAL.hero;
			const grid = frames[0];
			const gr = grid.length, gc = grid[0].length;
			const tmp = document.createElement('canvas');
			tmp.width = gc; tmp.height = gr;
			const tctx = tmp.getContext('2d');
			for (let r = 0; r < gr; r++) {
				for (let c = 0; c < gc; c++) {
					const idx = grid[r][c];
					if (!idx) continue;
					tctx.fillStyle = palette[idx];
					tctx.fillRect(c, r, 1, 1);
				}
			}
			// 表示用 canvas（28×28 に拡大）
			const cv = document.createElement('canvas');
			cv.width = 28; cv.height = 28;
			cv.style.imageRendering = 'pixelated';
			cv.style.display = 'block';
			const ctx = cv.getContext('2d');
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(tmp, 0, 0, 28, 28);
			btn.appendChild(cv);
		} else {
			const iconSpan = document.createElement('span');
			iconSpan.className = 'tile-icon';
			iconSpan.textContent = meta.icon;
			btn.appendChild(iconSpan);
		}

		const labelSpan = document.createElement('span');
		labelSpan.className = 'tile-label';
		labelSpan.textContent = meta.label;
		btn.appendChild(labelSpan);

		btn.addEventListener('click', () => {
			state.selectedTile = char;
			state.currentTool = 'draw';
			updateToolButtons();
			buildTilePalette();
		});
		tilePalette.appendChild(btn);
	}
}

// ── Tool buttons ──────────────────────────────────────────────
function updateToolButtons() {
	document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
	document.getElementById(`tool-${state.currentTool}`)?.classList.add('active');
}

['draw', 'erase', 'fill'].forEach(tool => {
	document.getElementById(`tool-${tool}`).addEventListener('click', () => {
		state.currentTool = tool;
		updateToolButtons();
	});
});

// ── Stage Canvas ──────────────────────────────────────────────
function getCurrentStage() {
	if (!state.currentCoord) return null;
	const key = `${state.currentCoord.x},${state.currentCoord.y}`;
	return state.stages[key] || null;
}

function renderStageCanvas() {
	const stage = getCurrentStage();
	if (!stage) return;

	const { cols, rows } = stage;
	canvas.width  = cols * CELL_SIZE;
	canvas.height = rows * CELL_SIZE;

	// 隣接ステージの端行/列を半透明で表示
	if (document.getElementById('show-neighbors').checked) {
		drawNeighborEdges(stage);
	}

	// メインのタイルを描画
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			drawCell(c, r, stage.tiles[r][c]);
		}
	}

	// オブジェクトレイヤーを上乗せ描画（石：スイッチや床の上に重ねて置ける）
	const objects = stage.objects || {};
	for (const [key, objChar] of Object.entries(objects)) {
		const [rowStr, colStr] = key.split(',');
		const objR = parseInt(rowStr, 10);
		const objC = parseInt(colStr, 10);
		const meta = TILE_META[objChar];
		if (!meta) continue;
		const x = objC * CELL_SIZE;
		const y = objR * CELL_SIZE;
		// 石アイコンを描画
		canvasCtx.font = `${CELL_SIZE * 0.55}px sans-serif`;
		canvasCtx.textAlign = 'center';
		canvasCtx.textBaseline = 'middle';
		canvasCtx.fillStyle = '#ffffff';
		canvasCtx.fillText(meta.icon, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
	}

	updateStageInfo(stage);
	updateBorderWarnings(stage);

	if (state.currentCoord) {
		stageLabel.textContent = `ステージ (${state.currentCoord.x}, ${state.currentCoord.y})`;
	}
}

// Links と Chests は別途呼ぶ（アニメーションループから切り離す）
function renderSidePanel() {
	const stage = getCurrentStage();
	if (!stage) return;
	renderLinks(stage);
	renderChests(stage);
}

// タイル種類 → スプライト名・パレット名のマッピング
const TILE_SPRITE_MAP = {
	[TILE.SWITCH]: { spr: 'swG',    pal: 'swG'    },
	[TILE.GATE]:   { spr: 'gateG',  pal: 'gateG'  },
	[TILE.DOOR]:   { spr: 'door',   pal: 'door'   },
	[TILE.KEY]:    { spr: 'key',    pal: 'key'    },
	[TILE.STONE]:  { spr: 'block',  pal: 'block'  },
	[TILE.PATROL]: { spr: 'patrol', pal: 'patrol' },
	[TILE.CHASER]: { spr: 'chaser', pal: 'chaser' },
	[TILE.SENTRY]: { spr: 'sentry', pal: 'sentry' },
	[TILE.BOSS]:      { spr: 'escape',   pal: 'escape'   },
	[TILE.DARK_LORD]: { spr: 'darklord', pal: 'darklord' },
	[TILE.PRINCESS]:  { spr: 'princess', pal: 'princess' },
	[TILE.GUARD]:  { spr: 'guard',  pal: 'guard'  },
	[TILE.CHEST]:  { spr: 'chest',  pal: 'chest'  },
	[TILE.WATER]:  { spr: 'water',  pal: 'water'  },
	[TILE.PLAYER]: { spr: 'heroD',  pal: 'hero'   },
};

// スプライトを一時canvasに描画してからメインcanvasにコピー
function drawSpriteToCanvas(spriteName, palName, destX, destY) {
	const frames = SPRITES[spriteName];
	if (!frames) return false;
	const palette = PAL[palName] || PAL.hero;
	const f = animFrame % frames.length;
	const grid = frames[f];
	const rows = grid.length, cols = grid[0].length;
	// 一時canvas
	const tmp = document.createElement('canvas');
	tmp.width = cols; tmp.height = rows;
	const tctx = tmp.getContext('2d');
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const idx = grid[row][col];
			if (!idx) continue;
			tctx.fillStyle = palette[idx];
			tctx.fillRect(col, row, 1, 1);
		}
	}
	// メインcanvasにスケール描画
	canvasCtx.imageSmoothingEnabled = false;
	canvasCtx.drawImage(tmp, destX, destY, CELL_SIZE, CELL_SIZE);
	return true;
}

function drawCell(c, r, tileChar) {
	const meta = TILE_META[tileChar] || TILE_META[TILE.FLOOR];
	const x = c * CELL_SIZE;
	const y = r * CELL_SIZE;

	// 背景
	canvasCtx.fillStyle = meta.color;
	canvasCtx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

	// グリッド線
	canvasCtx.strokeStyle = 'rgba(0,0,0,0.35)';
	canvasCtx.lineWidth = 0.5;
	canvasCtx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);

	// スプライトがあればスプライトで描画、なければアイコン
	const sprInfo = TILE_SPRITE_MAP[tileChar];
	if (sprInfo) {
		drawSpriteToCanvas(sprInfo.spr, sprInfo.pal, x, y);
	} else if (tileChar !== TILE.FLOOR && tileChar !== TILE.WALL) {
		canvasCtx.font = `${CELL_SIZE * 0.55}px sans-serif`;
		canvasCtx.textAlign = 'center';
		canvasCtx.textBaseline = 'middle';
		canvasCtx.fillStyle = '#fff';
		canvasCtx.fillText(meta.icon, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
	}
}

function drawNeighborEdges(stage) {
	const { x, y } = state.currentCoord;
	const dirs = [
		{ dx: 0, dy: -1, edge: 'top' },
		{ dx: 0, dy:  1, edge: 'bottom' },
		{ dx: -1, dy: 0, edge: 'left' },
		{ dx:  1, dy: 0, edge: 'right' },
	];
	for (const { dx, dy, edge } of dirs) {
		const nx = x + dx, ny = y + dy;
		const nKey = `${nx},${ny}`;
		const neighbor = state.stages[nKey];
		if (!neighbor) continue;

		const { cols, rows } = stage;
		canvasCtx.globalAlpha = 0.25;
		// 隣接ステージの端1行/列を現在のステージの端に重ねて描画
		if (edge === 'top') {
			for (let c = 0; c < cols; c++) {
				drawCell(c, -0.5, neighbor.tiles[neighbor.rows - 1][c]);
			}
		} else if (edge === 'bottom') {
			for (let c = 0; c < cols; c++) {
				drawCell(c, rows - 0.5, neighbor.tiles[0][c]);
			}
		} else if (edge === 'left') {
			for (let r = 0; r < rows; r++) {
				drawCell(-0.5, r, neighbor.tiles[r][neighbor.cols - 1]);
			}
		} else if (edge === 'right') {
			for (let r = 0; r < rows; r++) {
				drawCell(cols - 0.5, r, neighbor.tiles[r][0]);
			}
		}
		canvasCtx.globalAlpha = 1;
	}
}

// ── Canvas mouse events ───────────────────────────────────────
function getCellFromEvent(e) {
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width  / rect.width;
	const scaleY = canvas.height / rect.height;
	const px = (e.clientX - rect.left) * scaleX;
	const py = (e.clientY - rect.top)  * scaleY;
	const c = Math.floor(px / CELL_SIZE);
	const r = Math.floor(py / CELL_SIZE);
	return { c, r };
}

function applyTool(c, r) {
	const stage = getCurrentStage();
	if (!stage) return;
	if (c < 0 || r < 0 || c >= stage.cols || r >= stage.rows) return;
	if (!stage.objects) stage.objects = {};
	const objKey = `${r},${c}`;

	if (state.currentTool === 'draw') {
		if (state.selectedTile === TILE.STONE) {
			// 石はオブジェクトレイヤーに置く（下のタイルはそのまま）
			stage.objects[objKey] = TILE.STONE;
		} else {
			// プレイヤー開始位置はワールド全体で1つだけ
			if (state.selectedTile === TILE.PLAYER) {
				// 全ステージから既存の @ を消す
				for (const stageData of Object.values(state.stages)) {
					for (let pr = 0; pr < stageData.rows; pr++) {
						for (let pc = 0; pc < stageData.cols; pc++) {
							if (stageData.tiles[pr][pc] === TILE.PLAYER) {
								stageData.tiles[pr][pc] = TILE.FLOOR;
							}
						}
					}
				}
			}
			// 通常タイル：オブジェクト（石）があれば先に消す
			delete stage.objects[objKey];
			stage.tiles[r][c] = state.selectedTile;
		}
	} else if (state.currentTool === 'erase') {
		// 石がある → 石だけ消す。石がない → タイルを床に戻す
		if (stage.objects[objKey]) {
			delete stage.objects[objKey];
		} else {
			stage.tiles[r][c] = TILE.FLOOR;
		}
	} else if (state.currentTool === 'fill') {
		floodFill(stage, c, r, stage.tiles[r][c], state.selectedTile);
	}
	renderStageCanvas();
}

function floodFill(stage, startC, startR, fromTile, toTile) {
	if (fromTile === toTile) return;
	const stack = [{ c: startC, r: startR }];
	while (stack.length > 0) {
		const { c, r } = stack.pop();
		if (c < 0 || r < 0 || c >= stage.cols || r >= stage.rows) continue;
		if (stage.tiles[r][c] !== fromTile) continue;
		stage.tiles[r][c] = toTile;
		stack.push({ c: c+1, r }, { c: c-1, r }, { c, r: r+1 }, { c, r: r-1 });
	}
}

canvas.addEventListener('mousedown', e => {
	if (_previewPending) return; // プレビュー位置指定中はツール無効
	state.isDrawing = true;
	const { c, r } = getCellFromEvent(e);
	applyTool(c, r);
});
canvas.addEventListener('mousemove', e => {
	const { c, r } = getCellFromEvent(e);
	const stage = getCurrentStage();
	if (stage && c >= 0 && r >= 0 && c < stage.cols && r < stage.rows) {
		const tile = stage.tiles[r][c];
		if (_previewPending) {
			cellInfoEl.textContent = `▶ クリックして (${c}, ${r}) からゲームを開始`;
		} else {
			cellInfoEl.textContent = `(${c}, ${r}) : ${TILE_META[tile]?.label ?? '?'}`;
		}
	}
	if (!_previewPending && state.isDrawing && state.currentTool !== 'fill') {
		applyTool(c, r);
	}
});
canvas.addEventListener('mouseup',    () => { state.isDrawing = false; renderSidePanel(); });
canvas.addEventListener('mouseleave', () => { state.isDrawing = false; cellInfoEl.textContent = ''; });

document.getElementById('show-neighbors').addEventListener('change', renderStageCanvas);

// ── Stage info & border warnings ──────────────────────────────
function updateStageInfo(stage) {
	const playerCount = countTileInStage(stage, [TILE.PLAYER]);
	const enemyCount  = countTileInStage(stage, [TILE.PATROL, TILE.CHASER, TILE.GUARD]);
	const gateCount   = countTileInStage(stage, [TILE.GATE]);
	const switchCount = countTileInStage(stage, [TILE.SWITCH]);
	const doorCount   = countTileInStage(stage, [TILE.DOOR]);
	const keyCount    = countTileInStage(stage, [TILE.KEY]);
	stageInfoEl.innerHTML = `
		<div>プレイヤー開始: <b>${playerCount}</b></div>
		<div>敵: <b>${enemyCount}</b></div>
		<div>ゲート: <b>${gateCount}</b>　スイッチ: <b>${switchCount}</b></div>
		<div>扉: <b>${doorCount}</b>　鍵: <b>${keyCount}</b></div>
	`;
}

function updateBorderWarnings(stage) {
	if (!state.currentCoord) return;
	const { x, y } = state.currentCoord;
	const warnings = [];
	const dirs = [
		{ dx: 0, dy: -1, myEdge: 'top',    theirEdge: 'bottom', myRow: 0,           theirRow: (n) => n.rows-1, getCol: (c) => c },
		{ dx: 0, dy:  1, myEdge: 'bottom', theirEdge: 'top',    myRow: stage.rows-1, theirRow: () => 0,         getCol: (c) => c },
		{ dx: -1, dy: 0, myEdge: 'left',   theirEdge: 'right',  myRow: null,         theirRow: null,            getCol: null },
		{ dx:  1, dy: 0, myEdge: 'right',  theirEdge: 'left',   myRow: null,         theirRow: null,            getCol: null },
	];
	for (const d of dirs) {
		const nKey = `${x + d.dx},${y + d.dy}`;
		const neighbor = state.stages[nKey];
		if (!neighbor) continue;
		// 簡易チェック：端の行に壁が多すぎないか
		if (d.dx === 0) {
			const myCols = stage.cols;
			let wallCount = 0;
			for (let c = 1; c < myCols - 1; c++) {
				if (stage.tiles[d.myRow][c] === TILE.WALL) wallCount++;
			}
			if (wallCount === myCols - 2) {
				warnings.push(`⚠ ${d.myEdge}側が全部壁（隣ステージ ${nKey} とつながれない可能性）`);
			}
		}
	}
	borderWarnEl.innerHTML = warnings.join('<br>');
}

// ── Gate/Switch Links ─────────────────────────────────────────
function renderLinks(stage) {
	linksListEl.innerHTML = '';
	(stage.links || []).forEach((link, i) => {
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header">
				<span>連動 #${i+1}</span>
				<button class="btn btn-sm btn-danger" data-idx="${i}">削除</button>
			</div>
			<label>ゲートID <input type="text" value="${link.gateId}" data-field="gateId" data-idx="${i}" placeholder="例: gate1"></label>
			<label>スイッチID <input type="text" value="${link.switchId}" data-field="switchId" data-idx="${i}" placeholder="例: sw1"></label>
		`;
		item.querySelector('.btn-danger').addEventListener('click', () => {
			stage.links.splice(i, 1);
			renderLinks(stage);
		});
		item.querySelectorAll('input').forEach(inp => {
			inp.addEventListener('input', () => {
				const idx = parseInt(inp.dataset.idx, 10);
				const field = inp.dataset.field;
				stage.links[idx][field] = inp.value;
			});
		});
		linksListEl.appendChild(item);
	});
}

document.getElementById('btn-add-link').addEventListener('click', () => {
	const stage = getCurrentStage();
	if (!stage) return;
	stage.links.push({ gateId: '', switchId: '' });
	renderLinks(stage);
});

// ── Chest Contents ────────────────────────────────────────────
function renderChests(stage) {
	chestListEl.innerHTML = '';
	const chests = findTilePositions(stage, TILE.CHEST);
	if (chests.length === 0) {
		chestListEl.innerHTML = '<div style="font-size:0.7rem;color:var(--muted)">宝箱なし</div>';
		return;
	}
	chests.forEach(({ c, r }) => {
		const key = `${r},${c}`;
		const content = (stage.chestContents || {})[key] || { type: 'hp', name: '', value: 0 };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>宝箱 (${c},${r})</span></div>
			<label>種類
				<select data-key="${key}">
					<option value="hp"    ${content.type==='hp'?'selected':''}>HP回復</option>
					<option value="weapon" ${content.type==='weapon'?'selected':''}>武器</option>
					<option value="armor"  ${content.type==='armor'?'selected':''}>防具</option>
				</select>
			</label>
			<label>名前 <input type="text" value="${content.name}" data-key="${key}" data-field="name" placeholder="例: 鉄の剣"></label>
			<label>値   <input type="number" value="${content.value}" data-key="${key}" data-field="value" min="0" max="999"></label>
		`;
		item.querySelector('select').addEventListener('change', e => {
			if (!stage.chestContents) stage.chestContents = {};
			if (!stage.chestContents[key]) stage.chestContents[key] = {};
			stage.chestContents[key].type = e.target.value;
		});
		item.querySelectorAll('input').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!stage.chestContents) stage.chestContents = {};
				if (!stage.chestContents[key]) stage.chestContents[key] = {};
				const field = inp.dataset.field;
				stage.chestContents[key][field] = field === 'value' ? parseInt(inp.value, 10) : inp.value;
			});
		});
		chestListEl.appendChild(item);
	});
}

function findTilePositions(stage, tileChar) {
	const positions = [];
	for (let r = 0; r < stage.rows; r++) {
		for (let c = 0; c < stage.cols; c++) {
			if (stage.tiles[r][c] === tileChar) positions.push({ c, r });
		}
	}
	return positions;
}

// ── Clear stage ───────────────────────────────────────────────
document.getElementById('btn-clear-stage').addEventListener('click', () => {
	const stage = getCurrentStage();
	if (!stage) return;
	if (!confirm('このステージをクリアしますか？')) return;
	const { cols, rows } = stage;
	stage.tiles = makeEmptyStage(cols, rows).tiles;
	stage.links = [];
	stage.enemyDirs = {};
	stage.chestContents = {};
	stage.objects = {};
	renderStageCanvas();
});

// ── Save / Load ───────────────────────────────────────────────
function buildSaveData() {
	return {
		version: 1,
		world: state.world,
		stages: state.stages,
		endingStageOrder: state.endingStageOrder.length > 0 ? state.endingStageOrder : undefined,
	};
}

function loadSaveData(data) {
	if (!data || data.version !== 1) { alert('データ形式が無効です'); return; }
	state.world  = data.world;
	state.stages = data.stages;
	state.endingStageOrder = data.endingStageOrder ?? [];
	state.currentCoord = null;
	// 入力欄に反映
	const orderInput = document.getElementById('ending-stage-order-input');
	if (orderInput) orderInput.value = state.endingStageOrder.join('\n');
	renderWorldGrid();
	showView('world');
}

// File System Access API でworkフォルダに直接保存
let _workDirHandle = null;

async function saveToWorkDir(json) {
	try {
		// File System Access API が使えるか確認
		if (!window.showDirectoryPicker) throw new Error('unsupported');

		// 初回 or ハンドルが無効なら選択ダイアログを出す
		if (!_workDirHandle) {
			_workDirHandle = await window.showDirectoryPicker({
				id: 'dungeon-world-work',
				mode: 'readwrite',
				startIn: 'documents',
			});
		}

		const fileHandle = await _workDirHandle.getFileHandle('dungeon-world.json', { create: true });
		const writable   = await fileHandle.createWritable();
		await writable.write(json);
		await writable.close();
		return true;
	} catch (e) {
		if (e.name === 'AbortError') return false; // ユーザーがキャンセル
		return false; // フォールバックへ
	}
}

document.getElementById('btn-save').addEventListener('click', async () => {
	const json = JSON.stringify(buildSaveData(), null, 2);
	// localStorageに自動保存（常に）
	localStorage.setItem('dungeonWorldMapData', json);

	// File System Access API でworkフォルダに直接保存を試みる
	const saved = await saveToWorkDir(json);
	if (saved) {
		alert('work/dungeon-world.json に保存しました！');
		return;
	}

	// フォールバック：ダウンロード
	const blob = new Blob([json], { type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'dungeon-world.json';
	a.click();
	alert('保存しました！（ダウンロードされたファイルをwork/に配置してください）');
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
				loadSaveData(data);
				localStorage.setItem('dungeonWorldMapData', ev.target.result);
			} catch {
				alert('JSONの読み込みに失敗しました');
			}
		};
		reader.readAsText(file);
	});
	input.click();
});

// 自動復元（localStorageから）
function tryRestoreFromStorage() {
	const saved = localStorage.getItem('dungeonWorldMapData');
	if (saved) {
		try {
			loadSaveData(JSON.parse(saved));
		} catch {
			// 無視
		}
	}
}

// ── Preview ───────────────────────────────────────────────────
let _previewPending = false; // 開始位置クリック待ちフラグ

document.getElementById('btn-preview').addEventListener('click', () => {
	if (!state.currentCoord) {
		alert('ステージ編集画面を開いてからプレビューしてください');
		return;
	}
	// 開始位置クリック待ちモードに入る
	_previewPending = true;
	canvas.style.cursor = 'crosshair';
	canvas.style.outline = '3px solid #f0c040';
	// ヒント表示
	cellInfoEl.textContent = '▶ クリックした位置からゲームを開始します';
});

// プレビュー開始位置クリック
canvas.addEventListener('click', e => {
	if (!_previewPending) return;
	_previewPending = false;
	canvas.style.cursor = '';
	canvas.style.outline = '';
	cellInfoEl.textContent = '';

	const { c, r } = getCellFromEvent(e);
	const json = JSON.stringify(buildSaveData(), null, 2);
	localStorage.setItem('dungeonWorldMapData', json);

	const { x, y } = state.currentCoord;
	const overlay = document.getElementById('preview-overlay');
	const frame   = document.getElementById('preview-frame');
	frame.src = `../game/index.html?stage=${x},${y}&row=${r}&col=${c}`;
	overlay.classList.remove('hidden');
});

document.getElementById('btn-exit-preview').addEventListener('click', () => {
	const overlay = document.getElementById('preview-overlay');
	const frame   = document.getElementById('preview-frame');
	overlay.classList.add('hidden');
	frame.src = '';
});

// ── Ending Stage Order ───────────────────────────────────────
document.getElementById('btn-save-ending-order')?.addEventListener('click', () => {
	const input = document.getElementById('ending-stage-order-input');
	if (!input) return;
	// スペース・改行・カンマ区切りで "x,y" 形式のキーを抽出
	const raw = input.value.trim();
	if (!raw) {
		state.endingStageOrder = [];
		alert('エンディング順をクリアしました（自動順で表示されます）');
		return;
	}
	// "1,1 2,1 0,0" や "1,1\n2,1\n0,0" など空白で区切られた座標を解析
	const keys = raw.split(/[\s\n]+/).map(s => s.trim()).filter(s => /^\d+,\d+$/.test(s));
	const valid   = keys.filter(k => state.stages[k]);
	const invalid = keys.filter(k => !state.stages[k]);
	state.endingStageOrder = valid;
	input.value = valid.join('\n');
	if (invalid.length > 0) {
		alert(`設定しました。\n以下のステージは存在しないためスキップされました：\n${invalid.join(', ')}`);
	} else {
		alert(`エンディング振り返り順を設定しました（${valid.length}ステージ）`);
	}
});

// ── Init ─────────────────────────────────────────────────────
buildTilePalette();
tryRestoreFromStorage();
renderWorldGrid();
showView('world');
// エディタでもスプライトアニメーションを動かす
startAnimLoop(() => {
	if (document.getElementById('view-stage') && !document.getElementById('view-stage').classList.contains('hidden')) {
		renderStageCanvas();
	}
});

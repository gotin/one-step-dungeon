// ── editor-tile.js ── タイルバリエーション設計支援 ──────────────
// ダンジョンテーマ別パレットをプレビュー・編集・エクスポートする
import { SPRITES } from '../shared/sprites.js';
import { TILE_PAL, TILE_SPRITES } from '../shared/sprites-tiles.js';

// ── 表示対象ダンジョンタイル ─────────────────────────────────────
const DUNGEON_TILES = [
	{ key: 'block',         label: '石壁'     },
	{ key: 'door',          label: '扉'       },
	{ key: 'swG',           label: 'スイッチ' },
	{ key: 'gateG',         label: 'ゲート'   },
	{ key: 'water',         label: '水'       },
	{ key: 'breakableWall', label: '壊せる壁' },
	{ key: 'mapEnter',      label: '洞窟入口' },
	{ key: 'doorway',       label: '通路'     },
	{ key: 'doorwayBoss',   label: 'ボス通路' },
	{ key: 'doorwayLocked', label: '条件通路' },
];

// ── テーマプリセット ─────────────────────────────────────────────
const THEME_PRESETS = {
	default: { label: 'デフォルト（石）', overrides: {} },
	fire: {
		label: '炎の神殿',
		overrides: {
			block:         ['transparent','#0a0008','#5a2008','#9a4020','#c06040','#ffffff'],
			door:          ['transparent','#0a0008','#4a1808','#8a4020','#c06040','#ffa040'],
			water:         ['transparent','#180400','#3a0800','#6a1400','#a02000'],
			breakableWall: ['transparent','#1a0800','#402010','#604030','#805050','#b08060'],
			gateG:         ['transparent','#0a0008','#6a2008','#d06030','#f08050','#ffffff'],
			swG:           ['transparent','#0a0008','#3a1808','#7a4828','#c08060','#ffb080'],
			mapEnter:      ['transparent','#0a0000','#280800','#602010','#904030','#b06050'],
			doorway:       ['transparent','#0a0008','#3a1008','#6a2010','#983828','#c05040'],
			doorwayBoss:   ['transparent','#0a0008','#300808','#600010','#980018','#d00020'],
			doorwayLocked: ['transparent','#0a0008','#3a1008','#681808','#902818','#c04020'],
		},
	},
	water: {
		label: '水の迷宮',
		overrides: {
			block:         ['transparent','#000814','#0a3060','#1a5090','#3878c0','#a0d0ff'],
			door:          ['transparent','#000814','#0a2848','#1a4878','#3070a8','#80c0f0'],
			water:         ['transparent','#040c20','#0a2060','#103090','#2050c0'],
			breakableWall: ['transparent','#000c14','#0a2840','#1a4060','#305080','#5080b0'],
			gateG:         ['transparent','#000814','#0a3868','#1a60a8','#3090d0','#a0d8ff'],
			swG:           ['transparent','#000814','#082040','#1a4070','#3068a0','#70b0e0'],
			mapEnter:      ['transparent','#000008','#060c28','#0c2060','#184898','#3070c8'],
			doorway:       ['transparent','#000814','#0a2848','#1a4070','#3060a0','#5090c8'],
			doorwayBoss:   ['transparent','#000814','#080828','#101848','#182870','#2040a8'],
			doorwayLocked: ['transparent','#000814','#082038','#103060','#204880','#3870b0'],
		},
	},
	ice: {
		label: '氷の廃墟',
		overrides: {
			block:         ['transparent','#080c18','#2a4060','#5080a0','#88b0d0','#e8f4ff'],
			door:          ['transparent','#080c18','#203858','#406890','#6898c0','#c0e0ff'],
			water:         ['transparent','#0c1828','#203860','#406890','#70a8d0'],
			breakableWall: ['transparent','#0c1420','#203050','#405080','#6078a8','#90b0d0'],
			gateG:         ['transparent','#080c18','#305878','#60a0c0','#90c8e0','#e0f4ff'],
			swG:           ['transparent','#080c18','#1a3050','#405880','#6898b8','#c0e0f8'],
			mapEnter:      ['transparent','#040810','#101c38','#203060','#405888','#7090c0'],
			doorway:       ['transparent','#080c18','#203060','#4060a0','#7090c8','#b0d0f0'],
			doorwayBoss:   ['transparent','#080c18','#141828','#202848','#303868','#4858a0'],
			doorwayLocked: ['transparent','#080c18','#182840','#305070','#507898','#78a0c8'],
		},
	},
	forest: {
		label: '森の聖域',
		overrides: {
			block:         ['transparent','#040c04','#1a4018','#306030','#508050','#90c070'],
			door:          ['transparent','#040c04','#1a2810','#304820','#507040','#80c060'],
			water:         ['transparent','#041008','#083018','#105028','#207040'],
			breakableWall: ['transparent','#040c04','#182814','#284820','#406030','#709050'],
			gateG:         ['transparent','#040c04','#1a5810','#309830','#58c050','#90e080'],
			swG:           ['transparent','#040c04','#102808','#204818','#406030','#70a050'],
			mapEnter:      ['transparent','#020802','#0a2008','#183818','#285828','#407840'],
			doorway:       ['transparent','#040c04','#183018','#305030','#507050','#809070'],
			doorwayBoss:   ['transparent','#040c04','#0c1c08','#182c10','#283c18','#404e28'],
			doorwayLocked: ['transparent','#040c04','#183018','#286028','#407040','#609060'],
		},
	},
	desert: {
		label: '砂漠の神殿',
		overrides: {
			block:         ['transparent','#100808','#604010','#906020','#c09040','#f0d080'],
			door:          ['transparent','#100808','#503020','#806040','#a08060','#e0c080'],
			water:         ['transparent','#180c00','#402010','#704020','#a06030'],
			breakableWall: ['transparent','#100808','#403010','#705030','#907060','#c0a070'],
			gateG:         ['transparent','#100808','#704018','#b06828','#d09040','#f0c060'],
			swG:           ['transparent','#100808','#402008','#703818','#a06030','#d09050'],
			mapEnter:      ['transparent','#080400','#302008','#604020','#906040','#c09060'],
			doorway:       ['transparent','#100808','#503018','#806040','#a88060','#d0a870'],
			doorwayBoss:   ['transparent','#100808','#3a1808','#602818','#883020','#b05030'],
			doorwayLocked: ['transparent','#100808','#482808','#784030','#a06040','#c88060'],
		},
	},
	sky: {
		label: '空中の遺跡',
		overrides: {
			block:         ['transparent','#04081c','#1830a0','#3050d0','#6080f0','#c0d8ff'],
			door:          ['transparent','#04081c','#1028a0','#2048d0','#5080f0','#a0c8ff'],
			water:         ['transparent','#040828','#0820a0','#1040d0','#3070f0'],
			breakableWall: ['transparent','#040820','#182870','#2840a0','#4060c0','#7090e0'],
			gateG:         ['transparent','#04081c','#1840c0','#3060f0','#60a0ff','#c0e0ff'],
			swG:           ['transparent','#04081c','#0c2080','#2040b0','#4070e0','#80b0ff'],
			mapEnter:      ['transparent','#020610','#0c1860','#1830a8','#3058d8','#6088ff'],
			doorway:       ['transparent','#04081c','#1028a0','#2050d0','#4878f0','#80b0ff'],
			doorwayBoss:   ['transparent','#04081c','#080c30','#101858','#181880','#2820b0'],
			doorwayLocked: ['transparent','#04081c','#0c1870','#1838b0','#3060e0','#5090ff'],
		},
	},
	dark: {
		label: '闇の要塞',
		overrides: {
			block:         ['transparent','#000000','#1a0828','#340858','#500878','#a020c0'],
			door:          ['transparent','#000000','#180020','#300048','#480068','#9000c0'],
			water:         ['transparent','#080008','#180018','#280030','#3c0050'],
			breakableWall: ['transparent','#000000','#100818','#200830','#340850','#6010a0'],
			gateG:         ['transparent','#000000','#200840','#400868','#600888','#c010e0'],
			swG:           ['transparent','#000000','#100820','#200840','#380860','#8010a0'],
			mapEnter:      ['transparent','#000000','#0c0018','#180028','#280040','#400068'],
			doorway:       ['transparent','#000000','#100020','#200038','#380058','#580088'],
			doorwayBoss:   ['transparent','#000000','#0c0008','#180010','#280018','#400020'],
			doorwayLocked: ['transparent','#000000','#0e0018','#1c0030','#2a0048','#400068'],
		},
	},
};

// ── テーマデータ（編集可能コピー） ───────────────────────────────
// themeData[themeKey][tileKey] = palette array
const themeData = {};

function initThemeData() {
	for (const themeKey of Object.keys(THEME_PRESETS)) {
		themeData[themeKey] = {};
		for (const { key } of DUNGEON_TILES) {
			const basePal = TILE_PAL[key];
			if (!basePal) continue;
			const override = THEME_PRESETS[themeKey].overrides[key];
			themeData[themeKey][key] = override ? [...override] : [...basePal];
		}
	}
}

// ── 状態 ──────────────────────────────────────────────────────────
let currentTheme = 'default';
let selectedTile = null;

// ── DOM refs ───────────────────────────────────────────────────────
let elThemeSelect, elTileGrid, elPalettePanel, elExportOut;

// ── スプライト描画（native size → CSS でスケール） ──────────────
function drawTilePreview(canvas, frames, palette) {
	const grid = frames[0];
	const rows = grid.length, cols = grid[0].length;
	canvas.width  = cols;
	canvas.height = rows;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, cols, rows);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const idx = grid[r][c];
			if (idx === 0) continue;
			ctx.fillStyle = palette[idx] ?? '#ff00ff';
			ctx.fillRect(c, r, 1, 1);
		}
	}
}

// ── タイルグリッド描画 ────────────────────────────────────────────
function renderTileGrid() {
	if (!elTileGrid) return;
	elTileGrid.innerHTML = '';

	for (const { key, label } of DUNGEON_TILES) {
		const palData = themeData[currentTheme]?.[key];
		const frames  = SPRITES[key];
		if (!palData || !frames) continue;

		const wrapper = document.createElement('div');
		wrapper.className = 'tile-preview-item' + (selectedTile === key ? ' active' : '');
		wrapper.dataset.tileKey = key;

		const cv = document.createElement('canvas');
		cv.className = 'tile-preview-canvas';
		drawTilePreview(cv, frames, palData);

		const lblEl = document.createElement('div');
		lblEl.className = 'tile-preview-label';
		lblEl.textContent = label;

		wrapper.appendChild(cv);
		wrapper.appendChild(lblEl);
		wrapper.addEventListener('click', () => {
			selectedTile = key;
			renderTileGrid();
			renderPaletteEditor();
		});
		elTileGrid.appendChild(wrapper);
	}
}

// ── パレットエディタ描画 ──────────────────────────────────────────
function renderPaletteEditor() {
	if (!elPalettePanel) return;
	elPalettePanel.innerHTML = '';

	if (!selectedTile) {
		const hint = document.createElement('p');
		hint.className = 'hint';
		hint.textContent = 'タイルを選択してください';
		elPalettePanel.appendChild(hint);
		return;
	}

	const palData = themeData[currentTheme]?.[selectedTile];
	if (!palData) {
		const hint = document.createElement('p');
		hint.className = 'hint';
		hint.textContent = 'パレットデータなし';
		elPalettePanel.appendChild(hint);
		return;
	}

	const tileInfo = DUNGEON_TILES.find(t => t.key === selectedTile);

	const title = document.createElement('h3');
	title.className = 'panel-title';
	title.textContent = `${tileInfo?.label ?? selectedTile} のパレット`;
	elPalettePanel.appendChild(title);

	// ラージプレビューキャンバス（色変更時にインプレース更新）
	const frames = SPRITES[selectedTile];
	let previewCv = null;
	if (frames) {
		previewCv = document.createElement('canvas');
		previewCv.className = 'tile-large-preview';
		drawTilePreview(previewCv, frames, palData);
		elPalettePanel.appendChild(previewCv);
	}

	const inst = document.createElement('p');
	inst.className = 'hint';
	inst.textContent = '色スウォッチをクリックして変更できます（index 0 は透明固定）';
	elPalettePanel.appendChild(inst);

	// パレットスウォッチ
	const swatchRow = document.createElement('div');
	swatchRow.className = 'tile-swatch-row';

	palData.forEach((color, idx) => {
		const wrapper = document.createElement('div');
		wrapper.className = 'tile-swatch-wrapper';

		const sw = document.createElement('div');
		sw.className = 'tile-swatch';
		sw.title = `index ${idx}: ${color}`;

		const lbl = document.createElement('div');
		lbl.className = 'tile-swatch-label';

		if (idx === 0) {
			sw.classList.add('transparent');
			sw.textContent = '∅';
			lbl.textContent = '透明';
		} else {
			sw.style.background = color;
			lbl.textContent = color;

			const colorInput = document.createElement('input');
			colorInput.type = 'color';
			colorInput.value = color;
			colorInput.style.display = 'none';
			colorInput.addEventListener('input', e => {
				const nc = e.target.value;
				palData[idx] = nc;
				sw.style.background = nc;
				sw.title = `index ${idx}: ${nc}`;
				lbl.textContent = nc;
				if (previewCv && frames) drawTilePreview(previewCv, frames, palData);
				renderTileGrid();
				generateExportCode();
			});
			sw.addEventListener('click', () => colorInput.click());
			wrapper.appendChild(colorInput);
		}

		wrapper.appendChild(sw);
		wrapper.appendChild(lbl);
		swatchRow.appendChild(wrapper);
	});

	elPalettePanel.appendChild(swatchRow);

	// リセットボタン
	const btnReset = document.createElement('button');
	btnReset.className = 'btn btn-sm';
	btnReset.textContent = '↩ テーマ初期値に戻す';
	btnReset.style.marginTop = '12px';
	btnReset.addEventListener('click', () => {
		const basePal  = TILE_PAL[selectedTile];
		if (!basePal) return;
		const override = THEME_PRESETS[currentTheme].overrides[selectedTile];
		themeData[currentTheme][selectedTile] = override ? [...override] : [...basePal];
		renderTileGrid();
		renderPaletteEditor();
		generateExportCode();
	});
	elPalettePanel.appendChild(btnReset);

	generateExportCode();
}

// ── エクスポートコード生成 ────────────────────────────────────────
function palToJs(pal) {
	return pal.map(c => `'${c}'`).join(', ');
}

function generateExportCode() {
	if (!elExportOut) return;
	const preset = THEME_PRESETS[currentTheme];
	const lines  = [];
	lines.push(`// ${preset.label} - ダンジョンテーマパレット`);
	lines.push(`// shared/sprites-tiles.js の TILE_PAL に追加・マージしてください`);
	lines.push('');

	const changed = [];
	for (const { key } of DUNGEON_TILES) {
		const palData = themeData[currentTheme]?.[key];
		if (!palData) continue;
		const base = TILE_PAL[key];
		if (!base || JSON.stringify(palData) !== JSON.stringify(base)) {
			changed.push({ key, palData });
		}
	}

	if (changed.length === 0) {
		lines.push('// （デフォルトから変更なし）');
	} else {
		lines.push(`// テーマ: ${currentTheme}  変更タイル: ${changed.map(t => t.key).join(', ')}`);
		lines.push('export const TILE_PAL_OVERRIDE = {');
		for (const { key, palData } of changed) {
			lines.push(`  ${key}: [${palToJs(palData)}],`);
		}
		lines.push('};');
	}

	elExportOut.value = lines.join('\n');
}

// ══════════════════════════════════════════════════════════════════
// 背景スプライト編集（BG タイルのピクセルグリッドエディタ）
// ══════════════════════════════════════════════════════════════════

// 編集対象のフィールド/BG タイル一覧（tile-sprites.js の TILE_SPRITE_MAP 由来）
const BG_TILE_LIST = [
	{ key: 'grass',     spr: 'grass',      pal: 'grass',      label: '草地'   },
	{ key: 'sand',      spr: 'sand',       pal: 'sand',       label: '砂地'   },
	{ key: 'stoneFloor',spr: 'stoneFloor', pal: 'stoneFloor', label: '石畳'   },
	{ key: 'snow',      spr: 'grass',      pal: 'snow',       label: '雪地'   },
	{ key: 'ash',       spr: 'sand',       pal: 'ash',        label: '灰地'   },
	{ key: 'mud',       spr: 'grass',      pal: 'mud',        label: '泥地'   },
	{ key: 'bridge',    spr: 'bridge',     pal: 'bridge',     label: '橋'     },
	{ key: 'tree',      spr: 'tree',       pal: 'tree',       label: '木'     },
	{ key: 'mountain',  spr: 'mountain',   pal: 'mountain',   label: '山'     },
	{ key: 'bush',      spr: 'bush',       pal: 'bush',       label: '茂み'   },
	{ key: 'fence',     spr: 'fence',      pal: 'fence',      label: '柵'     },
	{ key: 'houseWall', spr: 'houseWall',  pal: 'houseWall',  label: '家の壁' },
	{ key: 'houseDoor', spr: 'houseDoor',  pal: 'houseDoor',  label: '家のドア'},
	{ key: 'houseRoof', spr: 'houseRoof',  pal: 'houseRoof',  label: '屋根'   },
	{ key: 'sign',      spr: 'sign',       pal: 'sign',       label: '看板'   },
];

const BG_CELL_PX = 18;

// ── BG スプライトエディタ状態 ─────────────────────────────────
const bgState = {
	selectedKey: BG_TILE_LIST[0].key,
	// 編集中フレームデータの作業コピー（key → frames[][]）
	framesCache: {},
	// 編集中パレットの作業コピー（key → palette[]）
	palCache: {},
	currentFrame: 0,
	isDrawing: false,
	selColor: 1,
	tool: 'pen',
};

// DOM refs（init 時に取得）
let elBgSelector, elBgCanvas, elBgFrameList, elBgPaletteRow,
	elBgColorInput, elBgExportOut;

// ── ヘルパー ──────────────────────────────────────────────────
function bgMakeEmptyGrid() {
	return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0));
}

function bgCurrentEntry() {
	return BG_TILE_LIST.find(e => e.key === bgState.selectedKey) ?? BG_TILE_LIST[0];
}

function bgEnsureCache(key) {
	const entry = BG_TILE_LIST.find(e => e.key === key);
	if (!entry) return;
	if (!bgState.framesCache[key]) {
		const src = TILE_SPRITES[entry.spr];
		bgState.framesCache[key] = src
			? src.map(g => g.map(row => row.slice()))
			: [bgMakeEmptyGrid()];
	}
	if (!bgState.palCache[key]) {
		const src = TILE_PAL[entry.pal];
		bgState.palCache[key] = src ? src.slice() : ['transparent','#000000','#ffffff','#808080','#c0c0c0'];
	}
}

function bgCurFrames() {
	bgEnsureCache(bgState.selectedKey);
	return bgState.framesCache[bgState.selectedKey];
}

function bgCurPal() {
	bgEnsureCache(bgState.selectedKey);
	return bgState.palCache[bgState.selectedKey];
}

function bgCurGrid() {
	const frames = bgCurFrames();
	const fi = Math.min(bgState.currentFrame, frames.length - 1);
	return frames[fi];
}

// ── 描画ユーティリティ ────────────────────────────────────────
function bgDrawGridToCanvas(cv, grid, palette, cellPx) {
	const rows = grid.length, cols = grid[0].length;
	cv.width  = cols * cellPx;
	cv.height = rows * cellPx;
	const ctx = cv.getContext('2d');
	ctx.clearRect(0, 0, cv.width, cv.height);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const idx = grid[r][c];
			const x = c * cellPx, y = r * cellPx;
			if (idx === 0) {
				ctx.fillStyle = ((r + c) % 2 === 0) ? '#2a2f33' : '#22262a';
			} else {
				ctx.fillStyle = palette[idx] ?? '#ff00ff';
			}
			ctx.fillRect(x, y, cellPx, cellPx);
		}
	}
	// グリッド線
	ctx.strokeStyle = 'rgba(255,255,255,0.08)';
	ctx.lineWidth = 1;
	for (let r = 0; r <= rows; r++) {
		ctx.beginPath(); ctx.moveTo(0, r * cellPx); ctx.lineTo(cols * cellPx, r * cellPx); ctx.stroke();
	}
	for (let c = 0; c <= cols; c++) {
		ctx.beginPath(); ctx.moveTo(c * cellPx, 0); ctx.lineTo(c * cellPx, rows * cellPx); ctx.stroke();
	}
}

// ── メインキャンバス描画 ──────────────────────────────────────
function bgRenderCanvas() {
	if (!elBgCanvas) return;
	bgDrawGridToCanvas(elBgCanvas, bgCurGrid(), bgCurPal(), BG_CELL_PX);
}

// ── フレーム一覧 ──────────────────────────────────────────────
function bgRenderFrames() {
	if (!elBgFrameList) return;
	elBgFrameList.innerHTML = '';
	const frames = bgCurFrames();
	const pal    = bgCurPal();
	frames.forEach((grid, i) => {
		const btn = document.createElement('button');
		btn.className = 'bg-frame-thumb' + (i === bgState.currentFrame ? ' selected' : '');
		btn.title = `フレーム ${i}`;
		const cv = document.createElement('canvas');
		bgDrawGridToCanvas(cv, grid, pal, 3);
		cv.className = 'bg-frame-cv';
		btn.appendChild(cv);
		const lbl = document.createElement('span');
		lbl.textContent = i;
		btn.appendChild(lbl);
		btn.addEventListener('click', () => {
			bgState.currentFrame = i;
			bgRenderFrames();
			bgRenderCanvas();
		});
		elBgFrameList.appendChild(btn);
	});
}

// ── パレット行 ────────────────────────────────────────────────
function bgRenderPalette() {
	if (!elBgPaletteRow) return;
	elBgPaletteRow.innerHTML = '';
	const pal = bgCurPal();
	pal.forEach((color, i) => {
		const sw = document.createElement('button');
		sw.className = 'bg-swatch' + (i === bgState.selColor ? ' selected' : '');
		sw.title = `index ${i}: ${color}`;
		if (i === 0) {
			sw.classList.add('transparent');
			sw.textContent = '∅';
		} else {
			sw.style.background = color;
		}
		sw.addEventListener('click', () => {
			bgState.selColor = i;
			if (i > 0 && elBgColorInput) elBgColorInput.value = bgNormalizeHex(color);
			bgRenderPalette();
		});
		elBgPaletteRow.appendChild(sw);
	});
}

function bgNormalizeHex(c) {
	if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) return c;
	return '#ffffff';
}

// ── ドット描画 ────────────────────────────────────────────────
function bgCellFromEvent(e) {
	const rect = elBgCanvas.getBoundingClientRect();
	const px = (e.clientX - rect.left) * (elBgCanvas.width / rect.width);
	const py = (e.clientY - rect.top) * (elBgCanvas.height / rect.height);
	return {
		r: Math.floor(py / BG_CELL_PX),
		c: Math.floor(px / BG_CELL_PX),
	};
}

function bgPaintAt(r, c) {
	const grid = bgCurGrid();
	if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return;
	const val = bgState.tool === 'erase' ? 0 : bgState.selColor;
	if (grid[r][c] === val) return;
	grid[r][c] = val;
	bgRenderCanvas();
	bgRenderFrames();
}

// ── エクスポートコード生成 ────────────────────────────────────
function bgGridToCode(grid) {
	return '[\n' + grid.map(row => '\t\t[' + row.join(',') + ']').join(',\n') + '\n\t]';
}

function bgGenerateExport() {
	if (!elBgExportOut) return;
	const entry = bgCurrentEntry();
	const frames = bgCurFrames();
	const pal    = bgCurPal();
	const sprName = entry.spr;
	const palName = entry.pal;
	const framesCode = frames.map(g => bgGridToCode(g)).join(',\n\t');
	const palCode = pal.map(c => `'${c}'`).join(', ');
	elBgExportOut.value =
		`// ── パレット (sprites-tiles.js の TILE_PAL に追加) ──\n` +
		`${palName}: [${palCode}],\n\n` +
		`// ── スプライト (sprites-tiles.js の TILE_SPRITES に追加/置換) ──\n` +
		`TILE_SPRITES.${sprName} = [\n\t${framesCode}\n];\n`;
}

// ── 選択タイル切り替え ────────────────────────────────────────
function bgLoadTile(key) {
	bgState.selectedKey = key;
	bgState.currentFrame = 0;
	bgState.selColor = 1;
	bgEnsureCache(key);
	bgRenderCanvas();
	bgRenderFrames();
	bgRenderPalette();
	bgGenerateExport();
}

// ── タイル選択一覧の描画 ─────────────────────────────────────
function bgRenderSelector() {
	if (!elBgSelector) return;
	elBgSelector.innerHTML = '';
	BG_TILE_LIST.forEach(({ key, spr, pal, label }) => {
		const opt = document.createElement('option');
		opt.value = key;
		opt.textContent = label;
		elBgSelector.appendChild(opt);
	});
	elBgSelector.value = bgState.selectedKey;
	elBgSelector.addEventListener('change', () => {
		bgLoadTile(elBgSelector.value);
	});
}

// ── 公開 API ─────────────────────────────────────────────────────
export function initTileEditor() {
	elThemeSelect  = document.getElementById('tile-theme-select');
	elTileGrid     = document.getElementById('tile-preview-grid');
	elPalettePanel = document.getElementById('tile-palette-panel');
	elExportOut    = document.getElementById('tile-export-code');

	if (!elThemeSelect || !elTileGrid) return;

	initThemeData();

	// テーマセレクトを構築
	elThemeSelect.innerHTML = '';
	for (const [key, preset] of Object.entries(THEME_PRESETS)) {
		const opt = document.createElement('option');
		opt.value = key;
		opt.textContent = preset.label;
		elThemeSelect.appendChild(opt);
	}
	elThemeSelect.value = currentTheme;
	elThemeSelect.addEventListener('change', () => {
		currentTheme = elThemeSelect.value;
		selectedTile = null;
		renderTileGrid();
		renderPaletteEditor();
		generateExportCode();
	});

	// コピーボタン
	const btnCopy = document.getElementById('btn-tile-copy-code');
	if (btnCopy) {
		btnCopy.addEventListener('click', () => {
			if (!elExportOut) return;
			navigator.clipboard.writeText(elExportOut.value).then(() => {
				const orig = btnCopy.textContent;
				btnCopy.textContent = '✔ コピー完了';
				setTimeout(() => { btnCopy.textContent = orig; }, 1500);
			});
		});
	}

	renderTileGrid();
	renderPaletteEditor();
	generateExportCode();

	// ── 背景スプライト編集セクションを初期化 ──────────────────
	elBgSelector    = document.getElementById('bg-tile-select');
	elBgCanvas      = document.getElementById('bg-tile-canvas');
	elBgFrameList   = document.getElementById('bg-tile-frames');
	elBgPaletteRow  = document.getElementById('bg-tile-palette');
	elBgColorInput  = document.getElementById('bg-tile-color-input');
	elBgExportOut   = document.getElementById('bg-tile-export-out');

	if (!elBgCanvas) return;

	bgRenderSelector();
	bgLoadTile(bgState.selectedKey);

	// マウス描画
	elBgCanvas.addEventListener('mousedown', e => {
		bgState.isDrawing = true;
		const { r, c } = bgCellFromEvent(e);
		bgPaintAt(r, c);
	});
	elBgCanvas.addEventListener('mousemove', e => {
		if (!bgState.isDrawing) return;
		const { r, c } = bgCellFromEvent(e);
		bgPaintAt(r, c);
	});
	window.addEventListener('mouseup', () => { bgState.isDrawing = false; });
	elBgCanvas.addEventListener('mouseleave', () => { bgState.isDrawing = false; });

	// ツール
	const bgBtnPen   = document.getElementById('bg-tile-tool-pen');
	const bgBtnErase = document.getElementById('bg-tile-tool-erase');
	if (bgBtnPen)   bgBtnPen.addEventListener('click', () => {
		bgState.tool = 'pen';
		bgBtnPen.classList.add('active');
		if (bgBtnErase) bgBtnErase.classList.remove('active');
	});
	if (bgBtnErase) bgBtnErase.addEventListener('click', () => {
		bgState.tool = 'erase';
		bgBtnErase.classList.add('active');
		if (bgBtnPen) bgBtnPen.classList.remove('active');
	});

	// 色変更
	if (elBgColorInput) {
		elBgColorInput.addEventListener('input', () => {
			if (bgState.selColor > 0) {
				bgCurPal()[bgState.selColor] = elBgColorInput.value;
				bgRenderPalette();
				bgRenderCanvas();
				bgRenderFrames();
				bgGenerateExport();
			}
		});
	}

	// リセット
	const bgBtnReset = document.getElementById('bg-tile-reset');
	if (bgBtnReset) {
		bgBtnReset.addEventListener('click', () => {
			const entry = bgCurrentEntry();
			delete bgState.framesCache[entry.key];
			delete bgState.palCache[entry.key];
			bgLoadTile(entry.key);
		});
	}

	// フレーム追加/複製/削除
	const bgBtnAddFrame = document.getElementById('bg-tile-add-frame');
	const bgBtnDupFrame = document.getElementById('bg-tile-dup-frame');
	const bgBtnDelFrame = document.getElementById('bg-tile-del-frame');
	if (bgBtnAddFrame) bgBtnAddFrame.addEventListener('click', () => {
		bgCurFrames().push(bgMakeEmptyGrid());
		bgState.currentFrame = bgCurFrames().length - 1;
		bgRenderFrames();
		bgRenderCanvas();
	});
	if (bgBtnDupFrame) bgBtnDupFrame.addEventListener('click', () => {
		const copy = bgCurGrid().map(row => row.slice());
		bgCurFrames().splice(bgState.currentFrame + 1, 0, copy);
		bgState.currentFrame += 1;
		bgRenderFrames();
		bgRenderCanvas();
	});
	if (bgBtnDelFrame) bgBtnDelFrame.addEventListener('click', () => {
		if (bgCurFrames().length <= 1) return;
		bgCurFrames().splice(bgState.currentFrame, 1);
		bgState.currentFrame = Math.max(0, bgState.currentFrame - 1);
		bgRenderFrames();
		bgRenderCanvas();
	});

	// エクスポート
	const bgBtnExport = document.getElementById('bg-tile-export-btn');
	const bgBtnCopy   = document.getElementById('bg-tile-copy-btn');
	if (bgBtnExport) bgBtnExport.addEventListener('click', bgGenerateExport);
	if (bgBtnCopy)   bgBtnCopy.addEventListener('click', () => {
		bgGenerateExport();
		navigator.clipboard.writeText(elBgExportOut.value).then(() => {
			const orig = bgBtnCopy.textContent;
			bgBtnCopy.textContent = '✔ コピー完了';
			setTimeout(() => { bgBtnCopy.textContent = orig; }, 1500);
		});
	});
}

export function onLeaveTileEditor() {
	// 特にクリーンアップなし
}

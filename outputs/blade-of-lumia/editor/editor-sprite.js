// ── editor-sprite.js ── スプライトエディタ（ドット絵作成支援） ──
// ピクセルアートをブラウザ上で描き、sprites-*.js の配列形式でエクスポートする。
// データ形式：SPRITES.<name> = [frame, ...]、各frameは行配列の2次元配列、
//             各セルは PAL.<name> のインデックス（0 = transparent）。
import { PAL, SPRITES } from '../shared/sprites.js';

// ── 状態 ──────────────────────────────────────────────────────
const sprState = {
	rows: 32,
	cols: 32,
	frames: [makeEmptyGrid(32, 32)], // [ [[idx...],...], ... ]
	current: 0,                       // 編集中フレーム index
	palette: ['transparent', '#000000', '#ffffff'],
	selColor: 1,                      // 選択中パレット index（0=透明）
	tool: 'pen',                      // 'pen' | 'erase'
	isDrawing: false,
	playing: false,
	playTimer: null,
	playFrame: 0,
};

function makeEmptyGrid(rows, cols) {
	return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

// ── DOM 参照（init 時に取得） ─────────────────────────────────
let elCanvas, elSizeLabel, elPalette, elFrames, elColorInput;
let elExportName, elExportPal, elExportOut, elPreviewCanvas, elLoadName, elLoadPal;

// ── 描画：メインキャンバス ────────────────────────────────────
const CELL_PX = 14;     // 1ドットの表示サイズ（描画キャンバス）
function curFrame() { return sprState.frames[sprState.current]; }

function renderCanvas() {
	const { rows, cols } = sprState;
	elCanvas.width  = cols * CELL_PX;
	elCanvas.height = rows * CELL_PX;
	const ctx = elCanvas.getContext('2d');
	ctx.clearRect(0, 0, elCanvas.width, elCanvas.height);
	const grid = curFrame();
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const idx = grid[r][c];
			const x = c * CELL_PX, y = r * CELL_PX;
			if (idx === 0) {
				// 透明：チェッカー柄
				ctx.fillStyle = ((r + c) % 2 === 0) ? '#2a2f33' : '#22262a';
				ctx.fillRect(x, y, CELL_PX, CELL_PX);
			} else {
				ctx.fillStyle = sprState.palette[idx] ?? '#ff00ff';
				ctx.fillRect(x, y, CELL_PX, CELL_PX);
			}
		}
	}
	// グリッド線
	ctx.strokeStyle = 'rgba(255,255,255,0.08)';
	ctx.lineWidth = 1;
	for (let r = 0; r <= rows; r++) {
		ctx.beginPath(); ctx.moveTo(0, r * CELL_PX); ctx.lineTo(cols * CELL_PX, r * CELL_PX); ctx.stroke();
	}
	for (let c = 0; c <= cols; c++) {
		ctx.beginPath(); ctx.moveTo(c * CELL_PX, 0); ctx.lineTo(c * CELL_PX, rows * CELL_PX); ctx.stroke();
	}
	elSizeLabel.textContent = `${cols} × ${rows}`;
}

// ── 描画：パレット ────────────────────────────────────────────
function renderPalette() {
	elPalette.innerHTML = '';
	sprState.palette.forEach((color, i) => {
		const sw = document.createElement('button');
		sw.className = 'sprite-swatch' + (i === sprState.selColor ? ' selected' : '');
		sw.dataset.idx = String(i);
		sw.title = `index ${i}: ${color}`;
		if (i === 0) {
			sw.classList.add('transparent');
			sw.textContent = '∅';
		} else {
			sw.style.background = color;
		}
		sw.addEventListener('click', () => {
			sprState.selColor = i;
			if (i > 0) elColorInput.value = normalizeHex(color);
			renderPalette();
		});
		elPalette.appendChild(sw);
	});
}

function normalizeHex(c) {
	if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) return c;
	return '#ffffff';
}

// ── 描画：フレーム一覧 ────────────────────────────────────────
function renderFrames() {
	elFrames.innerHTML = '';
	sprState.frames.forEach((grid, i) => {
		const wrap = document.createElement('button');
		wrap.className = 'sprite-frame-thumb' + (i === sprState.current ? ' selected' : '');
		wrap.title = `フレーム ${i}`;
		const cv = document.createElement('canvas');
		drawGridToCanvas(cv, grid, sprState.palette, 2);
		wrap.appendChild(cv);
		const lbl = document.createElement('span');
		lbl.textContent = i;
		wrap.appendChild(lbl);
		wrap.addEventListener('click', () => {
			sprState.current = i;
			renderFrames();
			renderCanvas();
		});
		elFrames.appendChild(wrap);
	});
}

// 任意の grid を canvas に等倍×scale で描画（サムネ/プレビュー用）
function drawGridToCanvas(cv, grid, palette, scale = 1) {
	const rows = grid.length, cols = grid[0].length;
	cv.width = cols * scale;
	cv.height = rows * scale;
	const ctx = cv.getContext('2d');
	ctx.clearRect(0, 0, cv.width, cv.height);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const idx = grid[r][c];
			if (idx === 0) continue;
			ctx.fillStyle = palette[idx] ?? '#ff00ff';
			ctx.fillRect(c * scale, r * scale, scale, scale);
		}
	}
}

// ── 入力：キャンバスへの描画 ──────────────────────────────────
function cellFromEvent(e) {
	const rect = elCanvas.getBoundingClientRect();
	const px = (e.clientX - rect.left) * (elCanvas.width / rect.width);
	const py = (e.clientY - rect.top) * (elCanvas.height / rect.height);
	const c = Math.floor(px / CELL_PX);
	const r = Math.floor(py / CELL_PX);
	return { r, c };
}

function paintAt(r, c) {
	if (r < 0 || c < 0 || r >= sprState.rows || c >= sprState.cols) return;
	const val = sprState.tool === 'erase' ? 0 : sprState.selColor;
	if (curFrame()[r][c] === val) return;
	curFrame()[r][c] = val;
	renderCanvas();
}

// ── ツール／パレット操作 ──────────────────────────────────────
function setTool(tool) {
	sprState.tool = tool;
	document.getElementById('sprite-tool-pen').classList.toggle('active', tool === 'pen');
	document.getElementById('sprite-tool-erase').classList.toggle('active', tool === 'erase');
}

function setSelectedColor(hex) {
	if (sprState.selColor === 0) return; // 透明は変更不可
	sprState.palette[sprState.selColor] = hex;
	renderPalette();
	renderCanvas();
	renderFrames();
}

function addColor(hex) {
	sprState.palette.push(hex);
	sprState.selColor = sprState.palette.length - 1;
	renderPalette();
}

// ── グリッドサイズ変更 ────────────────────────────────────────
function applyGridSize(spec) {
	const [cols, rows] = spec.split('x').map(Number);
	sprState.cols = cols;
	sprState.rows = rows;
	sprState.frames = [makeEmptyGrid(rows, cols)];
	sprState.current = 0;
	renderCanvas();
	renderFrames();
}

function clearFrame() {
	sprState.frames[sprState.current] = makeEmptyGrid(sprState.rows, sprState.cols);
	renderCanvas();
	renderFrames();
}

function flipCurrentFrame() {
	const grid = curFrame();
	for (const row of grid) row.reverse();
	renderCanvas();
	renderFrames();
}

// ── フレーム操作 ──────────────────────────────────────────────
function addFrame() {
	sprState.frames.push(makeEmptyGrid(sprState.rows, sprState.cols));
	sprState.current = sprState.frames.length - 1;
	renderFrames();
	renderCanvas();
}
function dupFrame() {
	const copy = curFrame().map(row => row.slice());
	sprState.frames.splice(sprState.current + 1, 0, copy);
	sprState.current += 1;
	renderFrames();
	renderCanvas();
}
function delFrame() {
	if (sprState.frames.length <= 1) return;
	sprState.frames.splice(sprState.current, 1);
	sprState.current = Math.max(0, sprState.current - 1);
	renderFrames();
	renderCanvas();
}

// ── プレビュー再生 ────────────────────────────────────────────
function togglePlay() {
	if (sprState.playing) {
		stopPlay();
	} else {
		sprState.playing = true;
		sprState.playFrame = 0;
		document.getElementById('sprite-play-btn').textContent = '⏸ 停止';
		sprState.playTimer = setInterval(() => {
			sprState.playFrame = (sprState.playFrame + 1) % sprState.frames.length;
			drawGridToCanvas(elPreviewCanvas, sprState.frames[sprState.playFrame], sprState.palette, 4);
		}, 400);
		drawGridToCanvas(elPreviewCanvas, sprState.frames[0], sprState.palette, 4);
	}
}
function stopPlay() {
	sprState.playing = false;
	clearInterval(sprState.playTimer);
	sprState.playTimer = null;
	const btn = document.getElementById('sprite-play-btn');
	if (btn) btn.textContent = '▶ プレビュー再生';
}

// ── 既存スプライト読込 ────────────────────────────────────────
// スプライト名から「対応しそうなパレット名」を推測する：
//  1. 完全一致（water→water 等、多くのスプライトは同名パレット）
//  2. プレフィックス一致の中で最長を採用（heroD→hero / heroR→hero /
//     spearV→spear / gateGopen→gateG / doorOpen→door / heartEmpty→heart）
function guessPalForName(spriteName) {
	if (PAL[spriteName]) return spriteName;
	let best = null;
	for (const palName of Object.keys(PAL)) {
		if (spriteName.startsWith(palName)) {
			if (!best || palName.length > best.length) best = palName;
		}
	}
	return best ?? Object.keys(PAL)[0];
}

// スプライトセレクタの選択に合わせてパレットセレクタを自動で合わせる
function syncPalToSprite() {
	const guessed = guessPalForName(elLoadName.value);
	if (guessed && [...elLoadPal.options].some(o => o.value === guessed)) {
		elLoadPal.value = guessed;
	}
}

function populateLoadSelectors() {
	elLoadName.innerHTML = '';
	Object.keys(SPRITES).sort().forEach(name => {
		const o = document.createElement('option');
		o.value = name; o.textContent = name;
		elLoadName.appendChild(o);
	});
	elLoadPal.innerHTML = '';
	Object.keys(PAL).sort().forEach(name => {
		const o = document.createElement('option');
		o.value = name; o.textContent = name;
		elLoadPal.appendChild(o);
	});
	// 既定のスプライト＋それに合うパレットを自動選択
	if (SPRITES.heroD) elLoadName.value = 'heroD';
	syncPalToSprite();
}

function loadExisting() {
	const name = elLoadName.value;
	const palName = elLoadPal.value;
	const frames = SPRITES[name];
	const palette = PAL[palName];
	if (!frames || !palette) return;
	// deep copy
	sprState.frames = frames.map(g => g.map(row => row.slice()));
	sprState.rows = sprState.frames[0].length;
	sprState.cols = sprState.frames[0][0].length;
	sprState.palette = palette.slice();
	sprState.current = 0;
	sprState.selColor = Math.min(1, sprState.palette.length - 1);
	// グリッドセレクタを合わせる（一致するものがあれば）
	const spec = `${sprState.cols}x${sprState.rows}`;
	const sel = document.getElementById('sprite-grid-size');
	if ([...sel.options].some(o => o.value === spec)) sel.value = spec;
	// エクスポート名の初期値に流用
	elExportName.value = name;
	elExportPal.value = palName;
	renderPalette();
	renderFrames();
	renderCanvas();
}

// ── エクスポート（sprites-*.js の配列形式） ───────────────────
function gridToCode(grid, indent) {
	const rowsStr = grid.map(row => `${indent}\t[${row.join(',')}]`).join(',\n');
	return `${indent}[\n${rowsStr}\n${indent}]`;
}

function buildExportCode() {
	const sprName = (elExportName.value || 'newSprite').trim();
	const palName = (elExportPal.value || 'newPal').trim();
	const framesStr = sprState.frames.map(g => gridToCode(g, '\t')).join(',\n');
	const palStr = sprState.palette.map(c => `'${c}'`).join(',');
	return (
		`// ── パレット ──\n` +
		`${palName}: [${palStr}],\n\n` +
		`// ── スプライト（${sprState.cols}×${sprState.rows}, ${sprState.frames.length}フレーム）──\n` +
		`SPRITES.${sprName} = [\n${framesStr}\n];\n`
	);
}

function exportCode() {
	elExportOut.value = buildExportCode();
}

async function copyExport() {
	if (!elExportOut.value) exportCode();
	try {
		await navigator.clipboard.writeText(elExportOut.value);
	} catch {
		// フォールバック：選択
		elExportOut.select();
		document.execCommand?.('copy');
	}
}

// ── 初期化 ────────────────────────────────────────────────────
export function initSpriteEditor() {
	elCanvas        = document.getElementById('sprite-canvas');
	elSizeLabel     = document.getElementById('sprite-size-label');
	elPalette       = document.getElementById('sprite-palette');
	elFrames        = document.getElementById('sprite-frames');
	elColorInput    = document.getElementById('sprite-color-input');
	elExportName    = document.getElementById('sprite-export-name');
	elExportPal     = document.getElementById('sprite-export-pal');
	elExportOut     = document.getElementById('sprite-export-out');
	elPreviewCanvas = document.getElementById('sprite-preview-canvas');
	elLoadName      = document.getElementById('sprite-load-name');
	elLoadPal       = document.getElementById('sprite-load-pal');

	if (!elCanvas) return; // ビューが無ければ何もしない

	// マウス描画
	elCanvas.addEventListener('mousedown', e => {
		sprState.isDrawing = true;
		const { r, c } = cellFromEvent(e);
		paintAt(r, c);
	});
	elCanvas.addEventListener('mousemove', e => {
		if (!sprState.isDrawing) return;
		const { r, c } = cellFromEvent(e);
		paintAt(r, c);
	});
	window.addEventListener('mouseup', () => { sprState.isDrawing = false; });
	elCanvas.addEventListener('mouseleave', () => { sprState.isDrawing = false; });

	// ツール
	document.getElementById('sprite-tool-pen').addEventListener('click', () => setTool('pen'));
	document.getElementById('sprite-tool-erase').addEventListener('click', () => setTool('erase'));
	document.getElementById('sprite-flip-btn').addEventListener('click', flipCurrentFrame);
	document.getElementById('sprite-clear-btn').addEventListener('click', clearFrame);

	// グリッドサイズ
	document.getElementById('sprite-resize-btn').addEventListener('click', () => {
		applyGridSize(document.getElementById('sprite-grid-size').value);
	});

	// パレット
	document.getElementById('sprite-set-color-btn').addEventListener('click', () => {
		setSelectedColor(elColorInput.value);
	});
	document.getElementById('sprite-add-color-btn').addEventListener('click', () => {
		addColor(elColorInput.value);
	});
	elColorInput.addEventListener('input', () => {
		// ライブ反映（選択色が透明以外なら）
		if (sprState.selColor > 0) setSelectedColor(elColorInput.value);
	});

	// フレーム
	document.getElementById('sprite-add-frame-btn').addEventListener('click', addFrame);
	document.getElementById('sprite-dup-frame-btn').addEventListener('click', dupFrame);
	document.getElementById('sprite-del-frame-btn').addEventListener('click', delFrame);
	document.getElementById('sprite-play-btn').addEventListener('click', togglePlay);

	// 読込：スプライト選択を変えたら対応パレットを自動で合わせる
	elLoadName.addEventListener('change', syncPalToSprite);
	document.getElementById('sprite-load-btn').addEventListener('click', loadExisting);

	// エクスポート
	document.getElementById('sprite-export-btn').addEventListener('click', exportCode);
	document.getElementById('sprite-copy-btn').addEventListener('click', copyExport);

	populateLoadSelectors();
	renderPalette();
	renderFrames();
	renderCanvas();
}

// ビューを離れたら再生を止める
export function onLeaveSpriteEditor() {
	stopPlay();
}

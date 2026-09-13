// ── editor-canvas.js ── ステージキャンバス描画・マウス操作 ────
import { TILE, TILE_META, BG_TILES, makeEmptyStage } from '../shared/tiles.js';
import { ENEMY_TILES } from '../shared/enemies.js';
import { isTestLayer, gameLayerEntries } from '../shared/layers.js';
import {
	state, stageKey, getCurrentStage, getCurrentStages,
	stageLabelEl, stageInfoEl, borderWarnEl, cellInfoEl, countTile,
} from './editor-state.js';
import { drawSpriteAt } from './editor-palette.js';
import { describeCell, makeDrawLog } from '../shared/cell-appearance.js';

export const canvas    = document.getElementById('stage-canvas');
export const canvasCtx = canvas.getContext('2d');
export const CELL_SIZE = 40;

// 11b：このキャンバスが実際に何を描いたかの記録（`"r,c"` → { base, sprs, icon }）。
// tests/editor-game-parity.spec.js が実ゲーム・ワールドプレビューと突き合わせて読む。
// 描画手順の中で押す＝describeCell の答えの写しではない（写すと食い違いを検出できない）。
export const editorDrawLog = new Map();
if (typeof window !== 'undefined') window.__editorDrawLog = editorDrawLog;

export function drawCell(c, r, tileChar) {
	const sd = getCurrentStage();
	const x = c * CELL_SIZE, y = r * CELL_SIZE;

	// 🔴 「このセルに何を描くか」は shared/cell-appearance.js だけが決める（11b）。
	//    エディタ・ワールドプレビュー・実ゲームの3系が同じ記述を読み、それぞれの画材で
	//    描く＝「エディタでは緑の四角なのにゲームでは島の角」のような食い違いを構造で消す。
	//    ここに独自の判断（下地の色・肌・変種・連結・扉の連なり）を書き足してはいけない。
	// ⚠ 隣画面の帯（drawNeighborEdges）は r/c が半端な値＝そのセルのタイル文字を明示的に渡す。
	const d = describeCell(sd, r, c, tileChar);
	const log = makeDrawLog();

	canvasCtx.fillStyle = d.baseColor;
	canvasCtx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
	canvasCtx.strokeStyle = 'rgba(0,0,0,0.3)';
	canvasCtx.lineWidth = 0.5;
	canvasCtx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);

	const paint = (spr, pal, flipX = false) => {
		if (!drawSpriteAt(canvasCtx, spr, pal, x, y, CELL_SIZE, CELL_SIZE, flipX)) return false;
		log.sprs.push(`${spr}${flipX ? '!' : ''}@${pal}`);
		return true;
	};

	// ① 下地（bgTiles）。橋のように連結する下地は部品で、地面は変種＋継ぎ目を解決した1枚で。
	if (d.groundConnect) for (const spr of d.groundConnect.sprs) paint(spr, d.groundConnect.pal);
	else if (d.ground)   paint(d.ground.spr, d.ground.pal);

	// ② tiles 層。連結タイル（橋・家・柵）は部品を重ね、それ以外は物の絵を1枚。
	if (d.objConnect) {
		for (const spr of d.objConnect.sprs) paint(spr, d.objConnect.pal);
	} else if (d.obj) {
		// 敵・プレイヤー（role='entity'）もここで描く＝配置が見えないと編集できない。
		// ゲームは実体として動かす（render-chars.js）＝盤面には描かない＝意図した差。
		paint(d.obj.spr, d.obj.pal, d.obj.flipX);
	} else if (d.icon) {
		// 絵を持たないタイルは文字で示す（エディタだけの目印＝ゲームは CSS の色だけ）
		canvasCtx.font = `${CELL_SIZE * 0.5}px sans-serif`;
		canvasCtx.textAlign = 'center'; canvasCtx.textBaseline = 'middle';
		canvasCtx.fillStyle = '#fff';
		canvasCtx.fillText(d.icon, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
		log.icon = d.icon;
	}

	// 隣画面の帯（drawNeighborEdges）は r/c が半端＝このステージのセルではない∴記録しない。
	if (Number.isInteger(r) && Number.isInteger(c)) {
		editorDrawLog.set(`${r},${c}`, { base: d.baseColor, sprs: log.sprs, icon: log.icon });
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
		<div>敵: <b>${countTile(sd, ENEMY_TILES)}</b></div>
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
	editorDrawLog.clear();   // 前の（大きい）ステージの記録が残らないように

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
	const fx = sd.fluteEffect;
	const fluteTypeEl = document.getElementById('stage-flute-type');
	if (fluteTypeEl) {
		fluteTypeEl.value = fx?.type ?? '';
		const warpFields = document.getElementById('stage-flute-warp-fields');
		if (warpFields) warpFields.style.display = fx?.type === 'warp' ? '' : 'none';
		document.getElementById('stage-flute-layer').value   = fx?.layer   ?? '';
		document.getElementById('stage-flute-stage').value   = fx?.stage   ?? '';
		document.getElementById('stage-flute-row').value     = fx?.row     ?? '';
		document.getElementById('stage-flute-col').value     = fx?.col     ?? '';
		document.getElementById('stage-flute-message').value = fx?.message ?? '';
	}
	const initColorEl = document.getElementById('stage-init-active-color');
	if (initColorEl) initColorEl.value = sd.initActiveColor ?? '';
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
		// 看板の本文は signData にも置ける（ゲームはこちらを先に読む）∴両方消す
		// ＝片方だけだと、タイルを消したのに本文（と教える目的地）が残る。
		delete sd.signData?.[posKey];
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
				// PLAYER('@') の重複消去。走査範囲は本編とテストレイヤーで違う：
				//  - 本編：ゲーム開始位置は1箇所だけ（editor-io.js buildSaveData が最初の '@' を
				//    startPos にする）→ 本編レイヤー全体から消す。
				//  - テストレイヤー：各検証ステージが自分のスポーン地点を持つ（fish_swim と
				//    lurk_shark は別々に '@' が要る）→ 編集中のステージ内だけで消す。
				//    ここを全レイヤー走査にすると、テストステージに '@' を置くだけで
				//    本編の開始位置が消える（2026-07-25 テストレイヤー移設時に判明）。
				const stagesToScan = isTestLayer(state.currentLayer)
					? [sd]
					: gameLayerEntries(state.mapData).flatMap(([, ld]) => Object.values(ld.stages ?? {}));
				for (const s of stagesToScan) {
					for (let pr = 0; pr < s.rows; pr++)
						for (let pc = 0; pc < s.cols; pc++)
							if (s.tiles[pr][pc] === TILE.PLAYER) s.tiles[pr][pc] = TILE.FLOOR;
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

	document.getElementById('stage-flute-type').addEventListener('change', e => {
		const warpFields = document.getElementById('stage-flute-warp-fields');
		if (warpFields) warpFields.style.display = e.target.value === 'warp' ? '' : 'none';
	});

	document.getElementById('btn-save-stage-settings').addEventListener('click', () => {
		const sd = getCurrentStage();
		if (!sd) return;
		sd.isBossRoom = document.getElementById('stage-is-boss-room').checked;
		const bgmVal  = document.getElementById('stage-bgm-override').value;
		if (bgmVal) sd.bgm = bgmVal;
		else delete sd.bgm;
		// 🎵 笛の効果（fluteEffect）
		const fluteType = document.getElementById('stage-flute-type').value;
		if (!fluteType) {
			delete sd.fluteEffect;
		} else if (fluteType === 'reveal') {
			sd.fluteEffect = { type: 'reveal' };
			const msg = document.getElementById('stage-flute-message').value.trim();
			if (msg) sd.fluteEffect.message = msg;
		} else if (fluteType === 'warp') {
			const layer = document.getElementById('stage-flute-layer').value.trim();
			const stage = document.getElementById('stage-flute-stage').value.trim();
			if (!layer || !stage) { alert('ワープ先のレイヤーとステージを入力してください'); return; }
			const rowVal = document.getElementById('stage-flute-row').value.trim();
			const colVal = document.getElementById('stage-flute-col').value.trim();
			const msg    = document.getElementById('stage-flute-message').value.trim();
			sd.fluteEffect = { type: 'warp', layer, stage };
			if (rowVal !== '') sd.fluteEffect.row = Number(rowVal);
			if (colVal !== '') sd.fluteEffect.col = Number(colVal);
			if (msg)           sd.fluteEffect.message = msg;
		}
		// Phase 5-1: initActiveColor（色スイッチの初期アクティブ色）
		const initColorSaveEl = document.getElementById('stage-init-active-color');
		if (initColorSaveEl) {
			const cv = initColorSaveEl.value.trim();
			if (cv) sd.initActiveColor = cv;
			else delete sd.initActiveColor;
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

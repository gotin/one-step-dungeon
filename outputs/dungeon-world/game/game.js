// ── Dungeon World – game.js (DOM sprite renderer) ────────────
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { playSound, playBgm, stopBgm, resumeAudio } from '../shared/sounds.js';
import { makeSprite, startAnimLoop, redrawAnimSprites, drawSprite, SPRITES, PAL } from '../shared/sprites.js';

// ── RPG params ────────────────────────────────────────────────
const EXP_TABLE = [0, 10, 25, 45, 70, 100, 140, 190, 250, 320, 400];
function expToNext(lv) { return (EXP_TABLE[lv] ?? 999) - (EXP_TABLE[lv - 1] ?? 0); }

// ── ダメージ計算 ─────────────────────────────────────────────
function calcDamage(atk, def) {
	return Math.max(1, atk - def);
}

// ── アニメーションヘルパー ────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// セルを取得
function getCellEl(r, c) {
	const idx = r * stageData.cols + c;
	return boardEl.children[idx] ?? null;
}

// 剣突きエフェクト：向いている方向の「隣セル」に表示（ゼルダ式）
function showSwordSlash(dir) {
	const [dr, dc] = DIR_DELTA[dir];
	const tr = player.row + dr, tc = player.col + dc;
	const targetCell = getCellEl(tr, tc) ?? getCellEl(player.row, player.col);
	if (!targetCell) return;
	const el = document.createElement('div');
	el.className = `sword-thrust dir-${dir}`;
	targetCell.append(el);
	setTimeout(() => el.remove(), 250);
}

// ダメージフラッシュ（赤）をセルに表示
function showDamageFlash(r, c) {
	const cell = getCellEl(r, c);
	if (!cell) return;
	const el = document.createElement('div');
	el.className = 'damage-flash';
	cell.append(el);
	setTimeout(() => el.remove(), 350);
}

// ダメージ数字ポップアップ
function showDmgPopup(r, c, dmg, isEnemy) {
	const cell = getCellEl(r, c);
	if (!cell) return;
	const el = document.createElement('div');
	el.className = `dmg-popup ${isEnemy ? 'enemy-dmg' : 'player-dmg'}`;
	el.textContent = `-${dmg}`;
	cell.append(el);
	setTimeout(() => el.remove(), 700);
}

// 敵の体当たりアニメーション（プレイヤー方向に移動）
function showEnemyCharge(e) {
	const cell = getCellEl(e.row, e.col);
	if (!cell) return;
	const dr = Math.sign(player.row - e.row);
	const dc = Math.sign(player.col - e.col);
	cell.style.setProperty('--charge-dir', `translate(${dc * 12}px, ${dr * 12}px)`);
	cell.classList.add('enemy-charging');
	setTimeout(() => {
		cell.classList.remove('enemy-charging');
		cell.style.removeProperty('--charge-dir');
	}, 350);
}

// ── Tile display ──────────────────────────────────────────────
const TILE_CHAR = {
	[TILE.WALL]:   { bg: '#3a4448', char: null },
	[TILE.FLOOR]:  { bg: '#1a2228', char: null },
	[TILE.WATER]:  { bg: '#0e2040', char: '≈'  },
	[TILE.SWITCH]: { bg: '#1a3010', char: '⊙'  },
	[TILE.GATE]:   { bg: '#1a2c40', char: '⊟'  },
	[TILE.DOOR]:   { bg: '#2a1a08', char: '⊞'  },
	[TILE.KEY]:    { bg: '#1a2228', char: '🗝'  },
	[TILE.CHEST]:  { bg: '#1a2228', char: '☐'  },
	[TILE.STONE]:  { bg: '#1a2228', char: '●'  },
	[TILE.PLAYER]: { bg: '#1a2228', char: null  },
};

// ── State ─────────────────────────────────────────────────────
let mapData   = null;
let stageKey  = null;
let stageData = null;
let stageState = {};

let player = {
	row: 0, col: 0, hp: 20, maxHp: 20, atk: 4, def: 1, lv: 1, exp: 0, keys: 0,
	weapon: null,
	armor:  null,
};
let enemies = [];
let heroDir = 'down';

// Undo 用スナップショット（最大50手）
const history = [];
const MAX_HISTORY = 50;

function snapshot() {
	return {
		player:  { ...player },
		enemies: enemies.map(e => ({ ...e })),
		heroDir,
		ss: {
			openGates:       new Set(getSS(stageKey).openGates),
			pickedKeys:      new Set(getSS(stageKey).pickedKeys),
			defeatedEnemies: new Set(getSS(stageKey).defeatedEnemies),
			openedChests:    new Set(getSS(stageKey).openedChests),
			objects:         { ...getSS(stageKey).objects },
		},
	};
}

function pushHistory() {
	history.push(snapshot());
	if (history.length > MAX_HISTORY) history.shift();
}

function undo() {
	const snap = history.pop();
	if (!snap) { pulse('これ以上戻れません'); return; }
	player  = { ...snap.player };
	enemies = snap.enemies.map(e => ({ ...e }));
	heroDir = snap.heroDir;
	const ss = getSS(stageKey);
	ss.openGates       = new Set(snap.ss.openGates);
	ss.pickedKeys      = new Set(snap.ss.pickedKeys);
	ss.defeatedEnemies = new Set(snap.ss.defeatedEnemies);
	ss.openedChests    = new Set(snap.ss.openedChests);
	ss.objects         = { ...snap.ss.objects };
	render();
	updateHud();
}

// ── DOM ───────────────────────────────────────────────────────
const boardEl      = document.getElementById('board');
const stageLabelEl = document.getElementById('stage-label');
const hudHpEl      = document.getElementById('hud-hp');
const hudLvEl      = document.getElementById('hud-lv');
const hudExpEl     = document.getElementById('hud-exp');
const hudKeysEl    = document.getElementById('hud-keys');
const hudEquipEl   = document.getElementById('hud-equip');
const messageEl    = document.getElementById('message');
const overlayEl    = document.getElementById('message-overlay');
const overlayTxtEl = document.getElementById('overlay-text');
const overlayBtnEl = document.getElementById('overlay-btn');
const itemDialogEl     = document.getElementById('item-dialog');
const itemDialogNameEl = document.getElementById('item-dialog-name');
const itemDialogDescEl = document.getElementById('item-dialog-desc');
const itemDialogBtnEl  = document.getElementById('item-dialog-btn');
let _itemDialogCb = null;

function showItemDialog(name, desc, onClose) {
	itemDialogNameEl.textContent = name;
	itemDialogDescEl.textContent = desc;
	itemDialogEl.classList.remove('hidden');
	_itemDialogCb = onClose ?? null;
}

itemDialogBtnEl.addEventListener('click', () => {
	itemDialogEl.classList.add('hidden');
	if (_itemDialogCb) { _itemDialogCb(); _itemDialogCb = null; }
});

// ── Load ──────────────────────────────────────────────────────
async function loadMapData() {
	try {
		const res = await fetch('../work/dungeon-world.json');
		if (res.ok) {
			const data = await res.json();
			if (data?.version === 1 && data?.stages) { mapData = data; return true; }
		}
	} catch { /* fallthrough */ }
	const raw = localStorage.getItem('dungeonWorldMapData');
	if (!raw) return false;
	try { mapData = JSON.parse(raw); return true; } catch { return false; }
}

function findStart() {
	for (const [key, sd] of Object.entries(mapData.stages)) {
		for (let r = 0; r < sd.rows; r++)
			for (let c = 0; c < sd.cols; c++)
				if (sd.tiles[r][c] === TILE.PLAYER) return { key, row: r, col: c };
	}
	const firstKey = Object.keys(mapData.stages)[0];
	return { key: firstKey, row: 1, col: 1 };
}

// ── Stage state ───────────────────────────────────────────────
function getSS(key) {
	if (!stageState[key]) {
		const sd = mapData.stages[key];
		stageState[key] = {
			openGates:       new Set(),
			pickedKeys:      new Set(),
			defeatedEnemies: new Set(),
			openedChests:    new Set(),
			objects:         { ...(sd.objects || {}) },
		};
	}
	return stageState[key];
}

// ── Enter stage ───────────────────────────────────────────────
// このステージに最初に入った位置（リセット時に戻る場所）
let stageEntryRow = 0, stageEntryCol = 0;

function enterStage(key, pRow, pCol) {
	const sd = mapData.stages[key];
	if (!sd) { pulse('マップデータなし'); return; }
	stageKey  = key;
	stageData = sd;
	// ステージが変わった場合のみエントリー位置を更新
	stageEntryRow = pRow;
	stageEntryCol = pCol;
	const [sx, sy] = key.split(',').map(Number);
	stageLabelEl.textContent = `ステージ (${sx}, ${sy})`;
	player.row = pRow;
	player.col = pCol;
	buildEnemies(key, sd);
	render();
	updateHud();
}

function buildEnemies(key, sd) {
	const ss = getSS(key);
	enemies = [];
	let id = 0;
	for (let r = 0; r < sd.rows; r++) {
		for (let c = 0; c < sd.cols; c++) {
			const t = sd.tiles[r][c];
			if (!(t in ENEMY_META)) continue;
			if (ss.defeatedEnemies.has(`${r},${c}`)) continue;
			const base = ENEMY_META[t];
			const custom = (sd.enemyParams || {})[`${r},${c}`] || {};
			enemies.push({
				id: id++, row: r, col: c, type: t,
				hp:    custom.hp  ?? base.hp,
				maxHp: custom.hp  ?? base.hp,
				atk:   custom.atk ?? base.atk,
				def:   custom.def ?? base.def,
				exp:   custom.exp ?? base.exp,
				aggressive: base.aggressive,
			});
		}
	}
}

// ── Tile helpers ──────────────────────────────────────────────
function tileAt(r, c) {
	if (!stageData || r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) return TILE.WALL;
	return stageData.tiles[r][c];
}

function isPassable(r, c) {
	if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) return true;
	const ss = getSS(stageKey);
	const t  = tileAt(r, c);
	if (t === TILE.WALL || t === TILE.WATER) return false;
	if (t === TILE.GATE && !ss.openGates.has(`${r},${c}`)) return false;
	if (t === TILE.DOOR && !ss.openGates.has(`${r},${c}`)) return false;
	if (ss.objects[`${r},${c}`]) return false;
	return true;
}

// ── 向き ─────────────────────────────────────────────────────
const DIR_DELTA = { up: [-1,0], down: [1,0], left: [0,-1], right: [0,1] };

// ── 攻撃（向いている方向の隣セルに判定）──────────────────────
let _battleBusy = false;

async function playerAttack() {
	if (overlayEl && !overlayEl.classList.contains('hidden')) return;
	if (itemDialogEl && !itemDialogEl.classList.contains('hidden')) return;
	if (_battleBusy) return;
	_battleBusy = true;
	pushHistory();

	const [dr, dc] = DIR_DELTA[heroDir];
	const tr = player.row + dr, tc = player.col + dc;
	const enemy = enemies.find(e => e.row === tr && e.col === tc);

	// ① プレイヤー剣振り
	playSound('slash');
	showSwordSlash(heroDir);
	await sleep(120);

	if (enemy) {
		// ② 命中
		const dmg = calcDamage(player.atk, enemy.def);
		enemy.hp -= dmg;
		playSound('hit');
		showDamageFlash(tr, tc);
		showDmgPopup(tr, tc, dmg, true);
		render();
		if (enemy.hp <= 0) {
			getSS(stageKey).defeatedEnemies.add(`${enemy.row},${enemy.col}`);
			enemies = enemies.filter(e => e.id !== enemy.id);
			gainExp(enemy.exp);
			pulse(`${ENEMY_META[enemy.type].name}を倒した！（+${enemy.exp} EXP）`);
			render();
			updateHud();
			_battleBusy = false;
			return;
		} else {
			pulse(`${ENEMY_META[enemy.type].name}に ${dmg} ダメージ！（残HP ${enemy.hp}）`);
		}
		await sleep(200);

		// ③ 敵のターン（全敵が行動）
		await enemyTurnAnimated();
	} else {
		pulse('空振り…');
		await sleep(150);
		await enemyTurnAnimated();
	}

	render();
	updateHud();
	_battleBusy = false;
}

// ── 移動 ─────────────────────────────────────────────────────
function move(dir) {
	if (overlayEl && !overlayEl.classList.contains('hidden')) return;
	if (itemDialogEl && !itemDialogEl.classList.contains('hidden')) return;
	heroDir = dir;
	const [dr, dc] = DIR_DELTA[dir];
	const nr = player.row + dr, nc = player.col + dc;

	if (nr < 0 || nr >= stageData.rows || nc < 0 || nc >= stageData.cols) {
		tryTransition(dr, dc); return;
	}

	const t   = tileAt(nr, nc);
	const ss  = getSS(stageKey);
	const key = `${nr},${nc}`;

	if (t === TILE.GATE && !ss.openGates.has(key)) {
		playSound('miss'); pulse('ゲートが閉じている（スイッチを探せ）'); return;
	}
	if (t === TILE.DOOR && !ss.openGates.has(key)) {
		if (player.keys > 0) {
			player.keys--;
			ss.openGates.add(key);
			playSound('doorOpen'); pulse('扉を鍵で開けた！');
		} else {
			playSound('miss'); pulse('鍵が必要だ'); return;
		}
	}

	if (ss.objects[key]) {
		const pr = nr + dr, pc = nc + dc;
		const pushKey = `${pr},${pc}`;
		if (pr >= 0 && pr < stageData.rows && pc >= 0 && pc < stageData.cols
			&& !ss.objects[pushKey] && isPassable(pr, pc)
			&& !enemies.find(e => e.row === pr && e.col === pc)) {
			delete ss.objects[key];
			ss.objects[pushKey] = TILE.STONE;
			checkSwitches(pr, pc);
		} else { playSound('miss'); pulse('石は押せない'); return; }
	}

	if (enemies.find(e => e.row === nr && e.col === nc)) {
		pulse('敵がいる（スペースキーで攻撃）');
		return;
	}

	// 姫のセルには移動できないが、隣接したらダイアログを表示してエンディングへ
	if (t === TILE.PRINCESS) {
		stopBgm();       // ダイアログ表示と同時にBGMを即時停止
		playSound('key');
		showItemDialog('👸 姫', 'ありがとう！あなたのおかげで助かりました！', () => {
			startEnding();
		});
		return;
	}

	if (!isPassable(nr, nc)) { playSound('miss'); return; }

	pushHistory();
	player.row = nr; player.col = nc;
	playSound('move');
	pickItem(nr, nc);
	updateAllSwitches();

	enemyTurnAfterMove();
	render();
	updateHud();
}

// ── 向き変更（Shift+矢印：移動しない）──────────────────────────
function turnOnly(dir) {
	if (overlayEl && !overlayEl.classList.contains('hidden')) return;
	if (itemDialogEl && !itemDialogEl.classList.contains('hidden')) return;
	pushHistory();
	heroDir = dir;
	render();
}

// ── ステージ遷移 ─────────────────────────────────────────────
function tryTransition(dr, dc) {
	const [sx, sy] = stageKey.split(',').map(Number);
	let nx = sx, ny = sy, newRow = player.row, newCol = player.col;
	if (dr === -1) { ny = sy - 1; newRow = stageData.rows - 1; newCol = player.col; }
	if (dr ===  1) { ny = sy + 1; newRow = 0;                  newCol = player.col; }
	if (dc === -1) { nx = sx - 1; newCol = stageData.cols - 1; newRow = player.row; }
	if (dc ===  1) { nx = sx + 1; newCol = 0;                  newRow = player.row; }
	const nKey = `${nx},${ny}`;
	if (!mapData.stages[nKey]) { pulse('この方向は行けない'); return; }
	enterStage(nKey, newRow, newCol);
}

// ── アイテム取得 ─────────────────────────────────────────────
function pickItem(r, c) {
	const t = tileAt(r, c);
	const ss = getSS(stageKey);
	const posKey = `${r},${c}`;
	if (t === TILE.KEY && !ss.pickedKeys.has(posKey)) {
		ss.pickedKeys.add(posKey);
		player.keys++;
		playSound('key'); pulse('🔑 鍵を拾った！');
	}
	if (t === TILE.CHEST && !ss.openedChests.has(posKey)) {
		ss.openedChests.add(posKey);
		const content = (stageData.chestContents || {})[posKey];
		playSound('chest');
		if (!content?.name) {
			showItemDialog('空の宝箱', 'この宝箱は空だった…');
		} else if (content.type === 'hp') {
			const heal = content.value || 5;
			player.hp = Math.min(player.maxHp, player.hp + heal);
			showItemDialog(content.name, `HP を ${heal} 回復した！\n（現在 ${player.hp}/${player.maxHp}）`);
		} else if (content.type === 'weapon') {
			const newAtk = content.value || 1;
			const curAtk = player.weapon?.atk ?? 0;
			if (newAtk <= curAtk) {
				showItemDialog(`⚔️ ${content.name}`, `今の武器（ATK+${curAtk}）のほうが強いので装備しなかった。`);
			} else {
				const oldPlayerAtk = player.atk;
				player.weapon = { name: content.name, atk: newAtk };
				player.atk = 4 + (player.lv - 1) + newAtk;
				const diff = player.atk - oldPlayerAtk;
				showItemDialog(`⚔️ ${content.name}`, `武器を装備した！\n攻撃力 ${oldPlayerAtk} → ${player.atk}（+${diff}）`, () => updateHud());
			}
		} else if (content.type === 'armor') {
			const oldDef = player.def;
			player.armor = { name: content.name, def: content.value || 1 };
			player.def = 1 + (player.armor?.def ?? 0);
			const diff = player.def - oldDef;
			showItemDialog(`🛡 ${content.name}`, `防具を装備した！\n防御力 ${oldDef} → ${player.def}（+${diff}）`, () => updateHud());
		} else {
			showItemDialog(content.name, 'アイテムを入手した！');
		}
		updateHud();
	}
	if (t === TILE.SWITCH) checkSwitches(r, c);
}

// ── スイッチ・ゲート ──────────────────────────────────────────
function updateAllSwitches() {
	const ss = getSS(stageKey);
	const { rows, cols } = stageData;
	const allSwitches = [];
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++)
			if (stageData.tiles[r][c] === TILE.SWITCH) allSwitches.push(`${r},${c}`);

	if (allSwitches.length === 0) return;

	const allPressed = allSwitches.every(swKey => {
		const [swR, swC] = swKey.split(',').map(Number);
		if (player.row === swR && player.col === swC) return true;
		if (ss.objects[swKey]) return true;
		return false;
	});

	const allGateIds = [];
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++)
			if (stageData.tiles[r][c] === TILE.GATE) allGateIds.push(`${r},${c}`);

	const wasAnyOpen = allGateIds.some(id => ss.openGates.has(id));
	if (allPressed && !wasAnyOpen) {
		for (const id of allGateIds) ss.openGates.add(id);
		playSound('gateOpen'); pulse('スイッチが全部踏まれた！ゲートが開いた！');
	} else if (!allPressed && wasAnyOpen) {
		for (const id of allGateIds) ss.openGates.delete(id);
		playSound('switch'); pulse('スイッチが解除された…ゲートが閉まった');
	} else if (!allPressed) {
		playSound('switch');
	}
}

function checkSwitches(r, c) {
	if (tileAt(r, c) !== TILE.SWITCH) return;
	updateAllSwitches();
}

// ── 敵ターン（アニメーション付き非同期）──────────────────────
async function enemyTurnAnimated() {
	for (const e of [...enemies]) {
		if (!enemies.find(x => x.id === e.id)) continue;
		const adj = isAdjacent(e, player);
		if (adj && e.aggressive) {
			showEnemyCharge(e);
			playSound('combat');
			await sleep(150);
			const dmg = calcDamage(e.atk, player.def);
			player.hp -= dmg;
			showDamageFlash(player.row, player.col);
			showDmgPopup(player.row, player.col, dmg, false);
			pulse(`${ENEMY_META[e.type].name}に ${dmg} ダメージ！`);
			updateHud();
			if (player.hp <= 0) { player.hp = 0; updateHud(); render(); gameover(); return; }
			await sleep(150);
		} else {
			enemyMove(e);
		}
	}
}

// 攻撃後のターン
function enemyTurn() {
	for (const e of enemies) {
		const adj = isAdjacent(e, player);
		if (adj && e.aggressive) {
			enemyAttackPlayer(e);
		} else {
			enemyMove(e);
		}
		if (player.hp <= 0) { player.hp = 0; updateHud(); gameover(); return; }
	}
}

// 移動後のターン
function enemyTurnAfterMove() {
	for (const e of enemies) {
		if (isAdjacent(e, player) && e.aggressive) {
			enemyAttackPlayer(e);
			if (player.hp <= 0) { player.hp = 0; updateHud(); gameover(); return; }
		}
	}
	for (const e of enemies) {
		if (!isAdjacent(e, player)) {
			enemyMove(e);
		}
	}
}

function isAdjacent(a, b) {
	return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function enemyAttackPlayer(e) {
	const dmg = calcDamage(e.atk, player.def);
	player.hp -= dmg;
	playSound('combat');
	pulse(`${ENEMY_META[e.type].name}に ${dmg} ダメージ！`);
}

function enemyMove(e) {
	if (e.type === TILE.PATROL)         movePatrol(e);
	else if (e.type === TILE.CHASER)    moveChaser(e);
	else if (e.type === TILE.SENTRY)    moveChaser(e);
	else if (e.type === TILE.BOSS)      moveChaser(e);
	else if (e.type === TILE.DARK_LORD) moveChaser(e);
}

function movePatrol(e) {
	const dirs = [[-1,0],[0,1],[1,0],[0,-1]];
	const d = dirs[Math.random() * 4 | 0];
	const nr = e.row + d[0], nc = e.col + d[1];
	if (canEnemyMove(nr, nc, e)) { e.row = nr; e.col = nc; }
}

function moveChaser(e) {
	const dr = Math.sign(player.row - e.row), dc = Math.sign(player.col - e.col);
	for (const [tr, tc] of [[dr,dc],[dr,0],[0,dc]]) {
		if (!tr && !tc) continue;
		const nr = e.row + tr, nc = e.col + tc;
		if (canEnemyMove(nr, nc, e)) { e.row = nr; e.col = nc; break; }
	}
}

function canEnemyMove(nr, nc, me) {
	if (nr < 0 || nr >= stageData.rows || nc < 0 || nc >= stageData.cols) return false;
	if (!isPassable(nr, nc)) return false;
	if (nr === player.row && nc === player.col) return false;
	if (enemies.find(o => o.id !== me.id && o.row === nr && o.col === nc)) return false;
	return true;
}

function gainExp(amount) {
	player.exp += amount;
	const need = expToNext(player.lv);
	if (player.exp >= need && player.lv < 10) {
		player.exp -= need;
		player.lv++;
		player.maxHp += 5; player.hp = player.maxHp;
		player.atk = 4 + (player.lv - 1) + (player.weapon?.atk ?? 0);
		playSound('levelup'); pulse(`レベルアップ！ Lv.${player.lv} HP全回復`);
	}
}

// ── Render ────────────────────────────────────────────────────
function render() {
	if (!stageData) return;
	const { rows, cols } = stageData;
	const ss = getSS(stageKey);

	boardEl.style.setProperty('--cols', cols);
	boardEl.innerHTML = '';

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const cell = document.createElement('div');
			cell.className = 'cell';

			const rawTile = stageData.tiles[r][c];
			const posKey  = `${r},${c}`;
			let tileBg = (TILE_CHAR[rawTile]?.bg) ?? '#1a2228';

			const isOpenGate = (rawTile === TILE.GATE || rawTile === TILE.DOOR) && ss.openGates.has(posKey);
			if (isOpenGate) tileBg = TILE_CHAR[TILE.FLOOR].bg;
			cell.style.background = tileBg;

			if (ss.objects[posKey]) {
				const cv = makeSprite('block', 'block', false);
				if (cv) {
					if (rawTile === TILE.SWITCH) cv.classList.add('stone-on-switch');
					cell.append(cv);
				}
			} else if (!isOpenGate) {
				let sprName = null, palName = null, animated = false;
				if (rawTile === TILE.GATE) {
					sprName = 'gateG'; palName = 'gateG'; animated = true;
				} else if (rawTile === TILE.DOOR && !ss.openGates.has(posKey)) {
					const cv = makeSprite('door', 'door', false);
					if (cv) {
						if (player.keys > 0) cv.classList.add('door-unlocked');
						cell.append(cv);
					}
				} else if (rawTile === TILE.SWITCH) {
					sprName = 'swG'; palName = 'swG'; animated = true;
				} else if (rawTile === TILE.KEY && !ss.pickedKeys.has(posKey)) {
					const cv = makeSprite('key', 'key', true);
					if (cv) { cv.classList.add('key-sprite'); cell.append(cv); }
				} else if (rawTile === TILE.CHEST) {
					const isOpened = ss.openedChests.has(posKey);
					const cv = makeSprite(isOpened ? 'chestOpen' : 'chest', 'chest', !isOpened);
					if (cv) cell.append(cv);
				} else if (rawTile === TILE.STONE) {
					const cv = makeSprite('block', 'block', false);
					if (cv) cell.append(cv);
				} else if (rawTile === TILE.WATER) {
					const cv = makeSprite('water', 'water', true);
					if (cv) cell.append(cv);
				} else if (rawTile === TILE.PRINCESS) {
					const cv = makeSprite('princess', 'princess', true);
					if (cv) cell.append(cv);
				}
				if (sprName) {
					const cv = makeSprite(sprName, palName, animated);
					if (cv) cell.append(cv);
				}
			} else {
				const cv = makeSprite('gateGopen', 'gateG', false);
				if (cv) { cv.style.opacity = '0.5'; cell.append(cv); }
			}

			// 敵（HPバー付き）
			const enemy = enemies.find(e => e.row === r && e.col === c);
			if (enemy) {
				const m = ENEMY_META[enemy.type];
				if (m.aura) {
					const smoke = document.createElement('div');
					smoke.className = 'dark-lord-aura-smoke';
					cell.append(smoke);
					const ring2 = document.createElement('div');
					ring2.className = 'dark-lord-aura-2';
					cell.append(ring2);
					const ring1 = document.createElement('div');
					ring1.className = 'dark-lord-aura';
					cell.append(ring1);
				}
				const cv = makeSprite(m.sprite, m.pal, true);
				if (cv) cell.append(cv);
				const hpBar = document.createElement('div');
				hpBar.className = 'enemy-hp-bar';
				const hpFill = document.createElement('div');
				hpFill.className = 'enemy-hp-fill';
				hpFill.style.width = `${Math.max(0, enemy.hp / enemy.maxHp * 100)}%`;
				hpBar.append(hpFill);
				cell.append(hpBar);
			}

			// プレイヤー（向き矢印付き）
			if (r === player.row && c === player.col) {
				const dirKey = { right: 'R', left: 'L', up: 'U', down: 'D' };
				const sname  = 'hero' + (dirKey[heroDir] || 'D');
				const cv = makeSprite(sname, 'hero', true);
				if (cv) cell.append(cv);
				const arrow = document.createElement('div');
				arrow.className = `dir-arrow dir-${heroDir}`;
				cell.append(arrow);
			}

			boardEl.append(cell);
		}
	}
}

// ── HUD ───────────────────────────────────────────────────────
function updateHud() {
	hudHpEl.textContent  = `❤ ${player.hp}/${player.maxHp}`;
	hudLvEl.textContent  = `Lv.${player.lv}`;
	const need = expToNext(player.lv);
	hudExpEl.textContent = `EXP ${player.exp}/${need}`;
	hudKeysEl.textContent = player.keys > 0 ? `🔑×${player.keys}` : '';
	const atkStr = `⚔️ ATK ${player.atk}`;
	const defStr = `🛡 DEF ${player.def}`;
	const weaponStr = player.weapon ? ` <span class="equip-slot weapon">${player.weapon.name}</span>` : '';
	const armorStr  = player.armor  ? ` <span class="equip-slot armor">${player.armor.name}</span>` : '';
	hudEquipEl.innerHTML = `<span style="color:#e05050">${atkStr}</span>${weaponStr}　<span style="color:#4fc3a0">${defStr}</span>${armorStr}`;
}

let msgTimer = 0;
function pulse(msg) {
	messageEl.textContent = msg;
	messageEl.classList.remove('hidden');
	clearTimeout(msgTimer);
	msgTimer = setTimeout(() => messageEl.classList.add('hidden'), 2500);
}

// ── Reset ─────────────────────────────────────────────────────
function resetStage() {
	if (!stageKey || !stageData) return;
	delete stageState[stageKey];
	// このステージに最初に入った位置に戻る（ステージ遷移で入った端の位置）
	enterStage(stageKey, stageEntryRow, stageEntryCol);
	pulse('ステージをリセットしました (R)');
}

// ── Gameover ──────────────────────────────────────────────────
function gameover() {
	overlayTxtEl.textContent = '💀 GAME OVER';
	overlayEl.classList.remove('hidden');
}

overlayBtnEl.addEventListener('click', () => {
	overlayEl.classList.add('hidden');
	player = { row: 0, col: 0, hp: 20, maxHp: 20, atk: 4, def: 1, lv: 1, exp: 0, keys: 0, weapon: null, armor: null };
	const start = findStart();
	enterStage(start.key, start.row, start.col);
	playBgm(); // ダンジョンBGM再開
});

// ── Ending ────────────────────────────────────────────────────

const AUTHOR = 'Go Kojima';

/** スタッフロール用 HTML を生成して返す */
function buildStaffRollHtml() {
	const roles = [
		'Game Director',
		'Executive Producer',
		'Game Designer',
		'Level Designer',
		'Programmer',
		'Lead Programmer',
		'Character Designer',
		'Pixel Artist',
		'Background Artist',
		'UI/UX Designer',
		'Sound Designer',
		'Music Composer',
		'Story Writer',
		'World Builder',
		'Dungeon Architect',
		'Monster Designer',
		'Lore Creator',
		'QA Lead',
		'Playtester',
		'Special Thanks to',
	];
	let html = `<div class="scroll-title">Dungeon World</div>`;
	for (let i = 0; i < roles.length; i++) {
		const role = roles[i];
		const name = (i === roles.length - 1) ? "Kojima's family" : AUTHOR;
		html += `<div class="scroll-role">${role}</div>`;
		html += `<div class="scroll-name">${name}</div>`;
		html += `<div class="scroll-divider"></div>`;
	}
	html += `<div class="scroll-role">Thank you for playing!</div>`;
	html += `<div class="scroll-name">\u00a9 2026 ${AUTHOR}</div>`;
	return html;
}

/** ステージをゲーム画面と同じDOM+canvasで ending-stage-board に描画する */
function renderEndingStage(sd, ssArg, boardEl) {
	const { rows, cols, tiles } = sd;
	const ss = ssArg ?? {
		openGates: new Set(), pickedKeys: new Set(),
		defeatedEnemies: new Set(), openedChests: new Set(), objects: {}
	};

	boardEl.style.setProperty('--cols', cols);
	boardEl.innerHTML = '';

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const cell = document.createElement('div');
			cell.className = 'cell';
			const rawTile = tiles[r][c];
			const posKey  = `${r},${c}`;
			let tileBg = (TILE_CHAR[rawTile]?.bg) ?? '#1a2228';
			const isOpenGate = (rawTile === TILE.GATE || rawTile === TILE.DOOR) && ss.openGates.has(posKey);
			if (isOpenGate) tileBg = TILE_CHAR[TILE.FLOOR].bg;
			cell.style.background = tileBg;

			if (ss.objects[posKey]) {
				const cv = makeSprite('block', 'block', false);
				if (cv) cell.append(cv);
			} else if (!isOpenGate) {
				let sprName = null, palName = null;
				if (rawTile === TILE.GATE) {
					sprName = 'gateG'; palName = 'gateG';
				} else if (rawTile === TILE.DOOR) {
					const cv = makeSprite('door', 'door', false);
					if (cv) cell.append(cv);
				} else if (rawTile === TILE.SWITCH) {
					sprName = 'swG'; palName = 'swG';
				} else if (rawTile === TILE.KEY && !ss.pickedKeys.has(posKey)) {
					const cv = makeSprite('key', 'key', false);
					if (cv) { cv.classList.add('key-sprite'); cell.append(cv); }
				} else if (rawTile === TILE.CHEST) {
					const isOpened = ss.openedChests.has(posKey);
					const cv = makeSprite(isOpened ? 'chestOpen' : 'chest', 'chest', false);
					if (cv) cell.append(cv);
				} else if (rawTile === TILE.STONE) {
					const cv = makeSprite('block', 'block', false);
					if (cv) cell.append(cv);
				} else if (rawTile === TILE.WATER) {
					const cv = makeSprite('water', 'water', false);
					if (cv) cell.append(cv);
				}
				if (sprName) {
					const cv = makeSprite(sprName, palName, false);
					if (cv) cell.append(cv);
				}
			} else {
				const cv = makeSprite('gateGopen', 'gateG', false);
				if (cv) { cv.style.opacity = '0.5'; cell.append(cv); }
			}

			// 敵スプライト（撃破済みは表示しない）
			const t = rawTile;
			if (t in ENEMY_META && !ss.defeatedEnemies.has(posKey)) {
				const m = ENEMY_META[t];
				const cv = makeSprite(m.sprite, m.pal, false);
				if (cv) cell.append(cv);
			}

			boardEl.append(cell);
		}
	}
}

/** エンディング演出本体 */
async function startEnding() {
	// 1. 入力無効化（_battleBusy = true のまま維持）
	_battleBusy = true;

	// 2. ダンジョンBGMを止めてエンディング曲を再生
	stopBgm();
	playSound('ending');

	// 3. オーバーレイを表示
	const endingOverlayEl = document.getElementById('ending-overlay');
	endingOverlayEl.classList.remove('hidden');

	// 4-1. ステージをDOMボードで表示（ゲーム画面と同一）
	// 60秒 ÷ ステージ数 で均等配分してフェード切り替え（1周したら停止）
	const stageBoardEl  = document.getElementById('ending-stage-board');
	// 表示順：mapData.endingStageOrder があればそれを使用、なければ y→x 昇順で全ステージ
	const stageKeys = (() => {
		if (Array.isArray(mapData.endingStageOrder) && mapData.endingStageOrder.length > 0) {
			return mapData.endingStageOrder.filter(k => mapData.stages[k]);
		}
		return Object.keys(mapData.stages).sort((a, b) => {
			const [ax, ay] = a.split(',').map(Number);
			const [bx, by] = b.split(',').map(Number);
			return ay !== by ? ay - by : ax - bx;
		});
	})();
	// スタッフロール時間の前半80%（約21秒）でステージを1周し、残りは最後のステージで待機
	// ステージ数が多いほど各ステージ表示が短くなる（最低1秒は確保）
	const SCROLL_DURATION = 27000; // スタッフロール表示時間（ms）
	const stageInterval = Math.max(1000, Math.floor(SCROLL_DURATION * 0.8 / stageKeys.length));
	let stageIdx = 0;
	let stageTimer = null;

	function showNextStage() {
		if (stageIdx >= stageKeys.length) {
			// 全ステージを1回表示し終えたら停止
			clearInterval(stageTimer);
			return;
		}
		const key = stageKeys[stageIdx];
		const ss  = stageState[key] ?? null;
		stageBoardEl.style.opacity = '0';
		setTimeout(() => {
			renderEndingStage(mapData.stages[key], ss, stageBoardEl);
			stageBoardEl.style.opacity = '0.8';
		}, 400);
		stageIdx++;
	}
	showNextStage();
	stageTimer = setInterval(showNextStage, stageInterval);

	// 4-2. スタッフロールHTMLを生成して挿入（CSSの ending-scroll-up 60秒が自動で流れる）
	const scrollEl = document.getElementById('ending-scroll');
	scrollEl.innerHTML = buildStaffRollHtml();

	// 5. スタッフロールが画面から消えるタイミング（実測約27秒）でフェーズ2へ
	await sleep(27000);

	clearInterval(stageTimer);

	// 6. フェーズ2を表示
	const phase1El = document.getElementById('ending-phase1');
	const phase2El = document.getElementById('ending-phase2');
	phase1El.style.display = 'none';
	phase2El.classList.remove('hidden');

	// 6-3. ヒーロー（正面向き heroD）と姫を描画
	const hero2CanvasEl    = document.getElementById('ending-hero2-canvas');
	const princessCanvasEl = document.getElementById('ending-princess-canvas');
	drawSprite(hero2CanvasEl,    SPRITES['heroD'],    PAL['hero']);
	drawSprite(princessCanvasEl, SPRITES['princess'], PAL['princess']);

	// 7. クリック/タップ or 5秒後にタイトルへ
	function doReset() {
		endingOverlayEl.classList.add('hidden');
		phase1El.style.display = '';
		phase2El.classList.add('hidden');
		phase2El.removeEventListener('pointerdown', doReset);
		overlayBtnEl.click();
	}
	phase2El.addEventListener('pointerdown', doReset, { once: true });
	phase2El.style.cursor = 'pointer';

	await sleep(5000);
	doReset();
}

// ── Input ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
	const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
	const dir = dirMap[e.key];
	if (dir) {
		e.preventDefault();
		if (e.shiftKey) {
			turnOnly(dir);
		} else {
			move(dir);
		}
		return;
	}
	if (e.key === ' ' || e.key === 's' || e.key === 'S') {
		e.preventDefault(); playerAttack(); return;
	}
	if (e.key === 'r' || e.key === 'R') resetStage();
	if (e.key === 'z' || e.key === 'Z') undo();
});

// タッチボタン
document.querySelectorAll('[data-dir]').forEach(btn => {
	btn.addEventListener('click', () => {
		if (document.getElementById('turn-mode')?.classList.contains('active')) {
			turnOnly(btn.dataset.dir);
		} else {
			move(btn.dataset.dir);
		}
	});
});
document.getElementById('btn-attack')?.addEventListener('click', () => playerAttack());
document.getElementById('btn-undo')?.addEventListener('click', () => undo());
document.getElementById('btn-reset')?.addEventListener('click', () => {
	showItemDialog(
		'↻ ステージをリセット',
		'このステージの進行状況をリセットしますか？\n（獲得した経験値・レベルは保持されます）',
		() => resetStage()
	);
});

const turnModeBtn = document.getElementById('turn-mode');
const turnModeHintEl = document.getElementById('turn-mode-hint');
turnModeBtn?.addEventListener('click', () => {
	const isActive = turnModeBtn.classList.toggle('active');
	if (turnModeHintEl) {
		if (isActive) {
			turnModeHintEl.textContent = '向き変更ボタンが ON です（矢印で向きだけ変わります）';
			turnModeHintEl.classList.add('active');
		} else {
			turnModeHintEl.textContent = '向き変更ボタンを押すと移動せずに向きだけを変えられます';
			turnModeHintEl.classList.remove('active');
		}
	}
});

// スワイプ
let touchStart = null;
boardEl.addEventListener('pointerdown', e => { touchStart = { x: e.clientX, y: e.clientY }; });
boardEl.addEventListener('pointerup',   e => {
	if (!touchStart) return;
	const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
	touchStart = null;
	if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
	const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
	if (turnModeBtn?.classList.contains('active')) {
		turnOnly(dir);
	} else {
		move(dir);
	}
});

// ── Boot ──────────────────────────────────────────────────────
(async () => {
	const ok = await loadMapData();
	if (!ok || !Object.keys(mapData.stages).length) {
		stageLabelEl.textContent = 'マップデータなし';
		boardEl.innerHTML = '<p style="color:#7a9090;padding:16px">エディタでマップを作成して保存してください</p>';
	} else {
		const params = new URLSearchParams(location.search);
		const stageParam = params.get('stage');
		const rowParam   = parseInt(params.get('row') ?? '-1', 10);
		const colParam   = parseInt(params.get('col') ?? '-1', 10);

		let startKey, startRow, startCol;
		if (stageParam && mapData.stages[stageParam] && rowParam >= 0 && colParam >= 0) {
			startKey = stageParam; startRow = rowParam; startCol = colParam;
		} else {
			const start = findStart();
			startKey = start.key; startRow = start.row; startCol = start.col;
		}

		enterStage(startKey, startRow, startCol);
		startAnimLoop(() => redrawAnimSprites(boardEl));

		// サウンドダイアログを表示（ユーザーインタラクションを取得してAudioContextを起動）
		const soundDialogEl = document.getElementById('sound-dialog');
		const soundOnBtn    = document.getElementById('sound-on-btn');
		const soundOffBtn   = document.getElementById('sound-off-btn');

		soundOnBtn.addEventListener('click', () => {
			soundDialogEl.classList.add('hidden');
			playBgm(); // ユーザー操作後にBGM開始（AudioContext が起動できる）
		}, { once: true });

		soundOffBtn.addEventListener('click', () => {
			soundDialogEl.classList.add('hidden');
			// BGMなし（サウンドオフ）
		}, { once: true });
	}
})();

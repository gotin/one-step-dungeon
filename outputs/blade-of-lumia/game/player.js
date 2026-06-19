// game/player.js ── プレイヤー移動・タイルイベント（Phase 0-2 Step 5）
// createPlayer(deps) factory で生成する。
// movePlayer / handleTileEvent を提供。

import { TILE } from '../shared/tiles.js';
import { ITEM_META, EQUIP_META } from '../shared/items.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';
import { SPRITES, PAL, makeSprite } from '../shared/sprites.js';
import { playSound, resumeAudio } from '../shared/sounds.js';
import {
	MOVE_STEP, DIR_DELTA, STONE_PUSH_COOLDOWN_MS, SWORD_COOLDOWN_MS, HP_PER_HEART,
} from './constants.js';

/**
 * createPlayer(deps) – factory
 *
 * deps:
 *   getStageData()               – stageData
 *   getPlayer()                  – player
 *   getEnemies()                 – enemies 配列
 *   getCurrentLayer()            – currentLayer
 *   getStageKey()                – stageKey
 *   getHeroDir()                 – heroDir
 *   setHeroDir(v)                – heroDir setter
 *   getCharLayerEl()             – charLayerEl
 *   getIsDialog()                – isDialog
 *   getIsPaused()                – isPaused
 *   getIsGameover()              – isGameover
 *   getIsTransitioning()         – isTransitioning
 *   getLastStonePushTime()       – 最後に石を押した実時間
 *   setLastStonePushTime(v)      – setter
 *   getLastSwordTime()           – 最後に剣を使った論理時間
 *   setLastSwordTime(v)          – setter
 *   gameNow()                    – 論理時間
 *   getCellPx()                  – セルサイズ(px)
 *   toTileRow(y) / toTileCol(x) – float → タイル座標
 *   getSS(lk, sk)                – ステージ状態取得
 *   isPassable(nx, ny)           – 通行可否
 *   tilePassable(r, c)           – タイル単体の通行可否
 *   checkStoneOnSwitch()         – 石スイッチ判定
 *   evaluateConditions()         – 条件評価
 *   checkStageTransition()       – ステージ端遷移チェック
 *   updatePlayerCharEl()         – プレイヤースプライト更新
 *   moveCharEl(id, x, y)        – キャラ要素の位置更新
 *   renderBoard()                – ボード再描画
 *   renderChars()                – キャラ再描画
 *   updateHud()                  – HUD 更新
 *   pulse(text, dur)             – メッセージ表示
 *   saveGame()                   – セーブ
 *   swordAttack()                – 剣攻撃（swordAttack 内の NPC/Sign 対話で呼ぶため）
 *   openShop(shopData)           – ショップを開く
 *   startDialog(r, c, tile)      – ダイアログ開始
 *   stopGameLoop()               – ゲームループ停止
 *   startGameLoop()              – ゲームループ開始
 *   checkTriforceClear()         – 星の欠片・全収集チェック
 *   offerAtAltar()               – 古代の祭壇に欠片を捧げる（翼の羽衣を授かる）
 *   maybeShowSubItemHint()       – サブアイテムヒント
 *   getHeroSpriteName()          – スプライト名取得
 *   getHeroPalName()             – パレット名取得
 *   hasCleared()                 – クリア済み判定
 */
export function createPlayer(deps) {
	const {
		getStageData, getPlayer, getEnemies,
		getCurrentLayer, getStageKey,
		getHeroDir, setHeroDir,
		getCharLayerEl,
		getIsDialog, getIsPaused, getIsGameover, getIsTransitioning,
		getLastStonePushTime, setLastStonePushTime,
		getLastSwordTime, setLastSwordTime,
		gameNow, getCellPx,
		toTileRow, toTileCol,
		getSS,
		isPassable, tilePassable,
		checkStoneOnSwitch, evaluateConditions,
		checkStageTransition,
		updatePlayerCharEl, moveCharEl,
		renderBoard, renderChars, updateHud,
		pulse, saveGame,
		stopGameLoop, startGameLoop,
		checkTriforceClear, offerAtAltar, maybeShowSubItemHint,
		getHeroSpriteName, getHeroPalName,
		hasCleared,
	} = deps;

	// 祭壇の連続発火を防ぐガード（乗りっぱなしで毎フレーム発火しないように）
	let _lastAltarPosKey = null;

	// ── 翼の羽衣による飛行（Phase 1-5）────────────────────────────
	// 飛行中は SKY/WATER の上を移動できる（passable.js が player.flying を見る）。
	// 着陸できるのは地上タイル（tilePassable=true）の上だけ。空・水の上では降りられない。
	// 離着陸は F キー / モバイル飛行ボタンから toggleFlight() で行う。
	function toggleFlight() {
		const player = getPlayer();
		if (getIsDialog() || getIsPaused() || getIsGameover() || getIsTransitioning()) return;
		if (!player.hasWingRobe) {
			pulse('🪽 翼の羽衣を まだ持っていない', 1800);
			return;
		}
		if (!player.flying) {
			// 離陸
			player.flying = true;
			playSound('item');
			pulse('🪽 翼の羽衣で 空へ舞い上がった！', 1800);
			renderChars(); updateHud(); saveGame();
			return;
		}
		// 着陸：現在のタイルが地上（通行可）でなければ降りられない
		const r = toTileRow(player.y), c = toTileCol(player.x);
		if (!tilePassable(r, c)) {
			pulse('ここには 降りられない！', 1500);
			return;
		}
		player.flying = false;
		playSound('move');
		pulse('🪽 地上に 降り立った', 1500);
		renderChars(); updateHud(); saveGame();
	}

	// ── ドア開扉アニメーション ────────────────────────────────
	function showDoorOpenEffect(r, c) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.style.cssText = `
			position:absolute;
			left:${c * cellPx}px;
			top:${r * cellPx}px;
			width:${cellPx}px;
			height:${cellPx}px;
			background:rgba(255,220,80,0.75);
			z-index:20;
			pointer-events:none;
			border-radius:4px;
			animation:door-open-flash 0.5s ease-out forwards;
		`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 550);
	}

	// ── ドアを鍵で開ける ────────────────────────────────────
	function tryOpenDoor(nr, nc) {
		const posKey  = `${nr},${nc}`;
		const stageData = getStageData();
		const player  = getPlayer();
		const tile    = stageData?.tiles[nr]?.[nc];
		if (tile !== TILE.DOOR) return false;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (ss.openedDoors?.has(posKey)) return true;

		if (player.keys <= 0) {
			pulse('🗝 鍵がない！', 1500);
			return false;
		}
		player.keys--;
		if (!ss.openedDoors) ss.openedDoors = new Set();
		ss.openedDoors.add(posKey);

		showDoorOpenEffect(nr, nc);
		playSound('gateOpen');
		pulse('🗝 扉を開けた！', 1500);
		renderBoard(); renderChars(); updateHud(); saveGame();
		return true;
	}

	// ── 石を押す ───────────────────────────────────────────
	function tryPushStone(r, c, dir, origKey) {
		const [pdy, pdx] = DIR_DELTA[dir];
		const ndr = Math.sign(pdy);
		const ndc = Math.sign(pdx);
		const tr = r + ndr;
		const tc = c + ndc;
		const stageData = getStageData();
		const enemies   = getEnemies();
		console.log(`[STONE] tryPushStone(${r},${c}) dir=${dir} → dest=(${tr},${tc}) origKey=${origKey}`);
		if (tr < 0 || tr >= stageData.rows || tc < 0 || tc >= stageData.cols) { console.log('[STONE] blocked: out of bounds'); return false; }
		const destTile = stageData.tiles[tr]?.[tc];
		const passable = tilePassable(tr, tc);
		console.log(`[STONE] destTile=${destTile} tilePassable=${passable}`);
		if (!passable) return false;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (!ss.stonePositions) ss.stonePositions = {};
		for (const st of Object.values(ss.stonePositions)) {
			if (st.r === tr && st.c === tc) { console.log('[STONE] blocked: another moved stone'); return false; }
		}
		for (const e of enemies) {
			if (toTileRow(e.y) === tr && toTileCol(e.x) === tc) { console.log('[STONE] blocked: enemy'); return false; }
		}

		const key = origKey ?? `${r},${c}`;
		console.log(`[STONE] PUSHED! key=${key} → (${tr},${tc}) stonePositions=`, JSON.stringify(ss.stonePositions));
		ss.stonePositions[key] = { r: tr, c: tc };

		checkStoneOnSwitch();
		playSound('move');
		renderBoard();
		renderChars();
		evaluateConditions();
		saveGame();
		return true;
	}

	// ── プレイヤーがスイッチから離れた時 OFF ─────────────────
	function checkSwitchOff() {
		const stageData = getStageData();
		const player    = getPlayer();
		const ss = getSS(getCurrentLayer(), getStageKey());
		let changed = false;
		for (let r = 0; r < stageData.rows; r++) {
			for (let c = 0; c < stageData.cols; c++) {
				if (stageData.tiles[r][c] !== TILE.SWITCH) continue;
				const pk = `${r},${c}`;
				if (!ss.switchStates[pk]) continue;
				const stoneHere = Object.values(ss.stonePositions ?? {}).some(st => st.r === r && st.c === c);
				if (stoneHere) continue;
				const playerHere = toTileRow(player.y) === r && toTileCol(player.x) === c;
				if (!playerHere) {
					ss.switchStates[pk] = false;
					for (const link of stageData.links ?? []) {
						if (link.switchId === pk) ss.openGates.delete(link.gateId);
					}
					changed = true;
				}
			}
		}
		if (changed) { renderBoard(); renderChars(); evaluateConditions(); saveGame(); }
	}

	// ── プレイヤー移動 ────────────────────────────────────
	function movePlayer(dir) {
		if (getIsDialog() || getIsPaused() || getIsGameover() || getIsTransitioning()) return;
		setHeroDir(dir);

		const player    = getPlayer();
		const stageData = getStageData();
		const enemies   = getEnemies();
		const [dy, dx]  = DIR_DELTA[dir];
		const nx = player.x + dx;
		const ny = player.y + dy;
		// Phase 4-1c: 進入軸（横移動='h' / 縦移動='v'）。はしごの水/穴進入判定に渡す。
		const moveAxis = (dir === 'left' || dir === 'right') ? 'h' : 'v';

		// ── 石の押し判定 ────────────────────────────────
		const pr = toTileRow(player.y);
		const pc = toTileCol(player.x);
		const pdr = Math.sign(dy);
		const pdc = Math.sign(dx);
		const nextR = pr + pdr;
		const nextC = pc + pdc;
		const ss = getSS(getCurrentLayer(), getStageKey());

		let stoneKey = null;
		if (stageData.tiles[nextR]?.[nextC] === TILE.STONE && !ss.stonePositions?.[`${nextR},${nextC}`]) {
			stoneKey = `${nextR},${nextC}`;
		} else {
			for (const [k, st] of Object.entries(ss.stonePositions ?? {})) {
				if (st.r === nextR && st.c === nextC) { stoneKey = k; break; }
			}
		}

		if (stoneKey !== null) {
			// 石を押す：クールダウンチェック（実時間）
			const nowSt = Date.now();
			if (nowSt - getLastStonePushTime() < STONE_PUSH_COOLDOWN_MS) {
				updatePlayerCharEl();
				return;
			}
			const stoneDestR = nextR + pdr;
			const stoneDestC = nextC + pdc;
			const stoneDestOk = stageData.tiles[stoneDestR]?.[stoneDestC] != null
				&& tilePassable(stoneDestR, stoneDestC)
				&& !Object.values(ss.stonePositions ?? {}).some(st => st.r === stoneDestR && st.c === stoneDestC);
			if (stoneDestOk) {
				if (!ss.stonePositions) ss.stonePositions = {};
				const stoneFromR = (ss.stonePositions[stoneKey] ?? { r: nextR, c: nextC }).r;
				const stoneFromC = (ss.stonePositions[stoneKey] ?? { r: nextR, c: nextC }).c;
				ss.stonePositions[stoneKey] = { r: stoneDestR, c: stoneDestC };
				setLastStonePushTime(nowSt);
				checkStoneOnSwitch();
				evaluateConditions();

				player.x = nextC;
				player.y = nextR;
				playSound('move');

				renderBoard();

				const _animCellPx = getCellPx();
				const _animPlayerDiv = document.createElement('div');
				_animPlayerDiv.className = 'char-abs';
				_animPlayerDiv.id = 'char-player';
				_animPlayerDiv.style.left = `${pc * _animCellPx}px`;
				_animPlayerDiv.style.top  = `${pr * _animCellPx}px`;
				const _animHeroSpr = getHeroSpriteName();
				const _animHeroCv  = makeSprite(_animHeroSpr, getHeroPalName(), true, dir === 'left');
				if (_animHeroCv) _animPlayerDiv.appendChild(_animHeroCv);
				const charLayerEl = getCharLayerEl();
				charLayerEl.appendChild(_animPlayerDiv);

				// アニメーションしない他の移動済み石を先に描画
				{
					const _otherCellPx = getCellPx();
					const _otherStSize = Math.round(_otherCellPx * 0.7) + 'px';
					for (const [otherKey, otherSt] of Object.entries(ss.stonePositions ?? {})) {
						if (otherKey === stoneKey) continue;
						const otherDiv = document.createElement('div');
						otherDiv.className = 'char-abs';
						otherDiv.id = `char-stone-${otherKey.replace(',', '-')}`;
						otherDiv.style.left   = `${otherSt.c * _otherCellPx}px`;
						otherDiv.style.top    = `${otherSt.r * _otherCellPx}px`;
						otherDiv.style.zIndex = '1';
						const otherCv = document.createElement('canvas');
						otherCv.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${_otherStSize};height:${_otherStSize};image-rendering:pixelated;`;
						const _otherFrames = SPRITES['block'];
						const _otherPal    = PAL['block'];
						if (_otherFrames && _otherPal) {
							const _otherGrid = _otherFrames[0];
							otherCv.width  = _otherGrid[0].length;
							otherCv.height = _otherGrid.length;
							const _otherCtx = otherCv.getContext('2d');
							for (let _r = 0; _r < _otherGrid.length; _r++) {
								for (let _c = 0; _c < _otherGrid[_r].length; _c++) {
									const idx = _otherGrid[_r][_c];
									if (idx === 0) continue;
									_otherCtx.fillStyle = _otherPal[idx] ?? 'transparent';
									_otherCtx.fillRect(_c, _r, 1, 1);
								}
							}
						}
						otherDiv.appendChild(otherCv);
						const otherOnSwitch = stageData.tiles[otherSt.r]?.[otherSt.c] === TILE.SWITCH;
						if (otherOnSwitch) {
							const glow = document.createElement('div');
							glow.style.cssText = 'position:absolute;inset:0;background:rgba(80,255,100,0.38);border-radius:3px;box-shadow:0 0 8px 4px rgba(60,255,80,0.6);pointer-events:none;z-index:5;animation:stone-glow 1.2s ease-in-out infinite;';
							otherDiv.appendChild(glow);
						}
						charLayerEl.appendChild(otherDiv);
					}
				}

				// 石をアニメーション用要素として古い位置に配置
				const _animStDiv = document.createElement('div');
				_animStDiv.className = 'char-abs';
				_animStDiv.id = `char-stone-${stoneKey.replace(',', '-')}`;
				_animStDiv.style.zIndex = '1';
				const _animStSize = Math.round(_animCellPx * 0.7) + 'px';
				const _animStCv = document.createElement('canvas');
				_animStCv.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${_animStSize};height:${_animStSize};image-rendering:pixelated;`;
				const _animFrames = SPRITES['block'];
				const _animPal    = PAL['block'];
				if (_animFrames && _animPal) {
					const _animGrid = _animFrames[0];
					_animStCv.width  = _animGrid[0].length;
					_animStCv.height = _animGrid.length;
					const _animCtx = _animStCv.getContext('2d');
					for (let _r = 0; _r < _animGrid.length; _r++) {
						for (let _c = 0; _c < _animGrid[_r].length; _c++) {
							const idx = _animGrid[_r][_c];
							if (idx === 0) continue;
							_animCtx.fillStyle = _animPal[idx] ?? 'transparent';
							_animCtx.fillRect(_c, _r, 1, 1);
						}
					}
				}
				_animStDiv.appendChild(_animStCv);
				_animStDiv.style.left = `${stoneFromC * _animCellPx}px`;
				_animStDiv.style.top  = `${stoneFromR * _animCellPx}px`;
				charLayerEl.appendChild(_animStDiv);

				const _animDuration = STONE_PUSH_COOLDOWN_MS - 60;
				requestAnimationFrame(() => {
					void _animStDiv.offsetLeft;
					void _animPlayerDiv.offsetLeft;
					requestAnimationFrame(() => {
						const _t = `left ${_animDuration}ms linear, top ${_animDuration}ms linear`;
						_animStDiv.style.transition = _t;
						_animStDiv.style.left = `${stoneDestC * _animCellPx}px`;
						_animStDiv.style.top  = `${stoneDestR * _animCellPx}px`;
						_animPlayerDiv.style.transition = _t;
						_animPlayerDiv.style.left = `${nextC * _animCellPx}px`;
						_animPlayerDiv.style.top  = `${nextR * _animCellPx}px`;
					});
				});

				updateHud();
				setTimeout(() => {
					renderChars();
					saveGame();
					handleTileEvent();
					checkSwitchOff();
					checkStageTransition();
				}, _animDuration + 10);
				return;
			}
			updatePlayerCharEl();
			return;
		}

		// 壁チェック（通常移動）
		if (!isPassable(nx, ny, moveAxis)) {
			const c0 = Math.floor(nx), c1 = Math.floor(nx + 0.999);
			const r0 = Math.floor(ny), r1 = Math.floor(ny + 0.999);
			let doorOpened = false;
			for (let r = r0; r <= r1 && !doorOpened; r++) {
				for (let c = c0; c <= c1 && !doorOpened; c++) {
					if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) continue;
					if (stageData.tiles[r]?.[c] === TILE.DOOR) {
						doorOpened = tryOpenDoor(r, c);
					}
				}
			}
			if (!doorOpened) {
				updatePlayerCharEl();
				return;
			}
			if (!isPassable(nx, ny, moveAxis)) {
				updatePlayerCharEl();
				return;
			}
		}

		player.x = nx;
		player.y = ny;
		// Phase 4-1c: はしごの向きは「進入軸」で決める。実際に移動できたときだけ
		// 軸をラッチする（向きだけ変えた＝移動できなかったときは前回の軸を保持＝
		// はしごの上で向きを変えても向き／表示が変わらない）。
		player._ladderAxis = moveAxis;

		playSound('move');
		moveCharEl('player', player.x, player.y);
		updatePlayerCharEl();
		updateHud();

		handleTileEvent();
		checkSwitchOff();
		checkStageTransition();
	}

	// ── 家のドア開閉アニメーション ──────────────────────────
	function showHouseDoorAnimation(r, c) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const left = document.createElement('div');
		left.style.cssText = `
			position:absolute;
			left:${c * cellPx}px;
			top:${r * cellPx}px;
			width:${cellPx / 2}px;
			height:${cellPx}px;
			background:rgba(138,64,32,0.85);
			z-index:20;
			pointer-events:none;
			transform-origin:left center;
			animation:house-door-open-left 0.4s ease-out forwards;
		`;
		const right = document.createElement('div');
		right.style.cssText = `
			position:absolute;
			left:${c * cellPx + cellPx / 2}px;
			top:${r * cellPx}px;
			width:${cellPx / 2}px;
			height:${cellPx}px;
			background:rgba(138,64,32,0.85);
			z-index:20;
			pointer-events:none;
			transform-origin:right center;
			animation:house-door-open-right 0.4s ease-out forwards;
		`;
		charLayerEl.appendChild(left);
		charLayerEl.appendChild(right);
		setTimeout(() => { left.remove(); right.remove(); }, 450);
	}

	// ── ハートの器を得る ──────────────────────────────
	function gainHeartContainer() {
		const player = getPlayer();
		player.maxHearts++; player.maxHp += HP_PER_HEART; player.hp = player.maxHp;
	}

	// ── サブアイテムを与える ──────────────────────────────
	function giveSubItem(id) {
		const player = getPlayer();
		const meta = ITEM_META[id];
		if (meta?.type === 'passive') {
			if (id === 'heartContainer') gainHeartContainer();
			else if (id === 'ladder') player.hasLadder = true;  // Phase 4-1
			return;
		}
		if (!player.subItems[id]) player.subItems[id] = { count: meta?.uses === Infinity ? Infinity : 1 };
		else if (meta?.uses !== Infinity) player.subItems[id].count++;
		if (!player.activeSubItem) player.activeSubItem = id;
		maybeShowSubItemHint();
	}

	// ── 宝箱を開ける ──────────────────────────────────────
	function openChest(posKey, ss) {
		const stageData = getStageData();
		const player    = getPlayer();
		ss.openedChests.add(posKey); playSound('chest');
		const content = stageData.chestContents?.[posKey];
		if (content) {
			if (content.type === 'item') { giveSubItem(content.item); pulse(`☐ ${content.name ?? content.item} を手に入れた！`); }
			else if (content.type === 'weapon') {
				player.weapon = 'sword';
				const atkBonus = content.atkBonus ?? content.value ?? 2;
				player.atk += atkBonus;
				pulse(`☐ ${content.name ?? '剣'} を手に入れた！（ATK+${atkBonus}）`);
				updateHud();
			}
			else if (content.type === 'armor') {
				player.armor = 'armor';
				const defBonus = content.defBonus ?? content.value ?? 2;
				player.def += defBonus;
				pulse(`☐ ${content.name ?? '防具'} を手に入れた！（DEF+${defBonus}）`);
				updateHud();
			}
			else if (content.type === 'rupee') { player.rupees += content.value ?? 1; pulse(`☐ ルピー ×${content.value ?? 1}`); }
			else if (content.type === 'heartContainer') { gainHeartContainer(); pulse('❤ ハートの器を手に入れた！'); }
			else if (content.type === 'ladder') { player.hasLadder = true; pulse('🪜 はしごを手に入れた！水や穴を渡れる'); }
		} else { pulse('☐ 宝箱は空だった…'); }
		renderBoard(); renderChars(); updateHud(); saveGame();
	}

	// ── ダンジョンアイテム取得 ────────────────────────────
	function pickDungeonItem(tile, posKey, ss) {
		const player = getPlayer();
		if (ss.pickedKeys.has(posKey)) return false;
		ss.pickedKeys.add(posKey);
		if (!player.dungeonItems) player.dungeonItems = {};
		if (!player.dungeonItems[getCurrentLayer()]) {
			player.dungeonItems[getCurrentLayer()] = { hasMap: false, hasCompass: false };
		}
		if (tile === TILE.ITEM_DUNGEON_MAP) {
			player.dungeonItems[getCurrentLayer()].hasMap = true;
			playSound('item'); pulse('🗺 ダンジョンの地図を手に入れた！');
		} else if (tile === TILE.ITEM_COMPASS) {
			player.dungeonItems[getCurrentLayer()].hasCompass = true;
			playSound('item'); pulse('🧭 コンパスを手に入れた！');
		}
		deps.updateDungeonHud(getCurrentLayer());
		renderBoard(); renderChars(); updateHud(); saveGame();
		return true;
	}

	// ── タイルイベント（踏んだセルの処理） ──────────────────
	function handleTileEvent() {
		const stageData = getStageData();
		const player    = getPlayer();
		const r   = toTileRow(player.y);
		const c   = toTileCol(player.x);
		const posKey = `${r},${c}`;
		const tile   = stageData.tiles[r]?.[c];
		const ss     = getSS(getCurrentLayer(), getStageKey());
		if (!tile) return;

		// 祭壇から離れたら再判定できるようにガードを解除する
		if (tile !== TILE.ALTAR) _lastAltarPosKey = null;

		if (tile === TILE.KEY && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey); player.keys++;
			playSound('key'); pulse('🗝 鍵を手に入れた！');
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.SWITCH) {
			if (!ss.switchStates[posKey]) {
				ss.switchStates[posKey] = true;
				playSound('switch');
				for (const link of stageData.links ?? []) {
					if (link.switchId === posKey) { ss.openGates.add(link.gateId); playSound('gateOpen'); }
				}
				evaluateConditions();
				renderBoard(); renderChars(); saveGame();
			}
			return;
		}
		if (tile === TILE.ITEM_SWORD && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const swordBonus = stageData.floorItems?.[posKey]?.atkBonus ?? EQUIP_META.sword?.atkBonus ?? 2;
			const swordName  = stageData.floorItems?.[posKey]?.name ?? '剣';
			if (!player.weapon) {
				player.weapon = 'sword';
				if (!player._equip) player._equip = {};
				player._equip.swordBonus = swordBonus;
				player._equip.swordName  = swordName;
				player.atk += swordBonus;
				playSound('item'); pulse(`⚔ ${swordName}を手に入れた！（ATK+${swordBonus}）`);
			} else if (swordBonus > (player._equip?.swordBonus ?? 0)) {
				const diff = swordBonus - (player._equip?.swordBonus ?? 0);
				if (!player._equip) player._equip = {};
				player._equip.swordBonus = swordBonus;
				player._equip.swordName  = swordName;
				player.atk += diff;
				playSound('item'); pulse(`⚔ ${swordName}を手に入れた！（ATK+${diff}）`);
			} else {
				playSound('item'); pulse(`⚔ ${swordName}を拾った（今の剣の方が強い）`);
			}
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_SHIELD && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey); player.shield = 'shield';
			playSound('item'); pulse('🛡 たてを手に入れた！');
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_ARMOR && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const armorBonus = stageData.floorItems?.[posKey]?.defBonus ?? EQUIP_META.armor?.defBonus ?? 2;
			const armorName  = stageData.floorItems?.[posKey]?.name ?? '防具';
			if (!player.armor) {
				player.armor = 'armor';
				if (!player._equip) player._equip = {};
				player._equip.armorBonus = armorBonus;
				player._equip.armorName  = armorName;
				player.def += armorBonus;
				playSound('item'); pulse(`⚚ ${armorName}を手に入れた！（DEF+${armorBonus}）`);
			} else if (armorBonus > (player._equip?.armorBonus ?? 0)) {
				const diff = armorBonus - (player._equip?.armorBonus ?? 0);
				if (!player._equip) player._equip = {};
				player._equip.armorBonus = armorBonus;
				player._equip.armorName  = armorName;
				player.def += diff;
				playSound('item'); pulse(`⚚ ${armorName}を手に入れた！（DEF+${diff}）`);
			} else {
				playSound('item'); pulse(`⚚ ${armorName}を拾った（今の防具の方が強い）`);
			}
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_BOOMERANG && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			if (!player.subItems.boomerang) {
				player.subItems.boomerang = { count: Infinity };
			}
			if (!player.activeSubItem) player.activeSubItem = 'boomerang';
			playSound('item'); pulse('🪃 ブーメランを手に入れた！');
			renderBoard(); renderChars(); updateHud(); saveGame();
			maybeShowSubItemHint(); return;
		}
		if (tile === TILE.ITEM_BOMB && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const bombCount = stageData.floorItems?.[posKey]?.count ?? 3;
			if (!player.subItems.bomb) player.subItems.bomb = { count: 0 };
			player.subItems.bomb.count += bombCount;
			if (!player.activeSubItem) player.activeSubItem = 'bomb';
			playSound('item'); pulse(`💣 爆弾 ×${bombCount} を手に入れた！`);
			renderBoard(); renderChars(); updateHud(); saveGame();
			maybeShowSubItemHint(); return;
		}
		if (tile === TILE.ITEM_BOW && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const arrowCount = stageData.floorItems?.[posKey]?.count ?? 10;
			if (!player.subItems.bow) player.subItems.bow = { count: 0 };
			player.subItems.bow.count += arrowCount;
			if (!player.activeSubItem) player.activeSubItem = 'bow';
			playSound('item'); pulse(`🏹 弓矢 ×${arrowCount} を手に入れた！`);
			renderBoard(); renderChars(); updateHud(); saveGame();
			maybeShowSubItemHint(); return;
		}
		if (tile === TILE.ITEM_HEAL_POTION && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			giveSubItem('healPotion');
			playSound('item'); pulse('🧪 回復薬（小）を手に入れた！');
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_BIG_HEAL_POTION && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			giveSubItem('bigHealPotion');
			playSound('item'); pulse('💊 回復薬（大）を手に入れた！');
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_HEART_CONTAINER && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			gainHeartContainer();
			playSound('item'); pulse('❤ ハートの器を手に入れた！');
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_RUPEE && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey); player.rupees += 1;
			playSound('rupee'); pulse('◆ ルピー ×1');
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_RUPEE_LARGE && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey); player.rupees += 5;
			playSound('rupee'); pulse('◇ ルピー ×5');
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_TRIFORCE_PIECE && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey); player.triforceCount++;
			console.log(`[TRIFORCE] handleTileEvent: ITEM_TRIFORCE_PIECE picked at ${posKey}, triforceCount=${player.triforceCount}`);
			playSound('item'); pulse('◭ 星の欠片を手に入れた！');
			renderBoard(); renderChars(); updateHud(); saveGame();
			checkTriforceClear();
			return;
		}
		if ((tile === TILE.ITEM_DUNGEON_MAP || tile === TILE.ITEM_COMPASS) && !ss.pickedKeys.has(posKey)) {
			pickDungeonItem(tile, posKey, ss); return;
		}
		if (tile === TILE.CHEST && !ss.openedChests.has(posKey)) {
			const chestCond = stageData.showConditions?.[posKey];
			if (chestCond && !ss.conditionsMet.has(posKey)) {
				pulse('？ 何かが封印されているようだ…', 1500);
				return;
			}
			openChest(posKey, ss); return;
		}
		if (tile === TILE.MAP_ENTER) { checkStageTransition(); return; }
		if (tile === TILE.ALTAR) {
			// 古代の祭壇：踏むたびに判定（羽衣未取得なら捧げる／取得済なら案内）。
			// 同じセルに乗りっぱなしで連打しないよう、直前に処理したセルを記録する。
			if (_lastAltarPosKey !== posKey) {
				_lastAltarPosKey = posKey;
				offerAtAltar();
			}
			return;
		}
		if (tile === TILE.HOUSE_DOOR) {
			showHouseDoorAnimation(r, c);
			return;
		}
	}

	// ── ブーメランによるフィールドアイテム回収 ───────────────
	// ブーメランが通過したセル (r, c) の鍵・ルピーを回収する。
	// pickedKeys に登録済みならスキップ（handleTileEvent と同じガード）。
	function collectFieldItem(r, c) {
		const stageData = getStageData();
		const player    = getPlayer();
		const tile      = stageData.tiles[r]?.[c];
		if (!tile) return false;
		const ss     = getSS(getCurrentLayer(), getStageKey());
		const posKey = `${r},${c}`;
		if (ss.pickedKeys.has(posKey)) return false;

		if (tile === TILE.KEY) {
			ss.pickedKeys.add(posKey); player.keys++;
			playSound('key'); pulse('🪃🗝 ブーメランが鍵を回収した！');
			renderBoard(); renderChars(); updateHud(); saveGame();
			return true;
		}
		if (tile === TILE.ITEM_RUPEE) {
			ss.pickedKeys.add(posKey); player.rupees += 1;
			playSound('rupee'); pulse('🪃◆ ブーメランがルピーを回収した！');
			renderBoard(); renderChars(); updateHud(); saveGame();
			return true;
		}
		if (tile === TILE.ITEM_RUPEE_LARGE) {
			ss.pickedKeys.add(posKey); player.rupees += 5;
			playSound('rupee'); pulse('🪃◇ ブーメランがルピー×5を回収した！');
			renderBoard(); renderChars(); updateHud(); saveGame();
			return true;
		}
		return false;
	}

	// ── ドロップエフェクト ────────────────────────────────
	function spawnDropEffect(r, c, icon, color) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.style.cssText = `
			position:absolute;
			left:${(c + 0.5) * cellPx}px;
			top:${(r + 0.2) * cellPx}px;
			transform:translateX(-50%);
			font-size:${Math.round(cellPx * 0.55)}px;
			color:${color};
			z-index:25;
			pointer-events:none;
			animation:drop-popup 0.6s ease-out forwards;
		`;
		el.textContent = icon;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 650);
	}

	return {
		movePlayer,
		handleTileEvent,
		tryPushStone,
		checkSwitchOff,
		giveSubItem,
		gainHeartContainer,
		spawnDropEffect,
		toggleFlight,
		collectFieldItem,
	};
}

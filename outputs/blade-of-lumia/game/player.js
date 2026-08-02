// game/player.js ── プレイヤー移動・タイルイベント（Phase 0-2 Step 5）
// createPlayer(deps) factory で生成する。
// movePlayer / handleTileEvent を提供。

import { TILE } from '../shared/tiles.js';
import { statefulTileClosed } from './passable.js';
import { ITEM_META, EQUIP_META, SWORD_TIERS, BASE_ATK, ARMOR_TIERS, BASE_DEF, SHIELD_TIERS, BOOMERANG_TIERS } from '../shared/items.js';
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
		checkStoneOnSwitch, evaluateConditions, refreshGates,
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

	// 石押しアニメーションの世代カウンタ（Phase 4.55 バグ(A) 対策）。
	// 押すたびに ++ し、押しごとの後始末 setTimeout にこの世代を捕捉させる。
	// 次の押しが始まって世代が進んでいたら、古い後始末は renderChars を呼ばず
	// 早期 return する＝走行中の新しいアニメ要素を stale な後始末が消してしまい
	// 「押しっぱなしでアニメが飛ぶ」現象を防ぐ。
	let _stonePushGen = 0;

	// ── 剣ティア装備（Phase 7-1）────────────────────────────────
	// tierIndex: SWORD_TIERS のインデックス（0..3）
	// 現在のティアより高い場合のみ更新し、atk を再計算する（差分加算を廃止）。
	function equipSwordTier(tierIndex) {
		const player = getPlayer();
		const tier = SWORD_TIERS[tierIndex];
		if (!tier) return false;
		if (tierIndex <= (player.swordTier ?? -1)) return false;  // 下位は無視
		player.weapon = 'sword';
		player.swordTier = tierIndex;
		if (!player._equip) player._equip = {};
		player._equip.swordName  = tier.name;
		player._equip.swordBonus = tier.atk;
		player.atk = BASE_ATK + tier.atk;
		return true;
	}

	// ── 防具ティア装備（Phase 7-2）──────────────────────────────
	// tierIndex: ARMOR_TIERS のインデックス（0..2）
	// 現在のティアより高い場合のみ更新し、def を再計算する（差分加算を廃止）。
	function equipArmorTier(tierIndex) {
		const player = getPlayer();
		const tier = ARMOR_TIERS[tierIndex];
		if (!tier) return false;
		if (tierIndex <= (player.armorTier ?? -1)) return false;  // 下位は無視
		player.armor = 'armor';
		player.armorTier = tierIndex;
		if (!player._equip) player._equip = {};
		player._equip.armorName  = tier.name;
		player._equip.armorBonus = tier.def;
		player.def = BASE_DEF + tier.def;
		return true;
	}

	// ── 盾ティア装備（Phase 7-2）────────────────────────────────
	// tierIndex: SHIELD_TIERS のインデックス（0..2）
	// 現在のティアより高い場合のみ更新する（盾は def に寄与しない＝跳ね返し係数で差別化）。
	function equipShieldTier(tierIndex) {
		const player = getPlayer();
		const tier = SHIELD_TIERS[tierIndex];
		if (!tier) return false;
		if (tierIndex <= (player.shieldTier ?? -1)) return false;  // 下位は無視
		player.shield = 'shield';
		player.shieldTier = tierIndex;
		if (!player._equip) player._equip = {};
		player._equip.shieldName = tier.name;
		return true;
	}

	// ── ブーメランティア装備（Phase 9-6 深洋O）──────────────────
	// tierIndex: BOOMERANG_TIERS のインデックス（0=木 / 1=銀）
	// 剣/防具/盾と同型で上位のみ受け付ける。ブーメランはサブアイテムなので
	// ティアを上げると同時に subItems.boomerang を（未所持なら）所持状態にする
	// ＝「銀のブーメランを貰う」だけでブーメラン自体が使えるようになる。
	function equipBoomerangTier(tierIndex) {
		const player = getPlayer();
		const tier = BOOMERANG_TIERS[tierIndex];
		if (!tier) return false;
		if (tierIndex <= (player.boomerangTier ?? -1)) return false;  // 下位は無視
		player.boomerangTier = tierIndex;
		if (!player.subItems.boomerang) player.subItems.boomerang = { count: Infinity };
		if (!player.activeSubItem) player.activeSubItem = 'boomerang';
		if (!player._equip) player._equip = {};
		player._equip.boomerangName = tier.name;
		return true;
	}

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

	// 隣接して連なった DOOR タイルを1枚の扉として集める（縦横の連結成分）。
	// 例：ボス入口の "DD"（横2セル）は1枚の扉＝鍵1個でまとめて開く。城門に縦
	// "DD" や 2×2 を置けば、そのまま2セル幅の門になる。単独の D は長さ1の扉。
	function collectDoorRun(stageData, sr, sc) {
		const run = [];
		const seen = new Set();
		const stack = [[sr, sc]];
		while (stack.length) {
			const [r, c] = stack.pop();
			const key = `${r},${c}`;
			if (seen.has(key)) continue;
			if (r < 0 || c < 0 || r >= stageData.rows || c >= stageData.cols) continue;
			if (stageData.tiles[r]?.[c] !== TILE.DOOR) continue;
			seen.add(key);
			run.push([r, c]);
			stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
		}
		return run;
	}

	// ── ドアを鍵で開ける ────────────────────────────────────
	// 連なった DOOR は1枚の扉＝1個の鍵でまとめて開く（隣接2枚に鍵2個は不要）。
	function tryOpenDoor(nr, nc) {
		const stageData = getStageData();
		const player  = getPlayer();
		const tile    = stageData?.tiles[nr]?.[nc];
		if (tile !== TILE.DOOR) return false;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (ss.openedDoors?.has(`${nr},${nc}`)) return true;

		if (player.keys <= 0) {
			pulse('🗝 鍵がない！', 1500);
			return false;
		}
		player.keys--;
		if (!ss.openedDoors) ss.openedDoors = new Set();
		// この扉を構成する連結セルすべてを開く（鍵は1個だけ消費）。
		for (const [r, c] of collectDoorRun(stageData, nr, nc)) {
			ss.openedDoors.add(`${r},${c}`);
			showDoorOpenEffect(r, c);
		}

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
		if (tr < 0 || tr >= stageData.rows || tc < 0 || tc >= stageData.cols) return false;
		const passable = tilePassable(tr, tc);
		if (!passable) return false;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (!ss.stonePositions) ss.stonePositions = {};
		for (const st of Object.values(ss.stonePositions)) {
			if (st.r === tr && st.c === tc) return false;
		}
		for (const e of enemies) {
			if (toTileRow(e.y) === tr && toTileCol(e.x) === tc) return false;
		}

		const key = origKey ?? `${r},${c}`;
		ss.stonePositions[key] = { r: tr, c: tc };

		checkStoneOnSwitch();
		playSound('move');
		renderBoard();
		renderChars();
		evaluateConditions();
		saveGame();
		return true;
	}

	// ── 武器で押すトグルスイッチ（Phase 4-5 ①・SWITCH）────────────
	// ボタン（BUTTON＝踏みっぱなしで ON のモーメンタリ式）とは別物。
	// 矢・剣・その他の武器の攻撃が当たるたびに ON↔OFF をトグルする。
	// 攻撃するまで状態を維持する（プレイヤーが乗っても何も起きない）。
	// 状態は ss.switchToggles（ON のものだけを保持する Set）で管理し、連動ゲートは
	// links（switchId→gateId）で openGates を開閉する＝ボタンの状態と混ざらない。
	function toggleSwitch(r, c) {
		const stageData = getStageData();
		if (stageData?.tiles[r]?.[c] !== TILE.SWITCH) return false;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (!ss.switchToggles) ss.switchToggles = new Set();
		const pk = `${r},${c}`;
		const nowOn = !ss.switchToggles.has(pk);
		if (nowOn) ss.switchToggles.add(pk);
		else       ss.switchToggles.delete(pk);
		playSound('switch');
		refreshGates();   // Y スイッチ→ゲート/潮の連動は refreshGates が担う（gateOpen 音も内包）
		evaluateConditions();
		renderBoard(); renderChars(); saveGame();
		return true;
	}

	// ── Phase 5-1: 色スイッチをセット（activeColor をその色に変更） ──
	// SWITCH_RED/SWITCH_BLUE を武器で叩くと activeColor をセット。
	// トグルではなく常に「この色に切替」＝排他制御が自然に成立する。
	function setActiveColor(r, c) {
		const stageData = getStageData();
		const tile = stageData?.tiles[r]?.[c];
		const color = tile === TILE.SWITCH_RED ? 'red' : tile === TILE.SWITCH_BLUE ? 'blue' : null;
		if (!color) return false;
		const ss = getSS(getCurrentLayer(), getStageKey());
		ss.activeColor = color;
		playSound('switch');
		evaluateConditions();
		renderBoard(); renderChars(); saveGame();
		return true;
	}

	// ── プレイヤーがボタンから離れた時 OFF ─────────────────
	// ボタン（BUTTON）はモーメンタリ式：プレイヤー/石が乗っている間だけ ON。
	function checkSwitchOff() {
		const stageData = getStageData();
		const player    = getPlayer();
		const ss = getSS(getCurrentLayer(), getStageKey());
		let changed = false;
		for (let r = 0; r < stageData.rows; r++) {
			for (let c = 0; c < stageData.cols; c++) {
				if (stageData.tiles[r][c] !== TILE.BUTTON) continue;
				const pk = `${r},${c}`;
				if (!ss.switchStates[pk]) continue;
				const stoneHere = Object.values(ss.stonePositions ?? {}).some(st => st.r === r && st.c === c);
				if (stoneHere) continue;
				const playerHere = toTileRow(player.y) === r && toTileCol(player.x) === c;
				if (!playerHere) {
					ss.switchStates[pk] = false;
					changed = true;
				}
			}
		}
		if (changed) { refreshGates(); renderBoard(); renderChars(); evaluateConditions(); saveGame(); }
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
		const pdr = Math.sign(dy);
		const pdc = Math.sign(dx);
		const ss = getSS(getCurrentLayer(), getStageKey());

		// Phase 4.55 バグ(B): 石に対して「押し方向と直交する軸だけ」0.5 セルずれた
		// 位置から石へ向かったとき、石に隣接する整数セルへプレイヤーをスナップして押す。
		// 旧実装は「x/y とも整数のときだけ押す」ガードだったため、例えば縦に 0.5
		// ずれた（y=2.5）状態で横の石へ向かうと押しも通常移動もできず、プレイヤーが
		// 石にめり込んだまま停止していた。
		//
		// ルール：
		//   ・押し「軸」の座標は整数でなければならない（＝石に本当に隣接している）。
		//     半セルずれ（例 x=4.5 で右押し）は石まで 1.5 セルあるので押さず通常移動で
		//     整数へ揃える。ここを緩めると 1.5 セル先の石へワープしてしまう。
		//   ・押し「直交軸」は 0.5 ずれていてよい。プレイヤーがまたぐ 2 レーンのうち
		//     石があるレーンへ直交座標をスナップして押す。
		// pr/pc = 押し元セル（＝スナップ先・アニメの始点）、nextR/nextC = 石のセル。
		let stoneKey = null;
		let pr = null, pc = null;
		// Phase 4.56: 全ボタンONで一度パズルを解いたステージは石をロックする。
		// ロック後は石検出そのものを行わない＝通常移動へ落ち、石は壁と同じ通行不可のまま
		// 自然にブロックされる（＝ボタンから石をどかせない＝ゲートは開いたまま）。
		if (!ss.stonesLocked) {
			const axisAligned = pdc !== 0 ? Number.isInteger(player.x) : Number.isInteger(player.y);
			if (axisAligned) {
				const candidates = [];
				if (pdc !== 0) {                         // 横押し：押し軸=x（整数）。直交=y をまたぐ各行。
					const oC = player.x;
					const rr0 = Math.floor(player.y), rr1 = Math.floor(player.y + 0.999);
					for (let r = rr0; r <= rr1; r++) candidates.push([r, oC]);
				} else {                                 // 縦押し：押し軸=y（整数）。直交=x をまたぐ各列。
					const oR = player.y;
					const cc0 = Math.floor(player.x), cc1 = Math.floor(player.x + 0.999);
					for (let c = cc0; c <= cc1; c++) candidates.push([oR, c]);
				}
				for (const [oR, oC] of candidates) {
					const tR = oR + pdr, tC = oC + pdc;   // 石がある想定セル
					if (stageData.tiles[tR]?.[tC] === TILE.STONE && !ss.stonePositions?.[`${tR},${tC}`]) {
						stoneKey = `${tR},${tC}`;
					} else {
						for (const [k, st] of Object.entries(ss.stonePositions ?? {})) {
							if (st.r === tR && st.c === tC) { stoneKey = k; break; }
						}
					}
					if (stoneKey !== null) { pr = oR; pc = oC; break; }
				}
			}
		}
		const nextR = pr + pdr;
		const nextC = pc + pdc;

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
			// プレイヤーは押した後「石が居たセル」へ入る（下の player.x/y 代入）∴そこの**下地**が
			// 閉じていたら押せない。石そのものは今から動くので無視して下のタイルだけを見る
			// （tiles が '*' の未移動石＝下は床／移動済みの石が乗っているセル＝下は本来のタイル）。
			// 石は「押した時点で通行可だったセル」にしか居られない∴後から通行不可になり得るのは
			// 状態で閉じるタイルだけ＝statefulTileClosed の判定で必要十分。
			const underPlayer = stageData.tiles[nextR]?.[nextC];
			const playerDestOk = underPlayer === TILE.STONE
				|| !statefulTileClosed(underPlayer, `${nextR},${nextC}`, ss);
			if (stoneDestOk && playerDestOk) {
				if (!ss.stonePositions) ss.stonePositions = {};
				const stoneFromR = (ss.stonePositions[stoneKey] ?? { r: nextR, c: nextC }).r;
				const stoneFromC = (ss.stonePositions[stoneKey] ?? { r: nextR, c: nextC }).c;
				ss.stonePositions[stoneKey] = { r: stoneDestR, c: stoneDestC };
				setLastStonePushTime(nowSt);
				const _pushGen = ++_stonePushGen;   // この押しの世代（後始末ガード用）
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
						const otherOnSwitch = stageData.tiles[otherSt.r]?.[otherSt.c] === TILE.BUTTON;
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
					// バグ(A): この後始末が走る前に次の押しが始まっていたら
					// （世代が進んでいたら）renderChars を呼ばない。走行中の新しい
					// アニメ要素を stale な後始末が消して「アニメが飛ぶ」のを防ぐ。
					// 次の押しの後始末が最新状態を描き直す。
					if (_pushGen !== _stonePushGen) return;
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
			else if (id === 'ladder')    player.hasLadder  = true;
			else if (id === 'quiver')    player.maxArrows  = (player.maxArrows  ?? 8) + 8;
			else if (id === 'bombBag')   player.maxBombs   = (player.maxBombs   ?? 8) + 8;
			return;
		}
		if (!player.subItems[id]) player.subItems[id] = { count: meta?.uses === Infinity ? Infinity : 1 };
		else if (meta?.uses !== Infinity) player.subItems[id].count++;
		// 矢/爆弾は上限でクランプ（quiver/bombBag 拡充後の新上限も反映）
		if (id === 'bomb') player.subItems.bomb.count = Math.min(player.subItems.bomb.count, player.maxBombs ?? 8);
		if (id === 'bow')  player.subItems.bow.count  = Math.min(player.subItems.bow.count,  player.maxArrows ?? 8);
		if (!player.activeSubItem) player.activeSubItem = id;
		maybeShowSubItemHint();
	}

	// ── 報酬付与（チェストとガチャの共通ロジック）──────────
	// content: { type, item?, swordTier?, armorTier?, shieldTier?, boomerangTier?, value? }
	// 戻り値: メッセージ文字列（pulse は呼び出し側で行う）
	function grantReward(content) {
		const player = getPlayer();
		if (content.type === 'item') {
			giveSubItem(content.item);
			return `${content.name ?? content.item} を手に入れた！`;
		} else if (content.type === 'weapon') {
			const tierIndex = content.swordTier ?? 0;
			const tier = SWORD_TIERS[tierIndex];
			if (equipSwordTier(tierIndex)) {
				updateHud();
				return `${tier.name} を手に入れた！（ATK+${tier.atk}）`;
			} else {
				return `${tier?.name ?? '剣'} を拾った（今の剣の方が強い）`;
			}
		} else if (content.type === 'armor') {
			const tierIndex = content.armorTier ?? 0;
			const tier = ARMOR_TIERS[tierIndex];
			if (equipArmorTier(tierIndex)) {
				updateHud();
				return `${tier.name} を手に入れた！（DEF+${tier.def}）`;
			} else {
				return `${tier?.name ?? '防具'} を拾った（今の防具の方が強い）`;
			}
		} else if (content.type === 'shield') {
			const tierIndex = content.shieldTier ?? 0;
			const tier = SHIELD_TIERS[tierIndex];
			if (equipShieldTier(tierIndex)) {
				updateHud();
				return `${tier.name} を手に入れた！`;
			} else {
				return `${tier?.name ?? 'たて'} を拾った（今の盾の方が強い）`;
			}
		} else if (content.type === 'boomerang') {
			// Phase 9-6: 銀のブーメラン（ティア差し替え。海の主の bossReward で使う）
			const tierIndex = content.boomerangTier ?? 0;
			const tier = BOOMERANG_TIERS[tierIndex];
			if (equipBoomerangTier(tierIndex)) {
				updateHud();
				return `${tier.name} を手に入れた！（ATK${tier.atk}・射程${tier.maxRange}）`;
			} else {
				return `${tier?.name ?? 'ブーメラン'} を拾った（今のブーメランの方が強い）`;
			}
		} else if (content.type === 'rupee') {
			player.rupees += content.value ?? 1;
			return `ルピー ×${content.value ?? 1}`;
		} else if (content.type === 'heartContainer') {
			gainHeartContainer();
			return 'ハートの器を手に入れた！';
		} else if (content.type === 'ladder') {
			player.hasLadder = true;
			return 'はしごを手に入れた！水や穴を渡れる';
		}
		return '';
	}

	// ── 宝箱を開ける ──────────────────────────────────────
	function openChest(posKey, ss) {
		const stageData = getStageData();
		ss.openedChests.add(posKey); playSound('chest');
		const content = stageData.chestContents?.[posKey];
		if (content) {
			const msg = grantReward(content);
			pulse(`☐ ${msg}`);
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
		if (tile === TILE.BUTTON) {
			if (!ss.switchStates[posKey]) {
				ss.switchStates[posKey] = true;
				playSound('switch');
				refreshGates();
				evaluateConditions();
				renderBoard(); renderChars(); saveGame();
			}
			return;
		}
		if (tile === TILE.ITEM_SWORD && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const tierIndex = stageData.floorItems?.[posKey]?.swordTier ?? 0;
			if (equipSwordTier(tierIndex)) {
				const tier = SWORD_TIERS[tierIndex];
				playSound('item'); pulse(`⚔ ${tier.name}を手に入れた！（ATK+${tier.atk}）`);
			} else {
				const tier = SWORD_TIERS[tierIndex];
				playSound('item'); pulse(`⚔ ${tier?.name ?? '剣'}を拾った（今の剣の方が強い）`);
			}
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_SHIELD && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const tierIndex = stageData.floorItems?.[posKey]?.shieldTier ?? 0;
			if (equipShieldTier(tierIndex)) {
				const tier = SHIELD_TIERS[tierIndex];
				playSound('item'); pulse(`🛡 ${tier.name}を手に入れた！`);
			} else {
				const tier = SHIELD_TIERS[tierIndex];
				playSound('item'); pulse(`🛡 ${tier?.name ?? 'たて'}を拾った（今の盾の方が強い）`);
			}
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_ARMOR && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const tierIndex = stageData.floorItems?.[posKey]?.armorTier ?? 0;
			if (equipArmorTier(tierIndex)) {
				const tier = ARMOR_TIERS[tierIndex];
				playSound('item'); pulse(`⚚ ${tier.name}を手に入れた！（DEF+${tier.def}）`);
			} else {
				const tier = ARMOR_TIERS[tierIndex];
				playSound('item'); pulse(`⚚ ${tier?.name ?? '防具'}を拾った（今の防具の方が強い）`);
			}
			renderBoard(); renderChars(); updateHud(); saveGame(); return;
		}
		if (tile === TILE.ITEM_BOOMERANG && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			// Phase 9-6: 床置きブーメランもティアを持てる（剣/盾/防具と同型）。
			// 既定は 0（木）＝既存マップのブーメランは今までどおり。
			const tierIndex = stageData.floorItems?.[posKey]?.boomerangTier ?? 0;
			const tier = BOOMERANG_TIERS[tierIndex];
			if (equipBoomerangTier(tierIndex)) {
				playSound('item'); pulse(`🪃 ${tier.name}を手に入れた！`);
			} else {
				playSound('item'); pulse(`🪃 ${tier?.name ?? 'ブーメラン'}を拾った（今のブーメランの方が強い）`);
			}
			renderBoard(); renderChars(); updateHud(); saveGame();
			maybeShowSubItemHint(); return;
		}
		if (tile === TILE.ITEM_BOMB && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const bombCount = stageData.floorItems?.[posKey]?.count ?? 3;
			if (!player.subItems.bomb) player.subItems.bomb = { count: 0 };
			const maxB = player.maxBombs ?? 8;
			const prevB = player.subItems.bomb.count;
			player.subItems.bomb.count = Math.min(prevB + bombCount, maxB);
			if (player.subItems.bomb.count <= prevB) {
				pulse('💣 もう持てない！'); renderBoard(); renderChars(); updateHud(); saveGame(); return;
			}
			if (!player.activeSubItem) player.activeSubItem = 'bomb';
			playSound('item'); pulse(`💣 爆弾 ×${bombCount} を手に入れた！`);
			renderBoard(); renderChars(); updateHud(); saveGame();
			maybeShowSubItemHint(); return;
		}
		if (tile === TILE.ITEM_BOW && !ss.pickedKeys.has(posKey)) {
			ss.pickedKeys.add(posKey);
			const arrowCount = stageData.floorItems?.[posKey]?.count ?? 10;
			if (!player.subItems.bow) player.subItems.bow = { count: 0 };
			const maxA = player.maxArrows ?? 8;
			const prevA = player.subItems.bow.count;
			player.subItems.bow.count = Math.min(prevA + arrowCount, maxA);
			if (player.subItems.bow.count <= prevA) {
				pulse('🏹 もう持てない！'); renderBoard(); renderChars(); updateHud(); saveGame(); return;
			}
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
		// フロアドロップを踏んだら拾う（雑魚撃破ドロップ・Phase 9-5c）
		deps.pickupFloorDropAt?.(r, c);
	}

	// ── ブーメランによるフィールドアイテム回収 ───────────────
	// ブーメランが通過したセル (r, c) の鍵・ルピーを拾う。
	// 初代ゼルダ式（Phase 4-6）＝拾った瞬間に加算せず、ブーメランに「くっつけて」
	// 持ち帰り、キャッチ成立時に確定加算する。
	//   collectFieldItem(r, c)      … 拾えるアイテムがあれば carried 記述子を返す（無ければ null）。
	//                                 記述子を返す時点でタイルは pickedKeys で隠す（二重表示回避）が、
	//                                 player への加算はしない（＝運搬中）。
	//   finalizeCarried(carried)    … キャッチ成立時に player へ確定加算する。
	//   restoreCarried(carried)     … 取り逃し（戻れず消滅）時にタイルを復活させる（その場に残す）。
	// pickedKeys に登録済みならスキップ（handleTileEvent と同じガード）。
	function collectFieldItem(r, c) {
		const stageData = getStageData();
		const tile      = stageData.tiles[r]?.[c];
		if (!tile) return null;
		const ss     = getSS(getCurrentLayer(), getStageKey());
		const posKey = `${r},${c}`;
		if (ss.pickedKeys.has(posKey)) return null;

		let info = null;
		if (tile === TILE.KEY) {
			info = { keys: 1, rupees: 0, spr: 'key',   pal: 'key',       sound: 'key',   msg: '🪃🗝 ブーメランが鍵を持ち帰った！' };
		} else if (tile === TILE.ITEM_RUPEE) {
			info = { keys: 0, rupees: 1, spr: 'rupee', pal: 'rupee',     sound: 'rupee', msg: '🪃◆ ブーメランがルピーを持ち帰った！' };
		} else if (tile === TILE.ITEM_RUPEE_LARGE) {
			info = { keys: 0, rupees: 5, spr: 'rupee', pal: 'rupeeBlue', sound: 'rupee', msg: '🪃◇ ブーメランがルピー×5を持ち帰った！' };
		}
		if (!info) return null;

		// タイルを隠す（運搬アイコンと重複表示させない）。加算は保留。
		// renderBoard() は char-layer を作り直す＝直後に renderChars() を呼ばないと
		// プレイヤー/敵スプライトが消える（ブーメラン飛行中に発火するのでこれが必須）。
		ss.pickedKeys.add(posKey);
		renderBoard(); renderChars();
		// carried 記述子＝運搬アイコン用の spr/pal ＋ キャッチ/取り逃し時の closure。
		return {
			spr: info.spr, pal: info.pal,
			apply() {
				const player = getPlayer();
				player.keys   += info.keys   || 0;
				player.rupees += info.rupees || 0;
				playSound(info.sound); pulse(info.msg);
				renderChars(); updateHud(); saveGame();
			},
			restore() { ss.pickedKeys.delete(posKey); renderBoard(); renderChars(); },
		};
	}

	// キャッチ成立：運搬中アイテムの効果を確定適用する。
	function finalizeCarried(carried) { carried?.apply?.(); }

	// 取り逃し：運搬中アイテムを元の位置に戻す（永久ロス回避）。
	function restoreCarried(carried) { carried?.restore?.(); }

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
		toggleSwitch,
		setActiveColor,
		giveSubItem,
		gainHeartContainer,
		spawnDropEffect,
		toggleFlight,
		collectFieldItem,
		finalizeCarried,  // Phase 4-6: ブーメラン運搬アイテムの確定加算
		restoreCarried,   // Phase 4-6: 取り逃し時にタイルを戻す
		equipSwordTier,   // Phase 7-1: テスト・外部からのティア装備
		equipArmorTier,   // Phase 7-2: 防具ティア装備
		equipShieldTier,  // Phase 7-2: 盾ティア装備
		equipBoomerangTier, // Phase 9-6: ブーメランティア装備（銀のブーメラン）
		grantReward,      // Phase 7-4: 報酬付与の共通化（チェスト/ガチャ共用）
	};
}

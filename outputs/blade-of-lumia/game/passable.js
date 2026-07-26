//  Blade of Lumia  passable.js
//  通行可否判定（Phase 0-2 Step 2 で game.js から切り出し）
//
//  これらの関数は stageData / enemies / player / currentLayer / stageKey /
//  debugMode といった「再代入される可変状態」を参照する。ESModule の
//  named import は read-only binding のため値を直接 import できない。
//  そこで「状態 getter と依存関数を注入する factory」形式にし、game.js が
//  起動時に一度だけ createPassable(deps) を呼んで関数群を生成する。
//  getter 経由で常に最新状態を読むので、呼び出し側の改修は不要。
import { TILE } from '../shared/tiles.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';

// Phase 1-5: 翼の羽衣で飛行中に「上を飛び越えられる」障害物タイル。
// ルール：自然物（空・水・木・茂み・柵）は飛び越え可。
//        山・壁・建造物（家）・閉じた門/扉は飛んでも越えられない＝マップ境界として機能し続ける。
// ※ per-instance のデータ追加は不要（タイル種別だけで分類できる）。
// 飛行で越えられる。溶岩も含む＝溶岩には着地できないので、飛行中に溶岩上へ来たら
// 飛行を維持する必要がある（水/空と同じ。外すと溶岩に落ちて詰む）。
const FLYABLE_OVER = new Set([
	TILE.SKY, TILE.WATER, TILE.LAVA, TILE.TREE, TILE.BUSH, TILE.FENCE,
	// Phase 9-6 深洋O: 閉じた潮ゲートは水と同じ＝飛行で越えられる（着地不可で詰むのを防ぐ）。
	// 開いた潮ゲートは tilePassable が通すのでここには来ない。
	TILE.TIDE_GATE,
]);

// Phase 4-1: はしごで「両隣が地上の1セルだけ」渡れる障害物タイル。
// 水・穴のみ対象（空 SKY は飛行専用、山などは渡れない）。
// ⚠️ 溶岩(LAVA)は含めない＝はしごを架けても熱くて渡れない（ユーザー判断 2026-07-16）。
// 溶岩は恒久の `v` 橋（足場）で渡る設計＝はしご越えを要する箇所は無い（進行に影響なし）。
const LADDER_OVER = new Set([
	TILE.WATER, TILE.PIT,
]);

/**
 * 通行可否判定関数群を生成する。
 * @param {object} d 依存（状態 getter と関数）
 * @param {() => object} d.getStageData   現在のステージデータ
 * @param {() => Array}  d.getEnemies     敵配列
 * @param {() => object} d.getPlayer      プレイヤー
 * @param {() => string} d.getCurrentLayer 現在レイヤー
 * @param {() => string} d.getStageKey    現在ステージキー
 * @param {() => boolean} d.getDebugMode  デバッグモード
 * @param {(lk:string, sk:string) => object} d.getSS ステージ状態取得
 * @param {(y:number) => number} d.toTileRow
 * @param {(x:number) => number} d.toTileCol
 * @returns {{isPassable, tilePassable, isPassableForEnemy}}
 */
export function createPassable(d) {
	const {
		getStageData, getEnemies, getPlayer, getCurrentLayer, getStageKey,
		getDebugMode, getSS, toTileRow, toTileCol,
	} = d;

	// キャラは 1×1 セルの大きさ
	//
	// キャラが占めるタイル範囲：
	//   列方向: floor(x) 〜 floor(x + 0.999)  （x が整数のとき 1列、0.5のとき 2列）
	//   行方向: floor(y) 〜 floor(y + 0.999)
	//
	// 例: x=1.5 → 列 1 と 列 2 に跨る → 両方チェック
	//
	// Phase 4-1c: 第3引数 axis に「進入方向の軸」を渡す（横移動='h' / 縦移動='v'）。
	// 水/穴セルへ入る移動は「進入軸の橋（その軸の両隣が陸＝1セル幅）」のときだけ許可する。
	// これにより縦連続の水を縦方向にスルスル渡れてしまうバグを防ぐ（陸へはどの軸でも出られる）。
	function isPassable(nx, ny, axis) {
		const stageData = getStageData();
		if (!stageData) return false;
		const c0 = Math.floor(nx);
		const c1 = Math.floor(nx + 0.999);
		const r0 = Math.floor(ny);
		const r1 = Math.floor(ny + 0.999);

		// Phase 1-5: 翼の羽衣で飛行中は「空（SKY）」「水（WATER）」を越えられる。
		// 飛行は player 専用（敵は isPassableForEnemy 経由なので地上判定のまま）。
		const player    = getPlayer();
		const flying    = !!player?.flying;
		const hasLadder = !!player?.hasLadder;
		// Phase 4-1c: プレイヤーが「今いる水/穴セル」（橋の上）の範囲。
		// 既に乗っているセルは進入軸チェックの対象外＝陸へはどの軸でも抜けられる。
		const pc0 = player ? Math.floor(player.x) : NaN;
		const pc1 = player ? Math.floor(player.x + 0.999) : NaN;
		const pr0 = player ? Math.floor(player.y) : NaN;
		const pr1 = player ? Math.floor(player.y + 0.999) : NaN;

		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				// マップ外 → ステージ端遷移なので通行可として扱う
				if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) continue;
				if (!tilePassable(r, c)) {
					// 飛行中は自然物（空・水・木・茂み・柵）の上を飛び越えられる。
					// 山・壁・家・閉じた門/扉などは飛んでもブロック（マップ境界を維持）。
					const t = stageData.tiles[r]?.[c];
					// Phase 9-6: bgTiles 層の水下地も飛行で越えられる（tiles 層は床なので isWaterAt で判定）。
					if (flying && (FLYABLE_OVER.has(t) || isWaterAt(r, c))) continue;
					if (hasLadder && (LADDER_OVER.has(t) || isWaterAt(r, c))) {
						// 既にそのセルに乗っているなら通す（橋の上から陸へ・軸を問わず抜けられる）。
						const alreadyOn = (r >= pr0 && r <= pr1 && c >= pc0 && c <= pc1);
						// Phase 4-1c: 新規に踏み込む水/穴は「進入軸の橋（その軸の両隣が陸）」のときだけ
						// 1セルだけ渡れる。axis 未指定なら両軸のどちらかが橋なら許可（後方互換）。
						// axis 指定時はその軸の橋のときだけ許可＝縦連続水を縦に渡れないようにする核心。
						if (alreadyOn || isLadderCrossable(r, c, axis)) continue;
					}
					return false;
				}
			}
		}

		const debugMode = getDebugMode();
		// デバッグモード中は敵すり抜け可能
		if (debugMode) return true;

		// 移動後の石があるセルには移動できない（範囲チェック）
		if (stageData && !debugMode) {
			const _ssp = getSS(getCurrentLayer(), getStageKey());
			for (const st of Object.values(_ssp.stonePositions ?? {})) {
				if (st.r >= r0 && st.r <= r1 && st.c >= c0 && st.c <= c1) return false;
			}
		}

		// 敵と同じタイルセルには移動できない（重なり防止）
		// ※ 「0.6未満」判定だと半セル移動時に動けなくなるため、タイル単位で比較する
		// 大型敵（w×h）は占有セルすべてをブロックする（Phase 3-2）。
		const ptc = toTileCol(nx), ptr = toTileRow(ny);
		for (const e of getEnemies()) {
			const ew = e.w ?? 1, eh = e.h ?? 1;
			const ec = toTileCol(e.x), er = toTileRow(e.y);
			if (ptc >= ec && ptc < ec + ew && ptr >= er && ptr < er + eh) return false;
		}

		return true;
	}

	// Phase 9-6 深洋O: そのセルが「水」か（tiles 層の水 `~` または bgTiles 層の水下地）。
	// 水は本来「地形」なので bgTiles に置けるようにした（敵を水上に立たせるため）。
	// tiles 水（既存の湖/海/堀）と bgTiles 水（敵の足元）を同じ扱いにする単一の判定点。
	function isWaterAt(r, c) {
		const stageData = getStageData();
		if (!stageData) return false;
		if (stageData.tiles[r]?.[c] === TILE.WATER) return true;
		return stageData.bgTiles?.[`${r},${c}`] === TILE.WATER;
	}

	function tilePassable(r, c) {
		const stageData = getStageData();
		const tile   = stageData.tiles[r]?.[c];
		if (!tile) return false;
		const posKey = `${r},${c}`;
		const ss     = getSS(getCurrentLayer(), getStageKey());
		const debugMode = getDebugMode();
		if (tile === TILE.WALL) return false;
		// 水は tiles 層でも bgTiles 層（下地）でも不通（はしご/飛行は isPassable で上書き）。
		if (isWaterAt(r, c)) return false;
		if (tile === TILE.LAVA) return false;  // 溶岩：地上では通れない（飛行/はしごは isPassable で許可＝水と同じ）
		if (tile === TILE.SKY) return false;  // 空（虚空）：地上では通れない（飛行は isPassable で許可）
		if (tile === TILE.PIT) return false;  // 穴：地上では通れない（はしごは isPassable で許可）
		if (tile === TILE.GATE   && !ss.openGates.has(posKey)) return false;
		// Phase 9-6 深洋O: 潮ゲート。openGates に無い＝潮が満ちて水（不通）／
		// 有る＝潮が引いて床（通行可）。GATE と同じ links→openGates 機構で開閉する。
		if (tile === TILE.TIDE_GATE && !ss.openGates.has(posKey)) return false;
		// Phase 5-1: 色ゲートは activeColor が自色のときだけ通行可（links とは独立）
		if (tile === TILE.GATE_RED)  return ss.activeColor === 'red';
		if (tile === TILE.GATE_BLUE) return ss.activeColor === 'blue';
		// デバッグモード中はドアを素通り（鍵不要）
		if (tile === TILE.DOOR   && !ss.openedDoors?.has(posKey) && !debugMode) return false;
		if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) return false;
		if (NPC_SPRITE_MAP[tile]) return false;
		// Phase 8: フィールドタイル通行判定
		if (tile === TILE.TREE)        return false;
		if (tile === TILE.MOUNTAIN)    return false;
		if (tile === TILE.FENCE)       return false;
		if (tile === TILE.HOUSE_WALL)  return false;
		if (tile === TILE.HOUSE_ROOF)  return false;
		if (tile === TILE.SIGN)        return false; // 看板は通行不可（隣接して剣で読む）
		if (tile === TILE.BUSH) {
			// 茂み：切られていれば通行可
			if (ss.cutBushes?.has(posKey)) return true;
			return false;
		}
		// 石（STONE）の通行判定：元のタイル位置で判断
		if (tile === TILE.STONE) {
			const _ss = getSS(getCurrentLayer(), getStageKey());
			// stonePositions に登録されていれば石は移動済み → 元の位置は床として通行可
			if (_ss.stonePositions?.[posKey]) return true;
			return false; // 移動されていない → 石がある → 通れない
		}
		// Phase 6.5: ドアウェイの通行判定
		if (tile === TILE.DOORWAY_BOSS || tile === TILE.DOORWAY_LOCKED) {
			const dwState = ss.doorwayStates?.[posKey];
			// DOORWAY_LOCKED: 閉じている間は通れない
			if (tile === TILE.DOORWAY_LOCKED) {
				const state = dwState ?? 'closed';
				if (state !== 'open') return false;
			}
			// DOORWAY_BOSS: boss_closed 状態は通れない
			if (tile === TILE.DOORWAY_BOSS) {
				if (dwState === 'boss_closed') return false;
			}
		}
		return true;
	}

	// Phase 4-1: はしごで渡れる「1セル幅の水/穴」かを判定する（軸を問わない版）。
	// 縦方向（上下が地上）または横方向（左右が地上）のどちらかが成立すれば渡れる。
	// 2連続の水/穴は、その軸の隣もまた水/穴になるため成立せず＝渡れない。
	// ※ 「地上」= LADDER_OVER でない通行可タイル（床・草・橋など）。壁等の不可タイルは橋脚にならない。
	function isLadderBridge(r, c) {
		return isHorizBridge(r, c) || isVertBridge(r, c);
	}

	// 横向きの橋（左右が陸）か
	function isHorizBridge(r, c) {
		return isLadderBank(r, c - 1) && isLadderBank(r, c + 1);
	}
	// 縦向きの橋（上下が陸）か
	function isVertBridge(r, c) {
		return isLadderBank(r - 1, c) && isLadderBank(r + 1, c);
	}

	// Phase 4-1c: 進入軸 axis（'h'=横移動 / 'v'=縦移動）でその水/穴セルを渡れるか。
	// axis 指定時はその軸の橋のときだけ許可（縦連続水を縦に渡れないようにする核心ロジック）。
	// axis 未指定（軸不明）なら両軸のどちらかが橋なら許可（後方互換）。
	function isLadderCrossable(r, c, axis) {
		if (axis === 'h') return isHorizBridge(r, c);
		if (axis === 'v') return isVertBridge(r, c);
		return isLadderBridge(r, c);
	}

	// はしごの橋脚になりうる「地上」セルか（通行可、かつ水/穴でない）。
	function isLadderBank(r, c) {
		const stageData = getStageData();
		if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) return false;
		const t = stageData.tiles[r]?.[c];
		if (LADDER_OVER.has(t)) return false;  // 水/穴は橋脚にならない
		if (isWaterAt(r, c)) return false;     // Phase 9-6: bgTiles 水下地も橋脚にならない
		return tilePassable(r, c);
	}

	// Phase 4-1b/4-1c: 描画側が使う「はしごが架かるセルの向き」判定。
	// そのセルが水/穴で、進入軸 axis の橋が成立すれば 'h'（横）/ 'v'（縦）を返す。
	// 架からない（橋脚が無い・水/穴でない・進入軸が橋でない）なら null。
	// 向きは「進入軸」で決まる（プレイヤーが今そのセルへ入ってきた方向の軸）。
	// axis 未指定なら従来どおりセルの地形で決める（横優先）。
	function ladderOrientationAt(r, c, axis) {
		const stageData = getStageData();
		if (!stageData) return null;
		const t = stageData.tiles[r]?.[c];
		// Phase 9-6: tiles 層の水/穴 または bgTiles 層の水下地が対象。
		if (!LADDER_OVER.has(t) && !isWaterAt(r, c)) return null;
		if (axis === 'h') return isHorizBridge(r, c) ? 'h' : null;
		if (axis === 'v') return isVertBridge(r, c) ? 'v' : null;
		if (isHorizBridge(r, c)) return 'h';
		if (isVertBridge(r, c)) return 'v';
		return null;
	}

	// Phase 9-6 深洋O: 敵の移動媒体（self.move）で「水セルに入れるか／陸セルに
	// 上がれるか」を判定する。tilePassable は水を万人に不通とするので、敵の水棲/両生は
	// ここで上書きする（プレイヤーの飛行/はしごが isPassable で上書きするのと同じ構図）。
	//   'water'      … 水は可・乾いた陸は不可（陸に上がれない）。溶岩/空は不可。
	//   'amphibious' … 水も陸も可。溶岩/空は不可。
	//   それ以外     … 従来どおり tilePassable に従う（水は不通）。
	// 戻り値：そのセルがこの敵にとって通行可なら true。
	function enemyTilePassable(r, c, move) {
		// 水は tiles 層でも bgTiles 層（下地）でも「水」＝水棲/両生だけが泳げる。
		if (isWaterAt(r, c)) {
			return move === 'water' || move === 'amphibious';
		}
		// 乾いた陸（床・草など＝tilePassable が通す通行可タイル）へは水棲は上がれない。
		if (move === 'water' && tilePassable(r, c)) return false;
		return tilePassable(r, c);
	}

	// 敵向けの通行可否（占有 w×h セルすべてをチェック）
	// 大型敵（Phase 3-2）は self.w/self.h で占有範囲が広がる。
	// nx/ny は移動後の top-left 座標。
	function isPassableForEnemy(ny, nx, self) {
		const stageData = getStageData();
		if (!stageData) return false;
		const ew = self?.w ?? 1, eh = self?.h ?? 1;
		const move = self?.move;
		// 占有範囲：top-left から w×h セル（半セル移動分の +0.999 も考慮）
		const c0 = Math.floor(nx);
		const c1 = Math.floor(nx + ew - 1 + 0.999);
		const r0 = Math.floor(ny);
		const r1 = Math.floor(ny + eh - 1 + 0.999);

		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) return false;
				if (!enemyTilePassable(r, c, move)) return false;
			}
		}
		// 移動後の石があるセルには通れない（占有範囲のどれかに重なれば不可）
		if (stageData) {
			const _sspe = getSS(getCurrentLayer(), getStageKey());
			for (const st of Object.values(_sspe.stonePositions ?? {})) {
				if (st.c >= c0 && st.c <= c1 && st.r >= r0 && st.r <= r1) return false;
			}
		}
		// 他の敵と占有範囲が重なるなら通れない（AABB 重なり判定）
		for (const e of getEnemies()) {
			if (e === self) continue;
			const ow = e.w ?? 1, oh = e.h ?? 1;
			if (nx < e.x + ow && nx + ew > e.x && ny < e.y + oh && ny + eh > e.y) return false;
		}
		// プレイヤーと占有セルが重なるなら移動できない（重なり防止）
		// 隣接セルへの移動は許可するので体当たり攻撃は成立する
		const player = getPlayer();
		const ptc = toTileCol(player.x), ptr = toTileRow(player.y);
		if (ptc >= c0 && ptc <= c1 && ptr >= r0 && ptr <= r1) return false;
		return true;
	}

	// isWaterAt は「そのセルが水か」の単一の判定点（Phase 9-6）。
	// enemy-ai.js が両生敵（amphibious）の地形別速度に使うため公開する。
	return { isPassable, tilePassable, isPassableForEnemy, ladderOrientationAt, isLadderCrossable, isWaterAt };
}

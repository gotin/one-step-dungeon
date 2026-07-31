//  Blade of Lumia  conditions.js
//  条件評価・石スイッチ・ゲート連動（Phase 0-2 Step 2 で game.js から切り出し）
//
//  passable.js と同じく、再代入される可変状態（stageData/enemies/player/
//  currentLayer/stageKey）を参照するため「状態 getter と依存関数を注入する
//  factory」形式にする。playSound / renderBoard / renderChars といった副作用
//  関数も注入で受け取り、呼び出し側（game.js）の改修を不要にする。
import { TILE } from '../shared/tiles.js';
import { playSound } from '../shared/sounds.js';

/**
 * 条件評価関数群を生成する。
 * @param {object} d 依存（状態 getter と関数）
 * @param {() => object} d.getStageData    現在のステージデータ
 * @param {() => Array}  d.getEnemies      敵配列
 * @param {() => object} d.getPlayer       プレイヤー
 * @param {() => string} d.getCurrentLayer 現在レイヤー
 * @param {() => string} d.getStageKey     現在ステージキー
 * @param {(lk:string, sk:string) => object} d.getSS ステージ状態取得
 * @param {(y:number) => number} d.toTileRow
 * @param {(x:number) => number} d.toTileCol
 * @param {() => void} d.renderBoard
 * @param {() => void} d.renderChars
 * @returns {{checkStoneOnSwitch, evaluateConditions, refreshGates}}
 */
export function createConditions(d) {
	const {
		getStageData, getEnemies, getPlayer, getCurrentLayer, getStageKey,
		getSS, toTileRow, toTileCol, renderBoard, renderChars,
	} = d;

	// ── ゲート開閉の単一ソース（冪等・毎回全再計算） ─────────────────
	// 仕様（2026-07-31 ユーザー確定）：1ステージ内の全ボタン S が ON になったら、
	// 同じステージの全ゲート T を開く（＝倉庫番の「全石がスイッチに乗ったらクリア」の
	// 代替＝ゲート開放が報酬）。潮ゲート = と、ボタンの無いステージの Y スイッチ→T は
	// 従来どおり links（switchId→gateId）で個別連動させる。
	//
	// スイッチ/石の状態（switchStates・switchToggles）を更新した後、必ずこれを呼ぶ。
	// 前後で openGates を比較し、新規に開いたゲートがあれば gateOpen を鳴らす。
	function refreshGates() {
		const stageData = getStageData();
		if (!stageData) return;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (!ss.openGates) ss.openGates = new Set();
		const before = new Set(ss.openGates);

		// ステージ内のボタン S・ゲート T を収集
		const buttons = [], gatesT = [];
		for (let r = 0; r < stageData.rows; r++) {
			for (let c = 0; c < stageData.cols; c++) {
				const t = stageData.tiles[r][c];
				if (t === TILE.BUTTON) buttons.push(`${r},${c}`);
				else if (t === TILE.GATE) gatesT.push(`${r},${c}`);
			}
		}

		// ① ボタン→ゲート T：全ボタン ON なら全 T 開、そうでなければ全 T 閉
		const hasButtons = buttons.length > 0;
		if (hasButtons) {
			const allOn = buttons.every(pk => ss.switchStates?.[pk] === true);
			for (const g of gatesT) {
				if (allOn) ss.openGates.add(g);
				else       ss.openGates.delete(g);
			}
		}

		// ② links 連動：潮ゲート = と、ボタンの無いステージの Y→T を担う。
		//    ボタンがあるステージの T は①が担うので links の T エントリはスキップ（競合回避）。
		for (const link of stageData.links ?? []) {
			const [gr, gc] = link.gateId.split(',').map(Number);
			if (hasButtons && stageData.tiles[gr]?.[gc] === TILE.GATE) continue;
			const on = ss.switchToggles?.has(link.switchId) || ss.switchStates?.[link.switchId] === true;
			if (on) ss.openGates.add(link.gateId);
			else    ss.openGates.delete(link.gateId);
		}

		// 新規に開いたゲートがあれば音を鳴らす
		for (const g of ss.openGates) if (!before.has(g)) { playSound('gateOpen'); break; }
	}

	// 石がスイッチの上に乗っているかチェックしてスイッチ状態を更新
	function checkStoneOnSwitch() {
		const stageData = getStageData();
		const player    = getPlayer();
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (!ss.stonePositions) return;
		// ボタン（BUTTON）はモーメンタリ式：石またはプレイヤーが乗っている間だけ ON、
		// どちらも居なければ OFF。石/プレイヤーで挙動を分けない（離れれば必ず閉じる）。
		// ※ OFF 側（乗っていない→閉じる）は player.js checkSwitchOff が移動ごとに担う。
		//    ここは石が乗った瞬間の ON への更新だけを担当し、ゲート開閉は refreshGates() に委ねる。
		for (let r = 0; r < stageData.rows; r++) {
			for (let c = 0; c < stageData.cols; c++) {
				if (stageData.tiles[r][c] !== TILE.BUTTON) continue;
				const pk = `${r},${c}`;
				const stoneHere = Object.values(ss.stonePositions).some(st => st.r === r && st.c === c);
				const playerHere = toTileRow(player.y) === r && toTileCol(player.x) === c;
				if ((stoneHere || playerHere) && !ss.switchStates[pk]) ss.switchStates[pk] = true;
			}
		}
		refreshGates();
	}

	// ── 条件評価 ──────────────────────────────────────────────────
	function evaluateConditions() {
		const stageData = getStageData();
		if (!stageData?.showConditions) return;
		const enemies = getEnemies();
		const player  = getPlayer();
		const ss = getSS(getCurrentLayer(), getStageKey());
		for (const [posKey, cond] of Object.entries(stageData.showConditions)) {
			if (ss.conditionsMet.has(posKey)) continue;
			let met = false;
			if (cond.trigger === 'killAll')    met = enemies.length === 0;
			else if (cond.trigger === 'flutePlayed') met = ss.flutePlayed === true;  // Phase 4-2: 笛を吹いた
			else if (cond.trigger === 'bushBurned') met = ss.bushBurned === true;  // Phase 4-3: ロウソクで茂みを燃やした
			else if (cond.trigger === 'switchOn') met = ss.switchStates?.[cond.switchId] === true;
			else if (cond.trigger === 'wallBroken') met = ss.brokenWalls?.has(cond.wallId);
			else if (cond.trigger === 'hasItem') met = !!player.subItems[cond.item] || player.weapon === cond.item;
			else if (cond.trigger === 'allSwitchesOn') {
				const allSw = [];
				for (let _r = 0; _r < stageData.rows; _r++) {
					for (let _c = 0; _c < stageData.cols; _c++) {
						if (stageData.tiles[_r][_c] === TILE.BUTTON) allSw.push(`${_r},${_c}`);
					}
				}
				met = allSw.length > 0 && allSw.every(pk => ss.switchStates?.[pk] === true);
			}
			else if (cond.trigger === 'torchesLit') {  // Phase 4-5 ②: 全かがり火点灯
				const allTorches = [];
				for (let _r = 0; _r < stageData.rows; _r++) {
					for (let _c = 0; _c < stageData.cols; _c++) {
						if (stageData.tiles[_r][_c] === TILE.TORCH) allTorches.push(`${_r},${_c}`);
					}
				}
				met = allTorches.length > 0 && allTorches.every(pk => ss.litTorches?.has(pk));
			}
			if (met) {
				ss.conditionsMet.add(posKey);
				playSound('appear');
				renderBoard(); renderChars();
			}
		}
	}

	return { checkStoneOnSwitch, evaluateConditions, refreshGates };
}

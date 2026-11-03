//  Blade of Lumia  tide.js
//  潮の満ち引き（キュー94・2026-11-02 ユーザー判断「潮の満ち引き」＝D3 の素の部屋の土台）
//
//  画面の `tideCycle: { highMs, lowMs, warnMs }` を持つ部屋では、潮ゲート `=` が時間で勝手に
//  満ち引きする（D5 の潮はスイッチ・ボタンで動く＝勇者が操る。こちらは勝手に動く＝勇者が読む）。
//    ・周期＝入室した瞬間から「満ち（highMs）→ 引き（lowMs）」の繰り返し。入るたびに満ちから始まる
//      ＝最初に水を見せ、引いて道が現れるのを見せる（セーブには載せない＝部屋を出れば作り直し）。
//    ・引きの最後の warnMs は予告＝砂州が波打つ（`.cell.tide-rising`）＋音 `tideWarn`。
//    ・満ちた瞬間（引き→満ち）：
//        - その上に体が掛かっていた雑魚は沈んで倒れる（enemy-ai.js sinkEnemiesOnCells＝D8 の
//          「沈むのは水と溶岩だけ」の延長・飛ぶ／泳ぐ敵とボスは対象外）。
//        - 勇者は最後に乾いた所（潮の掛からないセルだけに立っていた位置）へ押し戻され、
//          小ダメージ（TIDE_SWEEP_DAMAGE）。デバッグ（すり抜け）中は押し戻さない。
//    ・links で鐘・ボタンにつながった `=` はこの周期の対象外（従来どおり refreshGates が担う）
//      ＝同じ部屋に混ぜてもよいが、潮の周期で開閉するのは links に無い `=` だけ。
//  開閉は refreshGates と同じ `ss.openGates` に書く＝通行（passable.js）・描画（render-board.js）・
//  着地・ソルバーの読み手はどれも変えずに済む。
import { TILE } from '../shared/tiles.js';
import { playSound } from '../shared/sounds.js';

export const TIDE_SWEEP_DAMAGE = 1;   // 半ハート（HP_PER_HEART=2）

/** 部屋の潮の周期（無ければ null）。既定＝予告 720ms。 */
export function tideCycleOf(stageData) {
	const t = stageData?.tideCycle;
	if (!t || !(t.highMs > 0) || !(t.lowMs > 0)) return null;
	return { highMs: t.highMs, lowMs: t.lowMs, warnMs: Math.min(t.warnMs ?? 720, t.lowMs) };
}

/** 潮の周期で動く `=`（links の行き先になっていない物）。 */
export function tidalCellsOf(stageData) {
	if (!tideCycleOf(stageData)) return [];
	const linked = new Set((Array.isArray(stageData.links) ? stageData.links : []).map(l => l.gateId));
	const out = [];
	for (let r = 0; r < stageData.rows; r++) {
		for (let c = 0; c < stageData.cols; c++) {
			if (stageData.tiles[r]?.[c] === TILE.TIDE_GATE && !linked.has(`${r},${c}`)) out.push(`${r},${c}`);
		}
	}
	return out;
}

/** 入室から elapsed ms 経った時点の潮。low＝引いている／warn＝引きの最後の予告の窓。 */
export function tidePhaseAt(cycle, elapsed) {
	const period = cycle.highMs + cycle.lowMs;
	const t = ((elapsed % period) + period) % period;
	const low = t >= cycle.highMs;
	const msToChange = low ? period - t : cycle.highMs - t;
	return { low, warn: low && msToChange <= cycle.warnMs, msToChange };
}

/**
 * @param {object} d
 * @param {() => object} d.getStageData
 * @param {() => object} d.getPlayer
 * @param {() => string} d.getCurrentLayer
 * @param {() => string} d.getStageKey
 * @param {(lk:string, sk:string) => object} d.getSS
 * @param {() => number} d.gameNow
 * @param {() => boolean} d.getDebugMode
 * @param {(cells:Set<string>, now:number) => number} d.sinkEnemiesOnCells
 * @param {(amount:number, opts?:object) => void} d.takeDamage
 * @param {() => void} d.renderBoard
 * @param {() => void} d.renderChars
 */
export function createTide(d) {
	const {
		getStageData, getPlayer, getCurrentLayer, getStageKey, getSS, gameNow,
		getDebugMode, sinkEnemiesOnCells, takeDamage, renderBoard, renderChars,
	} = d;

	// 部屋ごとの一時状態（セーブに載せない）。
	let t0 = 0;
	let cells = [];
	let cellSet = new Set();
	let low = false;
	let warn = false;
	let lastDry = null;   // 潮の掛からないセルだけに立っていた最後の位置 {x, y}

	function playerCells(p) {
		const rows = [...new Set([Math.floor(p.y), Math.ceil(p.y)])];
		const cols = [...new Set([Math.floor(p.x), Math.ceil(p.x)])];
		const out = [];
		for (const r of rows) for (const c of cols) out.push(`${r},${c}`);
		return out;
	}

	function apply(ss, isLow) {
		if (!ss.openGates) ss.openGates = new Set();
		for (const k of cells) {
			if (isLow) ss.openGates.add(k);
			else       ss.openGates.delete(k);
		}
	}

	// 入室ごとに呼ぶ（enterStage）。満ちから始める。
	function resetTide() {
		const sd = getStageData();
		cells = tidalCellsOf(sd);
		cellSet = new Set(cells);
		t0 = gameNow();
		low = false;
		warn = false;
		lastDry = null;
		const ss = getSS(getCurrentLayer(), getStageKey());
		ss.tideWarn = false;
		if (!cells.length) return;
		apply(ss, false);
		const p = getPlayer();
		if (!playerCells(p).some(k => cellSet.has(k))) lastDry = { x: p.x, y: p.y };
	}

	function tickTide() {
		if (!cells.length) return;
		const sd = getStageData();
		const cycle = tideCycleOf(sd);
		if (!cycle) return;
		const now = gameNow();
		const p = getPlayer();
		const ss = getSS(getCurrentLayer(), getStageKey());
		const ph = tidePhaseAt(cycle, now - t0);
		let redraw = false;

		if (ph.low !== low) {
			low = ph.low;
			apply(ss, low);
			redraw = true;
			if (low) {
				playSound('tideOut');
			} else {
				// 満ちた瞬間：上の雑魚は沈む・勇者は押し戻される
				sinkEnemiesOnCells(cellSet, now);
				const onTide = playerCells(p).some(k => cellSet.has(k));
				if (onTide && !getDebugMode() && !p.flying && lastDry) {
					p.x = lastDry.x;
					p.y = lastDry.y;
					playSound('sink');
					takeDamage(TIDE_SWEEP_DAMAGE);
				}
			}
		}
		if (ph.warn !== warn) {
			warn = ph.warn;
			ss.tideWarn = warn;
			redraw = true;
			if (warn) playSound('tideWarn');
		}
		if (!playerCells(p).some(k => cellSet.has(k))) lastDry = { x: p.x, y: p.y };
		if (redraw) { renderBoard(); renderChars(); }
	}

	// テスト用（ホワイトリスト）。
	function getTideState() {
		const sd = getStageData();
		const cycle = tideCycleOf(sd);
		if (!cycle || !cells.length) return null;
		const ph = tidePhaseAt(cycle, gameNow() - t0);
		return { cells: [...cells], low, warn, msToChange: ph.msToChange, lastDry: lastDry ? { ...lastDry } : null, cycle: { ...cycle } };
	}

	return { resetTide, tickTide, getTideState };
}

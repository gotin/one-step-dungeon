// scripts/lib/flute-escape.mjs
// 笛で石を戻す部屋（fluteEffect.type === 'resetStones'）で「笛を吹いたせいで部屋から出られなくなる」状態が無いかを測る。
//
// 経緯：キュー112b（2026-11-22）。ユーザーの問い「逆に脱出できなくなるステージはない？」を状態空間で測ると、
// D8 `2,4`（底なし沼の石）で2種類の閉じ込めが見つかった＝①沈めた石の足場の上で吹くと足元が泥に戻る
// ②泥橋の先（宝箱の小島）で吹くと橋が消える。ユーザー判断＝「遊んでいる最中に検知する」より、作る段階で
// 検知して、その場所では笛を不発にする／理想の状態になったら石を固める。この関数がその検知。
//
// 測り方（2段）：
//   1. 口から石の初期配置で入り、笛も手に含めて状態を広げる＝「笛が実際に効く」状態の立ち位置を集める。
//      笛の規則は実エンジン（game/game.js playFlute・game/player.js handleTileEvent）の写し：
//        ・石が固まっている（全踏み板に石＝stonesLocked／lockStonesAt のマスに乗った）なら不発
//        ・石の戻る場所に立っている／沈んだ石の足場に立っているなら不発
//        ・石が初期配置のままなら何も起きない
//   2. その立ち位置ごとに、石を初期配置に戻した状態から口（外周の開いたセル・戻り口 `>`）へ戻れるかを、
//      口に着いたら打ち切る BFS で測る。戻れない立ち位置＝閉じ込め。
// 口の段そのものは「立てる床」として測る（ここでは口に着く＝出られる、が答えなので床でよい）。
import { ROWS, COLS, makeSolver } from './blade-solver.mjs';

export function fluteRoomSolver(st) {
	const rows = st.tiles.map((r) => (Array.isArray(r) ? r : [...r]));
	const tiles = rows.map((r) => r.map((ch) => (ch === '>' ? '.' : ch)));
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, v] of Object.entries(st.bgTiles ?? {})) { const [r, c] = k.split(',').map(Number); if (bg[r]) bg[r][c] = v; }
	const bySw = new Map();
	for (const l of Array.isArray(st.links) ? st.links : []) {
		if (!bySw.has(l.switchId)) bySw.set(l.switchId, []);
		bySw.get(l.switchId).push(l.gateId);
	}
	const S = makeSolver(tiles, bg, [...bySw], {}, new Set(), { hasLadder: true, hasCandle: true, lavaSinks: true });
	const exits = new Set();
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const edge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
		if (rows[r][c] === '>' || (edge && rows[r][c] !== '#')) exits.add(`${r},${c}`);
	}
	const lockCells = new Set(st.lockStonesAt ?? []);
	const init = S.initStones.join(';');
	// 笛つきの次の状態。lockStonesAt のマスに入ったら locked を立てる（実エンジンは乗った瞬間に固める）。
	const next = (s) => {
		const out = S.nextStates(s).map((x) => {
			if (!lockCells.size) return x;
			const p = x.split('|');
			if (lockCells.has(p[0]) && p[5] !== '1') { p[5] = '1'; return p.join('|'); }
			return x;
		});
		const f = fluteOf(s);
		if (f) out.push(f);
		return out;
	};
	// 笛が効くならその後の状態、効かないなら null
	const fluteOf = (s) => {
		const p = s.split('|');
		if (p[5] === '1') return null;
		const stones = p[1] ? p[1].split(';') : [];
		if (p[1] === init) return null;
		if (S.buttons.length > 0 && S.buttons.every((b) => stones.includes(b))) return null;
		if (S.initStones.includes(p[0])) return null;      // 石の戻る場所に立っている
		if (stones.includes(`s${p[0]}`)) return null;      // 沈んだ石の足場に立っている
		p[1] = init;
		return p.join('|');
	};
	return { S, exits, next, fluteOf };
}

/**
 * @returns {{ fluteCells: string[], trapped: string[], capped: boolean, states: number }}
 *   fluteCells＝笛が効く立ち位置・trapped＝笛の後に口へ戻れない立ち位置（打ち切りは末尾に '?'）
 */
export function measureFluteEscape(st, { forwardCap = 1_500_000, perCellCap = 1_000_000 } = {}) {
	const { S, exits, next, fluteOf } = fluteRoomSolver(st);
	const starts = [...exits].map((e) => { const [r, c] = e.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const seen = new Set(starts); const q = [...starts]; let head = 0;
	const after = new Map();   // 笛の後の状態（立ち位置・その他の状態は吹いたときのまま）
	while (head < q.length && seen.size < forwardCap) {
		const s = q[head++];
		const f = fluteOf(s);
		if (f) after.set(f, s.split('|')[0]);
		for (const x of next(s)) if (!seen.has(x)) { seen.add(x); q.push(x); }
	}
	const capped = head < q.length;
	const fluteCells = new Set(after.values());
	const trapped = new Set();
	for (const [s0, cell] of after) {
		const vis = new Set([s0]); const qq = [s0]; let h = 0; let found = false;
		while (h < qq.length && vis.size < perCellCap) {
			const s = qq[h++];
			if (exits.has(s.split('|')[0])) { found = true; break; }
			for (const x of next(s)) if (!vis.has(x)) { vis.add(x); qq.push(x); }
		}
		if (!found) trapped.add(h < qq.length ? `${cell}?` : cell);
	}
	return { fluteCells: [...fluteCells].sort(), trapped: [...trapped].sort(), capped, states: seen.size };
}

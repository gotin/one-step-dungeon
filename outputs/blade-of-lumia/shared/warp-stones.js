// ── Blade of Lumia – 転移の石碑（WARP_STONE・`‡`）の一覧 ── キュー27 ──────────────
//
// ✅ ユーザー判定（2026-10-03）＝機構は「転移の石碑」・全部の石碑ではなく選んだ8枚だけ・
//    飛び方は「石碑から石碑へ」。
//   ・初めて読むと灯る（`player.litWarpStones` に id が入る）＝行った所にしか飛べない
//     ∴進行の順序を壊さない。
//   ・灯った転移碑の前で読むと、灯っている他の転移碑から行き先を選べる。
//
// 🔴 どれが転移碑かはマップのタイル `‡` だけが決める＝ここに一覧を書き写さない
//    （エディタで置き直せば一覧も変わる）。名前は `signData[r,c].name`。
//
// このファイルは DOM を触らない＝ゲーム・テスト・検査スクリプトが同じ一覧を使う。
import { TILE } from './tiles.js';

/** 転移碑の id（`player.litWarpStones` の要素）。 */
export function warpStoneId(layer, stage, posKey) {
	return `${layer}:${stage}:${posKey}`;
}

/**
 * マップ全体の転移碑を並べる。並び＝北から南・西から東（行き先の一覧の上下そのまま）。
 * field の画面キーは "x,y"＝`stage.split(',')` の2つ目が南北。
 * @returns {{id:string, layer:string, stage:string, r:number, c:number, name:string}[]}
 */
export function listWarpStones(mapData) {
	const out = [];
	for (const [layer, ld] of Object.entries(mapData?.layers ?? {})) {
		for (const [stage, sd] of Object.entries(ld?.stages ?? {})) {
			(sd?.tiles ?? []).forEach((row, r) => {
				for (let c = 0; c < row.length; c++) {
					if (row[c] !== TILE.WARP_STONE) continue;
					const posKey = `${r},${c}`;
					// 本文は signData か npcData（読み取りと同じ順＝combat.js）
					const name = (sd.signData?.[posKey] ?? sd.npcData?.[posKey])?.name ?? '転移の石碑';
					out.push({ id: warpStoneId(layer, stage, posKey), layer, stage, r, c, name });
				}
			});
		}
	}
	const yx = (s) => { const [x, y] = s.stage.split(',').map(Number); return [y, x]; };
	out.sort((a, b) => {
		if (a.layer !== b.layer) return a.layer < b.layer ? -1 : 1;
		const [ay, ax] = yx(a), [by, bx] = yx(b);
		return ay - by || ax - bx || a.r - b.r || a.c - b.c;
	});
	return out;
}

/** 着地の候補セル（碑の 南 → 東 → 西 → 北）。どれが空いているかは呼び手（ゲームの着地判定）が決める。 */
export function warpLandingCandidates(ws) {
	return [[ws.r + 1, ws.c], [ws.r, ws.c + 1], [ws.r, ws.c - 1], [ws.r - 1, ws.c]];
}

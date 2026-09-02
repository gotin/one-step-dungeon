#!/usr/bin/env node
/**
 * migrate-sea-lord-room-widen.mjs
 *   Phase 8-4 (4) 0d-3（9体目 `{` 海の主）— 実プレイの判断（d）による本番ボス部屋の作り直し
 *
 * ── なぜ直すか（ユーザーの実プレイ報告・2026-09-01）─────────────────────────
 * 「せまいのにこれ、どうやって倒せばいいの？」「なんかよくわからない攻撃を受けている」。
 * 幾何で測ると、原因は機構ではなく**部屋**だった（`.scratch/sea-lord-room-space.mjs`）：
 *   ・立てる床は 31 セル（＋門4セル）。門（`:`）は入室で `boss_closed` ＝**戦闘中は通れない**
 *     ∴ 戦闘中に立てる床から主の面までの最大距離は **2.0**。
 *   ・∴ `triggerRange`（前半 3.5／後半 4.5）の外に立てる床は **前半でも 0 セル**＝
 *     部屋のどこに立っても乗り上げが飛んで来る（GUIDE §7-15 の逆＝「常時圧」）。
 *   ・東西の通り道は rows 4〜5 の**2行しかない**＝掃過の危険域の半幅
 *     （halfW 0.5 ＋ hitRange 0.8 ＝ **1.3**）が2行とも覆う∴予告を見ても避ける先が無い。
 * つまり「予告を見て横へ退く」という機構の芯が、この部屋では**成立していなかった**。
 *
 * ── 何をするか（ユーザー決定：池はそのまま・まわりを外へ広げる）───────────────
 * 4×4 の池（rows 3〜6 × cols 4〜7）と主の位置（`{` at (4,5)）は **1セルも触らない**。
 * 変えるのは `bgTiles`（＝field の見える地面・水の単一ソース）だけ：
 *
 *      変更前                        変更後
 *   0  ~~~~~~~~~~~~               0  ~~~~~~~~~~~~
 *   1  ~~~~~~~~~~~~               1  ~oooooooooo~
 *   2  ~~oooooooo~~               2  ~oooooooooo~
 *   3  ~~oo~~~~oo~~               3  ~ooo~~~~ooo~
 *   4  oooo~~~~oooo               4  oooo~~~~oooo
 *   5  oooo~~~~oooo               5  oooo~~~~oooo
 *   6  ~~oo~~~~oo~~               6  ~ooo~~~~ooo~
 *   7  ~~oooooooo~~               7  ~oooooooooo~
 *   8  ~~~~~~~~~~~~               8  ~oooooooooo~
 *   9  ~~~~~~~~~~~~               9  ~~~~~~~~~~~~
 *
 *   南北の通り道 1行 → **2行**（rows 1〜2 / 7〜8）、東西 2列 → **3列**（cols 1〜3 / 8〜10）。
 *   立てる床 31 → 59。`tiles` 層は 1 文字も変えない（岩 'h' ×4 と宝箱 'B' はそのまま
 *   ＝潮吹き（射程 8・予告なし）の遮蔽物として残す）。
 *
 * ── 外周1セル（rows 0/9・cols 0/11）を水のまま残す理由 ─────────────────────
 * 見た目（沖に浮かぶ島）を保ちつつ**封鎖**したい。1セル幅の水は普通「はしごで渡れる」
 * 抜け道になるが、`passable.js isLadderBank` は**マップ外を橋脚と認めない**
 * （`r < 0 || r >= rows` で false）∴画面の最外周に置いた1セル幅の水は縦にも横にも
 * 渡れない＝壁を建てずに封鎖できる。この読みはスクリプト内 `assertNoLadderBypass()` が
 * 実データで機械的に確かめる（＝コメントの主張を信用しない）。
 *
 * ── 自己検証（このスクリプトが守る不変条件）─────────────────────────────
 *   ① 池（rows 3〜6 × cols 4〜7）は全セル水・`tiles` 層は完全に不変・`{` は (4,5)。
 *   ② 外周は門4セル（(4,0)(5,0)(4,11)(5,11)）以外すべて水＝ボス部屋は閉じている。
 *   ③ はしごで渡れる水セルが1つも無い（迂回・脱走の穴が開いていない）。
 *   ④ 継ぎ目の足跡：門の1つ内側（(4,1)(5,1)(4,10)(5,10)）が通行可
 *      （checkStageTransition の着地は2列をまたぐ＝境界だけ開けても弾き返される）。
 *   ⑤ **横滑りの余地**：戦闘中に立てるどの床からも、乗り上げ（9通りの立ち位置 × 4方向）の
 *      危険域（軸から 1.3）の外へ **2歩以内**（予告 600ms ＝5 tick ＝歩いて 2.5 セル）で
 *      出られる。＝ユーザーが踏んだ「避ける先が無い通り道」を機械的に潰す。
 */
import { readFileSync, writeFileSync } from 'fs';

const PATH = 'work/blade-of-lumia.json';
const KEY  = '12,19';
const map  = JSON.parse(readFileSync(PATH, 'utf8'));
const st   = map.layers.field.stages[KEY];
const H = st.rows, W = st.cols;

// 池と門は「動かさないもの」＝定義を1箇所に置く
const POOL = { r0: 3, r1: 6, c0: 4, c1: 7 };
const DOORS = [[4, 0], [5, 0], [4, 11], [5, 11]];
const inPool = (r, c) => r >= POOL.r0 && r <= POOL.r1 && c >= POOL.c0 && c <= POOL.c1;
const isDoor = (r, c) => DOORS.some(([dr, dc]) => dr === r && dc === c);
const tileAt = (r, c) => st.tiles[r]?.[c];

const tilesBefore = JSON.stringify(st.tiles);

// ── 塗り直し ──────────────────────────────────────────────────
// 内側（rows 1〜8 × cols 1〜10）は池以外すべて石床、最外周は門以外すべて水。
let changed = 0;
for (let r = 0; r < H; r++) {
	for (let c = 0; c < W; c++) {
		const k = `${r},${c}`;
		const inner = r >= 1 && r <= H - 2 && c >= 1 && c <= W - 2;
		const want = inPool(r, c) ? '~' : (inner || isDoor(r, c)) ? 'o' : '~';
		if (st.bgTiles[k] !== want) { st.bgTiles[k] = want; changed++; }
	}
}

// ── 検証 ────────────────────────────────────────────────────
const fail = [];
const bg = (r, c) => st.bgTiles[`${r},${c}`] ?? '.';
const isWater = (r, c) => bg(r, c) === '~';
// 通行できない tiles（この部屋にあるのは岩 'h' と宝箱 'B' だけ・門は戦闘中閉じる）
const BLOCK = new Set(['h', 'B']);
/** 戦闘中に立てる床（門は boss_closed ＝通れない∴含めない） */
const isFloor = (r, c) =>
	r >= 0 && r < H && c >= 0 && c < W && !isWater(r, c) && !isDoor(r, c) && !BLOCK.has(tileAt(r, c));

// ① 池と tiles 層の不変
for (let r = POOL.r0; r <= POOL.r1; r++) for (let c = POOL.c0; c <= POOL.c1; c++) {
	if (!isWater(r, c)) fail.push(`① 池が水でない (${r},${c})=${bg(r, c)}`);
}
if (JSON.stringify(st.tiles) !== tilesBefore) fail.push('① tiles 層が変わった（この移行では触らない）');
if (tileAt(4, 5) !== '{') fail.push(`① 主が (4,5) にいない（=${tileAt(4, 5)}）`);
if (st.isBossRoom !== true) fail.push('① isBossRoom が true でない');

// ② 外周は門以外すべて水＝部屋が閉じている
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
	if (r !== 0 && r !== H - 1 && c !== 0 && c !== W - 1) continue;
	if (isDoor(r, c)) { if (isWater(r, c)) fail.push(`② 門が水になっている (${r},${c})`); continue; }
	if (!isWater(r, c)) fail.push(`② 外周に水でないセルがある (${r},${c})=${bg(r, c)}`);
}

// ③ はしごの迂回（1セル幅の水を渡れてしまう）が無い
//    passable.js isLadderBank と同じ規則：マップ外・水・通行不可タイルは橋脚にならない。
const isBank = (r, c) => isFloor(r, c) || isDoor(r, c) && !isWater(r, c);
function assertNoLadderBypass() {
	for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
		if (!isWater(r, c)) continue;
		if (isBank(r, c - 1) && isBank(r, c + 1)) fail.push(`③ 横にはしごが架かる水 (${r},${c})`);
		if (isBank(r - 1, c) && isBank(r + 1, c)) fail.push(`③ 縦にはしごが架かる水 (${r},${c})`);
	}
}
assertNoLadderBypass();

// ④ 継ぎ目の足跡（境界の1つ内側も通行可）
for (const [dr, dc] of DOORS) {
	const ic = dc === 0 ? 1 : W - 2;
	if (!isFloor(dr, ic)) fail.push(`④ 門 (${dr},${dc}) の1つ内側 (${dr},${ic}) が通行不可`);
}

// ⑤ 横滑りの余地（＝ユーザーが踏んだ「避ける先が無い」を潰す）
//    主（2×2）が池の中で取り得る立ち位置＝左上が (3〜5, 4〜6) の9通り。
//    掃過は4方向∴危険域は「軸に直交する向きの距離 <= halfW 0.5 + hitRange 0.8 = 1.3」。
const HALF = 0.5, HIT = 0.8, BAND = HALF + HIT;
const anchors = [];
for (let r = POOL.r0; r <= POOL.r1 - 1; r++) for (let c = POOL.c0; c <= POOL.c1 - 1; c++) anchors.push([r, c]);
/** p から2歩以内（予告 5 tick ＝ 2.5 セル）で行ける床 */
function within2(pr, pc) {
	const seen = new Set([`${pr},${pc}`]);
	let frontier = [[pr, pc]];
	for (let step = 0; step < 2; step++) {
		const next = [];
		for (const [r, c] of frontier) {
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
				if (seen.has(k) || !isFloor(nr, nc)) continue;
				seen.add(k); next.push([nr, nc]);
			}
		}
		frontier = next;
	}
	return [...seen].map(k => k.split(',').map(Number));
}
let worst = null;
for (let pr = 0; pr < H; pr++) for (let pc = 0; pc < W; pc++) {
	if (!isFloor(pr, pc)) continue;
	const reach = within2(pr, pc);
	for (const [ar, ac] of anchors) {
		const cx = ac + HALF, cy = ar + HALF;
		// 縦の掃過（軸＝列 cx）に当たる床なら、横へ逃げて cx から 1.3 超へ出られること
		for (const [axis, mine, center] of [['v', pc, cx], ['h', pr, cy]]) {
			if (Math.abs(mine - center) > BAND) continue;      // そもそも危険域の外
			const out = reach.some(([qr, qc]) => Math.abs((axis === 'v' ? qc : qr) - center) > BAND);
			if (!out) fail.push(`⑤ (${pr},${pc}) は主(${ar},${ac})の${axis === 'v' ? '縦' : '横'}掃過から2歩で出られない`);
		}
	}
	// 参考値：主がいちばん寄って来たときの端距離（＝どこまで離れられるか）
	const d = Math.min(...anchors.map(([ar, ac]) => Math.hypot(
		Math.max(0, Math.abs(pc - (ac + HALF)) - HALF), Math.max(0, Math.abs(pr - (ar + HALF)) - HALF))));
	if (!worst || d > worst.d) worst = { r: pr, c: pc, d };
}

// ── 報告 ────────────────────────────────────────────────────
const floors = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (isFloor(r, c)) floors.push([r, c]);
console.log(`bgTiles 変更セル: ${changed}  戦闘中に立てる床: ${floors.length}`);
console.log(`最も離れて立てる床: (${worst.r},${worst.c}) 端距離 ${worst.d.toFixed(2)}`);
for (const trig of [3.5, 4.5]) {
	const out = floors.filter(([r, c]) => Math.min(...anchors.map(([ar, ac]) => Math.hypot(
		Math.max(0, Math.abs(c - (ac + HALF)) - HALF), Math.max(0, Math.abs(r - (ar + HALF)) - HALF)))) > trig);
	console.log(`  triggerRange ${trig} の外に立てる床: ${out.length} / ${floors.length}`
		+ (out.length ? ` → ${out.map(([r, c]) => `(${r},${c})`).join(' ')}` : '  ＝逃げ場ゼロ'));
}
for (let r = 0; r < H; r++) {
	let line = '';
	for (let c = 0; c < W; c++) line += isWater(r, c) ? '~' : isDoor(r, c) ? ':' : BLOCK.has(tileAt(r, c)) ? tileAt(r, c) : 'o';
	console.log(String(r).padStart(2), line);
}
if (fail.length) {
	console.error(`\n❌ 不変条件 ${fail.length} 件違反（書き込まない）:`);
	for (const f of fail) console.error('  ' + f);
	process.exit(1);
}
writeFileSync(PATH, JSON.stringify(map, null, 2));   // 既存の整形（インデント2・末尾改行なし）に合わせる
console.log('\n✅ 不変条件 ①〜⑤ すべて満たした → 書き込んだ');

#!/usr/bin/env node
/**
 * migrate-sea-lord-room-clear-pillars.mjs
 *   Phase 8-4 (4) 0n（9体目 `{` 海の主）— 本番ボス部屋の柱（家の外壁 'h' ×4）を撤去する
 *
 * ── なぜ直すか（ユーザーの実プレイ報告・2026-09-01 の2度目）─────────────────
 * 「この位置にいればずっと攻撃があたらず、枠攻撃のあとに近づいて剣攻撃連打、あたらなく
 * なったらまたこの位置に戻って枠攻撃をまつ、のループで倒せてしまう。」
 * 機構そのものを両生へ作り直した（`enemy-ai.js` の「打ち寄せ（surge）」節・`strandedWaterMs`）
 * あと、`.scratch/sea-lord-farm-spots.mjs` で 64 セルを実測すると
 * **無傷のまま乗り上げを待てる床が四隅に2セル残った**（(1,10) と (8,1)：乗り上げ5回・命中0）。
 *
 * 原因は柱の**斜めの影**：主の体は 2×2 ∴柱 (2,9)/(7,2) の対角にある隅へ寄る道が無く、
 * 掃過も途中で柱に当たって止まる（軸は合っているのに帯が隅まで届かない）。
 * 柱は潮吹き（`waterShot` 射程 8）の遮蔽物として置いたものだが、その遮蔽が
 * 「無傷で待てる床」を作っている＝**この部屋では柱の役目が機構と衝突する**。
 * 海の聖域に家の外壁が4つ立っている絵の不自然さも同時に消える。
 *
 * ── 何をするか ────────────────────────────────────────────────
 * `tiles` の (2,2) (2,9) (7,2) (7,9) を 'h' → '.'（床）にするだけ。
 * `bgTiles`（見える地面＝石床 'o'）は既にその4セルも石床∴絵は「輪が繋がる」だけ。
 * 池（rows 3〜6 × cols 4〜7）・主の位置 (4,5)・宝箱 (2,5)・門4セルは1つも触らない。
 *
 * ── 自己検証（このスクリプトが守る不変条件）─────────────────────────────
 *   ① 変えたのは4セルだけ・すべて 'h' → '.'。池／主／宝箱／門／`bgTiles` は不変。
 *   ② 部屋は閉じたまま（外周は門以外すべて水・はしごで渡れる水が無い）。
 *   ③ **無敵セルが無い**：戦闘中に立てるどの床にも、主（2×2）が到達できる立ち位置から
 *      体当たり（`sword` 到達 1.2）が届く。＝実プレイの NG を幾何で潰す。
 *      到達判定は主の体が通れる 2×2 の位置を湧き位置から BFS（水も陸も通る＝両生）。
 *   ④ **掃過が届く**：どの床にも、到達できる立ち位置から「軸が合っていて（直交のずれ
 *      ≤ 1.3）」「途中が塞がっていない」掃過が1本は在る＝予告が空振りにならない。
 *   ⑤ 横滑りの余地（0d-3 の ⑤ と同じ）：どの床からも危険域の外へ2歩以内で出られる。
 */
import { readFileSync, writeFileSync } from 'fs';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';

const PATH = 'work/blade-of-lumia.json';
const KEY  = '12,19';
const map  = JSON.parse(readFileSync(PATH, 'utf8'));
const st   = map.layers.field.stages[KEY];
const H = st.rows, W = st.cols;

const PILLARS = [[2, 2], [2, 9], [7, 2], [7, 9]];
const POOL  = { r0: 3, r1: 6, c0: 4, c1: 7 };
const DOORS = [[4, 0], [5, 0], [4, 11], [5, 11]];
const SPAWN = [4, 5];                  // 主（2×2 の左上）
const CHEST = [2, 5];
// surge の数は**データから読む**（写しを持たない＝食い違いが生えない）。前半・後半の両方で測る。
const META   = ENEMY_META[TILE.SEA_LORD];
const PHASES = [['前半', META.surge], ['後半', META.phases[0].surge]];
const SWORD_REACH = META.attacks.find(a => a.type === 'sword').range;
const HALF = 0.5, TICK_MS = 120, MOVE_STEP = 0.5;

const isDoor = (r, c) => DOORS.some(([dr, dc]) => dr === r && dc === c);
const inPool = (r, c) => r >= POOL.r0 && r <= POOL.r1 && c >= POOL.c0 && c <= POOL.c1;
const bg = (r, c) => st.bgTiles[`${r},${c}`] ?? '.';
const isWater = (r, c) => bg(r, c) === '~';
const tileAt = (r, c) => st.tiles[r]?.[c];
const inMap = (r, c) => r >= 0 && r < H && c >= 0 && c < W;

const bgBefore = JSON.stringify(st.bgTiles);
const before = st.tiles.map(row => row.slice());

// ── 撤去 ──────────────────────────────────────────────────────
let changed = 0;
for (const [r, c] of PILLARS) {
	if (tileAt(r, c) === 'h') { st.tiles[r][c] = '.'; changed++; }
}

// ── 検証 ──────────────────────────────────────────────────────
const fail = [];
// 通行不可の tiles（撤去後この部屋に残るのは宝箱 'B' だけ）
const BLOCK = new Set(['h', 'B']);
/** 戦闘中にプレイヤーが立てる床（門は boss_closed ∴含めない） */
const isFloor = (r, c) => inMap(r, c) && !isWater(r, c) && !isDoor(r, c) && !BLOCK.has(tileAt(r, c));
/** 主の体（2×2）が入れるか＝水でも陸でも通る（両生）。塞ぐのは壁扱いのタイルと閉じた門。 */
const bodyFree = (r, c) => {
	for (let y = r; y <= r + 1; y++) for (let x = c; x <= c + 1; x++) {
		if (!inMap(y, x)) return false;
		if (isDoor(y, x) || BLOCK.has(tileAt(y, x))) return false;
		if (bg(y, x) !== '~' && bg(y, x) !== 'o') return false;   // 部屋の外周の外など
	}
	return true;
};

// ① 変えたのは4セルだけ
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
	const was = before[r][c], now = tileAt(r, c);
	if (was === now) continue;
	if (!PILLARS.some(([pr, pc]) => pr === r && pc === c) || was !== 'h' || now !== '.') {
		fail.push(`① 想定外の変更 (${r},${c}) ${was} → ${now}`);
	}
}
if (JSON.stringify(st.bgTiles) !== bgBefore) fail.push('① bgTiles を触った（この移行では触らない）');
if (tileAt(...SPAWN) !== '{') fail.push(`① 主が (4,5) にいない（=${tileAt(...SPAWN)}）`);
if (tileAt(...CHEST) !== 'B') fail.push('① 宝箱 (2,5) が消えた');
for (let r = POOL.r0; r <= POOL.r1; r++) for (let c = POOL.c0; c <= POOL.c1; c++) {
	if (!isWater(r, c)) fail.push(`① 池が水でない (${r},${c})`);
}
if (st.tiles.some(row => row.some(ch => ch === 'h'))) fail.push('① まだ柱 h が残っている');

// ② 部屋は閉じたまま（外周は門以外すべて水／はしごで渡れる水が無い）
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
	if (r !== 0 && r !== H - 1 && c !== 0 && c !== W - 1) continue;
	if (isDoor(r, c)) continue;
	if (!isWater(r, c)) fail.push(`② 外周に水でないセルがある (${r},${c})`);
}
const isBank = (r, c) => isFloor(r, c) || (inMap(r, c) && isDoor(r, c));
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
	if (!isWater(r, c)) continue;
	if (isBank(r, c - 1) && isBank(r, c + 1)) fail.push(`② 横にはしごが架かる水 (${r},${c})`);
	if (isBank(r - 1, c) && isBank(r + 1, c)) fail.push(`② 縦にはしごが架かる水 (${r},${c})`);
}

// 主が実際に取り得る立ち位置＝湧き位置から BFS（整数格子＝engine の 0.5 刻みの部分集合
// ∴ここで到達と言えるものは engine でも到達できる／取りこぼしは安全側に出る）
const anchors = new Set();
if (bodyFree(...SPAWN)) {
	const q = [SPAWN]; anchors.add(SPAWN.join(','));
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (anchors.has(k) || !bodyFree(nr, nc)) continue;
			anchors.add(k); q.push([nr, nc]);
		}
	}
} else fail.push('③ 湧き位置に主の体が入らない');
const anchorList = [...anchors].map(k => k.split(',').map(Number));

const edgeDist = (ar, ac, pr, pc) => Math.hypot(
	Math.max(0, Math.abs(pc - (ac + HALF)) - HALF),
	Math.max(0, Math.abs(pr - (ar + HALF)) - HALF));

// ③ 無敵セルが無い（どの床にも体当たりが届く立ち位置が在る）
const unreachable = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
	if (!isFloor(r, c)) continue;
	if (!anchorList.some(([ar, ac]) => edgeDist(ar, ac, r, c) <= SWORD_REACH)) unreachable.push(`(${r},${c})`);
}
if (unreachable.length) fail.push(`③ 体当たりが永久に届かない床 ${unreachable.length} セル: ${unreachable.join(' ')}`);

// ④/⑤ は前半・後半それぞれの数で測る（後半は深さ 4.0 ＝危険域が長い＝逃げるのも遠い）。
// 実際に飛んで来る掃過＝軸が合い（直交のずれ ≤ hitRange）・軸方向に届き・道が塞がっていないもの。
const firingAxes = (cfg, ar, ac, pr, pc) => [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([uy, ux]) => {
	const gx = Math.max(0, Math.abs(pc - (ac + HALF)) - HALF);
	const gy = Math.max(0, Math.abs(pr - (ar + HALF)) - HALF);
	if (ux !== 0 ? gy > cfg.hitRange : gx > cfg.hitRange) return false;
	const far = cfg.surgeCells + cfg.hitRange;
	if (ux !== 0 ? gx > far : gy > far) return false;
	if (ux !== 0 ? Math.sign(pc - (ac + HALF)) !== ux : Math.sign(pr - (ar + HALF)) !== uy) return false;
	// 途中の体位置が全部通れるか（掃過は連続座標を刻んで進む∴間も通れないと止まる）
	const need = Math.ceil(ux !== 0 ? gx : gy);
	for (let k = 1; k <= need; k++) if (!bodyFree(ar + uy * k, ac + ux * k)) return false;
	return true;
});
// 危険域は**床に描く角丸矩形と同じ形**（`enemy-ai.js surgeZoneBox`）＝「起点の body」から
// 「掃き切る位置の body」までの AABB を `hitRange` ぶん膨らませたもの。
// ⚠️ 0d-3 の ⑤ は軸を**無限の行／列**として測っていた＝主が池に閉じていた頃はそれで足りたが、
//    両生（0n）で主が輪の上にも立つと嘘になる（掃過は前方 surgeCells で終わる∴「軸に沿って
//    主の背中側へ抜ける」逃げ方が実在するのに、無限の行だと逃げ場ゼロに見える）。
const inZone = (cfg, ar, ac, uy, ux, r, c) => {
	const pad = HALF + cfg.hitRange;
	const cx = ac + HALF, cy = ar + HALF;
	const ex = cx + ux * cfg.surgeCells, ey = cy + uy * cfg.surgeCells;
	return c >= Math.min(cx, ex) - pad && c <= Math.max(cx, ex) + pad
		&& r >= Math.min(cy, ey) - pad && r <= Math.max(cy, ey) + pad;
};
/** 危険域の外の床へ出るまでの歩数（床グラフの BFS・1歩＝1セル）。出られなければ Infinity */
const escapeSteps = (cfg, ar, ac, uy, ux, pr, pc) => {
	if (!inZone(cfg, ar, ac, uy, ux, pr, pc)) return 0;
	const seen = new Set([`${pr},${pc}`]);
	let front = [[pr, pc]];
	for (let step = 1; step <= 8; step++) {
		const next = [];
		for (const [r, c] of front) {
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
				if (seen.has(k) || !isFloor(nr, nc)) continue;
				if (!inZone(cfg, ar, ac, uy, ux, nr, nc)) return step;
				seen.add(k); next.push([nr, nc]);
			}
		}
		front = next;
		if (!front.length) return Infinity;
	}
	return Infinity;
};
const report = [];
for (const [label, cfg] of PHASES) {
	// ④ 掃過が届く（＝無敵セルの二重の守り。③ の体当たりが届いても掃過が届かない床は作らない）
	const noSweep = [];
	for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
		if (!isFloor(r, c)) continue;
		if (!anchorList.some(([ar, ac]) => firingAxes(cfg, ar, ac, r, c).length)) noSweep.push(`(${r},${c})`);
	}
	if (noSweep.length) fail.push(`④ ${label}: 掃過が永久に届かない床 ${noSweep.length} セル: ${noSweep.join(' ')}`);
	// ⑤ 予告を見てから逃げ切れる（歩ける距離＝`windupMs / TICK_MS × MOVE_STEP` セル）
	const budget = (cfg.windupMs / TICK_MS) * MOVE_STEP;
	const trapped = [];
	let worst = 0;
	for (let pr = 0; pr < H; pr++) for (let pc = 0; pc < W; pc++) {
		if (!isFloor(pr, pc)) continue;
		for (const [ar, ac] of anchorList) {
			for (const [uy, ux] of firingAxes(cfg, ar, ac, pr, pc)) {
				const steps = escapeSteps(cfg, ar, ac, uy, ux, pr, pc);
				if (steps > worst) worst = steps;
				if (steps > budget) {
					trapped.push(`(${pr},${pc})←主(${ar},${ac})の${ux ? (ux > 0 ? '東' : '西') : (uy > 0 ? '南' : '北')}掃過(${steps}歩)`);
				}
			}
		}
	}
	if (trapped.length) {
		fail.push(`⑤ ${label}: 予告 ${cfg.windupMs}ms（${budget} セル）で危険域から出られない床 `
			+ `${trapped.length} 通り: ${trapped.slice(0, 6).join(' / ')}`);
	}
	report.push(`  ${label}: 逃げるのに要る最大 ${worst} 歩 ≤ 予告で歩ける ${budget} セル`
		+ `（windupMs ${cfg.windupMs} / surgeCells ${cfg.surgeCells}）`);
}

// ── 報告 ──────────────────────────────────────────────────────
const floors = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (isFloor(r, c)) floors.push([r, c]);
console.log(`柱を消したセル: ${changed}  戦闘中に立てる床: ${floors.length}  主の立ち位置: ${anchorList.length}`);
for (const line of report) console.log(line);
for (let r = 0; r < H; r++) {
	let line = '';
	for (let c = 0; c < W; c++) {
		line += isWater(r, c) ? '~' : isDoor(r, c) ? ':' : BLOCK.has(tileAt(r, c)) ? tileAt(r, c)
			: tileAt(r, c) === '{' ? '{' : 'o';
	}
	console.log(String(r).padStart(2), line);
}
if (fail.length) {
	console.error(`\n❌ 不変条件 ${fail.length} 件違反（書き込まない）:`);
	for (const f of fail.slice(0, 20)) console.error('  ' + f);
	process.exit(1);
}
writeFileSync(PATH, JSON.stringify(map, null, 2));   // 既存の整形（インデント2・末尾改行なし）
console.log('\n✅ 不変条件 ①〜⑤ すべて満たした → 書き込んだ');

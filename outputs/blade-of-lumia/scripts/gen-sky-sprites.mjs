// キュー38：空（SKY・`%`）の絵＝「はるか下に見える海と、その上を流れる雲」の 128×128 を
// 海の層と雲の層に分けて `shared/sprites-sky.js` へ書き出す。
//
// 入力＝量子化済みの格子 JSON（{pal, grid}）。作り方＝
//   ① 参考画像 `refs/海+雲.png`（ユーザー提供・1254px 四方の拡大ドット絵）を
//      128×128 へ中心サンプリング（3×3 の中央値）
//   ② k-means で 11 色へ量子化（輝度順・index 1＝一番暗い）
//   （①②は `.scratch/q38-extract.mjs`＝ブラウザの canvas で画像を読むため使い捨て側に置いた）
// ここでやること＝
//   ③ 雲を抜き出す＝明るい色（index ≥ CLOUD_MIN）の連結成分のうち大きいもの（≥ CLOUD_AREA）
//      ＋それに接する中間色（index = CLOUD_EDGE）。小さい白点は白波として海に残す。
//   ④ 海の層＝雲を抜いた穴を、周りの海の色で埋める（外側から1周ずつ・隣の海の色を写す）。
//   ⑤ 雲の層＝雲の色＋右下にずらした雲の影（半透明の暗色）。雲と一緒に流れる。
//
// 使い方：node scripts/gen-sky-sprites.mjs <grid.json>
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/gen-sky-sprites.mjs <grid.json>'); process.exit(1); }
const { pal, grid } = JSON.parse(readFileSync(src, 'utf8'));
const N = grid.length;
if (N !== 128 || grid.some((r) => r.length !== 128)) throw new Error(`格子は 128×128 であること（実際 ${N}）`);
if (pal.length - 1 !== 11) throw new Error(`色数は 11（実際 ${pal.length - 1}）＝閾値の index はこの並びが前提`);

const CLOUD_MIN = 9;      // #a0c3ee 以上＝雲の明るい色
const CLOUD_EDGE = 8;     // #60a0d7＝雲の縁の陰（雲に接するときだけ雲に入れる）
const CLOUD_AREA = 6;     // これより小さい明るい塊は白波（白波は 1〜4 ドットの点と細線）
const SHADOW = { dx: 3, dy: 4 };
const SHADOW_IDX = 12;

const wrap = (v) => ((v % N) + N) % N;
const at = (g, x, y) => g[wrap(y)][wrap(x)];
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ③ 雲の連結成分（周期境界で繋ぐ）
const cloud = Array.from({ length: N }, () => new Array(N).fill(false));
const seen = Array.from({ length: N }, () => new Array(N).fill(false));
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
	if (seen[y][x] || grid[y][x] < CLOUD_MIN) continue;
	const comp = [], stack = [[x, y]]; seen[y][x] = true;
	while (stack.length) {
		const [cx, cy] = stack.pop(); comp.push([cx, cy]);
		for (const [dx, dy] of D4) {
			const nx = wrap(cx + dx), ny = wrap(cy + dy);
			if (!seen[ny][nx] && grid[ny][nx] >= CLOUD_MIN) { seen[ny][nx] = true; stack.push([nx, ny]); }
		}
	}
	if (comp.length >= CLOUD_AREA) for (const [cx, cy] of comp) cloud[cy][cx] = true;
}
// 雲に接する中間色も雲（縁の陰）
const edge = [];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
	if (cloud[y][x] || grid[y][x] !== CLOUD_EDGE) continue;
	if (D4.some(([dx, dy]) => at(cloud, x + dx, y + dy))) edge.push([x, y]);
}
for (const [x, y] of edge) cloud[y][x] = true;

// ④ 海の層＝雲の穴を「離れた所の海の模様」で埋める。
//    隣の色を1周ずつ写す埋め方は、色が帯状に伸びて四角い斑と縦筋になった（実画面で確認）。
//    ∴穴の各ドットについて、決まったずらし幅の候補を順に見て、最初に雲でも雲の近く（明るい
//    照り返し）でもない海のドットを写す＝模様のきめが周りと同じになる。
const NEAR = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => {
	for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (at(cloud, x + dx, y + dy)) return true;
	return false;
}));
const SEA_MAX = 6;   // 写してよい海の色（#0e7acf まで。#1b92cd 以上は雲の照り返し・白波）
const SHIFTS = [];
for (let i = 1; SHIFTS.length < 400; i++) SHIFTS.push([(i * 37) % N, (i * 53 + 11) % N]);
const sea = grid.map((r) => r.slice());
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
	if (!cloud[y][x]) continue;
	const s = SHIFTS.find(([dx, dy]) => !at(NEAR, x + dx, y + dy) && at(grid, x + dx, y + dy) <= SEA_MAX);
	if (!s) throw new Error(`海の穴が埋まらない (${x},${y})`);
	sea[y][x] = at(grid, x + s[0], y + s[1]);
}

// ⑤ 雲の層＝雲の色＋右下の影
const cl = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => {
	if (cloud[y][x]) return grid[y][x];
	return at(cloud, x - SHADOW.dx, y - SHADOW.dy) ? SHADOW_IDX : 0;
}));

const CH = '0123456789abc';
const rowsOf = (g) => g.map((r) => '\t\'' + r.map((v) => CH[v]).join('') + '\',').join('\n');
const colors = pal.slice(1).map((c) => `'${c}'`).join(', ');
const cloudCount = cloud.flat().filter(Boolean).length;

const out = `// ── Blade of Lumia – 空（SKY・\`%\`）の絵 ── キュー38 ─────────────────────
//
// ⚠ このファイルの格子は \`scripts/gen-sky-sprites.mjs\` が書き出す（手で直さない）。
//
// 何を描くか：空中の遺跡（D7）・空島（field 8,1）・虚空の淵（field 6,0）の「空」は、
// 高い所から下を覗いた所＝**はるか下の海と、その上を流れる雲**（2026-10-02 ユーザー選択
// ＝候補 C「遠い海」・参考画像 \`refs/海+雲.png\`）。旧＝固定の星空（CSS のグラデーション）
// は「下に星空が見えるのは変」という指摘で廃止した。
//
// 🔴 2層＝海（\`SKY_SEA\`）と雲（\`SKY_CLOUD\`＝雲＋右下に落ちる雲の影）。静止した1枚の絵は
//    「床に描いた空の絵にしか見えない」（2026-10-02 ユーザー判定）∴ゲームは雲の層だけを
//    流す（\`game/sky-drift.js\`）＝速さの差で「雲は近く・海ははるか下」に見せる。
// 🔴 どちらも 128×128＝4×4 セルで1周する絵。エディタ・プレビュー（静止）は 32×32 の
//    切り身 \`skySea@k\`／\`skyCloud@k\`（k＝(r%4)*4 + c%4）を重ねる＝流れる前の姿。
//    1 ドット＝セルの 1/32＝キャラ・地面と同じ粗さ。
// 🔴 縁＝北の縁が地面のセルには崖の面（\`skyLipN\`＝岩の帯＋落ち影）、東西には影
//    （\`skyShadeW\`／\`skyShadeE\`）。縁は流さない＝覗き窓の枠。
//    どの部品を重ねるかは \`shared/cell-appearance.js\` の \`skyParts()\` だけが決める。
//
// 生成時の数＝雲 ${cloudCount} ドット（全体の ${Math.round(cloudCount / (N * N) * 100)}%）・影のずれ (${SHADOW.dx},${SHADOW.dy})。

export const SKY_N = ${N};
const CH = '${CH}';
const SEA_ROWS = [
${rowsOf(sea)}
];
const CLOUD_ROWS = [
${rowsOf(cl)}
];

// 1〜11＝海と雲（輝度順）／12＝雲の影／13〜16＝崖の面（明→暗）／17〜22＝縁の影（濃→薄）
export const SKY_PAL = {
	sky: ['transparent', ${colors},
		'rgba(6,16,48,0.38)',
		'#5a5866', '#45434f', '#3b3945', '#24222b',
		'rgba(8,10,22,0.62)', 'rgba(8,10,22,0.48)', 'rgba(8,10,22,0.36)', 'rgba(8,10,22,0.26)', 'rgba(8,10,22,0.16)', 'rgba(8,10,22,0.08)'],
};
const SH = [17, 18, 19, 20, 21, 22];   // 縁の影の濃さ（縁から離れるほど薄い）

const parse = (rows) => rows.map((s) => [...s].map((ch) => CH.indexOf(ch)));
export const SKY_SEA = parse(SEA_ROWS);       // 128×128（ゲームが1枚の背景として流す／止める）
export const SKY_CLOUD = parse(CLOUD_ROWS);

export const SKY_TILE_N = SKY_N / 32;   // 何セルで1周するか（4）

export const SKY_SPRITES = {};
for (let k = 0; k < 16; k++) {
	const oy = Math.floor(k / 4) * 32, ox = (k % 4) * 32;
	const cut = (g) => [Array.from({ length: 32 }, (_, y) => g[oy + y].slice(ox, ox + 32))];
	SKY_SPRITES[\`skySea@\${k}\`] = cut(SKY_SEA);
	SKY_SPRITES[\`skyCloud@\${k}\`] = cut(SKY_CLOUD);
}

// 崖の面＝上端の岩の帯（高さ 4〜6・2 ドットごとに下端がぎざぎざ）＋その下の落ち影。
const LIP_DEPTH = [5, 4, 6, 5, 4, 5, 6, 4, 5, 6, 5, 4, 4, 6, 5, 5];
const lip = Array.from({ length: 32 }, () => new Array(32).fill(0));
for (let x = 0; x < 32; x++) {
	const d = LIP_DEPTH[x >> 1];
	for (let y = 0; y < d; y++) lip[y][x] = y === 0 ? 13 : y === d - 1 ? 16 : ((x * 7 + y * 3) % 5 === 0 ? 15 : 14);
	for (let i = 0; i < SH.length * 2 && d + i < 32; i++) lip[d + i][x] = SH[i >> 1];
}
SKY_SPRITES.skyLipN = [lip];

// 東西の影＝縁から 6 ドットで消える。
const shade = (fromLeft) => Array.from({ length: 32 }, () => Array.from({ length: 32 }, (_, x) => {
	const i = fromLeft ? x : 31 - x;
	return i < SH.length ? SH[i] : 0;
}));
SKY_SPRITES.skyShadeW = [shade(true)];
SKY_SPRITES.skyShadeE = [shade(false)];
`;
writeFileSync('shared/sprites-sky.js', out);
console.log(`shared/sprites-sky.js（雲 ${cloudCount} ドット・白波として残した明るい点 ${grid.flat().filter((v) => v >= CLOUD_MIN).length - cloud.flat().filter(Boolean).length + edge.length}）`);

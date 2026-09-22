// dark_tower の構成を直す ①「見せかけ開口」を塞ぐ ②玉座の間を 5F の南へ移す
// （2026-09-21 / PLAN 実行キュー 20b・設計は Opus）。
//
// ■ 何を直すか（ユーザーの実プレイ報告＋番人の実測）
//   ユーザー指摘＝「0,1 の上の方に入り口あるけど、これ上のステージに行けちゃいそうな位置に
//   あって変じゃん。1,0 も上があいてて、上にいけそうだけどいけないのも塞いだ方がいい。
//   5,2も右があいてるけどいけない。」
//   ＝**歩いて抜けられそうに見えるのに行き先が無い境界**（以下「見せかけ開口」）が塔に4箇所ある。
//   踏み出しても遷移が取り消されるだけ＝プレイヤーには「壁じゃないのに進めない」に見える。
//   `scripts/check-dungeon-integrity.mjs` の検査12・13（同日追加）が4件＋1件を検出済み。
//
//   ① `1,0`（1F の入口室）row0 が10セルまるごと開いているのに、真上（グリッド `1,-1`）に
//      ステージが無い。→ row0 を全壁にする。
//   ② `5,2`（5F 最奥）の東端 (8,11) が開いているのに `6,2` が無い。→ `#` で塞ぐ。
//      （この (8,11) は玉座へのワープ `>` (8,5) の真横＝いちばん目につく穴）
//   ③ `1,1` の東端 (4,11)(5,11) が開いているのに、隣 `2,1` の到着セルが壁。
//      → `#` で塞ぐ（門のある行 `#####T.####.` → `#####T.#####`）。
//   ④ `0,1`（B1F・塔の入口室）の階段 `>` が **境界セル (0,5)** に乗っている。
//      境界に乗った `>` は「隣室へ歩いて抜ける口」と見分けがつかない＝ユーザー指摘の正体。
//      → `>` を室内へ1マス下げて (1,5) へ移し、row0 を全壁にする。
//      ⚠️ `>` を動かすと、その id（`b1fStairsUp`）を destId に持つ側（`1,0` (6,4)）の
//        **着地セルも一緒に動く**（[[blade-map-enter-moves-landing-cell]]）＝1F から降りて
//        きたときの着地が (0,5) → (1,5) になる。これは意図どおり（室内に降りる）。
//
// ■ 玉座の間の移設（ユーザー判断＝案 A・2026-09-21「王座はAでいいでしょう。」）
//   旧構成は玉座が `0,0`（グリッド上は B1F 入口 `0,1` の**真上**）にあり、5F 最奥 `5,2` の
//   `>` (8,5) ↔ `0,0` の `>` (8,5) のワープ2枚で行き来していた。問題は2つ：
//     ・ボス部屋の中にマップ入口（`>`）がある＝戦闘中に出入りできるように見える
//       （ユーザー＝「実際移動はできないようになってるけど、プレーヤーからすると
//         違和感でしかない」）。
//     ・`0,0` が `0,1` のグリッド真上にある＝B1F の row0 が「上の階へ歩いて行けそう」に見える
//       （上の④と同じ原因。旧盤面では `0,1` row0 (0,5) の `>` と `0,0` row9 の `:` が
//        グリッド隣接していて、歩行 BFS ですら玉座へ上がれてしまった）。
//   → 玉座を `5,3`（`5,2` の南）へ新設し、`5,2` の南端から**歩いて**ボス扉 `:` へ入る。
//      D1〜D3 のボス部屋と同じ文法（ボス部屋の外周は `:` 以外すべて壁／手前の室の
//      向かい合うセルは素の床 `.`）。ワープ2枚（`towerBossRoom` / `bossApproach`）は撤去。
//      ボスの Z は入ってくる向き（北）と向かい合う位置＝(8,5)・`enemyDirs` は 'up'。
//
//   床の枚数：旧 `0,0` は 78（内側80 − Z − `>`）／新 `5,3` は **79**（内側80 − Z）。
//   `tests/boss-move-variety.spec.js` の Z-⑪ がこの数を直接見ている∴同時に更新する。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・見せかけ開口4箇所が塞がっている
//   ・`0,0` が消え `5,3` が在る（床79・Z(8,5)・`:`×2 が北端・`>` ゼロ・`mapEnters` 空）
//   ・レイヤーの `bossStage` が `5,3`・`isBossRoom` が `5,3` だけ true
//   ・`towerBossRoom` / `bossApproach` の id・destId が塔のどこにも残っていない
//   ・塔の全室で `>` と `mapEnters` が 1:1（[[blade-bad-data-fix-five-layers]]）
//   ・`0,1` の石碑 signData['1,1'] が動いていない（tests/lore-tablets.spec.js が見ている）
//   再実行しても同じ結果になる（各手は「既に適用済み」を検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-20b-structure.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-20b-structure.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isHardBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const OLD_THRONE = '0,0';
const NEW_THRONE = '5,3';
const APPROACH = '5,2';

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];
if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

/** tiles は「1文字の配列の配列」＝行を文字列にしてはいけない（[[field-tiles-are-char-arrays]]）。 */
function tilesOf(key) {
	const st = stages[key];
	ok(st, `ステージ ${key} が無い`);
	ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray),
		`ステージ ${key} の tiles が文字配列の配列でない`);
	return st.tiles;
}
const rowStr = (t, r) => t[r].join('');
const before = {};   // key → 変更前の行文字列（差分表示用）
function snapshot(key) { if (!before[key]) before[key] = tilesOf(key).map((r) => r.join('')); }

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };

// ──────────────────────────────────────────────────────────────────────
// ① 見せかけ開口を塞ぐ
// ──────────────────────────────────────────────────────────────────────

// ①-1 `1,0` の row0 を全壁に（真上にステージが無い）
{
	snapshot('1,0');
	const t = tilesOf('1,0');
	const open = t[0].filter((ch) => ch !== '#').length;
	if (!open) step('=', '1,0 row0 は既に全壁');
	else {
		for (let c = 0; c < t[0].length; c++) {
			ok(t[0][c] === '#' || t[0][c] === '.', `1,0 (0,${c}) が壁でも床でもない: '${t[0][c]}'`);
			t[0][c] = '#';
		}
		step('✔', `1,0 row0 の ${open} セルを壁で塞いだ（真上 1,-1 にステージが無い）`);
	}
}

// ①-2 `5,2` の東端 (8,11) を壁に（東にステージが無い）
{
	snapshot(APPROACH);
	const t = tilesOf(APPROACH);
	if (t[8][11] === '#') step('=', '5,2 (8,11) は既に壁');
	else {
		ok(t[8][11] === '.', `5,2 (8,11) が素の床でない: '${t[8][11]}'`);
		t[8][11] = '#';
		step('✔', '5,2 (8,11) を壁で塞いだ（東 6,2 にステージが無い）');
	}
}

// ①-3 `1,1` の東端 (4,11)(5,11) を壁に（隣 2,1 の到着セルが壁）
{
	snapshot('1,1');
	const t = tilesOf('1,1');
	let n = 0;
	for (const r of [4, 5]) {
		if (t[r][11] === '#') continue;
		ok(t[r][11] === '.', `1,1 (${r},11) が素の床でない: '${t[r][11]}'`);
		t[r][11] = '#'; n++;
	}
	step(n ? '✔' : '=', n
		? `1,1 (4,11)(5,11) を壁で塞いだ（隣 2,1 の到着セルが壁＝踏み出しが取り消される）`
		: '1,1 の東端は既に全壁');
}

// ①-4 `0,1` の階段 `>` を境界 (0,5) から室内 (1,5) へ下げ、row0 を全壁に
{
	snapshot('0,1');
	const st = stages['0,1'];
	const t = tilesOf('0,1');
	const ent = st.mapEnters ?? (st.mapEnters = {});
	if (ent['1,5'] && !ent['0,5']) step('=', "0,1 の '>' は既に (1,5)（室内）にある");
	else {
		const reg = ent['0,5'];
		ok(reg && reg.id === 'b1fStairsUp',
			`0,1 (0,5) の登録が b1fStairsUp でない: ${JSON.stringify(reg)}`);
		ok(t[0][5] === '>', `0,1 (0,5) が '>' でない: '${t[0][5]}'`);
		ok(t[1][5] === '.', `0,1 (1,5) が素の床でない＝階段の移設先に使えない: '${t[1][5]}'`);
		ok(!ent['1,5'], `0,1 (1,5) に別の登録が既にある: ${JSON.stringify(ent['1,5'])}`);
		delete ent['0,5'];
		ent['1,5'] = reg;
		t[0][5] = '#';
		t[1][5] = '>';
		step('✔', "0,1 の階段 '>'(b1fStairsUp) を境界 (0,5) → 室内 (1,5) へ下げた"
			+ '（1F から降りてくる着地セルも一緒に (1,5) へ動く）');
	}
	const open = t[0].filter((ch) => ch !== '#').length;
	if (!open) step('=', '0,1 row0 は全壁（階段を下げた時点で埋まった／既に全壁）');
	else {
		for (let c = 0; c < t[0].length; c++) {
			ok(t[0][c] === '#' || t[0][c] === '.', `0,1 (0,${c}) が壁でも床でもない: '${t[0][c]}'`);
			t[0][c] = '#';
		}
		step('✔', `0,1 row0 の ${open} セルを壁で塞いだ（上の階へ歩いて行けそうに見えるのを消す）`);
	}
}

// ──────────────────────────────────────────────────────────────────────
// ② 玉座の間を `0,0` → `5,3` へ移す（案 A・ワープ2枚を撤去）
// ──────────────────────────────────────────────────────────────────────
if (stages[NEW_THRONE] && !stages[OLD_THRONE]) {
	step('=', `玉座は既に ${NEW_THRONE} にある（${OLD_THRONE} は無い）`);
} else {
	ok(stages[OLD_THRONE], `${OLD_THRONE} も ${NEW_THRONE} も無い＝データが想定外`);
	ok(!stages[NEW_THRONE], `${NEW_THRONE} が既にある＝上書きしない（手で確認せよ）`);

	// 旧玉座の盤面を土台にする（bgTiles 空・遮蔽物なしの空箱をそのまま引き継ぐ）
	const old = stages[OLD_THRONE];
	const oldT = tilesOf(OLD_THRONE);
	ok(rowStr(oldT, 9) === '#####::#####', `${OLD_THRONE} row9 が想定と違う: ${rowStr(oldT, 9)}`);
	ok(oldT[1][5] === 'Z', `${OLD_THRONE} (1,5) に Z が居ない: '${oldT[1][5]}'`);
	ok(oldT[8][5] === '>', `${OLD_THRONE} (8,5) が '>' でない: '${oldT[8][5]}'`);
	ok(old.mapEnters?.['8,5']?.id === 'towerBossRoom',
		`${OLD_THRONE} (8,5) の登録が towerBossRoom でない`);

	const next = JSON.parse(JSON.stringify(old));
	// 盤面を作り直す：北端に `:`×2（手前の 5,2 に面する）／Z は入ってくる向きと向かい合う (8,5)。
	next.tiles = Array.from({ length: 10 }, (_, r) => Array.from({ length: 12 }, (_, c) => {
		if (r === 0) return (c === 5 || c === 6) ? ':' : '#';
		if (r === 9 || c === 0 || c === 11) return '#';
		return (r === 8 && c === 5) ? 'Z' : '.';
	}));
	next.enemyDirs = { '8,5': 'up' };   // 北の扉から入ってくる勇者と向かい合う
	next.mapEnters = {};                // ボス部屋にマップ入口を置かない（案 A の本体）
	next.isBossRoom = true;
	next.comment = '[dark_tower 5,3] 玉座の間（ザーネル Z）。キュー20b（2026-09-21・案 A）で'
		+ ' 0,0 から移設した＝旧構成は「ボス部屋の中にマップ入口 > がある」「B1F 入口 0,1 の'
		+ 'グリッド真上にあって上の階へ歩いて行けそうに見える」の2つが違和感の原因だった。'
		+ '今は 5F 最奥 5,2 の南端から歩いてボス扉 : (0,5)(0,6) に入る＝D1〜D3 と同じ文法'
		+ '（外周は : 以外すべて壁・遮蔽物ゼロ・bgTiles 空）。床79枚は'
		+ ' tests/boss-move-variety.spec.js の Z-⑪（収束の円が部屋を覆わない）が直接見ている。';
	stages[NEW_THRONE] = next;
	delete stages[OLD_THRONE];
	step('✔', `玉座の間を ${OLD_THRONE} → ${NEW_THRONE} へ移設（Z を (1,5) → (8,5)・`
		+ `ボス扉 ':' を row9 → row0 へ・'>' とワープ登録を撤去）`);

	// 手前の室 `5,2`：ワープ `>` を撤去し、南端 (9,5)(9,6) を素の床にして歩いて入れるようにする。
	snapshot(APPROACH);
	const ap = stages[APPROACH];
	const apT = tilesOf(APPROACH);
	ok(apT[8][5] === '>', `${APPROACH} (8,5) が '>' でない: '${apT[8][5]}'`);
	ok(ap.mapEnters?.['8,5']?.id === 'bossApproach',
		`${APPROACH} (8,5) の登録が bossApproach でない`);
	delete ap.mapEnters['8,5'];
	apT[8][5] = '.';
	ok(rowStr(apT, 9) === '############', `${APPROACH} row9 が全壁でない: ${rowStr(apT, 9)}`);
	apT[9][5] = '.'; apT[9][6] = '.';
	step('✔', `${APPROACH} の '>'(bossApproach) を撤去し (8,5) を床に・南端 (9,5)(9,6) を開けた`
		+ '（D1〜D3 と同じ＝ボス扉の手前は素の床）');

	ok(layer.bossStage === OLD_THRONE || layer.bossStage === NEW_THRONE,
		`bossStage が想定外: ${layer.bossStage}`);
	layer.bossStage = NEW_THRONE;
	step('✔', `レイヤーの bossStage を ${OLD_THRONE} → ${NEW_THRONE} に更新`);
}

// ──────────────────────────────────────────────────────────────────────
// ③ 検証（書き込む前に全部ここで測る）
// ──────────────────────────────────────────────────────────────────────
// 「通れない」の判定は番人（check-dungeon-integrity.mjs の検査12）と同じ関数を使う
// ＝ここで自前の壁リストを書くと、鍵扉 `D` のような「鍵で開く＝本物の通路」を
//   見せかけ開口として誤検出する（実際に 1,3 / 4,4 の `;;` で踏んだ）。
const HARD = { has: (ch) => isHardBlocked(ch) };
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

// 見せかけ開口が塔に1つも無い（隣室が無い／到着セルが壁の境界が開いていない）
{
	const fake = [];
	for (const [key, st] of Object.entries(stages)) {
		const [sx, sy] = key.split(',').map(Number);
		const t = st.tiles, R = st.rows, C = st.cols;
		const sides = [
			['上', `${sx},${sy - 1}`, Array.from({ length: C }, (_, c) => [0, c]), (r, c) => [R - 1, c]],
			['下', `${sx},${sy + 1}`, Array.from({ length: C }, (_, c) => [R - 1, c]), (r, c) => [0, c]],
			['左', `${sx - 1},${sy}`, Array.from({ length: R }, (_, r) => [r, 0]), (r, c) => [r, C - 1]],
			['右', `${sx + 1},${sy}`, Array.from({ length: R }, (_, r) => [r, C - 1]), (r, c) => [r, 0]],
		];
		for (const [label, nk, cells, arrivalOf] of sides) {
			const open = cells.filter(([r, c]) => !HARD.has(t[r][c]));
			if (!open.length) continue;
			const nb = stages[nk];
			if (!nb) { fake.push(`${key} ${label}端 ${open.length}セル → 隣 ${nk} が無い`); continue; }
			const stuck = open.filter(([r, c]) => {
				const [ar, ac] = arrivalOf(r, c);
				if (ar < 0 || ac < 0 || ar >= nb.rows || ac >= nb.cols) return true;
				return HARD.has(nb.tiles[ar][ac]);
			});
			if (stuck.length) fake.push(`${key} ${label}端 ${stuck.map((p) => p.join(',')).join(' ')} → 隣 ${nk} の到着セルが壁`);
		}
	}
	check(`見せかけ開口がゼロ（残り: ${fake.join(' / ')}）`, fake.length === 0);
}

// 境界セルに `>` が乗っていない
{
	const onEdge = [];
	for (const [key, st] of Object.entries(stages)) {
		st.tiles.forEach((row, r) => row.forEach((ch, c) => {
			if (ch !== '>') return;
			if (r === 0 || c === 0 || r === st.rows - 1 || c === st.cols - 1) onEdge.push(`${key}(${r},${c})`);
		}));
	}
	check(`'>' が境界セルに乗っていない（残り: ${onEdge.join(' ')}）`, onEdge.length === 0);
}

// 玉座
{
	check(`${OLD_THRONE} が消えている`, !stages[OLD_THRONE]);
	const th = stages[NEW_THRONE];
	check(`${NEW_THRONE} が在る`, !!th);
	if (th) {
		const rows = th.tiles.map((r) => r.join(''));
		const floors = rows.reduce((n, row) => n + [...row].filter((ch) => ch === '.').length, 0);
		const z = [];
		rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'Z') z.push(`${r},${c}`); }));
		check(`${NEW_THRONE} は 10行12列`, rows.length === 10 && th.cols === 12 && th.rows === 10);
		check(`${NEW_THRONE} の床が 79 枚（実測 ${floors}）＝Z-⑪ の前提`, floors === 79);
		check(`${NEW_THRONE} の Z が (8,5) に1体（実測 ${z.join(' ') || 'なし'}）`, z.length === 1 && z[0] === '8,5');
		check(`${NEW_THRONE} の enemyDirs が {'8,5':'up'}`, th.enemyDirs?.['8,5'] === 'up' && Object.keys(th.enemyDirs).length === 1);
		check(`${NEW_THRONE} の北端にボス扉 ':' ×2`, rows[0] === '#####::#####');
		check(`${NEW_THRONE} の南端が全壁`, rows[9] === '############');
		check(`${NEW_THRONE} に '>' が無い`, !rows.some((row) => row.includes('>')));
		check(`${NEW_THRONE} の mapEnters が空`, Object.keys(th.mapEnters ?? {}).length === 0);
		check(`${NEW_THRONE} の bgTiles が空＝幻影が地形を見ない`, Object.keys(th.bgTiles ?? {}).length === 0);
		check(`${NEW_THRONE} が isBossRoom`, th.isBossRoom === true);
	}
	check(`bossStage が ${NEW_THRONE}`, layer.bossStage === NEW_THRONE);
	const bosses = Object.entries(stages).filter(([, s]) => s.isBossRoom).map(([k]) => k);
	check(`isBossRoom は ${NEW_THRONE} だけ（実測 ${bosses.join(' ')}）`, bosses.length === 1 && bosses[0] === NEW_THRONE);
}

// 手前の室から歩いてボス扉へ入れる（D1〜D3 と同じ文法）
{
	const apT = stages[APPROACH]?.tiles;
	check(`${APPROACH} 南端 (9,5)(9,6) が素の床`, apT?.[9][5] === '.' && apT?.[9][6] === '.');
	check(`${APPROACH} (8,5) が素の床（ワープ跡）`, apT?.[8][5] === '.');
	check(`${APPROACH} (8,11) が壁`, apT?.[8][11] === '#');
}

// ワープ2枚が跡形もなく消えている
{
	const ghosts = [];
	for (const [lname, ld] of Object.entries(data.layers ?? {})) {
		for (const [key, st] of Object.entries(ld.stages ?? {})) {
			for (const [cell, reg] of Object.entries(st.mapEnters ?? {})) {
				if (['towerBossRoom', 'bossApproach'].includes(reg?.id)
					|| ['towerBossRoom', 'bossApproach'].includes(reg?.destId)) {
					ghosts.push(`${lname} ${key} (${cell}) ${JSON.stringify(reg)}`);
				}
			}
		}
	}
	check(`towerBossRoom / bossApproach がどこにも残っていない（残り: ${ghosts.join(' / ')}）`, ghosts.length === 0);
}

// `>` と mapEnters が 1:1（塔は 2026-09-19 に未登録 '>' 12枚の実害あり）
{
	const bad = [];
	for (const [key, st] of Object.entries(stages)) {
		const tiles = new Set();
		st.tiles.forEach((row, r) => row.forEach((ch, c) => { if (ch === '>') tiles.add(`${r},${c}`); }));
		const regs = new Set(Object.keys(st.mapEnters ?? {}));
		for (const p of tiles) if (!regs.has(p)) bad.push(`${key} (${p}) '>' が未登録`);
		for (const p of regs) if (!tiles.has(p)) bad.push(`${key} (${p}) 登録あるがタイルが '>' でない`);
	}
	check(`塔の '>' と mapEnters が 1:1（不整合: ${bad.join(' / ')}）`, bad.length === 0);
}

// 石碑と階段の登録
{
	const b1 = stages['0,1'];
	check('0,1 の石碑 signData[1,1] が動いていない', !!b1?.signData?.['1,1']?.lines?.length);
	check("0,1 の階段が (1,5)＝b1fStairsUp", b1?.mapEnters?.['1,5']?.id === 'b1fStairsUp' && b1?.tiles[1][5] === '>');
	check('0,1 row0 が全壁', b1?.tiles[0].join('') === '############');
	check('1,0 row0 が全壁', stages['1,0']?.tiles[0].join('') === '############');
	check('1,1 の東端 (4,11)(5,11) が壁', stages['1,1']?.tiles[4][11] === '#' && stages['1,1']?.tiles[5][11] === '#');
	// 階段の相手側（1F 側）の登録は触っていない＝着地セルは id の位置から引かれる
	check("1,0 (6,4) の登録が b1fStairsUp 行き", stages['1,0']?.mapEnters?.['6,4']?.destId === 'b1fStairsUp');
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER}：見せかけ開口を塞ぎ、玉座の間を ${OLD_THRONE} → ${NEW_THRONE} へ移設（キュー20b）`);
console.log(log.join('\n') || '  （変更なし）');

console.log('\n## 盤面の差分');
for (const [key, rows] of Object.entries(before)) {
	const now = stages[key] ? stages[key].tiles.map((r) => r.join('')) : null;
	console.log(`\n--- ${key}`);
	rows.forEach((a, i) => {
		const b = now ? now[i] : '(削除)';
		console.log(`   ${String(i).padStart(2)} ${a}   ${a === b ? '=' : '→'}   ${b}`);
	});
}
if (stages[NEW_THRONE]) {
	console.log(`\n--- ${NEW_THRONE}（新設）`);
	stages[NEW_THRONE].tiles.forEach((r, i) => console.log(`   ${String(i).padStart(2)} ${r.join('')}`));
}

console.log('\n## 検証');
let ng = 0;
for (const [cond, msg] of verify) {
	console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
	if (!cond) ng++;
}
if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
	// ⚠️ `ps_progress` という URL パラメータは存在しない（エディタのプリセット選択が
	//    個々の `ps_*` に展開する仕組み＝`editor/editor-io.js` の applyProgressPreset）。
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10';
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log('  5F 最奥 → 南へ歩いてボス扉から玉座へ（ワープが無くなったことの確認）:');
	console.log(`  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${APPROACH}&row=7&col=5&${GEAR}`);
	console.log('  B1F 入口（階段が室内に下がった・上端が全壁・玉座が真上から消えた）:');
	console.log(`  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=0,1&row=5&col=5&${GEAR}`);
}

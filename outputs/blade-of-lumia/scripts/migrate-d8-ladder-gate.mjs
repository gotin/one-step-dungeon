// dungeon_8（沼地の神殿）＝はしごを「ボス到達の必須条件」にする盤面の直し。
//
// 2026-09-19 のユーザー指示（実行キュー 17-8a の着手中に発覚）。
//
// 【何が壊れていたか】
//   入口 1,3 の行3には部屋を横断する水（bgTiles の '~' 10 マス）があり、看板も
//   「沼に橋を架けて渡れ。はしごを使うのだ。」と言っている。ところが入口の南半分からは
//   東の口 → 2,3 → 2,2 → 1,2 → 1,1 と回れてしまい、**水を一度も渡らずにボスまで行けた**
//   （BFS 実測＝はしご無しで 23/23 室に到達・ボス室 0,0 も true）。
//   ＝看板は嘘ではなく、盤面の側が仕掛けを無効にしていた。
//
// 【直し方】
//   ① 1,3：東の回廊（rows 4-5 × cols 9-10）を 2 マス幅の淀みで埋め、東の口を閉じる。
//      ・2 マス幅にするのが要点＝はしごは 1 マス幅の水/穴にしか架からない
//        （scripts/lib/connectivity.mjs isLadderBridgeCell / game/passable.js）。
//        1 マス幅だと渡れてしまい東の迂回が生き残る＝ゲートにならない。
//      ・境界セル (4,11)(5,11) と対向の 2,3 (4,0)(5,0) を '#' にする。水だけ置いて口を
//        開けたままにすると、2,3 から西へ入った人が (4,11)(5,11) の乾いた 2 マスに降り、
//        前は 2 マス幅の水＝渡れない → そこだけ恒久詰みになる。
//   ② 1,1：笛で現れるワープ '>' を (4,9) → (5,5)（部屋の中央）へ移し、
//      rows3-7 × cols3-7 の外周 16 マスを水にして「水の環に囲まれた祭壇の島」にする。
//      ・島は rows4-6 × cols4-6 の乾いた 3×3 ＝ 1,0 から戻って中心に着地しても
//        周り 8 マスが乾いている（詰まない）。
//      ・部屋の 3 つの出口（西 4-5,0／東 4-5,11／南 9,5-6）は外周を通って乾いたまま
//        繋がる＝通り抜けにはしごを要求しない。島だけが梯子越し。
//      ・'>' を動かすと 1,0 (7,9) の destId=d8_gatehall 側の**着地セルも一緒に動く**
//        （mapEnters は id⇔destId で相互に指し合う）∴着地は自動で島の中心になる。
//
// 【結果（このスクリプトの自己検証で毎回測る）】
//   はしご無し: 2/23 室・ボス到達 false ／ はしご有り: 23/23 室・deadEdge 0
//
// 使い方:
//   node scripts/migrate-d8-ladder-gate.mjs                    # 本番（work/blade-of-lumia.json）
//   BLADE_MAP_PATH=.scratch/dry.json node scripts/migrate-d8-ladder-gate.mjs   # 空撃ち
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bfsLayer, SOLVABLE_GATES } from './lib/connectivity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = process.env.BLADE_MAP_PATH
	? path.resolve(process.env.BLADE_MAP_PATH)
	: path.join(ROOT, 'work/blade-of-lumia.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers?.dungeon_8?.stages;
if (!stages) throw new Error('layer dungeon_8 が無い');

console.log(`対象: ${MAP_PATH}`);

// ── 小道具 ────────────────────────────────────────────────
function stage(key) {
	const st = stages[key];
	if (!st) throw new Error(`部屋が無い: dungeon_8 ${key}`);
	if (!Array.isArray(st.tiles) || !Array.isArray(st.tiles[0])) {
		// field / dungeon とも tiles は「文字配列の配列」。行文字列に潰すとゲームが落ちる。
		throw new Error(`${key}: tiles が文字配列の配列でない`);
	}
	return st;
}

// 事前条件つきのタイル差し替え。冪等＝既に新しい文字なら黙って通す。
function setTile(key, r, c, { from, to, label }) {
	const st = stage(key);
	const cur = st.tiles[r][c];
	if (cur === to) { console.log(`  = ${label} (${r},${c}) 既に '${to}'`); return; }
	if (cur !== from) throw new Error(`${label} (${r},${c}): 想定 '${from}' / 実際 '${cur}'`);
	st.tiles[r][c] = to;
	console.log(`  ✔ ${label} (${r},${c}) '${from}' → '${to}'`);
}

// bgTiles に水を置く。既に水なら何もしない（冪等）。
function setWater(key, cells, label) {
	const st = stage(key);
	if (!st.bgTiles) st.bgTiles = {};
	let added = 0, already = 0;
	for (const [r, c] of cells) {
		const pk = `${r},${c}`;
		if (st.bgTiles[pk] === '~') { already++; continue; }
		// 水を置くのは「床」の上だけ＝壁や仕掛けの下に敷くと意味が変わる。
		const t = st.tiles[r][c];
		if (t !== '.') throw new Error(`${label} (${pk}): 床 '.' でない '${t}' の上に水を置こうとした`);
		st.bgTiles[pk] = '~';
		added++;
	}
	console.log(`  ✔ ${label}：水 +${added} マス（既に水 ${already} マス）`);
}

// ── ① 1,3：東の回廊を埋め、東の口を両面とも閉じる ────────────────────────
console.log('\n① 1,3 の東の迂回を塞ぐ（はしご無しの出口をゼロにする）');
setWater('1,3', [[4, 9], [4, 10], [5, 9], [5, 10]], '1,3 東の淀み（2マス幅＝はしごでは渡れない）');
setTile('1,3', 4, 11, { from: '.', to: '#', label: '1,3 東の口・上' });
setTile('1,3', 5, 11, { from: '.', to: '#', label: '1,3 東の口・下' });
setTile('2,3', 4, 0, { from: '.', to: '#', label: '2,3 西の口・上（対向）' });
setTile('2,3', 5, 0, { from: '.', to: '#', label: '2,3 西の口・下（対向）' });

// ── ② 1,1：ワープを中央へ移し、水の環で島にする ──────────────────────────
console.log('\n② 1,1 のワープを中央へ移して水の環で囲む');
{
	const st = stage('1,1');
	const OLD = '4,9', NEW = '5,5';
	const moved = st.tiles[5][5] === '>' && st.mapEnters?.[NEW];
	if (moved) {
		console.log(`  = ワープは既に (${NEW})`);
	} else {
		const me = st.mapEnters?.[OLD];
		const sc = st.showConditions?.[OLD];
		if (!me) throw new Error(`1,1: mapEnters(${OLD}) が無い（既に移設済みでもない）`);
		if (me.id !== 'd8_gatehall' || me.destId !== 'd8_bosswing') {
			throw new Error(`1,1 mapEnters(${OLD}) が想定と違う: ${JSON.stringify(me)}`);
		}
		if (sc?.trigger !== 'flutePlayed') {
			throw new Error(`1,1 showConditions(${OLD}) が想定と違う: ${JSON.stringify(sc)}`);
		}
		setTile('1,1', 4, 9, { from: '>', to: '.', label: '1,1 旧ワープ跡' });
		setTile('1,1', 5, 5, { from: '.', to: '>', label: '1,1 新ワープ（島の中心）' });
		delete st.mapEnters[OLD];
		delete st.showConditions[OLD];
		st.mapEnters[NEW] = me;
		st.showConditions[NEW] = sc;
		console.log(`  ✔ mapEnters / showConditions のキーを (${OLD}) → (${NEW}) へ移した`);
	}
	// 水の環＝rows3-7 × cols3-7 の外周（島は rows4-6 × cols4-6 の 3×3）
	const ring = [];
	for (let r = 3; r <= 7; r++) {
		for (let c = 3; c <= 7; c++) {
			if (r === 3 || r === 7 || c === 3 || c === 7) ring.push([r, c]);
		}
	}
	setWater('1,1', ring, '1,1 祭壇を囲む水の環');
}

// ── 書き出し ──────────────────────────────────────────────
// ⚠️ インデントは必ず 2 スペース（タブだと 14 万行が全部差分になる）。
fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き出した: ${MAP_PATH}`);

// ── 自己検証：書いた後のファイルを読み直して BFS で測る ───────────────────
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const st = after.layers.dungeon_8.stages;
	const START = { stage: '1,3', row: 7, col: 2 }; // 入口 '>' のセル
	const problems = [];
	const runs = {};
	for (const withLadder of [false, true]) {
		const r = bfsLayer(st, START, { withLadder, openTiles: SOLVABLE_GATES, followMapEnters: true });
		runs[withLadder] = r;
		console.log(`  はしご${withLadder ? '有' : '無'}: 到達室 ${r.reachedRooms.size}/${Object.keys(st).length}`
			+ ` ボス0,0=${r.reachedRooms.has('0,0')} 鍵1,0=${r.reachedRooms.has('1,0')}`
			+ ` 笛1,2=${r.reachedRooms.has('1,2')} deadEdge=${r.deadEdges.length}`);
	}
	if (runs[false].reachedRooms.has('0,0')) problems.push('はしご無しでボス室 0,0 に到達できる＝ゲートになっていない');
	if (runs[false].reachedRooms.has('1,2')) problems.push('はしご無しで笛の部屋 1,2 に到達できる');
	const withL = runs[true];
	const missing = Object.keys(st).filter((k) => !withL.reachedRooms.has(k));
	if (missing.length) problems.push(`はしご有りでも未到達の部屋がある: ${missing.join(' ')}`);
	if (withL.deadEdges.length) {
		problems.push(`dead edge が出た: ${withL.deadEdges.map((e) => `${e.from}→${e.to}(${e.at}/${e.reason})`).join(' ')}`);
	}
	// 島の乾きを直接確かめる（着地セルの周り 8 マスが水だと詰む）
	const s11 = st['1,1'];
	for (let r = 4; r <= 6; r++) {
		for (let c = 4; c <= 6; c++) {
			if (s11.bgTiles?.[`${r},${c}`] === '~') problems.push(`島の中が水になっている: 1,1 (${r},${c})`);
		}
	}
	if (s11.tiles[5][5] !== '>') problems.push('1,1 (5,5) がワープ \'>\' でない');
	if (!s11.mapEnters?.['5,5']) problems.push('1,1 mapEnters(5,5) が無い');
	if (s11.showConditions?.['5,5']?.trigger !== 'flutePlayed') problems.push('1,1 showConditions(5,5) の trigger が flutePlayed でない');

	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK（はしご無しではボスに届かない／はしご有りで全室・dead edge 0）');
}

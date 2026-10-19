// キュー89：怨念のもや（`Ψ`）を他の場所にも置く（2026-10-19・設計は Opus・1画面ずつ）
//
// ■ ご褒美の配分（ユーザー判定 2026-10-19「かけら4個で器1つ分」）
//   もやの奥のうち 4 か所にハートのかけらを 1 個ずつ＝全部祓うと最大ハート +1。
//   残りのもやの奥はルピー・回復薬・ロアの石碑。
//
// ■ A1＝field `7,10`（D3 へ向かう道の途中・右の山並み）
//   ロウソク（D4）より前に毎回横を通る画面。右端の山並みから岩の張り出しを作り、
//   その切れ込みの口をもやで塞ぎ、奥に宝箱（ハートのかけら）を見せる。
//   序盤は剣を振っても「すり抜けた」＝後で来る場所と覚えてもらう。
//      6 ...E....MMMM     ← 張り出しの上の縁（(6,8) と (6,11) は元から山）
//      7 .........ΨBM     ← もや Ψ(7,9)・宝箱 B(7,10)
//      8 .........MMM     ← 張り出しの下の縁
//   ・東の 8,10 へ抜ける口（行4・5 の右端）は変えない。
//   ・宝箱は (7,9) に立って右を向けば開く＝もやを祓った後のマスだけが届く場所。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・もや無しでは宝箱（石碑）に届かない／もやを祓うと届く（対照）
//   ・層の到達室が書き換え前と同じ・dead-edge が増えない
//   ・tiles が文字の配列の配列
//   再実行しても同じ結果（冪等）。
//
// 使い方:
//   node scripts/migrate-89-curse-mist-nooks.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-89-curse-mist-nooks.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const PIECE = { type: 'item', item: 'heartPiece', name: 'ハートのかけら' };

// 各置き場所＝{ layer, stage, set: [[r, c, ch]...], chest: [cell, content] か sign: [cell, signData], mist: cell, start }
const NOOKS = [
	{
		name: 'A1 D3 へ向かう道の岩の切れ込み',
		layer: 'field', stage: '7,10',
		set: [[6, 9, 'M'], [6, 10, 'M'], [7, 9, TILE.CURSE_MIST], [7, 10, TILE.CHEST], [8, 9, 'M'], [8, 10, 'M']],
		chest: ['7,10', PIECE],
		mist: '7,9',
		start: { row: 7, col: 3 },
	},
	{
		// ■ A2＝field `3,16`「古の戦の碑」（D2 へ向かう道 3,15 の真下・砂漠の遺跡）
		//   昔の戦の亡者を葬った小さな墓。入口を怨念のもやが塞いでいる。
		//      5 dddd#d#d#ddd     ← 遺跡の柱（元のまま）
		//      6 ddddEddC#Ψ#d     ← 墓の口＝もや Ψ(6,9)（北から入る）
		//      7 dddddddd#B#d     ← 宝箱 B(7,9)
		//      8 dddddddd###d
		//   ・壁は遺跡と同じ `#`＝同じ戦の跡に見える。もやを祓った (6,9) に立ち、下を向いて開ける。
		name: 'A2 古の戦の碑の墓',
		layer: 'field', stage: '3,16',
		set: [[6, 8, '#'], [6, 9, TILE.CURSE_MIST], [6, 10, '#'], [7, 8, '#'], [7, 9, TILE.CHEST], [7, 10, '#'], [8, 8, '#'], [8, 9, '#'], [8, 10, '#']],
		chest: ['7,9', PIECE],
		mist: '6,9',
		start: { row: 7, col: 3 },
	},
	{
		// ■ C1＝field `11,18`「都の墓所」（石碑「灯が 絶えて 久しい。火種すら 残って いない。」）
		//   霊廟（かがり火の謎＝中は変えない）の東の壁に、脇の小さな墓を足す。口を怨念のもやが塞ぐ。
		//      2 www#####www~
		//      3 www#HoH###w~     ← 脇の墓の上の縁 (3,8)(3,9)
		//      4 www#ooo#BΨw~     ← 宝箱 B(4,8)・もや Ψ(4,9)（東の (4,10) から祓う）
		//      5 www#oBo###w~     ← 下の縁 (5,8)(5,9)
		//   ・宝箱は霊廟の外壁 (4,7) に背を付ける＝霊廟の続きの墓に見える。
		//   ・東の (4,10) は水 (4,11) の手前の1列の道＝もやを祓った (4,9) に立ち、左を向いて開ける。
		name: 'C1 都の墓所の脇の墓',
		layer: 'field', stage: '11,18',
		set: [[3, 8, '#'], [3, 9, '#'], [4, 8, TILE.CHEST], [4, 9, TILE.CURSE_MIST], [5, 8, '#'], [5, 9, '#']],
		chest: ['4,8', PIECE],
		mist: '4,9',
		start: { row: 8, col: 9 },
	},
	{
		// ■ B1＝dark_tower `1,4`（左右対称の小さな祠の間＝左右の壁龕にルピーが1つずつ）
		//      2 #.##....##.#
		//      3 #.#r...ΨB#.#     ← 右の壁龕の口をもや Ψ(3,7) で塞ぎ、ルピー r を宝箱 B(3,8) に替えた
		//      4 #.##....##.#
		//   ・左の壁龕のルピーは素で取れる／右は祓わないと届かない＝対の片方だけ封じられている。
		//   ・部屋の通り道（北と南の口・壁龕の外周）は変えない＝塔の謎の手順は変わらない。
		name: 'B1 塔の祠の間の右の壁龕',
		layer: 'dark_tower', stage: '1,4',
		set: [[3, 7, TILE.CURSE_MIST], [3, 8, TILE.CHEST]],
		chest: ['3,8', PIECE],
		mist: '3,7',
		start: { row: 5, col: 5 },
	},
	{
		// ■ C2＝field `5,3`「廃城」（ユーザー判定 2026-10-19「廃城5,3だけ足す」＝かけら以外の味付け）
		//   ザーネルが闇に傾く前の館。儀式の夜に崩れた＝怨念の起こりに一番近い場所。
		//   右上の崩れ壁 (1,8) に続けて小さな祈りの間を作り、口を怨念のもやが塞ぐ。奥はロアの石碑。
		//      0 tttttoottttt
		//      1 to#ooooo#†#t     ← 石碑 †(1,9)・壁 (1,10)
		//      2 tooooEoo#Ψ#t     ← もや Ψ(2,9)（南の (3,9) から祓う）
		//      3 too†oooBooot
		//   ・同じ画面にハートの器 (8,10) がある∴ご褒美はかけらにしない（最大 HP の報酬を1画面に並べない）。
		//   ・石碑は其の四（死を覆す儀式）と其の八（病で失った者）の間を埋める＝「病」の語は出さない（其の八の先走りになる）。
		//   ・もやを祓った (2,9) に立ち、上を向いて読む。
		name: 'C2 廃城の祈りの間',
		layer: 'field', stage: '5,3',
		set: [[1, 9, TILE.MONUMENT], [1, 10, TILE.WALL], [2, 8, TILE.WALL], [2, 9, TILE.CURSE_MIST], [2, 10, TILE.WALL]],
		sign: ['1,9', {
			name: '祈りの間の石碑',
			lines: [
				'【崩れた 祈りの間】',
				'ザーネルは ここで 救えなかった 者たちの 名を 呼び 続けた。',
				'誰も 帰らなかった。呼ばれた 声だけが 残り、怨念と なって 戸口を 塞いだ。',
				'聖なる 火に 祓われ、声は ようやく 眠りに ついた。',
			],
		}],
		mist: '2,9',
		start: { row: 3, col: 9 },
	},
];

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);
const log = [];

// 層ごとの到達性（書き換え前）＝開始地点から門を閉じたまま歩く。
const LAYER_START = {
	field: { stage: data.startPos.stage, row: data.startPos.row, col: data.startPos.col },
	dark_tower: { stage: '0,1', row: 1, col: 5 },   // 塔の 1F の入口 '>'（1fEntrance）
};
// 塔は階段（同じ層の '>' の対）を辿り、錠・爆弾壁・はしごは開いた扱い＝全室を歩いて測る
// （辿らないと入口の 4 室しか測れず、検査が空虚になる）。
const LAYER_OPTS = {
	field: {},
	dark_tower: { followMapEnters: true, withLadder: true, openTiles: new Set(['T', '!', 'D', '=', '|', ':']) },
};
const layerRun = (layer) => bfsLayer(data.layers[layer].stages, LAYER_START[layer], LAYER_OPTS[layer]);
const sortedSet = (s) => JSON.stringify([...s].sort());
const base = {};
for (const layer of new Set(NOOKS.map((n) => n.layer))) {
	const run = layerRun(layer);
	base[layer] = { rooms: sortedSet(run.reachedRooms), dead: run.deadEdges.length };
}

for (const n of NOOKS) {
	const st = data.layers[n.layer].stages[n.stage];
	const before = st.tiles.map((r) => r.join(''));
	for (const [r, c, ch] of n.set) st.tiles[r][c] = ch;
	const [cell, content] = n.chest ?? n.sign;
	if (n.chest) {
		st.chestContents ??= {};
		st.chestContents[cell] = content;
	} else {
		st.signData ??= {};
		st.signData[cell] = content;
	}
	const after = st.tiles.map((r) => r.join(''));
	if (before.join('|') !== after.join('|')) {
		log.push(`## ${n.name}（${n.layer} ${n.stage}）`);
		after.forEach((row, i) => log.push(`  ${String(i).padStart(2)} ${row}${row !== before[i] ? `   ← ${before[i]}` : ''}`));
	}

	// ── 検証 ──
	const t = st.tiles;
	check(`${n.stage}: tiles が文字の配列の配列`, t.every((row) => Array.isArray(row) && row.length === st.cols) && t.length === st.rows);
	const [mr, mc] = n.mist.split(',').map(Number);
	const [cr, cc] = cell.split(',').map(Number);
	if (n.chest) {
		check(`${n.stage}: もや ${n.mist}・宝箱 ${cell}（${content.name}）`,
			t[mr][mc] === TILE.CURSE_MIST && t[cr][cc] === TILE.CHEST && JSON.stringify(st.chestContents[cell]) === JSON.stringify(content));
	} else {
		check(`${n.stage}: もや ${n.mist}・石碑 ${cell}（${content.name}）`,
			t[mr][mc] === TILE.CURSE_MIST && t[cr][cc] === TILE.MONUMENT && JSON.stringify(st.signData[cell]) === JSON.stringify(content));
	}
	// 画面の中で歩ける範囲（もやを壁扱い／祓った後＝床扱い）
	const walk = (grid, cleared) => {
		const blocked = (r, c) => {
			const ch = grid[r][c];
			if (ch === TILE.CURSE_MIST) return !cleared;
			return HARD_BLOCKED.has(ch) || ch === TILE.CHEST || st.bgTiles?.[`${r},${c}`] === TILE.WATER;
		};
		const seen = new Set([`${n.start.row},${n.start.col}`]);
		const q = [[n.start.row, n.start.col]];
		while (q.length) {
			const [r, c] = q.shift();
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
				if (nr < 0 || nc < 0 || nr >= st.rows || nc >= st.cols || seen.has(k) || blocked(nr, nc)) continue;
				seen.add(k); q.push([nr, nc]);
			}
		}
		return seen;
	};
	const touches = (w) => [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => w.has(`${cr + dr},${cc + dc}`));
	const what = n.chest ? '宝箱' : '石碑';
	check(`${n.stage}: もやがあると${what}に届かない`, !touches(walk(t, false)));
	check(`${n.stage}: もやを祓うと${what}に届く`, touches(walk(t, true)));
	{
		// 対照＝もやを壁で塗ると、祓った扱いでも届かない（歩行判定が空虚でない）
		const walled = t.map((row) => [...row]);
		walled[mr][mc] = TILE.WALL;
		check(`${n.stage}: 対照＝もやを壁で塗ると届かない`, !touches(walk(walled, true)));
	}
}

for (const layer of Object.keys(base)) {
	const run = layerRun(layer);
	if (layer === 'dark_tower') check(`dark_tower: 置き場 1,4 を歩いて測れている`, run.reachedRooms.has('1,4'));
	check(`${layer}: 到達室が書き換え前と同じ（${run.reachedRooms.size} 室）`, sortedSet(run.reachedRooms) === base[layer].rooms);
	check(`${layer}: dead-edge が増えていない（前 ${base[layer].dead} → 後 ${run.deadEdges.length}）`, run.deadEdges.length <= base[layer].dead);
}

console.log(log.join('\n') || '（盤面の変更なし＝適用済み）');
console.log('');
let ok = true;
for (const [pass, msg] of verify) { console.log(`${pass ? '✓' : '✗'} ${msg}`); if (!pass) ok = false; }
if (!ok) { console.error('\n✗ 検証に失敗＝書き込まない'); process.exit(1); }
if (DRY) { console.log('\n(--dry) 書き込まない'); process.exit(0); }
// 末尾の改行は元のファイルに合わせる（差分を盤面の行だけにする）
writeFileSync(MAP_PATH, JSON.stringify(data, null, 2) + (readFileSync(MAP_PATH, 'utf8').endsWith('\n') ? '\n' : ''));
console.log(`\n書き込んだ: ${MAP_PATH}`);

#!/usr/bin/env node
/**
 * migrate-hidden-cave-inner-room.mjs（実行キュー56・2026-10-13）
 *
 * 草陰の祠（hidden_cave・field 6,13 の茂みをロウソクで燃やすと出る）に奥の間 `1,0` を足し、
 * field 6,13 の床に置いてあったハートの器をそこへ移す。
 * ユーザー判断＝「祠の中にステージを増やしてパズル要素を解いたらハートの器がとれるようにする、
 * ぐらいの難易度はつけておきたい」。
 *
 * 奥の間「影の灯の間」（入口は西＝表の間 `0,0` の東の壁 (4,11) を開ける）:
 *        0123456789AB
 *     0  ############
 *     1  #......#tHt#   ← 影の灯 (1,9)＝三方が木・上は壁＝隣に立てない
 *     2  #..*.t.#.t.#   ← 石 (2,3)
 *     3  #.t...t#.H.#   ← 灯 (3,9)＝ロウソクで点く
 *     4  ...t...T...#   ← 入口 (4,0)・門 (4,7)
 *     5  #.t..t.#...#
 *     6  #....S.#...#   ← ボタン (6,5)
 *     7  #.t....#...#
 *     8  #.....i#.B.#   ← 書き置き (8,6)・宝箱 (8,9)＝二つの灯が揃うと現れる（ハートの器）
 *     9  ############
 *
 *   ① 石をボタンへ運ぶ（右へ1→下へ4→右へ1。下へ押しすぎると壁際で動かなくなる＝部屋を出れば戻る）
 *      → 全ボタンに石＝門が開いて固まる
 *   ② 灯 (3,9) をロウソクで点ける
 *   ③ 影の灯 (1,9) は隣に立てない∴(4,9) から上へブーメランを投げ、(3,9) の火を運ぶ
 *      （木のブーメランの射程は3マス＝(4,9) から灯 (3,9) が1・影の灯 (1,9) が3＝ちょうど届く）
 *   → 二つの灯が揃う（torchesLit）と宝箱が現れる
 *
 * ソルバー（blade-solver.mjs）での実測：最短 23 手・出られなくなる状態 0・
 * 石を押さないと解けない・ロウソク無しでは解けない。
 *
 * 自己検証：表の間の東の壁と、field 6,13 から器が消えていること（先に
 * migrate-field-6-13-cleanup.mjs を流す）を確かめてから書く。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const layer = map.layers.hidden_cave;
if (!layer) throw new Error('hidden_cave が無い');
if (layer.stages['1,0']) throw new Error('hidden_cave 1,0 は既にある');
const front = layer.stages['0,0'];
if (front.tiles[4][11] !== '#' || front.tiles[4][10] !== '.') throw new Error('表の間の東の壁 (4,11) が想定外');
if (map.layers.field.stages['6,13'].tiles[8][3] !== '.') throw new Error('field 6,13 の床の器 (8,3) がまだ残っている（先に cleanup を流す）');

const ROWS = [
	'############',
	'#......#tHt#',
	'#..*.t.#.t.#',
	'#.t...t#.H.#',
	'...t...T...#',
	'#.t..t.#...#',
	'#....S.#...#',
	'#.t....#...#',
	'#.....i#.B.#',
	'############',
];

front.tiles[4][11] = '.';
layer.stages['1,0'] = {
	cols: 12,
	rows: 10,
	tiles: ROWS.map((r) => [...r]),
	bgTiles: {},
	links: [],
	enemyDirs: {},
	chestContents: { '8,9': { type: 'heartContainer', name: 'ハートの器' } },
	objects: {},
	npcData: {},
	shopData: {},
	mapEnters: {},
	showConditions: { '8,9': { trigger: 'torchesLit', message: '二つの 灯が 揃い、奥に 宝箱が 現れた！' } },
	breakableWalls: {},
	isBossRoom: false,
	signData: {
		'8,6': {
			name: '祠守りの 書き置き',
			lines: [
				'影の灯は 草陰に 隠れて 手が 届かぬ。',
				'灯から 灯へ、炎を 運ぶ者が あれば……',
			],
		},
	},
};

// 床は草地（ユーザー提案「ここの洞窟は床のかわりに草地にするのもいいかも」・2026-10-13）。
// 名前が「草陰の祠」で入口も茂みの下・中に木が立つ＝暗い石の床より草に埋もれた祠のほうが合う。
// 壁 '#' 以外のセルの下地を草地 'g' にする（表の間・奥の間とも）。
for (const st of [front, layer.stages['1,0']]) {
	st.bgTiles = {};
	st.tiles.forEach((row, r) => row.forEach((ch, c) => { if (ch !== '#') st.bgTiles[`${r},${c}`] = 'g'; }));
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log('草陰の祠に奥の間 1,0 を足しました');

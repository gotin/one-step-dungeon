#!/usr/bin/env node
/**
 * migrate-rooms-enemies-alert.mjs（実行キュー60・2026-10-14）
 *
 * 雑魚のさまよい（`ENEMY_META.roam`）を入れたら、「雑魚が寄って来る」前提で1部屋ずつ作った
 * ダンジョンの6部屋の番人が赤くなった（フル実行で発見）。ユーザー承認（2026-10-14）＝
 * この6部屋は部屋まるごと「敵は最初から気づいている」（`enemiesAlert: true`）をオンにする。
 *   dungeon_1 2,0 裏口の金庫とルピー喰い（σ が檻から出る）
 *   dungeon_2 2,0 封じ火の墓廊（ψ が寄らない）
 *   dungeon_5 2,3 凍れる柱廊の双つ甲羅／0,1 凍れる祠の番鮫／3,0 凍れる氷原の分裂スライム（寄らない）
 *   dungeon_7 3,4 空の盾騎士の細橋（騎士が口を塞がない）
 *   dungeon_5 3,1 凍れる湖の鬼火／3,2 凍れる四つ池の辻（2回目のフル実行で発見＝乱数で揺れていた）
 *   dungeon_7 4,2 空の骸骨の並走岸（全体を3周回して発見）
 * 冪等：既にオンなら何もしない。各部屋にさまよう敵が居ることを確かめてから書く。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { canRoam } from '../shared/enemy-alert.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const ROOMS = [
	['dungeon_1', '2,0'], ['dungeon_2', '2,0'],
	['dungeon_5', '2,3'], ['dungeon_5', '0,1'], ['dungeon_5', '3,0'],
	['dungeon_7', '3,4'],
	// 2回目のフル実行で見つかった2部屋（乱数で揺れる＝1回目は緑だった）。同じ方針で追加。
	['dungeon_5', '3,1'],   // 凍れる湖の鬼火（鬼火が道のプレイヤーへ寄る）
	['dungeon_5', '3,2'],   // 凍れる四つ池の辻（堤に立つと両側の池から魚群が群がる）
	// 全体を3周回して見つかった1部屋（さらに低い率で揺れていた）。
	['dungeon_7', '4,2'],   // 空の骸骨の並走岸（骸骨が向こう岸で同じ列に並んでついて来る）
];

let changed = 0;
for (const [lk, sk] of ROOMS) {
	const sd = map.layers[lk]?.stages?.[sk];
	if (!sd) throw new Error(`${lk} ${sk} が無い`);
	const roamers = sd.tiles.flat().filter(canRoam);
	if (!roamers.length) throw new Error(`${lk} ${sk} にさまよう敵が居ない（部屋の取り違え？）`);
	if (sd.enemiesAlert === true) { console.log(`${lk} ${sk}：既にオン`); continue; }
	sd.enemiesAlert = true;
	changed++;
	console.log(`${lk} ${sk}：enemiesAlert をオン（さまよう敵 ${roamers.join('')}）`);
}
if (changed) writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log(changed ? `${changed} 部屋を書き換えました` : '変更なし');

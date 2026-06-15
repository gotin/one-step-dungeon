// Phase 1-5: 暗黒の塔（ラストダンジョン）をマップに追加する移行スクリプト（冪等）。
//
// 構成（すべて MAP_ENTER テレポートで接続。field の閉じた縁に依存しない）：
//   1. field "3,0" の到達可能な床に「塔への portal」MAP_ENTER を置く
//        mapEnters { id:'fieldToTower', destId:'darkTower' }
//        → destId==='darkTower'(=DARK_TOWER_EXIT_ID) なので game.js が hasWingRobe ゲートを適用
//   2. field "4,0"（空島）：到着足場 → 虚空(SKY '%') の谷 → 浮島の塔入口
//        到着  : mapEnters {"3,2":{ id:'darkTower',      destId:'fieldToTower' }}
//        塔入口: mapEnters {"3,9":{ id:'islandToTower',  destId:'towerEntrance' }}
//        谷(cols4-7) は SKY で全行を分断 → 翼の羽衣の飛行(F)でしか渡れない
//   3. dark_tower レイヤー：入口フロア "0,1"（到着 'towerEntrance'）→ 上の開口 → ボス部屋 "0,0"（ザーネル Z）
//
// 実行：node scripts/add-dark-tower.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('../work/blade-of-lumia.json', import.meta.url);
const d = JSON.parse(readFileSync(PATH, 'utf8'));

function stage(rows) {
	for (const s of rows) if (s.length !== 12) throw new Error(`row width != 12 (${s.length}): "${s}"`);
	const tiles = rows.map(s => s.split(''));
	return {
		cols: 12, rows: tiles.length, tiles,
		bgTiles: {}, links: [], enemyDirs: {}, chestContents: {}, objects: {},
		npcData: {}, shopData: {}, mapEnters: {}, showConditions: {}, breakableWalls: {},
		isBossRoom: false,
	};
}

// ── 0. 以前の試行で 3,0 の右端を塞いでいたら元に戻す（縁遷移は使わない）──
{
	const sd = d.layers.field.stages['3,0'];
	sd.tiles[0][11] = '.';  // 元の値に復元
	sd.tiles[9][11] = '.';
	// 塔への portal を到達可能な床へ配置（row2,col2 は開始村方面から到達可能）
	sd.tiles[2][2] = '>';
	sd.mapEnters = sd.mapEnters ?? {};
	sd.mapEnters['2,2'] = { id: 'fieldToTower', destId: 'darkTower' };
	sd.npcData = sd.npcData ?? {};
}

// ── 1. field "4,0"（空島）───────────────────────────────────────
//  cols1-3 = 到着足場 / cols4-7 = 虚空(SKY) / cols8-10 = 浮島
//  row0/row9/col0/col11 = M で外周を閉じる（谷を回り込めない）
const field40 = stage([
	'MMMMMMMMMMMM', // 0
	'M...%%%%...M', // 1
	'M...%%%%...M', // 2
	'M.>.%%%%.>.M', // 3  col2: 到着 / col9: 塔入口
	'M...%%%%...M', // 4
	'M...%%%%...M', // 5
	'M...%%%%...M', // 6
	'M.i.%%%%...M', // 7  col2: 石碑(看板)
	'M...%%%%...M', // 8
	'MMMMMMMMMMMM', // 9
]);
field40.mapEnters['3,2'] = { id: 'darkTower',     destId: 'fieldToTower' };
field40.mapEnters['3,9'] = { id: 'islandToTower', destId: 'towerEntrance' };
// 石碑（SIGN 'i'）。combat.js は signData が無ければ npcData を流用する。
field40.npcData['7,2'] = {
	name: '古びた石碑',
	lines: [
		'「翼の羽衣をまといし者のみ、虚空を越え暗黒の塔へ至る」',
		'Fキー（モバイルは🪽ボタン）で 空へ舞い上がり、谷を渡れ。',
	],
};
d.layers.field.stages['4,0'] = field40;

// ── 2. dark_tower レイヤー ──────────────────────────────────────
// 入口フロア "0,1"：到着 '>'(towerEntrance) → 上の開口(row0 col5,6) → ボス部屋 "0,0"。
const towerEntrance = stage([
	'#####..#####', // 0  上の開口 → ボス部屋へ
	'#..........#', // 1
	'#...C..C...#', // 2  追跡者
	'#..........#', // 3
	'#..F....F..#', // 4  騎士
	'#....>.....#', // 5  到着地点（towerEntrance）
	'#..........#', // 6
	'#..........#', // 7
	'#..........#', // 8
	'############', // 9
]);
towerEntrance.mapEnters['5,5'] = { id: 'towerEntrance', destId: 'islandToTower' };
towerEntrance.enemyDirs = { '2,4': 'down', '2,7': 'down', '4,3': 'down', '4,8': 'down' };

// ボス部屋 "0,0"：最奥にザーネル Z。下端のボス用ドアウェイ(':')から入室（撃破まで退出不可）。
const towerBoss = stage([
	'############', // 0
	'#....Z.....#', // 1  ザーネル（撃破でエンディング）
	'#..........#', // 2
	'#..........#', // 3
	'#..........#', // 4
	'#..........#', // 5
	'#..........#', // 6
	'#..........#', // 7
	'#..........#', // 8
	'#####::#####', // 9  ボス用ドアウェイ ← 入口フロアから
]);
towerBoss.isBossRoom = true;
towerBoss.enemyDirs = { '1,5': 'down' };

d.layers.dark_tower = {
	name: '暗黒の塔',
	bgm: 'dungeon',
	bossBgm: 'boss',
	bossStage: '0,0',
	stages: { '0,1': towerEntrance, '0,0': towerBoss },
};

writeFileSync(PATH, JSON.stringify(d, null, 2) + '\n');
console.log('done: field 3,0 portal + field 4,0 sky island + dark_tower layer (teleport-based)');

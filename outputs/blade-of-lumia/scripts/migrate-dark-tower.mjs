// Phase 9-2T: 暗黒の塔本格拡張＋終盤動線の再接続
//
// 座標系（game.js:1013-1016 と connectivity.mjs の dlt が一致）:
//   left/right は sx-1/sx+1 ( x 軸: col 方向 )
//   top/bottom は sy-1/sy+1 ( y 軸: row 方向 )
// → フロア内の部屋連結は top/bottom (row0/row9 の開口、sy 変化) を使う。
//   left/right (col0/col11) は sx が変わるので隣フロアに繋がってしまう。
//
// フロア設計（各フロアは同 sx、sy を増やして連結）:
//   B1F: sx=0, sy=1(入口)→2,3,4(寄道) ← row9/row0 で上下接続
//   1F:  sx=1, sy=0(入口)→1,2,3(主軸)→4,5(寄道)
//   2F:  sx=2, sy=0(入口)→1,2,3(主軸)→4,5(寄道)
//   3F:  sx=3, sy=0(入口)→1,2,3(主軸)→4,5(寄道)
//   4F:  sx=4, sy=1(入口)→2,3,4(主軸)
//   玉座: sx=5, sy=0(入口)→1,2(主軸)
//   ボス: sx=0, sy=0 (既存・MAP_ENTER テレポートで 5,2 と繋ぐ)
//
// 実行: node scripts/migrate-dark-tower.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('../work/blade-of-lumia.json', import.meta.url);
const d = JSON.parse(readFileSync(PATH, 'utf8'));

function makeStage(rowStrings, extra = {}) {
	for (const s of rowStrings) {
		if (typeof s !== 'string') throw new Error(`row must be string: ${JSON.stringify(s)}`);
		if (s.length !== 12) throw new Error(`row width 12, got ${s.length}: "${s}"`);
	}
	return {
		cols: 12, rows: rowStrings.length,
		tiles: rowStrings.map(s => s.split('')),
		bgTiles: {}, links: [], enemyDirs: {}, chestContents: {}, objects: {},
		npcData: {}, shopData: {}, mapEnters: {}, showConditions: {}, breakableWalls: {},
		isBossRoom: false, floorItems: {}, signData: {},
		...extra,
	};
}

// ── (pre) バグ①: field/8,1 に空島新設 ──────────────────────────
// cols1-3=到着足場 / cols4-7=虚空SKY(%) / cols8-10=塔ポータル
{
	const skyIsland = makeStage([
		'MMMMMMMMMMMM',
		'M...%%%%...M',
		'M...%%%%...M',
		'M.>.%%%%.>.M', // col2:到着(発射元からの着地), col9:塔入口
		'M...%%%%...M',
		'M...%%%%...M',
		'M...%%%%...M',
		'M.i.%%%%...M',
		'M...%%%%...M',
		'MMMMMMMMMMMM',
	]);
	skyIsland.mapEnters['3,2'] = { id: 'darkTower',     destId: 'fieldToTower' };
	skyIsland.mapEnters['3,9'] = { id: 'islandToTower', destId: 'towerEntrance' };
	skyIsland.signData['7,2'] = {
		name: '古びた石碑',
		lines: [
			'「翼の羽衣をまといし者のみ、虚空を越え暗黒の塔へ至る」',
			'Fキーで空へ舞い上がり、谷を渡れ。',
		],
	};
	d.layers.field.stages['8,1'] = skyIsland;
	console.log('field/8,1: sky island added');
}

// ── (pre) field/8,0 にポータルを追加（空島への入口）──────────────
// destId:'darkTower'=DARK_TOWER_EXIT_ID → hasWingRobe ゲート
{
	const sd = d.layers.field.stages['8,0'];
	if (!sd) throw new Error('field/8,0 not found');
	sd.tiles[3][2] = '>';
	sd.mapEnters = sd.mapEnters ?? {};
	sd.mapEnters['3,2'] = { id: 'fieldToTower', destId: 'darkTower' };
	console.log('field/8,0: portal [3,2] added');
}

// ── (pre) バグ②: 祭壇移設 field/7,14[8,6]→field/7,1[5,5] ────────
{
	const village = d.layers.field.stages['7,14'];
	if (village.tiles[8][6] === '^') {
		village.tiles[8][6] = '.';
		console.log('field/7,14[8,6]: altar removed');
	}
	const north = d.layers.field.stages['7,1'];
	north.tiles[5][5] = '^';
	console.log('field/7,1[5,5]: altar placed');
}

// ── dark_tower メタ ────────────────────────────────────────────
const tower = d.layers.dark_tower;
tower.name    = '暗黒の塔';
tower.bgm     = 'dungeon';
tower.bossBgm = 'boss';
tower.bossStage = '0,0';

// ── B1F: sx=0 ─────────────────────────────────────────────────
// 0,1(入口) →[bottom] 0,2(コンパス/ルピー) →[bottom] 0,3(地図) →[bottom] 0,4(袋小路宝)
// 0,1 は空島からの着地点（towerEntrance）+ B1F→1F 上り階段('>')

{
	const s = tower.stages['0,1'];
	// 石碑「終章」は [1,1] 保持（lore-tablets.spec.js）
	// signData は既存から保持
	s.tiles = [
		'#####>######'.split(''), // row0: 上壁に '>' → 1F テレポート
		'#i.........#'.split(''), // [1,1] 石碑
		'#...E..E...#'.split(''),
		'#..........#'.split(''),
		'#..E....E..#'.split(''),
		'#..........#'.split(''),
		'#....B.....#'.split(''), // 補給チェスト
		'#..........#'.split(''),
		'#..........#'.split(''),
		'#####..#####'.split(''), // row9: 下開口 → 0,2（寄道）
	];
	s.tiles[0][5] = '>';
	s.mapEnters['0,5'] = { id: 'b1fStairsUp', destId: '1fEntrance' };
	s.chestContents['6,5'] = { type: 'item', item: 'redPotion', name: '大回復薬' };
	s.enemyDirs = { '2,4': 'right', '2,7': 'left', '4,3': 'down', '4,8': 'down' };
	// existing towerEntrance mapEnter at 5,5 — keep
	console.log('dark_tower/0,1: B1F entrance revised');
}

{
	// 0,2: コンパス・ルピー（0,1 の下・sy=2）
	const s02 = makeStage([
		'#####..#####', // row0: 上開口 → 0,1
		'#..........#',
		'#....n.....#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#...r..r...#',
		'#..........#',
		'#..........#',
		'#####..#####', // row9: 下開口 → 0,3
	]);
	tower.stages['0,2'] = s02;

	// 0,3: 地図室（0,2 の下・sy=3）
	const s03 = makeStage([
		'#####..#####',
		'#..........#',
		'#....m.....#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#...E..E...#',
		'#..........#',
		'#####..#####', // row9: 下開口 → 0,4
	]);
	s03.enemyDirs = { '7,4': 'left', '7,7': 'right' };
	tower.stages['0,3'] = s03;

	// 0,4: 袋小路宝室（0,3 の下・sy=4）
	const s04 = makeStage([
		'#####..#####',
		'#..........#',
		'#...B..B...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'############', // row9: 閉（袋小路）
	]);
	s04.chestContents['2,4'] = { type: 'item', item: 'redPotion', name: '大回復薬' };
	s04.chestContents['2,7'] = { type: 'item', item: 'coin', amount: 50, name: '大ルピー×50' };
	tower.stages['0,4'] = s04;
	console.log('dark_tower/0,2-0,4: B1F side-rooms added');
}

// ── 1F: 弓の層（sx=1）────────────────────────────────────────
// 1,0(入口) →[bottom]→ 1,1(弓ゲートY→T) →[bottom]→ 1,2(中ボスW+鍵K) →[bottom D扉]→ 1,3(上り→2F)
// 寄道: 1,3→[bottom]→ 1,4 →[bottom]→ 1,5
// 弓ゲート: Y[row8,col9] → T[row4-5,col0] (left辺 sx=0は別フロア)
//   → 代わりに T を row中段の内部壁に置き、Y で対岸の T ゲートを開く
//   → 臨界経路は 1,0→1,1(Yスイッチ→T開放→進める)→1,2(中ボスW)→鍵K→D扉→1,3(上り)
{
	// 1,0: 1F入口（B1F > から来る）
	const s10 = makeStage([
		'#..........#', // row0: 上開口なし（テレポートで入る）
		'#...E..E...#',
		'#..........#',
		'#..E....E..#',
		'#..........#',
		'#..........#',
		'#....>.....#', // row6: B1Fへの戻り '>'
		'#..........#',
		'#..........#',
		'#####..#####', // row9: 下開口 → 1,1
	]);
	s10.tiles[6][4] = '>';
	s10.mapEnters['6,4'] = { id: '1fEntrance', destId: 'b1fStairsUp' };
	s10.enemyDirs = { '1,4': 'right', '1,7': 'left', '3,4': 'down', '3,7': 'down' };
	tower.stages['1,0'] = s10;

	// 1,1: 弓ゲート部屋
	// 弓ゲート: Y スイッチ[row7,col9] を弓で射つ → 内部 T ゲート[row4,col5][row5,col5] が開く
	// 臨界経路は col5 の T で left block → Y 射撃後に通過可能
	const s11 = makeStage([
		'#####..#####', // row0: 上開口 → 1,0
		'#..........#',
		'#..........#',
		'#..........#',
		'#####T.####.',  // row4: col5 に T ゲート（右側: .）
		'#####T.####.',  // row5: 同上
		'#..........#',
		'#.......Y..#', // row7 col9: Y スイッチ
		'#..........#',
		'#####..#####', // row9: 下開口 → 1,2
	]);
	// 弓ゲートは内部 T で経路を塞ぐ構成
	// row4/5: col0-4=壁・col5=T・col6=.（通路）・col7-10=壁・col11=.（開口）
	s11.tiles[4] = '#####T.####.'.split('');
	s11.tiles[5] = '#####T.####.'.split('');
	s11.switchToggles = { '7,9': ['4,5', '5,5'] };
	tower.stages['1,1'] = s11;

	// 1,2: 中ボスW + 鍵K → D扉（下辺→1,3）
	const s12 = makeStage([
		'#####..#####', // row0: 上開口 → 1,1
		'#..........#',
		'#..........#',
		'#....W.....#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#.....K....#',
		'#..........#',
		'#####DD#####', // row9: D扉 → 1,3
	]);
	s12.tiles[9][5] = 'D'; s12.tiles[9][6] = 'D';
	s12.enemyDirs = { '3,5': 'down' };
	tower.stages['1,2'] = s12;

	// 1,3: 上り階段→2F（D扉から来る）+ 寄道接続
	const s13 = makeStage([
		'#####DD#####', // row0: D扉（1,2から来る）
		'#..........#',
		'#...E..E...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#....>.....#', // row8: 上り→2F
		'#####..#####', // row9: 下開口 → 1,4（寄道）
	]);
	s13.tiles[0][5] = 'D'; s13.tiles[0][6] = 'D';
	s13.tiles[8][4] = '>';
	s13.mapEnters['8,4'] = { id: '1fStairsUp', destId: '2fEntrance' };
	s13.enemyDirs = { '2,4': 'right', '2,7': 'left' };
	tower.stages['1,3'] = s13;

	// 1,4: 寄道宝室（1,3の下）
	const s14 = makeStage([
		'#####..#####',
		'#..........#',
		'#...B......#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#####..#####', // 下開口 → 1,5
	]);
	s14.chestContents['2,4'] = { type: 'item', item: 'redPotion', name: '大回復薬' };
	tower.stages['1,4'] = s14;

	// 1,5: 袋小路（大ルピー）
	const s15 = makeStage([
		'#####..#####',
		'#..........#',
		'#...r..r...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'############', // 閉（袋小路）
	]);
	tower.stages['1,5'] = s15;
	console.log('dark_tower/1,0-1,5: 1F bow floor added');
}

// ── 2F: 爆弾＋ロウソクの層（sx=2）──────────────────────────────
// 2,0(入口) →[bottom]→ 2,1(!爆弾壁) →[bottom]→ 2,2(H×3→torchesLit→隠し>→2,3) + 寄道2,3→2,4→2,5
{
	// 2,0: 2F入口
	const s20 = makeStage([
		'############',
		'#..........#',
		'#...E..E...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#....>.....#', // 1F への戻り
		'#..........#',
		'#..........#',
		'#####..#####', // → 2,1
	]);
	s20.tiles[6][4] = '>';
	s20.mapEnters['6,4'] = { id: '2fEntrance', destId: '1fStairsUp' };
	s20.enemyDirs = { '2,4': 'right', '2,7': 'left' };
	tower.stages['2,0'] = s20;

	// 2,1: 爆弾壁（! で通路の一部をブロック）
	// 右辺下段を ! で塞ぐ → 爆弾で壊さないと 2,2 行きの通路が狭い（演出）
	const s21 = makeStage([
		'#####..#####',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#.........!#',
		'#.........!#',
		'#..........#',
		'#####..#####', // → 2,2
	]);
	s21.breakableWalls['6,11'] = true;
	s21.breakableWalls['7,11'] = true;
	tower.stages['2,1'] = s21;

	// 2,2: かがり火の間（H×3 → torchesLit → 隠し '>' → 2,3 テレポート）
	const s22 = makeStage([
		'#####..#####',
		'#..........#',
		'#..H..H..H.#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#####..#####', // → 2,3（寄道）
	]);
	// torchesLit → 隠し '>' → 中ボスV 部屋（2,3）へテレポート
	s22.showConditions['5,5'] = { type: 'torchesLit' };
	s22.mapEnters['5,5'] = { id: '2fCandleGate', destId: '2fMidBoss' };
	tower.stages['2,2'] = s22;

	// 2,3: 中ボスV + 上り階段→3F（2,2 の下・かがり火テレポートの着地点でもある）
	const s23 = makeStage([
		'#####..#####',
		'#....V.....#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#....>.....#', // torchesLit テレポート着地（戻り）
		'#..........#',
		'#..........#',
		'#....>.....#', // 上り→3F
		'#####..#####', // → 2,4（寄道）
	]);
	s23.tiles[5][4] = '>';
	s23.mapEnters['5,4'] = { id: '2fMidBoss', destId: '2fCandleGate' };
	s23.tiles[8][4] = '>';
	s23.mapEnters['8,4'] = { id: '2fStairsUp', destId: '3fEntrance' };
	s23.enemyDirs = { '1,5': 'down' };
	tower.stages['2,3'] = s23;

	// 2,4: 寄道
	const s24 = makeStage([
		'#####..#####',
		'#..........#',
		'#...r......#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#####..#####', // → 2,5
	]);
	tower.stages['2,4'] = s24;

	// 2,5: 袋小路補給室
	const s25 = makeStage([
		'#####..#####',
		'#..........#',
		'#...B......#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'############',
	]);
	s25.chestContents['2,4'] = { type: 'item', item: 'redPotion', name: '大回復薬' };
	tower.stages['2,5'] = s25;
	console.log('dark_tower/2,0-2,5: 2F bomb+candle floor added');
}

// ── 3F: はしご＋笛の層（sx=3）──────────────────────────────────
// 3,0 → 3,1(xPIT橋) → 3,2(笛→3,3テレポート) 寄道:3,3→3,4→3,5
// ⚠️ PIT は飛行でも越えられない（FLYABLE_OVER に PIT なし）
{
	// 3,0: 3F入口
	const s30 = makeStage([
		'############',
		'#..........#',
		'#...E..E...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#....>.....#', // 2F への戻り
		'#..........#',
		'#..........#',
		'#####..#####', // → 3,1
	]);
	s30.tiles[6][4] = '>';
	s30.mapEnters['6,4'] = { id: '3fEntrance', destId: '2fStairsUp' };
	s30.enemyDirs = { '2,4': 'right', '2,7': 'left' };
	tower.stages['3,0'] = s30;

	// 3,1: PIT 橋（x PIT を全幅・col3 に v BRIDGE 1セル）
	const s31 = makeStage([
		'#####..#####',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#xxvxxxxxxx#', // row6: はしご必須 PIT 橋
		'#..........#',
		'#..........#',
		'#####..#####', // → 3,2
	]);
	tower.stages['3,1'] = s31;

	// 3,2: 笛の間（flutePlayed → 隠し '>' → 3,3 テレポート）
	const s32 = makeStage([
		'#####..#####',
		'#..........#',
		'#.i........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#####..#####', // → 3,3（寄道）
	]);
	s32.showConditions['5,5'] = { type: 'flutePlayed' };
	s32.mapEnters['5,5'] = { id: '3fFluteGate', destId: '3fMidBoss' };
	s32.signData['2,2'] = {
		name: '刻まれた文字',
		lines: ['ここで笛を吹けば、先への道が開く。'],
	};
	tower.stages['3,2'] = s32;

	// 3,3: 中ボスV×2 + 上り→4F（3,2 の下・笛テレポート着地）
	const s33 = makeStage([
		'#####..#####',
		'#...V...V..#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#....>.....#', // 笛テレポート着地（戻り）
		'#..........#',
		'#..........#',
		'#....>.....#', // 上り→4F
		'#####..#####', // → 3,4（寄道）
	]);
	s33.tiles[5][4] = '>';
	s33.mapEnters['5,4'] = { id: '3fMidBoss', destId: '3fFluteGate' };
	s33.tiles[8][4] = '>';
	s33.mapEnters['8,4'] = { id: '3fStairsUp', destId: '4fEntrance' };
	s33.enemyDirs = { '1,4': 'down', '1,8': 'down' };
	tower.stages['3,3'] = s33;

	// 3,4: 寄道宝室
	const s34 = makeStage([
		'#####..#####',
		'#..........#',
		'#...B..B...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#####..#####', // → 3,5
	]);
	s34.chestContents['2,4'] = { type: 'item', item: 'redPotion', name: '大回復薬' };
	s34.chestContents['2,7'] = { type: 'item', item: 'coin', amount: 30, name: 'ルピー×30' };
	tower.stages['3,4'] = s34;

	// 3,5: 袋小路（妖精）
	const s35 = makeStage([
		'#####..#####',
		'#..........#',
		'#....f.....#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'############',
	]);
	tower.stages['3,5'] = s35;
	console.log('dark_tower/3,0-3,5: 3F ladder+flute floor added');
}

// ── 4F: 試練の回廊（sx=4）────────────────────────────────────
// 4,1(入口) → 4,2(混在パズル) → 4,3(W×2+鍵K→D扉→4,4) → 4,4(上り→玉座)
{
	// 4,1: 4F入口
	const s41 = makeStage([
		'############',
		'#..........#',
		'#...E..E...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#....>.....#', // 3F への戻り
		'#..........#',
		'#..........#',
		'#####..#####', // → 4,2
	]);
	s41.tiles[6][4] = '>';
	s41.mapEnters['6,4'] = { id: '4fEntrance', destId: '3fStairsUp' };
	s41.enemyDirs = { '2,4': 'right', '2,7': 'left' };
	tower.stages['4,1'] = s41;

	// 4,2: 混在パズル（弓Y・爆弾!・はしごx・ロウソクH）
	const s42 = makeStage([
		'#####..#####',
		'#..H...H...#',
		'#...!......#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#.xxx.v....#', // PIT×3 + BRIDGE
		'#.......Y..#', // Y スイッチ
		'#..........#',
		'#####..#####', // → 4,3
	]);
	s42.breakableWalls['2,4'] = true;
	s42.switchToggles = { '7,9': ['6,2', '6,3', '6,4'] };
	tower.stages['4,2'] = s42;

	// 4,3: W×2 + 鍵K → D扉（下辺→4,4）
	const s43 = makeStage([
		'#####..#####',
		'#..W...W...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#.....K....#',
		'#..........#',
		'#####DD#####', // D扉 → 4,4
	]);
	s43.tiles[9][5] = 'D'; s43.tiles[9][6] = 'D';
	s43.enemyDirs = { '1,3': 'down', '1,7': 'down' };
	tower.stages['4,3'] = s43;

	// 4,4: 最終補給 + 上り→玉座
	const s44 = makeStage([
		'#####DD#####', // D扉（4,3から来る）
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#...B......#', // 最終補給
		'#..........#',
		'#....>.....#', // 上り→玉座フロア
		'############', // 閉（袋小路）
	]);
	s44.tiles[0][5] = 'D'; s44.tiles[0][6] = 'D';
	s44.tiles[8][4] = '>';
	s44.mapEnters['8,4'] = { id: '4fStairsUp', destId: 'throneEntrance' };
	s44.chestContents['6,4'] = { type: 'item', item: 'redPotion', name: '大回復薬' };
	tower.stages['4,4'] = s44;
	console.log('dark_tower/4,1-4,4: 4F trial corridor added');
}

// ── 玉座フロア（sx=5）────────────────────────────────────────
// 5,0(入口) → 5,1(控えの間) → 5,2(ボス前室→0,0テレポート)
{
	// 5,0: 玉座入口
	const s50 = makeStage([
		'############',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#....>.....#', // 4F への戻り
		'#..........#',
		'#..........#',
		'#####..#####', // → 5,1
	]);
	s50.tiles[6][4] = '>';
	s50.mapEnters['6,4'] = { id: 'throneEntrance', destId: '4fStairsUp' };
	tower.stages['5,0'] = s50;

	// 5,1: 控えの間（看板）
	const s51 = makeStage([
		'#####..#####',
		'#..........#',
		'#.....i....#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#####..#####', // → 5,2
	]);
	s51.signData['2,6'] = {
		name: 'ザーネルの声',
		lines: [
			'よく来た、勇者よ。',
			'この先に 私が待つ。',
			'共に ここで 終わりにしよう。',
		],
	};
	tower.stages['5,1'] = s51;

	// 5,2: ボス前室（MAP_ENTER テレポートで 0,0 へ）
	const s52 = makeStage([
		'#####..#####',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#.....>.....#'.slice(0, 12),
		'############', // 閉（袋小路）
	]);
	s52.tiles[8][5] = '>';
	s52.mapEnters['8,5'] = { id: 'bossApproach', destId: 'towerBossRoom' };
	tower.stages['5,2'] = s52;
	console.log('dark_tower/5,0-5,2: throne floor added');
}

// ── ボス部屋 0,0 改修 ──────────────────────────────────────────
// ザーネル Z[1,5]・下辺 ':' [9,5][9,6] は既存のまま。
// 5,2 の bossApproach → 0,0 の towerBossRoom で着地（row8,col5）。
{
	const boss = tower.stages['0,0'];
	boss.tiles[8][5] = '>';
	boss.mapEnters['8,5'] = { id: 'towerBossRoom', destId: 'bossApproach' };
	console.log('dark_tower/0,0: boss entrance wired');
}

// ── 保存 ──────────────────────────────────────────────────────────
writeFileSync(PATH, JSON.stringify(d, null, 2) + '\n');

const stageCount = Object.keys(tower.stages).length;
console.log(`\ndone: dark_tower has ${stageCount} stages`);
console.log('field: 8,1 sky island, 8,0 portal, 7,14 altar removed, 7,1 altar placed');

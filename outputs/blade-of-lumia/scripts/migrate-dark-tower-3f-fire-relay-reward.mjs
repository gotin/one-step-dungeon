// dark_tower 3F：重複室 `3,4` と空室 `3,5` を「淵の環」＋「淵の火渡り」に作り替える
// （2026-09-23 / PLAN 実行キュー 20b ④の残り／設計は Opus）。
//
// ■ 何が壊れていたか（棚卸し⑫⑦・着手前に現物で再確認）
//   ・`3,4` ＝外周が壁だけの素の箱に宝箱2つ（回復薬（大） 2,4 ／ルピー×30 2,7）。
//     塔に同じ盤面の部屋が複数あり（⑫の重複室）、かつ塔の回復薬（大）は5室に残っていて
//     不変条件(e)「塔の回復薬（大）は3室以下」に反していた。
//   ・`3,5` ＝3F の行き止まり。柵 `f`(2,5) が1枚あるだけの空室（⑦の空室）。
//     入る理由も、地形の意味も無かった。
//
// ■ PLAN の旧記述（699行）との違い＝ここで**書き換える**
//   PLAN には「`3,4`／`3,5` は『穴の島に渡って取る宝』＝はしごの寄り道に作り替える」と
//   書いてあったが、それは**この番で既に出荷した 1F `1,5`「小島の射手」と同じ形**
//   （穴の海＋只中に1マスの小島＋幅1の穴をはしごで渡る）。そのまま作ると 20b が
//   潰そうとしている⑫の重複を自分で作り直すことになる∴設計を差し替える。
//
// ■ 新しい機構
//   `3,4`＝**淵の環**。部屋の只中に 6×4 の淵（穴・cols3-8／rows3-6）を掘り、幅2の環の
//     回廊だけを残す。北の入口（1,5/1,6）から南の出口（8,5/8,6）へは**西回りか東回り**の
//     どちらかを選ぶ＝一本道の素の箱をやめる。淵は**どこも幅2以上∴はしごでは渡れない**
//     （`isLadderBridgeCell` は「幅1の穴に両岸が land」でだけ成立する）＝次の `3,5` が
//     依存する事実（広い淵は渡れない）をここで体で覚える。
//     西回りに宝箱（ルピー×30・`8,1`）と突進猪 ω(8,4)、東回りに骸骨剣士 θ(4,9)。
//     回復薬（大）の宝箱は撤去＝不変条件(e) の第二歩（5室→4室）。
//   `3,5`＝**淵の火渡り**。東と南を淵にし、淵の上に**かがり火2枚を横並び**に置く
//     （`4,7`＝`initLitTorches` で最初から点いている火元／`4,8`＝消えている）。
//     row4 に立って東を向いて**ブーメランを投げる**と、往路で `4,7` の炎を拾い（`flaming`）、
//     続く `4,8` に点火する＝`torchesLit`（部屋の 'H' が全部点く）が満ちて、
//     西の窪みの封印の宝箱 B(4,3) が現れる。中身は **矢筒（2つめ・矢の上限 +8）**。
//
//   ほかの手が通らない理由（すべて実装を裏取り済み）：
//   ・ロウソク＝`playCandle`（`game/game.js:1736`）は**前方1セルの 'H'** しか点けない。
//     `4,8` の上下左右は `4,7`（かがり火＝通行不可）と穴3枚∴**隣に立てる床が無い**。
//   ・はしご＝淵はどの向きにも幅2以上∴`isLadderBridgeCell`（`scripts/lib/connectivity.mjs:115`）
//     が成立するセルが1枚も無い（このスクリプトで「はしご有無で到達セルが同一」を実測する）。
//   ・翼の羽衣＝`FLYABLE_OVER` に PIT は入っていない（`game/passable.js`）∴淵は飛べない。
//   ・矢・剣ビーム・爆弾＝`litTorches` に触るのは `playCandle` と
//     `collectAlongBoomerang`（`game/projectile.js:556`）の2箇所だけ∴火は点かない。
//   ・敵のブーメラン（π ブーメラン鬼）＝`collects = proj.owner === 'player'`
//     （`game/projectile.js:458`）∴**敵の投擲では火が点かない**（ギミックを敵に解かせない）。
//   ・笛＝この部屋に `fluteEffect` は無い。
//
//   `2,2`（2F・ハートの器）との違い＝あちらも `torchesLit` だが、かがり火3枚が広間の床に
//   並んでいて**ロウソクで歩いて点ける**部屋（`initLitTorches` 無し＝火元が無い）。
//   こちらは火元が淵の中に在り、**炎をブーメランで運ぶ**ことしか許さない∴同じ引き金でも
//   要求する道具と所作が違う（1F の `switchOn` を `1,1` と `1,5` で撃ち分けたのと同じ観点）。
//
// ■ 報酬に矢筒（2つめ）を選んだ理由
//   装備の等級（剣・盾・鎧・ブーメラン）は世界に全部配置済み、地図と羅針盤は塔に在り、
//   ハートの器は「塔で唯一＝2F」と決めてある（DECISIONS 2026-09-23）。残る受け皿は
//   `giveSubItem` の加算型2つ（矢筒 +8／爆弾袋 +8）だけ。爆弾は補給が固定の山2つと
//   宝箱1つで上限8をほぼ超えない（PLAN 739行）∴袋の2つめは空砲になる。矢は雑魚ドロップと
//   矢束10本で上限に張り付く＝2つめでも効く。最終戦（ザーネル＝分身2〜4体＋石つぶて
//   range7）で遠隔の手数が要ることも理に合う。⚠️ ここはユーザー判定で覆せる選択
//   （銀のブーメランは `field 12,19` で入手済みなら下位無視の空砲になるので採らない）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・両室の盤面／境界の開きが不変／`3,4` の回復薬（大）が消えている
//   ・`3,5` のかがり火が2枚・`initLitTorches` が火元1枚だけ・封印が `torchesLit`・
//     宝が矢筒・死んだ `message` を書いていない・看板ゼロ（'i' も signData も）
//   ・**火渡りの実測**（`collectAlongBoomerang` と同じ規則＝'#'/'!' で止まり、点いた 'H' で
//     `flaming`、消えた 'H' に点火）：立てる床から `4,8` に火を点けられる射線を列挙する。
//     対照実験3つ＝①火元 `4,7` を消すと0本 ②`4,7` を壁にすると0本
//     ③無関係な床を壁で潰しても本数が変わらない（測れている証明）
//   ・ロウソクが通らない＝`4,8` に隣接する「立てる床」が0マス
//   ・はしごが通らない＝はしご有無で到達セルが完全一致（淵はどこも渡れない）
//   ・部屋単独のソルバー：火元ありで**全かがり火点灯まで到達**／`noTools` では到達しない／
//     入って詰む状態が0（`3,4` の環も同じく0）
//   ・塔全体の BFS：全ゲート開＝30/30 室（本道を動かしていない）／宝箱のセルは道具なしで踏める
//   ・脅威度：2F < 3F を保ち、塔の非ボス合計が上限 709.8（=591.5×1.2）以下
//   ・報酬の棚卸し：矢筒2個・爆弾袋1個・塔の回復薬（大）5室→4室・ハートの器1個
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-3f-fire-relay-reward.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-3f-fire-relay-reward.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer, isLadderBridgeCell } from './lib/connectivity.mjs';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';
import { ENEMY_META } from '../shared/enemies.js';
import { BOOMERANG_TIERS } from '../shared/items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const RING  = '3,4';   // 淵の環
const RELAY = '3,5';   // 淵の火渡り

// `3,4`
const OLD_POTION = '2,4';   // 撤去する回復薬（大）の宝箱
const OLD_RUPEE  = '2,7';   // 移設するルピー×30
const RING_CHEST = '8,1';   // 移設先（西回りの南端）
const RING_DIRS  = { '4,9': 'up', '8,4': 'left' };   // θ 骸骨剣士／ω 突進猪（sideView∴左右）

// `3,5`
const LIT     = '4,7';   // 火元のかがり火（initLitTorches）
const UNLIT   = '4,8';   // 点ける相手
const RELAY_CHEST = '4,3';   // 封印の宝箱（西の窪み）
const THROW_SPOTS = ['4,5', '4,6'];   // 木のブーメラン（maxRange 3）でも届く投擲位置
const RELAY_DIRS  = { '2,2': 'right' };   // π ブーメラン鬼

const RING_TARGET = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..xxxxxx..#',
	'#..xxxxxx.θ#',
	'#..xxxxxx..#',
	'#..xxxxxx..#',
	'#..........#',
	'#B..ω......#',
	'#####..#####',
];
const RING_BEFORE = [
	'#####..#####',
	'#..........#',
	'#...B..B...#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

const RELAY_TARGET = [
	'#####..#####',
	'#......xxxx#',
	'#.π....xxxx#',
	'#..#...xxxx#',
	'#.#B...HHxx#',
	'#..#...xxxx#',
	'#......xxxx#',
	'#xxxxxxxxxx#',
	'#xxxxxxxxxx#',
	'############',
];
const RELAY_BEFORE = [
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
];

const RING_CHEST_CONTENT  = { type: 'rupee', value: 30, name: 'ルピー×30' };
const RELAY_COND    = { trigger: 'torchesLit' };
const RELAY_CONTENT = { type: 'item', item: 'quiver', name: '矢筒' };

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const edgeSig = (st) => {
	const rows = rowsOf(st);
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[st.rows - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[st.cols - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
};

const ring  = stages[RING];
const relay = stages[RELAY];
ok(ring, `${RING} が無い`);
ok(relay, `${RELAY} が無い`);
for (const [k, st] of [[RING, ring], [RELAY, relay]]) {
	ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray),
		`${k} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
	ok(st.rows === ROWS && st.cols === COLS, `${k} の寸法が想定外: ${st.rows}x${st.cols}`);
}

const beforeRows = { [RING]: rowsOf(ring), [RELAY]: rowsOf(relay) };
const edgesBefore = { [RING]: edgeSig(ring), [RELAY]: edgeSig(relay) };

// ──────────────────────────────────────────────────────────────────────
// ① `3,4`＝淵の環（幅2の回廊を西回り／東回りに選ぶ・淵は渡れない）
// ──────────────────────────────────────────────────────────────────────
if (beforeRows[RING].join('\n') === RING_TARGET.join('\n')) {
	step('=', `${RING} の盤面は既に狙いどおり`);
} else {
	for (let r = 0; r < RING_BEFORE.length; r++) {
		ok(beforeRows[RING][r] === RING_BEFORE[r],
			`${RING} row${r} が旧盤面と違う: '${beforeRows[RING][r]}' 期待 '${RING_BEFORE[r]}'`);
	}
	ring.tiles = RING_TARGET.map((row) => [...row]);
	step('✔', `${RING} を作り替えた（素の箱 → 6×4 の淵を囲む幅2の環・`
		+ `西回りに宝箱 B(${RING_CHEST}) と ω(8,4)・東回りに θ(4,9)）`);
}

{
	const cc = ring.chestContents ?? (ring.chestContents = {});
	if (cc[OLD_POTION]) {
		const gone = JSON.stringify(cc[OLD_POTION]);
		delete cc[OLD_POTION];
		step('✔', `${RING} の chestContents[${OLD_POTION}] を削除: ${gone}`
			+ '（不変条件(e)＝塔の回復薬（大）を5室→4室）');
	} else step('=', `${RING} に回復薬（大）の登録は無い`);

	if (cc[OLD_RUPEE]) {
		delete cc[OLD_RUPEE];
		step('✔', `${RING} の chestContents[${OLD_RUPEE}] を (${RING_CHEST}) へ移した（西回りの報酬）`);
	}
	if (JSON.stringify(cc[RING_CHEST]) === JSON.stringify(RING_CHEST_CONTENT)) {
		step('=', `${RING} の宝の中身は既に狙いどおり`);
	} else {
		ok(cc[RING_CHEST] === undefined,
			`${RING} の chestContents[${RING_CHEST}] が既に在る: ${JSON.stringify(cc[RING_CHEST])}`);
		cc[RING_CHEST] = { ...RING_CHEST_CONTENT };
		step('✔', `${RING} の宝の中身＝ルピー×30（${RING_CHEST}・旧 ${OLD_RUPEE} から移設）`);
	}
}

{
	const ed = ring.enemyDirs ?? (ring.enemyDirs = {});
	for (const [cell, dir] of Object.entries(RING_DIRS)) {
		if (ed[cell] === dir) { step('=', `${RING} の enemyDirs[${cell}]=${dir} は既に狙いどおり`); continue; }
		ed[cell] = dir;
		step('✔', `${RING} の enemyDirs[${cell}]=${dir}`);
	}
	// ⚠️ ω 突進猪は `sideView: true`＝横向きの絵しか持たない（ENEMY-DIRECTIONAL-GUIDE §6-6）
	//    ∴初期の向きは left/right のどちらかにする（up/down を置くと絵と向きが食い違う）。
	const boar = ENEMY_META['ω'];
	ok(boar?.sideView === true, 'ω が sideView でなくなった＝向きの前提を見直す');
	ok(RING_DIRS['8,4'] === 'left' || RING_DIRS['8,4'] === 'right',
		'sideView の ω に up/down を与えている');
}

ring.comment = '[dark_tower 3,4] 淵の環（キュー20b ④・2026-09-23）。只中に 6×4 の淵'
	+ '（cols3-8／rows3-6）を掘り、幅2の環の回廊だけを残した＝北の入口から南の出口へは'
	+ '西回りと東回りのどちらかを選ぶ（旧構成は外周が壁だけの素の箱＋宝箱2つ＝棚卸し⑫の重複室）。'
	+ '淵はどの向きにも幅2以上∴はしごでは渡れない（isLadderBridgeCell は「幅1の穴に両岸が land」'
	+ 'でだけ成立する）＝**南隣 3,5 の火渡りが依存する事実（広い淵は渡れない）をここで体で覚える**。'
	+ '西回りに宝箱（ルピー×30・8,1）と突進猪 ω(8,4)＝row8 を東西に突進して宝への道を塞ぐ'
	+ '（ω は sideView∴enemyDirs は left/right のどちらか）。東回りに骸骨剣士 θ(4,9)＝'
	+ '幅2の回廊なので隣の列をすり抜けて避けられる。回復薬（大）の宝箱 B(2,4) は撤去した'
	+ '＝不変条件(e)（塔の回復薬（大）は3室以下）に向けた第二歩（5室→4室・残りはキュー20b ⑤）。';

// ──────────────────────────────────────────────────────────────────────
// ② `3,5`＝淵の火渡り（ブーメランで炎を運ぶ→torchesLit→封印の矢筒）
// ──────────────────────────────────────────────────────────────────────
if (beforeRows[RELAY].join('\n') === RELAY_TARGET.join('\n')) {
	step('=', `${RELAY} の盤面は既に狙いどおり`);
} else {
	for (let r = 0; r < RELAY_BEFORE.length; r++) {
		ok(beforeRows[RELAY][r] === RELAY_BEFORE[r],
			`${RELAY} row${r} が旧盤面と違う: '${beforeRows[RELAY][r]}' 期待 '${RELAY_BEFORE[r]}'`);
	}
	relay.tiles = RELAY_TARGET.map((row) => [...row]);
	step('✔', `${RELAY} を作り替えた（柵1枚の空室 → 東と南を淵にし、淵の上にかがり火2枚`
		+ `（火元 ${LIT}／消えた ${UNLIT}）・西の窪みに封印の宝箱 B(${RELAY_CHEST})）`);
}

{
	const cur = JSON.stringify(relay.initLitTorches ?? null);
	if (cur === JSON.stringify([LIT])) {
		step('=', `${RELAY} の initLitTorches は既に狙いどおり`);
	} else {
		ok(relay.initLitTorches === undefined || relay.initLitTorches.length === 0,
			`${RELAY} の initLitTorches が既に在る: ${cur}`);
		relay.initLitTorches = [LIT];
		step('✔', `${RELAY} の initLitTorches=[${LIT}]（火元＝最初から点いているかがり火）`);
	}
}

{
	const sc = relay.showConditions ?? (relay.showConditions = {});
	if (JSON.stringify(sc[RELAY_CHEST]) === JSON.stringify(RELAY_COND)) {
		step('=', `${RELAY} の封印条件は既に狙いどおり`);
	} else {
		ok(sc[RELAY_CHEST] === undefined,
			`${RELAY} の showConditions[${RELAY_CHEST}] が既に在る: ${JSON.stringify(sc[RELAY_CHEST])}`);
		sc[RELAY_CHEST] = { ...RELAY_COND };
		step('✔', `${RELAY} に封印条件を書いた（torchesLit＝部屋の 'H' が全部点く）`);
	}
}

{
	const cc = relay.chestContents ?? (relay.chestContents = {});
	if (JSON.stringify(cc[RELAY_CHEST]) === JSON.stringify(RELAY_CONTENT)) {
		step('=', `${RELAY} の宝の中身は既に狙いどおり`);
	} else {
		ok(cc[RELAY_CHEST] === undefined, `${RELAY} の chestContents[${RELAY_CHEST}] が既に在る`);
		cc[RELAY_CHEST] = { ...RELAY_CONTENT };
		step('✔', `${RELAY} の宝の中身＝矢筒（2つめ・矢の上限 +8）`);
	}
}

{
	const ed = relay.enemyDirs ?? (relay.enemyDirs = {});
	for (const [cell, dir] of Object.entries(RELAY_DIRS)) {
		if (ed[cell] === dir) { step('=', `${RELAY} の enemyDirs[${cell}]=${dir} は既に狙いどおり`); continue; }
		ed[cell] = dir;
		step('✔', `${RELAY} の enemyDirs[${cell}]=${dir}`);
	}
}

relay.comment = '[dark_tower 3,5] 淵の火渡り＝ブーメランで炎を運ぶ寄道（キュー20b ④・2026-09-23）。'
	+ '東（cols7-10）と南（rows7-8）を淵にし、淵の上にかがり火2枚を横並びに置いた'
	+ '＝4,7 は initLitTorches で最初から点いている火元、4,8 は消えている。row4 に立って'
	+ '東へブーメランを投げると往路で 4,7 の炎を拾い（proj.flaming）、続く 4,8 に点火する'
	+ '（game/projectile.js collectAlongBoomerang）＝showConditions {trigger:\'torchesLit\'} が'
	+ '満ちて西の窪みの封印の宝箱 B(4,3) が現れる。中身は矢筒（2つめ・矢の上限 +8）。'
	+ 'ほかの手は通らない＝ロウソクは前方1セルしか点けないが 4,8 の隣に立てる床が無い／'
	+ '淵はどこも幅2以上ではしごが成立しない／PIT は FLYABLE_OVER に無いので飛べない／'
	+ '矢・剣ビーム・爆弾は litTorches に触らない／敵のブーメラン（π 2,2）は'
	+ 'collects = owner===\'player\' の外なので火を運べない。2F 2,2 の torchesLit との違い＝'
	+ 'あちらは火元が無くロウソクで歩いて3枚点ける部屋、こちらは火元が淵の中でブーメラン専用。'
	+ '旧構成は柵 f(2,5) が1枚だけの空室（棚卸し⑦）。⚠️ 開封の文は書かない'
	+ '＝showConditions[cell].message は bossYielded しか読まない死んだデータ。'
	+ '⚠️ 看板も置かない（ユーザー判定 2026-09-23＝最終盤の塔にヒント看板は要らない）。';

// ──────────────────────────────────────────────────────────────────────
// ③ 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

const at = (st, cell) => { const [r, c] = cell.split(',').map(Number); return st.tiles[r][c]; };
const countCh = (st, ch) => rowsOf(st).reduce((n, row) => n + [...row].filter((x) => x === ch).length, 0);

// 盤面・データ
{
	check(`${RING} の盤面が狙いどおり`, rowsOf(ring).join('\n') === RING_TARGET.join('\n'));
	check(`${RELAY} の盤面が狙いどおり`, rowsOf(relay).join('\n') === RELAY_TARGET.join('\n'));

	check(`${RING} の宝箱が (${RING_CHEST}) の1枚だけ`,
		at(ring, RING_CHEST) === 'B' && countCh(ring, 'B') === 1);
	check(`${RING} の宝の中身がルピー×30`,
		ring.chestContents?.[RING_CHEST]?.type === 'rupee'
		&& ring.chestContents[RING_CHEST].value === 30);
	check(`${RING} に回復薬（大）が残っていない`,
		!Object.values(ring.chestContents ?? {}).some((cc) => cc?.item === 'bigHealPotion'));
	check(`${RING} の chestContents が宝箱の枚数と一致（幽霊の登録が無い）`,
		Object.keys(ring.chestContents ?? {}).length === 1);
	check(`${RING} の enemyDirs が ω/θ の2体分だけ`,
		JSON.stringify(ring.enemyDirs) === JSON.stringify(RING_DIRS));
	check(`${RING} に封印も看板も無い（素の環）`,
		Object.keys(ring.showConditions ?? {}).length === 0
		&& Object.keys(ring.signData ?? {}).length === 0 && countCh(ring, 'i') === 0);

	check(`${RELAY} のかがり火が (${LIT}) (${UNLIT}) の2枚だけ`,
		at(relay, LIT) === 'H' && at(relay, UNLIT) === 'H' && countCh(relay, 'H') === 2);
	check(`${RELAY} の initLitTorches が火元1枚だけ（実測 ${JSON.stringify(relay.initLitTorches)}）`,
		JSON.stringify(relay.initLitTorches) === JSON.stringify([LIT]));
	check(`${RELAY} の宝箱が 'B'(${RELAY_CHEST})・1枚だけ`,
		at(relay, RELAY_CHEST) === 'B' && countCh(relay, 'B') === 1);
	check(`${RELAY} の封印条件が torchesLit`,
		relay.showConditions?.[RELAY_CHEST]?.trigger === 'torchesLit');
	check(`${RELAY} の封印に死んだ message を書いていない（bossYielded 専用）`,
		relay.showConditions?.[RELAY_CHEST]?.message === undefined);
	check(`${RELAY} の宝の中身が矢筒`, relay.chestContents?.[RELAY_CHEST]?.item === 'quiver');
	check(`${RELAY} に看板が1枚も無い（'i' タイルも signData も）`,
		countCh(relay, 'i') === 0 && Object.keys(relay.signData ?? {}).length === 0);
	check(`${RELAY} の links が空・switchToggles を生やしていない`,
		(relay.links?.length ?? 0) === 0 && relay.switchToggles === undefined);
	check(`${RELAY} に fluteEffect が無い（笛で解けない）`, relay.fluteEffect === undefined);
	// 柵は撤去した＝「柵だけの空室」の跡を残さない
	check(`${RELAY} に柵 'f' が残っていない`, countCh(relay, 'f') === 0);
}

// 境界の開き＝部屋間の接続を動かしていない
for (const k of [RING, RELAY]) {
	const now = edgeSig(stages[k]);
	check(`${k} の境界の開きが不変（${edgesBefore[k]} → ${now}）`, now === edgesBefore[k]);
}

// ── 塔全体の到達（本道を動かしていない）＋ はしごの効き ────────────────────
const TOWER_START = { stage: '0,1', row: 5, col: 5 };   // field から着く塔の入口
/** 塔の入口から BFS する。`patch` は `{ 'stage:cell': ch }` で盤面を差し替える（対照実験）。 */
function reach(patch = {}, { withLadder = true } = {}) {
	const clone = structuredClone(stages);
	for (const [key, ch] of Object.entries(patch)) {
		const [stage, cell] = key.split(':');
		const [r, c] = cell.split(',').map(Number);
		clone[stage].tiles[r][c] = ch;
	}
	const res = bfsLayer(clone, TOWER_START, {
		withLadder, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const rooms = new Set([...res.reachedCells].map((k) => k.split(':')[0]));
	const cellsOf = (stage) => [...res.reachedCells]
		.filter((k) => k.startsWith(`${stage}:`)).map((k) => k.split(':')[1]).sort();
	return { rooms, cellsOf, tilesOf: (stage) => clone[stage].tiles.map((r) => r.join('')) };
}

const withL = reach();
{
	check(`全ゲート開＝塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${withL.rooms.size}）`,
		withL.rooms.size === Object.keys(stages).length);
	// ⚠️ 塔の入口からの BFS を「はしご無し」で測っても 3F には**そもそも入れない**
	//    （3F の必須関門 3,1 がはしごの関門＝この番の③で作った）∴はしごの効き目は
	//    部屋の中だけで測る（下の roomCells／isLadderBridgeCell）。
	// `3,4` の環＝西回りと東回りの両方が通じている（片方を壁で塞いでも南の出口に届く）
	const westCut = reach({ [`${RING}:4,1`]: '#', [`${RING}:4,2`]: '#' });
	const eastCut = reach({ [`${RING}:4,9`]: '#', [`${RING}:4,10`]: '#' });
	check(`${RING} の環：西回りを塞いでも東回りで南の出口 (8,5) に届く`,
		westCut.cellsOf(RING).includes('8,5'));
	check(`${RING} の環：東回りを塞いでも西回りで南の出口 (8,5) に届く`,
		eastCut.cellsOf(RING).includes('8,5'));
	// 対照実験＝両方塞ぐと南へ抜けられない（上の2つが空振りでない証明）
	const bothCut = reach({
		[`${RING}:4,1`]: '#', [`${RING}:4,2`]: '#', [`${RING}:4,9`]: '#', [`${RING}:4,10`]: '#',
	});
	check(`対照実験：${RING} の環を両側で塞ぐと南の出口に届かない（実測 ${bothCut.rooms.size} 室）`,
		!bothCut.cellsOf(RING).includes('8,5'));
}

// ── 部屋の中で歩ける床（ソルバーの状態空間から座標だけ抜く）────────────────
function roomCells(stageKey, { noTools = false, litInit = new Set(), tiles: override = null } = {}) {
	const st = stages[stageKey];
	const tiles = (override ?? st.tiles).map((r) => [...r]);
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const S = makeSolver(tiles, bg, [], {}, litInit,
		{ noTools, hasLadder: !noTools, pitCrossable: true });
	const seen = new Set();
	const queue = ['1,5', '1,6'].map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	for (const s of queue) seen.add(s);
	for (let i = 0; i < queue.length; i++) {
		for (const nx of S.nextStates(queue[i])) {
			if (seen.has(nx)) continue;
			seen.add(nx); queue.push(nx);
		}
	}
	return [...new Set([...seen].map((s) => s.split('|')[0]))].sort();
}

// ── はしごが通らない（淵はどこも幅2以上）────────────────────────────────
{
	check(`${RELAY} の宝箱 (${RELAY_CHEST}) は道具なしでも踏める（封印は踏めても開かないだけ）`,
		roomCells(RELAY, { noTools: true }).includes(RELAY_CHEST));

	for (const k of [RING, RELAY]) {
		const st = stages[k];
		const bridges = [];
		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS; c++) {
				if (st.tiles[r][c] !== 'x') continue;
				if (isLadderBridgeCell(st.tiles, ROWS, COLS, r, c, st.bgTiles)) bridges.push(`${r},${c}`);
			}
		}
		check(`${k} の淵にはしごで渡れる穴が1枚も無い（実測: ${bridges.join(' ') || 'なし'}）`,
			bridges.length === 0);
		// はしごの有無で歩ける床が1マスも変わらない（上の判定を歩行でも裏取り）
		const a = roomCells(k).join(' ');
		const b = roomCells(k, { noTools: true }).join(' ');
		check(`${k} はしご有無で歩ける床が同一（${roomCells(k).length} マス）`, a === b);
	}
	// 対照実験＝淵を幅1に狭めると isLadderBridgeCell が成立する（測れている証明）
	// `3,5` の row1 を「col7 だけ穴・col8 以降を床」に書き換えると (1,7) は
	// 「幅1の穴に両岸が床」になる∴はしごで渡れる穴として検出されなければ歯が無い。
	{
		const narrowed = RELAY_TARGET.map((row) => [...row]);
		for (const c of [8, 9, 10]) narrowed[1][c] = '.';
		check('対照実験：淵を幅1に狭めると (1,7) がはしごで渡れる穴として検出される',
			isLadderBridgeCell(narrowed, ROWS, COLS, 1, 7, relay.bgTiles));
	}
}

// ── 火渡りの実測（`collectAlongBoomerang` と同じ規則）──────────────────────
// 投擲物は '#' と未破壊の '!' だけで止まる（`isTilePassableForProj`）。通過セルが 'H' なら
// 点いていれば炎を拾い（flaming）、消えていて flaming なら点火する。往路・復路の両方で
// 起きるが、ここでは往路だけで測る（上界でなく「実際に往路で点く」ことを見たい）。
/**
 * `from` の各セルから4方向へブーメランを投げ、`target` のかがり火に点火できる射線を列挙。
 * `maxRange` を渡すと「投げた本人から maxRange マス以内」に絞る（木のブーメラン＝3）。
 */
function flameLanes(tiles, from, target, litInit, { maxRange = Infinity } = {}) {
	const DIRS = [[-1, 0, '北'], [1, 0, '南'], [0, -1, '西'], [0, 1, '東']];
	const blocked = (r, c) => {
		const ch = tiles[r]?.[c];
		return ch === undefined || ch === '#' || ch === '!';
	};
	const hits = [];
	for (const cell of from) {
		const [r0, c0] = cell.split(',').map(Number);
		for (const [dr, dc, name] of DIRS) {
			let flaming = false;
			for (let i = 1; i <= maxRange; i++) {
				const r = r0 + dr * i, c = c0 + dc * i;
				if (blocked(r, c)) break;
				const key = `${r},${c}`;
				if (tiles[r][c] === 'H') {
					if (litInit.has(key)) flaming = true;
					else if (flaming && key === target) { hits.push(`${cell}→${name}`); break; }
				}
			}
		}
	}
	return hits.sort();
}

{
	const stand = withL.cellsOf(RELAY);
	const tiles = RELAY_TARGET;
	const lit = new Set([LIT]);

	// ロウソクが通らない＝消えたかがり火の隣に立てる床が1マスも無い
	const [ur, uc] = UNLIT.split(',').map(Number);
	const around = [[ur - 1, uc], [ur + 1, uc], [ur, uc - 1], [ur, uc + 1]]
		.map(([r, c]) => `${r},${c}`).filter((k) => stand.includes(k));
	check(`消えたかがり火 (${UNLIT}) の隣に立てる床が1マスも無い（ロウソクでは点けられない`
		+ `・実測: ${around.join(' ') || 'なし'}）`, around.length === 0);

	const lanes = flameLanes(tiles, stand, UNLIT, lit);
	check(`火を運べる射線が在る（実測 ${lanes.length}本: ${lanes.join(' ') || 'なし'}）`,
		lanes.length > 0);
	check(`火を運べる射線はすべて row4 から東（実測: ${lanes.join(' ')}）`,
		lanes.length > 0 && lanes.every((l) => /^4,\d+→東$/.test(l)));

	// 木のブーメラン（最弱・maxRange 3）でも届く投擲位置が在る
	const woodRange = BOOMERANG_TIERS[0].maxRange;
	const woodLanes = flameLanes(tiles, stand, UNLIT, lit, { maxRange: woodRange });
	check(`木のブーメラン（maxRange ${woodRange}）でも点けられる（実測: ${woodLanes.join(' ') || 'なし'}）`,
		woodLanes.length > 0);
	for (const spot of THROW_SPOTS) {
		check(`木のブーメランで (${spot}) から点けられる`, woodLanes.includes(`${spot}→東`));
	}

	// 対照実験①＝火元を消すと0本（炎の受け渡しが効いている証明）
	check(`対照実験：火元 (${LIT}) を消すと点けられる射線が0本`,
		flameLanes(tiles, stand, UNLIT, new Set()).length === 0);
	// 対照実験②＝火元を壁で潰すと0本（潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
	const killLit = reach({ [`${RELAY}:${LIT}`]: '#' });
	check(`対照実験：火元 (${LIT}) を壁にすると点けられる射線が0本`,
		flameLanes(killLit.tilesOf(RELAY), killLit.cellsOf(RELAY), UNLIT, lit).length === 0);
	// 対照実験③＝無関係な床を壁で潰しても本数は変わらない（測定が過敏でない証明）
	const killFar = reach({ [`${RELAY}:1,1`]: '#' });
	check(`対照実験：無関係な床 (1,1) を壁にしても射線の本数は変わらない`,
		flameLanes(killFar.tilesOf(RELAY), killFar.cellsOf(RELAY), UNLIT, lit).length === lanes.length);
}

// ── 部屋単独のソルバー（状態空間）──────────────────────────────────────
function solveRoom(stageKey, { noTools = false, litInit = new Set(), goal } = {}) {
	const st = stages[stageKey];
	const tiles = st.tiles.map((r) => [...r]);
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const S = makeSolver(tiles, bg, [], {}, litInit, { noTools, hasLadder: !noTools, pitCrossable: true });
	const starts = ['1,5', '1,6'].map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	const fullLit = (1 << S.torchCells.length) - 1;
	const isGoal = goal ?? ((state) => Number(state.split('|')[4]) === fullLit);
	return measureMetrics(S, starts, isGoal, () => 0,
		{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) });
}

{
	// 火元ありでブーメランが有れば全かがり火が点く（ソルバーのブーメランは「その向きの
	// 直線上の H を全部点ける」上界＝実エンジンの1本運びでも row4 の東で足りる）
	const relayOn = solveRoom(RELAY, { litInit: new Set([LIT]) });
	check(`${RELAY}：ブーメランが有れば全かがり火が点く（L=${relayOn.L}）`, relayOn.L !== null);
	check(`${RELAY}：入って詰む状態が無い（実測 noEscape=${relayOn.noEscape}）`, relayOn.noEscape === 0);
	// 対照実験＝道具なし（noTools）では点かない＝封印は道具がないと解けない
	const relayOff = solveRoom(RELAY, { noTools: true, litInit: new Set([LIT]) });
	check(`対照実験：${RELAY} は道具なし（noTools）では全点灯に届かない`, relayOff.L === null);

	// `3,4` は入って詰まない（環を回って南へ抜けられる）
	const ringGoal = (state) => state.split('|')[0] === '8,5';
	const ringM = solveRoom(RING, { goal: ringGoal });
	check(`${RING}：南の出口 (8,5) へ届く（L=${ringM.L}）`, ringM.L !== null);
	check(`${RING}：入って詰む状態が無い（実測 noEscape=${ringM.noEscape}）`, ringM.noEscape === 0);
}

// ── 脅威度（不変条件(d)）──────────────────────────────────────────────
{
	const THREAT_OF = (m) => (m.hp * m.atk) / ((m.def ?? 0) + 1);
	const perFloor = new Map();
	let boss = 0;
	for (const [key, st] of Object.entries(stages)) {
		const floor = key.split(',')[0];
		let sum = 0;
		for (const row of st.tiles) {
			for (const ch of row) {
				const m = ENEMY_META[ch];
				if (!m) continue;
				if (m.isBoss) { boss += THREAT_OF(m); continue; }
				sum += THREAT_OF(m);
			}
		}
		perFloor.set(floor, (perFloor.get(floor) ?? 0) + sum);
	}
	const nonBoss = [...perFloor.values()].reduce((a, b) => a + b, 0);
	const CAP = 591.5 * 1.2;   // 不変条件(d)＝作り直し前の塔の非ボス合計 591.5 の +20%
	const f = (k) => perFloor.get(k) ?? 0;
	check(`塔の非ボス脅威度が上限 ${CAP.toFixed(1)} 以下（実測 ${nonBoss}・ボス ${boss}）`,
		nonBoss <= CAP);
	check(`2F(${f('2')}) < 3F(${f('3')})（不変条件(d) の登り）`, f('2') < f('3'));
	check(`3F が 4F より重い（4F=${f('4')} の薄さはキュー20b ⑤で是正する）`, f('3') > f('4'));
}

// ── 報酬の棚卸し（キュー20b ⑳）と不変条件(e) ──────────────────────────────
{
	const quivers = [], bombBags = [];
	for (const [lk, lay] of Object.entries(data.layers ?? {})) {
		for (const [k, s] of Object.entries(lay.stages ?? {})) {
			for (const [cell, cc] of Object.entries(s.chestContents ?? {})) {
				if (cc?.item === 'quiver') quivers.push(`${lk}/${k}(${cell})`);
				if (cc?.item === 'bombBag') bombBags.push(`${lk}/${k}(${cell})`);
			}
		}
	}
	let bigPotionRooms = 0, hearts = 0;
	for (const s of Object.values(stages)) {
		const items = Object.values(s.chestContents ?? {});
		if (items.some((cc) => cc?.item === 'bigHealPotion')) bigPotionRooms++;
		hearts += items.filter((cc) => cc?.type === 'heartContainer' || cc?.item === 'heartContainer').length;
	}
	check(`世界の矢筒が 3,2 と ${RELAY} の2個（実測: ${quivers.join(' ')}）`,
		quivers.length === 2 && quivers.includes(`${LAYER}/${RELAY}(${RELAY_CHEST})`));
	check(`世界の爆弾袋が1個のまま（実測: ${bombBags.join(' ') || 'なし'}）`, bombBags.length === 1);
	check(`塔の回復薬（大）が4室（5室から1つ減らした・実測 ${bigPotionRooms}・残りはキュー20b ⑤）`,
		bigPotionRooms === 4);
	check(`塔のハートの器が 2,2 の1個のまま（実測 ${hearts}）`, hearts === 1);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 3F：重複室と空室を「淵の環」＋「淵の火渡り」に作り替える（キュー20b ④の残り）`);
console.log(log.join('\n') || '  （変更なし）');

for (const [k, st] of [[RING, ring], [RELAY, relay]]) {
	console.log(`\n## 盤面の差分（${k}）`);
	st.tiles.forEach((row, i) => {
		const now = row.join('');
		console.log(`   ${String(i).padStart(2)} ${beforeRows[k][i]}   ${beforeRows[k][i] === now ? '=' : '→'}   ${now}`);
	});
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
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
	console.log('\n書き込み完了:', MAP_PATH);
	// ⚠️ 道具の ps_ フラグは **'1' の厳密一致**（`game/game.js:2111`）。
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_ladder=1&ps_boomerang=1';
	const url = (stage, row, col) => `  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(RING, 1, 5));
	console.log('   西回り（ω を抜けて 8,1 の宝箱）と東回り（θ）のどちらでも南へ抜けられる');
	console.log(`   淵に向かってはしごを使っても渡れない（幅2以上）`);
	console.log(url(RELAY, 1, 5));
	console.log(`   (${THROW_SPOTS[1]}) まで歩いて東を向き、ブーメランを投げる`);
	console.log(`   → 火元 (${LIT}) の炎を拾って (${UNLIT}) に点火＝「かがり火に火が灯った！」`);
	console.log(`   → 西の窪みに封印の宝箱 (${RELAY_CHEST}) が現れる → 開けると矢筒（矢の上限 +8）`);
}

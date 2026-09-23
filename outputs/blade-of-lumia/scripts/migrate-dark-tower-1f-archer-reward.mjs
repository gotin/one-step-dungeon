// dark_tower 1F：空箱だった `1,4`／`1,5` を「はしご＋遠矢の寄道」に作り替える
// （2026-09-23 / PLAN 実行キュー 20b ④の封印報酬・`switchOn` 分／設計は Opus）。
//
// ■ 何が壊れていたか（キュー20b の棚卸し⑫で実測・このスクリプト着手前に現物で再確認）
//   ・`1,4` ＝外周が壁だけの素の箱に宝箱 B(2,4)＝回復薬（大）が1個。仕掛けも地形も無い。
//     しかも塔の回復薬（大）は6室にあり（`0,1` `0,4` `1,4` `2,5` `3,4` `4,4`）、
//     不変条件(e)「塔の回復薬（大）は3室以下」に反していた。
//   ・`1,5` ＝1F の行き止まり。小ルピー2枚だけの完全な空室（PLAN の棚卸し⑫「薄い室」）。
//     1F の本道（`1,0`→`1,1`→`1,2`→`1,3`→`1,4`→`1,5`）の終端なのに、寄り道する理由が無い。
//
// ■ 新しい機構（PLAN の設計「`1,4`／`1,5` は弓の寄り道（`Y` を撃つ→`switchOn` 封印の宝箱）」）
//   `1,4`＝**供給の前室**。壁の窪み2つ（小ルピー）で素の箱をやめ、本道 col5 の上に
//     **床の矢束 `'6'`(6,5)** を置く＝`1,5` の寄道に挑む前に必ず矢を補給できる
//     （「消費品は関門の手前で必ず補給できる」不変条件・DECISIONS 2026-09-22（1））。
//     回復薬（大）の宝箱は撤去＝不変条件(e) の是正の第一歩（6室→5室）。
//   `1,5`＝**小島の射手**。南半分を穴の海にし、その只中に1マスの小島 (7,3) を置く。
//     ・小島へは **はしご**でしか渡れない：小島の北 (6,3) だけが「幅1・両岸が床」
//       （北岸 (5,3)／南岸＝小島）∴`isLadderCrossable` が成立する。他の列は
//       row6/7/8 が3連の穴＝幅3で渡れない。
//     ・座 `Y`(7,10) は穴の海の東端。**小島から東へ射抜く一本の射線しか無い**
//       （広間から南へ撃つ列は (6,10) の壁で止まる／他の列は row7 が穴で素通り）。
//     ・封印の宝箱 B(3,2)＝広間の西の窪み。`showConditions {trigger:'switchOn', switchId:'7,10'}`。
//       中身は **爆弾袋（bombBag・爆弾の上限 +8）**。
//
//   `1,1`（1F の必須関門）との違い＝あちらは「広間から見えている座を、幅2の穴越しに
//   真南へ撃つ」だけ。こちらは「はしごで小島に渡る」「射線が1本しか無い」の2段＝
//   道具2つ（はしご＋遠隔攻撃）を要求する寄道。∴同じ `Y` を使っても体験が重複しない。
//
//   成立する理由（すべて実装を裏取り済み）：
//   ・投擲物は `#` と未破壊の `!` だけで止まる（`game/projectile.js isTilePassableForProj`）
//     ∴穴の上は素通りする。矢に飛距離の上限は無い。
//   ・`Y` をトグルできるのは矢（arrow）と剣ビーム（beam）だけ
//     （`game/projectile.js:637`）∴「遠隔攻撃が必須」で「弓が必須」ではない
//     （剣ビームは銅の剣以降＝`SWORD_TIERS[1].beam` から出る∴矢を切らしても詰まない）。
//   ・`toggleSwitch`（`game/player.js:308`）が `ss.switchToggles` に載せ、
//     そのまま `evaluateConditions()` を呼ぶ→`switchOn` は
//     `ss.switchToggles.has(switchId)` を見る（`game/conditions.js:157`）∴
//     **新しいコードは要らない**。`conditionsMet` はセーブされる∴一度解けば戻らない
//     （`Y` は再度撃つと OFF に戻るが、条件の成立は残る）。
//   ・報酬も既存の道＝`chestContents {type:'item', item:'bombBag'}` →`grantReward` が
//     `giveSubItem('bombBag')`（`player.maxBombs += 8`・`game/player.js:725`）を呼び、
//     上限が増えた旨の文も既に実装済み（`game/player.js:759`）＝**エンジン変更なし**。
//   ・⚠️ 開封の文を `showConditions[cell].message` に書いてはいけない＝
//     `bossYielded`（`game/boss.js:477`）しか読まない死んだデータ（3F分の教訓）。
//     この寄道の案内は**地形そのもの**が担う＝看板は置かない（ユーザー判定 2026-09-23）。
//   ・爆弾袋は `shared/items.js` に実装済みだが**世界に1個も置かれていなかった**
//     （実測0件）∴塔固有の報酬になる（矢筒＝3F分と対になる・キュー20b ⑳の第三歩）。
//     置く階も理に合う＝1F で上限が広がってから、2F `2,1` と 4F `4,2` の爆弾関門に挑む。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・両室の盤面／境界の開きが不変（部屋間の接続を動かさない）／`1,4` に宝箱が無い
//   ・封印が `switchOn`＋`switchId`＝`Y` の座標／中身が爆弾袋／死んだ message を書いていない
//   ・看板が1枚も無い（'i' タイルも signData も＝片方だけ残すと無言看板／死にデータ）
//   ・**射線の実測**（`isTilePassableForProj` と同じ規則＝`#`/`!` だけで止まる）：
//       はしごあり＝射線はちょうど1本（小島 (7,3) から東）
//       はしご無し＝射線 0本（＝はしごが無いと封印を解けない）
//     対照実験2つ（どちらも「測れている」ことの証明）：
//       (6,10) を床にすると射線が増える＝あの壁が射線を1本に絞っている
//       小島 (7,3) を壁で潰すと射線が 0 本になる＝小島が唯一の射座
//   ・座 `Y` に隣接する床が1マスも無い（剣では絶対に叩けない）
//   ・小島は「はしごありのみ」到達／宝箱の窪みは両方で到達（宝は拾うだけなら道具不要）
//   ・部屋単独のソルバー：小島まで届く／**入って詰む状態が0**（小島から戻れる）
//   ・塔全体の BFS：全ゲート開＝30/30 室（寄道∴本道を動かしていない）
//   ・爆弾袋が世界でこの1個だけ／矢筒1個のまま／塔の回復薬（大）が6→5室
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-1f-archer-reward.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-1f-archer-reward.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER  = 'dark_tower';
const PRE    = '1,4';   // 供給の前室
const ARCHER = '1,5';   // 小島の射手

const OLD_CHEST = '2,4';    // 撤去する回復薬（大）の宝箱（PRE）
const ARROWS    = '6,5';    // 床の矢束 '6'（PRE）
const NICHES    = ['3,3', '3,8'];   // 壁の窪みの小ルピー（PRE）

const ISLAND = '7,3';    // 穴の海の只中の小島＝唯一の射座
const CRACK  = '6,3';    // 小島の北の穴1枚＝はしごで渡る所
const BANK   = '5,3';    // 北岸
const SWITCH = '7,10';   // 座 'Y'
const CHEST  = '3,2';    // 封印の宝箱
const SIGN   = '1,1';    // 第一版の刻み文 'i' が在ったセル（今は素の床＝看板は置かない）
const LANE_WALL = '6,10';   // 射線を1本に絞っている壁
const NORTH_IN  = ['1,5', '1,6'];   // 北の入口 (0,5)(0,6) から入った直後の室内セル

const PRE_TARGET = [
	'#####..#####',
	'#..........#',
	'#.##....##.#',
	'#.#r....r#.#',
	'#.##....##.#',
	'#..........#',
	'#....6.....#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
// 直す前の盤面（この形でなければ止まる＝データの取り違え防止）
const PRE_BEFORE = [
	'#####..#####',
	'#..........#',
	'#...B......#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

const ARCHER_TARGET = [
	'#####..#####',
	'#..........#',
	'#.##r..r...#',
	'#.B#.......#',
	'#.##.......#',
	'#..........#',
	'#xxxxxxxxx##',
	'#xx.xxxxxxY#',
	'#xxxxxxxxxx#',
	'############',
];
// 直す前として許す盤面は2形（どちらでもなければ止まる＝データの取り違え防止）。
//   ①手を付ける前の空室（小ルピー2枚だけ）
//   ②2026-09-23 の第一版＝刻み文 'i'(1,1) が在った形。ユーザー判定
//     「dark_tower 1,5 に看板いるかね？ みりゃわかるだろ／最終盤だからヒント不要」で
//     外した∴この版から作り替える経路も冪等に通す（下の signData も同じ理由で削除する）。
const ARCHER_BEFORE_STATES = [
	[
		'#####..#####',
		'#..........#',
		'#...r..r...#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'#..........#',
		'############',
	],
	[
		'#####..#####',
		'#i.........#',
		'#.##r..r...#',
		'#.B#.......#',
		'#.##.......#',
		'#..........#',
		'#xxxxxxxxx##',
		'#xx.xxxxxxY#',
		'#xxxxxxxxxx#',
		'############',
	],
];

const CHEST_COND    = { trigger: 'switchOn', switchId: SWITCH };
const CHEST_CONTENT = { type: 'item', item: 'bombBag', name: '爆弾袋' };

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];
if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

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

const pre    = stages[PRE];
const archer = stages[ARCHER];
ok(pre, `${PRE} が無い`);
ok(archer, `${ARCHER} が無い`);
for (const [k, st] of [[PRE, pre], [ARCHER, archer]]) {
	ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray),
		`${k} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
	ok(st.rows === ROWS && st.cols === COLS, `${k} の寸法が想定外: ${st.rows}x${st.cols}`);
}

const beforeRows = { [PRE]: rowsOf(pre), [ARCHER]: rowsOf(archer) };
const edgesBefore = { [PRE]: edgeSig(pre), [ARCHER]: edgeSig(archer) };

// ──────────────────────────────────────────────────────────────────────
// ① `1,4`＝供給の前室（矢束・壁の窪み・回復薬（大）の撤去）
// ──────────────────────────────────────────────────────────────────────
if (beforeRows[PRE].join('\n') === PRE_TARGET.join('\n')) {
	step('=', `${PRE} の盤面は既に狙いどおり`);
} else {
	for (let r = 0; r < PRE_BEFORE.length; r++) {
		ok(beforeRows[PRE][r] === PRE_BEFORE[r],
			`${PRE} row${r} が旧盤面と違う: '${beforeRows[PRE][r]}' 期待 '${PRE_BEFORE[r]}'`);
	}
	pre.tiles = PRE_TARGET.map((row) => [...row]);
	step('✔', `${PRE} を作り替えた（素の箱 → 壁の窪み2つ（小ルピー ${NICHES.join(' ')}）`
		+ `＋床の矢束 '6'(${ARROWS})・回復薬（大）の宝箱 B(${OLD_CHEST}) を撤去）`);
}

{
	const cc = pre.chestContents ?? {};
	if (cc[OLD_CHEST]) {
		const gone = JSON.stringify(cc[OLD_CHEST]);
		delete cc[OLD_CHEST];
		step('✔', `${PRE} の chestContents[${OLD_CHEST}] を削除: ${gone}`
			+ '（不変条件(e)＝塔の回復薬（大）を6室→5室）');
	} else step('=', `${PRE} に回復薬（大）の登録は無い`);
	// 空になっても鍵そのものは残す＝全ステージが `chestContents` を持つ形（エディタの
	// 入口が期待する形）を崩さない。
	pre.chestContents = cc;
}

pre.comment = '[dark_tower 1,4] 1F の供給の前室（キュー20b ④・2026-09-23）。床の矢束 6(6,5) は'
	+ '本道 col5 の上＝南の 1,5 の寄道（座を射抜く）に挑む前に必ず矢を補給できる'
	+ '（「消費品は関門の手前で必ず補給できる」不変条件・DECISIONS 2026-09-22（1））。'
	+ '壁の窪み2つ（小ルピー 3,3／3,8）は「外周が壁だけの素の箱」（棚卸し⑫の薄い室・'
	+ '2,5 と盤面が完全一致だった）をやめるための形。回復薬（大）の宝箱 B(2,4) は撤去した'
	+ '＝塔の回復薬（大）が6室あり不変条件(e)（3室以下）に反していたため、その第一歩。'
	+ '⚠️ 矢束は弓を持っていないと拾えない（FLOOR_STACK_TILES.requires='
	+ "'bow'）がタイルは残る∴後で取りに来られる（1,5 の座は剣ビームでも射抜ける）。";

// ──────────────────────────────────────────────────────────────────────
// ② `1,5`＝小島の射手（はしご＋遠矢で解く封印の宝＝爆弾袋）
// ──────────────────────────────────────────────────────────────────────
if (beforeRows[ARCHER].join('\n') === ARCHER_TARGET.join('\n')) {
	step('=', `${ARCHER} の盤面は既に狙いどおり`);
} else {
	const cur = beforeRows[ARCHER].join('\n');
	const hit = ARCHER_BEFORE_STATES.findIndex((rows) => rows.join('\n') === cur);
	ok(hit >= 0, `${ARCHER} の盤面が「直す前として許す2形」のどちらでもない:\n${cur}`);
	archer.tiles = ARCHER_TARGET.map((row) => [...row]);
	step('✔', `${ARCHER} を作り替えた（${hit === 0 ? '空室' : '第一版（刻み文つき）'} → `
		+ `南半分を穴の海にし、小島 (${ISLAND})・座 'Y'(${SWITCH})・封印の宝箱 B(${CHEST})）`);
}

{
	const sc = archer.showConditions ?? (archer.showConditions = {});
	if (JSON.stringify(sc[CHEST]) === JSON.stringify(CHEST_COND)) {
		step('=', `${ARCHER} の封印条件は既に狙いどおり`);
	} else {
		ok(sc[CHEST] === undefined, `${ARCHER} の showConditions[${CHEST}] が既に在る: ${JSON.stringify(sc[CHEST])}`);
		sc[CHEST] = { ...CHEST_COND };
		step('✔', `${ARCHER} に封印条件を書いた（switchOn・switchId=${SWITCH}）`);
	}
}

{
	const cc = archer.chestContents ?? (archer.chestContents = {});
	if (JSON.stringify(cc[CHEST]) === JSON.stringify(CHEST_CONTENT)) {
		step('=', `${ARCHER} の宝の中身は既に狙いどおり`);
	} else {
		ok(cc[CHEST] === undefined, `${ARCHER} の chestContents[${CHEST}] が既に在る`);
		cc[CHEST] = { ...CHEST_CONTENT };
		step('✔', `${ARCHER} の宝の中身＝爆弾袋（世界で唯一・キュー20b ⑳の是正の第三歩）`);
	}
}

{
	// ⚠️ 看板は置かない（ユーザー判定 2026-09-23＝「みりゃわかるだろって気がするし、
	// dark_tower はもう最終盤だからそんなヒントなくてもいい」）。この寄道の案内は
	// **地形そのもの**が担う＝穴の海の只中に床が1マスだけ／対岸の東端に座／その真上が壁。
	// タイル 'i' と signData は**両方**消す（片方だけ残すと無言看板／死にデータ）。
	const sd = archer.signData ?? (archer.signData = {});
	if (sd[SIGN] === undefined) {
		step('=', `${ARCHER} に看板は無い（狙いどおり＝地形だけで語らせる）`);
	} else {
		const gone = JSON.stringify(sd[SIGN]);
		delete sd[SIGN];
		step('✔', `${ARCHER} の signData[${SIGN}] を削除: ${gone}`);
	}
}

archer.comment = '[dark_tower 1,5] 小島の射手＝はしご＋遠隔攻撃の寄道（キュー20b ④・2026-09-23）。'
	+ '南半分を穴の海にし、只中の小島 (7,3) だけが「幅1・両岸が床」（北岸 5,3）＝はしごで'
	+ '渡れる唯一の所。座 Y(7,10) は穴の海の東端で、広間から南へ撃つ列は (6,10) の壁で'
	+ '止まる∴**小島から東へ射抜く一本の射線しか無い**。射抜くと showConditions '
	+ "{trigger:'switchOn', switchId:'7,10'} が満ちて封印の宝箱 B(3,2)（西の窪み）が現れる。"
	+ '中身は爆弾袋（爆弾の上限 +8）＝世界で唯一の配置（shared/items.js に実装済みで'
	+ '9-5a 以来どこにも置かれていなかった）。2F 2,1 と 4F 4,2 の爆弾関門より前の階に置く'
	+ '＝上限が広がってから爆弾を使う階に進む順になる。旧構成は小ルピー2枚だけの空室'
	+ '（棚卸し⑫の薄い室）。1F の必須関門 1,1 との違い＝あちらは広間から見える座を幅2の'
	+ '穴越しに真南へ撃つだけ、こちらは「はしごで小島へ渡る」「射線が1本」の2段。'
	+ '⚠️ 開封の文は書いていない＝showConditions[cell].message は bossYielded'
	+ '（game/boss.js:477）しか読まない死んだデータ（3F分の教訓）。'
	+ '⚠️ 看板も置かない（ユーザー判定 2026-09-23＝最終盤の塔にヒント看板は要らない・'
	+ '地形を見れば分かる）＝案内は地形そのものが担う（穴の海に床が1マスだけ／対岸の'
	+ '東端に座／その真上が壁）。他の階のヒント看板の見直しはキュー20c。';

// ──────────────────────────────────────────────────────────────────────
// ③ 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

const at = (st, cell) => { const [r, c] = cell.split(',').map(Number); return st.tiles[r][c]; };

// 盤面・データ
{
	check(`${PRE} の盤面が狙いどおり`, rowsOf(pre).join('\n') === PRE_TARGET.join('\n'));
	check(`${ARCHER} の盤面が狙いどおり`, rowsOf(archer).join('\n') === ARCHER_TARGET.join('\n'));
	check(`${PRE} に床の矢束 '6'(${ARROWS})`, at(pre, ARROWS) === '6');
	for (const n of NICHES) check(`${PRE} の窪みに小ルピー(${n})`, at(pre, n) === 'r');
	check(`${PRE} に宝箱 'B' が1枚も無い`, !rowsOf(pre).some((row) => row.includes('B')));
	check(`${PRE} の chestContents が空`, Object.keys(pre.chestContents ?? {}).length === 0);

	check(`${ARCHER} の座が 'Y'(${SWITCH})`, at(archer, SWITCH) === 'Y');
	check(`${ARCHER} の 'Y' がこの1枚だけ`,
		rowsOf(archer).reduce((n, row) => n + [...row].filter((ch) => ch === 'Y').length, 0) === 1);
	check(`${ARCHER} の小島 (${ISLAND}) が床`, at(archer, ISLAND) === '.');
	check(`${ARCHER} の渡り所 (${CRACK}) が穴・北岸 (${BANK}) が床`,
		at(archer, CRACK) === 'x' && at(archer, BANK) === '.');
	check(`${ARCHER} の射線を絞る壁 (${LANE_WALL}) が '#'`, at(archer, LANE_WALL) === '#');
	check(`${ARCHER} の宝箱が 'B'(${CHEST})`, at(archer, CHEST) === 'B');
	check(`${ARCHER} の封印条件が switchOn＋switchId=${SWITCH}`,
		archer.showConditions?.[CHEST]?.trigger === 'switchOn'
		&& archer.showConditions[CHEST].switchId === SWITCH);
	check(`${ARCHER} の封印に死んだ message を書いていない（bossYielded 専用）`,
		archer.showConditions?.[CHEST]?.message === undefined);
	check(`${ARCHER} の宝の中身が爆弾袋`, archer.chestContents?.[CHEST]?.item === 'bombBag');
	check(`${ARCHER} に看板が1枚も無い（'i' タイルも signData も）`,
		!rowsOf(archer).some((row) => row.includes('i'))
		&& Object.keys(archer.signData ?? {}).length === 0);
	// 配線は showConditions だけが担う＝`links`（Y→門）は空のまま・ステージの
	// `switchToggles` は誰も読まない幽霊フィールド∴生やさない（1,1 の番人と同じ観点）。
	check(`${ARCHER} の links が空・switchToggles を生やしていない`,
		(archer.links?.length ?? 0) === 0 && archer.switchToggles === undefined);
}

// 境界の開き＝部屋間の接続を動かしていない
for (const k of [PRE, ARCHER]) {
	const now = edgeSig(stages[k]);
	check(`${k} の境界の開きが不変（${edgesBefore[k]} → ${now}）`, now === edgesBefore[k]);
}

// ── 射線の実測（`game/projectile.js isTilePassableForProj` と同じ規則）──────
// 投擲物は `#` と未破壊の `!` だけで止まる＝穴・床アイテム・宝箱・座は素通り（座は当たる）。
const projBlocked = (rows, r, c) => {
	const ch = rows[r]?.[c];
	if (ch === undefined) return true;        // 盤外
	return ch === '#' || ch === '!';
};
/** `from` の各セルから4方向へ撃って `target` に当たる射線を列挙する。 */
function lanesTo(rows, from, target) {
	const DIRS = [[-1, 0, '北'], [1, 0, '南'], [0, -1, '西'], [0, 1, '東']];
	const hits = [];
	for (const cell of from) {
		const [r0, c0] = cell.split(',').map(Number);
		for (const [dr, dc, name] of DIRS) {
			let r = r0 + dr, c = c0 + dc;
			while (!projBlocked(rows, r, c)) {
				if (`${r},${c}` === target) { hits.push(`${cell}→${name}`); break; }
				r += dr; c += dc;
			}
		}
	}
	return hits;
}

const TOWER_START = { stage: '0,1', row: 5, col: 5 };   // field から着く塔の入口
/** 塔の入口から BFS して `1,5` 内の到達セルを取る（patch で盤面を差し替えた対照実験も同じ道で測る）。 */
function reach(patch = {}, { withLadder = true } = {}) {
	const clone = structuredClone(stages);
	for (const [cell, ch] of Object.entries(patch)) {
		const [r, c] = cell.split(',').map(Number);
		clone[ARCHER].tiles[r][c] = ch;
	}
	const res = bfsLayer(clone, TOWER_START, {
		withLadder, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const rooms = new Set([...res.reachedCells].map((k) => k.split(':')[0]));
	const cells = [...res.reachedCells]
		.filter((k) => k.startsWith(`${ARCHER}:`)).map((k) => k.split(':')[1]);
	return { cells, rooms, rows: clone[ARCHER].tiles.map((r) => r.join('')) };
}

{
	const withL = reach();
	const noL   = reach({}, { withLadder: false });
	// ⚠️ 座 'Y' 自体は connectivity.mjs の HARD_BLOCKED に入っている＝BFS では絶対に
	//    到達セルにならない∴「座に歩いて行けない」を座セルで測ると歯が無い。
	//    代わりに**座の隣に立てる床が1つも無いこと**を測る（剣の間合いはここで決まる）。
	const [sr, sc] = SWITCH.split(',').map(Number);
	const around = [[sr - 1, sc], [sr + 1, sc], [sr, sc - 1], [sr, sc + 1]]
		.map(([r, c]) => `${r},${c}`).filter((k) => withL.cells.includes(k));
	check(`座 'Y'(${SWITCH}) の隣に立てる床が1マスも無い（剣では叩けない・実測: ${around.join(' ') || 'なし'}）`,
		around.length === 0);

	check(`小島 (${ISLAND}) へははしごが有れば渡れる`, withL.cells.includes(ISLAND));
	check(`小島 (${ISLAND}) へははしごが無いと渡れない`, !noL.cells.includes(ISLAND));
	check(`北岸 (${BANK}) はどちらでも立てる（測定が空振りでない証明・はしご無し ${noL.cells.includes(BANK)}）`,
		withL.cells.includes(BANK) && noL.cells.includes(BANK));
	check(`宝箱の窪み (${CHEST}) はどちらでも踏める（封印は踏めても開かないだけ）`,
		withL.cells.includes(CHEST) && noL.cells.includes(CHEST));

	const lanesWith = lanesTo(withL.rows, withL.cells, SWITCH);
	const lanesNo   = lanesTo(noL.rows, noL.cells, SWITCH);
	check(`はしごありの射線がちょうど1本＝小島から東（実測: ${lanesWith.join(' ') || 'なし'}）`,
		JSON.stringify(lanesWith) === JSON.stringify([`${ISLAND}→東`]));
	check(`はしご無しでは射線が0本＝封印を解けない（実測: ${lanesNo.join(' ') || 'なし'}）`,
		lanesNo.length === 0);

	// 対照実験①：射線を絞っている壁を床にすると射線が増える（＝あの壁が効いている）
	const openWall = reach({ [LANE_WALL]: '.' });
	const lanesOpen = lanesTo(openWall.rows, openWall.cells, SWITCH);
	check(`対照実験：(${LANE_WALL}) を床にすると射線が増える（実測 ${lanesOpen.length}本: ${lanesOpen.join(' ')}）`,
		lanesOpen.length > lanesWith.length);

	// 対照実験②：小島を壁で潰すと射線が0本（＝小島が唯一の射座）
	// 潰すのは必ず '#'（未知文字だと通行可になる＝[[blade-control-experiment-needs-tile-wall]]）
	const killIsland = reach({ [ISLAND]: '#' });
	const lanesKill = lanesTo(killIsland.rows, killIsland.cells, SWITCH);
	check(`対照実験：小島 (${ISLAND}) を壁で潰すと射線が0本（実測: ${lanesKill.join(' ') || 'なし'}）`,
		lanesKill.length === 0);

	// 塔全体：寄道∴本道を動かしていない
	check(`全ゲート開＝塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${withL.rooms.size}）`,
		withL.rooms.size === Object.keys(stages).length);
}

// ── 部屋単独のソルバー：小島まで届く／入って詰む状態が0 ────────────────────
{
	const measureRoom = ({ withLadder = true, goal = ISLAND } = {}) => {
		const tiles = archer.tiles.map((r) => [...r]);
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		for (const [k, ch] of Object.entries(archer.bgTiles ?? {})) {
			const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
		}
		const S = makeSolver(tiles, bg, [], {}, new Set(),
			{ hasLadder: withLadder, pitCrossable: true });
		const starts = NORTH_IN.map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const [gr, gc] = goal.split(',').map(Number);
		return measureMetrics(S, starts, (state) => state.split('|')[0] === goal,
			(state) => {
				const [pr, pc] = state.split('|')[0].split(',').map(Number);
				return Math.abs(pr - gr) + Math.abs(pc - gc);
			},
			{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) });
	};
	const full = measureRoom();
	check(`${ARCHER}（はしごあり）は小島 (${ISLAND}) へ届く`, full.L !== null);
	check(`${ARCHER} は入って詰む状態が無い（小島から北へ戻れる・実測 noEscape=${full.noEscape}）`,
		full.noEscape === 0);
	check(`${ARCHER}（はしご無し）は小島へ届かない`, measureRoom({ withLadder: false }).L === null);
}

// ── 報酬の希少さ（キュー20b ⑳）と不変条件(e) ──────────────────────────────
{
	let quivers = 0, bombBags = 0;
	for (const lay of Object.values(data.layers ?? {})) {
		for (const s of Object.values(lay.stages ?? {})) {
			for (const cc of Object.values(s.chestContents ?? {})) {
				if (cc?.item === 'quiver') quivers++;
				if (cc?.item === 'bombBag') bombBags++;
			}
		}
	}
	let bigPotionRooms = 0, hearts = 0;
	for (const s of Object.values(stages)) {
		const items = Object.values(s.chestContents ?? {});
		if (items.some((cc) => cc?.item === 'bigHealPotion')) bigPotionRooms++;
		hearts += items.filter((cc) => cc?.type === 'heartContainer' || cc?.item === 'heartContainer').length;
	}
	check(`世界の爆弾袋がちょうど1個（実測 ${bombBags}）`, bombBags === 1);
	check(`世界の矢筒が1個のまま（実測 ${quivers}）`, quivers === 1);
	check(`塔の回復薬（大）が5室（6室から1つ減らした・実測 ${bigPotionRooms}・残りはキュー20b ⑤）`,
		bigPotionRooms === 5);
	check(`塔のハートの器が 2,2 の1個のまま（実測 ${hearts}）`, hearts === 1);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 1F：空箱2室を「はしご＋遠矢の寄道」に作り替える（キュー20b ④ 封印報酬 switchOn 分）`);
console.log(log.join('\n') || '  （変更なし）');

for (const [k, st] of [[PRE, pre], [ARCHER, archer]]) {
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
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_ladder=1&ps_bow=1';
	const url = (stage, row, col) => `  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(PRE, 5, 5));
	console.log(`   床の矢束 '6'(${ARROWS}) を踏んで矢を補給 → 南へ抜けて ${ARCHER} へ`);
	console.log(url(ARCHER, 1, 5));
	console.log(`   (${BANK}) から南へ進んではしごで小島 (${ISLAND}) に渡る（看板は無い＝地形で読ませる）`);
	console.log(`   → 東を向いて矢を射る（剣ビームでも可）→ 座 'Y'(${SWITCH}) が鳴り、`);
	console.log(`      西の窪みに封印の宝箱 (${CHEST}) が現れる → 開けると爆弾袋（爆弾の上限 8→16）`);
}

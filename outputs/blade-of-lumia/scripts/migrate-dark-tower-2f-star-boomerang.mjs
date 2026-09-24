// dark_tower 2F 寄道の2室：薄い箱を「代償の廊」と「星の間」に作り替える
// （2026-09-24 / PLAN 実行キュー 20b ⑤-b・設計は Opus）。
//
// ■ 何が薄かったか（キュー20b の棚卸し⑤／⑫・実測＝`.scratch/20b-5-thin-rooms.mjs`）
//   ・`2,4` ＝床のルピー `r(2,4)` 1個だけの素の箱（脅威度 0.0）
//     ⚠️ PLAN 20b ⑤-b は `r` を「壺（割ると回復）」と書いていたが**誤り**＝`r` は
//        `TILE.ITEM_RUPEE`＝拾うだけのルピー（回復しない。壺のタイルはそもそも無い）。
//        2026-09-24 に実データで確認して PLAN 側も直した。
//   ・`2,5` ＝宝箱1個だけの素の箱（中身は**回復薬（大）**＝塔で4室目＝不変条件(e)
//     「塔の回復薬（大）は3室以下」に届いていなかった）
//   2室は 2F の階段 `2,3 (8,4)` を通り過ぎた先の**行き止まりの枝**＝本道ではない。
//   ∴「寄道に入る代償」と「塔でしか手に入らない報酬」の1組にすると、枝そのものに意味が出る。
//
// ■ 新しい機構
//   ・`2,4` ＝**代償の廊**（0.0 → 36.0）。爆弾鬼 λ(5,9)=left を1体だけ置く＝2F の主題
//     （爆弾の関門 `2,1`）の再演で、投擲（range 7・爆風 1.5・damage 6）が縦の通路 col5/6 に
//     ずっと届く。⚠️ **通路そのもの（col5/6）には置かない**＝走り抜けを残す（20b ④で関門は
//     打ち止め）。⚠️ 遮蔽（柱）を足さない＝投擲の敵は遮蔽を置くと「柱の陰を歩くだけ」で
//     無力化される∴この部屋は素の広間のままが機構的に正しい。床のルピー `r(2,4)` は残す
//     （寄道に踏み込む小さな誘い＝回復ではない）。2F の最重量 `2,3`（λ×2＝72.0）は超えない。
//   ・`2,5` ＝**星の間**。素の箱を「柱の菱形」に変え、宝箱をその中心 (4,5) へ置く＝北の
//     通路 col5 を下りるとそのまま宝箱の正面に着く。中身を回復薬（大）から
//     **星のブーメラン**（`BOOMERANG_TIERS[2]`・atk 12／maxRange 8）へ差し替える＝
//     不変条件(e) が 4室 → **3室**（`0,1`／`0,4`／`4,4`）で達成。
//     ⚠️ 封印（killAll）にせず守り手も置かない＝素直な報酬（予算 (d4)≤900 の残余が
//     2.0 しか無い＝PLAN 20b ⑤の配分）。
//
// ■ 報酬の形＝**絶対値** `{type:'boomerang', boomerangTier:2}`
//   PLAN の第一案は「今持っているティアの1段上」だったが、実装を読んで**成り立たない**と
//   分かった（DECISIONS 2026-09-24）＝`giveSubItem('boomerang')`（dungeon_2 1,1 の初回入手＝
//   `type:'item'`）は `boomerangTier` を触らない∴**木を持っていてもティアは -1**
//   （`game/save.js sanitizeLoadedPlayer` がセーブの読み込み時にだけ 0 へ補完する）。
//   ∴「1段上」は木を持っている人に tier0＝木をもう1本渡すだけになる。絶対値なら
//   未所持／木／銀のどこから来ても星になる（`equipBoomerangTier` は下位を拒むだけ）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・2室の盤面・`enemyDirs`・境界の開き（部屋間の接続を動かさない）
//   ・`2,4` の脅威度 36.0／通路 col5/6 に敵なし／床のルピーが残っている
//   ・`2,5` の宝箱が星のブーメラン1個だけ・守り手/封印なし・タイルが `B`
//   ・`shared/items.js` の tier2 と `shared/sprites-items.js` のパレットが実在する（5層の1セット）
//   ・不変条件 (e) 回復薬（大）は3室以下／(d1)(d3)(d4) が保たれる
//   ・全道具ありの BFS で塔 30 室すべてに到達し、宝箱の正面 `2,5 (3,5)` に立てる
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-2f-star-boomerang.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-2f-star-boomerang.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';
import { ENEMY_META } from '../shared/enemies.js';
import { THREAT_OF, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { ITEM_PAL } from '../shared/sprites-items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const THREAT_CAP = 900;        // 不変条件 (d4)
const THREAT_FLOOR = 858;      // ⑤-a 完了時の合計＝ここより軽くしない
const HALL_2F = 72;            // 2F の最重量（`2,3` の λ×2）＝寄道はこれを超えない
const BIGHEAL_CAP = 3;         // 不変条件 (e)

// ── `2,4`＝代償の廊 ────────────────────────────────────────────────
const CORRIDOR = '2,4';
const CORRIDOR_BEFORE = [
	'#####..#####',
	'#..........#',
	'#...r......#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const CORRIDOR_TARGET = [
	'#####..#####',
	'#..........#',
	'#...r......#',
	'#..........#',
	'#..........#',
	'#........λ.#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const CORRIDOR_DIRS = { '5,9': 'left' };   // 通路（col5/6）を正面に見る＝投擲線が縦の動線に重なる

// ── `2,5`＝星の間 ─────────────────────────────────────────────────
const SHRINE = '2,5';
// 受け入れる「直す前」の盤面（どれでもない盤面なら取り違えとみなして止まる）。
//   v0 ＝素の箱（宝箱 (2,4) 1個だけ）
//   v1 ＝最初に置いた菱形（柱を col3..8 ＝部屋の中心 5.5 に合わせた版）。⚠️ 撤回＝
//        部屋の枠は左右対称になるが**宝箱 (4,5) が菱形の中心から半マスずれる**＝
//        実画面で見ると左の柱まで1マス・右の柱まで2マスに見えた（2026-09-24 自己確認）。
//        ∴菱形は宝箱の列 col5 を中心に組み直す（下の SHRINE_TARGET）。
const SHRINE_BEFORE = [
	[
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
	],
	[
		'#####..#####',
		'#..........#',
		'#..#....#..#',
		'#...#..#...#',
		'#....B.....#',
		'#...#..#...#',
		'#..#....#..#',
		'#..........#',
		'#..........#',
		'############',
	],
];
// 柱は (4,5) を中心に上下左右対称（半径2の段と半径3の段）＝宝箱が菱形の真ん中に来る。
const SHRINE_TARGET = [
	'#####..#####',
	'#..........#',
	'#.#.....#..#',
	'#..#...#...#',
	'#....B.....#',
	'#..#...#...#',
	'#.#.....#..#',
	'#..........#',
	'#..........#',
	'############',
];
const SHRINE_CHEST_CELL = '4,5';
const SHRINE_CHEST = { type: 'boomerang', boomerangTier: 2, name: '星のブーメラン' };
const SHRINE_CHEST_BEFORE_CELL = '2,4';   // 旧＝回復薬（大）

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];
if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };
const rowsOf = (st) => st.tiles.map((r) => r.join(''));

const before = {};

// 表の外に敵部屋を作るときは配置表に宣言しておく（無いと `tests/enemy-placed.js` の
// PLACEMENT_STAGES から漏れて「知らない部屋に湧いた＝ドリフト」と数えられる）。
ok(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === CORRIDOR),
	`EXTRA_ENEMY_ROOMS に ${LAYER}/${CORRIDOR} の宣言が無い（配置表の外の敵部屋＝ドリフト扱いになる）`);

// ──────────────────────────────────────────────────────────────────────
// ① 盤面と enemyDirs（旧盤面と一致しなければ止まる＝取り違え防止）
// ──────────────────────────────────────────────────────────────────────
function applyRoom(key, beforeRows, targetRows, dirs, comment) {
	const st = stages[key];
	ok(st, `${key} が無い`);
	ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray),
		`${key} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
	ok(st.rows === targetRows.length && st.cols === targetRows[0].length,
		`${key} の寸法が想定外: ${st.rows}x${st.cols}`);

	const now = rowsOf(st);
	before[key] = now;

	// `beforeRows` は「受け入れる旧盤面」の1つまたは複数（配列の配列）。
	const variants = Array.isArray(beforeRows[0]) ? beforeRows : [beforeRows];

	if (now.join('\n') === targetRows.join('\n')) {
		step('=', `${key} の盤面は既に狙いどおり`);
	} else {
		const hit = variants.findIndex((v) => now.join('\n') === v.join('\n'));
		ok(hit >= 0, `${key} の盤面が既知の旧盤面のどれとも違う（取り違え防止で中止）:\n`
			+ now.map((r, i) => `  ${String(i).padStart(2)} ${r}`).join('\n'));
		st.tiles = targetRows.map((row) => [...row]);
		step('✔', `${key} を作り替えた（旧盤面 v${hit} から）`);
	}

	const cur = st.enemyDirs ?? (st.enemyDirs = {});
	if (JSON.stringify(cur) === JSON.stringify(dirs)) {
		step('=', `${key} の enemyDirs は既に狙いどおり`);
	} else {
		ok(Object.keys(cur).length === 0,
			`${key} に既に別の enemyDirs が在る: ${JSON.stringify(cur)}`);
		st.enemyDirs = { ...dirs };
		step('✔', `${key} の enemyDirs を置いた（${JSON.stringify(dirs)}）`);
	}

	st.comment = comment;
}

applyRoom(CORRIDOR, CORRIDOR_BEFORE, CORRIDOR_TARGET, CORRIDOR_DIRS,
	'[dark_tower 2,4] 代償の廊（キュー20b ⑤-b・2026-09-24）。床のルピー r(2,4) 1個だけの素の箱だった'
	+ '（棚卸し⑤の薄い室）。2F の階段 2,3 (8,4) を通り過ぎた先の行き止まりの枝＝星の間 2,5 へ'
	+ '至る唯一の通り道∴「寄道に入る代償」を課す部屋にした＝爆弾鬼 λ(5,9)=left を1体（脅威度 36.0）。'
	+ '2F の主題（爆弾の関門 2,1）の再演で、λ は投擲（range 7・爆風 radius 1.5・damage 6）∴'
	+ '縦の通路 col5/6 を下りる間ずっと圧がかかる。⚠️ 通路そのもの（col5/6）には置かない＝'
	+ '置くと倒すまで進めず事実上 killAll になる（20b ④で関門は打ち止め＝走り抜けも残す）。'
	+ '⚠️ 柱（遮蔽）を足さないのは意図＝投擲の敵に遮蔽を与えると「柱の陰を歩くだけ」で'
	+ '無力化される∴この部屋は素の広間のままが機構的に正しい（5,2 の門番＝近接2種に柱を'
	+ '立てたのと逆の判断）。床のルピー r(2,4) は残す＝寄道に踏み込む小さな誘い'
	+ '（⚠️ PLAN は「壺＝割ると回復」と書いていたが誤り＝r は TILE.ITEM_RUPEE で回復しない。'
	+ '2026-09-24 に実データで確認して PLAN も直した）。'
	+ '2F の最重量 2,3（λ×2＝72.0）は超えない＝寄道が本道より重くならない。');

applyRoom(SHRINE, SHRINE_BEFORE, SHRINE_TARGET, {},
	'[dark_tower 2,5] 星の間（キュー20b ⑤-b・2026-09-24）。宝箱1個だけの素の箱だった'
	+ '（棚卸し⑤の薄い室）。柱を菱形に並べて中心 (4,5) に宝箱を据えた＝北の通路 col5 を'
	+ '下りるとそのまま宝箱の正面 (3,5) に着く（菱形の縦の口は col5/6 に空けてある）。'
	+ '⚠️ 柱は「部屋の中心（col5.5）」ではなく「宝箱の列（col5）」を軸に左右対称に置く＝'
	+ '部屋幅が 12（偶数）なので両方は満たせず、最初は部屋の枠に合わせた（col3..8）が、'
	+ '実画面で宝箱が菱形の中で左に半マスずれて見えた∴宝箱を軸にした（2026-09-24 自己確認）。'
	+ '中身は回復薬（大）→ **星のブーメラン**（BOOMERANG_TIERS[2]・atk 12／maxRange 8／'
	+ 'speed は銀と同じ 5.0 据え置き）＝塔固有の報酬で、不変条件(e)「塔の回復薬（大）は3室以下」'
	+ 'が 4室 → 3室（0,1／0,4／4,4）で達成。報酬の形は**絶対値** {type:"boomerang",boomerangTier:2}'
	+ '＝PLAN の第一案「今持っているティアの1段上」は成り立たない（giveSubItem は boomerangTier を'
	+ '触らない∴木を持っていてもティアは -1＝「1段上」が木になる。DECISIONS 2026-09-24）。'
	+ '⚠️ 封印（killAll）にせず守り手も置かない＝素直な報酬（予算 (d4)≤900 の残余が 2.0 しか無い'
	+ '＝PLAN 20b ⑤の配分）。⚠️ 看板も置かない（ユーザー判定 2026-09-23＝最終盤の塔にヒント看板は'
	+ '要らない）＝「行き止まりの奥の菱形の間」という形が報酬室であることを示す。');

// ──────────────────────────────────────────────────────────────────────
// ② 宝箱の中身（回復薬（大）→ 星のブーメラン・セルも中心へ移す）
// ──────────────────────────────────────────────────────────────────────
{
	const st = stages[SHRINE];
	const cc = st.chestContents ?? (st.chestContents = {});
	if (JSON.stringify(cc) === JSON.stringify({ [SHRINE_CHEST_CELL]: SHRINE_CHEST })) {
		step('=', `${SHRINE} の宝箱は既に星のブーメラン`);
	} else {
		const old = cc[SHRINE_CHEST_BEFORE_CELL];
		ok(old?.item === 'bigHealPotion' && Object.keys(cc).length === 1,
			`${SHRINE} の宝箱が想定外: ${JSON.stringify(cc)}`);
		delete cc[SHRINE_CHEST_BEFORE_CELL];
		cc[SHRINE_CHEST_CELL] = { ...SHRINE_CHEST };
		step('✔', `${SHRINE} の宝箱を 回復薬（大）(${SHRINE_CHEST_BEFORE_CELL}) → `
			+ `星のブーメラン(${SHRINE_CHEST_CELL}) に差し替えた`);
	}
}

// ──────────────────────────────────────────────────────────────────────
// ③ 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

const threatOfRoom = (st) => {
	let t = 0;
	for (const row of st.tiles) for (const ch of row) if (ENEMY_META[ch]) t += THREAT_OF(ENEMY_META[ch]);
	return t;
};
const openingSig = (st) => {
	const rows = rowsOf(st);
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[st.rows - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[st.cols - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
};

// ── 道具そのもの（5層の1セット＝データだけ直して絵と数が無いのを防ぐ）
{
	const star = BOOMERANG_TIERS[2];
	check('BOOMERANG_TIERS[2] が星のブーメラン（atk12／maxRange8／speed5.0 据え置き）',
		star?.key === 'star' && star.name === '星のブーメラン'
		&& star.atk === 12 && star.maxRange === 8 && star.speed === 5.0);
	check(`ITEM_PAL.${star?.pal} が実在する＝飛翔中の色が引ける`, Array.isArray(ITEM_PAL[star?.pal]));
	check('星のパレットが木・銀のどちらとも別色（見分けが付く）',
		ITEM_PAL[star?.pal]?.join() !== ITEM_PAL.boomerang.join()
		&& ITEM_PAL[star?.pal]?.join() !== ITEM_PAL.boomerangSilver.join());
}

// ── `2,4`
{
	const st = stages[CORRIDOR];
	check(`${CORRIDOR} の盤面が狙いどおり`, rowsOf(st).join('\n') === CORRIDOR_TARGET.join('\n'));
	check(`${CORRIDOR} の enemyDirs が狙いどおり`,
		JSON.stringify(st.enemyDirs) === JSON.stringify(CORRIDOR_DIRS));
	check(`${CORRIDOR} の床のルピー r(2,4) が残っている`, st.tiles[2][4] === 'r');
	check(`${CORRIDOR} の脅威度が 36.0（実測 ${threatOfRoom(st).toFixed(1)}）`, threatOfRoom(st) === 36);
	check(`${CORRIDOR} が 2F の最重量 ${HALL_2F}（2,3）を超えない`, threatOfRoom(st) <= HALL_2F);
	const corridorClear = st.tiles.every((row) => !ENEMY_META[row[5]] && !ENEMY_META[row[6]]);
	check(`${CORRIDOR} の通路（col5/6）に敵が1体もいない＝走り抜けが残る`, corridorClear);
	check(`${CORRIDOR} の境界の開きが N[5,6] S[5,6] W[] E[]（実測: ${openingSig(st)}）`,
		openingSig(st) === 'N[5,6] S[5,6] W[] E[]');
	check(`${CORRIDOR} に宝箱・看板・階段を足していない`,
		Object.keys(st.chestContents ?? {}).length === 0
		&& Object.keys(st.signData ?? {}).length === 0
		&& Object.keys(st.mapEnters ?? {}).length === 0);
	// 向き別スプライトの敵は `enemyDirs` が無いと既定の向きで固まる（ENEMY-DIRECTIONAL-GUIDE）
	const dirNeeded = [];
	st.tiles.forEach((row, r) => row.forEach((ch, c) => {
		if (ENEMY_META[ch]?.directional && !st.enemyDirs?.[`${r},${c}`]) dirNeeded.push(`${ch}(${r},${c})`);
	}));
	check(`${CORRIDOR} の向き別スプライトの敵に向きがある（実測の欠落: ${dirNeeded.join(' ') || 'なし'}）`,
		dirNeeded.length === 0);
}

// ── `2,5`
{
	const st = stages[SHRINE];
	check(`${SHRINE} の盤面が狙いどおり`, rowsOf(st).join('\n') === SHRINE_TARGET.join('\n'));
	const [cr, cc2] = SHRINE_CHEST_CELL.split(',').map(Number);
	check(`${SHRINE} (${SHRINE_CHEST_CELL}) が宝箱タイル 'B'`, st.tiles[cr][cc2] === 'B');
	check(`${SHRINE} の宝箱が星のブーメラン1個だけ`,
		JSON.stringify(st.chestContents) === JSON.stringify({ [SHRINE_CHEST_CELL]: SHRINE_CHEST }));
	check(`${SHRINE} に守り手（敵）を置いていない＝素直な報酬`, threatOfRoom(st) === 0);
	check(`${SHRINE} に封印（showConditions）を課していない`,
		Object.keys(st.showConditions ?? {}).length === 0);
	check(`${SHRINE} の境界の開きが N[5,6] S[] W[] E[]（実測: ${openingSig(st)}）`,
		openingSig(st) === 'N[5,6] S[] W[] E[]');
	// 宝箱は「北の通路をまっすぐ下りた正面」＝(3,5) に立って下を向けば開く
	check(`${SHRINE} 宝箱の正面 (3,5) が床＝通路から正面に立てる`, st.tiles[3][5] === '.');
	// 柱が宝箱 (4,5) を軸に上下左右対称＝実画面で宝箱が菱形の真ん中に見える
	// （⚠️ 最初の版は部屋の中心 col5.5 を軸にして宝箱が半マスずれた＝2026-09-24 自己確認）
	{
		const pillars = [];
		st.tiles.forEach((row, r) => row.forEach((ch, c) => {
			if (ch === '#' && r > 0 && r < st.rows - 1 && c > 0 && c < st.cols - 1) pillars.push([r, c]);
		}));
		const key = (r, c) => `${r},${c}`;
		const set = new Set(pillars.map(([r, c]) => key(r, c)));
		const asym = pillars.filter(([r, c]) =>
			!set.has(key(r, 10 - c)) || !set.has(key(8 - r, c)));   // (4,5) 対称＝r→8-r / c→10-c
		check(`${SHRINE} の柱 ${pillars.length} 本が宝箱 (4,5) を軸に上下左右対称`
			+ `（崩れ: ${asym.map(([r, c]) => `${r},${c}`).join(' ') || 'なし'}）`, asym.length === 0);
	}
}

// ── 不変条件 (e)：塔の回復薬（大）は3室以下
{
	const rooms = Object.entries(stages)
		.filter(([, st]) => Object.values(st.chestContents ?? {}).some((v) => v?.item === 'bigHealPotion'))
		.map(([k]) => k).sort();
	check(`塔の回復薬（大）の宝箱が ${BIGHEAL_CAP} 室以下＝(e)（実測 ${rooms.length} 室: ${rooms.join(' ')}）`,
		rooms.length <= BIGHEAL_CAP);
	check(`残した3室が 0,1／0,4／4,4`, rooms.join(' ') === '0,1 0,4 4,4');
}

// ── 階ごとの合計と (d1)(d3)(d4)
{
	const byFloor = {};
	let total = 0;
	for (const [key, st] of Object.entries(stages)) {
		if (st.isBossRoom) continue;
		const f = key.split(',')[0];
		const t = threatOfRoom(st);
		byFloor[f] = (byFloor[f] ?? 0) + t;
		total += t;
	}
	const floors = Object.keys(byFloor).sort();
	const summary = floors.map((f) => `${f === '0' ? 'B1' : f}F ${byFloor[f].toFixed(1)}`).join(' / ');
	check(`塔の非ボス合計が ${THREAT_CAP} 以下＝(d4)（実測 ${total.toFixed(1)}／${summary}）`,
		total <= THREAT_CAP);
	check(`⑤-a 完了時（${THREAT_FLOOR}）より軽くしない`, total >= THREAT_FLOOR);
	const noFight = floors.filter((f) => !Object.entries(stages).some(([key, st]) =>
		key.startsWith(`${f},`) && !st.isBossRoom && threatOfRoom(st) > 0));
	check(`塔のどの階にも実戦室が1室以上ある＝(d1)（無人の階: ${noFight.join(' ') || 'なし'}）`,
		noFight.length === 0);
	const heavy = Object.entries(stages)
		.filter(([key, st]) => !st.isBossRoom && key !== '1,2' && threatOfRoom(st) > 162).map(([k]) => k);
	check(`1室の脅威度が 162 以下＝(d3)（超過: ${heavy.join(' ') || 'なし'}）`, heavy.length === 0);
}

// ── 接続＝全道具ありで塔30室に到達し、宝箱の正面に立てる
{
	const res = bfsLayer(stages, { stage: '0,1', row: 5, col: 5 }, {
		withLadder: true, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const rooms = new Set([...res.reachedCells].map((k) => k.split(':')[0]));
	check(`全道具ありで塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${rooms.size}）`,
		rooms.size === Object.keys(stages).length);
	check(`${SHRINE} の宝箱の正面 (3,5) に到達する＝報酬が本当に取れる`,
		res.reachedCells.has(`${SHRINE}:3,5`));
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 2F 寄道の2室：代償の廊と星の間（キュー20b ⑤-b）`);
console.log(log.join('\n') || '  （変更なし）');

for (const key of [CORRIDOR, SHRINE]) {
	console.log(`\n## 盤面の差分（${key}）`);
	stages[key].tiles.forEach((row, i) => {
		const now = row.join('');
		console.log(`   ${String(i).padStart(2)} ${before[key][i]}   ${before[key][i] === now ? '=' : '→'}   ${now}`);
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
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_ladder=1&ps_bomb=1';
	const url = (stage, row, col) => `  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(CORRIDOR, 1, 5));
	console.log('   北から入る＝東の爆弾鬼が通路へ爆弾を投げる（床のルピーは寄道の小さな誘い）');
	console.log(url(SHRINE, 1, 5));
	console.log('   そのまま南へ＝菱形の中心の宝箱を開けると星のブーメラン（ATK12＝銀の倍。'
		+ '⚠️ maxRange 8 は部屋幅 12 に阻まれて銀と同じ距離しか飛ばない＝実効差は威力だけ）');
}

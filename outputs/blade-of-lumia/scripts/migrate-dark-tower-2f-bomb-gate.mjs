// dark_tower 2F：飾りだった破壊壁と近道ワープを「爆弾の関門」＋「封印の宝」に作り直す
// （2026-09-22 / PLAN 実行キュー 20b ④の 2F 分・設計は Opus）。
//
// ■ 何が壊れていたか（キュー20b の棚卸しで実測）
//   ・`2,1`＝破壊壁 `!` が (6,10)(7,10)＝**東の外壁に貼り付いた飾り**。壁の向こうは
//     境界の `#` ＝壊しても何も無い。部屋は 10×8 が全部素の床の空き廊で、
//     北(0,5)(0,6) から南(9,5)(9,6) まで**一直線に素通り**できた。
//     おまけに `breakableWalls` の鍵が `6,11`/`7,11`＝**1マスずれて外壁を指し**、
//     値も `true`＝`{breakDef}` の形ですらなかった（`game/projectile.js:942` は
//     `?.breakDef ?? 1` ∴実害は出ないが、定義した破壊強度は黙って捨てられていた）。
//   ・`2,2 (5,5)` ↔ `2,3 (5,4)` の `>` 2枚＝`torchesLit` で開く「近道ワープ」。
//     ところが `2,2` → `2,3` は**歩いて素通しの隣室**（境界 col5/col6 が開いている）
//     ∴ かがり火3本を灯す報酬が「隣の部屋へ1マス早く着く」だけ＝実質ゼロだった。
//   ・結果、2F はどの道具も要らない通路＝「階＝道具の卒業試験」（20b の設計）に反する。
//
// ■ 新しい機構
//   `2,1`＝**爆弾の関門**。部屋を東西に貫く壁で南北に割り、本道 col5/col6 の2枚だけを
//   破壊壁にする。
//      1 #i.........#   ← 刻み文（罅割れた壁と火薬の作法）
//      2 #....5.....#   ← 爆弾の山（本道 col5 の上＝南へ歩けば必ず踏む）
//      4 #####!!#####   ← 破壊壁2枚＝ここが 2F の関門
//   `2,2`＝かがり火3本を灯すと **封印の宝箱**（塔で唯一のハートの器）が現れる。
//   近道ワープ（`2fCandleGate`/`2fMidBoss`）は `2,2`/`2,3` の両側とも撤去する。
//
//   成立する理由（すべて実装を裏取り済み）：
//   ・爆風は半径 2 の円（`ITEM_META.bomb.aoeRadius`）／`breakPower` 3 ≧ `breakDef` 1
//     ∴ (3,5) でも (3,6) でも **1個で `!` 2枚とも砕ける**（(4,6) までの距離 √2 ≦ 2）。
//   ・置いた爆弾はプレイヤーの足元（`placeBomb()` は `player` の座標に置く）で、
//     `playerDamage` は 0＝自爆しない∴退避の腕前は要求しない（関門は「道具を使うか」だけ）。
//   ・壊した壁は `ss.brokenWalls` に載って**セーブに残る**（`game/save.js`）∴一度で済む。
//   ・`!` は徒歩・はしご・翼の羽衣のいずれでも越えられない（`game/passable.js` の
//     STATEFUL_TILES ／ `FLYABLE_OVER` に `!` は無い）。矢も剣ビームも未破壊の `!` で止まる。
//
// ■ 爆弾の山を関門の手前に置く理由（⚠️ ここを省くとゲームがクリア不能になる）
//   世界で爆弾が手に入るのは **dungeon_6 `1,2` の宝箱（1回・3個）だけ**で、床の爆弾
//   `'5'` は `test_mechanics` にしか置かれていなかった。爆弾は消費品（`SUB_ITEM_CAPS.bomb`）
//   ∴ 塔に着く前に 3 個使い切っていたら、この関門は**永久に開かない壁**になる。
//   関門の手前（同じ画面の (2,5)）に爆弾の山を置いて、詰みを構造で消す。
//   拾得は `ss.pickedKeys` で1回だけ＝関門を開けるのに必要な1個は必ず手に入る。
//   ※ 山を置いても「試験」は薄まらない：問われているのは「罅割れた壁に火薬を使うと気づくか」。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・`2,1` の盤面／`!` が (4,5)(4,6) の2枚だけ／爆弾の山 `5`(2,5)／刻み文
//   ・`breakableWalls` が `!` タイルを指し、値が `{breakDef}` の形（`2,1` と `4,2` の両方）
//   ・`2,1` の境界の開きが不変（部屋間の接続を動かさない）
//   ・`2,2` に `>` と mapEnters が無い／`B`(5,5) に `torchesLit` の封印と中身が付いている
//   ・`2,3` の mapEnters が階段 `8,4` の1本だけ／塔のどこにも撤去した id が残っていない
//   ・**対照実験**（塔の入口から `followMapEnters` 付き BFS）：
//       爆弾なし（`D`/`T` は開けた状態）＝ `2,1` の**北半分まで**で止まる
//         （南半分 `9,5` にも `2,2` 以降の部屋にも到達しない／爆弾の山 (2,5) には届く）
//       爆弾あり（`!` も開ける）＝ 30 室すべてに到達する
//   ・塔のハートの器がちょうど 1 個（キュー20b ⑳＝回復薬（大）偏重の是正の第一歩）
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-2f-bomb-gate.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-2f-bomb-gate.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const GATE_ROOM  = '2,1';   // 爆弾の関門
const TORCH_ROOM = '2,2';   // かがり火3本＋封印の宝箱
const HALL_ROOM  = '2,3';   // 大広間（近道ワープの反対側）
const SHAPE_ROOM = '4,2';   // breakableWalls の形だけ直す（4F の作り替えはキュー20b ⑥）

const WALLS   = ['4,5', '4,6'];   // 破壊壁（本道の2枚）
const BOMBS   = '2,5';            // 爆弾の山
const CHEST   = '5,5';            // 封印の宝箱（TORCH_ROOM）
const OLD_WARP = '5,4';           // 撤去する近道ワープ（HALL_ROOM 側）
const DEAD_IDS = ['2fCandleGate', '2fMidBoss'];

// 狙いの盤面（`.` 床 / `#` 壁 / `!` 破壊壁 / `5` 爆弾の山 / `i` 刻み文）
const GATE_TARGET = [
	'#####..#####',
	'#i.........#',
	'#....5.....#',
	'#..........#',
	'#####!!#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
// 直す前の盤面（この形でなければ止まる＝データの取り違え防止）
const GATE_BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#.........!#',
	'#.........!#',
	'#..........#',
	'#####..#####',
];

const GATE_SIGN = {
	name: '二層の刻み文 ―壁―',
	lines: [
		'【二層の刻み文】',
		'この先の 壁は 罅割れて いる。',
		'火薬を 床に 据え、離れて 待て。',
	],
};
const TORCH_SIGN_LINES = [
	'【二層の刻み文】',
	'三つの 火を 灯せば 封が 解ける。',
	'灯さずとも 廊は 下へ 続く。',
];
const CHEST_COND = {
	trigger: 'torchesLit',
	message: '{{torch}} 三つの 火が 揃い、封印が 崩れた！',
};
const CHEST_CONTENT = { type: 'heartContainer', name: 'ハートの器' };

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];
if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };
const rowsOf = (st) => st.tiles.map((r) => r.join(''));

// ──────────────────────────────────────────────────────────────────────
// ① `2,1`＝爆弾の関門
// ──────────────────────────────────────────────────────────────────────
const gate = stages[GATE_ROOM];
ok(gate, `${GATE_ROOM} が無い`);
ok(Array.isArray(gate.tiles) && gate.tiles.every(Array.isArray),
	`${GATE_ROOM} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
ok(gate.rows === GATE_TARGET.length && gate.cols === GATE_TARGET[0].length,
	`${GATE_ROOM} の寸法が想定外: ${gate.rows}x${gate.cols}`);

const gateBeforeRows = rowsOf(gate);

if (gateBeforeRows.join('\n') === GATE_TARGET.join('\n')) {
	step('=', `${GATE_ROOM} の盤面は既に狙いどおり`);
} else {
	for (let r = 0; r < GATE_BEFORE.length; r++) {
		ok(gateBeforeRows[r] === GATE_BEFORE[r],
			`${GATE_ROOM} row${r} が旧盤面と違う: '${gateBeforeRows[r]}' 期待 '${GATE_BEFORE[r]}'`);
	}
	gate.tiles = GATE_TARGET.map((row) => [...row]);
	step('✔', `${GATE_ROOM} を作り替えた（東壁の飾り '!'×2 を撤去 → row4 に破壊壁2枚`
		+ `＋爆弾の山 '5'(${BOMBS})＋刻み文 'i'(1,1)）`);
}

{
	const want = Object.fromEntries(WALLS.map((k) => [k, { breakDef: 1 }]));
	const cur = gate.breakableWalls ?? {};
	if (JSON.stringify(cur) === JSON.stringify(want)) {
		step('=', `${GATE_ROOM} の breakableWalls は既に狙いどおり`);
	} else {
		gate.breakableWalls = want;
		step('✔', `${GATE_ROOM} の breakableWalls を張り替えた（旧: ${JSON.stringify(cur)}`
			+ `＝外壁 col11 を指す誤った鍵・値が true）→ ${JSON.stringify(want)}`);
	}
}

{
	const sd = gate.signData ?? (gate.signData = {});
	if (JSON.stringify(sd['1,1']) === JSON.stringify(GATE_SIGN)) {
		step('=', `${GATE_ROOM} の刻み文は既に狙いどおり`);
	} else {
		ok(sd['1,1'] === undefined, `${GATE_ROOM} に既に別の看板が在る: ${JSON.stringify(sd['1,1'])}`);
		sd['1,1'] = { ...GATE_SIGN, lines: [...GATE_SIGN.lines] };
		step('✔', `${GATE_ROOM} に刻み文を足した（'i' タイルは本文が無いと無言看板になる）`);
	}
}

gate.comment = '[dark_tower 2,1] 爆弾の関門（キュー20b ④・2026-09-22）。row4 の壁で部屋を'
	+ '南北に割り、本道 col5/col6 だけを破壊壁 !(4,5)(4,6) にした＝爆弾が無いと南（2,2 以降）'
	+ 'へ進めない。爆風は半径2の円・breakPower 3 ≧ breakDef 1 ∴1個で2枚とも砕ける'
	+ '（自爆はしない＝playerDamage 0）。北半分に爆弾の山 5(2,5) を置いてあるのは、'
	+ '世界で爆弾が手に入るのが dungeon_6 1,2 の宝箱（1回・3個）だけで、使い切っていると'
	+ 'この壁が永久に開かず塔がクリア不能になるため（山は本道 col5 の上＝南へ歩けば必ず踏む）。'
	+ '旧構成は破壊壁が東の外壁に貼り付いた飾りで、部屋は北から南まで素通しだった'
	+ '（breakableWalls の鍵も 1 マスずれて外壁を指していた）。南半分の作り込みと'
	+ '脅威度の再配分はキュー20b ⑤で行う。';

// ──────────────────────────────────────────────────────────────────────
// ② `2,2`＝かがり火3本で開く封印の宝箱（近道ワープを廃止）
// ──────────────────────────────────────────────────────────────────────
const torch = stages[TORCH_ROOM];
ok(torch, `${TORCH_ROOM} が無い`);
{
	const [cr, cc] = CHEST.split(',').map(Number);
	const tile = torch.tiles[cr][cc];
	if (tile === 'B') step('=', `${TORCH_ROOM} (${CHEST}) は既に宝箱 'B'`);
	else {
		ok(tile === '>', `${TORCH_ROOM} (${CHEST}) が '>' でない: '${tile}'`);
		torch.tiles[cr][cc] = 'B';
		step('✔', `${TORCH_ROOM} (${CHEST}) の近道ワープ '>' を宝箱 'B' に替えた`);
	}

	if (torch.mapEnters?.[CHEST]) {
		const gone = JSON.stringify(torch.mapEnters[CHEST]);
		delete torch.mapEnters[CHEST];
		step('✔', `${TORCH_ROOM} の mapEnters[${CHEST}] を削除: ${gone}`);
	} else step('=', `${TORCH_ROOM} に近道ワープの登録は無い`);

	const sc = torch.showConditions ?? (torch.showConditions = {});
	if (JSON.stringify(sc[CHEST]) === JSON.stringify(CHEST_COND)) {
		step('=', `${TORCH_ROOM} の封印条件は既に狙いどおり`);
	} else {
		ok(sc[CHEST] === undefined || sc[CHEST]?.trigger === 'torchesLit',
			`${TORCH_ROOM} の showConditions[${CHEST}] が想定外: ${JSON.stringify(sc[CHEST])}`);
		sc[CHEST] = { ...CHEST_COND };
		step('✔', `${TORCH_ROOM} の封印条件を書いた（torchesLit＋開封の文）`);
	}

	const cc2 = torch.chestContents ?? (torch.chestContents = {});
	if (JSON.stringify(cc2[CHEST]) === JSON.stringify(CHEST_CONTENT)) {
		step('=', `${TORCH_ROOM} の宝の中身は既に狙いどおり`);
	} else {
		ok(cc2[CHEST] === undefined, `${TORCH_ROOM} の chestContents[${CHEST}] が既に在る`);
		cc2[CHEST] = { ...CHEST_CONTENT };
		step('✔', `${TORCH_ROOM} の宝の中身＝ハートの器（塔で唯一・キュー20b ⑳の是正の第一歩）`);
	}

	const sd = torch.signData?.['1,1'];
	ok(sd, `${TORCH_ROOM} の刻み文 signData['1,1'] が無い`);
	if (JSON.stringify(sd.lines) === JSON.stringify(TORCH_SIGN_LINES)) {
		step('=', `${TORCH_ROOM} の刻み文は既に新文`);
	} else {
		ok(Array.isArray(sd.lines) && sd.lines[0] === '【二層の刻み文】',
			`${TORCH_ROOM} の刻み文が想定と違う: ${JSON.stringify(sd.lines)}`);
		const old = JSON.stringify(sd.lines);
		sd.name = '二層の刻み文 ―灯―';
		sd.lines = [...TORCH_SIGN_LINES];
		step('✔', `${TORCH_ROOM} の刻み文を書き換えた（旧: ${old}＝廃止した近道を案内していた）`);
	}
}
torch.comment = '[dark_tower 2,2] かがり火の間（キュー20b ④・2026-09-22）。H(2,3)(2,6)(2,9) を'
	+ 'ロウソクで3本とも灯すと、封印の宝箱 B(5,5) が現れる（showConditions torchesLit＝'
	+ 'game/conditions.js:185 が室内の全 TORCH を ss.litTorches と突き合わせる）。中身は'
	+ '塔で唯一のハートの器＝寄道の報酬∴本道（南へ抜ける）には一切必要ない。'
	+ '旧構成は同じセルが torchesLit で開く「近道ワープ」で、行き先 2,3 は歩いて素通しの'
	+ '隣室だった＝3本灯す報酬が「1マス早く着く」だけで実質ゼロだった。';

// ──────────────────────────────────────────────────────────────────────
// ③ `2,3`＝近道ワープの反対側を撤去（階段 8,4 は残す）
// ──────────────────────────────────────────────────────────────────────
const hall = stages[HALL_ROOM];
ok(hall, `${HALL_ROOM} が無い`);
{
	const [wr, wc] = OLD_WARP.split(',').map(Number);
	const tile = hall.tiles[wr][wc];
	if (tile === '.') step('=', `${HALL_ROOM} (${OLD_WARP}) は既に素の床`);
	else {
		ok(tile === '>', `${HALL_ROOM} (${OLD_WARP}) が '>' でない: '${tile}'`);
		hall.tiles[wr][wc] = '.';
		step('✔', `${HALL_ROOM} (${OLD_WARP}) の近道ワープ '>' を素の床に戻した`);
	}
	if (hall.mapEnters?.[OLD_WARP]) {
		const gone = JSON.stringify(hall.mapEnters[OLD_WARP]);
		delete hall.mapEnters[OLD_WARP];
		step('✔', `${HALL_ROOM} の mapEnters[${OLD_WARP}] を削除: ${gone}`);
	} else step('=', `${HALL_ROOM} に近道ワープの登録は無い`);
}
hall.comment = '[dark_tower 2,3] 2F の大広間＝北の廊から降りて上階の階段 (8,4) へ渡る中継室。'
	+ '0h（2026-09-05）で魔将 V ×1 を抜き、爆弾鬼 λ ×2（脅威度 72.0）を東西から降下ラインに'
	+ '向けて置いた＝爆風で足を止めさせる。V は寄道 warlord_lair の主へ格上げした（世界に1体だけ）。'
	+ 'キュー20b ④（2026-09-22）で中ボスの扉 (5,4)＝2,2 との近道ワープを撤去した'
	+ '（隣室へ歩いて素通しで、往復する意味が無かった）。階段を強敵と同室に置いている件'
	+ '（棚卸しの⑪）はキュー20b ⑤で直す。';

// ──────────────────────────────────────────────────────────────────────
// ④ `4,2` の breakableWalls の形だけ直す（同族の壊れたデータ）
// ──────────────────────────────────────────────────────────────────────
{
	const s = stages[SHAPE_ROOM];
	ok(s, `${SHAPE_ROOM} が無い`);
	const bw = s.breakableWalls ?? {};
	const bad = Object.entries(bw).filter(([, v]) => typeof v !== 'object' || v === null);
	if (!bad.length) step('=', `${SHAPE_ROOM} の breakableWalls は既に {breakDef} の形`);
	else {
		for (const [k] of bad) {
			const [r, c] = k.split(',').map(Number);
			ok(s.tiles[r]?.[c] === '!', `${SHAPE_ROOM} の breakableWalls[${k}] が '!' を指していない`);
			bw[k] = { breakDef: 1 };
		}
		step('✔', `${SHAPE_ROOM} の breakableWalls を {breakDef:1} の形に直した`
			+ `（旧: ${bad.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`
			+ '＝true では projectile.js の `?.breakDef ?? 1` に拾われず定義が捨てられる）');
	}
}

// ──────────────────────────────────────────────────────────────────────
// ⑤ 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

{
	const rows = rowsOf(gate);
	check(`${GATE_ROOM} の盤面が狙いどおり`, rows.join('\n') === GATE_TARGET.join('\n'));
	// `!` は本道の2枚だけ（外壁の飾りが残っていない）
	const bangs = [];
	for (let r = 0; r < gate.rows; r++) {
		for (let c = 0; c < gate.cols; c++) if (gate.tiles[r][c] === '!') bangs.push(`${r},${c}`);
	}
	check(`${GATE_ROOM} の破壊壁が本道の2枚だけ（${bangs.join(' ')}）`,
		JSON.stringify(bangs) === JSON.stringify(WALLS));
	const [br, bc] = BOMBS.split(',').map(Number);
	check(`${GATE_ROOM} に爆弾の山 '5'(${BOMBS})`, gate.tiles[br][bc] === '5');
	check(`${GATE_ROOM} の刻み文が本文つき（無言看板でない）`,
		(gate.signData?.['1,1']?.lines?.length ?? 0) >= 2);
	check(`${GATE_ROOM} の 'i' タイルと看板の座標が一致`, gate.tiles[1][1] === 'i');
}

// breakableWalls の鍵が `!` を指し、値が `{breakDef}` の形（塔の全室）
{
	const badShape = [], badCell = [];
	for (const [k, s] of Object.entries(stages)) {
		for (const [cell, v] of Object.entries(s.breakableWalls ?? {})) {
			const [r, c] = cell.split(',').map(Number);
			if (typeof v !== 'object' || v === null) badShape.push(`${k}(${cell})`);
			if (s.tiles[r]?.[c] !== '!') badCell.push(`${k}(${cell})=${JSON.stringify(s.tiles[r]?.[c])}`);
		}
	}
	check(`塔の breakableWalls が全部 {breakDef} の形（違反: ${badShape.join(' ') || 'なし'}）`,
		badShape.length === 0);
	check(`塔の breakableWalls が全部 '!' を指す（違反: ${badCell.join(' ') || 'なし'}）`,
		badCell.length === 0);
}

// 境界の開き＝部屋間の接続を動かしていない
{
	const rows = rowsOf(gate);
	const sig = (() => {
		const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
		const s = [...rows[gate.rows - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
		const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
		const e = rows.map((r, i) => (r[gate.cols - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
		return `N[${n}] S[${s}] W[${w}] E[${e}]`;
	})();
	check(`${GATE_ROOM} の境界の開きが N[5,6] S[5,6] W[] E[]（実測: ${sig}）`,
		sig === 'N[5,6] S[5,6] W[] E[]');
}

{
	const [cr, cc] = CHEST.split(',').map(Number);
	check(`${TORCH_ROOM} (${CHEST}) が宝箱 'B'`, torch.tiles[cr][cc] === 'B');
	check(`${TORCH_ROOM} に '>' が1枚も無い`,
		!rowsOf(torch).some((row) => row.includes('>')));
	check(`${TORCH_ROOM} の mapEnters が空`, Object.keys(torch.mapEnters ?? {}).length === 0);
	check(`${TORCH_ROOM} の封印条件が torchesLit ＋ 開封の文`,
		torch.showConditions?.[CHEST]?.trigger === 'torchesLit'
		&& typeof torch.showConditions[CHEST].message === 'string');
	check(`${TORCH_ROOM} の宝の中身がハートの器`,
		torch.chestContents?.[CHEST]?.type === 'heartContainer');
	// torchesLit は「室内の全 TORCH」が対象＝3本のまま（増減させていない）
	let torches = 0;
	for (let r = 0; r < torch.rows; r++) {
		for (let c = 0; c < torch.cols; c++) if (torch.tiles[r][c] === 'H') torches++;
	}
	check(`${TORCH_ROOM} のかがり火が3本（実測 ${torches}）`, torches === 3);
	check(`${TORCH_ROOM} の刻み文が廃止した近道を案内していない`,
		!JSON.stringify(torch.signData?.['1,1']?.lines ?? []).includes('近道'));
}

{
	const enters = Object.keys(hall.mapEnters ?? {});
	check(`${HALL_ROOM} の mapEnters が階段 8,4 の1本だけ（実測: ${enters.join(' ')}）`,
		JSON.stringify(enters) === JSON.stringify(['8,4']));
	const arrows = [];
	for (let r = 0; r < hall.rows; r++) {
		for (let c = 0; c < hall.cols; c++) if (hall.tiles[r][c] === '>') arrows.push(`${r},${c}`);
	}
	check(`${HALL_ROOM} の '>' が階段の1枚だけ（実測: ${arrows.join(' ')}）`,
		JSON.stringify(arrows) === JSON.stringify(['8,4']));
}

// 撤去した id が塔のどこにも残っていない（id / destId の両向き）
{
	const left = [];
	for (const [k, s] of Object.entries(stages)) {
		for (const [cell, ent] of Object.entries(s.mapEnters ?? {})) {
			if (DEAD_IDS.includes(ent?.id) || DEAD_IDS.includes(ent?.destId)) left.push(`${k}(${cell})`);
		}
	}
	check(`撤去した id ${DEAD_IDS.join('/')} が塔に残っていない（残り: ${left.join(' ') || 'なし'}）`,
		left.length === 0);
}

// 対照実験：塔の入口から歩いて（階段ワープは辿る）どこまで行けるか
// ⚠️ 判定は connectivity.mjs の BFS に委ねる（自前の壁リストは嘘をつく＝
//    [[blade-control-experiment-needs-tile-wall]] と同じ理由）。
{
	const START = { stage: '0,1', row: 5, col: 5 };   // field から着く塔の入口
	const run = (openTiles) => bfsLayer(stages, START, {
		withLadder: true, followMapEnters: true, openTiles,
	});
	// 開けておく口＝鍵扉 'D'・1F の門 'T'・ボス扉 ':'（どれも爆弾とは無関係）。
	// ⚠️ ':' を入れる理由：`connectivity.mjs` は ':' を SOLVABLE_GATES に入れている＝
	//    既定では閉じた口として塞ぐが、実装では**歩いて入れて入った後に閉じる**
	//    （`TILE.DOORWAY_BOSS` の注記）∴入れないと玉座の間 5,3 だけ永久に未到達＝
	//    「全室に到達する」の検査が爆弾とは無関係な理由で落ちる。
	const noBomb   = run(new Set(['D', 'T', ':']));   // 爆弾だけが無い状態
	const withBomb = run(new Set(['D', 'T', ':', '!']));
	const roomsOf = (res) => new Set([...res.reachedCells].map((k) => k.split(':')[0]));
	const a = roomsOf(noBomb), b = roomsOf(withBomb);

	const BEYOND = Object.keys(stages).filter((k) => ![
		'0,1', '0,2', '0,3', '0,4',            // B1F
		'1,0', '1,1', '1,2', '1,3', '1,4', '1,5', // 1F
		'2,0', GATE_ROOM,                       // 2F の関門まで
	].includes(k));
	const leak = BEYOND.filter((k) => a.has(k));
	check(`爆弾が無いと関門の先（${BEYOND.length}室）へ行けない（漏れ: ${leak.join(' ') || 'なし'}）`,
		leak.length === 0);
	check(`爆弾が無くても爆弾の山 ${GATE_ROOM}(${BOMBS}) には届く`,
		noBomb.reachedCells.has(`${GATE_ROOM}:${BOMBS}`));
	check(`爆弾が無いと ${GATE_ROOM} の南半分（9,5）に届かない`,
		!noBomb.reachedCells.has(`${GATE_ROOM}:9,5`));
	check(`爆弾があれば塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${b.size}）`,
		b.size === Object.keys(stages).length);
	check(`封印の宝箱は本道に必要ない（灯さなくても全室に到達＝上の測定に torchesLit は含まない）`,
		b.size === Object.keys(stages).length);
}

// ハートの器の収支（キュー20b ⑳）
{
	let hearts = 0, bigPotions = 0;
	for (const s of Object.values(stages)) {
		for (const cc of Object.values(s.chestContents ?? {})) {
			if (cc?.type === 'heartContainer' || cc?.item === 'heartContainer') hearts++;
			if (cc?.item === 'bigHealPotion') bigPotions++;
		}
	}
	check(`塔のハートの器がちょうど1個（実測 ${hearts}）`, hearts === 1);
	check(`塔の回復薬（大）が6個のまま（実測 ${bigPotions}・削減はキュー20b ⑤）`, bigPotions === 6);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 2F：爆弾の関門と封印の宝に作り直す（キュー20b ④ 2F分）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${GATE_ROOM}）`);
gate.tiles.forEach((row, i) => {
	const now = row.join('');
	console.log(`   ${String(i).padStart(2)} ${gateBeforeRows[i]}   ${gateBeforeRows[i] === now ? '=' : '→'}   ${now}`);
});

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
	// ⚠️ 道具の ps_ フラグは **'1' の厳密一致**（`game/game.js:2111`）＝`ps_bomb=3` のような
	//    本数指定は「持っていない」扱いになる（本数は maxBombs 満タンで入る）。
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_bomb=1&ps_candle=1&ps_ladder=1';
	const url = (stage, row, col) => `  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(GATE_ROOM, 1, 5));
	console.log('   刻み文(1,1)を読む → 爆弾の山(2,5)を踏む → 罅割れた壁 !(4,5)(4,6) の手前(3,5)で');
	console.log('   爆弾を置く（サブアイテムで爆弾を選んで使う）→ 2枚とも砕けて南へ抜ける');
	console.log(url(TORCH_ROOM, 1, 5));
	console.log('   ロウソクで H(2,3)(2,6)(2,9) を3本とも灯す → (5,5) に宝箱が現れる → ハートの器');
}

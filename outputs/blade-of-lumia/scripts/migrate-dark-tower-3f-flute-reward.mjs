// dark_tower 3F：笛の「近道ワープ」を封印の宝（矢筒）に差し替える
// （2026-09-22 / PLAN 実行キュー 20b ④の封印報酬・`flutePlayed` 分／設計は Opus）。
//
// ■ 何が壊れていたか（キュー20b の棚卸し⑬で実測）
//   ・`3,2 (5,5)` ↔ `3,3 (5,4)` の `>` 2枚＝`flutePlayed` で開く「近道ワープ」。
//     ところが `3,2` と `3,3` は**歩いて素通しの隣室**（3,2 の南端 (9,5)(9,6) と
//     3,3 の北端 (0,5)(0,6) が開いている＝連続する廊）∴笛を吹く報酬が
//     「隣の部屋へ1マス早く着く」だけ＝実質ゼロだった（2F のかがり火と同型）。
//   ・`3,3` は剣獣 μ×2＋ブーメラン鬼 π（脅威度 112.5）の部屋なのに `mapEnters` が
//     2つ（`(5,4)` 近道の戻り口／`(8,4)` 4F への階段）＝戦闘中に押し負けて `>` に
//     重なると確認なしで別の階へ飛ばされる（棚卸しの⑪）。`(5,4)` の撤去で半分解消する。
//
// ■ 新しい機構
//   `3,2`＝石碑の前で笛を吹くと **封印の宝箱**（(5,5)）が現れる。
//     中身＝**矢筒（quiver・矢の上限 +8）**。
//     ⚠️ 矢筒／爆弾袋は `shared/items.js` に実装済みだが**世界に1個も配置されていなかった**
//        （実測＝全レイヤーの `chestContents` を走査して 0 件。PLAN 9-5a が
//        「配置は 9-4D 連動の課題として残す」と書いたまま残っていた）∴塔固有の報酬になる。
//     爆弾袋ではなく矢筒を採る根拠＝爆弾の補給は固定の山2つ＋宝箱1つ（上限8をほぼ超えない）
//     に対し、矢は雑魚ドロップ（`game/combat.js:299`＝残弾が半分未満なら重み4）と
//     矢束10本（`defaultStack`）で上限に張り付く＝上限 8→16 が即座に効く。
//   `3,3`＝近道の戻り口 `(5,4)` を撤去（階段 `(8,4)` は残す）。
//
//   成立する理由（実装を裏取り済み）：
//   ・`playFlute()`（`game/game.js:1630`）は `stageData.fluteEffect.type==='reveal'` で
//     `ss.flutePlayed=true` → `evaluateConditions()` → `showConditions` の `flutePlayed`
//     が満ちたセルが `ss.conditionsMet` に載る（`game/conditions.js:141`）。
//     ∴ 行き先が `>` から `B` に変わっても、封印を解く機構はそのまま使える（新機構は不要）。
//   ・封印前の宝箱は描画されず（`game/render-board.js:348`）踏んでも開かない
//     （`game/player.js:1002`）。`conditionsMet` はセーブされる∴一度解けば戻らない。
//   ・報酬の受け渡しは既存の道＝`chestContents` の `{type:'item', item:'quiver'}` が
//     `grantReward` → `giveSubItem('quiver')` → `player.maxArrows += 8`
//     （`game/player.js:724`）。**コードの追加は要らない**。
//
// ■ 開封の文はどこに書くか（⚠️ ここを間違えると文が出ない）
//   `showConditions[cell].message` は **`bossYielded`（boss.js:477）だけが読む**＝
//   `flutePlayed` や `torchesLit` に書いても**どこにも表示されない死んだデータ**。
//   笛の開封の文は `fluteEffect.message` に書く（`playFlute()` が pulse する）。
//   ※ 既存の `2,2`（かがり火）の `showConditions.message` はこの意味で読まれていない
//     ＝害は無いが表示もされない（検査・表示の実装を変えない限りそのまま）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・`3,2` の (5,5) が `B`／室内に `>` が1枚も無い／`mapEnters` が空
//   ・封印が `flutePlayed`／中身が矢筒／`fluteEffect` が reveal＋本文つき
//   ・石碑（`i`(2,2)）の本文が廃止した近道を案内していない
//   ・`3,2`／`3,3` の境界の開きが不変（部屋間の接続を動かさない）
//   ・`3,3` の `mapEnters` と `>` が階段 `8,4` の1本だけ／撤去した id が塔に残っていない
//   ・**対照実験**（塔の入口から `followMapEnters` 付き BFS・はしごあり）：
//       笛を吹かなくても（`flutePlayed` を満たさなくても）塔の 30 室すべてに到達する
//       ＝封印の宝は寄道であって本道ではない
//   ・矢筒が世界でこの1個だけ（＝報酬の希少さの見張り）
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-3f-flute-reward.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-3f-flute-reward.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const FLUTE_ROOM = '3,2';   // 石碑＋封印の宝箱
const HALL_ROOM  = '3,3';   // 中ボスの大広間（近道ワープの反対側・階段は残す）

const CHEST    = '5,5';     // 封印の宝箱（旧・近道ワープ）
const SIGN     = '2,2';     // 石碑 'i'
const OLD_WARP = '5,4';     // 撤去する近道ワープ（HALL_ROOM 側）
const STAIRS   = '8,4';     // 4F への階段（残す）
const DEAD_IDS = ['3fFluteGate', '3fMidBoss'];

const SIGN_NEW = {
	name: '三層の刻み文 ―笛―',
	lines: [
		'【三層の刻み文】',
		'この石の 前で 笛を 吹けば 封が 解ける。',
		'吹かずとも 廊は 先へ 続く。',
	],
};
const FLUTE_MESSAGE = '{{flute}} 音色に 応えて、封印が 崩れた！';
const CHEST_COND = { trigger: 'flutePlayed' };
const CHEST_CONTENT = { type: 'item', item: 'quiver', name: '矢筒' };

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

// ──────────────────────────────────────────────────────────────────────
// ① `3,2`＝笛で現れる封印の宝箱（近道ワープを廃止）
// ──────────────────────────────────────────────────────────────────────
const fluteRoom = stages[FLUTE_ROOM];
ok(fluteRoom, `${FLUTE_ROOM} が無い`);
ok(Array.isArray(fluteRoom.tiles) && fluteRoom.tiles.every(Array.isArray),
	`${FLUTE_ROOM} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]

const beforeRows = rowsOf(fluteRoom);
const edgesBefore = { [FLUTE_ROOM]: edgeSig(fluteRoom), [HALL_ROOM]: edgeSig(stages[HALL_ROOM]) };

{
	const [cr, cc] = CHEST.split(',').map(Number);
	const tile = fluteRoom.tiles[cr][cc];
	if (tile === 'B') step('=', `${FLUTE_ROOM} (${CHEST}) は既に宝箱 'B'`);
	else {
		ok(tile === '>', `${FLUTE_ROOM} (${CHEST}) が '>' でない: '${tile}'`);
		fluteRoom.tiles[cr][cc] = 'B';
		step('✔', `${FLUTE_ROOM} (${CHEST}) の近道ワープ '>' を宝箱 'B' に替えた`);
	}

	if (fluteRoom.mapEnters?.[CHEST]) {
		const gone = JSON.stringify(fluteRoom.mapEnters[CHEST]);
		delete fluteRoom.mapEnters[CHEST];
		step('✔', `${FLUTE_ROOM} の mapEnters[${CHEST}] を削除: ${gone}`);
	} else step('=', `${FLUTE_ROOM} に近道ワープの登録は無い`);

	const sc = fluteRoom.showConditions ?? (fluteRoom.showConditions = {});
	if (JSON.stringify(sc[CHEST]) === JSON.stringify(CHEST_COND)) {
		step('=', `${FLUTE_ROOM} の封印条件は既に狙いどおり`);
	} else {
		ok(sc[CHEST] === undefined || sc[CHEST]?.trigger === 'flutePlayed',
			`${FLUTE_ROOM} の showConditions[${CHEST}] が想定外: ${JSON.stringify(sc[CHEST])}`);
		const old = JSON.stringify(sc[CHEST]);
		sc[CHEST] = { ...CHEST_COND };
		step('✔', `${FLUTE_ROOM} の封印条件を書いた（flutePlayed・旧: ${old}）`);
	}

	const cc2 = fluteRoom.chestContents ?? (fluteRoom.chestContents = {});
	if (JSON.stringify(cc2[CHEST]) === JSON.stringify(CHEST_CONTENT)) {
		step('=', `${FLUTE_ROOM} の宝の中身は既に狙いどおり`);
	} else {
		ok(cc2[CHEST] === undefined, `${FLUTE_ROOM} の chestContents[${CHEST}] が既に在る`);
		cc2[CHEST] = { ...CHEST_CONTENT };
		step('✔', `${FLUTE_ROOM} の宝の中身＝矢筒（世界で唯一・キュー20b ⑳の是正の第二歩）`);
	}

	// 開封の文は fluteEffect.message（showConditions.message は bossYielded 専用＝読まれない）
	const fx = fluteRoom.fluteEffect;
	ok(fx?.type === 'reveal', `${FLUTE_ROOM} の fluteEffect が reveal でない: ${JSON.stringify(fx)}`);
	if (fx.message === FLUTE_MESSAGE) step('=', `${FLUTE_ROOM} の開封の文は既に新文`);
	else {
		const old = JSON.stringify(fx.message);
		fx.message = FLUTE_MESSAGE;
		step('✔', `${FLUTE_ROOM} の fluteEffect.message を書き換えた（旧: ${old}＝「隠し扉が開いた」）`);
	}

	const sd = fluteRoom.signData?.[SIGN];
	ok(sd, `${FLUTE_ROOM} の石碑 signData['${SIGN}'] が無い`);
	if (JSON.stringify(sd.lines) === JSON.stringify(SIGN_NEW.lines)) {
		step('=', `${FLUTE_ROOM} の石碑は既に新文`);
	} else {
		ok(Array.isArray(sd.lines) && sd.lines[0] === '【三層の刻み文】',
			`${FLUTE_ROOM} の石碑が想定と違う: ${JSON.stringify(sd.lines)}`);
		const old = JSON.stringify(sd.lines);
		sd.name = SIGN_NEW.name;
		sd.lines = [...SIGN_NEW.lines];
		step('✔', `${FLUTE_ROOM} の石碑を書き換えた（旧: ${old}＝廃止した近道を案内していた）`);
	}
}
fluteRoom.comment = '[dark_tower 3,2] 笛の間（キュー20b ④・2026-09-22）。石碑 i(2,2) の案内どおり'
	+ '笛を吹くと、封印の宝箱 B(5,5) が現れる（fluteEffect reveal → ss.flutePlayed → '
	+ 'showConditions flutePlayed＝game/conditions.js:141）。中身は矢筒（矢の上限 +8）＝'
	+ '世界で唯一の配置（shared/items.js に実装済みで 9-5a 以来どこにも置かれていなかった）。'
	+ '寄道∴本道（南の 3,3 へ抜けて 4F の階段に乗る）には一切必要ない。'
	+ '旧構成は同じセルが flutePlayed で開く「近道ワープ」で、行き先 3,3 は歩いて素通しの'
	+ '隣室だった＝笛を吹く報酬が「1マス早く着く」だけで実質ゼロだった。'
	+ '⚠️ 開封の文は fluteEffect.message に書く＝showConditions[cell].message は '
	+ 'bossYielded（game/boss.js:477）しか読まない。部屋の作り込み（空室の薄さ）はキュー20b ⑤。';

// ──────────────────────────────────────────────────────────────────────
// ② `3,3`＝近道ワープの反対側を撤去（階段 8,4 は残す）
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
hall.comment = '[dark_tower 3,3] 3F の大広間＝剣獣 μ×2 ＋ ブーメラン鬼 π（脅威度 112.5）が'
	+ '守る中継室。上階（4F）への階段は (8,4)。キュー20b ④（2026-09-22）で笛の近道ワープ (5,4) を'
	+ '撤去した＝北の 3,2 へは歩いて素通しで、往復する意味が無かった（同時に棚卸しの⑪'
	+ '「敵の部屋に mapEnters が2つ」の半分を解消＝戦闘中に押し負けて別の階へ飛ばされる口が1つ減った）。'
	+ '残る「階段を強敵と同室に置いている」件はキュー20b ⑤で直す。';

// ──────────────────────────────────────────────────────────────────────
// ③ 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

{
	const [cr, cc] = CHEST.split(',').map(Number);
	check(`${FLUTE_ROOM} (${CHEST}) が宝箱 'B'`, fluteRoom.tiles[cr][cc] === 'B');
	check(`${FLUTE_ROOM} に '>' が1枚も無い`, !rowsOf(fluteRoom).some((row) => row.includes('>')));
	check(`${FLUTE_ROOM} の mapEnters が空`, Object.keys(fluteRoom.mapEnters ?? {}).length === 0);
	check(`${FLUTE_ROOM} の封印条件が flutePlayed`,
		fluteRoom.showConditions?.[CHEST]?.trigger === 'flutePlayed');
	check(`${FLUTE_ROOM} の封印に死んだ message を書いていない（bossYielded 専用）`,
		fluteRoom.showConditions?.[CHEST]?.message === undefined);
	check(`${FLUTE_ROOM} の宝の中身が矢筒`,
		fluteRoom.chestContents?.[CHEST]?.item === 'quiver');
	check(`${FLUTE_ROOM} の fluteEffect が reveal ＋ 開封の文つき`,
		fluteRoom.fluteEffect?.type === 'reveal' && typeof fluteRoom.fluteEffect.message === 'string');
	check(`${FLUTE_ROOM} の石碑が 'i' タイルと同じ座標で本文つき`,
		fluteRoom.tiles[2][2] === 'i' && (fluteRoom.signData?.[SIGN]?.lines?.length ?? 0) >= 2);
	check(`${FLUTE_ROOM} の石碑が廃止した近道を案内していない`,
		!JSON.stringify(fluteRoom.signData?.[SIGN]?.lines ?? []).includes('近道'));
}

{
	const enters = Object.keys(hall.mapEnters ?? {});
	check(`${HALL_ROOM} の mapEnters が階段 ${STAIRS} の1本だけ（実測: ${enters.join(' ')}）`,
		JSON.stringify(enters) === JSON.stringify([STAIRS]));
	const arrows = [];
	for (let r = 0; r < hall.rows; r++) {
		for (let c = 0; c < hall.cols; c++) if (hall.tiles[r][c] === '>') arrows.push(`${r},${c}`);
	}
	check(`${HALL_ROOM} の '>' が階段の1枚だけ（実測: ${arrows.join(' ')}）`,
		JSON.stringify(arrows) === JSON.stringify([STAIRS]));
}

// 境界の開き＝部屋間の接続を動かしていない
for (const k of [FLUTE_ROOM, HALL_ROOM]) {
	const now = edgeSig(stages[k]);
	check(`${k} の境界の開きが不変（${edgesBefore[k]} → ${now}）`, now === edgesBefore[k]);
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

// 対照実験：封印の宝は寄道＝笛を吹かなくても塔の全室に到達する
// ⚠️ 判定は connectivity.mjs の BFS に委ねる（自前の壁リストは嘘をつく＝
//    [[blade-control-experiment-needs-tile-wall]] と同じ理由）。
{
	const START = { stage: '0,1', row: 5, col: 5 };   // field から着く塔の入口
	// 開けておく口＝鍵扉 'D'・1F の門 'T'・ボス扉 ':'・破壊壁 '!'（どれも笛とは無関係）。
	// 封印の宝箱（flutePlayed）は歩行の障害ではない∴この BFS に笛の状態は入らない
	// ＝「吹かなくても全室に届く」を測ることが寄道であることの証明になる。
	const res = bfsLayer(stages, START, {
		withLadder: true, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const rooms = new Set([...res.reachedCells].map((k) => k.split(':')[0]));
	const all = Object.keys(stages).length;
	check(`笛を吹かなくても塔の全 ${all} 室に到達する（実測 ${rooms.size}）＝封印の宝は寄道`,
		rooms.size === all);
	check(`${FLUTE_ROOM} の宝箱セル (${CHEST}) は歩いて踏める（封印は踏めても開かないだけ）`,
		res.reachedCells.has(`${FLUTE_ROOM}:${CHEST}`));
	check(`${HALL_ROOM} の階段 (${STAIRS}) に到達する（4F へ登れる）`,
		res.reachedCells.has(`${HALL_ROOM}:${STAIRS}`));
}

// 矢筒の希少さ（世界でこの1個だけ）と塔の報酬の偏り（キュー20b ⑳）
{
	let quivers = 0, bombBags = 0, hearts = 0, bigPotions = 0;
	for (const lay of Object.values(data.layers ?? {})) {
		for (const s of Object.values(lay.stages ?? {})) {
			for (const cc of Object.values(s.chestContents ?? {})) {
				if (cc?.item === 'quiver') quivers++;
				if (cc?.item === 'bombBag') bombBags++;
			}
		}
	}
	for (const s of Object.values(stages)) {
		for (const cc of Object.values(s.chestContents ?? {})) {
			if (cc?.type === 'heartContainer' || cc?.item === 'heartContainer') hearts++;
			if (cc?.item === 'bigHealPotion') bigPotions++;
		}
	}
	// ⚠️ 世界の総数を等号で測ってはいけない（この番の後続＝1F 小島の射手が爆弾袋を、
	//    3F 淵の火渡りが2つめの矢筒を置いた時点で、このスクリプトが赤くなった＝2026-09-23 に
	//    実際に踏んだ）。このスクリプトが守るべきは**この部屋の宝が矢筒であること**と、
	//    世界に矢筒が在ること。総数の上限はそれを置いた側のスクリプトが見張る。
	check(`${FLUTE_ROOM} の宝が矢筒で、世界に矢筒が在る（実測 ${quivers}個）`,
		quivers >= 1 && stages[FLUTE_ROOM].chestContents?.[CHEST]?.item === 'quiver');
	check(`この部屋の宝は爆弾袋ではない（世界の爆弾袋 ${bombBags}個は 1F 側が見張る）`,
		stages[FLUTE_ROOM].chestContents?.[CHEST]?.item !== 'bombBag');
	check(`塔のハートの器が 2,2 の1個のまま（実測 ${hearts}）`, hearts === 1);
	check(`塔の回復薬（大）が増えていない（実測 ${bigPotions} ≤ 6・目標は3室以下＝キュー20b ⑤）`,
		bigPotions <= 6);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 3F：笛の近道を封印の宝（矢筒）に差し替える（キュー20b ④ 封印報酬 flutePlayed 分）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${FLUTE_ROOM}）`);
fluteRoom.tiles.forEach((row, i) => {
	const now = row.join('');
	console.log(`   ${String(i).padStart(2)} ${beforeRows[i]}   ${beforeRows[i] === now ? '=' : '→'}   ${now}`);
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
	// ⚠️ 道具の ps_ フラグは **'1' の厳密一致**（`game/game.js:2111`）。
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_flute=1&ps_bow=1&ps_ladder=1';
	const url = (stage, row, col) => `  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(FLUTE_ROOM, 2, 3));
	console.log('   石碑(2,2)を読む → 笛を吹く（サブアイテムで笛を選んで使う）→ (5,5) に宝箱が現れる');
	console.log('   → 開けると矢筒（矢の上限 8→16）。吹かずに南へ歩けば 3,3 へ普通に抜けられる');
}

// キュー104 ②：森の聖域（D6）の後＝出来事の連鎖型（2026-11-14）
//
// ■ ユーザーの決定
//   型＝出来事の連鎖（AI 案）。誰＝「森の番人の老婆」（ユーザー選択）。
//
// ■ 流れ
//   ① 森の聖域の主 O を倒して出ると、入口の画面（field 2,4）で森の番人の老婆が東の端から入ってきて、
//      「東の石畳の町のエルン坊に、森の主が倒れたと知らせておくれ」と頼む＝石畳の町（field 13,5）に印。
//      読み終えると出来事「森の番人の頼み」を記し、来た東の端へ帰っていく。
//   ② 町の賢者エルンに話しかけると、出来事の版で「ばあさまからの知らせ」を受け、氷の廃墟（field 15,4）の印をくれる。
//
// ■ 置く場所＝field 2,4 の (7,10)（データ上の居場所。来るまで・帰った後は居ない＝通れる地面）
//      4 ..>‡........   ← 入口 `>`(4,2)。出てくると (4,3) の碑の脇あたりに立つ
//      5 ............   ← 東の端 (5,11) から入ってくる（approachFrom）
//      7 M.........aM   ← 老婆
//   ・東の出入り口の行（4・5）には置かない。
//
// ■ 印は1目的地1提供元（scripts/check-dialog-integrity.mjs ⑤b）
//   氷の廃墟の印は、これまでエルンの O の版が渡していた＝同じエルンの「出来事の後」の版へ移す
//   （O を倒すと必ずこの画面に出る＝老婆が必ず来る∴出来事を飛ばしてエルンに会うことは無い）。
//   エルンの O の台詞は残す。出来事の版は O のすぐ下＝L の版が来たらそちらが勝つ。
//
// 使い方:
//   node scripts/migrate-q104-d6-forest-keeper.mjs --dry   # 差分の確認のみ
//   node scripts/migrate-q104-d6-forest-keeper.mjs         # 書き込み
// 再実行しても同じ結果（冪等）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const Q104_KEEPER = {
	layer: 'field',
	stage: '2,4',
	r: 7,
	c: 10,
	tile: 'a',
	from: '5,11',
	flag: '森の番人の頼み',
	ern: { stage: '13,5', pos: '4,5' },
};

const TOWN_MARK = { layer: 'field', stage: '13,5', label: '石畳の町', kind: 'town' };
const ICE_MARK  = { layer: 'field', stage: '15,4', label: '氷の廃墟', kind: 'dungeon' };

const ENTRY = {
	name: '森の番人の老婆',
	// 専用の絵（2026-11-15 ユーザー指摘「エルンも老婆も、両方とも見た目若すぎる」「老婆はおとこにしかみえない」）
	sprite: 'npcGranny',
	lines: [
		'おお……お前さんかい。森が静かになった。守護者さまが、ようやく鎮まりなすった。',
		'あたしはこの森の番人さ。聖域が荒れるのを、長いこと見ておった。ありがたや、ありがたや。',
		'ひとつ頼まれておくれ。東の石畳の町に、エルン坊という賢者がおる。森の主が倒れたと、知らせてやっておくれ。',
		'あの子はああ見えて物知りでね。お前さんが次に行くべき所も、きっと知っておるよ。町に印を付けておこう。',
	],
	mark: TOWN_MARK,
	showWhen: ['O'],
	hideWhen: [`flag:${Q104_KEEPER.flag}`, 'L'],
	approach: true,
	approachFrom: Q104_KEEPER.from,
	setsFlag: Q104_KEEPER.flag,
};

const ERN_FLAG_LINES = [
	'なに、森の番人のばあさまからの知らせじゃと？ ……そうか、古森の巨人を倒したか。',
	'ばあさまは今でもわしを「坊」と呼ぶ。困ったもんじゃ。',
	'さて、次は北東の雪原じゃ。氷の廃墟に欠片がある。爆弾で崩せる壁があると聞いた。多分。',
];

// キーの順が優先順（下ほど強い）＝出来事の版を O のすぐ下へ
function insertAfterKey(obj, afterKey, key, value) {
	const out = {};
	let done = false;
	for (const [k, v] of Object.entries(obj ?? {})) {
		if (k === key) continue;
		out[k] = v;
		if (k === afterKey) { out[key] = value; done = true; }
	}
	if (!done) out[key] = value;
	return out;
}

function main() {
	const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const { layer, stage, r, c, tile, flag, ern } = Q104_KEEPER;
	const sd = map.layers?.[layer]?.stages?.[stage];
	if (!sd) throw new Error(`${layer} ${stage} が無い`);
	const before = sd.tiles[r][c];
	if (before !== '.' && before !== tile) throw new Error(`(${r},${c}) が床でも老婆でもない: ${before}`);
	sd.tiles[r][c] = tile;
	sd.npcData = sd.npcData ?? {};
	sd.npcData[`${r},${c}`] = ENTRY;
	console.log(`${layer} ${stage} (${r},${c}): '${before}' → '${tile}'・npcData「${ENTRY.name}」`);

	const e = map.layers.field.stages[ern.stage]?.npcData?.[ern.pos];
	if (e?.name !== '賢者 エルン') throw new Error('賢者エルンが居ない');
	// エルンにも専用の絵（同じ指摘）。人ごとの差し替えは shared/npcs.js PERSON_NPC_SPRITES。
	e.sprite = 'npcErn';
	const fk = `flag:${flag}`;
	e.linesAfterBoss = insertAfterKey(e.linesAfterBoss, 'O', fk, ERN_FLAG_LINES);
	if (e.markAfterBoss?.O) {
		if (e.markAfterBoss.O.stage !== ICE_MARK.stage) throw new Error('エルンの O の印が氷の廃墟ではない＝前提が変わった');
		delete e.markAfterBoss.O;
	}
	e.markAfterBoss = insertAfterKey(e.markAfterBoss, 'O', fk, ICE_MARK);
	console.log(`field ${ern.stage} (${ern.pos}) 賢者 エルン：版「出来事「${flag}」の後」（台詞＋氷の廃墟の印）を O のすぐ下に置き、O の印を外した`);

	if (DRY) { console.log('--dry：書き込まない'); return; }
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));   // 末尾に改行を足さない
	console.log('書き込んだ');
}

if (import.meta.url === `file://${process.argv[1]}`) main();

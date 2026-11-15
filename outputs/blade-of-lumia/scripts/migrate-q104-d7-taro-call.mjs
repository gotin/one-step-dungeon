// キュー104 ③：空中の遺跡（D7）の後＝タロが村へ呼び戻しに来る（2026-11-15）
//
// ■ ユーザーの方針・決定
//   「空中の遺跡は出た後に一度村に戻ることを示唆するような何かがあると良さそう」→ 誰＝タロ（ユーザー選択）。
//
// ■ 流れ（足すのは①だけ。②③は今ある台詞と印がそのまま生きる）
//   ① 空中の遺跡の主 U を倒して出ると（出口は風の環状列石＝field 2,0 だけ）、タロが南の端から駆け寄ってきて
//      「じいちゃんが村に戻ってこいって」と言って帰る。出来事「タロの呼び出し」。
//      台詞では印に触れない（実プレイでは村の地図を拾った時点で印が立っている・ユーザー指摘 2026-11-15）。
//      印のデータは持つ＝無い状態のときだけ付く（既にあれば何も出ない）。
//   ② 村の老賢者（U の版）＝「昔、台に乗った者がこの村におる」と諦めた老人を指す。
//      ここに「出来事の後」の版を U のすぐ下に足す＝「タロが呼びに行ったじゃろう」の一言から始める。
//   ③ 諦めた老人（U の版）＝石の台（古代の祭壇・field 7,1）の印をくれる。
//   村のタロにも「出来事の後」の版（「今度はじいちゃんに頼まれて行ったんだ」）を U のすぐ下に足す。
//
// ■ 置く場所＝field 2,0 の (8,2)（データ上の居場所。来るまで・帰った後は居ない＝通れる地面）
//      6 t.†..>.....t   ← 環状列石の碑 †(6,2)・入口 `>`(6,5)＝出てくるとこの近く
//      8 tta.......tt   ← タロ
//      9 ttttt..ttttt   ← 南の出入り口 (9,5)(9,6)＝ここから入ってくる（approachFrom 9,5）
//
// 使い方:
//   node scripts/migrate-q104-d7-taro-call.mjs --dry   # 差分の確認のみ
//   node scripts/migrate-q104-d7-taro-call.mjs         # 書き込み
// 再実行しても同じ結果（冪等）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const Q104_TARO_CALL = {
	layer: 'field',
	stage: '2,0',
	r: 8,
	c: 2,
	tile: 'a',
	from: '9,5',
	flag: 'タロの呼び出し',
	village: '7,14',
	sage: '3,3',
	taro: '3,5',
};

const VILLAGE_MARK = { layer: 'field', stage: '7,14', label: 'はじまりの村', kind: 'town' };

const ENTRY = {
	name: '村人 タロ',
	lines: [
		'おーい！ やっぱりここだった！',
		'さっき北西の空が、ぱあっと光ったんだ。村からも見えたぞ！ 星の欠片、全部そろったんだろ？',
		'じいちゃんが、すぐ村に戻ってこいってさ。石の台のことで話があるんだって。',
		'おれ先に走って帰るから、すぐ来いよな！',
	],
	// 台詞では印に触れない（2026-11-15 ユーザー指摘「はじまりの村は最初から印ついてるよね？…印つけておく、的なことは言わない方がいい」）。
	// ただし印のデータは持たせる＝村の印が無い状態（地図を拾う前の印の仕組みより古いセーブ・プレビューの ps_map）でも
	// 村へ導ける。既に付いていれば addMark が false を返し「地図に記した」も出ない（shared/marks.js・game/ui.js commitDialogMarks）
	// ＝印の有無で台詞を分けなくても、どちらの状態でも嘘にならない。
	mark: VILLAGE_MARK,
	showWhen: ['U'],
	hideWhen: [`flag:${Q104_TARO_CALL.flag}`],
	approach: true,
	approachFrom: Q104_TARO_CALL.from,
	setsFlag: Q104_TARO_CALL.flag,
};

const SAGE_FLAG_LINES = [
	'おお、戻ったか。タロが呼びに行ったじゃろう。',
	'8つ揃ったなら、あとは石の台に捧げるだけじゃ。',
	'昔、欠片を集めきらぬまま台に乗った者がおる。この村におるはずじゃ。',
	'あやつなら台の在処をまだ覚えておろう。訊いてみるがよい。',
];
const TARO_FLAG_LINES = [
	'へへ、今度はじいちゃんに頼まれて行ったんだ。堂々とな！',
	'じいちゃんの話、聞いたか？ 石の台のことなら、あっちのじいさんが知ってるってさ。',
];

// キーの順が優先順（下ほど強い）＝出来事の版を afterKey のすぐ下へ
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
	const { layer, stage, r, c, tile, flag, village, sage, taro } = Q104_TARO_CALL;
	const sd = map.layers?.[layer]?.stages?.[stage];
	if (!sd) throw new Error(`${layer} ${stage} が無い`);
	const before = sd.tiles[r][c];
	if (before !== '.' && before !== tile) throw new Error(`(${r},${c}) が床でもタロでもない: ${before}`);
	sd.tiles[r][c] = tile;
	sd.npcData = sd.npcData ?? {};
	sd.npcData[`${r},${c}`] = ENTRY;
	console.log(`${layer} ${stage} (${r},${c}): '${before}' → '${tile}'・npcData「${ENTRY.name}」`);

	const vd = map.layers.field.stages[village].npcData;
	const fk = `flag:${flag}`;
	if (vd[sage]?.name !== '老賢者') throw new Error('老賢者が居ない');
	if (vd[taro]?.name !== '村人 タロ') throw new Error('村のタロが居ない');
	vd[sage].linesAfterBoss = insertAfterKey(vd[sage].linesAfterBoss, 'U', fk, SAGE_FLAG_LINES);
	vd[taro].linesAfterBoss = insertAfterKey(vd[taro].linesAfterBoss, 'U', fk, TARO_FLAG_LINES);
	console.log(`field ${village}：老賢者・村のタロに版「出来事「${flag}」の後」を U のすぐ下に置いた`);

	if (DRY) { console.log('--dry：書き込まない'); return; }
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));   // 末尾に改行を足さない
	console.log('書き込んだ');
}

if (import.meta.url === `file://${process.argv[1]}`) main();

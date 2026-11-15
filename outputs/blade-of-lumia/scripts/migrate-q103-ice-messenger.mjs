// キュー103：氷の廃墟（D5）を抜けたら、賢者エルンの使いが駆け寄ってきて次の行き先を告げる（2026-11-14）
//
// ■ きっかけ（ユーザー）
//   「洞窟を攻略してボスを倒して、洞窟を出た後から彷徨うしかなくて結構つらいかも」
//   → 方針「ボスを倒してから洞窟から出るとなんらかのキャラクターがやってきて話しかけてくる」
//
// ■ 置く場所＝field `15,4`（氷の廃墟の入口の画面）の (7,1)
//      4 ....Hh>H...M   ← 入口 `>`(4,6)。出てくると (5,6) あたりに立つ
//      5 .....B.....M
//      6 M....‡.....M   ← 鐘楼の石碑（転移の石碑）
//      7 Ma...α.....M   ← 使い a(7,1)。西（石畳の町＝エルンの居る 13,5）の側から来る
//   ・行4・5 の西の端（画面の出入り口）には置かない＝通り道を塞がない。
//   ・L（氷の廃墟の主）を倒すまでは居ない（showWhen）。居ないセルはただの地面＝通れる。
//   ・一度話を聞いたら去る（hideWhen＝出来事「エルンの使いの知らせ」）。沼地の神殿の主 I を先に
//     倒していても居ない（もう行った場所を告げに来ない）。
//
// 使い方:
//   node scripts/migrate-q103-ice-messenger.mjs --dry   # 差分の確認のみ
//   node scripts/migrate-q103-ice-messenger.mjs         # 書き込み
// 再実行しても同じ結果（冪等）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const Q103_MESSENGER = {
	layer: 'field',
	stage: '15,4',
	r: 7,
	c: 1,
	tile: 'a',
	flag: 'エルンの使いの知らせ',
};

const ENTRY = {
	name: 'エルンの使い',
	lines: [
		'はぁ、はぁ……！ 勇者どの、ご無事で！',
		'賢者エルンさまの使いです。氷の廃墟から光が立つのが、町から見えまして。',
		'エルンさまからの伝言です。「次は南の沼じゃ。沼地の神殿に欠片があるはずじゃ」',
		'「毒の堀は……はしごで渡れると聞いた。多分」……だそうです。',
		'地図に印を付けておきますね。それでは！',
	],
	mark: { layer: 'field', stage: '10,14', label: '沼地の神殿', kind: 'dungeon' },
	showWhen: ['L'],
	hideWhen: [`flag:${Q103_MESSENGER.flag}`, 'I'],
	approach: true,
	setsFlag: Q103_MESSENGER.flag,
};

function main() {
	const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const { layer, stage, r, c, tile } = Q103_MESSENGER;
	const sd = map.layers?.[layer]?.stages?.[stage];
	if (!sd) throw new Error(`${layer} ${stage} が無い`);
	const row = sd.tiles[r];
	if (!Array.isArray(row)) throw new Error('tiles が文字の配列の配列ではない');
	const before = row[c];
	if (before !== '.' && before !== tile) throw new Error(`(${r},${c}) が床でも使いでもない: ${before}`);
	const posKey = `${r},${c}`;
	row[c] = tile;
	sd.npcData = sd.npcData ?? {};
	sd.npcData[posKey] = ENTRY;
	// 下地（bgTiles）は触らない＝居ないときに見える地面は今の雪のまま。
	if (!sd.tiles.every((t) => Array.isArray(t) && t.every((ch) => typeof ch === 'string' && ch.length >= 1))) {
		throw new Error('tiles が文字の配列の配列でなくなった');
	}
	console.log(`${layer} ${stage} (${posKey}): '${before}' → '${tile}'・npcData「${ENTRY.name}」`);

	// 印は「1目的地1提供元」（scripts/check-dialog-integrity.mjs ⑤b＝2件目は addMark が黙って捨てる）。
	// 沼地の神殿の印は、これまで賢者エルン（field 13,5 (4,5)）の L の版が渡していた＝使いに移す
	// （使いはエルンの伝言を運ぶ役。L を倒すと必ず氷の廃墟の入口＝この画面に出る∴取りこぼさない）。
	// エルンの L の台詞は残す（話しかければ同じことを言う）。
	const ern = map.layers.field.stages['13,5']?.npcData?.['4,5'];
	if (ern?.markAfterBoss?.L) {
		if (ern.markAfterBoss.L.stage !== '10,14') throw new Error('エルンの L の印が沼地の神殿ではない＝前提が変わった');
		delete ern.markAfterBoss.L;
		console.log('field 13,5 (4,5) 賢者エルン：markAfterBoss.L（沼地の神殿）を外した');
	}
	if (DRY) { console.log('--dry：書き込まない'); return; }
	// 末尾に改行を足さない（エディタの保存と同じ形＝差分を作らない）
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
	console.log('書き込んだ');
}

if (import.meta.url === `file://${process.argv[1]}`) main();

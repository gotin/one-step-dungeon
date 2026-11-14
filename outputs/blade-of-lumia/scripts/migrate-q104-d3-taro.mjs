// キュー104 ①：水の迷宮（D3）のボス J を倒した直後、村の少年タロがボス部屋に駆けつけて炎の神殿を教える（2026-11-14）
//
// ■ ユーザーの決定
//   型＝「ボスを倒したとたんにそこにキャラクターがやってくる」（ボス部屋に駆けつける型）。
//   誰＝タロ（「タロが行くのはまぁいいと思う」）。水の迷宮の後は村へ戻らせない（「水の迷宮のあとは別に村にいかなくてもいい」）
//   ＝タロは祖父（老賢者）から聞いた次の行き先を伝えて、先に帰る。
//
// ■ 置く場所＝dungeon_3 のボス部屋 `0,0` の (8,4)＝下の扉 `::`(9,5)(9,6) の内側の1マス左
//      7 #.........B#
//      8 #...a......#   ← タロ。J を倒すまでは居ない（showWhen）＝戦いの邪魔をしない
//      9 #####::#####   ← ボスの扉（倒すと開く）
//   ・扉の真上 (8,5)(8,6) には置かない＝入室した勇者が扉から降りる床（tests/boss-door-entry.spec.js ①）。
//   ・一度話を聞いたら去る（hideWhen＝出来事「タロの知らせ」）。炎の神殿の主 A を先に倒していても来ない。
//
// ■ 印は1目的地1提供元（scripts/check-dialog-integrity.mjs ⑤b）
//   炎の神殿（field 12,2）の印は、これまで火山の登り口の「灰境の道標」（field 10,0 (5,5)）が渡していた
//   ＝タロへ移す（J を倒すと必ずタロが来る∴取りこぼさない）。道標の文章は残す。
//
// ■ 村のタロ（field 7,14 (3,5)）に、出来事の後の版を1つ足す（J の版のすぐ下＝A 以降の版が来たらそちらが勝つ）。
//
// 使い方:
//   node scripts/migrate-q104-d3-taro.mjs --dry   # 差分の確認のみ
//   node scripts/migrate-q104-d3-taro.mjs         # 書き込み
// 再実行しても同じ結果（冪等）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const Q104_TARO = {
	layer: 'dungeon_3',
	stage: '0,0',
	r: 8,
	c: 4,
	tile: 'a',
	flag: 'タロの知らせ',
};

const MARK = { layer: 'field', stage: '12,2', label: '炎の神殿', kind: 'dungeon' };

const ENTRY = {
	name: '村人 タロ',
	lines: [
		'はぁ、はぁ……追いついた！ 見てたぞ、今の！ ほんとに倒しちゃった！',
		'じいちゃんに内緒で来たんだ。自慢話、待ちきれなくってさ。',
		'そうだ、じいちゃんが言ってた。次は北東の火山だって。炎の神殿に星の欠片が眠ってるらしいぜ。',
		'地図に書いといてやるよ。……じゃ、おれ先に帰る！ 見つかったら怒られるし！',
	],
	mark: MARK,
	showWhen: ['J'],
	hideWhen: [`flag:${Q104_TARO.flag}`, 'A'],
	approach: true,
	// 下の扉（左側）から入ってくる＝扉の外から現れ、帰りもそこから出ていく（ユーザー指摘「タロが現れる位置が
	// 入り口のところからじゃないのが違和感」「下から入り始めるようにはできないの？」）
	approachFrom: '9,5',
	setsFlag: Q104_TARO.flag,
};

const VILLAGE_TARO_FLAG_LINES = [
	'へへ、じいちゃんにはバレなかったぞ。',
	'火山は暑いらしいから気をつけろよ。おれはもう行かないけど。',
];

// キーの順が優先順（下ほど強い）＝出来事の版を J のすぐ下へ差し込む（A 以降の版が来たらそちらが勝つ）
function insertAfterKey(obj, afterKey, key, value) {
	const out = {};
	let done = false;
	for (const [k, v] of Object.entries(obj)) {
		if (k === key) continue;
		out[k] = v;
		if (k === afterKey) { out[key] = value; done = true; }
	}
	if (!done) out[key] = value;
	return out;
}

function main() {
	const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const { layer, stage, r, c, tile, flag } = Q104_TARO;
	const sd = map.layers?.[layer]?.stages?.[stage];
	if (!sd) throw new Error(`${layer} ${stage} が無い`);
	if (!sd.isBossRoom) throw new Error(`${layer} ${stage} がボス部屋ではない`);
	const before = sd.tiles[r][c];
	if (before !== '.' && before !== tile) throw new Error(`(${r},${c}) が床でもタロでもない: ${before}`);
	sd.tiles[r][c] = tile;
	sd.npcData = sd.npcData ?? {};
	sd.npcData[`${r},${c}`] = ENTRY;
	console.log(`${layer} ${stage} (${r},${c}): '${before}' → '${tile}'・npcData「${ENTRY.name}」`);

	const post = map.layers.field.stages['10,0'];
	const sign = post?.signData?.['5,5'] ?? post?.npcData?.['5,5'];
	if (sign?.mark) {
		if (sign.mark.stage !== MARK.stage) throw new Error('灰境の道標の印が炎の神殿ではない＝前提が変わった');
		delete sign.mark;
		console.log('field 10,0 (5,5) 灰境の道標：mark（炎の神殿）を外した');
	}

	const village = map.layers.field.stages['7,14'].npcData['3,5'];
	if (village?.name !== '村人 タロ') throw new Error('村のタロが (3,5) に居ない');
	village.linesAfterBoss = insertAfterKey(village.linesAfterBoss ?? {}, 'J', `flag:${flag}`, VILLAGE_TARO_FLAG_LINES);
	console.log(`field 7,14 (3,5) 村人 タロ：版「出来事「${flag}」の後」を J の版のすぐ下に置いた`);

	if (DRY) { console.log('--dry：書き込まない'); return; }
	// 末尾に改行を足さない（エディタの保存と同じ形＝差分を作らない）
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
	console.log('書き込んだ');
}

if (import.meta.url === `file://${process.argv[1]}`) main();

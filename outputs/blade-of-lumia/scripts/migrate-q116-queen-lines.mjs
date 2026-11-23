// scripts/migrate-q116-queen-lines.mjs
// キュー116 ②（2026-11-22・台詞はユーザー OK「セリフは考えてくれたものOK」）：
// 女王の周回（クリア後の「はじめから」）の会話の版 `queen` を7か所に書く。
// 1周目の基本の台詞は勇者への呼びかけ・「女王は石で眠る」のまま＝女王が遊ぶ2周目では食い違う。
// `queen` は linesAfterBoss の**先頭**に置く＝一番弱い版＝2周目の基本の台詞（ボスを倒した後の案内などの版はそのまま勝つ）。
// 冪等（2回流しても同じ）。既定は確認だけ、--write で書く。
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const WRITE = process.argv.includes('--write');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

export const QUEEN_LINES = [
	{ layer: 'field', stage: '7,14', kind: 'npcData', pos: '3,3', name: '老賢者', lines: [
		'お、おお……女王さま！ まことに、女王ルミアさまであらせられますか。',
		'勇者どのは、女王さまの島で石になられたと……。女王さまの呪いが、移ったのでございますな。',
		'呪いが移ったあの夜、星の欠片は再び八方へ散り、守護獣たちもまた闇に呑まれたのじゃ。',
		'呪いを解く道はただ一つ。欠片を8つ集め、北の古代の祭壇に捧げることじゃ。',
		'旅支度を整え、村を出て西、そこからひとつ北へ。草原の窪みに洞窟が口を開けておりまする。',
	] },
	{ layer: 'field', stage: '7,14', kind: 'npcData', pos: '7,3', name: '諦めた老人', lines: [
		'北の果てに 石の台があるじゃろう。あれは飾りじゃ。',
		'わしも昔 欠片を集めて 台に乗った。何も起きんかったわい。',
		'女王さまが目を覚ましても、こんどは勇者が石じゃ。呪いは 消えん。',
		'やめておけ。旅なんぞ 無駄じゃ。',
	] },
	// 賢者エルン・エルンの使い・終章＝今の本文の1行だけ替える（残りは base の lines から写す）
	{ layer: 'field', stage: '13,5', kind: 'npcData', pos: '4,5', name: '賢者 エルン', replace: { 0: 'おお、女王さまか！ よく来られた。' } },
	{ layer: 'field', stage: '15,4', kind: 'npcData', pos: '7,1', name: 'エルンの使い', replace: { 0: 'はぁ、はぁ……！ 女王さま、ご無事で！' } },
	{ layer: 'field', stage: '11,19', kind: 'signData', pos: '3,6', name: '女王の 石碑', append: ['――今は その 剣を 継ぐ者が、ここで 石と なって 眠る。'] },
	{ layer: 'dark_tower', stage: '5,1', kind: 'signData', pos: '2,6', name: 'ザーネルの声', lines: [
		'また 会えたな、ルミア。',
		'光の剣を継ぐ者は 石と なった。',
		'この先に 私が待つ。今度こそ、共に ここで 終わりにしよう。',
	] },
	{ layer: 'dark_tower', stage: '0,1', kind: 'signData', pos: '1,1', name: 'ザーネルの記憶 ―終章―', replace: { 2: '闇の魔術師は 今も 玉座の上で 女王を待つ。' } },
];

let changed = 0;
for (const t of QUEEN_LINES) {
	const entry = map.layers[t.layer]?.stages?.[t.stage]?.[t.kind]?.[t.pos];
	if (!entry) throw new Error(`見つからない：${t.layer} ${t.stage} ${t.kind} ${t.pos}`);
	if (entry.name !== t.name) throw new Error(`名前が違う：${t.layer} ${t.stage} ${t.pos} ＝「${entry.name}」（期待「${t.name}」）`);
	const base = Array.isArray(entry.lines) ? entry.lines : [entry.lines];
	let lines = t.lines;
	if (t.replace) lines = base.map((l, i) => t.replace[i] ?? l);
	if (t.append) lines = [...base, ...t.append];
	// queen を先頭に（既にあれば中身を差し替えて先頭へ）。他のキーの順は保つ。
	const lab = entry.linesAfterBoss ?? {};
	const next = { queen: lines };
	for (const [k, v] of Object.entries(lab)) if (k !== 'queen') next[k] = v;
	if (JSON.stringify(next) !== JSON.stringify(entry.linesAfterBoss ?? null)) changed++;
	// キーの位置を保つ：linesAfterBoss が無かったエントリは lines の直後に置く
	if (entry.linesAfterBoss) entry.linesAfterBoss = next;
	else {
		const rebuilt = {};
		for (const [k, v] of Object.entries(entry)) { rebuilt[k] = v; if (k === 'lines') rebuilt.linesAfterBoss = next; }
		for (const k of Object.keys(entry)) delete entry[k];
		Object.assign(entry, rebuilt);
	}
	console.log(`${t.layer} ${t.stage} ${t.pos} ${t.name}：${lines.length} 行`);
}
console.log(`変わるエントリ ${changed}`);
if (WRITE && changed) { writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`); console.log('書いた'); }

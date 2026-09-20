// Phase 17-10b（印の重複掃除＋型⑧「遠くの噂」4件の流し込み）。
//
// 17-10a で確定した割り当て表（PLAN.md）をそのまま実装する。やること＝
//   ① 重複する印を削る（残す1件だけ本文横のまま・他は mark/markAfterBoss キーだけ削り本文は残す）
//   ② 型①の新設1件＝field 10,14(8,9) に markAfterBoss.I（空中の遺跡）
//   ③ 型③の新設1件＝賢者エルンに linesAfterBoss.O + markAfterBoss.O（氷の廃墟・stage は
//      入口の実際の画面 15,4＝旧来の 13,5 は誤り）
//   ④ 型⑧「遠くの噂」4件＝新しい提供元（距離ルールを 5画面以上→10〜20画面以上に強化した
//      2026-09-20 のユーザー判断を反映）
//        秘密の洞窟 8,9  ← field 0,2  古道の道標（15画面・item:flute 版）
//        沼地の洞窟 9,15 ← field 2,1  森の祠　　（21画面・森の聖域の重複印を差し替え）
//        樹海の岩室 0,0  ← field 6,14 村を見守る碑（20画面・新設）
//        魔将の巣  6,0   ← field 0,14 爆ぜた岩の跡（20画面・北の聖域の近すぎる印を移設）
//   ⑤ 町を目的地から外す＝field 1,16 の印を削除（コードの isField 自動付与は player.js 側で対応済み）
//
// 使い方:
//   node scripts/migrate-dialog-17-10b.mjs                    # 本番（work/blade-of-lumia.json）
//   BLADE_MAP_PATH=/abs/path/dry.json node scripts/migrate-dialog-17-10b.mjs   # 空撃ち
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = process.env.BLADE_MAP_PATH
	? path.resolve(process.env.BLADE_MAP_PATH)
	: path.join(ROOT, 'work/blade-of-lumia.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
console.log(`対象: ${MAP_PATH}`);

// ── 小道具 ────────────────────────────────────────────────
function entry(layer, key, pos) {
	const st = map.layers?.[layer]?.stages?.[key];
	if (!st) throw new Error(`stage が無い: ${layer} ${key}`);
	for (const src of ['signData', 'npcData']) {
		const e = st[src]?.[pos];
		if (e) return { e, src, st };
	}
	throw new Error(`会話が無い: ${layer} ${key} (${pos})`);
}

function removeMark(layer, key, pos, { expectStage, label }) {
	const { e, src } = entry(layer, key, pos);
	if (e.mark === undefined) { console.log(`  = ${label}（既に mark 無し・${src}）`); return; }
	if (Array.isArray(e.mark)) throw new Error(`${label}: mark が配列＝removeMarkArrayItem を使う`);
	if (e.mark.stage !== expectStage) throw new Error(`${label}: mark.stage が想定と違う（想定 ${expectStage} / 実際 ${e.mark.stage}）`);
	delete e.mark;
	console.log(`  ✔ ${label}: mark(${expectStage}) を削除（${src}）`);
}

function removeMarkAfterBoss(layer, key, pos, bossKey, { expectStage, label }) {
	const { e, src } = entry(layer, key, pos);
	if (!e.markAfterBoss || e.markAfterBoss[bossKey] === undefined) {
		console.log(`  = ${label}: markAfterBoss.${bossKey} 既に無し（${src}）`); return;
	}
	if (e.markAfterBoss[bossKey].stage !== expectStage) {
		throw new Error(`${label}: markAfterBoss.${bossKey}.stage が想定と違う（想定 ${expectStage} / 実際 ${e.markAfterBoss[bossKey].stage}）`);
	}
	delete e.markAfterBoss[bossKey];
	if (Object.keys(e.markAfterBoss).length === 0) delete e.markAfterBoss;
	console.log(`  ✔ ${label}: markAfterBoss.${bossKey}(${expectStage}) を削除（${src}）`);
}

function removeMarkArrayItem(layer, key, pos, expectStage, label) {
	const { e, src } = entry(layer, key, pos);
	if (!Array.isArray(e.mark)) throw new Error(`${label}: mark が配列でない`);
	const idx = e.mark.findIndex((m) => m.stage === expectStage);
	if (idx === -1) { console.log(`  = ${label}: 既に ${expectStage} 無し（残り${e.mark.length}件・${src}）`); return; }
	e.mark.splice(idx, 1);
	console.log(`  ✔ ${label}: mark配列から ${expectStage} を削除（残り${e.mark.length}件・${src}）`);
}

function setMark(layer, key, pos, mark, label) {
	const { e, src } = entry(layer, key, pos);
	if (JSON.stringify(e.mark) === JSON.stringify(mark)) { console.log(`  = ${label}（既に設定済み・${src}）`); return; }
	e.mark = mark;
	console.log(`  ✔ ${label}: mark → ${mark.stage}(${mark.label})（${src}）`);
}

function setMarkAfterBoss(layer, key, pos, bossKey, mark, label) {
	const { e, src } = entry(layer, key, pos);
	if (!e.markAfterBoss) e.markAfterBoss = {};
	if (JSON.stringify(e.markAfterBoss[bossKey]) === JSON.stringify(mark)) {
		console.log(`  = ${label}（既に markAfterBoss.${bossKey} あり・${src}）`); return;
	}
	if (e.markAfterBoss[bossKey]) throw new Error(`${label}: markAfterBoss.${bossKey} が別内容で既にある`);
	e.markAfterBoss[bossKey] = mark;
	console.log(`  ✔ ${label}: markAfterBoss.${bossKey} を新設（${src}）`);
}

// 事前条件つきの本文差し替え（旧本文の1行目が想定と違えば例外＝黙って上書きしない）。
function setLines(layer, key, pos, { oldFirst, newLines, label }) {
	const { e, src } = entry(layer, key, pos);
	const cur = e.lines ?? [];
	if (JSON.stringify(cur) === JSON.stringify(newLines)) { console.log(`  = ${label}（既に新しい本文・${src}）`); return; }
	if (cur[0] !== oldFirst) {
		throw new Error(`${label}: 1行目が想定と違う\n  想定: ${JSON.stringify(oldFirst)}\n  実際: ${JSON.stringify(cur[0])}`);
	}
	e.lines = newLines;
	console.log(`  ✔ ${label}（${src} / ${cur.length}行 → ${newLines.length}行）`);
}

function setItemVariantLines(layer, key, pos, item, { oldFirst, newLines, label }) {
	const { e, src } = entry(layer, key, pos);
	const k = `item:${item}`;
	if (!e.linesAfterBoss) e.linesAfterBoss = {};
	const cur = e.linesAfterBoss[k] ?? [];
	if (JSON.stringify(cur) === JSON.stringify(newLines)) { console.log(`  = ${label}（既に新しい本文・${k}・${src}）`); return; }
	if (cur.length && cur[0] !== oldFirst) {
		throw new Error(`${label}: ${k} の1行目が想定と違う\n  想定: ${JSON.stringify(oldFirst)}\n  実際: ${JSON.stringify(cur[0])}`);
	}
	e.linesAfterBoss[k] = newLines;
	console.log(`  ✔ ${label}（${src} / ${k} / ${cur.length}行 → ${newLines.length}行）`);
}

// 新規の道具の版（本文＋印を同時に持てる＝キュー26＋17-10a 型④）。
function setItemVariant(layer, key, pos, item, lines, mark, label) {
	const { e, src } = entry(layer, key, pos);
	const k = `item:${item}`;
	if (!e.linesAfterBoss) e.linesAfterBoss = {};
	if (!e.markAfterBoss) e.markAfterBoss = {};
	const already = JSON.stringify(e.linesAfterBoss[k]) === JSON.stringify(lines)
		&& JSON.stringify(e.markAfterBoss[k]) === JSON.stringify(mark);
	if (already) { console.log(`  = ${label}（既に ${k} あり・${src}）`); return; }
	if (e.linesAfterBoss[k] || e.markAfterBoss[k]) throw new Error(`${label}: ${k} が別内容で既にある`);
	e.linesAfterBoss[k] = lines;
	e.markAfterBoss[k] = mark;
	console.log(`  ✔ ${label}: ${k} 版（本文＋印）を新設（${src}）`);
}

// ══════════════════════════════════════════════════════════════════════════
// ① 老賢者 field 7,14 (3,3)＝重複する markAfterBoss(G,N,J,A,O,I) を削る（本文は残す）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n① 老賢者 field7,14(3,3)＝重複する markAfterBoss(G,N,J,A,O,I) を削る');
for (const [k, stage] of [['G', '2,15'], ['N', '9,9'], ['J', '12,2'], ['A', '2,4'], ['O', '13,5'], ['I', '2,0']]) {
	removeMarkAfterBoss('field', '7,14', '3,3', k, { expectStage: stage, label: `老賢者 markAfterBoss.${k}` });
}

// ══════════════════════════════════════════════════════════════════════════
// ② 炎の神殿(12,2) の重複 13 件を削る（keeper＝field 10,0(5,5) 灰境の道標＝現状維持）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n② 炎の神殿(12,2) の重複を削る（keeper＝field 10,0(5,5)）');
removeMarkAfterBoss('field', '9,9', '3,9', 'J', { expectStage: '12,2', label: '水の迷宮の石碑 markAfterBoss.J' });
for (const [key, pos, name] of [
	['11,2', '2,8', '消えた かがり火'], ['12,1', '2,3', '溶岩の 射的場'], ['13,1', '3,2', '火口の 見張り'],
	['12,3', '2,5', '溶岩の 手向け'], ['12,0', '6,6', '火口の 石碑'], ['11,0', '2,2', '隘路の石碑'],
	['13,0', '6,3', '岩棚の石碑'], ['14,0', '6,3', '灰の 落とし穴'], ['15,0', '7,3', '火口跡の石碑'],
	['15,1', '3,9', '狼煙台の石碑'], ['14,2', '5,4', '広庭の道標'],
]) {
	removeMark('field', key, pos, { expectStage: '12,2', label: `${name}（field ${key}）` });
}

// ══════════════════════════════════════════════════════════════════════════
// ③ 水の迷宮(9,9) の重複 8 件を削る（keeper＝field 2,15(6,5) 砂漠の神殿の石碑＝現状維持）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n③ 水の迷宮(9,9) の重複を削る（keeper＝field 2,15(6,5)）');
for (const [key, pos, name] of [
	['7,9', '2,6', '湖畔の的 (まと)'], ['5,6', '3,6', '草原の辻の道標'], ['8,6', '6,3', '草原の小池の立札'],
	['10,7', '3,4', '湖渡りの橋の立札'], ['8,10', '5,3', '湖の 飛び石'], ['4,11', '3,6', '南への道標'],
	['1,13', '4,7', '砂の石碑'],
]) {
	removeMark('field', key, pos, { expectStage: '9,9', label: `${name}（field ${key}）` });
}

// ══════════════════════════════════════════════════════════════════════════
// ④ 森の聖域(2,4) の重複 7 件を削る（keeper＝field 12,2(7,5) 石碑＝現状維持）
//    field 2,1(8,9) 森の祠は「削って終わり」ではなく沼地の洞窟の印に差し替える（後述⑦）。
// ══════════════════════════════════════════════════════════════════════════
console.log('\n④ 森の聖域(2,4) の重複を削る（keeper＝field 12,2(7,5)）');
removeMarkAfterBoss('field', '7,14', '3,3', 'A', { expectStage: '2,4', label: '（①で処理済み・確認のみ）' });
removeMarkAfterBoss('dungeon_4', '1,3', '3,5', 'A', { expectStage: '2,4', label: '炎の神殿の入口 markAfterBoss.A' });
for (const [key, pos, name] of [
	['3,4', '1,9', '森の道標'], ['3,5', '1,9', '苔むした石碑'], ['1,4', '8,2', '古びた立て札'], ['2,8', '1,9', '森の奥の遺構'],
]) {
	removeMark('field', key, pos, { expectStage: '2,4', label: `${name}（field ${key}）` });
}
// field 2,1(8,9) 森の祠は⑦でまとめて処理（削って終わりではなく差し替え）。

// ══════════════════════════════════════════════════════════════════════════
// ⑤ 氷の廃墟の重複 4 件を削る（旧 keeper 無し＝新keeperは③でエルンに新設）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n⑤ 氷の廃墟(旧stage 13,5) の重複4件を削る（新しい提供元はエルンへ）');
removeMarkAfterBoss('field', '7,14', '3,3', 'O', { expectStage: '13,5', label: '（①で処理済み・確認のみ）' });
removeMarkAfterBoss('field', '2,4', '4,3', 'O', { expectStage: '13,5', label: '森の聖域の石碑 markAfterBoss.O' });
removeMarkAfterBoss('dungeon_6', '1,3', '3,5', 'O', { expectStage: '13,5', label: '森の聖域・入口の石碑 markAfterBoss.O' });
removeMark('field', '15,2', '7,4', { expectStage: '13,5', label: '下りの道標（field 15,2）' });

// ══════════════════════════════════════════════════════════════════════════
// ⑥ 空中の遺跡(2,0) の重複2件を削り、field 10,14(8,9) にmarkAfterBoss.Iを新設
// ══════════════════════════════════════════════════════════════════════════
console.log('\n⑥ 空中の遺跡(2,0)＝老賢者・secret_grotto の印を削り、field 10,14(8,9) に新設');
removeMarkAfterBoss('field', '7,14', '3,3', 'I', { expectStage: '2,0', label: '（①で処理済み・確認のみ）' });
removeMark('secret_grotto', '0,0', '5,5', { expectStage: '2,0', label: '風を呼ぶ石碑（secret_grotto 0,0）' });
setMarkAfterBoss('field', '10,14', '8,9', 'I',
	{ layer: 'field', stage: '2,0', label: '空中の遺跡', kind: 'dungeon' },
	'石碑（field 10,14）');

// ══════════════════════════════════════════════════════════════════════════
// ⑦ 型③＝賢者エルンに linesAfterBoss.O / markAfterBoss.O を新設（stage は 15,4）
//    キー順＝優先度（後ろが勝つ）。進行順は…D6(O)→D5(L)…∴両方倒した後は「最も後に倒した」
//    L を勝たせる必要がある＝キー順は after → O → L（O は L より前＝低優先）。
// ══════════════════════════════════════════════════════════════════════════
console.log('\n⑦ 賢者エルン field13,5(4,5)＝linesAfterBoss.O / markAfterBoss.O を新設');
{
	const { e, src } = entry('field', '13,5', '4,5');
	if (e.linesAfterBoss?.O && e.markAfterBoss?.O) {
		console.log(`  = 既に O 版あり（${src}）`);
	} else {
		if (!e.linesAfterBoss?.after || !e.linesAfterBoss?.L) throw new Error('エルン: linesAfterBoss.after/L が想定と違う');
		if (!e.markAfterBoss?.L) throw new Error('エルン: markAfterBoss.L が無い');
		const oLines = [
			'おお、古森の巨人を 倒したか。爆弾を 手に入れたな。',
			'次は 北東の 雪原じゃ。氷の 廃墟に 六つ目の 欠片が ある。',
			'爆弾で 崩せる 壁が あると 聞いた。多分。',
		];
		e.linesAfterBoss = { after: e.linesAfterBoss.after, O: oLines, L: e.linesAfterBoss.L };
		e.markAfterBoss = { O: { layer: 'field', stage: '15,4', label: '氷の廃墟', kind: 'dungeon' }, L: e.markAfterBoss.L };
		console.log(`  ✔ エルン: linesAfterBoss.O / markAfterBoss.O(15,4) を新設（${src}）`);
	}
}

// ══════════════════════════════════════════════════════════════════════════
// ⑧ 型⑧「遠くの噂」4件（2026-09-20・距離ルールを 5画面→10〜20画面以上へ強化）
// ══════════════════════════════════════════════════════════════════════════

// A. 秘密の洞窟(8,9) ← field 0,2(5,5) 古道の道標（15画面・item:flute 版）
//    この画面は旧「樹海の岩室」の近すぎる提供元（2画面）だった＝mark を外して item:flute へ移す。
console.log('\n⑧A field 0,2(5,5) 古道の道標＝樹海の岩室の近すぎる印を外し、秘密の洞窟の噂(item:flute)を新設');
removeMark('field', '0,2', '5,5', { expectStage: '0,0', label: '古道の道標（field 0,2）' });
setItemVariant('field', '0,2', '5,5', 'flute', [
	'【苔むした古道】',
	'この 石畳は 森の民が 敷いたもの。',
	'北へ 二つ 登れば 崖の 割れ目。',
	'南東の 水辺、{{flute}} 笛に 応える 岩肌が あるという。',
], { layer: 'field', stage: '8,9', label: '秘密の洞窟', kind: 'cave' }, '古道の道標（field 0,2）');
// 現行の秘密の洞窟の提供元（1画面・近すぎ）は本文だけ残す（mark は既に④の対象外＝別途削る）。
removeMark('field', '9,9', '7,8', { expectStage: '8,9', label: '秘密の洞窟の石碑（field 9,9）' });

// B. 沼地の洞窟(9,15) ← field 2,1(8,9) 森の祠（21画面・森の聖域の重複印を差し替え）
console.log('\n⑧B field 2,1(8,9) 森の祠＝森の聖域の重複印を沼地の洞窟の噂に差し替え');
setLines('field', '2,1', '8,9', {
	label: '森の祠（field 2,1）',
	oldFirst: '朽ちた祠が苔むしている。',
	newLines: [
		'朽ちた祠が苔むしている。',
		'古き森の民が祈りを捧げた場所だという。',
		'南へ 三つ 下れば 森の聖域。',
		'南東の 沼の ほとり、門柱の 傍らに 洞が あると 伝わる。',
		'宝も あるが、泥は 底なしだという。',
	],
});
setMark('field', '2,1', '8,9', { layer: 'field', stage: '9,15', label: '沼地の洞窟', kind: 'cave' }, '森の祠（field 2,1）');
// 現行の沼地の洞窟の提供元（1画面・近すぎ）は本文だけ残す。
removeMark('field', '8,15', '3,8', { expectStage: '9,15', label: '崩れた門柱（field 8,15）' });

// C. 樹海の岩室(0,0) ← field 6,14(4,4) 村を見守る碑（20画面・新設）
console.log('\n⑧C field 6,14(4,4) 村を見守る碑＝樹海の岩室の噂を新設');
setLines('field', '6,14', '4,4', {
	label: '村を見守る碑（field 6,14）',
	oldFirst: 'ルミアの女王 石に姿を変えられて 久し。',
	newLines: [
		'ルミアの女王 石に姿を変えられて 久し。',
		'旅人よ 星の欠片を八つ 北の祭壇へ。',
		'北西の 樹海の 奥に、かがり火を 携えた 岩室が あるという。',
	],
});
setMark('field', '6,14', '4,4', { layer: 'field', stage: '0,0', label: '樹海の岩室', kind: 'cave' }, '村を見守る碑（field 6,14）');
// 現行の樹海の岩室の提供元（2/4画面・近すぎ）は本文だけ残す。
removeMark('field', '3,1', '8,2', { expectStage: '0,0', label: '樹海の道標（field 3,1）' });

// D. 魔将の巣(6,0) ← field 0,14(2,3) 爆ぜた岩の跡（20画面・北の聖域の近すぎる印を移設）
console.log('\n⑧D field 0,14(2,3) 爆ぜた岩の跡＝魔将の巣の噂を新設（北の聖域の近すぎる印を外す）');
setLines('field', '0,14', '2,3', {
	label: '爆ぜた岩の跡（field 0,14・基本）',
	oldFirst: 'この 岩壁、火薬の 匂いがする。',
	newLines: [
		'この 岩壁、火薬の 匂いがする。',
		'硬い 砂岩は 火薬でしか 崩れぬ。',
		'北東の 虚空の 淵の 向こう岸に、鎧を 抱いて 眠る 者が いると 伝わる。',
	],
});
setItemVariantLines('field', '0,14', '2,3', 'bomb', {
	label: '爆ぜた岩の跡（field 0,14・item:bomb）',
	oldFirst: 'この 岩壁、火薬の 匂いがする。',
	newLines: [
		'この 岩壁、火薬の 匂いがする。',
		'今の 荷なら 砕けよう。',
		'北東の 虚空の 淵の 向こう岸に、鎧を 抱いて 眠る 者が いると 伝わる。',
	],
});
setMark('field', '0,14', '2,3', { layer: 'field', stage: '6,0', label: '魔将の巣', kind: 'cave' }, '爆ぜた岩の跡（field 0,14）');
removeMarkArrayItem('field', '7,1', '5,5', '6,0', '北の聖域（field 7,1）');

// ══════════════════════════════════════════════════════════════════════════
// ⑨ 町を目的地から外す＝field 1,16(4,4) 砂漠の道標の印を削除
//    （地図を拾った時点で村の印を立てるのは game/player.js pickDungeonItem() で対応済み）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n⑨ field 1,16(4,4) 砂漠の道標＝町の印を削除');
removeMark('field', '1,16', '4,4', { expectStage: '7,14', label: '砂漠の道標（field 1,16）' });

// ══════════════════════════════════════════════════════════════════════════
// 保存
// ══════════════════════════════════════════════════════════════════════════
fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き込み完了: ${MAP_PATH}`);

// ══════════════════════════════════════════════════════════════════════════
// 自己検証（書いた後に読み直す）
// ══════════════════════════════════════════════════════════════════════════
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const problems = [];

	// (1) 印＝行き先が実在／自己参照なし／目的地ごとに提供元がちょうど1件（町を除く）
	const marks = [];
	for (const [ln, layer] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const [pos, e] of Object.entries(st[src] ?? {})) {
					if (!e || typeof e !== 'object') continue;
					const push = (raw, via) => {
						if (!raw) return;
						for (const m of Array.isArray(raw) ? raw : [raw]) marks.push({ ln, sk, pos, via, m });
					};
					push(e.mark, 'mark');
					for (const [k, mv] of Object.entries(e.markAfterBoss ?? {})) push(mv, `markAfterBoss.${k}`);
				}
			}
		}
	}
	const byDest = new Map();
	for (const mk of marks) {
		const layer = mk.m.layer ?? mk.ln;
		if (!after.layers?.[layer]?.stages?.[mk.m.stage]) {
			problems.push(`印の行き先が実在しない: ${mk.ln} ${mk.sk} (${mk.pos}) ${mk.via} → ${layer}/${mk.m.stage}`);
		}
		if (layer === mk.ln && mk.m.stage === mk.sk) {
			problems.push(`自己参照の印: ${mk.ln} ${mk.sk} (${mk.pos}) ${mk.via}`);
		}
		const dk = `${layer}/${mk.m.stage}`;
		if (!byDest.has(dk)) byDest.set(dk, []);
		byDest.get(dk).push(mk);
	}
	for (const [dk, uses] of byDest) {
		if (uses.length > 1) {
			problems.push(`目的地 ${dk} の提供元が ${uses.length} 件ある（1目的地1提供元に反する）: `
				+ uses.map((u) => `${u.ln} ${u.sk} (${u.pos}) ${u.via}`).join(' / '));
		}
	}
	if (byDest.has('field/7,14')) problems.push('town(field/7,14) を指す印がまだ残っている（町は目的地から外したはず）');
	if (byDest.has('field/13,5')) problems.push('氷の廃墟の旧stage(field/13,5) を指す印が残っている（15,4 のはず）');

	// (2) 版を持つエントリの総数（tests/editor-dialog-variants.spec.js ⑥ の目印）
	let variantOwners = 0;
	for (const layer of Object.values(after.layers)) {
		for (const st of Object.values(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const e of Object.values(st[src] ?? {})) {
					if (e.linesAfterBoss || e.markAfterBoss) variantOwners++;
				}
			}
		}
	}
	if (variantOwners !== 43) problems.push(`版を持つエントリ数が想定と違う（想定43 / 実際 ${variantOwners}）`);

	console.log(`\n自己検証: 印 ${marks.length} 件 / 目的地 ${byDest.size} 種 / 版を持つエントリ ${variantOwners} 件`);
	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK');
}

// D5「氷の廃墟」の入口を石畳の町の中から氷の鐘楼へ移し、町の語りを入口の遠さに合わせる。
//
// 2026-09-19 のユーザー指摘（帯6＝17-7 の直後）：
//   ・`field 13,5` の看板は「人は二人／屋根は一つ」（商人ポポと重複）と「北西の壁際に
//     氷の廃墟の口」（エルンと石碑と三重）を言っていて要らない → 町名の1行だけにする。
//   ・入口が町と同じ画面にあって近すぎる → `field 15,4`「氷の鐘楼」へ移す（ユーザー選択）。
//   ・`field 13,5 (7,6)` の石碑は削除（入口の案内はエルンに一本化）。
//   ・`field 13,7` の川床の石碑は削除（3行とも画面を見れば分かることしか言わない）。
//   ・`field 15,4 (6,5)` の鐘楼の石碑は変更しない（ユーザー指示）。
//   ・エルンは方角だけ言う（「北東のほう」）＝きっちり道順を言わせない（ユーザー指示）。
//
// ⚠️ 消す石碑が「沼地の神殿」(`field 10,14`) の印の唯一の提供元だった∴印と踏破後の語りは
//    賢者エルンへ移す（1目的地1提供元を保つ・ユーザー選択）。
//
// ⚠️ 入口 '>' は `id: 'field_dungeon5'` を持つ＝`dungeon_5 1,3 (7,2)` から戻るときの
//    着地セルでもある（`shared/exits.js buildExitRegistry`）∴移設は帰り道の着地点も動かす。
//    作法は `scripts/migrate-field-13-5-dungeon-entrance.mjs`（2026-09-07 の 8,5→3,9）を継承。
//    今回の移設先は素の床ではなく鐘楼の外壁 `h` ∴そこだけ事前条件を変える。
//
// 使い方:
//   node scripts/migrate-d5-entrance-move.mjs
//   BLADE_MAP_PATH=.scratch/dry.json node scripts/migrate-d5-entrance-move.mjs   # 空撃ち
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = process.env.BLADE_MAP_PATH
	? path.resolve(process.env.BLADE_MAP_PATH)
	: path.join(ROOT, 'work/blade-of-lumia.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

const SWAMP_MARK = { layer: 'field', stage: '10,14', label: '沼地の神殿', kind: 'dungeon' };

function stage(layer, key) {
	const st = map.layers?.[layer]?.stages?.[key];
	if (!st) throw new Error(`stage が無い: ${layer} ${key}`);
	return st;
}

function entry(layer, key, pos) {
	const st = stage(layer, key);
	for (const src of ['signData', 'npcData']) {
		const e = st[src]?.[pos];
		if (e) return { e, src, st };
	}
	return null;
}

function setLines(layer, key, pos, { oldFirst, newLines, label }) {
	const found = entry(layer, key, pos);
	if (!found) throw new Error(`会話が無い: ${layer} ${key} (${pos})`);
	const { e, src } = found;
	const cur = e.lines ?? [];
	if (JSON.stringify(cur) === JSON.stringify(newLines)) {
		console.log(`  = ${label}（既に新しい本文・${src}）`);
		return;
	}
	if (cur[0] !== oldFirst) {
		throw new Error(`${label}: 1行目が想定と違う\n  想定: ${oldFirst}\n  実際: ${cur[0]}`);
	}
	e.lines = newLines;
	console.log(`  ✔ ${label}（${src} / ${cur.length}行 → ${newLines.length}行）`);
}

// 看板・NPC を消す。会話データと看板タイル 'i' の両方を落とす（'i' は本文必須のタイル
// ∴データだけ消すと無言看板になる＝[[blade-sign-two-formats]]）。
function removeSign(layer, key, pos, { expectName, expectTile = 'i', label }) {
	const st = stage(layer, key);
	const [r, c] = pos.split(',').map(Number);
	const found = entry(layer, key, pos);
	if (!found) {
		if (st.tiles[r][c] === expectTile) throw new Error(`${label}: 会話は無いのに看板タイルが残っている`);
		console.log(`  = ${label}（既に削除済み）`);
		return;
	}
	const { e, src } = found;
	if ((e.name ?? '') !== expectName) {
		throw new Error(`${label}: name が想定と違う（想定 "${expectName}" / 実際 "${e.name ?? ''}"）`);
	}
	if (st.tiles[r][c] !== expectTile) {
		throw new Error(`${label}: (${pos}) のタイルが '${expectTile}' でない（実際 '${st.tiles[r][c]}'）`);
	}
	delete st[src][pos];
	st.tiles[r][c] = '.';   // 下地は bgTiles の雪 's' がそのまま見える
	console.log(`  ✔ ${label} を削除（${src} と tiles (${pos}) の '${expectTile}'）`);
}

console.log(`対象: ${MAP_PATH}`);

// ── ① 看板 field 13,5 (6,11) ＝町名の1行だけにする ──────────────
// 落とす3行の理由＝「人は 二人。屋根は 一つ。」は商人ポポと重複／「北西の 壁際に…」は
// 入口の三重案内（しかも入口は 15,4 へ移る）／「西の 雪原には…」は ② でポポへ移す。
console.log('\n① field 13,5 (6,11) 看板＝【石畳の町】の1行だけにする');
setLines('field', '13,5', '6,11', {
	label: '石畳の町の看板',
	oldFirst: '【石畳の町】',
	newLines: ['【石畳の町】'],
});

// ── ② 商人ポポ＝西隣 12,5 の警告を引き取る（看板から移す）──────
// 12,5 は神殿兵 F ＋魔法使い C×2 の killAll 部屋∴事前に知る価値がある。
console.log('\n② field 13,5 (7,4) 商人ポポ＝西の雪原の警告を末尾に足す');
setLines('field', '13,5', '7,4', {
	label: '商人ポポ',
	oldFirst: 'ここは石畳の町だよ！',
	newLines: [
		'ここは石畳の町だよ！',
		'といいつつ人は私含めて二人しかいないし、建物らしきものもこれ一つしかないけどね。',
		'もう一人は賢者エルン。中で踊ってる。話しかけてみて！役に立たない話をしてくれるよ！',
		'西の雪原には神殿の兵が居座ってるから、行くなら準備してからね！',
	],
});

// ── ③ 賢者エルン＝方角だけ言う＋踏破後の版と印を引き取る ────────
// 口調は1字も変えない（帯6 の③の不可侵リスト）。6行目だけ差し替える＝入口が 15,4 へ
// 移る（13,5 から東2・北1＝北東の方角）∴「この家を出て東、石の並びの先に」は嘘になる。
// ユーザー指示＝「エルンの人はそんなきっちり言わなくていい。北東のほうに、と方角だけ」。
console.log('\n③ field 13,5 (4,5) 賢者エルン＝方角だけに緩める＋踏破後の版と印を引き取る');
setLines('field', '13,5', '4,5', {
	label: '賢者エルン',
	oldFirst: 'よく来た、勇者よ。',
	newLines: [
		'よく来た、勇者よ。',
		'謎の洞窟の奥に魔王が潜んでいる。',
		'強いから装備固めておくといいんだと思う。多分。',
		'洞窟の入り口はどこだったか……この辺りではないのじゃ。すまん。',
		'あと必ずしも魔王を倒せばこのゲームがクリアできるわけじゃないから気をつけてね。',
		'この町の北東のほうに「氷の廃墟」という恐ろしいダンジョンがあるのじゃ。',
		'凍てつく魔力に覆われ、多くの冒険者が帰らぬ旅に出た……とか言ってみたが実際は情報不足じゃ。',
	],
});
{
	const { e } = entry('field', '13,5', '4,5');
	const lines = [
		'おお、氷の廃墟を抜けたか。',
		'次は南東の沼じゃ。沼地の神殿に欠片があるはずじゃ。',
		'毒の堀は……はしごで渡れると聞いた。多分。',
	];
	e.linesAfterBoss ??= {};
	// ⚠️ キーの順が優先順（下が勝つ）＝既存の 'after'（星の欠片版）より後ろに置く∴
	//    D5 を踏破した後は沼の案内が出る。
	if (JSON.stringify(e.linesAfterBoss.L) === JSON.stringify(lines)) {
		console.log('  = エルンの linesAfterBoss.L（既に新設済み）');
	} else {
		if (e.linesAfterBoss.L) throw new Error(`エルンに別の linesAfterBoss.L がある: ${JSON.stringify(e.linesAfterBoss.L)}`);
		e.linesAfterBoss.L = lines;
		console.log('  ✔ エルンに linesAfterBoss.L を新設（3行）');
	}
	e.markAfterBoss ??= {};
	if (JSON.stringify(e.markAfterBoss.L) === JSON.stringify(SWAMP_MARK)) {
		console.log('  = エルンの markAfterBoss.L（既に沼地の神殿）');
	} else {
		if (e.markAfterBoss.L) throw new Error(`エルンに別の markAfterBoss.L がある: ${JSON.stringify(e.markAfterBoss.L)}`);
		e.markAfterBoss.L = { ...SWAMP_MARK };
		console.log('  ✔ エルンに markAfterBoss.L = field 10,14「沼地の神殿」');
	}
}

// ── ④ field 13,5 (7,6) の石碑を削除（入口の案内はエルンに一本化）──
// この石碑が持っていた印と踏破後の語りは ③ でエルンへ移した。
console.log('\n④ field 13,5 (7,6) 氷の廃墟の石碑を削除');
removeSign('field', '13,5', '7,6', { expectName: '石碑', label: '氷の廃墟の石碑' });

// ── ⑤ field 13,7 (8,6) の川床の石碑を削除 ───────────────────
// 3行とも「川幅2・橋は中ほど・蟲は板の上」＝画面を見れば分かる∴行動を何も変えない。
console.log('\n⑤ field 13,7 (8,6) 川床の石碑を削除');
removeSign('field', '13,7', '8,6', { expectName: '川床の石碑', label: '川床の石碑' });

// ── ⑥ D5 入口を field 13,5 (3,9) → field 15,4 (4,6) へ移設 ──────
// 15,4「氷の鐘楼」＝石畳の塔＋一対のかがり火 H(4,4)(4,7)＋蟲 α×2。(4,6) は塔の外壁 'h'
// ∴ここを口にすると「かがり火に挟まれた門」になる（下地 bgTiles は既に石畳 'o'）。
// 到達は南 (5,6) の石畳から1歩＝'h' を通行可にするだけでセルが増える∴詰みは作らない。
console.log('\n⑥ D5 入口を field 13,5 (3,9) → field 15,4 (4,6) へ移設');
{
	const from = stage('field', '13,5');
	const to = stage('field', '15,4');
	const FK = '3,9';
	const TK = '4,6';
	const done = to.tiles[4][6] === '>' && to.mapEnters?.[TK]?.destId === 'dungeon_5';
	if (done) {
		if (from.tiles[3][9] === '>' || from.mapEnters?.[FK]) throw new Error('移設が半分だけ適用されている');
		console.log('  = 既に移設済み');
	} else {
		const enter = from.mapEnters?.[FK];
		if (from.tiles[3][9] !== '>') throw new Error(`13,5 (3,9) が '>' でない: '${from.tiles[3][9]}'`);
		if (enter?.destId !== 'dungeon_5' || enter?.id !== 'field_dungeon5') {
			throw new Error(`13,5 (3,9) が想定した D5 入口でない: ${JSON.stringify(enter)}`);
		}
		if (to.tiles[4][6] !== 'h') throw new Error(`15,4 (4,6) が鐘楼の外壁 'h' でない: '${to.tiles[4][6]}'`);
		if (to.bgTiles?.[TK] !== 'o') throw new Error(`15,4 (4,6) の下地が石畳 'o' でない: '${to.bgTiles?.[TK]}'`);
		for (const key of ['mapEnters', 'showConditions', 'chestContents', 'npcData', 'signData', 'shopData', 'breakableWalls', 'floorItems']) {
			if (to[key]?.[TK]) throw new Error(`移設先 15,4 (${TK}) に ${key} が既にある`);
		}
		if (from.tiles[4][9] !== 'K') throw new Error(`13,5 (4,9) の鍵が無い: '${from.tiles[4][9]}'`);
		from.tiles[3][9] = '.';
		delete from.mapEnters[FK];
		to.mapEnters ??= {};
		to.tiles[4][6] = '>';
		to.mapEnters[TK] = { ...enter };
		console.log(`  ✔ 13,5 (${FK}) → 15,4 (${TK})（鐘楼の外壁を口に置き換えた）`);
	}
}

// ── 書き出し（整形はスペース2＝既存と揃える）───────────────────
fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き出した: ${MAP_PATH}`);

// ── 自己検証 ────────────────────────────────────────────
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const F = after.layers.field.stages;
	const problems = [];

	// (a) field の tiles は文字配列の配列のまま
	for (const [sk, st] of Object.entries(F)) {
		if (!Array.isArray(st.tiles?.[0])) problems.push(`field ${sk} の tiles が文字配列の配列でない`);
	}

	// (b) 入口は 15,4 (4,6) にちょうど1つ・戻り口も1つ
	const toD5 = [];
	const toField = [];
	for (const [lk, ld] of Object.entries(after.layers)) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [cell, e] of Object.entries(sd.mapEnters ?? {})) {
				if (e.destId === 'dungeon_5') toD5.push(`${lk}/${sk}@${cell}`);
				if (e.destId === 'field_dungeon5') toField.push(`${lk}/${sk}@${cell}`);
			}
		}
	}
	if (toD5.length !== 1 || toD5[0] !== 'field/15,4@4,6') problems.push(`dungeon_5 への入口が想定外: ${toD5.join(' ')}`);
	if (toField.length !== 1) problems.push(`field_dungeon5 への戻り口が想定外: ${toField.join(' ')}`);
	if (F['15,4'].tiles[4][6] !== '>') problems.push("15,4 (4,6) が '>' でない");
	if (F['13,5'].tiles[3][9] !== '.') problems.push('13,5 (3,9) が素の床に戻っていない');
	if (F['13,5'].tiles[4][9] !== 'K') problems.push('13,5 (4,9) の鍵が消えた');

	// (c) 消した看板のタイルも消えている／残した看板は本文つき
	if (F['13,5'].tiles[7][6] !== '.') problems.push("13,5 (7,6) の看板タイル 'i' が残っている");
	if (F['13,7'].tiles[8][6] !== '.') problems.push("13,7 (8,6) の看板タイル 'i' が残っている");
	if (F['13,5'].npcData['7,6']) problems.push('13,5 (7,6) の会話が残っている');
	if (F['13,7'].signData?.['8,6']) problems.push('13,7 (8,6) の会話が残っている');
	if (!F['13,5'].npcData['7,7']?.lines?.length) problems.push('13,5 (7,7) エルンの書き置きが壊れた');

	// (d) 印の全走査＝行き先が実在・自己参照でない・沼を渡すのはちょうど1箇所
	const marks = [];
	for (const [ln, L] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(L.stages || {})) {
			for (const src of ['signData', 'npcData']) {
				for (const [pos, e] of Object.entries(st[src] || {})) {
					const push = (m, via) => m && marks.push({ ln, sk, pos, via, m });
					push(e.mark, 'mark');
					for (const [k, m] of Object.entries(e.markAfterBoss || {})) push(m, `markAfterBoss.${k}`);
				}
			}
		}
	}
	for (const { ln, sk, pos, via, m } of marks) {
		const layer = m.layer ?? ln;
		if (!after.layers?.[layer]?.stages?.[m.stage]) problems.push(`印の行き先が実在しない: ${ln} ${sk} (${pos}) ${via}`);
		if (layer === ln && m.stage === sk) problems.push(`自己参照の印: ${ln} ${sk} (${pos}) ${via}`);
	}
	const swamp = marks.filter((mk) => `${mk.m.layer ?? mk.ln}/${mk.m.stage}` === 'field/10,14');
	if (swamp.length !== 1 || swamp[0].sk !== '13,5' || swamp[0].pos !== '4,5') {
		problems.push(`「沼地の神殿」を渡すのはエルン（13,5 の 4,5）1箇所のはず: ${swamp.map((s) => `${s.ln} ${s.sk} ${s.pos}`).join(' / ')}`);
	}

	// (e) 「氷の廃墟」を語る会話が残っているか（石碑を消した分の導線）
	let tellsD5 = 0;
	for (const [, L] of Object.entries(after.layers)) {
		for (const [, st] of Object.entries(L.stages || {})) {
			for (const src of ['signData', 'npcData']) {
				for (const e of Object.values(st[src] || {})) {
					const all = [...(e.lines ?? []), ...Object.values(e.linesAfterBoss ?? {}).flat(), ...(e.linesAfter ?? [])];
					if (all.some((l) => typeof l === 'string' && l.includes('氷の廃墟'))) tellsD5 += 1;
				}
			}
		}
	}
	if (tellsD5 < 2) problems.push(`「氷の廃墟」を語る会話が ${tellsD5} 件しかない`);

	console.log(`\n自己検証: 印 ${marks.length} 件 / 「氷の廃墟」を語る会話 ${tellsD5} 件`);
	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK');
}

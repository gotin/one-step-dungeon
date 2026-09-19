// Phase 17-8a（帯7前半＝沼地の神殿 D8 ＋ 沼の field 18 枚 ＋ 寄道 cave_1）の語りの作り直し。
//
// 2026-09-19 のユーザー承認済みの内容だけを書く（未承認の文はデータに入れない）。
//
// 帯7は会話 44 件（field 40／dungeon_8 4／cave_1 0）＝PLAN ⑤ の「25 枚を超えたら割る」に
// 当たる∴沼側（17-8a＝この番）と 沈んだ都・潮廊（17-8b）に分けた。
//
// 【棚卸しの結論】
//  ・盤面の直し（scripts/migrate-d8-ladder-gate.mjs）で「嘘」だった2枚が真になった∴温存:
//      dungeon_8 1,3「沼に橋を架けて渡れ。／ はしごを使うのだ。」
//      field 10,14 石碑「はしごで毒の堀を越えなければ 奥へは進めない。」
//    ＝看板に合わせて盤面を直した（看板を盤面に合わせて薄めるのではなく）。
//  ・不可侵＝field 10,14 ピンクあたま（本人の声）は1字も触らない。
//  ・作り直しは 6 枚だけ（下記①〜⑥）。他は実データと突き合わせて真＝温存。
//
// 【この番で書くもの】
//   ① field 8,17  沼に 沈む 廃村     … 笛の宝は実在しない（8,19 との重複＋空約束）
//   ② field 10,17 沼の一本道の道標   … 東西が逆（東 11,17＝都の裏門／西 9,17＝桟道）
//   ③ field 9,18  水没した林の道標   … 方角が両方誤り（南 9,19＝干潟／西 8,18＝沼尻）
//   ④ field 9,19  干潟の潮溜まりの石碑 … 潮の満ち引きは無い（橋 'v' は常設・潮門 '=' は 12,15 だけ）
//   ⑤ dungeon_8 1,1 ヒント → 沼の祭壇   … name の付与＋本文内の生の改行を2行に割る
//   ⑥ dungeon_8 1,2 ヒント → 笛の間の石碑 … name の付与＋箱の在処を語らせる
//   ⑦ field 8,15 崩れた門柱に印1件（→ field 9,15 沼地の洞窟）＝提供元ゼロ→1
//   ⑧ layer cave_1 の表示名「小さめの謎の洞窟」→「沼地の洞窟」（導線ゼロ警告の解消）
//   ⑨ 道具の版 3 件（笛を手にした後に沼へ戻る動機を作る）
//
// 使い方:
//   node scripts/migrate-dialog-band-7a.mjs                    # 本番（work/blade-of-lumia.json）
//   BLADE_MAP_PATH=/abs/path/dry.json node scripts/migrate-dialog-band-7a.mjs   # 空撃ち
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

// 事前条件つきの本文差し替え。冪等＝新しい本文が既に入っていれば黙って通す。
function setLines(layer, key, pos, { oldFirst, newLines, label }) {
	const { e, src } = entry(layer, key, pos);
	const cur = e.lines ?? [];
	if (JSON.stringify(cur) === JSON.stringify(newLines)) {
		console.log(`  = ${label}（既に新しい本文・${src}）`);
		return;
	}
	if (cur[0] !== oldFirst) {
		throw new Error(`${label}: 1行目が想定と違う\n  想定: ${JSON.stringify(oldFirst)}\n  実際: ${JSON.stringify(cur[0])}`);
	}
	e.lines = newLines;
	console.log(`  ✔ ${label}（${src} / ${cur.length}行 → ${newLines.length}行）`);
}

function setName(layer, key, pos, { oldName, newName, label }) {
	const { e, src } = entry(layer, key, pos);
	if (e.name === newName) { console.log(`  = ${label}（既に "${newName}"・${src}）`); return; }
	if ((e.name ?? '') !== oldName) {
		throw new Error(`${label}: name が想定と違う（想定 "${oldName}" / 実際 "${e.name ?? ''}"）`);
	}
	e.name = newName;
	console.log(`  ✔ ${label}（name "${oldName}" → "${newName}" / ${src}）`);
}

// 道具の版＝linesAfterBoss['item:<id>']（shared/dialog-variants.js ITEM_KEY_PREFIX）。
function setItemVariant(layer, key, pos, { item, lines, label }) {
	const { e, src } = entry(layer, key, pos);
	const k = `item:${item}`;
	if (!e.linesAfterBoss) e.linesAfterBoss = {};
	if (JSON.stringify(e.linesAfterBoss[k]) === JSON.stringify(lines)) {
		console.log(`  = ${label}（既に ${k} あり・${src}）`);
		return;
	}
	if (e.linesAfterBoss[k]) throw new Error(`${label}: ${k} が別の内容で既にある`);
	e.linesAfterBoss[k] = lines;
	console.log(`  ✔ ${label}（${k} を新設 / ${src}）`);
}

// ── ① field 8,17 沼に 沈む 廃村 ──────────────────────────────
// 実測＝この画面に fluteEffect も chestContents も無い。石畳 'o' 4マス（2,5/3,5/4,4/4,5）と
// 茂み 'u'(6,3) だけが残骸。笛の宝の話は 8,19（本物）と 11,14（本物）に任せる。
console.log('\n① field 8,17 沼に 沈む 廃村＝笛の空約束を落とす');
setLines('field', '8,17', '5,5', {
	label: '沼に 沈む 廃村',
	oldFirst: '沼が 呑み込んだ 村の 名残。',
	newLines: [
		'【沼に 沈む 廃村】',
		'沼が 呑み込んだ 村の 名残。',
		'石畳の 跡だけが 泥の 上に 残って いる。',
	],
});

// ── ② field 10,17 沼の一本道の道標＝東西が逆 ──────────────────
// 実測＝東隣 11,17 が【都の裏門】／西隣 9,17 が板 'v' 3枚の【ヒルの澱み】＝桟道。
console.log('\n② field 10,17 沼の一本道の道標＝東西を入れ替える');
setLines('field', '10,17', '4,6', {
	label: '沼の一本道の道標',
	oldFirst: '【沼の一本道】',
	newLines: [
		'【沼の一本道】',
		'畦から 降りるな。泥は 底なしだ。',
		'東の 口は 都の 裏門へ、西は 桟道へ 続く。',
	],
});

// ── ③ field 9,18 水没した林の道標＝方角が両方誤り ──────────────
// 実測＝南隣 9,19 が【干潟の潮溜まり】／西隣 8,18 が【沼尻の渡し】。東隣 10,18 は看板無しの泥。
console.log('\n③ field 9,18 水没した林の道標＝方角を実地に合わせる');
setLines('field', '9,18', '8,5', {
	label: '水没した林の道標',
	oldFirst: '【水没した林】',
	newLines: [
		'【水没した林】',
		'木は 立った まま 水に 沈んだ。',
		'板の 上だけを 歩け。南は 干潟、西は 沼尻。',
	],
});

// ── ④ field 9,19 干潟の潮溜まりの石碑＝潮の満ち引きは無い ────────
// 実測＝橋 'v' 6枚は常設で、潮ゲート '=' は 12,15 にしか無い（スイッチ 'Y' も無い）。
// 「潮が引く間だけ」は機構として嘘∴「引いた跡に板が渡っている」に直す。3行目の伝承は温存。
console.log('\n④ field 9,19 干潟の潮溜まりの石碑＝潮の嘘を落とす');
setLines('field', '9,19', '8,5', {
	label: '干潟の潮溜まりの石碑',
	oldFirst: '【干潟の潮溜まり】',
	newLines: [
		'【干潟の潮溜まり】',
		'潮が 退いた 跡に 板が 渡されて いる。',
		'三日 引かぬ 朝に、海は 都を 呑んだ。',
	],
});

// ── ⑤ dungeon_8 1,1＝name「ヒント」＋本文内の生の改行 ────────────
// 本文の文字列に "\n" が埋まっていた（1行として保存され、画面では潰れて出る）。
// 盤面は水の環に囲まれた島の中心に笛のワープがある形に直した∴それを語らせる。
console.log('\n⑤ dungeon_8 1,1＝name の付与と生の改行の解消');
setName('dungeon_8', '1,1', '1,9', { label: '沼の祭壇', oldName: 'ヒント', newName: '沼の祭壇' });
setLines('dungeon_8', '1,1', '1,9', {
	label: '沼の祭壇',
	oldFirst: '沼の祭壇で、笛を奏でよ。\n隠された道が現れる。',
	newLines: [
		'水の 環の 中心に 古い 壇が ある。',
		'笛を 奏でれば 隠された 道が 現れる。',
	],
});

// ── ⑥ dungeon_8 1,2＝name「ヒント」＋箱の在処 ──────────────────
// 実測＝この部屋の箱 (2,5) の中身が笛そのもの。
console.log('\n⑥ dungeon_8 1,2＝name の付与と箱の在処');
setName('dungeon_8', '1,2', '1,9', { label: '笛の間の石碑', oldName: 'ヒント', newName: '笛の間の石碑' });
setLines('dungeon_8', '1,2', '1,9', {
	label: '笛の間の石碑',
	oldFirst: '見えざる道は、音が開く。',
	newLines: [
		'見えざる 道は、音が 開く。',
		'この 間の 箱に その 音が 眠る。',
	],
});

// ── ⑦ field 8,15 崩れた門柱に印1件（→ field 9,15 沼地の洞窟）──────
// ⑦の規則（2026-09-19）＝1つの目的地に印を渡す提供元は最大1箇所。
// field/9,15（cave_1 の入口＝石4つを踏み板へ乗せると '>' が現れる画面）は提供元ゼロだった。
// 本文が既に「東の洞窟へ 続く道が あったという」と言っている西隣＝②境界の予告 型。
console.log('\n⑦ field 8,15 崩れた門柱に印（→ field 9,15 沼地の洞窟）');
{
	const { e, src } = entry('field', '8,15', '3,8');
	const want = { layer: 'field', stage: '9,15', label: '沼地の洞窟', kind: 'cave' };
	if (JSON.stringify(e.mark) === JSON.stringify(want)) {
		console.log(`  = 既に印あり（${src}）`);
	} else if (e.mark) {
		throw new Error(`崩れた門柱に別の印が既にある: ${JSON.stringify(e.mark)}`);
	} else {
		if (e.name !== '崩れた門柱') throw new Error(`崩れた門柱ではない: ${e.name}`);
		e.mark = want;
		console.log(`  ✔ mark を新設（${src}）: ${JSON.stringify(want)}`);
	}
}

// ── ⑧ layer cave_1 の表示名 ───────────────────────────────────
// 「小さめの謎の洞窟」は field 9,15 の石碑が呼ぶ【沼地の洞窟】と食い違い、
// check-dialog-integrity の「導線ゼロ」警告が出ていた（表示名を語る会話が1つも無い）。
// 旧名は docs にしか出ず、JS もテストも参照していない。
console.log('\n⑧ layer cave_1 の表示名を「沼地の洞窟」に');
{
	const layer = map.layers?.cave_1;
	if (!layer) throw new Error('layer cave_1 が無い');
	if (layer.name === '沼地の洞窟') console.log('  = 既に「沼地の洞窟」');
	else if (layer.name !== '小さめの謎の洞窟') throw new Error(`cave_1 の name が想定と違う: ${layer.name}`);
	else { layer.name = '沼地の洞窟'; console.log('  ✔ "小さめの謎の洞窟" → "沼地の洞窟"'); }
}

// ── ⑨ 道具の版（笛・はしご）────────────────────────────────────
// 笛は D8 の中で手に入る＝手にした後に沼へ戻る動機が既定文だけでは生まれない
// （「供えよ」と言われても、自分がもう持っていることに気づけない）。
console.log('\n⑨ 道具の版を 3 件');
setItemVariant('field', '11,14', '6,4', {
	label: '沼の 祭壇跡', item: 'flute',
	lines: ['沼を 統べし者に 捧ぐ 古き 祭壇。', 'その {{flute}} 笛を ここで 奏でよ。'],
});
setItemVariant('field', '8,19', '7,6', {
	label: '潮の祭壇の石碑', item: 'flute',
	lines: ['【潮の祭壇】', '海に 供物を 捧げた 壇。都は それでも 沈んだ。', 'その {{flute}} 笛を 奏でよ。水底の 宝が 応える。'],
});
setItemVariant('field', '11,15', '3,7', {
	label: '沼の 飛び石', item: 'ladder',
	lines: ['向こう岸まで 一歩 届かぬ 泥沼。', 'その {{ladder}} はしごを 架ければ 越えられる。'],
});

// ── 書き出し ──────────────────────────────────────────────
// ⚠️ インデントは必ず 2 スペース（タブだと 14 万行が全部差分になる）。
fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き出した: ${MAP_PATH}`);

// ── 自己検証 ──────────────────────────────────────────────
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const problems = [];

	// (1) 書いた本文が本当に入ったか＋読めるタイルの上にあるか
	const READABLE = new Set(['i', 'P', 'a', 'b', '$']);
	const expect = [
		['field', '8,17', '5,5', '【沼に 沈む 廃村】'],
		['field', '10,17', '4,6', '東の 口は 都の 裏門へ、西は 桟道へ 続く。'],
		['field', '9,18', '8,5', '板の 上だけを 歩け。南は 干潟、西は 沼尻。'],
		['field', '9,19', '8,5', '潮が 退いた 跡に 板が 渡されて いる。'],
		['dungeon_8', '1,1', '1,9', '笛を 奏でれば 隠された 道が 現れる。'],
		['dungeon_8', '1,2', '1,9', 'この 間の 箱に その 音が 眠る。'],
	];
	for (const [ln, sk, pos, needle] of expect) {
		const st = after.layers[ln].stages[sk];
		const e = st.signData?.[pos] ?? st.npcData?.[pos];
		if (!e) { problems.push(`会話が消えた: ${ln} ${sk} (${pos})`); continue; }
		if (!(e.lines ?? []).some((l) => l.includes(needle))) {
			problems.push(`本文が入っていない: ${ln} ${sk} (${pos}) ← ${needle}`);
		}
		const [r, c] = pos.split(',').map(Number);
		const t = st.tiles[r]?.[c];
		if (!READABLE.has(t)) problems.push(`読めないタイルの上: ${ln} ${sk} (${pos}) '${t}'`);
	}

	// (2) 本文に生の改行が残っていないこと（⑤で最後の1件を潰した）
	let raw = 0;
	for (const [ln, layer] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const [pos, e] of Object.entries(st[src] ?? {})) {
					for (const line of e.lines ?? []) {
						if (String(line).includes('\n')) { raw++; problems.push(`本文に生の改行: ${ln} ${sk} ${src}(${pos})`); }
					}
				}
			}
		}
	}

	// (3) 印＝行き先が実在／自己参照なし／field 9,15 の提供元がちょうど1件
	const marks = [];
	for (const [ln, layer] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const [pos, e] of Object.entries(st[src] ?? {})) {
					const push = (m, via) => m && marks.push({ ln, sk, pos, via, m });
					push(e.mark, 'mark');
					for (const [k, m] of Object.entries(e.markAfterBoss ?? {})) push(m, `markAfterBoss.${k}`);
				}
			}
		}
	}
	const byDest = new Map();
	for (const mk of marks) {
		const layer = mk.m.layer ?? mk.ln;
		if (!after.layers?.[layer]?.stages?.[mk.m.stage]) {
			problems.push(`印の行き先が実在しない: ${mk.ln} ${mk.sk} (${mk.pos}) ${mk.via} → ${layer} ${mk.m.stage}`);
		}
		if (layer === mk.ln && mk.m.stage === mk.sk) problems.push(`自己参照の印: ${mk.ln} ${mk.sk} (${mk.pos}) ${mk.via}`);
		const dk = `${layer}/${mk.m.stage}`;
		if (!byDest.has(dk)) byDest.set(dk, []);
		byDest.get(dk).push(mk);
	}
	const cave = byDest.get('field/9,15') ?? [];
	if (cave.length !== 1) {
		problems.push(`「沼地の洞窟」を渡す箇所が 1 でない（${cave.length}）: ${cave.map((s) => `${s.ln} ${s.sk} ${s.via}`).join(' / ')}`);
	}
	const temple = byDest.get('field/10,14') ?? [];
	if (temple.length !== 1) {
		problems.push(`「沼地の神殿」を渡す箇所が 1 でない（${temple.length}）＝帯6の申し送りに反した`);
	}

	// (4) cave_1 の表示名と、それを語る会話が1つ以上あること（導線ゼロの解消）
	if (after.layers.cave_1.name !== '沼地の洞窟') problems.push('cave_1 の name が「沼地の洞窟」でない');
	const corpus = [];
	for (const layer of Object.values(after.layers)) {
		for (const st of Object.values(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const e of Object.values(st[src] ?? {})) corpus.push(...(e.lines ?? []));
			}
		}
	}
	if (!corpus.join('\n').includes('沼地の洞窟')) problems.push('「沼地の洞窟」を語る会話が無い（導線ゼロのまま）');

	// (5) 道具の版が3件とも入ったか
	for (const [sk, pos, item] of [['11,14', '6,4', 'flute'], ['8,19', '7,6', 'flute'], ['11,15', '3,7', 'ladder']]) {
		const e = after.layers.field.stages[sk].signData[pos];
		if (!e.linesAfterBoss?.[`item:${item}`]) problems.push(`道具の版が無い: field ${sk} (${pos}) item:${item}`);
	}
	// 版を持つエントリの総数＝tests/editor-dialog-variants.spec.js ⑥ の目印
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

	console.log(`\n自己検証: 印 ${marks.length} 件 / 目的地 ${byDest.size} 種 / 生の改行 ${raw} 件`);
	console.log(`          版を持つエントリ ${variantOwners} 件（tests/editor-dialog-variants.spec.js ⑥ の目印）`);
	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK');
}

// Phase 17-8b（帯7後半＝沈んだ都・潮＝field 20 画面／会話 20 件）の語りの作り直し。
//
// 2026-09-19 のユーザー承認済みの内容だけを書く（未承認の文はデータに入れない）。
//
// 【棚卸しの結論】
//  ・不可侵（本人の声）＝0件。この帯に NPC は1人もいない（20 件すべて signData＝石碑・道標）。
//  ・温存 12 枚＝13,12 / 14,12 / 14,13 / 13,15 / 14,15 / 11,16 / 12,16 / 13,16 / 11,17 /
//    11,18 / 15,18 / 11,19 / 15,19（盤面と突き合わせて真。うち4枚に道具の版だけ足す）。
//  ・作り直し 5 枚＋削除 1 枚＋微修正 1 枚＋村名の統一。
//
// 【この番で書くもの】
//   ① field 12,12 堰の口          … 方角が嘘（東隣は堰守の庭。都の門は南）＋12,14 との二重を解消
//   ② field 13,13 隘路            … 看板ごと削除（ユーザー判断＝主張が2つとも嘘で、説明の意味もない）
//   ③ field 13,14 落水の段        … 「石を叩く」「一度止まる」が嘘（スイッチ 'Y' の永続トグル）
//   ④ field 12,17 沈んだ都の門    … 隣 11,17 と重複していた3行目を、壁の開け方に差し替え＋爆弾の版
//   ⑤ field 12,18 民の石碑        … 17-8a で書いた 9,19 と重複∴民の行いへ振る
//   ⑥ field 15,16 → 都の 東門     … 名前が 12,17 と衝突＋都の名を女王ルミアに結び直す
//   ⑦ field 15,15 潮廊の果て      … 微修正（「この先」→ 南へ下り西へ辿る＝実地の経路）
//   ⑧ 道具の版 5 件（bomb 2／ladder 1／flute 1／candle 1）
//   ⑨ 村の名を「ルミアの村」→「はじまりの村」（ユーザー決定＝ルミアは女王の名∴始まりの村に
//      女王の名を冠する理由が無い。海底都市の側にルミアの名を残す）
//
// 使い方:
//   node scripts/migrate-dialog-band-7b.mjs                    # 本番（work/blade-of-lumia.json）
//   BLADE_MAP_PATH=/abs/path/dry.json node scripts/migrate-dialog-band-7b.mjs   # 空撃ち
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

// ── ① field 12,12 堰の口の石碑＝方角の嘘 ─────────────────────
// 実測＝東隣 13,12 は【堰守の庭】。都の門（12,17）は南。しかも 17-8a が書いた 12,14
// 棚田の落し口が既に「南へ 下れば 潮が 呑んだ 都に 出る。」＝同じ振りの二重になる。
// ∴ここは「水の段」の連なり（12,12 → 東 13,12 → 南 13,14 落水の段 → 13,16 大瀑布の淵）を語る。
console.log('\n① field 12,12 堰の口の石碑＝方角を実地に合わせ、都への振りは 12,14 に一本化');
setLines('field', '12,12', '7,3', {
	label: '堰の口の石碑',
	oldFirst: '【堰の口】',
	newLines: [
		'【堰の口】',
		'湖の 水は ここから 段を 落ちて 海へ 向かう。',
		'水の 段は 東へ 折れ、南の 大瀑布で 海へ 落ちる。',
	],
});

// ── ② field 13,13 隘路の石碑＝看板ごと削除 ───────────────────
// ユーザー判断（2026-09-19）＝「13,13は看板ごと削除で。この説明も全然無意味。」
// 実測でこの石碑の主張は2つとも嘘だった＝「道は一本きり」（行0の泥 'w' が全通＝迂回できる）／
// 「番人が通す者だけが東へ抜ける」（killAll は宝箱を出すだけ・東の出口は最初から開いている）。
// 'i' タイルも外す（本文の無い 'i' は無言看板＝[[blade-sign-two-formats]]）。下地は泥 'w'∴通行可。
console.log('\n② field 13,13 隘路の石碑＝看板ごと削除（signData ＋ i タイル）');
{
	const st = map.layers.field.stages['13,13'];
	const rows = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : String(r).split('')));
	const cur = st.signData?.['8,4'];
	if (!cur && rows[8][4] !== 'i') {
		console.log('  = 既に削除済み');
	} else {
		if (!cur) throw new Error('signData(8,4) が無いのに i タイルが残っている＝無言看板');
		if (cur.name !== '隘路の石碑') throw new Error(`13,13 (8,4) が隘路の石碑ではない: ${cur.name}`);
		if (rows[8][4] !== 'i') throw new Error(`13,13 (8,4) が 'i' ではない: '${rows[8][4]}'`);
		const bg = st.bgTiles?.['8,4'];
		if (bg !== 'w') throw new Error(`13,13 (8,4) の下地が泥 'w' でない: '${bg}'（通行可か分からない）`);
		delete st.signData['8,4'];
		if (Object.keys(st.signData).length === 0) delete st.signData;
		rows[8][4] = '.';
		st.tiles = rows;
		console.log("  ✔ signData(8,4) を削除 ／ tiles(8,4) 'i' → '.'（下地は泥 'w'）");
	}
}

// ── ③ field 13,14 落水の段の石碑＝機構の嘘 ───────────────────
// 実測＝仕掛けは 'Y'（SWITCH＝武器で叩く永続トグル。'S' ボタンではない）が (1,3)＝滝の上。
// links 4本で潮ゲート '=' (2,6)(2,7) を開閉する∴「一度止まる」ではなく「もう一度打てば戻る」。
// ユーザー指摘（2026-09-19）＝「別に止まってるタイミングを見計らう必要があるわけでもない。
// それに叩くのは石じゃない。見るからにスイッチ」∴時間制限の匂いと「石」を落とす。
console.log('\n③ field 13,14 落水の段の石碑＝スイッチの永続トグルとして語る');
setLines('field', '13,14', '7,4', {
	label: '落水の段の石碑',
	oldFirst: '【落水の段】',
	newLines: [
		'【落水の段】',
		'滝の 上の スイッチを 打てば 落水が 止まる。',
		'もう 一度 打つと 元に 戻る。',
	],
});

// ── ④ field 12,17 沈んだ都の門の石碑＝隣との重複 ────────────────
// 実測＝11,17 都の裏門の「物置の 瓦礫の 奥に 運び出せぬ ものが 残る。」とほぼ同文で、
// 爆弾壁（breakDef 1）＋ルピー×80 まで同構造だった∴3行目を「壁の開け方」に差し替える。
// 役割を分ける＝11,17＝暮らしの物置／12,17＝門そのもの。
console.log('\n④ field 12,17 沈んだ都の門の石碑＝11,17 との重複を解消');
setLines('field', '12,17', '8,2', {
	label: '沈んだ都の門の石碑',
	oldFirst: '【沈んだ都の門】',
	newLines: [
		'【沈んだ都の門】',
		'女王は 残り、都は 潮の 下に 沈んだ。',
		'崩れた 壁は 火薬で 開く。奥に 何か 残って いる。',
	],
});

// ── ⑤ field 12,18 民の石碑＝17-8a で書いた 9,19 と重複 ──────────
// 9,19 干潟の潮溜まりが「三日 引かぬ 朝に、海は 都を 呑んだ。」を持つ∴ここは民の行いへ振る。
// 12,16 潮見の廃村「潮が 戻らぬ 事を 確かめ、皆 山へ 去った。」と連結する。
console.log('\n⑤ field 12,18 民の石碑＝海が呑んだ話を 9,19 に譲り、民の行いを語る');
setLines('field', '12,18', '5,7', {
	label: '民の 石碑',
	oldFirst: '潮が 三日 引かぬ 朝、',
	newLines: [
		'我らは 舟を 捨て、山へ 逃げた。',
		'女王は ひとり 都に 残った。',
		'残った 理由を 知る 者は いない。',
	],
});

// ── ⑥ field 15,16＝名前の衝突と都の名 ─────────────────────────
// 【沈んだ 都の 門】が 12,17【沈んだ都の門】と同名だった∴東の入口として改名する
// （門は3枚＝東門 15,16／門 12,17／裏門 11,17）。
// 「海底 都市 ルミアの 玄関」→ ルミアは女王の名（老賢者「この国の女王ルミア」・
// ザーネルの記憶 其の一〜三）∴「女王 ルミアの 都」と結び直す。方角の裏取り＝都（12,17）は西。
console.log('\n⑥ field 15,16＝【都の 東門】へ改名し、都の名を女王ルミアに結ぶ');
setName('field', '15,16', '3,1', { label: '都の 東門', oldName: '沈んだ 都の 門', newName: '都の 東門' });
setLines('field', '15,16', '3,1', {
	label: '都の 東門',
	oldFirst: 'ここは かつて 栄えた',
	newLines: [
		'【都の 東門】',
		'潮の 廊を 抜けた 者は ここから 都へ 入った。',
		'女王 ルミアの 都は 西に 沈んで いる。',
		'はしごで 渡れる 中州に 宝あり。',
	],
});

// ── ⑦ field 15,15 潮廊の果て＝微修正 ────────────────────────
// 実測の経路＝15,15 → 南 15,16 → 南 15,19 → 西 14,19 → 13,19 → 12,19（海の主 '{' と
// ボス錠 ':'）→ 11,19 女王の石碑。「この先」を実地の方角に置き換える。
console.log('\n⑦ field 15,15 潮 廊 の 果て＝「この先」を実地の経路に');
setLines('field', '15,15', '5,8', {
	label: '潮 廊 (しおろう) の 果て',
	oldFirst: '潮の 廊を 越えた 者よ。',
	newLines: [
		'潮の 廊を 越えた 者よ。',
		'南へ 下り 西へ 辿れば 都の 中枢 (ちゅうすう)。',
		'海の 主が その 門を 守って いる。',
	],
});

// ── ⑧ 道具の版 5 件 ─────────────────────────────────────────
// 帯7の道具＝爆弾（D6 で入手）・はしご（D5）・笛（D8）・ロウソク（D4）。
// どれも「持ってから都へ来る」道具∴持っている時に一歩踏み込んだ言い方に変える。
console.log('\n⑧ 道具の版を 5 件');
setItemVariant('field', '14,12', '7,3', {
	label: '風穴の崖の石碑', item: 'bomb',
	lines: ['【風穴の崖】', '岩の 割れ目から 海の 風が 鳴る。', 'その {{bomb}} で 割れ目を 開けよ。'],
});
setItemVariant('field', '14,13', '7,7', {
	label: '水路の分かれの石碑', item: 'ladder',
	lines: ['【水路の分かれ】', '水は 中洲で 二筋に 分かれ 海へ 落ちる。', 'その {{ladder}} を 抜けた 底へ 架けよ。'],
});
setItemVariant('field', '13,15', '8,4', {
	label: '滝裏の祭壇の石碑', item: 'flute',
	lines: ['【滝裏の祭壇】', '落水の 裏に 岩室が ある。', 'その {{flute}} を 吹け。祭壇が 応える。'],
});
setItemVariant('field', '11,18', '7,2', {
	label: '都の墓所の石碑', item: 'candle',
	lines: ['【都の墓所】', '灯を 絶やすな、と 都の 者は 言い置いた。', '火種は お前が 持って いる。{{candle}} で 灯を 継げ。'],
});
setItemVariant('field', '12,17', '8,2', {
	label: '沈んだ都の門の石碑', item: 'bomb',
	lines: ['【沈んだ都の門】', '女王は 残り、都は 潮の 下に 沈んだ。', '崩れた 壁は 火薬で 開く。その {{bomb}} を 使え。'],
});

// ── ⑨ 村の名＝「ルミアの村」→「はじまりの村」────────────────────
// ユーザー決定（2026-09-19）＝「むしろルミアの村の方を はじまりの村、とかにしたい。
// ゲームのタイトルだよ？最初の村になんでルミアの村ってつけるの？」
// 裏取り＝ルミアは女王の名（老賢者・村を見守る碑・ザーネルの記憶 其の一〜三）∴始まりの村に
// 冠する理由が無い。マップ内の「ルミアの村」は2箇所だけ（村人タロの1行目／砂漠の道標の印の label）。
console.log('\n⑨ 村の名を「はじまりの村」に統一');
setLines('field', '7,14', '3,5', {
	label: '村人 タロ',
	oldFirst: 'ここはルミアの村。草原のへりの、小さな村じゃよ。',
	newLines: [
		'ここは はじまりの村。草原のへりの、小さな村じゃよ。',
		'洞窟は村を出て西、そこからひとつ北。草原の窪みに口を開けておる。',
		'💡 看板は 向いて攻撃ボタンを押すと読めるぞ。',
		'旅人が言っておった。南西の砂漠に神殿があり、砂嵐が渦を巻いていると。',
		'西の森の奥には 巨きな者の気配があるとも。……わしは近づかんよ。',
		'この草原の窪みには、火があれば開く「草陰の祠」もあるという噂じゃ。',
	],
});
{
	const { e, src } = entry('field', '1,16', '4,4');
	if (e.mark?.label === 'はじまりの村') {
		console.log(`  = 砂漠の道標の印は既に「はじまりの村」（${src}）`);
	} else {
		if (e.mark?.label !== 'ルミアの村') throw new Error(`砂漠の道標の印の label が想定と違う: ${JSON.stringify(e.mark)}`);
		e.mark.label = 'はじまりの村';
		console.log(`  ✔ 砂漠の道標の印 label「ルミアの村」→「はじまりの村」（${src}）`);
	}
}

// ── 書き出し ──────────────────────────────────────────────
// ⚠️ インデントは必ず 2 スペース（タブだと 14 万行が全部差分になる）。
fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き出した: ${MAP_PATH}`);

// ── 自己検証 ──────────────────────────────────────────────
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const problems = [];
	const field = after.layers.field.stages;
	const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r : String(r).split('')));

	// (1) 書いた本文が入ったか＋読めるタイルの上にあるか
	const READABLE = new Set(['i', 'P', 'a', 'b', '$']);
	const expect = [
		['field', '12,12', '7,3', '水の 段は 東へ 折れ、南の 大瀑布で 海へ 落ちる。'],
		['field', '13,14', '7,4', '滝の 上の スイッチを 打てば 落水が 止まる。'],
		['field', '12,17', '8,2', '崩れた 壁は 火薬で 開く。奥に 何か 残って いる。'],
		['field', '12,18', '5,7', '残った 理由を 知る 者は いない。'],
		['field', '15,16', '3,1', '女王 ルミアの 都は 西に 沈んで いる。'],
		['field', '15,15', '5,8', '南へ 下り 西へ 辿れば 都の 中枢 (ちゅうすう)。'],
		['field', '7,14', '3,5', 'ここは はじまりの村。'],
	];
	for (const [ln, sk, pos, needle] of expect) {
		const st = after.layers[ln].stages[sk];
		const e = st.signData?.[pos] ?? st.npcData?.[pos];
		if (!e) { problems.push(`会話が消えた: ${ln} ${sk} (${pos})`); continue; }
		if (!(e.lines ?? []).some((l) => l.includes(needle))) {
			problems.push(`本文が入っていない: ${ln} ${sk} (${pos}) ← ${needle}`);
		}
		const [r, c] = pos.split(',').map(Number);
		const t = rowsOf(st)[r]?.[c];
		if (!READABLE.has(t)) problems.push(`読めないタイルの上: ${ln} ${sk} (${pos}) '${t}'`);
	}

	// (2) 13,13 は看板も 'i' タイルも消えたか（無言看板を残さない）
	{
		const st = field['13,13'];
		if (st.signData?.['8,4']) problems.push('13,13 (8,4) の signData が残っている');
		const rows = rowsOf(st);
		for (let r = 0; r < rows.length; r++) {
			for (let c = 0; c < rows[r].length; c++) {
				if (rows[r][c] === 'i') problems.push(`13,13 に 'i' が残っている: (${r},${c})`);
			}
		}
		if (rows[8][4] !== '.') problems.push(`13,13 (8,4) が '.' でない: '${rows[8][4]}'`);
	}

	// (3) 帯7後半 20 画面の会話が 19 件（20 − 削除1）で、全部読めるタイルの上
	const BAND = ['12,12', '13,12', '14,12', '13,13', '14,13', '13,14', '13,15', '14,15', '15,15',
		'11,16', '12,16', '13,16', '15,16', '11,17', '12,17', '11,18', '12,18', '15,18', '11,19', '15,19'];
	let bandCount = 0;
	for (const sk of BAND) {
		const st = field[sk];
		const rows = rowsOf(st);
		for (const src of ['signData', 'npcData']) {
			for (const [pos, e] of Object.entries(st[src] ?? {})) {
				bandCount++;
				const [r, c] = pos.split(',').map(Number);
				if (!READABLE.has(rows[r]?.[c])) problems.push(`読めない: field ${sk} ${src}(${pos}) '${rows[r]?.[c]}'`);
				if (!(e.lines ?? []).length) problems.push(`本文が空: field ${sk} ${src}(${pos})`);
			}
		}
	}
	if (bandCount !== 19) problems.push(`帯7後半の会話が 19 件でない（${bandCount} 件）`);

	// (4) 生の改行が無いこと（帯7a でマップ全体ゼロにした）
	const corpus = [];
	let raw = 0;
	for (const [ln, layer] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const [pos, e] of Object.entries(st[src] ?? {})) {
					for (const line of e.lines ?? []) {
						corpus.push(String(line));
						if (String(line).includes('\n')) { raw++; problems.push(`本文に生の改行: ${ln} ${sk} ${src}(${pos})`); }
					}
					for (const arr of Object.values(e.linesAfterBoss ?? {})) corpus.push(...arr.map(String));
				}
			}
		}
	}

	// (5) 印＝件数・行き先の実在・自己参照なし（この番は印を1件も足さない＝47 件のまま）
	const marks = [];
	for (const [ln, layer] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const e of Object.values(st[src] ?? {})) {
					const push = (m, via) => m && marks.push({ ln, sk, via, m });
					push(e.mark, 'mark');
					for (const [k, m] of Object.entries(e.markAfterBoss ?? {})) push(m, `markAfterBoss.${k}`);
				}
			}
		}
	}
	const byDest = new Set();
	for (const mk of marks) {
		const layer = mk.m.layer ?? mk.ln;
		if (!after.layers?.[layer]?.stages?.[mk.m.stage]) {
			problems.push(`印の行き先が実在しない: ${mk.ln} ${mk.sk} ${mk.via} → ${layer} ${mk.m.stage}`);
		}
		if (layer === mk.ln && mk.m.stage === mk.sk) problems.push(`自己参照の印: ${mk.ln} ${mk.sk} ${mk.via}`);
		byDest.add(`${layer}/${mk.m.stage}`);
	}
	if (marks.length !== 47) problems.push(`印が 47 件でない（${marks.length} 件）＝この番は印を足さない約束`);

	// (6) 村名の統一＝「ルミアの村」が本文にも印の label にも残っていない
	if (corpus.join('\n').includes('ルミアの村')) problems.push('本文に「ルミアの村」が残っている');
	if (!corpus.join('\n').includes('はじまりの村')) problems.push('「はじまりの村」を語る会話が無い');
	for (const mk of marks) {
		if (mk.m.label === 'ルミアの村') problems.push(`印の label に「ルミアの村」が残っている: ${mk.ln} ${mk.sk} ${mk.via}`);
	}

	// (7) 重複の解消＝「三日」（海が呑んだ朝）を語る本文は 9,19 の1行だけ
	const mikka = corpus.filter((l) => l.includes('三日'));
	if (mikka.length !== 1) problems.push(`「三日」を含む行が 1 でない（${mikka.length}）: ${JSON.stringify(mikka)}`);
	// 門の名前が衝突していないこと
	if (field['15,16'].signData['3,1'].name !== '都の 東門') problems.push('15,16 の name が「都の 東門」でない');

	// (8) 道具の版 5 件と、版を持つエントリの総数（tests/editor-dialog-variants.spec.js ⑥）
	for (const [sk, pos, item] of [['14,12', '7,3', 'bomb'], ['14,13', '7,7', 'ladder'],
		['13,15', '8,4', 'flute'], ['11,18', '7,2', 'candle'], ['12,17', '8,2', 'bomb']]) {
		if (!field[sk].signData[pos]?.linesAfterBoss?.[`item:${item}`]) {
			problems.push(`道具の版が無い: field ${sk} (${pos}) item:${item}`);
		}
	}
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
	if (variantOwners !== 44) problems.push(`版を持つエントリが 44 件でない（${variantOwners} 件）`);

	console.log(`\n自己検証: 帯7後半の会話 ${bandCount} 件 / 印 ${marks.length} 件 / 目的地 ${byDest.size} 種 / 生の改行 ${raw} 件`);
	console.log(`          版を持つエントリ ${variantOwners} 件（tests/editor-dialog-variants.spec.js ⑥ の目印）`);
	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK');
}

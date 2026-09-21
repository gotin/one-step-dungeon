// Phase 17-9b（帯8後半＝中原・連絡路＝field 21 画面／会話 22 件）の語りの作り直し。
//
// 2026-09-20 のユーザー承認済みの内容だけを書く（未承認の文はデータに入れない）。
//
// 【棚卸しの結論（17-10b/c 適用後の現物で再計測）】
//  ・不可侵（本人の声）＝0件。この帯に NPC は1人もいない（22 件すべて signData＝石碑・道標）。
//  ・温存 4 枚＝10,1（方角2つとも実測どおり）／14,8（bg s:42 d:50 o:28＝雪→砂→石畳が実在）／
//    6,4（石押しの仕掛けが実在。同文3枚のうち「正典」として1枚残す）／5,3 (8,3) 廃村の石碑。
//  ・本文の差し替え 17 枚（うち 2,10 は1語・15,11 は1行）＋名前の変更 6 件＋道具の版 7 件。
//
// 【この番で書くもの】
//   ① field 4,0  見台の石碑        … 生の英単語 `north` が本文に混入＋はしごの版が無い
//   ② field 4,1  四つ辻の道標      … 「西へ 崖の 見台」が嘘（見台は北1・西1は木56の森）＋弓の版
//   ③ 罅割れ壁 3 枚の書き分け      … 4,2 / 6,11 / 4,16 がほぼ同文＋爆弾の版 3 件
//   ④ field 10,2 篝火跡            … ろうそくの版が無い＋現れる宝箱が空だった（中身を入れる）
//   ⑤ field 5,3  廃城の石碑        … 17-8b の正典と衝突（女王の座は沈んだ都）
//   ⑥ field 11,3 火口を望む的      … 承認済み field 7,9「湖畔の的」とほぼ重複＋弓の版
//   ⑦ field 9,4  高原の環状石      … 「北は火の山」が嘘（北4は草原・D4 炎は北2東3）
//   ⑧ field 3,8  苔むした石標      … 6,4 と本文が完全一致∴別の声へ
//   ⑨ field 7,15 古びた石碑        … 石押し同文の3枚目∴別の声へ
//   ⑩ field 13,11 朽ちた道しるべ   … 道しるべなのに方角を1つも言わない
//   ⑪ field 15,11 潮廊の手前       … 1行目「難所はここで尽きる」が嘘（潮廊は南4まで続く）
//   ⑫ field 4,14 草原の道標        … 「北 … 村への近道」が嘘（村は東3）
//   ⑬ field 6,14 村を見守る碑      … 老賢者と同内容の反復（女王石化＋星8＋北の祭壇）
//   ⑭ field 7,19 澪の孤岩の石碑    … 「都の全てを見た」が嘘（都の門は北東7画面先）
//   ⑮ field 15,8 の名前            … 「沈んだ都の標」だが都の門は12画面先＝誤誘導（本文は真）
//   ⑯ field 2,10 草原の古祠        … 1語（西の森 → 北の森）
//   ⑰ field 8,1 の名前             … 「古びた石碑」が 7,15 と重複（ユーザー判断＝8,1 を変える）
//
// 【この番で触らないもの】
//   ・印（mark / markAfterBoss）＝増減 0 件。15 目的地すべて提供元が1つで、この 21 画面は
//     提供元になっていない（17-10b/c で掃除済み）。
//   ・`tiles`＝1マスも触らない∴`scripts/check-field-connectivity.mjs` の出力はバイト一致。
//
// 使い方:
//   node scripts/migrate-dialog-band-8b.mjs                    # 本番（work/blade-of-lumia.json）
//   BLADE_MAP_PATH=/abs/path/dry.json node scripts/migrate-dialog-band-8b.mjs   # 空撃ち
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = process.env.BLADE_MAP_PATH
	? path.resolve(process.env.BLADE_MAP_PATH)
	: path.join(ROOT, 'work/blade-of-lumia.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
console.log(`対象: ${MAP_PATH}`);

// ── 小道具（migrate-dialog-band-7b.mjs と同じ作法）────────────
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

// ── ① field 4,0 見台の石碑＝生の英単語 `north` ────────────────
// 実測＝亀裂 'x' が画面を横断し、その向こう (1,5) に宝箱（ルピー×50）。南1が四つ辻 (4,1)。
console.log('\n① field 4,0 見台の石碑＝本文に混入した英単語 `north` を直す');
setLines('field', '4,0', '7,4', {
	label: '見台の石碑',
	oldFirst: '【崖端の見台】',
	newLines: [
		'【崖端の見台】',
		'樹海の 北の 果て。ここで 地は 切れる。',
		'亀裂の 向こうに 箱が ひとつ。渡る 術なき 者は 覗くだけ。',
	],
});
setItemVariant('field', '4,0', '7,4', {
	label: '見台の石碑', item: 'ladder',
	lines: [
		'【崖端の見台】',
		'その {{ladder}} を 架けよ。亀裂は 一歩で 越える。',
		'向こうの 箱は まだ 開いて いない。',
	],
});

// ── ② field 4,1 四つ辻の道標＝方角が嘘 ───────────────────────
// 実測＝見台 (4,0) は北1／西1 (3,1) は木56の深い森／東3 が星の祭壇 (7,1)。
// 池の 'Y' は (2,9)＝水8セルの中。打つと gate (6,3) が退き、奥の箱 (6,2) がルピー×40。
// ⚠️ 弓専有の言い方にしない（PLAN 17 の申し送り＝はしごを (2,8) に架けても剣で届く）。
console.log('\n② field 4,1 四つ辻の道標＝方角を実測どおりに');
setLines('field', '4,1', '4,6', {
	label: '四つ辻の道標',
	oldFirst: '【森辺の四つ辻】',
	newLines: [
		'【森辺の四つ辻】',
		'北へ 崖の 見台、西へ 木深い 森、東へ 三つで 星の 祭壇。',
		'池の 中に 立つ 石の 目。打てば 南西の 門が 開く。',
	],
});
setItemVariant('field', '4,1', '4,6', {
	label: '四つ辻の道標', item: 'bow',
	lines: [
		'【森辺の四つ辻】',
		'池の 石の 目には その {{bow}} で 届く。',
		'南西の 門の 奥に 箱が ある。',
	],
});

// ── ③ 罅割れ壁 3 枚の書き分け＋爆弾の版 ──────────────────────
// 実測＝3枚とも '!'（壊せる壁）が宝箱を守る本物。中身は 4,2 ルピー×25／6,11 ルピー×25／
// 4,16 ルピー×20。本文がほぼ同文だった∴声を割る。
console.log('\n③ 罅割れ壁 3 枚を書き分ける（4,2 / 6,11 / 4,16）');
setName('field', '4,2', '2,8', {
	label: '森ぎわの罅割れ壁', oldName: '森ぎわの 罅割れ壁', newName: '苔むした 罅割れ壁',
});
setLines('field', '4,2', '2,8', {
	label: '苔むした罅割れ壁',
	oldFirst: '苔むした 岩壁に 罅 (ひび) が 走る。',
	newLines: [
		'苔の 下に 罅 (ひび) が 走って いる。',
		'岩は 押しても 動かぬ。砕く ほかない。',
	],
});
setItemVariant('field', '4,2', '2,8', {
	label: '苔むした罅割れ壁', item: 'bomb',
	lines: [
		'苔の 下の 罅。その {{bomb}} を 置けば 崩れる。',
		'奥に 小銭が 溜まって いる。',
	],
});

setName('field', '6,11', '6,7', {
	label: '罅の入った砦跡', oldName: '罅の入った砦跡', newName: '砦跡の 崩れ壁',
});
setLines('field', '6,11', '6,7', {
	label: '砦跡の崩れ壁',
	oldFirst: 'この岩壁、脆く 罅が走っている。',
	newLines: [
		'砦の 名は 残って いない。壁だけが 残った。',
		'北の 壁に 罅。手では どうにも ならぬ。',
	],
});
setItemVariant('field', '6,11', '6,7', {
	label: '砦跡の崩れ壁', item: 'bomb',
	lines: [
		'北の 壁の 罅に その {{bomb}} を。',
		'砦の 主が 遺した ものが 出る。',
	],
});

setName('field', '4,16', '6,7', {
	label: '罅割れた砦跡', oldName: '罅割れた砦跡', newName: '罅割れた 岩棚',
});
setLines('field', '4,16', '6,7', {
	label: '罅割れた岩棚',
	oldFirst: '北の岩壁、脆く 罅が入っている。',
	newLines: [
		'岩棚に 細い 罅。風が 通って 音が する。',
		'音の 向こうに 空 (から) の 間が ある。',
	],
});
setItemVariant('field', '4,16', '6,7', {
	label: '罅割れた岩棚', item: 'bomb',
	lines: [
		'罅に その {{bomb}} を 差せ。',
		'空の 間に 誰かの 蓄えが 残って いる。',
	],
});

// ── ④ field 10,2 篝火跡＝ろうそくの版＋空だった宝箱 ──────────
// 実測＝'H' かがり火が (3,5) (3,7) の2つ。showConditions (4,6) が torchesLit で宝箱を出すが
// chestContents が {} ＝**空の宝箱**だった（ユーザー判断 2026-09-20＝「とりあえずルピーを
// 入れよう。多めに」）∴ルピー×60 を入れる。かがり火2つ＝ろうそく必須の手間に見合う額。
console.log('\n④ field 10,2 篝火跡＝ろうそくの版＋現れる宝箱の中身');
setLines('field', '10,2', '2,8', {
	label: '火の山の麓の篝火跡',
	oldFirst: '冷えた 篝火が 二つ。',
	newLines: [
		'冷えた かがり火が 二つ。火を 待って いる。',
		'二つ 灯った とき、山は 隠して いた 宝を 見せる。',
	],
});
setItemVariant('field', '10,2', '2,8', {
	label: '火の山の麓の篝火跡', item: 'candle',
	lines: [
		'その {{candle}} の 火を 二つに 移せ。',
		'山が 隠した 宝が 現れる。',
	],
});
{
	const st = map.layers.field.stages['10,2'];
	const rows = st.tiles.map((r) => (Array.isArray(r) ? r : String(r).split('')));
	if (rows[4][6] !== 'B') throw new Error(`10,2 (4,6) が宝箱 'B' でない: '${rows[4][6]}'`);
	if (!st.chestContents) st.chestContents = {};
	const cur = st.chestContents['4,6'];
	if (cur && cur.value === 60) {
		console.log('  = 10,2 (4,6) の宝箱は既にルピー×60');
	} else if (cur) {
		throw new Error(`10,2 (4,6) の宝箱に別の中身が入っている: ${JSON.stringify(cur)}`);
	} else {
		st.chestContents['4,6'] = { type: 'rupee', value: 60, name: 'ルピー×60' };
		console.log('  ✔ 10,2 (4,6) の空の宝箱にルピー×60 を入れた');
	}
}

// ── ⑤ field 5,3 廃城の石碑＝17-8b の正典と衝突 ────────────────
// 正典（17-8b で確定）＝女王ルミアの座は**沈んだ都**（12,17 沈んだ都の門／15,16 都の東門
// 「女王 ルミアの 都は 西に 沈んで いる」／15,18／11,19 女王の石碑）∴「女王はここで民を
// 治めていた」は残せない。実測＝上半分は石畳 'o' と崩れ壁 '#' 2枚＋宝箱（大ルピー）。
// 同じ画面の廃村の石碑が「ザーネルの儀式が暴走した夜」を語る∴館の側もその夜に結ぶ。
// ⚠️ name は「廃城」を含むまま（tests/ruined-areas.spec.js が toContain('廃城')）。
console.log('\n⑤ field 5,3 廃城の石碑＝女王の座を沈んだ都へ返す');
setLines('field', '5,3', '3,3', {
	label: '廃城の石碑',
	oldFirst: 'かつてこの城にはルミアの王家が住んでいた。',
	newLines: [
		'【石畳の 残骸】',
		'ザーネルが 闇に 傾く 前、ここには 高い 館が 建って いた。儀式の 夜に 崩れた。',
		'女王の 座は ここでは ない。都は 遠い 海に 沈んで いる。',
	],
});

// ── ⑥ field 11,3 火口を望む的＝承認済み 7,9 とほぼ重複 ────────
// 実測＝'Y' が (4,5)＝水4セルの中。打つと gate (4,7) が退き、箱 (4,8) がルピー×30。
// 帯3の field 7,9「湖畔の的」（承認済み・触らない）と振りが同じ∴別の情景に振る。
// bg は草 'g' 主体（水は4セルだけ）∴「灰の池」等の焦土の語は使わない。
console.log('\n⑥ field 11,3 火口を望む的＝7,9 湖畔の的と別の声にする');
setLines('field', '11,3', '2,4', {
	label: '火口を望む的',
	oldFirst: '水を 隔てた 石の目。',
	newLines: [
		'山際の 水たまりに 石の 目が ひとつ。',
		'目を 覚ませば 東の 門が 退く。',
		'水は 浅くない。遠くから 当てても よい。',
	],
});
setItemVariant('field', '11,3', '2,4', {
	label: '火口を望む的', item: 'bow',
	lines: [
		'水たまりの 石の 目。その {{bow}} なら 濡れずに 済む。',
		'東の 門の 奥に 箱。',
	],
});

// ── ⑦ field 9,4 高原の環状石＝「北は火の山」が嘘 ──────────────
// 実測＝東3 (12,4) は bg s（雪）∴「東は白き峰」は真。北4 (9,0) は bg g の草原で木0。
// D4 炎の神殿 (12,2) は北2東3＝北東。
console.log('\n⑦ field 9,4 高原の環状石＝火の山は北ではなく北東');
setLines('field', '9,4', '5,5', {
	label: '高原の環状石',
	oldFirst: '旅人が 積んだ 環状の 石。',
	newLines: [
		'旅人が 積んだ 環状の 石。',
		'東へ 三つで 雪の 峰。北東の 空が 赤い のは 火の山。',
		'道は ここで 分かれる。',
	],
});

// ── ⑧ field 3,8 苔むした石標＝6,4 と本文が完全一致 ────────────
// 実測＝'*' 石／switch (6,7)／gate (5,5)／箱 (4,5) ルピー×10 ＝仕掛けは本物。
// 6,4 を「正典」として温存し、こちらは謎かけの声に振る。
console.log('\n⑧ field 3,8 苔むした石標＝6,4 との同文を解消');
setName('field', '3,8', '3,3', {
	label: '苔むした石標', oldName: '苔むした石標', newName: '削れた 石標',
});
setLines('field', '3,8', '3,3', {
	label: '削れた石標',
	oldFirst: '「石を 印の上へ 運べば 道は開かん」',
	newLines: [
		'石は 印の 上で 眠りたがる。',
		'眠らせれば 道は ひとつ 増える。',
	],
});

// ── ⑨ field 7,15 古びた石碑＝石押し同文の3枚目 ────────────────
// 実測＝'*' 石／switch (6,7)／gate (4,6)／箱 (4,7) 回復薬（小）。西隣が はじまりの村 (7,14)。
// ⚠️ name「古びた石碑」は温存（重複していた field 8,1 の側を ⑰ で改名する＝ユーザー判断）。
console.log('\n⑨ field 7,15 古びた石碑＝村の子らの声に振る');
setLines('field', '7,15', '5,2', {
	label: '古びた石碑（村外れ）',
	oldFirst: '「石を 印の上へ 運べば 道は開かん」',
	newLines: [
		'村の 子らは この石を 「動かぬ 石の 兄」と 呼ぶ。',
		'兄では ない 石が 一つ ある。印の 上へ 運べ。',
	],
});

// ── ⑩ field 13,11 朽ちた道しるべ＝方角を1つも言わない ─────────
// 実測＝南1 (13,12) は bg w（海のスキン）／南3 (13,14) も w∴「南へ下れば水」は真。
// 北6 が石畳の町 (13,5)。道しるべなのに行き先が無かった∴方角を入れる。
console.log('\n⑩ field 13,11 朽ちた道しるべ＝方角を入れる');
setLines('field', '13,11', '3,5', {
	label: '朽ちた道しるべ',
	oldFirst: 'この先、水は 深く昏い。',
	newLines: [
		'【泥の 道しるべ】',
		'南へ 下れば 水は 深く 昏い。戻る 道は 北。',
		'北へ 六つで 石畳の 町。',
	],
});

// ── ⑪ field 15,11 潮廊の手前＝1行目だけ差し替え ───────────────
// ユーザー確認（2026-09-20）＝2〜3行目の示唆（先の画面でスイッチが潮を引かせる）は正しい
// ∴温存。嘘は1行目「海の難所はここで尽きる」＝実測では潮廊は南4 (15,15 潮廊の果て) まで
// 続く＝この画面は入口。加えて「術」（道具に読める）→「仕掛け」（実体はスイッチ）。
// この画面自身の障害は水の敵6匹（'&'×3 '<' '/'×2）＋killAll で箱（ルピー×25）。
console.log('\n⑪ field 15,11 潮廊の手前＝1行目と「術」だけ直す');
setLines('field', '15,11', '7,4', {
	label: '潮廊の手前',
	oldFirst: '海の 難所は ここで 尽きる。',
	newLines: [
		'水の 番を 沈めれば ここは 通れる。',
		'この先の 廊は 潮が 満ちて 塞ぐ。',
		'潮を 引かせる 仕掛けを 探せ。',
	],
});

// ── ⑫ field 4,14 草原の道標＝「北 … 村への近道」が嘘 ──────────
// 実測＝村 (7,14) は東3／西2 (2,14) が bg d の砂／南は 4,15 草・4,17 に橋・4,18 以降は水。
console.log('\n⑫ field 4,14 草原の道標＝方角を実測どおりに');
setLines('field', '4,14', '3,5', {
	label: '草原の道標',
	oldFirst: '北 … 村への近道',
	newLines: [
		'東 … 三つ 行けば 村',
		'西 … 二つで 砂の 地',
		'南 … 草は 続き、やがて 水',
	],
});

// ── ⑬ field 6,14 村を見守る碑＝老賢者と同内容の反復 ───────────
// 実測＝東1 が はじまりの村 (7,14)／北1 が D1 草原の洞窟 (6,13)。星の祭壇 (7,1) は北13東1＝
// 14画面先∴この碑が祭壇を指す理由が無い（老賢者が村で同じ事を語っている）。
console.log('\n⑬ field 6,14 村を見守る碑＝村の手前の声に振る');
setLines('field', '6,14', '4,4', {
	label: '村を見守る碑',
	oldFirst: 'ルミアの女王 石に姿を変えられて 久し。',
	newLines: [
		'【村の 手前】',
		'東へ ひとつで 人の 声。北へ ひとつで 岩の 口。',
		'旅人よ、ここから 先は 誰かの 暮らし。荒らすな。',
	],
});

// ── ⑭ field 7,19 澪の孤岩の石碑＝「都の全てを見た」が嘘 ────────
// 実測＝沈んだ都の門 (12,17) は北2東5＝7画面先／女王の石碑 (11,19) は28画面先。
console.log('\n⑭ field 7,19 澪の孤岩の石碑＝都はまだ先だと言い直す');
setLines('field', '7,19', '7,7', {
	label: '澪の孤岩の石碑',
	oldFirst: '【澪の孤岩】',
	newLines: [
		'【澪の孤岩】',
		'海に ひとつだけ 突き出た 岩。潮の 筋が ここで 外海へ 抜ける。',
		'沈んだ 都の 門は ここでは ない。北東へ 七つ。',
	],
});

// ── ⑮ field 15,8 の名前＝都を指す名が誤誘導 ───────────────────
// 実測＝沈んだ都の門 (12,17) は南9西3＝12画面先。本文（射水魚 '/' が撃ってくる）は真∴名前だけ。
console.log('\n⑮ field 15,8 の名前＝「沈んだ都の標」は12画面先を指していた');
setName('field', '15,8', '7,2', {
	label: '海境の標', oldName: '沈んだ 都の 標 (しるし)', newName: '海境の 標 (しるし)',
});

// ── ⑯ field 2,10 草原の古祠＝1語だけ ─────────────────────────
// 実測＝西1 (1,10) は木4／北2〜北5 (2,8〜2,5) が木71〜74 の森／南5 が D2 砂漠 (2,15)。
console.log('\n⑯ field 2,10 草原の古祠＝森は西ではなく北');
setLines('field', '2,10', '4,4', {
	label: '草原の古祠',
	oldFirst: '旅の 無事を 祈る 小さな祠。',
	newLines: [
		'旅の 無事を 祈る 小さな祠。',
		'北の 森、南の 砂 — 道は ここで 交わる。',
	],
});

// ── ⑰ field 8,1 の名前＝7,15 と重複 ──────────────────────────
// ユーザー判断（2026-09-20）＝「8,1 を変えよう。天空の石碑、とか」。
// 裏取り＝8,1 の本文1行目が【空島】＝翼の羽衣で虚空を越える画面∴名として整合する。
// ⚠️ 8,1 はこの帯の21画面の外。名前の重複を解消するための1件だけの越境。
console.log('\n⑰ field 8,1 の名前＝「古びた石碑」を 7,15 に譲る');
setName('field', '8,1', '7,2', {
	label: '天空の石碑', oldName: '古びた石碑', newName: '天空の石碑',
});

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
	const READABLE = new Set(['i', 'P', 'a', 'b', '$']);

	// (1) 書いた本文が入ったか＋読めるタイルの上にあるか
	const expect = [
		['4,0', '7,4', '亀裂の 向こうに 箱が ひとつ。'],
		['4,1', '4,6', '北へ 崖の 見台、西へ 木深い 森、東へ 三つで 星の 祭壇。'],
		['4,2', '2,8', '苔の 下に 罅 (ひび) が 走って いる。'],
		['10,2', '2,8', '二つ 灯った とき、山は 隠して いた 宝を 見せる。'],
		['5,3', '3,3', '女王の 座は ここでは ない。'],
		['11,3', '2,4', '山際の 水たまりに 石の 目が ひとつ。'],
		['9,4', '5,5', '北東の 空が 赤い のは 火の山。'],
		['3,8', '3,3', '石は 印の 上で 眠りたがる。'],
		['6,11', '6,7', '砦の 名は 残って いない。'],
		['13,11', '3,5', '北へ 六つで 石畳の 町。'],
		['15,11', '7,4', '水の 番を 沈めれば ここは 通れる。'],
		['4,14', '3,5', '東 … 三つ 行けば 村'],
		['6,14', '4,4', '東へ ひとつで 人の 声。北へ ひとつで 岩の 口。'],
		['7,15', '5,2', '兄では ない 石が 一つ ある。'],
		['4,16', '6,7', '岩棚に 細い 罅。'],
		['7,19', '7,7', '沈んだ 都の 門は ここでは ない。北東へ 七つ。'],
		['2,10', '4,4', '北の 森、南の 砂'],
	];
	for (const [sk, pos, needle] of expect) {
		const st = field[sk];
		const e = st.signData?.[pos] ?? st.npcData?.[pos];
		if (!e) { problems.push(`会話が消えた: field ${sk} (${pos})`); continue; }
		if (!(e.lines ?? []).some((l) => l.includes(needle))) {
			problems.push(`本文が入っていない: field ${sk} (${pos}) ← ${needle}`);
		}
		const [r, c] = pos.split(',').map(Number);
		const t = rowsOf(st)[r]?.[c];
		if (!READABLE.has(t)) problems.push(`読めないタイルの上: field ${sk} (${pos}) '${t}'`);
	}

	// (2) 温存した4枚が1文字も変わっていないこと
	const KEEP = [
		['10,1', '3,6', '【茂み道】'],
		['14,8', '7,5', '【潮の 見張り櫓】'],
		['6,4', '3,8', '「石を 印の上へ 運べば 道は 開かん」'],
		['5,3', '8,3', 'かつてこの村には人々が暮らしていた。'],
	];
	for (const [sk, pos, first] of KEEP) {
		const e = field[sk].signData?.[pos] ?? field[sk].npcData?.[pos];
		if (e?.lines?.[0] !== first) problems.push(`温存すべき本文が変わった: field ${sk} (${pos})`);
	}
	// 15,8 は名前だけ＝本文2行は温存
	if (field['15,8'].signData['7,2'].lines[0] !== 'ここより 先は 海の 領分。') {
		problems.push('15,8 の本文が変わった（名前だけ直す約束）');
	}
	// 15,11 の 2〜3行目も温存（ユーザー確認済み）
	if (field['15,11'].signData['7,4'].lines[1] !== 'この先の 廊は 潮が 満ちて 塞ぐ。') {
		problems.push('15,11 の2行目が変わった');
	}

	// (3) 帯8後半 21 画面の会話が 22 件のまま（削除も追加もしない）＋全部読めるタイルの上
	const BAND = ['4,0', '4,1', '4,2', '10,1', '10,2', '5,3', '11,3', '6,4', '9,4', '3,8', '14,8',
		'15,8', '2,10', '6,11', '13,11', '15,11', '4,14', '6,14', '7,15', '4,16', '7,19'];
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
	if (bandCount !== 22) problems.push(`帯8後半の会話が 22 件でない（${bandCount} 件）`);

	// (4) 全体の棚卸し＝生の改行・名前の重複・英単語の混入
	const corpus = [];
	const names = new Map();
	let raw = 0;
	for (const [ln, layer] of Object.entries(after.layers)) {
		if (ln === 'test_mechanics') continue;
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const [pos, e] of Object.entries(st[src] ?? {})) {
					for (const line of e.lines ?? []) {
						corpus.push(String(line));
						if (String(line).includes('\n')) { raw++; problems.push(`本文に生の改行: ${ln} ${sk} ${src}(${pos})`); }
					}
					for (const arr of Object.values(e.linesAfterBoss ?? {})) corpus.push(...arr.map(String));
					if (e.name) names.set(e.name, [...(names.get(e.name) ?? []), `${ln} ${sk} (${pos})`]);
				}
			}
		}
	}
	// この帯で名前を触った6件が重複していないこと
	for (const nm of ['苔むした 罅割れ壁', '砦跡の 崩れ壁', '罅割れた 岩棚', '削れた 石標',
		'海境の 標 (しるし)', '天空の石碑', '古びた石碑']) {
		const at = names.get(nm) ?? [];
		if (at.length !== 1) problems.push(`名前 "${nm}" が 1 箇所でない（${at.length}）: ${at.join(' / ')}`);
	}
	// 生の英単語 north（①で消した）が本文に残っていないこと
	if (corpus.some((l) => /\bnorth\b/i.test(l))) problems.push('本文に生の英単語 north が残っている');

	// (5) 印＝1件も増減していない（15 件 / 15 目的地）
	const marks = [];
	for (const [ln, layer] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const e of Object.values(st[src] ?? {})) {
					// ⚠️ mark は1件の物体とは限らない＝field 7,1 (5,5) は配列で2目的地を渡す
					// （shared/marks.js が配列を受ける）∴必ず平らにしてから数える。
					const push = (m, via) => {
						if (!m) return;
						for (const one of Array.isArray(m) ? m : [m]) marks.push({ ln, sk, via, m: one });
					};
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
			problems.push(`印の行き先が実在しない: ${mk.ln} ${mk.sk} ${mk.via} → ${layer} ${mk.m.stage}`);
		}
		if (layer === mk.ln && mk.m.stage === mk.sk) problems.push(`自己参照の印: ${mk.ln} ${mk.sk} ${mk.via}`);
		const k = `${layer}/${mk.m.stage}`;
		byDest.set(k, (byDest.get(k) ?? 0) + 1);
	}
	if (marks.length !== 15) problems.push(`印が 15 件でない（${marks.length} 件）＝この番は印を触らない約束`);
	if (byDest.size !== 15) problems.push(`目的地が 15 種でない（${byDest.size} 種）`);
	for (const [k, n] of byDest) if (n > 1) problems.push(`1目的地=1提供元 に違反: ${k} に ${n} 件`);

	// (6) 道具の版 7 件と、版を持つエントリの総数（tests/editor-dialog-variants.spec.js ⑥）
	for (const [sk, pos, item] of [['4,1', '4,6', 'bow'], ['11,3', '2,4', 'bow'],
		['4,2', '2,8', 'bomb'], ['6,11', '6,7', 'bomb'], ['4,16', '6,7', 'bomb'],
		['10,2', '2,8', 'candle']]) {
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

	// (7) 10,2 の宝箱が空でないこと
	if (!field['10,2'].chestContents?.['4,6']) problems.push('10,2 (4,6) の宝箱が空のまま');

	console.log(`\n自己検証: 帯8後半の会話 ${bandCount} 件 / 印 ${marks.length} 件 / 目的地 ${byDest.size} 種 / 生の改行 ${raw} 件`);
	console.log(`          版を持つエントリ ${variantOwners} 件（tests/editor-dialog-variants.spec.js ⑥ の目印＝50 を期待）`);
	if (variantOwners !== 50) problems.push(`版を持つエントリが 50 件でない（${variantOwners} 件）`);
	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK');
}

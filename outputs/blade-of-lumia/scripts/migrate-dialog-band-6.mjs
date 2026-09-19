// Phase 17-7（帯6＝D5 氷の廃墟／雪原の 27 画面）の語りの作り直しと目的地マークの配置。
//
// 2026-09-19 のユーザー承認済みの内容だけを書く（未承認の文はデータに入れない）。
//
// ⚠️ 着手時の棚卸しで「嘘」と報告した看板4枚（field 11,6／12,8／13,7 の一部／15,7）は
//    誤判定だった＝bgTiles の水も通行不可（game/passable.js の isWaterAt が tiles 層と
//    bgTiles 層の '~' を同じ扱いに畳む）。∴それらは温存する。実際に直すのは下記だけ。
//
// 本文の書き換え 6 件／盤面 1 件（蟲の位置）／name の付与 2 件／印 1 件＋老賢者から 1 件削除。
//
// 使い方:
//   node scripts/migrate-dialog-band-6.mjs                     # 本番（work/blade-of-lumia.json）
//   BLADE_MAP_PATH=.scratch/dry.json node scripts/migrate-dialog-band-6.mjs   # 空撃ち
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = process.env.BLADE_MAP_PATH
	? path.resolve(process.env.BLADE_MAP_PATH)
	: path.join(ROOT, 'work/blade-of-lumia.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// ── 小道具 ────────────────────────────────────────────────
function stage(layer, key) {
	const st = map.layers?.[layer]?.stages?.[key];
	if (!st) throw new Error(`stage が無い: ${layer} ${key}`);
	return st;
}

// 会話エントリを取る。signData / npcData の二重の置き場所のどちらにあるかは
// データ側の事実に従う（書き先を間違えるとゲームが黙って無視する）。
function entry(layer, key, pos) {
	const st = stage(layer, key);
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
		throw new Error(`${label}: 1行目が想定と違う\n  想定: ${oldFirst}\n  実際: ${cur[0]}`);
	}
	e.lines = newLines;
	console.log(`  ✔ ${label}（${src} / ${cur.length}行 → ${newLines.length}行）`);
}

function setName(layer, key, pos, { oldName, newName, label }) {
	const { e, src } = entry(layer, key, pos);
	if (e.name === newName) {
		console.log(`  = ${label}（既に "${newName}"・${src}）`);
		return;
	}
	if ((e.name ?? '') !== oldName) {
		throw new Error(`${label}: name が想定と違う（想定 "${oldName}" / 実際 "${e.name ?? ''}"）`);
	}
	e.name = newName;
	console.log(`  ✔ ${label}（name "${oldName}" → "${newName}" / ${src}）`);
}

console.log(`対象: ${MAP_PATH}`);

// ── ① field 13,5 の看板＝帯1（ルミアの村 7,14）の本文がコピーで残っていた ──
// 実測＝この画面は「石畳の町」（家1軒・人2人）で、D5 入口 '>' は (3,9)。
// 看板 (6,11) から見て入口は北3・西2＝北西。西隣 12,5 に神殿の精鋭（F＋C×2・killAll）。
console.log('\n① field 13,5 (6,11) 看板＝【ルミアの村】のコピーを作り直す');
setLines('field', '13,5', '6,11', {
	label: '石畳の町の看板',
	oldFirst: '【ルミアの村】',
	newLines: [
		'【石畳の町】',
		'人は 二人。屋根は 一つ。',
		'北西の 壁際に 氷の 廃墟の 口が 開く。',
		'西の 雪原には 神殿の 精鋭が 居る。',
	],
});

// ── ② 賢者エルン（③の不可侵リスト＝口調は1字も変えない・事実だけ直す）──
// 直したのは3点だけ：
//  ・魔王の洞窟の場所＝「左どなり」は嘘（西隣 12,5 に mapEnters は無く、darklord_prison の
//    入口は field のどこにも無い＝接続チェッカーの既知の未到達）→「分からん」に落とす
//  ・「洞窟に地図も落ちてる」＝darklord_prison の3室に 'm'/'n' は0個 → 行ごと削除
//  ・「この町の南に氷の廃墟」＝実際はエルン(4,5)から北1・東4 → 「この家を出て東」
console.log('\n② field 13,5 (4,5) 賢者エルン＝口調温存・事実だけ直す');
setLines('field', '13,5', '4,5', {
	label: '賢者エルン',
	oldFirst: 'よく来た、勇者よ。',
	newLines: [
		'よく来た、勇者よ。',
		'謎の洞窟の奥に魔王が潜んでいる。',
		'強いから装備固めておくといいんだと思う。多分。',
		'洞窟の入り口はどこだったか……この辺りではないのじゃ。すまん。',
		'あと必ずしも魔王を倒せばこのゲームがクリアできるわけじゃないから気をつけてね。',
		'この家を出て東、石の並びの先に「氷の廃墟」という恐ろしいダンジョンがあるのじゃ。',
		'凍てつく魔力に覆われ、多くの冒険者が帰らぬ旅に出た……とか言ってみたが実際は情報不足じゃ。',
	],
});

// ── ③ 商人ポポ（不可侵）＝最終行の操作説明だけ落とす ──
// 「看板に剣を向けて振ると読めるよ！」＝操作説明は帯1（村・草原・D1）の中だけに閉じる規約（⑥）。
// 他の3行は実測で真（人が2人・建物1軒・エルンは家の中）∴1字も触らない。
console.log('\n③ field 13,5 (7,4) 商人ポポ＝操作説明の1行だけ削除');
setLines('field', '13,5', '7,4', {
	label: '商人ポポ',
	oldFirst: 'ここは石畳の町だよ！',
	newLines: [
		'ここは石畳の町だよ！',
		'といいつつ人は私含めて二人しかいないし、建物らしきものもこれ一つしかないけどね。',
		'もう一人は賢者エルン。中で踊ってる。話しかけてみて！役に立たない話をしてくれるよ！',
	],
});

// ── ④ field 13,5 (7,6) 石碑＝4行目の方角だけ直す＋帯6 唯一の印を置く ──
// 実測＝石碑(7,6) から D5 入口 '>'(3,9) は北4・東3。「すぐ右」は不正確。
// 1〜3行目（世界観）と linesAfterBoss.L は温存。
console.log('\n④ field 13,5 (7,6) 氷の廃墟の石碑＝方角の訂正＋markAfterBoss.L');
setLines('field', '13,5', '7,6', {
	label: '氷の廃墟の石碑',
	oldFirst: '【氷の廃墟】',
	newLines: [
		'【氷の廃墟】',
		'凍てつく魔力で覆われた廃墟。',
		'かつては栄えた城だったが、今は氷の魔物が支配する。',
		'→ 入口は 北東。石の 並びを 越えた 先。',
	],
});
{
	// ⑦の新ルール（2026-09-19）＝1つの目的地に印を渡す提供元は最大1箇所。
	// L＝氷の廃墟のボス∴「D5 を踏破したら、その足元の町の石碑が次の地を教える」型。
	// 既存の linesAfterBoss.L が「次は南東の沼へ」と言っている行き先と同じにする。
	const { e } = entry('field', '13,5', '7,6');
	const want = { layer: 'field', stage: '10,14', label: '沼地の神殿', kind: 'dungeon' };
	if (!e.linesAfterBoss?.L) throw new Error('石碑の linesAfterBoss.L が無い（前提が崩れている）');
	e.markAfterBoss ??= {};
	if (JSON.stringify(e.markAfterBoss.L) === JSON.stringify(want)) {
		console.log('  = markAfterBoss.L（既に沼地の神殿）');
	} else {
		if (e.markAfterBoss.L) throw new Error(`石碑に別の markAfterBoss.L が既にある: ${JSON.stringify(e.markAfterBoss.L)}`);
		e.markAfterBoss.L = want;
		console.log('  ✔ markAfterBoss.L = field 10,14「沼地の神殿」');
	}
}

// ── ⑤ field 12,7 凍てつく滝＝本文の呼称と方角 ──
// 「雪の 神殿」は層名（dungeon_5＝氷の廃墟）と食い違う独自呼称＝名前統一表に無い。
// 「この 音の 奥」は方角ゼロ。実測＝12,7 から 13,5 は東1・北2＝北東。
console.log('\n⑤ field 12,7 凍てつく滝＝「雪の神殿」を「氷の廃墟」に統一＋方角');
setLines('field', '12,7', '6,5', {
	label: '凍てつく滝',
	oldFirst: '時を 止めた 氷の 滝。',
	newLines: [
		'時を 止めた 氷の 滝。水は 一滴も 落ちぬ。',
		'氷の 廃墟は 北東。滝の 音が 止んだ 日から 誰も 戻らぬ。',
	],
});

// ── ⑥ field 14,6 雪原の道標＝南と北が嘘 ──
// 実測＝南 14,7 は「氷漬けの館」（石畳40・家）で潮境ではない（潮境 15,7 は南東）。
//       北は 14,5／14,4 が雪 118 で、灰が混じるのは3つ北の 14,3（雪78・灰42）。
console.log('\n⑥ field 14,6 雪原の道標＝南（潮境→館）と北（灰までの距離）を訂正');
setLines('field', '14,6', '4,5', {
	label: '雪原の道標',
	oldFirst: '【雪原の道標】',
	newLines: [
		'【雪原の道標】',
		'東へ 進めば 氷の 断崖。海の 匂いが する。',
		'南は 氷漬けの 館。北へ 三つ 戻れば 灰が 混じる。',
	],
});

// ── ⑦ name の付与 2 件（本文は温存）──
console.log('\n⑦ name の付与（本文は1字も変えない）');
// 本文「石の向こうに大事なものを置いておきました。エルンより。」は実測で真
// （石 '*'(5,8)(5,9)(5,10) の北に鍵 'K'(4,9)）∴温存し、無名だったので名前を与える。
setName('field', '13,5', '7,7', { oldName: '', newName: 'エルンの書き置き', label: 'エルンの書き置き' });
// name:"ヒント" を世界の中の物の名前に改める流儀（帯2 で決定・全16枚のうち D5 の1枚）。
// この室ははしごの宝箱がある部屋（chestContents (4,5)＝はしご）∴本文は「今取った道具の
// 使い方」として正しい＝1,1 との重複ではない。
setName('dungeon_5', '1,2', '7,8', { oldName: 'ヒント', newName: '氷渡りの 覚え書き', label: 'D5 氷渡りの覚え書き' });

// ── ⑧ 盤面＝field 13,7 の蟲を板の上へ ──
// 看板「蟲は 板の 上で 待つ」が唯一の嘘だった（α は (2,7) 東岸・(8,2) 西岸）。
// ユーザー決定＝文言はそのままにして蟲の配置を変える。橋 'v' は (4,4)(4,5)(5,4)(5,5) の
// 2x2 ∴2匹とも乗せると静的に道が塞がる → (2,7) の1匹だけ橋の上 (4,4) へ移し、
// (8,2) は西岸に残す（総称「蟲は」∴1匹が板の上に居れば真）。
//
// ⚠️ 敵はタイル文字∴tiles の 'v' を潰すと板の絵が1マス欠けて「橋に穴」に見える
//    （最初そうしてスクショで見つけた）。橋は BG_TILES に入っている＝**bgTiles 層にも
//    置ける**（`shared/tiles.js` の BG_TILES に TILE.BRIDGE／`cell-appearance.js` が
//    bg の連結タイルを tiles 層と同じ部品で描く）∴tiles を α にした同じセルの bgTiles に
//    'v' を敷いて板を残す＝「板の上に蟲が居る」絵になる。
console.log('\n⑧ field 13,7 の蟲を橋の上へ（看板「蟲は 板の 上で 待つ」を真にする）');
{
	const st = stage('field', '13,7');
	const rows = st.tiles.map((r) => (Array.isArray(r) ? r : r.split('')));
	if (!Array.isArray(st.tiles[0])) throw new Error('field の tiles は文字配列の配列であるべき');
	const at = (r, c) => rows[r][c];
	if (at(4, 4) === 'α' && at(2, 7) === '.') {
		console.log('  = 蟲は既に橋の上 (4,4)');
	} else {
		if (at(2, 7) !== 'α') throw new Error(`(2,7) が α でない: '${at(2, 7)}'`);
		if (at(4, 4) !== 'v') throw new Error(`(4,4) が橋 'v' でない: '${at(4, 4)}'`);
		if (at(8, 2) !== 'α') throw new Error(`(8,2) の α が無い（前提が崩れている）`);
		rows[2][7] = '.';
		rows[4][4] = 'α';
		st.tiles = rows;   // 文字配列の配列のまま書き戻す（join した行文字列にしない）
		console.log("  ✔ α (2,7) → (4,4)（tiles の橋 'v' を置き換え）");
	}
	// 蟲を置いたセルの板を bgTiles 層で描き直す（tiles の 'v' を奪った分の埋め合わせ）。
	st.bgTiles ??= {};
	if (st.bgTiles['4,4'] === 'v') {
		console.log("  = (4,4) の下地は既に橋 'v'");
	} else {
		const was = st.bgTiles['4,4'];
		if (was && was !== 's') throw new Error(`(4,4) の下地が雪 's' でない: '${was}'`);
		st.bgTiles['4,4'] = 'v';
		console.log("  ✔ bgTiles (4,4) = 'v'（蟲の下に板を敷く＝橋に穴が空いて見えない）");
	}
}

// ── ⑨ 老賢者から「沼地の神殿」の印を剥がす（1目的地1提供元）──
// 2026-09-19 のユーザー決定＝老賢者（field 7,14）の 8 目的地独占をやめ、現地に分散する。
// 帯6 が沼の印を ④ で新設した∴ここで剥がさないと同じ目的地を2箇所が渡す状態になる。
// 残る G/N/J/A/O/I/U は 17-10（印の重複掃除）の担当∴この番では触らない。
console.log('\n⑨ field 7,14 老賢者の markAfterBoss.L を削除（沼の提供元を1箇所にする）');
{
	const { e } = entry('field', '7,14', '3,3');
	if (!e.markAfterBoss) throw new Error('老賢者に markAfterBoss が無い');
	if (!e.markAfterBoss.L) {
		console.log('  = 既に削除済み');
	} else {
		const gone = JSON.stringify(e.markAfterBoss.L);
		if (!gone.includes('10,14')) throw new Error(`老賢者の markAfterBoss.L が沼でない: ${gone}`);
		delete e.markAfterBoss.L;
		console.log(`  ✔ 削除 ${gone}`);
	}
}

// ── 書き出し ──────────────────────────────────────────────
// 整形はスペース2（既存の work/blade-of-lumia.json と帯1〜5 の移行スクリプトに合わせる。
// タブで書くとファイル全体が差分になってレビューできない）。
fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き出した: ${MAP_PATH}`);

// ── 自己検証（書いたファイルを読み直して確かめる）──────────
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const F = after.layers.field.stages;
	const problems = [];

	// (a) field の tiles が文字配列の配列のままか（join した行文字列だとゲームが落ちる）
	for (const [sk, st] of Object.entries(F)) {
		if (!Array.isArray(st.tiles?.[0])) problems.push(`field ${sk} の tiles が文字配列の配列でない`);
	}

	// (b) 蟲が橋の上に居て、橋がまだ残っているか
	const t137 = F['13,7'].tiles;
	if (t137[4][4] !== 'α') problems.push('field 13,7 (4,4) が α でない');
	if (t137[2][7] !== '.') problems.push('field 13,7 (2,7) が空いていない');
	const bridges = t137.flat().filter((c) => c === 'v').length;
	if (bridges !== 3) problems.push(`field 13,7 の tiles 層の橋 'v' が 3 マスでない（${bridges}）`);
	if (F['13,7'].bgTiles?.['4,4'] !== 'v') problems.push("field 13,7 (4,4) の下地が橋 'v' でない＝蟲の足元に板が無い");

	// (c) 印の全走査＝行き先が実在し、かつ「同じ目的地を2箇所以上が渡していない」
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
		if (!after.layers?.[layer]?.stages?.[m.stage]) {
			problems.push(`印の行き先が実在しない: ${ln} ${sk} (${pos}) ${via} → ${layer} ${m.stage}`);
		}
		if (layer === ln && m.stage === sk) {
			problems.push(`自己参照の印: ${ln} ${sk} (${pos}) ${via}`);
		}
	}
	const byDest = new Map();
	for (const mk of marks) {
		const key = `${mk.m.layer ?? mk.ln}/${mk.m.stage}`;
		(byDest.get(key) ?? byDest.set(key, []).get(key)).push(mk);
	}
	const swamp = byDest.get('field/10,14') ?? [];
	if (swamp.length !== 1) {
		problems.push(`「沼地の神殿」を渡す箇所が 1 でない（${swamp.length}）: ${swamp.map((s) => `${s.ln} ${s.sk} ${s.via}`).join(' / ')}`);
	}

	console.log(`\n自己検証: 印 ${marks.length} 件 / 目的地 ${byDest.size} 種`);
	// 参考＝重複の残り（17-10 の担当。ここでは落とさない）
	const dup = [...byDest.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
	if (dup.length) {
		console.log('  （参考）まだ複数箇所が渡している目的地＝17-10 の担当:');
		for (const [dest, v] of dup) console.log(`    ${dest} ← ${v.length} 箇所`);
	}
	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK');
}

// Phase 17-9a（帯8前半＝「空と終幕」＝field 8 画面＋dungeon_7 8 件＋寄道3（void_shrine /
// warlord_lair / darklord_prison）7 件＋dark_tower 3 件＝会話 26 件）の語りの作り直し。
//
// 2026-09-19 のユーザー承認済みの内容だけを書く（未承認の文はデータに入れない）。
//
// 【帯8 を 17-9a / 17-9b に割ったこと】
//   PLAN ⑤ の帯8 の定義（D7＋空島＋寄道3＋暗黒の塔）は field を 5 画面しか覆っておらず、
//   実測すると field の会話 143 件のうち 29 画面／30 件がどの帯にも属していなかった
//   （中原・北の峰・連絡路の道標群）。帯8 を丸ごと取ると 48 件＝⑤ の「25 件を超えたら
//   割る」規則に反する∴17-9a（この番・26 件）と 17-9b（残り 21 画面／22 件）に割った。
//
// 【棚卸しの結論】
//   ・温存 14 枚＝field 2,0（風の環状列石）／7,0（参道の石碑・「東の天の柱」は 8,0 で真）／
//     7,2（北原の辻）／9,10（湖の岩の標）／dungeon_7 0,0（記憶 其の八）／void_shrine 0,0・1,0／
//     warlord_lair 0,0・1,0／darklord_prison 0,0・0,1・0,2／dark_tower 0,1（終章）・5,1（声）。
//   ・直し 4 枚＝field 6,0（塔の位置が嘘）／7,1（印が無い・欠片の数が無い）／
//     8,1（**世界に最後まで残っていた禁止語**「Fキーで」）／9,0（「南は峰の見張り」が嘘）。
//   ・作り直し 7 枚＝dungeon_7 の name:"ヒント" 5 枚（場所の刻み文へ）＋1,3 の石碑と NPC の
//     二重（両方「笛で空へ」）の役割分け＋dark_tower 3,2（嘘の看板）。
//   ・新設 4 枚＝field 8,0（羽衣ゲートの画面なのに会話ゼロ）／dark_tower 1,1・2,2・4,1
//     （30 室で会話 3 件＝ゲーム中で最も薄い層）。
//
// 【この番で直すデータの不良（2026-09-19 に発見）】
//   すべて e98217b「expand dark_tower to 30 rooms」の生成スクリプト
//   （scripts/migrate-dark-tower.mjs）由来の取りこぼし。
//   (A) showConditions が `trigger:` ではなく `type:`（dark_tower 2,2 / 3,2 の 2 件。
//       全マップでこの 2 件だけ）。game/conditions.js evaluateConditions() は
//       `cond.trigger` しか読まない∴**条件が永久に成立しない**。
//   (B) その 2 件は '>' タイルも置かれていない（生成元のコメントは「隠し '>'」＝条件が
//       タイルを生むと誤解していた。実際は game/game.js:1360 が `tiles[r][c] === '>'` を
//       要求し、showConditions は描画と通行を止めるだけ）。∴(A) を直しても門は出ない。
//   (C) 未登録の '>' が 12 枚（dark_tower だけ。他の全層は '>' と mapEnters が 1:1）。
//       生成元が行の文字列に '>' を書いた上で別の列に tiles[r][c]='>' を代入し、
//       mapEnters には後者しか登録しなかった＝踏んでも何も起きない死にタイルが隣に並ぶ。
//   (D) dark_tower 0,1 (5,5)（空島からの着地＝towerEntrance）に destId があるのに '>' が
//       無い＝**塔から歩いて出られない**。他のダンジョンは着地セルがそのまま戻りの '>'
//       （例 dungeon_7 1,3 (7,2)）∴同じ作法に揃える。
//   (E) dark_tower 3,2 の隠し門は trigger:'flutePlayed' なのに fluteEffect が無い。
//       game.js playFlute() は fluteEffect.type==='reveal' のときだけ ss.flutePlayed=true
//       を立てる（evaluateConditions が読むのはこのフラグだけ）∴(A)(B) を直しても
//       笛を吹くと「特に何も起きない」で終わり、条件は永久に成立しない。
//       他の flutePlayed／killAllAndFlute ゲート7件は全て fluteEffect.reveal を持っていた
//       ＝ここだけの取りこぼし（実ブラウザ確認で発覚。機械チェックは(9)が鍵専用で
//       見ていなかった穴＝check-dungeon-integrity.mjs に検査(11b)として追加した）。
//
// 使い方:
//   node scripts/migrate-dialog-band-8a.mjs                    # 本番（work/blade-of-lumia.json）
//   BLADE_MAP_PATH=/abs/path/dry.json node scripts/migrate-dialog-band-8a.mjs   # 空撃ち
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
	throw new Error(`会話が無い: ${layer} ${key} (${pos})`);
}

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.slice() : String(r).split('')));

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

// 目的地の印。配列も受ける（shared/marks.js normalizeDialogMarks は単体でも配列でも読む）。
function setMark(layer, key, pos, { marks, label }) {
	const { e, src } = entry(layer, key, pos);
	if (JSON.stringify(e.mark) === JSON.stringify(marks)) {
		console.log(`  = ${label}（既に同じ印・${src}）`);
		return;
	}
	if (e.mark) throw new Error(`${label}: 別の印が既にある: ${JSON.stringify(e.mark)}`);
	for (const m of marks) {
		if (!map.layers[m.layer ?? layer]?.stages?.[m.stage]) throw new Error(`${label}: 印の行き先が無い: ${m.stage}`);
	}
	e.mark = marks;
	console.log(`  ✔ ${label}（印 ${marks.length} 件を新設 / ${src}）`);
}

// 看板の新設＝'i' タイル＋signData の対。盤面を触るのはここだけ（移行後に接続チェッカーを回す）。
function addSign(layer, key, pos, { name, lines, label }) {
	const st = stage(layer, key);
	const [r, c] = pos.split(',').map(Number);
	const rows = rowsOf(st);
	st.signData = st.signData ?? {};
	if (st.signData[pos] && rows[r][c] === 'i') {
		if (JSON.stringify(st.signData[pos].lines) !== JSON.stringify(lines)) {
			throw new Error(`${label}: 既に別の看板がある: ${JSON.stringify(st.signData[pos])}`);
		}
		console.log(`  = ${label}（既に新設済み）`);
		return;
	}
	if (st.signData[pos]) throw new Error(`${label}: signData(${pos}) が既にある（タイルは '${rows[r][c]}'）`);
	if (rows[r][c] !== '.') throw new Error(`${label}: (${pos}) が床 '.' ではない: '${rows[r][c]}'`);
	rows[r][c] = 'i';
	st.tiles = rows;
	st.signData[pos] = { name, lines };
	console.log(`  ✔ ${label}（tiles(${pos}) '.' → 'i' ＋ signData 新設）`);
}

// ══════════════════════════════════════════════════════════
//  A. field
// ══════════════════════════════════════════════════════════

// ── ① field 8,0 天の柱＝羽衣ゲートの画面に会話を新設 ──────────
// 実測＝この画面の (3,2) が `destId:'darkTower'` ＝ game/game.js:1367 の羽衣ゲート
// （羽衣が無いと「翼の羽衣が なければ 暗黒の塔へは 渡れない」で弾かれる）。
// それなのに会話ゼロ＝門の意味がどこにも書かれていなかった。
// (2,1) に置く＝西の廊は cols 0-1 の幅 2∴1 枚塞いでも col 0 で通り抜けられる（移行後に
// check-field-connectivity.mjs で裏取り）。読むための隣接床は (2,0)。
console.log('\n① field 8,0 天の柱＝羽衣ゲートの画面に看板を新設');
addSign('field', '8,0', '2,1', {
	label: '天の柱の刻み文',
	name: '天の柱の刻み文',
	lines: [
		'【天の柱】',
		'岩の 壁に 門が 一つ 開いている。',
		'この 門は 翼を 持つ 者しか 通せぬ。',
		'門の 先は 虚空に 浮く 島。黒き塔が 立つ。',
	],
});

// ── ② field 7,1 北の聖域＝欠片の数と、羽衣で開く3つの行き先 ────
// 実測＝この画面の (3,6) が祭壇 '^'（game/boss.js offerAtAltar＝星の欠片 8 個で翼の羽衣）。
// ∴「翼を得た直後に読む石碑」＝終盤の3つの行き先（空島・虚空の淵の向こう岸・南湖の孤島）の
// 印をここで一度に配る。空島 8,1 は暗黒の塔と虚空の祠が同居∴**1画面1印**（shared/marks.js
// markId）の規則で印は1つしか置けない＝祠は本文（8,1 の石碑）側で触れる。
console.log('\n② field 7,1 北の聖域＝欠片の数を明示し、羽衣で渡れる3つの行き先に印を配る');
setLines('field', '7,1', '5,5', {
	label: '北の聖域の石碑',
	oldFirst: 'この 石段の 上に 古代の 祭壇が ある。',
	newLines: [
		'【北の聖域】',
		'この 石段の 上に 古代の 祭壇が ある。',
		'八つの 星の欠片を すべて 捧げよ。',
		'翼を 得た 者だけが 渡れる 場所が 三つ ある。',
		'東の 天の柱の 先の 空島、虚空の淵の 向こう岸、南湖の 孤島。',
	],
});
setMark('field', '7,1', '5,5', {
	label: '北の聖域の石碑',
	marks: [
		{ layer: 'field', stage: '8,1', label: '暗黒の塔', kind: 'dungeon' },
		{ layer: 'field', stage: '6,0', label: '魔将の巣', kind: 'cave' },
		{ layer: 'field', stage: '9,10', label: '魔王の岩牢', kind: 'cave' },
	],
});

// ── ③ field 8,1 空島の石碑＝最後の禁止語を落とす ───────────────
// 「Fキーで空へ舞い上がり」＝check-dialog-integrity ③ の禁止語（「キー」）が帯1 の外に
// 残っていた最後の 1 件。操作の説明は帯1（村・草原・hidden_cave・dungeon_1）だけの役目。
console.log('\n③ field 8,1 空島の石碑＝禁止語（「Fキー」）を落として空島の語りにする');
setLines('field', '8,1', '7,2', {
	label: '空島の石碑',
	oldFirst: '「翼の羽衣をまといし者のみ、虚空を越え暗黒の塔へ至る」',
	newLines: [
		'【空島】',
		'翼の羽衣を まといし 者のみ、虚空を 越え 暗黒の塔へ 至る。',
		'風に 身を 預けて 谷を 渡れ。',
		'塔の 扉の 南に もう 一つの 扉が 見える。',
	],
});

// ── ④ field 6,0 淵の伝承碑＝塔はこの淵の向こうに無い ───────────
// 実測＝黒き塔は空島（field 8,1）にあり、そこへは 天の柱（8,0）の門から渡る。
// この淵の向こう岸にあるのは魔将の巣の口 (2,6) だけ∴「向こうに立つ黒き塔」は嘘。
console.log('\n④ field 6,0 淵の伝承碑＝向こう岸にあるのは魔将の巣（塔は空島）');
setLines('field', '6,0', '8,3', {
	label: '淵の伝承碑',
	oldFirst: '【虚空の淵】',
	newLines: [
		'【虚空の淵】',
		'地は ここで 断たれ 虚空となる。',
		'翼を 持たぬ 者に この先の 岩棚は 無い。',
		'向こう岸の 崖肌に 洞が ひとつ。',
		'魔将が 棲み 伝説の 鎧を 抱えて 眠る。',
	],
});
{
	const { e } = entry('field', '6,0', '8,3');
	const after = [
		'【虚空の淵】',
		'地は ここで 断たれ 虚空となる。',
		'翼を 持たぬ 者に この先の 岩棚は 無い。',
		'崖の 洞は 静まった。魔将は 討たれ 鎧は 主を 得た。',
	];
	if (JSON.stringify(e.linesAfterBoss?.V) === JSON.stringify(after)) {
		console.log('  = 淵の伝承碑（魔将 V の版は既に新しい本文）');
	} else {
		if (!e.linesAfterBoss?.V) throw new Error('淵の伝承碑: linesAfterBoss.V が無い');
		e.linesAfterBoss.V = after;
		console.log('  ✔ 淵の伝承碑（魔将 V の版も同じ骨に揃えた）');
	}
}

// ── ⑤ field 9,0 三叉の道標＝南の主張が嘘 ───────────────────────
// 実測＝西隣 8,0 は天の柱（真）／東隣 10,0 は溶岩 'l'×8 と呪い火 ψ×2＝灰と火（真）／
// 南隣 9,1 には見張りの類が何も無い（敵と宝箱だけ）∴「南は峰の見張り」は嘘。
// 「狼煙は二つで上がる」はこの画面の 'H'×2 → torchesLit → 宝箱 (7,8) で真∴据え置く。
console.log('\n⑤ field 9,0 三叉の道標＝南の「峰の見張り」は実在しない');
setLines('field', '9,0', '5,6', {
	label: '三叉の道標',
	oldFirst: '【峰の三叉】',
	newLines: [
		'【峰の三叉】',
		'西は 空へ 上がる 天の柱。東は 灰と 火の 領分。',
		'南は 峰を 下る 道。狼煙は 二つで 上がる。',
	],
});

// ══════════════════════════════════════════════════════════
//  B. dungeon_7（空中の遺跡）＝name:"ヒント" の掃除
// ══════════════════════════════════════════════════════════
// 残っていた name:"ヒント" 6 枚のうち 5 枚がこの層（残り 1 枚は dungeon_5＝帯6 の宿題）。
// 3,0 の「石を押して スイッチを踏め。」は dungeon_4 3,3 / dungeon_6 3,0 と完全一致＝
// 層をまたいだ使い回し∴場所の刻み文に書き換えて重複を解く。
console.log('\n⑥ dungeon_7 の name:"ヒント" 5 枚を場所の刻み文に書き換える');

setName('dungeon_7', '1,0', '8,1', { label: 'D7 1,0', oldName: 'ヒント', newName: '守護者の環の 刻み文' });
setLines('dungeon_7', '1,0', '8,1', {
	label: 'D7 1,0 守護者の環の刻み文',
	oldFirst: '守護者を すべて討てば',
	newLines: [
		'守護者を すべて 沈めた あとに、',
		'音色を 一つ 添えよ。鍵は それで 落ちる。',
	],
});

setName('dungeon_7', '3,0', '7,1', { label: 'D7 3,0', oldName: 'ヒント', newName: '石車の座の 刻み文' });
setLines('dungeon_7', '3,0', '7,1', {
	label: 'D7 3,0 石車の座の刻み文',
	oldFirst: '石を押して スイッチを踏め。',
	newLines: [
		'床の 座は 重みを 待っている。',
		'石を 押して 座に 据えよ。',
	],
});

setName('dungeon_7', '1,1', '8,1', { label: 'D7 1,1', oldName: 'ヒント', newName: '封じの壁の 刻み文' });
setLines('dungeon_7', '1,1', '8,1', {
	label: 'D7 1,1 封じの壁の刻み文',
	oldFirst: '壁の向こうに 王が眠る。',
	newLines: [
		'砕けぬ 岩に 見えて、そうではない。',
		'壁を 砕き、その先の 座を 矢で 射よ。',
	],
});

setName('dungeon_7', '2,1', '8,1', { label: 'D7 2,1', oldName: 'ヒント', newName: '盾の間の 刻み文' });
setLines('dungeon_7', '2,1', '8,1', {
	label: 'D7 2,1 盾の間の刻み文',
	oldFirst: '盾でガードせよ。',
	newLines: [
		'ここの 番人は 正面を 譲らぬ。',
		'受けて 流し、横へ 回れ。',
	],
});

setName('dungeon_7', '1,2', '8,1', { label: 'D7 1,2', oldName: 'ヒント', newName: '矢の廊の 刻み文' });
setLines('dungeon_7', '1,2', '8,1', {
	label: 'D7 1,2 矢の廊の刻み文',
	oldFirst: '遠き的を矢で射よ。',
	newLines: [
		'北の 扉の 座は 手の 届かぬ 所に ある。',
		'矢だけが そこへ 届く。',
	],
});

// ── ⑦ dungeon_7 1,3 の二重（石碑と NPC が両方「笛で空へ」）─────
console.log('\n⑦ dungeon_7 1,3＝入口の石碑と NPC の二重を役割で分ける');
setLines('dungeon_7', '1,3', '3,5', {
	label: 'D7 入口の石碑',
	oldFirst: '笛の音に導かれし者よ、よくぞ空へ至った。',
	newLines: [
		'【空中の遺跡】',
		'笛の音に 導かれし 者よ、よくぞ 空へ 至った。',
		'嵐の鷲王を 射抜けば 最後の 欠片が 手に入る。',
	],
});
setLines('dungeon_7', '1,3', '1,9', {
	label: 'D7 入口の NPC',
	oldFirst: '笛の音だけが 雲上への道を開く。',
	newLines: [
		'ここは 道具の 試しの 場。',
		'弓・爆弾・盾、持つ物 すべてを 使う。',
	],
});

// ══════════════════════════════════════════════════════════
//  C. dark_tower（暗黒の塔）＝語りの肉付けとデータの修理
// ══════════════════════════════════════════════════════════

// ── ⑧ 3,2 の嘘看板を書き換える ─────────────────────────────
// 「ここで笛を吹けば、先への道が開く」＝(A)(B) のせいで何も起きず、しかも門が開いても
// 隣室 3,3 へは廊下を歩いて行ける（部屋の境界が 2 升開いている）∴「先への道」ではなく
// 「近道」。修理（⑩）と合わせて真になる文にする。
console.log('\n⑧ dark_tower 3,2＝「先への道」は嘘（廊下で歩いて行ける）∴近道として語る');
setName('dark_tower', '3,2', '2,2', { label: 'DT 3,2', oldName: '刻まれた文字', newName: '三層の刻み文' });
setLines('dark_tower', '3,2', '2,2', {
	label: 'DT 3,2 三層の刻み文',
	oldFirst: 'ここで笛を吹けば、先への道が開く。',
	newLines: [
		'【三層の刻み文】',
		'この石の 前で 笛を 吹けば、隣の 大広間への 近道が 開く。',
	],
});

// ── ⑨ 塔の語りを足す（30 室で会話 3 件＝ゲーム中で最も薄い層）──
console.log('\n⑨ dark_tower に刻み文を3枚新設（1,1 / 2,2 / 4,1）');
// 1,1＝'T' ゲート 2 枚（4,5)(5,5) と 'Y' スイッチ (7,8) の部屋。
addSign('dark_tower', '1,1', '2,1', {
	label: 'DT 1,1 一層の刻み文',
	name: '一層の刻み文',
	lines: [
		'【一層の刻み文】',
		'東の 座を 叩けば 石の 門が 開く。',
	],
});
// 2,2＝かがり火 'H'×3 の部屋。⑩ の修理で三つ灯すと近道 (5,5) が出る。
addSign('dark_tower', '2,2', '1,1', {
	label: 'DT 2,2 二層の刻み文',
	name: '二層の刻み文',
	lines: [
		'【二層の刻み文】',
		'三つの 火を 灯せば 近道が 開く。',
		'灯さずとも 廊を 下れば 大広間へ 出る。',
	],
});
// 4,1＝4F の入口部屋。倉庫番の盤（4,3）は 1 升も触らない∴手前の部屋で予告する。
// ❌ 失効（2026-09-23・ユーザー指摘）＝この刻み文は `4,2` (7,1) へ移設した
//    （`scripts/migrate-dark-tower-4f-stone-room-sign.mjs`）。理由＝①4F の進行方向は
//    `4,1`→南→`4,2`→南→`4,3`（石の間）∴「この上は 石の 間」は向きが逆。②石の間の
//    詰み回復は `4,3` の `fluteEffect {resetStones}` ＝その部屋で吹かないと効かないのに、
//    案内が2室手前（間に `4,2` のはしご＋爆弾の関門）にあった。
//    ⚠️ この移行を再実行すると移設した看板が `4,1` に復活する＝再実行しない。
addSign('dark_tower', '4,1', '1,1', {
	label: 'DT 4,1 四層の刻み文',
	name: '四層の刻み文',
	lines: [
		'【四層の刻み文】',
		'この上は 石の 間。四つの 石を 座に 据えねば 扉は 動かぬ。',
		'手が 詰まったら 笛を 吹け。石は 元へ 還る。',
	],
});

// ── ⑩ データの修理（A)(B)(C)(D) ────────────────────────────
console.log('\n⑩ dark_tower のデータ修理（生成スクリプト由来の取りこぼし5種）');

// (A) showConditions の `type:` → `trigger:`
for (const [key, pos, trigger] of [['2,2', '5,5', 'torchesLit'], ['3,2', '5,5', 'flutePlayed']]) {
	const st = stage('dark_tower', key);
	const cond = st.showConditions?.[pos];
	if (!cond) throw new Error(`dark_tower ${key} の showConditions(${pos}) が無い`);
	if (cond.trigger === trigger && !('type' in cond)) {
		console.log(`  = (A) dark_tower ${key} (${pos}) は既に trigger:${trigger}`);
		continue;
	}
	if (cond.type !== trigger) throw new Error(`dark_tower ${key} (${pos}) の type が ${trigger} でない: ${JSON.stringify(cond)}`);
	delete cond.type;
	cond.trigger = trigger;
	console.log(`  ✔ (A) dark_tower ${key} (${pos}) type:${trigger} → trigger:${trigger}`);
}

// (B) 隠し門の '>' タイルを置く（条件は描画と通行を止めるだけ＝タイルが無いと永久に死ぬ）
for (const [key, pos] of [['2,2', '5,5'], ['3,2', '5,5']]) {
	const st = stage('dark_tower', key);
	const [r, c] = pos.split(',').map(Number);
	const rows = rowsOf(st);
	if (rows[r][c] === '>') { console.log(`  = (B) dark_tower ${key} (${pos}) は既に '>'`); continue; }
	if (rows[r][c] !== '.') throw new Error(`dark_tower ${key} (${pos}) が床 '.' でない: '${rows[r][c]}'`);
	if (!st.mapEnters?.[pos]?.destId) throw new Error(`dark_tower ${key} (${pos}) に destId 付きの登録が無い`);
	rows[r][c] = '>';
	st.tiles = rows;
	console.log(`  ✔ (B) dark_tower ${key} (${pos}) '.' → '>'（隠し門の実体）`);
}

// (C) 未登録の '>' 12 枚を床に戻す（登録済みの階段は左隣の 1 枚＝そこが着地セル）
const DEAD_ARROWS = [
	['1,0', '6,5'], ['1,3', '8,5'], ['2,0', '6,5'], ['2,3', '5,5'], ['2,3', '8,5'],
	['3,0', '6,5'], ['3,3', '5,5'], ['3,3', '8,5'], ['4,1', '6,5'], ['4,4', '8,5'],
	['5,0', '6,5'], ['5,2', '8,6'],
];
let deadFixed = 0, deadAlready = 0;
for (const [key, pos] of DEAD_ARROWS) {
	const st = stage('dark_tower', key);
	const [r, c] = pos.split(',').map(Number);
	const rows = rowsOf(st);
	if (rows[r][c] === '.') { deadAlready++; continue; }
	if (rows[r][c] !== '>') throw new Error(`dark_tower ${key} (${pos}) が '>' でない: '${rows[r][c]}'`);
	if (st.mapEnters?.[pos]) throw new Error(`dark_tower ${key} (${pos}) は登録済み＝消してはいけない`);
	rows[r][c] = '.';
	st.tiles = rows;
	deadFixed++;
}
console.log(`  ✔ (C) 未登録の '>' を床に戻した: ${deadFixed} 枚（既に床: ${deadAlready} 枚）`);

// (D) 塔の出口＝0,1 (5,5) に '>' を置く（着地セルがそのまま戻りの階段＝他ダンジョンと同じ作法）
{
	const st = stage('dark_tower', '0,1');
	const rows = rowsOf(st);
	if (rows[5][5] === '>') {
		console.log("  = (D) dark_tower 0,1 (5,5) は既に '>'");
	} else {
		if (rows[5][5] !== '.') throw new Error(`dark_tower 0,1 (5,5) が床 '.' でない: '${rows[5][5]}'`);
		if (st.mapEnters?.['5,5']?.destId !== 'islandToTower') throw new Error('dark_tower 0,1 (5,5) の登録が islandToTower でない');
		rows[5][5] = '>';
		st.tiles = rows;
		console.log("  ✔ (D) dark_tower 0,1 (5,5) '.' → '>'（塔から空島へ戻れるようにした）");
	}
}

// (E) 3,2 の隠し門（trigger:'flutePlayed'）に fluteEffect:{type:'reveal'} を付ける。
// game.js playFlute() は fluteEffect.type==='reveal' のときだけ ss.flutePlayed=true を
// 立てる（evaluateConditions が読むのはこのフラグだけ）。dark_tower 3,2 だけこれが無く、
// 笛を吹いても「特に何も起きない」で条件が永久に成立しなかった（他の flutePlayed／
// killAllAndFlute ゲート7件は全て fluteEffect.reveal を持っていた＝ここだけの取りこぼし）。
{
	const st = stage('dark_tower', '3,2');
	const want = { type: 'reveal', message: '{{flute}} 音色に 応えて、隠し 扉が 開いた！' };
	if (JSON.stringify(st.fluteEffect) === JSON.stringify(want)) {
		console.log('  = (E) dark_tower 3,2 は既に fluteEffect.reveal を持つ');
	} else {
		if (st.fluteEffect) throw new Error(`dark_tower 3,2 に別の fluteEffect が既にある: ${JSON.stringify(st.fluteEffect)}`);
		st.fluteEffect = want;
		console.log('  ✔ (E) dark_tower 3,2 に fluteEffect:{type:"reveal"} を追加（笛で隠し門が開くようになった）');
	}
}

// ── 書き出し ──────────────────────────────────────────────
fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log(`\n書き出し: ${MAP_PATH}`);

// ══════════════════════════════════════════════════════════
//  自己検証（書いたファイルを読み直して確かめる）
// ══════════════════════════════════════════════════════════
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const problems = [];
	const field = after.layers.field.stages;

	// (1) この帯の会話の本文を集める（生の改行・禁止語・件数）
	const BAND = {
		field: ['2,0', '6,0', '7,0', '7,1', '7,2', '8,0', '8,1', '9,0', '9,10'],
		dungeon_7: null, void_shrine: null, warlord_lair: null, darklord_prison: null, dark_tower: null,
	};
	const corpus = [];
	let bandCount = 0;
	for (const [ln, keys] of Object.entries(BAND)) {
		const stages = after.layers[ln].stages;
		for (const sk of keys ?? Object.keys(stages)) {
			for (const src of ['signData', 'npcData']) {
				for (const e of Object.values(stages[sk]?.[src] ?? {})) {
					bandCount++;
					for (const l of e.lines ?? []) corpus.push(l);
					for (const v of Object.values(e.linesAfterBoss ?? {})) for (const l of v) corpus.push(l);
				}
			}
		}
	}
	const raw = corpus.filter((l) => l.includes('\n')).length;
	if (raw) problems.push(`本文に生の改行が ${raw} 件`);
	for (const w of ['キー', 'ボタン']) {
		const hits = corpus.filter((l) => l.includes(w));
		if (hits.length) problems.push(`禁止語「${w}」が残っている: ${JSON.stringify(hits)}`);
	}
	if (bandCount !== 30) problems.push(`帯8a の会話が 30 件でない（${bandCount} 件）＝26 件＋新設 4 枚`);

	// (2) 印＝全マップで行き先が実在し、同じ目的地を指す印が重なっていないこと
	const marks = [];
	for (const [ln, l] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(l.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const [pos, e] of Object.entries(st[src] ?? {})) {
					const list = [].concat(e.mark ?? []);
					for (const mk of Object.values(e.markAfterBoss ?? {})) list.push(mk);
					for (const m of list) marks.push({ ln, sk, pos, m });
				}
			}
		}
	}
	for (const { ln, sk, pos, m } of marks) {
		const layer = m.layer ?? ln;
		if (!after.layers[layer]?.stages?.[m.stage]) problems.push(`印の行き先が無い: ${ln} ${sk} (${pos}) → ${layer}/${m.stage}`);
	}
	if (marks.length !== 50) problems.push(`印が 50 件でない（${marks.length} 件）＝47 件＋この番の 3 件`);
	for (const dest of ['8,1', '6,0', '9,10']) {
		const n = marks.filter((x) => (x.m.layer ?? x.ln) === 'field' && x.m.stage === dest).length;
		if (n !== 1) problems.push(`field ${dest} を指す印が 1 件でない（${n} 件）`);
	}

	// (3) showConditions＝全マップで `trigger` を持つこと（`type:` の取りこぼしの再発防止）
	for (const [ln, l] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(l.stages ?? {})) {
			for (const [pos, cond] of Object.entries(st.showConditions ?? {})) {
				if (!cond?.trigger) problems.push(`showConditions に trigger が無い: ${ln} ${sk} (${pos}) ${JSON.stringify(cond)}`);
			}
		}
	}

	// (3b) flutePlayed／killAllAndFlute の関門は fluteEffect.reveal が要る（(E) の再発防止）
	for (const [ln, l] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(l.stages ?? {})) {
			for (const [pos, cond] of Object.entries(st.showConditions ?? {})) {
				if (cond?.trigger !== 'flutePlayed' && cond?.trigger !== 'killAllAndFlute') continue;
				if (st.fluteEffect?.type !== 'reveal') problems.push(`関門 '${cond.trigger}' に fluteEffect.reveal が無い: ${ln} ${sk} (${pos})`);
			}
		}
	}

	// (4) '>' タイルと mapEnters の対応（未登録の '>'／タイルの無い destId 付き登録）
	for (const [ln, l] of Object.entries(after.layers)) {
		if (ln === 'test_mechanics') continue; // 検証用の層は対象外
		for (const [sk, st] of Object.entries(l.stages ?? {})) {
			const rows = (st.tiles ?? []).map((r) => (Array.isArray(r) ? r : String(r).split('')));
			const arrows = [];
			rows.forEach((row, r) => row.forEach((ch, c) => { if (ch === '>') arrows.push(`${r},${c}`); }));
			for (const pos of arrows) {
				if (!st.mapEnters?.[pos]) problems.push(`未登録の '>' タイル: ${ln} ${sk} (${pos})`);
			}
			for (const [pos, v] of Object.entries(st.mapEnters ?? {})) {
				if (v.destId && !arrows.includes(pos)) problems.push(`destId 付きの登録に '>' タイルが無い: ${ln} ${sk} (${pos}) → ${v.destId}`);
			}
		}
	}

	// (5) dungeon_7 に name:"ヒント" が残っていないこと
	for (const [sk, st] of Object.entries(after.layers.dungeon_7.stages)) {
		for (const src of ['signData', 'npcData']) {
			for (const [pos, e] of Object.entries(st[src] ?? {})) {
				if (e.name === 'ヒント') problems.push(`dungeon_7 に name:"ヒント" が残っている: ${sk} (${pos})`);
			}
		}
	}

	// (6) 版を持つエントリの総数（tests/editor-dialog-variants.spec.js ⑥ の目印＝この番は増やさない）
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

	// (7) 新設した看板が読めるタイルに乗っていること
	// ⚠️ `dark_tower 4,1 (1,1)` は 2026-09-23 に `4,2` (7,1) へ移設した∴このリストから外した
	//    （上の addSign の失効注記を参照。移設先の検査は
	//    `scripts/migrate-dark-tower-4f-stone-room-sign.mjs` が持つ）。
	for (const [ln, sk, pos] of [['field', '8,0', '2,1'], ['dark_tower', '1,1', '2,1'],
		['dark_tower', '2,2', '1,1']]) {
		const st = after.layers[ln].stages[sk];
		const [r, c] = pos.split(',').map(Number);
		const ch = (Array.isArray(st.tiles[r]) ? st.tiles[r] : String(st.tiles[r]).split(''))[c];
		if (ch !== 'i') problems.push(`新設した看板のタイルが 'i' でない: ${ln} ${sk} (${pos}) '${ch}'`);
		if (!st.signData?.[pos]?.lines?.length) problems.push(`新設した看板に本文が無い: ${ln} ${sk} (${pos})`);
	}

	console.log(`\n自己検証: 帯8a の会話 ${bandCount} 件 / 印 ${marks.length} 件 / 生の改行 ${raw} 件`);
	console.log(`          版を持つエントリ ${variantOwners} 件（tests/editor-dialog-variants.spec.js ⑥ の目印）`);
	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK');
	console.log(`(参考) field ${Object.keys(field).length} 画面 / dark_tower ${Object.keys(after.layers.dark_tower.stages).length} 室`);
}

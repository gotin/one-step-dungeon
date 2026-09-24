// キュー20c：後半ダンジョン（dungeon_5 / 6 / 7 / 8 / dark_tower）のヒント看板を間引く
// （2026-09-24 / ユーザー判定）。
//
// ■ なぜやるか（ユーザーの言葉）
//   「この dark_tower 1,5 って、看板いるかね？ みりゃわかるだろって気がするし、
//     dark_tower はもう最終盤だからそんなヒントなくてもいいような気もする。」
//   ＝終盤で「見れば分かる操作の説明」を読ませるのは、緊張を削ぐうえに親切でもない。
//
// ■ 線引き（ユーザー承認済み・2026-09-24）
//   外す ＝ 次の3つを**全部**満たす札
//     (1) 内容が操作の指示だけ（物語も固有名も持たない）
//     (2) 指す仕掛けが同じ画面に見えている（穴・罅割れ壁・かがり火・座・踏み板・水）
//     (3) その機構を**初出の層**で既に教えている（初出＝道具を手にする層。
//         `shared/progression.js` の `ORDER` と `toolsUsableIn()` から導出＝
//         ブーメラン D2／弓 D3／ロウソク D4／爆弾 D6／はしご D5／笛 D8）
//   残す ＝ 物語・固有名・ボスの声／ボスの弱点（`tests/weakness-hints.spec.js` ②が
//           強制経路に1行を要求）／絵から読めないエンジンの規則で、初出がこの層自身
//           または本編で唯一の教えになっているもの
//   書き換える ＝ 1枚に物語＋操作が混ざる入口の石碑＝**操作の行だけ落とす**
//
// ■ 初出の裏取り（この番で実データから確認した＝「既に教えている」の根拠）
//   盾で弾く   … dungeon_1 1,1(7,5)「盾なくば 飛び道具に 沈む」他3枚
//   火→門が開く … dungeon_4 1,1(8,1)「三つの 火を 全て 灯せば 道は 開ける」
//   石→踏み板  … dungeon_4 3,3(7,1)「石は 押せる。踏み板の 上へ 送れ」／1,0(1,2)
//   矢で遠い錠 … dungeon_3 1,2(1,4)「水の 向こうの 錠 ◎ は 矢だけが 打てる」他
//   穴をはしごで … field 3,4(1,9)「穴はハシゴがあれば渡れる。」／field 2,18(8,3)
//   罅割れ壁＝爆弾 … dungeon_6 1,2(8,1)「北を 塞ぐ 二枚の 岩壁は それでしか 崩れぬ」（残す側）
//
// ■ 「外す」の実体
//   `signData` の本文と `'i'` タイルの**両方**を消す（片方だけだと無言看板／死にデータ＝
//   [[blade-sign-two-formats]]）。`'i'` は通行不可（`game/passable.js`。`TILE_META` の
//   `passable:true` は見かけだけ）∴床に戻すと通行できる升が1つ増える。13枚すべて
//   「壁際の列 col1」か「開けた床の中」で、押し石 `*` にも穴・水の岸にも隣接していない
//   ∴導線も倉庫番の解も動かない（このスクリプトの検証 (E)(F) で毎回測る）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   (A) 外した13枚：タイルが床・signData のキーが無い
//   (B) 全レイヤー横断で無言看板ゼロ・死にデータゼロ
//   (C) 断章9枚（`tests/lore-tablets.spec.js` と同じ座標）が本文つきで不変
//   (D) ボスの弱点を示す行が残っている（D8 1,3 の「沼地…炎」は本編唯一のヒット）
//   (E) 触った部屋は対象の1升以外1升も動いていない／境界の開きが不変
//   (F) 各レイヤーの到達部屋数が適用前と同じ
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-20c-sign-thinning.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-20c-sign-thinning.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer, findEntrances, firstWalkable, SOLVABLE_GATES } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

// ── 外す13枚（レイヤー / 部屋 / 升 / 看板の名前＝取り違え防止 / 外す理由） ──────
const REMOVALS = [
	['dark_tower', '1,1', '2,1', '一層の刻み文', '穴と座は画面に在る／矢は D3 で既習'],
	['dark_tower', '2,1', '1,1', '二層の刻み文 ―壁―', '罅割れ壁は専用の絵／爆弾は D6 1,2 で既習'],
	['dark_tower', '2,2', '1,1', '二層の刻み文 ―灯―', 'かがり火3つは画面に在る／D4 1,1 で既習'],
	['dark_tower', '3,1', '1,1', '三層の刻み文 ―穴―', '穴の帯は画面に在る／はしごは D5・field で既習'],
	['dark_tower', '3,2', '2,2', '三層の刻み文 ―笛―', '笛の隠し道は D8 1,1/1,2 で既習'],
	['dark_tower', '4,2', '1,1', '四層の刻み文 ―穴と壁―', '穴＋罅割れ壁＝どちらも既習（(7,1) の石の間の案内は残す）'],
	['dungeon_5', '1,2', '7,8', '氷渡りの 覚え書き', 'この部屋に水は0マス＝指す物が無い浮いた札（1,1 と重複）'],
	['dungeon_6', '2,1', '8,1', '槍衾の 覚え書き', '盾で弾くは D1 1,1 で既習'],
	['dungeon_6', '3,0', '7,1', '石と 門の 刻み文', '石→踏み板は D4 3,3／1,0 で既習'],
	['dungeon_7', '3,0', '7,1', '石車の座の 刻み文', '同じ盤面の2度目（dungeon_6 3,0 と同一）／D4 で既習'],
	['dungeon_7', '1,1', '8,1', '封じの壁の 刻み文', '既習＋文が事実と違う（座 Y(3,9) は南 (4,9) の床から剣で叩ける）'],
	['dungeon_7', '2,1', '8,1', '盾の間の 刻み文', '既習＋文が事実と違う（F センチネルに方向ガードは無い）'],
	['dungeon_7', '1,2', '8,1', '矢の廊の 刻み文', '既習＋文が事実と違う（座は南から剣で届く）'],
];

// ── 書き換える4枚（操作の行だけ落とす。OLD と一致しなければ止まる） ────────────
const REWRITES = [
	{
		layer: 'dungeon_5', stage: '1,3', cell: '3,4', name: '氷の廃墟・入口の石碑',
		old: ['「この先は爆弾で道を拓け。', '氷の廃墟が待ち受ける。」'],
		neu: ['「氷の廃墟が待ち受ける。」'],
		why: '爆弾は D6 1,2 で既習＝操作の1行を落とし、層の性格だけ残す',
	},
	{
		layer: 'dungeon_6', stage: '1,1', cell: '8,1', name: '聖樹のかがり火の間',
		old: ['【聖樹のかがり火の間】', '三つの 火が 揃うまで、東の 門は 開かぬ。', '灯を 持つ 者だけが 巨人の 間へ 進める。'],
		neu: ['【聖樹のかがり火の間】', '灯を 持つ 者だけが 巨人の 間へ 進める。'],
		why: '門の条件は D4 1,1 で既習／「巨人＋灯」の行は弱点のヒット∴残す',
	},
	{
		layer: 'dungeon_6', stage: '1,3', cell: '3,5', name: '森の聖域・入口の石碑',
		old: ['ここは古森の巨人が眠る聖域。', '炎を宿す灯りが、閉ざされた道を開くだろう。', '巨人の樹皮は 炎で焼き払える。'],
		neu: ['ここは古森の巨人が眠る聖域。', '巨人の樹皮は 炎で焼き払える。'],
		why: '灯りで道が開くは D4 1,1 で既習／世界観の行と弱点の行を残す',
	},
	{
		layer: 'dungeon_8', stage: '1,3', cell: '7,4', name: '沼地の神殿・入口の石碑',
		old: ['沼に橋を架けて渡れ。', 'はしごを使うのだ。', '沼地の大蝦蟇の湿った肌は 炎に焼かれる。'],
		neu: ['沼地の大蝦蟇の湿った肌は 炎に焼かれる。'],
		why: 'はしごは D5 1,3 で既習／この弱点の行は weakness-hints ② の本編唯一のヒット∴消せない',
	},
];

// 断章（`tests/lore-tablets.spec.js` と同じ座標＝この番で1枚も触ってはいけない）
const TABLETS = [
	['dungeon_1', '0,0', '1,9'], ['dungeon_2', '0,0', '1,1'], ['dungeon_3', '0,0', '1,9'],
	['dungeon_4', '0,0', '1,5'], ['dungeon_6', '0,0', '1,5'], ['dungeon_5', '0,0', '1,5'],
	['dungeon_8', '0,0', '1,5'], ['dungeon_7', '0,0', '1,5'], ['dark_tower', '0,1', '1,1'],
];

// ボスの弱点を示す行（残ることを確かめる。[敵の名の一部, 行いの語, 場所]）
const WEAKNESS_LINES = [
	['巨人', '灯', 'dungeon_6', '1,1', '8,1'],
	['巨人', '炎', 'dungeon_6', '1,3', '3,5'],
	['沼地', '炎', 'dungeon_8', '1,3', '7,4'],
];

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
const ok = (cond, msg) => { if (!cond) die(msg); };
const rowsOf = (st) => st.tiles.map((r) => r.join(''));

const log = [];
const step = (mark, msg) => log.push(`  ${mark} ${msg}`);

// ── 適用前の姿を控える（検証 (E)(F) の比較元） ────────────────────────────────
const TOUCHED = [...new Set([
	...REMOVALS.map(([l, s]) => `${l} ${s}`),
	...REWRITES.map((w) => `${w.layer} ${w.stage}`),
])];
const LAYERS = [...new Set(TOUCHED.map((k) => k.split(' ')[0]))];

const openingSig = (st) => {
	const rows = rowsOf(st);
	const at = (i) => [...rows[i]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const side = (c) => rows.map((r, i) => (r[c] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${at(0)}] S[${at(st.rows - 1)}] W[${side(0)}] E[${side(st.cols - 1)}]`;
};

const before = { rows: {}, opening: {}, reach: {}, signs: {} };
for (const key of TOUCHED) {
	const [l, s] = key.split(' ');
	const st = data.layers?.[l]?.stages?.[s];
	ok(st, `${key} が無い`);
	// [[field-tiles-are-char-arrays]] tiles は文字配列の配列（行文字列だとゲームが落ちる）
	ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray), `${key} の tiles が文字配列の配列でない`);
	before.rows[key] = rowsOf(st);
	before.opening[key] = openingSig(st);
}

const reachOf = (layer) => {
	const stages = data.layers[layer].stages;
	const entrance = findEntrances(data, layer)[0];
	const start = { stage: entrance, ...firstWalkable(stages[entrance]) };
	const r = bfsLayer(stages, start, { withLadder: true, followMapEnters: true, openTiles: SOLVABLE_GATES });
	return r.reachedRooms.size;
};
const signCountOf = (layer) => Object.values(data.layers[layer].stages)
	.reduce((n, st) => n + rowsOf(st).reduce((m, row) => m + [...row].filter((ch) => ch === 'i').length, 0), 0);
for (const l of LAYERS) {
	before.reach[l] = reachOf(l);
	before.signs[l] = signCountOf(l);
}

// ──────────────────────────────────────────────────────────────────────
// ① 外す（'i' タイルと signData の両方）
// ──────────────────────────────────────────────────────────────────────
for (const [layer, stage, cell, name, why] of REMOVALS) {
	const st = data.layers[layer].stages[stage];
	const [r, c] = cell.split(',').map(Number);
	const sd = st.signData ?? (st.signData = {});
	const hadTile = st.tiles[r][c] === 'i';
	const hadData = !!sd[cell];

	if (!hadTile && !hadData) { step('=', `${layer} ${stage} (${cell}) は既に外れている`); continue; }
	if (hadData) {
		ok(sd[cell]?.name === name,
			`${layer} ${stage} (${cell}) の看板が想定外: ${JSON.stringify(sd[cell]?.name)}（想定 ${name}）`);
		delete sd[cell];
	}
	if (hadTile) st.tiles[r][c] = '.';
	step('✔', `${layer} ${stage} (${cell}) 「${name}」を外した ＝ ${why}`);
}

// ──────────────────────────────────────────────────────────────────────
// ② 書き換える（操作の行だけ落とす）
// ──────────────────────────────────────────────────────────────────────
for (const w of REWRITES) {
	const st = data.layers[w.layer].stages[w.stage];
	const [r, c] = w.cell.split(',').map(Number);
	ok(st.tiles[r][c] === 'i', `${w.layer} ${w.stage} (${w.cell}) が 'i' でない＝書き換え先が読めない`);
	const sd = st.signData ?? (st.signData = {});
	const now = sd[w.cell];
	ok(now?.name === w.name, `${w.layer} ${w.stage} (${w.cell}) の看板が想定外: ${JSON.stringify(now?.name)}`);
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	if (same(now.lines, w.neu)) { step('=', `${w.layer} ${w.stage} (${w.cell}) は既に狙いどおり`); continue; }
	ok(same(now.lines, w.old),
		`${w.layer} ${w.stage} (${w.cell}) の本文が想定外:\n    ${JSON.stringify(now.lines)}`);
	sd[w.cell] = { ...now, lines: [...w.neu] };
	const dropped = w.old.filter((t) => !w.neu.includes(t));
	const added = w.neu.filter((t) => !w.old.includes(t));
	step('✔', `${w.layer} ${w.stage} (${w.cell}) 「${w.name}」を ${w.old.length} 行 → ${w.neu.length} 行に書き換えた ＝ ${w.why}`);
	dropped.forEach((t) => step(' ', `  − ${t}`));
	added.forEach((t) => step(' ', `  ＋ ${t}`));   // 引用符を閉じ直した行はここに出る
}

// ── 失効した部屋コメントを上書き（WORKFLOW Step 4-3） ────────────────────────
{
	const dt = data.layers.dark_tower.stages;
	dt['3,2'].comment = '[dark_tower 3,2] 笛の間（キュー20b ④・2026-09-22）。この部屋で笛を吹くと'
		+ '封印の宝箱 B(5,5) が現れる（fluteEffect reveal → ss.flutePlayed → showConditions '
		+ 'flutePlayed＝game/conditions.js:141）。中身は矢筒（矢の上限 +8）＝世界で唯一の配置。'
		+ '寄道∴本道（南の 3,3 へ抜けて 4F の階段に乗る）には一切必要ない。'
		+ '⚠️ 開封の文は fluteEffect.message に書く＝showConditions[cell].message は '
		+ 'bossYielded（game/boss.js:477）しか読まない。'
		+ '⚠️ 案内の刻み文 i(2,2) は 2026-09-24（キュー20c）に外した＝「笛で封が解ける」は '
		+ 'D8 1,1／1,2 で既習∴終盤で操作を説明し直さない。笛は塔に入る時点で必携'
		+ '（石の間 4,3 の詰み回復に要る）∴吹く動機は残る。';
	dt['4,2'].comment = '[dark_tower 4,2] 4F の関門＝はしごで穴 row6 を渡り、爆弾で壁 (8,5)(8,6) を'
		+ '壊して石の間 `4,3` へ抜ける。床の爆弾 5(7,5)＝TILE.ITEM_BOMB は関門の手前の供給'
		+ '（以前このコメントに「矢束」と書いてあったのは誤り）。'
		+ '⚠️ 刻み文は (7,1) の1枚だけ＝「この先は 石の 間」＝次の間の予告と詰み回復（笛）の案内'
		+ '（2026-09-23 に `4,1` から移設）。関門の案内だった (1,1) は 2026-09-24（キュー20c）に'
		+ '外した＝穴も罅割れ壁も画面に見えており、どちらも既習。'
		+ "'i' は通行不可∴廊下 row7 の途中に置くと東西が分断される＝端 (7,1) に置いている。";
}

// ──────────────────────────────────────────────────────────────────────
// ③ 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
const check = (msg, cond) => verify.push([cond, msg]);

// (A) 外した13枚
{
	const bad = REMOVALS.filter(([l, s, cell]) => {
		const st = data.layers[l].stages[s];
		const [r, c] = cell.split(',').map(Number);
		return st.tiles[r][c] === 'i' || !!st.signData?.[cell];
	}).map(([l, s, cell]) => `${l} ${s}(${cell})`);
	check(`外した13枚にタイルも本文も残っていない（実測の残り: ${bad.join(' ') || 'なし'}）`, bad.length === 0);
}

// (B) 全レイヤー横断で無言看板・死にデータがゼロ（[[blade-sign-two-formats]]）
{
	const bad = [];
	for (const [lk, l] of Object.entries(data.layers ?? {})) {
		for (const [sk, st] of Object.entries(l.stages ?? {})) {
			const tiles = [];
			rowsOf(st).forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'i') tiles.push(`${r},${c}`); }));
			const body = (k) => st.signData?.[k]?.lines?.length || st.npcData?.[k]?.lines?.length;
			for (const t of tiles) if (!body(t)) bad.push(`${lk} ${sk}(${t}) 無言看板`);
			for (const k of Object.keys(st.signData ?? {})) if (!tiles.includes(k)) bad.push(`${lk} ${sk}(${k}) 死にデータ`);
		}
	}
	check(`全レイヤーで無言看板・死にデータが無い（実測: ${bad.join(' / ') || 'なし'}）`, bad.length === 0);
}

// (C) 断章9枚が不変
{
	const bad = TABLETS.filter(([l, s, cell]) => {
		const st = data.layers[l].stages[s];
		const [r, c] = cell.split(',').map(Number);
		return st.tiles[r][c] !== 'i' || !(st.signData?.[cell]?.lines?.length >= 2);
	}).map(([l, s, cell]) => `${l} ${s}(${cell})`);
	check(`断章9枚が本文つきで残っている（実測の欠け: ${bad.join(' ') || 'なし'}）`, bad.length === 0);
}

// (D) 弱点を示す行が残っている（同じ行に敵の名＋行いの語）
for (const [seg, word, layer, stage, cell] of WEAKNESS_LINES) {
	const lines = data.layers[layer].stages[stage].signData?.[cell]?.lines ?? [];
	const hit = lines.some((t) => t.includes(seg) && t.includes(word));
	check(`${layer} ${stage}(${cell}) に「${seg}」＋「${word}」の行が残っている`, hit);
}

// (E) 触った部屋は対象の升以外1升も動いていない／境界の開きが不変
for (const key of TOUCHED) {
	const [l, s] = key.split(' ');
	const st = data.layers[l].stages[s];
	const now = rowsOf(st);
	const was = before.rows[key];
	const diffs = [];
	now.forEach((row, r) => [...row].forEach((ch, c) => { if (was[r][c] !== ch) diffs.push(`${r},${c}:${was[r][c]}→${ch}`); }));
	const expected = REMOVALS.filter(([ll, ss]) => ll === l && ss === s).map(([, , cell]) => cell);
	check(`${key} の差分が狙いの升だけ（実測 ${diffs.join(' ') || 'なし'}／狙い ${expected.join(' ') || 'なし'}）`,
		diffs.length === expected.length && diffs.every((d) => expected.includes(d.split(':')[0])));
	check(`${key} の境界の開きが不変（実測 ${openingSig(st)}）`, openingSig(st) === before.opening[key]);
}

// (F) 各レイヤーの到達部屋数が不変（看板を床に戻して導線が壊れていない）
for (const l of LAYERS) {
	const now = reachOf(l);
	check(`${l} の到達部屋数が不変（${before.reach[l]} → ${now}／全 ${Object.keys(data.layers[l].stages).length} 室）`,
		now === before.reach[l]);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log('# キュー20c：後半ダンジョンのヒント看板を間引く（外す13・書き換え4）');
console.log(log.join('\n') || '  （変更なし）');

console.log('\n## 看板の枚数（\'i\' タイル）');
for (const l of LAYERS) {
	console.log(`  ${l.padEnd(11)} ${before.signs[l]} → ${signCountOf(l)}`);
}

console.log('\n## 盤面の差分（変わった行だけ）');
for (const key of TOUCHED) {
	const [l, s] = key.split(' ');
	const now = rowsOf(data.layers[l].stages[s]);
	const changed = now.map((row, i) => [i, before.rows[key][i], row]).filter(([, was, is]) => was !== is);
	if (!changed.length) { console.log(`  ${key}  （盤面は不変＝本文だけ書き換え）`); continue; }
	console.log(`  ${key}`);
	for (const [i, was, is] of changed) console.log(`    ${String(i).padStart(2)} ${was}   →   ${is}`);
}

console.log('\n## 検証');
let ng = 0;
for (const [cond, msg] of verify) {
	console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
	if (!cond) ng++;
}
if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
	console.log('\n書き込み完了:', MAP_PATH);
}

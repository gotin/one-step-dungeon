// Phase 5.5m — 新規敵15種を本編レイヤーへ配置する（自己検査型マイグレーション）
//
// 配置表は `scripts/lib/enemy-placement.mjs`（migrate とテストの共通の真実）。
// このスクリプトは「表のとおりに書き込む」だけで、判断は一切しない。
// 書き込む前に以下を全部 assert する（1つでも落ちたら書かずに終了）：
//
//   ①  対象ステージが存在し 10 行 × 12 列である
//   ②  関門部屋（PINNED_STAGES）を触っていない
//   ③  置く先のセルが素の床 '.' である（宝箱・鍵・看板・水・壁を潰さない）
//   ④  置く先が外周ではない＝内側 rows1-8 / cols1-10
//       （外周に置くと隣の画面から入ってきたプレイヤーの着地セルを敵が塞ぐ）
//   ⑤  ダンジョン系レイヤーでは、外周の開口部の「1つ内側」（着地セル）にも置かない
//   ⑥  変更が「敵タイル ↔ '.'」の範囲に収まっている＝地形・壁・水・宝箱・鍵は不変
//       ∴接続性/整合性の検査結果は動かない（敵タイルは検査から見て歩ける床）
//   ⑦  部屋の脅威度が設計値（表の threat）と一致する（値は ENEMY_META から導出）
//   ⑧  enemyDirs に幽霊キーが残らない／向き別スプライトを持つ敵には必ず向きがある
//   ⑨  密度（歩ける床 ÷ 敵の数）が 10 以上＝逃げ場がある
//   ⑩  弱点持ちの敵は、その弱点道具が入手済みのレイヤー以降にしか置かない
//   ⑪  進行順の看板部屋（SIGNATURE_LADDER）の脅威度が単調増加する
//
// 使い方: node scripts/migrate-place-new-enemies.mjs [--dry]

import { readFileSync, writeFileSync } from 'node:fs';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import {
	NEW_ENEMY_PLACEMENT, SIGNATURE_LADDER, PINNED_STAGES, WEAKNESS_ITEM,
	THREAT_OF, stageThreat, tilesOf,
} from './lib/enemy-placement.mjs';
import { toolsUsableIn } from '../shared/progression.js';

const MAP_PATH = new URL('../work/blade-of-lumia.json', import.meta.url);
const DRY = process.argv.includes('--dry');
const ROWS = 10, COLS = 12;

// 「そのレイヤーの中で使える道具」は `shared/progression.js` の `toolsUsableIn(map)`＝
// 実マップの報酬配置からの導出（2026-09-05・0g で手書きの `UNLOCKED_AT` を消して置き換えた）。
// ⚠️ field はその表に無い＝地域ごとに到達時期が違う∴空集合として扱う。
//    フィールドへ弱点持ちを置こうとすると ⑩ で落ちる（地域別の表を作るまで置けない）。

// 歩けないタイル（接続検査と同じ語彙）。敵タイルはここに入らない＝敵は歩ける床の上に立つ。
const BLOCKING = new Set([TILE.WALL, TILE.WATER, TILE.TREE, TILE.BREAKABLE_WALL, TILE.GATE, TILE.DOOR]);

const fail = (msg) => { throw new Error(`[5.5m 配置] ${msg}`); };
const isEnemy = (ch) => !!ENEMY_META[ch];
const isMob = (ch) => !!ENEMY_META[ch] && !ENEMY_META[ch].isBoss;

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const TOOLS_USABLE_IN = toolsUsableIn(data);
const results = [];

for (const entry of NEW_ENEMY_PLACEMENT) {
	const id = `${entry.layer}/${entry.stage}`;
	if (PINNED_STAGES.has(id)) fail(`${id} は関門部屋（脅威度が test で固定されている）∴触らない`);

	const stage = data.layers?.[entry.layer]?.stages?.[entry.stage];
	if (!stage) fail(`${id} が無い`);

	// ① 幾何
	const before = tilesOf(stage);
	if (before.length !== ROWS) fail(`${id} は ${before.length} 行（${ROWS} 行のはず）`);
	for (const [r, row] of before.entries()) {
		if (row.length !== COLS) fail(`${id} の row${r} は ${row.length} 列（${COLS} 列のはず）`);
	}

	// 外周の開口部（歩けるタイルが外周にある＝隣の画面への出入口）と、その1つ内側（着地セル）
	const landings = new Set();
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const onEdge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
			if (!onEdge || BLOCKING.has(before[r][c])) continue;
			landings.add(`${r},${c}`);
			if (entry.layer === 'field') continue;   // フィールドは全周が入口＝内側まで禁じると置けない
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nr = r + dr, nc = c + dc;
				if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
				if (!BLOCKING.has(before[nr][nc])) landings.add(`${nr},${nc}`);
			}
		}
	}

	// 盤面を作る（replace は既存の雑魚を床へ戻す。ボスは残す）
	const after = before.map(row => row.slice());
	const cleared = [];
	if (entry.mode === 'replace') {
		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS; c++) {
				if (!isMob(after[r][c])) continue;
				cleared.push(`${after[r][c]}(${r},${c})`);
				after[r][c] = TILE.FLOOR;
			}
		}
	}

	for (const [tile, cells] of Object.entries(entry.place)) {
		const meta = ENEMY_META[tile];
		if (!meta) fail(`${id}: '${tile}' が ENEMY_META に無い`);
		if (meta.isBoss) fail(`${id}: '${tile}' はボス∴雑魚配置に使わない`);
		// ⑩ 弱点持ちは対抗道具が入手済みの地点以降だけ
		if (meta.weakness) {
			const item = WEAKNESS_ITEM[meta.weakness.type];
			if (!item) fail(`${id}: '${tile}' の弱点 ${meta.weakness.type} に対応する道具が表に無い`);
			if (!(TOOLS_USABLE_IN[entry.layer] ?? new Set()).has(item)) {
				fail(`${id}: '${tile}'（${meta.name}）の弱点道具 ${item} がこの地点では未入手`);
			}
		}
		for (const key of cells) {
			const [r, c] = key.split(',').map(Number);
			// ④ 内側だけ
			if (r < 1 || r > ROWS - 2 || c < 1 || c > COLS - 2) fail(`${id} (${key}) は外周＝置かない`);
			// ⑤ 着地セルを塞がない
			if (landings.has(key)) fail(`${id} (${key}) は出入口の着地セル＝敵で塞ぐと入室できない`);
			// ③ 素の床にだけ置く
			if (after[r][c] !== TILE.FLOOR) {
				fail(`${id} (${key}) は '${after[r][c]}'＝素の床ではない（潰してはいけない物がある）`);
			}
			after[r][c] = tile;
		}
	}

	// ⑥ 変更は「敵 ↔ 床」の範囲に収まっているか＝地形は不変
	const diffs = [];
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const o = before[r][c], n = after[r][c];
			if (o === n) continue;
			const ok = (isMob(o) || o === TILE.FLOOR) && (isMob(n) || n === TILE.FLOOR);
			if (!ok) fail(`${id} (${r},${c}) で地形が変わっている（'${o}' → '${n}'）`);
			diffs.push(`(${r},${c}) '${o}'→'${n}'`);
			// 歩ける/歩けないも変わっていない（敵タイルは歩ける床扱い）
			if (BLOCKING.has(o) !== BLOCKING.has(n)) fail(`${id} (${r},${c}) で通行可否が変わった`);
		}
	}
	if (!diffs.length) fail(`${id} に変更が無い（表と盤面が既に一致？）`);

	// ⑦ 脅威度が設計値どおり
	const threat = after.flat().reduce((t, ch) => t + (isMob(ch) ? THREAT_OF(ENEMY_META[ch]) : 0), 0);
	if (Math.abs(threat - entry.threat) > 1e-9) {
		fail(`${id} の脅威度が設計値と違う（実 ${threat} / 設計 ${entry.threat}）`);
	}

	// ⑧ enemyDirs（幽霊キーを消し、表の向きを載せる）
	const enemyCells = new Set();
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isEnemy(after[r][c])) enemyCells.add(`${r},${c}`);
	const dirs = {};
	for (const [key, dir] of Object.entries(stage.enemyDirs ?? {})) if (enemyCells.has(key)) dirs[key] = dir;
	for (const [key, dir] of Object.entries(entry.dirs ?? {})) {
		if (!enemyCells.has(key)) fail(`${id} の dirs ${key} に敵が居ない`);
		dirs[key] = dir;
	}
	for (const key of enemyCells) {
		const [r, c] = key.split(',').map(Number);
		const meta = ENEMY_META[after[r][c]];
		if (meta.directional && !dirs[key]) fail(`${id} (${key}) は向き別スプライトの敵∴初期の向きが必要`);
	}

	// ⑨ 密度＝歩ける床 ÷ 敵の数（洞窟の通路のような細い部屋でも 10 は確保する）
	const open = after.flat().filter(ch => !BLOCKING.has(ch)).length;
	const per = open / enemyCells.size;
	if (per < 10) fail(`${id} の密度が高すぎる（歩ける床 ${open} / 敵 ${enemyCells.size} = ${per.toFixed(1)}）`);

	results.push({ id, entry, before, after, diffs, cleared, threat, dirs, open, per });
}

// ⑪ 看板部屋の脅威度が進行順で単調増加
const byId = new Map(results.map(r => [r.id, r]));
let prev = null;
const ladderLog = [];
for (const { layer, stage } of SIGNATURE_LADDER) {
	const id = `${layer}/${stage}`;
	const r = byId.get(id);
	if (!r) fail(`看板部屋 ${id} が配置表に無い`);
	if (prev && r.threat <= prev.threat) {
		fail(`看板部屋の脅威度が単調増加していない（${prev.id} ${prev.threat} → ${id} ${r.threat}）`);
	}
	ladderLog.push(`${id} ${r.threat}`);
	prev = r;
}

// ── 全部通った。ここで初めて書き込む ─────────────────────────────
for (const r of results) {
	const stage = data.layers[r.entry.layer].stages[r.entry.stage];
	console.log(`\n=== ${r.id}  脅威 ${stageThreat(stage, ENEMY_META)} → ${r.threat}（密度 ${r.per.toFixed(1)}）`);
	if (r.cleared.length) console.log(`    片付け: ${r.cleared.join(' ')}`);
	console.log(`    差分: ${r.diffs.join(' ')}`);
	for (let i = 0; i < ROWS; i++) {
		const b = r.before[i].join(''), a = r.after[i].join('');
		console.log(`    ${String(i).padStart(2)} ${b}   ${b === a ? '  ' : '=>'} ${a}`);
	}
	if (DRY) continue;
	stage.tiles = r.after.map(row => row.slice());
	if (Object.keys(r.dirs).length) stage.enemyDirs = r.dirs;
	else if (stage.enemyDirs) delete stage.enemyDirs;
	// 部屋の意図を盤面のそばに残す（WORKFLOW Step 4-3＝失効した記述を残さない）
	const tail = `【5.5m 敵配置】${r.entry.why}`;
	const base = String(stage.comment ?? '').replace(/【5\.5m 敵配置】.*$/s, '').trim();
	stage.comment = base ? `${base}\n${tail}` : tail;
}

console.log(`\n看板部屋の梯子: ${ladderLog.join(' < ')}`);

if (DRY) {
	console.log('\n--dry ∴書き込まなかった');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log(`\n書き込んだ: ${MAP_PATH.pathname}（${results.length} ステージ）`);
}

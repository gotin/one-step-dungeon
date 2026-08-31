// test_mechanics の**2行目（y=1）** に「リバランスを実プレイで確かめる行」を作る／更新する
// （2026-08-23・Phase 8-4 (2)）。
//
// ユーザー依頼＝「試して欲しいボス敵・ザコ敵を test_mechanics の二行目（x,1 の行）に
// 並べてくれない？ ステージの間に壁なしで移動できるようにして。」
//
// ## 作るもの
//
//   ENEMY_META の**全34種**を 1体/1ステージ で横一列（0,1 〜 33,1）に並べる。
//   左右の外周は tests/test-arena-doors.js の通路（rows 7/8）だけ床＝**歩いて隣の部屋へ
//   抜けられる**（＝「壁なしで移動」の実装。通路の定義はあのファイル1箇所だけ）。
//   各部屋に看板を1枚置き、その敵の HP/ATK/DEF と「木の剣で何発／被弾何ダメージ」を書く
//   ＝手応えを測る前に**期待値が読める**（Phase 8-4 (1) の数値をゲーム内で突き合わせられる）。
//
//   並び（x）は ENEMY_META から導出する（手書きの表を作らない）：
//     陸/空ザコ(18) → 水棲ザコ(3) → 陸ボス(11) → 水棲ボス(1) → ラスボス Z(1)
//   宣言側は tests/test-arena-doors.js の BALANCE_ARENAS ＋ tests/test-stage-keys.js の座標表。
//   導出と宣言が食い違えばこのスクリプトが止まる（敵を1種足したら「表に無い」と言う）。
//
// ## 幾何（3種のテンプレートしか無い）
//
//   陸/空（1×1）  … 外周は壁・通路 rows 7/8・内部は全面床・敵 (4,8)・看板 (6,1)
//   陸ボス（2×2） … 同じ盤面で敵 (4,7)＝rows 4-5 / cols 7-8 を占有する
//   水棲          … 同じ盤面 ＋ bgTiles の水帯（rows 4/5・cols 1〜10）。
//                   水棲ザコは (5,8)＝**row 6 の陸から剣が届く**位置に置く
//                   （水は徒歩不可・水棲敵は陸に上がれない∴間合いが取れないと殴れない）。
//                   両生2×2（海の主）は (4,7)＝rows 4-5 が水帯＝半身が水に入る。
//
// ## 自己検査（書き込み前に assert）
//
//   1. 形（10×12）／外周は壁。ただし通路（rows 7/8 の左右端）は床
//   2. 内部は素の床のみ（敵の占有セルと看板を除く）＝遮蔽ゼロ
//   3. 敵はちょうど1体・期待したタイル・ENEMY_META にある
//   4. 2×2 は占有セル（rows r..r+h-1 / cols c..c+w-1）がすべて内部かつ床
//   5. directional な敵には enemyDirs を 'left'（西＝プレイヤーが入って来る側）で与える
//   6. 剣が届く立ち位置がある＝敵の占有セルに隣接する「立てるセル」（床かつ水でない）が1つ以上
//   7. 水棲/両生は占有セルがすべて水帯の中（水に立てない敵を陸に置かない）
//   8. 通路（rows 7/8）と看板の周り（rows 6/7 の col 1）は水にしない＝歩いて渡れる・看板が読める
//   9. 看板は tiles が 'i' かつ signData に {name, lines:[非空]}（tests/no-empty-signs.spec.js の形）
//  10. `isBossRoom` を書かない＝入室で扉が閉じない（閉じたら「壁なしで隣へ歩ける」が死ぬ）
//  11. ENEMY_META の全種がちょうど1回ずつ並ぶ（漏れ・重複ゼロ）
//  12. ラスボス（isFinalBoss）は行の**最後**（撃破でエンディング∴途中に置くと先が試せない）
//  13. 導出した並びが BALANCE_ARENAS と一致し、各名前が TEST_STAGE_KEYS で `x,1` を指す
//  14. 既存ステージを上書きする場合、同名の用途にしか使われていない（他を踏み潰さない）
//  15. **y=1 以外のステージ・他レイヤーを1バイトも変えない**（書き込み前後で JSON を比較）
//
// 使い方:
//   node scripts/migrate-test-balance-row.mjs --dry
//   node scripts/migrate-test-balance-row.mjs

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { SWORD_TIERS, BASE_ATK, ARMOR_TIERS, BASE_DEF } from '../shared/items.js';
import { TEST_LAYER, TEST_STAGE_KEYS, stageKey } from '../tests/test-stage-keys.js';
import { BALANCE_ARENAS, openArenaDoors, isArenaDoor, ARENA_DOOR_ROWS } from '../tests/test-arena-doors.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const ROWS = 10, COLS = 12;
const ROW_Y = 1;                       // この行の y
const ENEMY_CELL = [4, 8];             // 1×1 の敵（陸/空）
const BIG_CELL   = [4, 7];             // 2×2 の敵（占有 rows 4-5 / cols 7-8）
const WATER_CELL = [5, 8];             // 水棲ザコ（row 6 の陸から剣が届く）
const SIGN_CELL  = [6, 1];             // 看板（通路 row 7 の真上＝(7,1) から上を向いて読む）
const WATER_ROWS = [4, 5];             // 水帯の行
const WATER_COLS = Array.from({ length: COLS - 2 }, (_, i) => i + 1);   // 1〜10

// 最小構成（Phase 8-4 の判定基準＝本編の1本道は剣も鎧も配らない）。
const WOOD_ATK  = BASE_ATK + SWORD_TIERS[0].atk;    // 木の剣＝4
const CLOTH_DEF = BASE_DEF + ARMOR_TIERS[0].def;    // 布の服＝1

const WEAK_JP = {
	bomb: '爆弾', arrow: '矢', fire: '炎（ロウソク）', beam: '剣ビーム', boomerang: 'ブーメラン',
	sword: '剣',
};
// 弱点の「窓」（`weakness.window`・0d-2.11 (A) で追加）＝倍率が乗る時間帯。
// これを書かないと看板が「剣 ×3」だけを見せ、いつ斬れば ×3 なのかを隠す（G で実害）。
const WEAK_WINDOW_JP = {
	recover: '（乗るのは敵の攻撃直後の硬直の窓だけ＝それ以外は等倍）',
};
// 層2（0d-3）の固有機構＝「その敵の戦い方」を1行で書く。キーは ENEMY_META の機構フィールド名
// ∴敵ではなく機構に紐づく（手書きの敵→文言の表を作らない＝[[blade-enemy-tables-derive-from-meta]]）。
// 実装が済んだ機構から順に足す（未登録の機構は行が増えないだけ＝看板は壊れない）。
// ⚠️ `coil`（J）・`soar`（U）の2行は元々**看板へ直接手で書かれていた**（＝この手順書の
//    「手編集しない」に反していた＝再生成で消える形だった）∴ここへ移して導出に載せる。
const MECH_HINT_JP = {
	coil: '巻きつきの輪が閉じる前に輪の外へ出る',
	soar: '滞空中は剣が届かない＝矢で射抜けば墜落して大きな隙',
	momentum: '重い体は止まれない＝壁へ誘導して崩し、崩れているあいだに斬る',
};

// ── 並びの導出（ENEMY_META が単一の真実）──────────────────────────────
// タイル文字 → TILE のキー名（看板名やステージ名の元）。
const TILE_KEY_OF = Object.fromEntries(Object.entries(TILE).map(([k, v]) => [v, k]));
const isAquatic = (m) => m.move === 'water' || m.move === 'amphibious';
// グループ番号が小さいほど西（入口側）。ラスボスは必ず最後。
const groupOf = (m) => (m.isFinalBoss ? 4 : (m.isBoss ? 2 : 0) + (isAquatic(m) ? 1 : 0));

const roster = Object.entries(ENEMY_META);
const derived = [0, 1, 2, 3, 4].flatMap(g => roster.filter(([, m]) => groupOf(m) === g))
	.map(([tile, meta]) => {
		const key = TILE_KEY_OF[tile];
		if (!key) throw new Error(`ENEMY_META のタイル '${tile}' が TILE に無い（名前を導出できない）`);
		return { tile, meta, name: `bal_${key.toLowerCase()}` };
	});

// 11. 全種がちょうど1回ずつ
if (derived.length !== roster.length) {
	throw new Error(`導出した並びが ${derived.length} 種＝ENEMY_META の ${roster.length} 種と合わない`);
}
const seen = new Set(derived.map(d => d.tile));
if (seen.size !== derived.length) throw new Error('導出した並びにタイルの重複がある');

// 12. ラスボスは最後
const finalIdx = derived.findIndex(d => d.meta.isFinalBoss);
if (finalIdx !== -1 && finalIdx !== derived.length - 1) {
	throw new Error(`ラスボス ${derived[finalIdx].meta.name} が ${finalIdx} 番目＝行の最後でない`
		+ '（撃破でエンディングが始まる∴途中に置くと行の残りを試せない）');
}

// 13. 宣言（BALANCE_ARENAS / TEST_STAGE_KEYS）と一致するか
if (derived.length !== BALANCE_ARENAS.length) {
	throw new Error(`BALANCE_ARENAS が ${BALANCE_ARENAS.length} 枚＝導出の ${derived.length} 枚と合わない`
		+ '（敵を足した／消したなら tests/test-arena-doors.js と tests/test-stage-keys.js を直す）');
}
derived.forEach((d, i) => {
	if (BALANCE_ARENAS[i] !== d.name) {
		throw new Error(`並びが宣言と食い違う: x=${i} は導出 '${d.name}' / 宣言 '${BALANCE_ARENAS[i]}'`);
	}
	const expected = `${i},${ROW_Y}`;
	const actual = stageKey(d.name);     // 表に無ければ stageKey が投げる
	if (actual !== expected) {
		throw new Error(`TEST_STAGE_KEYS['${d.name}'] が '${actual}'＝期待 '${expected}' でない`);
	}
});

// ── 盤面の組み立て ──────────────────────────────────────────────────
const swingsFor = (m) => Math.ceil(m.hp / Math.max(1, WOOD_ATK - m.def));
const hitFor    = (m) => Math.max(1, m.atk - CLOTH_DEF);

function buildBoard() {
	const grid = [];
	for (let r = 0; r < ROWS; r++) {
		const row = [];
		for (let c = 0; c < COLS; c++) {
			const onEdge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
			row.push(onEdge ? TILE.WALL : TILE.FLOOR);
		}
		grid.push(row);
	}
	// 通路は宣言した盤面に直接書かずここで開ける＝盤面を書き足すときに潰せない
	return openArenaDoors(grid);
}

function waterCellsFor(entry) {
	if (!isAquatic(entry.meta)) return [];
	return WATER_ROWS.flatMap(r => WATER_COLS.map(c => [r, c]));
}

function signLinesFor(entry, index) {
	const m = entry.meta;
	const lines = [
		`${m.name}（${entry.tile}）　HP ${m.hp} ／ ATK ${m.atk} ／ DEF ${m.def}`,
		`木の剣（攻撃力 ${WOOD_ATK}）で ${swingsFor(m)} 発。布の服（防御 ${CLOTH_DEF}）だと 1 発 ${hitFor(m)} ダメージ。`,
		m.weakness
			? `弱点＝${WEAK_JP[m.weakness.type] ?? m.weakness.type} ×${m.weakness.multiplier}`
				+ (m.weakness.window ? (WEAK_WINDOW_JP[m.weakness.window] ?? `（窓＝${m.weakness.window}）`) : '')
			: '弱点の属性は無し（剣で殴るのが基本）',
	];
	for (const [field, hint] of Object.entries(MECH_HINT_JP)) {
		if (m[field]) lines.push(hint);
	}
	if (isAquatic(m)) {
		lines.push('水の中の敵＝陸（row 6）に立って殴る。離れて撃つ相手には弓/ブーメランが要る。');
	}
	if (m.isFinalBoss) {
		lines.push('⚠ 倒すとエンディングが始まる（この行の終点）。');
	}
	if (index === 0) {
		lines.push('⚠ プレビューは常にデバッグ ON（無敵・すり抜け）＝G キーで切ってから試す。');
		lines.push('東へ歩くほど重くなる（ザコ→水棲→ボス→ラスボス）。部屋の間に壁は無い。');
	}
	return lines;
}

const prepared = derived.map((entry, index) => {
	const { tile, meta, name } = entry;
	const key = `${index},${ROW_Y}`;
	const grid = buildBoard();
	const w = meta.size?.w ?? 1, h = meta.size?.h ?? 1;
	const aquatic = isAquatic(meta);
	const [er, ec] = (w > 1 || h > 1) ? BIG_CELL : (aquatic ? WATER_CELL : ENEMY_CELL);

	// 4. 占有セルがすべて内部かつ床
	const footprint = [];
	for (let r = er; r < er + h; r++) {
		for (let c = ec; c < ec + w; c++) {
			if (r < 1 || r > ROWS - 2 || c < 1 || c > COLS - 2) {
				throw new Error(`${name}: 占有セル(${r},${c}) が内部に収まらない（${w}×${h}）`);
			}
			if (grid[r][c] !== TILE.FLOOR) throw new Error(`${name}: 占有セル(${r},${c}) が床でない`);
			footprint.push([r, c]);
		}
	}
	grid[er][ec] = tile;

	// 看板
	const [sr, sc] = SIGN_CELL;
	if (grid[sr][sc] !== TILE.FLOOR) throw new Error(`${name}: 看板のセル(${sr},${sc}) が床でない`);
	grid[sr][sc] = TILE.SIGN;
	const lines = signLinesFor(entry, index);
	if (!lines.length || lines.some(l => typeof l !== 'string' || !l.trim())) {
		throw new Error(`${name}: 看板の本文が空（tests/no-empty-signs.spec.js が赤くなる）`);
	}
	// 看板を読む立ち位置（通路 row 7 の col 1）が床であること
	if (grid[ARENA_DOOR_ROWS[0]][sc] !== TILE.FLOOR) {
		throw new Error(`${name}: 看板を読む立ち位置(${ARENA_DOOR_ROWS[0]},${sc}) が床でない`);
	}

	// 水帯
	const water = waterCellsFor(entry);
	const waterSet = new Set(water.map(([r, c]) => `${r},${c}`));
	// 7. 水棲/両生の占有セルはすべて水帯の中
	if (aquatic) {
		for (const [r, c] of footprint) {
			if (!waterSet.has(`${r},${c}`)) {
				throw new Error(`${name}: 水棲/両生の占有セル(${r},${c}) が水帯の外`
					+ '（水に立てない敵を陸に置いている＝そこから動けない）');
			}
		}
	}
	// 8. 通路（rows 7/8）と看板・その立ち位置は水にしない
	for (const r of ARENA_DOOR_ROWS) {
		for (let c = 0; c < COLS; c++) {
			if (waterSet.has(`${r},${c}`)) throw new Error(`${name}: 通路の行 ${r} に水がある＝歩いて渡れない`);
		}
	}
	if (waterSet.has(`${sr},${sc}`)) throw new Error(`${name}: 看板(${sr},${sc}) が水の中`);

	// 1/2. 外周と内部の検査
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const t = grid[r][c];
			const onEdge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
			if (onEdge) {
				if (isArenaDoor(r, c, COLS)) {
					if (t !== TILE.FLOOR) throw new Error(`${name}: 通路(${r},${c}) が床でない: '${t}'`);
					continue;
				}
				if (t !== TILE.WALL) {
					throw new Error(`${name}: 外周(${r},${c}) が壁でない: '${t}'`
						+ `（通路は rows ${ARENA_DOOR_ROWS.join('/')} だけ）`);
				}
				continue;
			}
			if (r === er && c === ec) continue;          // 敵
			if (r === sr && c === sc) continue;          // 看板
			if (t !== TILE.FLOOR) throw new Error(`${name}: 内部(${r},${c}) が素の床でない: '${t}'（遮蔽ゼロ）`);
		}
	}

	// 3. 敵はちょうど1体
	const enemyCells = [];
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) if (ENEMY_META[grid[r][c]]) enemyCells.push(`${r},${c}`);
	}
	if (enemyCells.length !== 1 || enemyCells[0] !== `${er},${ec}`) {
		throw new Error(`${name}: 敵は (${er},${ec}) に1体だけ: ${enemyCells.join(' ')}`);
	}

	// 5. directional には向きを与える（西＝プレイヤーが入って来る側）
	const enemyDirs = meta.directional ? { [`${er},${ec}`]: 'left' } : {};

	// 6. 剣が届く立ち位置がある（占有セルの4近傍に「床かつ水でない」セル）
	const standable = [];
	for (const [r, c] of footprint) {
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc;
			if (grid[nr]?.[nc] !== TILE.FLOOR) continue;
			if (waterSet.has(`${nr},${nc}`)) continue;
			standable.push(`${nr},${nc}`);
		}
	}
	if (!standable.length) {
		throw new Error(`${name}: 敵に隣接して立てるセルが無い＝剣が届かない（手応えを測れない）`);
	}

	const bgTiles = Object.fromEntries(water.map(([r, c]) => [`${r},${c}`, TILE.WATER]));
	const comment = `[${name}] Phase 8-4 (2) リバランスの実プレイ検証行（y=1）の ${index} 枚目`
		+ `＝${meta.name}（${tile}）1体。HP ${meta.hp} / ATK ${meta.atk} / DEF ${meta.def}`
		+ `＝木の剣(${WOOD_ATK})で ${swingsFor(meta)} 発・被弾 ${hitFor(meta)}（布の服 def ${CLOTH_DEF}）。`
		+ '幾何＝外周は壁・**左右の rows 7/8 だけ隣の部屋への通路**（歩いて並べて比べるため・塞がない）・'
		+ `内部は全面床（遮蔽ゼロ）・敵 (${er},${ec})・看板 (${sr},${sc})。`
		+ (aquatic ? `水帯＝bgTiles rows ${WATER_ROWS.join('/')} cols 1〜10（row 6 の陸から剣が届く）。` : '')
		+ (meta.isBoss ? '⚠️ ボスだが isBossRoom は立てない（立てると扉が閉じて隣へ歩けない）。' : '')
		+ (meta.isFinalBoss ? '⚠️ 撃破でエンディング＝この行の終点。' : '')
		+ ' scripts/migrate-test-balance-row.mjs が ENEMY_META から導出して書き込む（手編集しない）。';

	return {
		name, key, tile, meta, grid, enemyDirs, bgTiles, comment,
		signData: { [`${sr},${sc}`]: { name: `${meta.name} の間`, lines } },
		enemyCell: [er, ec], swings: swingsFor(meta), hit: hitFor(meta),
	};
});

// ── 既存マップとの突き合わせ ────────────────────────────────────────
const before = readFileSync(MAP_PATH, 'utf8');
const data = JSON.parse(before);
const layer = data.layers?.[TEST_LAYER];
if (!layer) throw new Error(`レイヤーが無い: ${TEST_LAYER}`);

// 14. 別の用途のステージを踏み潰さない
for (const p of prepared) {
	const existing = layer.stages[p.key];
	if (existing && !(existing.comment ?? '').startsWith(`[${p.name}]`)) {
		throw new Error(`${TEST_LAYER}[${p.key}] は別の用途で使われている`
			+ `（comment: ${String(existing.comment).slice(0, 40)}…）`);
	}
}
// 表に無い `x,1` のステージが残っていないか（並びを縮めたときの置き忘れ）
const declaredKeys = new Set(prepared.map(p => p.key));
for (const k of Object.keys(layer.stages)) {
	const [, y] = k.split(',').map(Number);
	if (y === ROW_Y && !declaredKeys.has(k)) {
		throw new Error(`${TEST_LAYER}[${k}] は y=${ROW_Y} にあるが並びの宣言に無い`
			+ '（tests/test-stage-keys.js から消したなら実体も消すこと）');
	}
}

// 15. 比較用に「y=1 以外」の姿を控える
const otherBefore = JSON.stringify({
	...data,
	layers: Object.fromEntries(Object.entries(data.layers).map(([lk, ld]) => [lk,
		lk !== TEST_LAYER ? ld : {
			...ld,
			stages: Object.fromEntries(Object.entries(ld.stages).filter(([k]) => !declaredKeys.has(k))),
		}])),
});

// ── 書き込み ────────────────────────────────────────────────────────
for (const p of prepared) {
	const existing = layer.stages[p.key];
	layer.stages[p.key] = {
		comment: p.comment,
		tiles: p.grid,
		bgTiles: p.bgTiles,
		links: existing?.links ?? [],
		enemyDirs: p.enemyDirs,
		signData: p.signData,
		rows: ROWS,
		cols: COLS,
	};
	// 10. isBossRoom は書かない（既存に付いていたら落とす＝扉が閉じない）
	if (layer.stages[p.key].isBossRoom) throw new Error(`${p.key}: isBossRoom を書いてしまっている`);
}

const otherAfter = JSON.stringify({
	...data,
	layers: Object.fromEntries(Object.entries(data.layers).map(([lk, ld]) => [lk,
		lk !== TEST_LAYER ? ld : {
			...ld,
			stages: Object.fromEntries(Object.entries(ld.stages).filter(([k]) => !declaredKeys.has(k))),
		}])),
});
if (otherBefore !== otherAfter) {
	throw new Error(`y=${ROW_Y} 以外のステージ/レイヤーが変わっている（この移行は行を1本足すだけ）`);
}

// ── 台帳の出力 ──────────────────────────────────────────────────────
console.log(`# ${TEST_LAYER} の y=${ROW_Y}（リバランス検証行）＝${prepared.length} 枚`);
console.log(`#   最小構成＝木の剣 ATK ${WOOD_ATK} / 布の服 DEF ${CLOTH_DEF}（本編の1本道が配る装備）`);
for (const [i, p] of prepared.entries()) {
	const flags = [
		p.meta.isBoss ? 'BOSS' : 'zako',
		p.meta.size ? `${p.meta.size.w}×${p.meta.size.h}` : '1×1',
		p.meta.move ?? 'land',
		p.meta.directional ? 'dir=left' : '',
		p.meta.isFinalBoss ? '⚠ENDING' : '',
	].filter(Boolean).join(' ');
	console.log(`  ${String(i).padStart(2)},${ROW_Y}  ${p.name.padEnd(20)} ${p.tile} ${p.meta.name.padEnd(11)}`
		+ ` hp${String(p.meta.hp).padStart(3)} atk${p.meta.atk} def${p.meta.def}`
		+ ` → 木の剣 ${String(p.swings).padStart(2)} 発 / 被弾 ${p.hit}  [${flags}]`);
}
console.log('#   幾何（1枚目のダンプ）:');
for (const [i, row] of prepared[0].grid.entries()) console.log(`     ${String(i).padStart(2)} ${row.join('')}`);
console.log(`#   通路＝左右の rows ${ARENA_DOOR_ROWS.join('/')}（歩いて隣の部屋へ抜けられる）`);
console.log('#   入口 URL: /blade-of-lumia/game/?fromEditor=1&layer=test_mechanics&stage=0,1'
	// ⚠️ ps_armor / ps_shield は**ティア番号**（2026-08-25 に曖昧さを解消）＝0 が下位ティア。
	+ `&row=${ARENA_DOOR_ROWS[0]}&col=1&ps_weapon=1&ps_armor=0&ps_shield=0&ps_bow=1&ps_bomb=1&ps_candle=1&ps_boomerang=1`);
console.log('#   ⚠ プレビューはデバッグ ON（無敵・すり抜け）＝入ったら G キーで切る');

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
}

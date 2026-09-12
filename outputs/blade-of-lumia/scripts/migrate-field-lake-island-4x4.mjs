#!/usr/bin/env node
/**
 * migrate-field-lake-island-4x4.mjs（キュー10番・10c-2・2026-09-12）
 *
 * §15 の湖10画面の「橋の交差点」を、見本の `field 11,10`（10c-1 でユーザー判定OK）と
 * 同じ形へ揃える＝**中央の陸を 4×4 の島にし、橋（幅2）より陸の幅を広く取る**。
 *
 * ユーザー指摘（2026-09-12）＝「手本は 11,10。9,7／10,7／8,8／9,8／10,8／11,8／8,10／
 * 9,10／10,10／9,11 についても島部分を4x4サイズにして、橋よりも架かっている陸部分の
 * 幅を大きく取るようにしてほしかった」。
 *
 * 見本 `11,10` の形（実データから読んだ）：
 *   - 島＝rows3-6 × cols4-7（4×4）。四隅は島の角タイル（`q`/`j`/`y`/`z`）で丸める。
 *   - 橋の腕は幅2（縦＝cols5-6・横＝rows4-5）で、島の外側で止まる
 *     ＝縦は rows0-2 と rows7-9、横は cols0-3 と cols8-11。
 *   - 島の中（rows3-6 × cols4-7）に板は1枚も無い＝橋を渡ると必ず陸に降りる。
 *
 * 現状の10画面は中央の陸が cols5-6 × rows4-5 の 2×2 しか無く（＝橋と同じ幅）、
 * 橋が島を貫いて見える。直しは2つだけ：
 *   (1) 島の範囲（rows3-6 × cols4-7）にある板を撤去する（下地は既に草地）
 *   (2) 島の四隅（(3,4)/(3,7)/(6,4)/(6,7)）の下地を水から島の角タイルへ変える
 *
 * ⚠️ 角を丸めるのは「外側の直交2セルがどちらも水」の隅だけ。片方が陸（別の小島・
 * 南へ伸びる陸の張り出し）だと、丸めた水のくさびが陸と陸の間に挟まって不自然になる
 * ∴その隅は素の草地にする（画面ごとに違う＝この判定はデータから導いて出力する）。
 *
 * `field 10,7` だけ看板が島の隅 (3,4) に立っている＝**看板は実エンジンでは通行不可**
 * （`game/passable.js`／`scripts/lib/connectivity.mjs:56`）∴橋の口へ移すと入口が半分塞がる。
 * ∴看板は動かさず、その隅だけ角丸にせず素の草地にする（上の「物が乗っている隅」の規則）。
 *
 * 対象外＝`field 8,9` と `field 10,9` の「板の絨毯」。**ユーザーが自分で直す（2026-09-12
 * 明言）∴このスクリプトは触らない。**
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE, BRIDGE_KIN } from '../shared/tiles.js';
import { cellTile, isHardBlocked } from './lib/connectivity.mjs';
import { duplicateLayoutGroups } from './lib/field-quality.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

/** 揃える10画面（ユーザー指定の並び順のまま） */
const SCREENS = ['9,7', '10,7', '8,8', '9,8', '10,8', '11,8', '8,10', '9,10', '10,10', '9,11'];

/** 島の範囲＝見本 11,10 と同じ rows3-6 × cols4-7 */
const R0 = 3, R1 = 6, C0 = 4, C1 = 7;
/** 四隅＝[r, c, 角タイル, 外側の直交2セル] */
const CORNERS = [
	[R0, C0, TILE.ISLAND_CORNER_NW, [[R0 - 1, C0], [R0, C0 - 1]]],
	[R0, C1, TILE.ISLAND_CORNER_NE, [[R0 - 1, C1], [R0, C1 + 1]]],
	[R1, C0, TILE.ISLAND_CORNER_SW, [[R1 + 1, C0], [R1, C0 - 1]]],
	[R1, C1, TILE.ISLAND_CORNER_SE, [[R1 + 1, C1], [R1, C1 + 1]]],
];

/** 橋の腕の対＝縦の腕は (r,5)/(r,6)、横の腕は (4,c)/(5,c)（いずれも島の外側だけ） */
const ARM_PAIRS = [
	...[0, 1, 2, R1 + 1, 8, 9].map((r) => [[r, 5], [r, 6]]),
	...[0, 1, 2, 3, C1 + 1, 9, 10, 11].map((c) => [[4, c], [5, c]]),
];

/**
 * 島の範囲でも**水のまま残さなければならない**セル（画面ごとの不変条件が優先する）。
 *
 * `field 9,10` の (3,4)＝**羽衣ゲート**（魔王の岩牢の入口）。岩礁（row1・cols1-4）と南岸
 * （橋 row4）の間には**水が2枚（rows2-3）**要る＝1枚になると はしご（D5 の報酬＝羽衣より
 * ずっと早い）で渡れてしまいゲートが消える（`isLadderBridgeCell`＝水1枚の両岸が陸なら渡れる）。
 * 4×4の島にすると (3,4) が陸になり rows2-3 の水が row2 の1枚だけになる∴この隅は水のまま。
 * 見張りは `tests/darklord-prison.spec.js` ①③（実際にこの移行の1回目で赤くなった）。
 */
const KEEP_WATER = { '9,10': [[3, 4]] };
const keepsWater = (key, r, c) => (KEEP_WATER[key] || []).some(([kr, kc]) => kr === r && kc === c);

/**
 * (4) 画面ごとの描き分け（重複レイアウトの回避）。
 *
 * 4×4の島へ揃えると、何も置いていない `8,8`／`9,7`／`10,8`／`10,10` の4画面が
 * **タイルまで完全に同一**になり `duplicateLayoutGroups()` が 0→1 に悪化する
 * （＝「量産」＝この計画で禁じている形）。∴橋の形は揃えたまま、湖の風景で描き分ける。
 *
 * 語彙は既存の物だけ＝岩礁（下地を岩肌 `c` に塗る＝`field 9,10` の岩牢の岩礁が前例）と
 * 小島の木（下地 `g` ＋ `t`）。**橋の腕（cols5-6／rows4-5）・島（rows3-6×cols4-7）・
 * 画面の縁（row0/row9/col0/col11＝継ぎ目）には置かない**（縁を歩ける物に変えると
 * 継ぎ目・dead edge が動く）。位置は画面ごとに手で決める（式で散らさない）。
 */
const SCENERY = {
	// 湖の西の渡し口＝西岸から岩が突き出ている
	'9,7': [{ r: 1, c: 1, bg: TILE.ASH }, { r: 1, c: 2, bg: TILE.ASH }],
	// 湖の北西＝北東に岩礁が連なる
	'8,8': [{ r: 1, c: 9, bg: TILE.ASH }, { r: 1, c: 10, bg: TILE.ASH }, { r: 2, c: 9, bg: TILE.ASH }],
	// 湖の南西＝南西に木の生えた小島＋その北に岩
	'10,8': [{ r: 8, c: 2, bg: TILE.GRASS, tile: TILE.TREE }, { r: 7, c: 1, bg: TILE.ASH }],
	// 湖の南東＝南東に岩礁、北東に木の生えた小島
	'10,10': [{ r: 8, c: 9, bg: TILE.ASH }, { r: 8, c: 10, bg: TILE.ASH }, { r: 2, c: 9, bg: TILE.GRASS, tile: TILE.TREE }],
};

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const bgAt = (st, r, c) => (st.bgTiles || {})[`${r},${c}`];

/** 触ってはいけない画面の書き換え前の姿＝見本と、ユーザーが自分で直す2画面 */
const UNTOUCHED = Object.fromEntries(
	['11,10', '8,9', '10,9'].map((k) => {
		const st = data.layers.field.stages[k];
		if (!st) throw new Error(`missing field stage ${k}`);
		return [k, JSON.stringify(st)];
	}),
);

let strippedTotal = 0;
let roundedTotal = 0;
let widenedTotal = 0;
let sceneryTotal = 0;
const notes = [];

for (const key of SCREENS) {
	const st = data.layers.field.stages[key];
	if (!st) throw new Error(`missing field stage ${key}`);
	if (st.rows !== 10 || st.cols !== 12) throw new Error(`unexpected size on ${key}`);

	// (1) 島の範囲の板を撤去する
	let stripped = 0;
	for (let r = R0; r <= R1; r++) {
		for (let c = C0; c <= C1; c++) {
			if (keepsWater(key, r, c)) {
				// 水のまま残すセルに板を架けると、その水を渡れてしまう＝不変条件が壊れる
				if (st.tiles[r][c] !== TILE.FLOOR)
					throw new Error(`水のまま残すセルに物が乗っている @ ${key} ${r},${c}: ${st.tiles[r][c]}`);
				continue;
			}
			if (!BRIDGE_KIN.has(st.tiles[r][c])) continue;
			const bg = bgAt(st, r, c);
			// 板の下地は草地でなければならない（水の上の板を消すと道が切れる）
			if (bg !== TILE.GRASS) throw new Error(`島の範囲の板の下地が草地でない @ ${key} ${r},${c}: ${bg}`);
			st.tiles[r][c] = TILE.FLOOR;
			stripped++;
		}
	}

	// (2) 四隅の下地を島の角タイルへ（外側の直交2セルが両方水の隅だけ）
	let rounded = 0;
	for (const [r, c, corner, outside] of CORNERS) {
		const cur = bgAt(st, r, c);
		if (keepsWater(key, r, c)) {
			// 不変条件が優先する隅＝水のまま（この移行の1回目で陸にしてしまった分を水へ戻す）
			if (cur !== TILE.WATER) {
				st.bgTiles[`${r},${c}`] = TILE.WATER;
				notes.push(`${key}: 隅 ${r},${c} は水のまま（羽衣ゲート＝岩礁と南岸の間に水2枚が要る）`);
			}
			continue;
		}
		if (cur === corner) continue; // 既に丸めてある
		const landOutside = outside.filter(([or, oc]) => bgAt(st, or, oc) !== TILE.WATER);
		// 隅に物（看板・宝箱・木など）が立っている場合も丸めない＝絵が欠けた地面に物が乗る形になる
		const onTop = st.tiles[r][c] !== TILE.FLOOR && !BRIDGE_KIN.has(st.tiles[r][c]) ? st.tiles[r][c] : null;
		const want = landOutside.length === 0 && !onTop ? corner : TILE.GRASS;
		if (cur !== TILE.WATER && cur !== TILE.GRASS)
			throw new Error(`四隅の下地が水でも草地でもない @ ${key} ${r},${c}: ${cur}`);
		st.bgTiles[`${r},${c}`] = want;
		if (want === corner) rounded++;
		else if (onTop) notes.push(`${key}: 隅 ${r},${c} は角丸にせず素の草地（'${onTop}' が乗っている）`);
		else notes.push(`${key}: 隅 ${r},${c} は角丸にせず素の草地（外側が陸＝${landOutside.map(([a, b]) => `${a},${b}`).join('/')}）`);
	}

	// (3) 橋の腕の幅を2に揃える（見本 11,10 は縦 cols5-6・横 rows4-5 が両方とも板）
	// 島の外側で腕が片側1セルだけ板になっている＝橋の口がギザギザに欠ける∴対の1セルに板を足す。
	// 足すのは「下地が草地（＝既に陸）で、物が乗っていない空きセル」だけ＝通行性は変わらない。
	let widened = 0;
	for (const [a, b] of ARM_PAIRS) {
		const ta = st.tiles[a[0]][a[1]];
		const tb = st.tiles[b[0]][b[1]];
		if (BRIDGE_KIN.has(ta) === BRIDGE_KIN.has(tb)) continue;
		const [mr, mc] = BRIDGE_KIN.has(ta) ? b : a;
		if (st.tiles[mr][mc] !== TILE.FLOOR) continue; // 木・柵などが乗っている＝触らない
		if (bgAt(st, mr, mc) !== TILE.GRASS) continue; // 水の上には板を足さない（橋を伸ばすことになる）
		st.tiles[mr][mc] = TILE.BRIDGE;
		widened++;
	}

	// (4) 画面ごとの風景（重複レイアウト回避）＝SCENERY のセルだけを塗る
	let scenery = 0;
	for (const spot of SCENERY[key] || []) {
		const { r, c, bg, tile } = spot;
		if (r === 0 || c === 0 || r === st.rows - 1 || c === st.cols - 1)
			throw new Error(`風景を画面の縁に置こうとしている @ ${key} ${r},${c}`);
		if (r >= R0 && r <= R1 && c >= C0 && c <= C1) throw new Error(`風景が島に重なる @ ${key} ${r},${c}`);
		if ((c === 5 || c === 6) || (r === 4 || r === 5)) throw new Error(`風景が橋の腕に重なる @ ${key} ${r},${c}`);
		const cur = bgAt(st, r, c);
		if (cur === bg && st.tiles[r][c] === (tile || TILE.FLOOR)) continue; // 既に塗ってある
		if (cur !== TILE.WATER) throw new Error(`風景の下地が水でない @ ${key} ${r},${c}: ${cur}`);
		if (st.tiles[r][c] !== TILE.FLOOR) throw new Error(`風景の位置に物が乗っている @ ${key} ${r},${c}`);
		st.bgTiles[`${r},${c}`] = bg;
		if (tile) st.tiles[r][c] = tile;
		scenery++;
	}

	strippedTotal += stripped;
	roundedTotal += rounded;
	widenedTotal += widened;
	sceneryTotal += scenery;
	console.log(
		`${key.padEnd(6)} 板の撤去:${String(stripped).padStart(2)}  角丸:${rounded}/4  腕の幅揃え:${widened}  風景:${scenery}`,
	);
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── 自己検証 ──────────────────────────────────────────────────────
const check = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const EXEMPLAR = check.layers.field.stages['11,10'];
for (const key of SCREENS) {
	const st = check.layers.field.stages[key];
	for (let r = R0; r <= R1; r++) {
		for (let c = C0; c <= C1; c++) {
			if (keepsWater(key, r, c)) {
				// 水のまま残すべき隅が本当に水であること（＝不変条件の歯）
				if (st.bgTiles[`${r},${c}`] !== TILE.WATER || st.tiles[r][c] !== TILE.FLOOR)
					throw new Error(`水のまま残すセルが水でない @ ${key} ${r},${c}`);
				continue;
			}
			// 島の中に板が残っていないこと
			if (BRIDGE_KIN.has(st.tiles[r][c])) throw new Error(`島の中に板が残っている @ ${key} ${r},${c}`);
			// 島の16セルが全部歩けること（＝橋を渡って降りられる）
			if (isHardBlocked(cellTile(st, r, c)) && st.tiles[r][c] === TILE.FLOOR)
				throw new Error(`島のセルが歩けない @ ${key} ${r},${c}`);
		}
	}
	// 橋を渡り切ったら必ず島の陸に降りられること＝島に接する板の、島側の1セルが歩けること
	// （腕の有無は画面ごとに違う＝`9,8` は南が湖・`9,10` は北が街道∴腕の位置は決め打ちしない）
	for (let r = 0; r < st.rows; r++) {
		for (let c = 0; c < st.cols; c++) {
			if (!BRIDGE_KIN.has(st.tiles[r][c])) continue;
			const inside = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]
				.filter(([ir, ic]) => ir >= R0 && ir <= R1 && ic >= C0 && ic <= C1)
				.filter(([ir, ic]) => !keepsWater(key, ir, ic));
			for (const [ir, ic] of inside) {
				if (isHardBlocked(cellTile(st, ir, ic)))
					throw new Error(`板の先の島のセルが歩けない @ ${key} ${ir},${ic}（板 ${r},${c}）`);
			}
		}
	}
	// 橋の腕が幅2で揃っていること（下地が草地の空きセルなら板が足されているはず）
	for (const [a, b] of ARM_PAIRS) {
		const ta = st.tiles[a[0]][a[1]];
		const tb = st.tiles[b[0]][b[1]];
		if (BRIDGE_KIN.has(ta) === BRIDGE_KIN.has(tb)) continue;
		const [mr, mc] = BRIDGE_KIN.has(ta) ? b : a;
		if (st.tiles[mr][mc] === TILE.FLOOR && st.bgTiles[`${mr},${mc}`] === TILE.GRASS)
			throw new Error(`腕の幅が揃っていない @ ${key} ${mr},${mc}`);
	}
	// 見本と同じ形になっていること＝島の四隅の下地が「角タイル or 草地」であること
	for (const [r, c, corner] of CORNERS) {
		if (keepsWater(key, r, c)) continue;
		const bg = st.bgTiles[`${r},${c}`];
		if (bg !== corner && bg !== TILE.GRASS) throw new Error(`四隅の下地が揃っていない @ ${key} ${r},${c}: ${bg}`);
	}
}
// 羽衣ゲートの不変条件＝`field 9,10` の岩礁（row1）と南岸の間は rows2-3 × cols1-4 が全部水
// （水が1枚になると はしごで渡れる＝`tests/darklord-prison.spec.js` ①③ と同じ検査をここでも持つ）
{
	const lake = check.layers.field.stages['9,10'];
	for (const c of [1, 2, 3, 4]) {
		for (const r of [2, 3]) {
			if (lake.bgTiles[`${r},${c}`] !== TILE.WATER || lake.tiles[r][c] !== TILE.FLOOR)
				throw new Error(`羽衣ゲートの水が割れた @ 9,10 ${r},${c}`);
		}
	}
}
// 揃えたことで画面が「量産」になっていないこと＝10画面のどれも重複レイアウト群に入らないこと
const dupGroups = duplicateLayoutGroups(check);
for (const g of dupGroups) {
	const hit = g.filter((k) => SCREENS.includes(k));
	if (hit.length) throw new Error(`揃えた画面が重複レイアウトになった @ ${g.join(' / ')}`);
}
// 見本（11,10）と、ユーザーが自分で直すと明言した2画面（8,9／10,9）は1セルも変わっていないこと
for (const [key, before] of Object.entries(UNTOUCHED)) {
	if (JSON.stringify(check.layers.field.stages[key]) !== before) throw new Error(`触ってはいけない画面が変わった @ ${key}`);
}
// 島の四隅の下地は見本と同じ並び（角タイル or 草地）であること＝見本自身でも成り立つ
for (const [r, c, corner] of CORNERS) {
	const bg = EXEMPLAR.bgTiles[`${r},${c}`];
	if (bg !== corner) throw new Error(`見本の隅が想定と違う @ 11,10 ${r},${c}: ${bg}`);
}

console.log(
	`\n✅ 湖10画面の中央を4×4の島に揃えた（板の撤去 計${strippedTotal}セル・角丸 計${roundedTotal}隅・腕の幅揃え 計${widenedTotal}セル・風景 計${sceneryTotal}セル・自己検証OK）`,
);
for (const n of notes) console.log(`  ・${n}`);

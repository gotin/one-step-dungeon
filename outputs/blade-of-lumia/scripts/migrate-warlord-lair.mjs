#!/usr/bin/env node
// scripts/migrate-warlord-lair.mjs ── 実行キュー 0h（2026-09-05）
// 「V 魔将を寄道の主に格上げする」＝新設の寄道洞窟 `warlord_lair` に 1 体だけ置き、
// 討伐報酬に伝説の鎧（armorTier 2）を置く。DT の道中に居た V ×3 は雑魚へ差し替える。
//
// なぜこの形か（2026-08-25 のユーザー確定4点・DECISIONS.md 744-781）：
//   (1) V の置き場は新設の寄道洞窟（本編の道中ではなく「主」として1体だけ）
//   (2) 報酬は伝説の鎧（ARMOR_TIERS[2]・DEF 3）＝監査で唯一 🔴 だった未配置ティア
//   (3) DT 2F/3F の V ×3 は全部抜いて雑魚（λ / μ・π）へ差し替える
//   (4) 入場ゲートは翼の羽衣＝虚空の谷（`%` SKY）を飛んで渡る地形そのもの
//
// 書き換えるもの（4点）：
//   ① 新レイヤー `warlord_lair`（2部屋）を追加（`void_shrine` と `dark_tower` の間に挿す）
//   ② field `8,1` 東台地に扉 `>`(8,9) を新設＋石碑に1行足す
//   ③ dark_tower `2,3` の V ×1 → 爆弾鬼 λ ×2／`3,3` の V ×2 → 剣獣 μ ×2 ＋ ブーメラン鬼 π
//   ④ 世界の V が「主の間の1体だけ」になったことを自己検証する
//
// ⚠️ 主の間は `isBossRoom: true`＝`game/boss.js startBossBattle()` が走る。
//    「扉が閉じた」の pulse は**無条件**で出る∴部屋には `:`（DOORWAY_BOSS）が必須。
//    `:` が無いと閉じた告知だけ出て開く告知（`hasBossDoors` の条件付き）が出ない。
// ⚠️ 宝箱は `killAll` 封印（`game/conditions.js` は `enemies.length === 0` で判定）∴
//    この部屋に雑魚を足してはいけない（雑魚だけ倒して宝箱が開く抜け道になる）。
// ⚠️ V は `dropsTriforce` を持たない＝撃破しても星の欠片は落ちない
//    （`onBossDefeated` の `boss.type === TILE.DARK_LORD || meta.dropsTriforce`）∴
//    「羽衣で入る寄道が羽衣の前提を作る」という循環は起きない。
//
// 実行：outputs/blade-of-lumia/ から `node scripts/migrate-warlord-lair.mjs`

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ARMOR_TIERS } from '../shared/items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const LAYER = 'warlord_lair';
const ENTRANCE = '0,0';          // 岩窟の入口（field からワープで降りてくる部屋）
const LAIR = '1,0';              // 魔将の間（isBossRoom）
const FIELD_STAGE = '8,1';       // 空島＝塔の扉／虚空の祠の扉と同じ東台地
const FIELD_DOOR = '8,9';        // 新設する扉（塔 (3,9)・祠 (6,9) の南）
const WARP_ID = 'warlordLair';           // 洞窟側の出入口 id
const FIELD_WARP_ID = 'fieldToWarlordLair'; // フィールド側の出入口 id

// ── 盤面（行リテラル＝目で見て設計する。読む側も1画面で全体が分かる）──────────
// 入口の洞：中央に岩塊を据えて「回り込む」形にし、東辺 rows 4-5 だけを主の間へ開ける。
// `>`(1,1) は虚空の祠の入口（void_shrine 0,0 の `#>.i`）と同型＝現物から流用した。
const ENTRANCE_ROWS = [
	'############',
	'#>.i.......#',
	'#..........#',
	'#..######..#',
	'#..######...',
	'#..######...',
	'#..######..#',
	'#..........#',
	'#..........#',
	'############',
];
// 主の間：ボス部屋の文法（dungeon_1 0,0 / dark_tower 0,0）＝遮蔽物を置かない一室に
// 石碑・宝箱・ボスだけ。扉 `:` は西辺 rows 4-5＝入口の洞の東辺とちょうど向き合う。
const LAIR_ROWS = [
	'############',
	'#....i....B#',
	'#..........#',
	'#..........#',
	':.......V..#',
	':..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

const CHEST_CELL = '1,10';
const BOSS_CELL = '4,8';

// ── DT の差し替え（V ×3 を抜いた後に置く雑魚）────────────────────────
// 脅威度は `hp*atk/(def+1)`（scripts/lib/enemy-placement.mjs THREAT_OF）＝
//   2F: λ 爆弾鬼 ×2 = 72.0 ／ 3F: μ 剣獣 ×2 ＋ π ブーメラン鬼 = 112.5
// ＝階を上がるほど重く、最終関門 dark_tower 1,2（225.0）を超えない。
// 4種とも道具を要する弱点を持たない∴弱点道具の関門（enemy-placement.spec ④）に触れない。
// 置き場は北の通路（cols 5-6）の着地セルとワープ `>`(5,4)(5,5)(8,4)(8,5) を避ける。
const DT_REPLACE = [
	{
		stage: '2,3',
		remove: ['1,5'],
		place: { [TILE.BOMB_OGRE]: ['3,2', '3,9'] },
		dirs: { '3,2': 'right', '3,9': 'left' },
		comment: '[dark_tower 2,3] 2F の大広間＝北の通路から降りて中ボスの扉 (5,4) と'
			+ '上階の階段 (8,4) へ渡る中継室。0h（2026-09-05）で魔将 V ×1 を抜き、'
			+ '爆弾鬼 λ ×2（脅威度 72.0）を東西から降下ラインに向けて置いた＝爆風で足を止めさせる。'
			+ 'V は寄道 warlord_lair の主へ格上げした（世界に1体だけ）。',
	},
	{
		stage: '3,3',
		remove: ['1,4', '1,8'],
		place: { [TILE.SWORD_BEAST]: ['3,3', '3,8'], [TILE.BOOMERANG_OGRE]: ['6,2'] },
		dirs: { '3,3': 'right', '3,8': 'left', '6,2': 'right' },
		comment: '[dark_tower 3,3] 3F の大広間＝2F と同じ形の中継室。0h（2026-09-05）で'
			+ '魔将 V ×2 を抜き、剣獣 μ ×2 ＋ ブーメラン鬼 π（脅威度 112.5）を置いた＝'
			+ '2F（72.0）より重く最終関門 dark_tower 1,2（225.0）より軽い。π は row6 を横切る'
			+ '投擲線を張る＝中ボスの扉 (5,4) から階段 (8,4) へ渡る動線に重なる。',
	},
];

// ── ここから下は「書く」処理 ──────────────────────────────────
const rowsToTiles = (rows) => rows.map((r) => [...r]);
const cellsOf = (rows, ch) => {
	const out = [];
	rows.forEach((row, r) => [...row].forEach((c, i) => { if (c === ch) out.push(`${r},${i}`); }));
	return out;
};

function die(msg) {
	console.error(`✗ ${msg}`);
	process.exit(1);
}

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// ── 前提の確認（壊れた前提の上に書かない）────────────────────────
if (map.layers[LAYER]) die(`${LAYER} が既に存在する（このスクリプトは1回だけ流す）`);
if (ARMOR_TIERS[2]?.def !== 3) die('ARMOR_TIERS[2] が伝説の鎧（DEF 3）でない');
if (!ENEMY_META[TILE.BOSS]?.isBoss) die("TILE.BOSS 'V' がボスでない");
if (ENEMY_META[TILE.BOSS].dropsTriforce) die('V が星の欠片を落とす＝羽衣ゲートが循環する');
for (const t of [TILE.BOMB_OGRE, TILE.SWORD_BEAST, TILE.BOOMERANG_OGRE]) {
	const meta = ENEMY_META[t];
	if (!meta || meta.isBoss) die(`差し替え先 '${t}' が非ボスの敵でない`);
	if (meta.weakness) die(`差し替え先 '${t}' が弱点道具を要求する（DT の関門検査に触れる）`);
}
const fieldStage = map.layers.field?.stages?.[FIELD_STAGE];
if (!fieldStage) die(`field ${FIELD_STAGE} が無い`);
const [fdr, fdc] = FIELD_DOOR.split(',').map(Number);
if (fieldStage.tiles[fdr][fdc] !== TILE.FLOOR) {
	die(`field ${FIELD_STAGE} (${FIELD_DOOR}) が素の床でない＝扉を置く場所を間違えている`);
}
if (fieldStage.mapEnters?.[FIELD_DOOR]) die(`field ${FIELD_STAGE} (${FIELD_DOOR}) に既に出入口がある`);
for (const { stage, remove } of DT_REPLACE) {
	const st = map.layers.dark_tower?.stages?.[stage];
	if (!st) die(`dark_tower ${stage} が無い`);
	for (const key of remove) {
		const [r, c] = key.split(',').map(Number);
		if (st.tiles[r][c] !== TILE.BOSS) die(`dark_tower ${stage} (${key}) に V が居ない`);
	}
}

// ── ① 新レイヤー ────────────────────────────────────────────
// ステージのキー構成は既存の寄道（void_shrine）と同じ順・同じ既定値で作る
// ＝エディタが後から開いても足りないキーを補わない（差分が読める）。
const blankStage = (rows) => ({
	cols: 12,
	rows: 10,
	tiles: rowsToTiles(rows),
	bgTiles: {},
	links: [],
	enemyDirs: {},
	chestContents: {},
	floorItems: {},
	objects: {},
	npcData: {},
	shopData: {},
	mapEnters: {},
	showConditions: {},
	breakableWalls: {},
	isBossRoom: false,
	signData: {},
	comment: '',
});

const entrance = blankStage(ENTRANCE_ROWS);
entrance.mapEnters = { '1,1': { id: WARP_ID, destId: FIELD_WARP_ID } };
entrance.signData = {
	'1,3': {
		name: '岩窟の刻み文',
		lines: [
			'【魔将の巣】',
			'岩を回れ。奥の間に 主が 一体で 待つ。',
			'扉は 内から 閉じる。逃げ場は 無い。',
			'討ち果たせば 壁は 伝説の鎧を 返す。',
		],
	},
};
entrance.comment = `[${LAYER} ${ENTRANCE}] 岩窟の入口＝空島（field ${FIELD_STAGE}）の扉 `
	+ `(${FIELD_DOOR}) から降りてくる部屋。翼の羽衣で虚空の谷（SKY）を渡らないと扉に届かない`
	+ '＝入場ゲートは地形そのもの（虚空の祠と同型）。中央の岩塊を回り込んで東辺 rows 4-5 から'
	+ '主の間へ抜ける。敵は置かない＝主との一対一を薄めない。';

const lair = blankStage(LAIR_ROWS);
lair.isBossRoom = true;
lair.chestContents = {
	[CHEST_CELL]: { type: 'armor', armorTier: 2, name: ARMOR_TIERS[2].name },
};
lair.showConditions = { [CHEST_CELL]: { trigger: 'killAll' } };
lair.enemyDirs = { [BOSS_CELL]: 'left' };   // 扉（西辺）を向いて待ち構える
lair.signData = {
	'1,5': {
		name: '魔将の碑',
		lines: [
			'【魔将の間】',
			'この鎧は 主を 討った者にしか 合わぬ。',
			'一対一。それが 魔将の 礼儀。',
		],
	},
};
lair.comment = `[${LAYER} ${LAIR}] 魔将の間＝寄道の報酬部屋（伝説の鎧 armorTier 2・DEF 3）。`
	+ '魔将 V を世界で1体だけここに置いた（0h・2026-09-05。旧 dark_tower 2,3/3,3 の道中 ×3 は撤去）。'
	+ 'isBossRoom:true ∴入室で `:`（西辺 4,0/5,0）が閉じ HP バーが出る＝一対一の一戦になる。'
	+ '宝箱 (1,10) は killAll 封印∴**この部屋に雑魚を足してはいけない**（雑魚だけ倒して開く抜け道になる）。'
	+ '遮蔽物を置かないのはボス部屋の文法（dungeon_1 0,0 / dark_tower 0,0）どおり。';

// レイヤーは `void_shrine` の直後（＝ORDER の並び）に挿す＝JSON を読む人が進行順に辿れる。
const layerData = { name: '魔将の巣', bgm: 'dungeon', bossStage: LAIR, stages: { [ENTRANCE]: entrance, [LAIR]: lair } };
const rebuilt = {};
for (const [k, v] of Object.entries(map.layers)) {
	rebuilt[k] = v;
	if (k === 'void_shrine') rebuilt[LAYER] = layerData;
}
if (!rebuilt[LAYER]) rebuilt[LAYER] = layerData;   // void_shrine が無い場合の保険
map.layers = rebuilt;

// ── ② field 8,1（扉＋石碑の1行）──────────────────────────────
fieldStage.tiles[fdr][fdc] = TILE.MAP_ENTER;
fieldStage.mapEnters = { ...(fieldStage.mapEnters ?? {}), [FIELD_DOOR]: { id: FIELD_WARP_ID, destId: WARP_ID } };
const sign = fieldStage.signData?.['7,2'];
if (!sign?.lines) die(`field ${FIELD_STAGE} (7,2) の石碑が {name,lines} 形式でない`);
const NEW_SIGN_LINE = 'さらに南の 裂け目には 魔将が 棲む。伝説の鎧は その先。';
if (!sign.lines.includes(NEW_SIGN_LINE)) sign.lines.push(NEW_SIGN_LINE);

// ── ③ dark_tower の V を差し替え ───────────────────────────────
for (const { stage, remove, place, dirs, comment } of DT_REPLACE) {
	const st = map.layers.dark_tower.stages[stage];
	for (const key of remove) {
		const [r, c] = key.split(',').map(Number);
		st.tiles[r][c] = TILE.FLOOR;
		delete st.enemyDirs?.[key];
	}
	for (const [tile, keys] of Object.entries(place)) {
		for (const key of keys) {
			const [r, c] = key.split(',').map(Number);
			if (st.tiles[r][c] !== TILE.FLOOR) die(`dark_tower ${stage} (${key}) が素の床でない`);
			st.tiles[r][c] = tile;
		}
	}
	st.enemyDirs = { ...(st.enemyDirs ?? {}), ...dirs };
	st.comment = comment;
}

// ── ④ 自己検証（書いた JSON をもう一度読んで測る）──────────────────
const out = JSON.stringify(map, null, 2);   // 実マップの整形（スペース2）を保つ
writeFileSync(MAP_PATH, out);
const back = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const L = back.layers[LAYER];
ok(L?.name === '魔将の巣', 'レイヤー名が入っていない');
ok(L?.bossStage === LAIR, 'bossStage が主の間を指していない');
for (const [sk, rows] of [[ENTRANCE, ENTRANCE_ROWS], [LAIR, LAIR_ROWS]]) {
	const st = L?.stages?.[sk];
	ok(Array.isArray(st?.tiles) && st.tiles.every((r) => Array.isArray(r) && r.length === 12),
		`${sk} の tiles が 12 列の文字配列でない`);
	ok(st?.tiles?.length === 10, `${sk} の行数が 10 でない`);
	ok(st?.tiles?.map((r) => r.join('')).join('|') === rows.join('|'), `${sk} の盤面が設計と違う`);
}
const lairBack = L?.stages?.[LAIR];
ok(lairBack?.isBossRoom === true, '主の間が isBossRoom でない');
ok(cellsOf(LAIR_ROWS, TILE.DOORWAY_BOSS).length === 2, '主の間に `:` が2枚無い（扉が開かない）');
ok(lairBack?.chestContents?.[CHEST_CELL]?.armorTier === 2, '伝説の鎧の宝箱が無い');
ok(lairBack?.showConditions?.[CHEST_CELL]?.trigger === 'killAll', '宝箱が killAll 封印でない');
ok(lairBack?.enemyDirs?.[BOSS_CELL] === 'left', '主の向きが入っていない');

// 世界の V は主の間の1体だけ（＝格上げの本体）
const vCells = [];
let mobsInLair = 0;
for (const [lk, layer] of Object.entries(back.layers)) {
	if (lk.startsWith('test_')) continue;
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		(st.tiles ?? []).forEach((row, r) => row.forEach((ch, c) => {
			if (ch === TILE.BOSS) vCells.push(`${lk}/${sk} (${r},${c})`);
			if (lk === LAYER && ENEMY_META[ch] && !ENEMY_META[ch].isBoss) mobsInLair += 1;
		}));
	}
}
ok(vCells.length === 1 && vCells[0] === `${LAYER}/${LAIR} (${BOSS_CELL})`,
	`V が1体だけ主の間に居ない: ${vCells.join(' / ')}`);
ok(mobsInLair === 0, `${LAYER} に雑魚が居る（killAll 封印が抜け道になる）`);

// 差し替えた DT の脅威度（雑魚だけを数える＝stageThreat と同じ式）
const threatOf = (st) => st.tiles.flat().reduce((t, ch) => {
	const m = ENEMY_META[ch];
	return t + (m && !m.isBoss ? (m.hp * m.atk) / ((m.def ?? 0) + 1) : 0);
}, 0);
const t2 = threatOf(back.layers.dark_tower.stages['2,3']);
const t3 = threatOf(back.layers.dark_tower.stages['3,3']);
ok(t2 === 72, `dark_tower 2,3 の脅威度が 72.0 でない: ${t2}`);
ok(t3 === 112.5, `dark_tower 3,3 の脅威度が 112.5 でない: ${t3}`);
ok(t2 < t3, '2F が 3F より重い（階の難化が逆）');
for (const { stage, dirs } of DT_REPLACE) {
	const st = back.layers.dark_tower.stages[stage];
	for (const [key, dir] of Object.entries(dirs)) {
		ok(st.enemyDirs?.[key] === dir, `dark_tower ${stage} (${key}) の向きが入っていない`);
	}
	for (const key of Object.keys(st.enemyDirs ?? {})) {
		const [r, c] = key.split(',').map(Number);
		ok(!!ENEMY_META[st.tiles[r][c]], `dark_tower ${stage} の enemyDirs ${key} が幽霊キー`);
	}
}

// field 側の扉と石碑
const fb = back.layers.field.stages[FIELD_STAGE];
ok(fb.tiles[fdr][fdc] === TILE.MAP_ENTER, `field ${FIELD_STAGE} (${FIELD_DOOR}) に扉が無い`);
ok(fb.mapEnters[FIELD_DOOR]?.destId === WARP_ID, 'フィールド側の扉が洞窟を指していない');
ok(back.layers[LAYER].stages[ENTRANCE].mapEnters['1,1']?.destId === FIELD_WARP_ID,
	'洞窟側の出入口がフィールドを指していない');
ok(fb.signData['7,2'].lines.includes(NEW_SIGN_LINE), '石碑に案内の1行が入っていない');
// 出入口 id は世界で一意（exitRegistry は id → 座標の1対1）
const seen = new Map();
for (const [lk, layer] of Object.entries(back.layers)) {
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		for (const [pk, me] of Object.entries(st.mapEnters ?? {})) {
			if (!me?.id) continue;
			ok(!seen.has(me.id), `出入口 id "${me.id}" が ${seen.get(me.id)} と ${lk}/${sk} (${pk}) で衝突`);
			seen.set(me.id, `${lk}/${sk} (${pk})`);
		}
	}
}

if (problems.length) {
	console.error('✗ 自己検証で問題を検出（マップは書き換わっている＝git で戻せる）:');
	problems.forEach((p) => console.error(`   - ${p}`));
	process.exit(1);
}

console.log('✓ warlord_lair を追加した');
console.log(`   ${LAYER}/${ENTRANCE} 岩窟の入口  … field ${FIELD_STAGE} (${FIELD_DOOR}) ⇔ (1,1)`);
console.log(`   ${LAYER}/${LAIR} 魔将の間      … V ×1（${BOSS_CELL}）＋ ${ARMOR_TIERS[2].name}（${CHEST_CELL}・killAll 封印）`);
console.log(`   dark_tower 2,3 … V ×1 → 爆弾鬼 λ ×2（脅威度 ${t2}）`);
console.log(`   dark_tower 3,3 … V ×2 → 剣獣 μ ×2 ＋ ブーメラン鬼 π（脅威度 ${t3}）`);
console.log('   世界の V ＝ 1 体（主の間のみ）');

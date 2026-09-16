// shared/progression.js ── 「進行地点ごとに何を持っているか」の単一の真実
//
// 元は `scripts/audit-balance.mjs` の内部定数・内部関数だった（ORDER / collectRewards /
// profilesAt）。実行キュー 0f（プレビュー設定の「進行地点プリセット」）で **エディタ（ブラウザ）
// からも同じ値が必要になった**∴共有へ出した。コピーを作らない＝手書きの表は必ず腐る
// （敵タイル一覧を手書きして13タイル漏らした前例と同じ理由）。
//
// 読み手：
//   ・`scripts/audit-balance.mjs`     … 進行地点ごとのプレイヤー諸元（min/max）の表
//   ・`editor/editor-io.js`           … プレビュー設定ダイアログの「🚩進行地点」プリセット
//   ・`tests/progression-preset.spec.js`
//
// ⚠️ ここが返すのは **ティア番号・ハート数・持っている道具の名前** だけ＝ATK/DEF は返さない。
//    ATK/DEF はゲーム側が `equipSwordTier()` / `equipArmorTier()` で装備から導出する∴
//    プリセットが数値を計算して渡すと二重管理になる（`shared/items.js` が単一の真実）。
//    監査スクリプトが表に出す ATK/DEF は audit-balance 側の `statsOf()` が導出する。
//
// ⚠️ 「そのレイヤーの中で使える道具」の表（旧 `scripts/lib/progression.mjs` の手書き
//    `UNLOCKED_AT`）も 2026-09-05（実行キュー 0g）にここへ統合した＝`toolsUsableIn(map)`。
//    手書きの表は消した（`scripts/lib/progression.mjs` 自体を削除）＝2通りの言い方を残さない。

import { listTriforceEntries } from './triforce.js';
import { ENEMY_META, isEnemyTile } from './enemies.js';

// ── 進行順（PLAN 9-1）＝報酬が手に入る順序の単一の真実 ────────────────
// 本編：D1→D2→D3→D4→D6→D5→D8→D7→（祭壇）→dark_tower
// 寄道は「入るのに必要な道具」で本編のどこに挟まるかが決まる（要件は下記＝`toolsUsableIn()` が
// この順序から導出する。入口の仕掛けそのものは実マップ側・関門は tests/progression-tools.spec.js ④）：
//   cave_1        … 爆弾+はしご（D5 の後）
//   forest_cave   … 爆弾（D6 の後）＝銅の剣 tier1
//   secret_grotto … 笛（D8 の後）＝銀の剣 tier2
//   void_shrine   … 翼の羽衣（祭壇の後）＝聖剣 tier3
//   warlord_lair  … 翼の羽衣（祭壇の後）＝伝説の鎧 armorTier2（0h・2026-09-05）
//   darklord_prison … 翼の羽衣（祭壇の後）＝ルミアの剣 tier4 ＋ ハートの器×1（0o／0o-2・2026-09-05）
//                     ＝X 魔王の岩牢（剣は主の間 `0,2` の killAll 封印・器は「二色の錠の間」`0,1`）
//
// ⚠️ **ダンジョンの名前はここに書かない**＝表示名は実マップの `layers[x].name` から導出する
//    （`labelOf()`）。理由＝`layer.name` は `game/ui.js` の HUD でプレイヤーに見えている側＝
//    そちらが真実。ここに手書きしていた名前は 6 件が実マップと食い違っていた（2026-08-26 に
//    監査出力で発覚＝「A 炎のサラマンドラ … D4 砂の遺跡」＝実際の `dungeon_4` は炎の神殿・
//    2026-09-05 の実行キュー 0g で導出へ寄せた）。`prefix` は進行上の位置（D番号／寄道）＝
//    マップに無い情報だけを持つ。`fallbackName` は `start`（レイヤーを持たない地点）だけの保険
//    ＝**レイヤーを持つ地点は全部マップ側に `name` がある**（関門は tests/progression-tools.spec.js ⑧
//    ＝名前の欠落と、寄道が本編と同名になる衝突の両方を赤にする。`secret_grotto` は 2026-09-05 に
//    「秘密の洞窟」を与えた＝それまで `dungeon_7` の実名「空中の遺跡」を借りていて紛らわしかった）。
export const ORDER = [
	{ id: 'start',         prefix: '',     fallbackName: '開始直後',    layer: null },
	{ id: 'dungeon_1',     prefix: 'D1',   layer: 'dungeon_1' },
	{ id: 'dungeon_2',     prefix: 'D2',   layer: 'dungeon_2' },
	{ id: 'dungeon_3',     prefix: 'D3',   layer: 'dungeon_3' },
	{ id: 'dungeon_4',     prefix: 'D4',   layer: 'dungeon_4' },
	{ id: 'dungeon_6',     prefix: 'D6',   layer: 'dungeon_6' },
	{ id: 'forest_cave',   prefix: '寄道', layer: 'forest_cave', optional: true },
	{ id: 'dungeon_5',     prefix: 'D5',   layer: 'dungeon_5' },
	{ id: 'cave_1',        prefix: '寄道', layer: 'cave_1', optional: true },
	{ id: 'dungeon_8',     prefix: 'D8',   layer: 'dungeon_8' },
	{ id: 'secret_grotto', prefix: '寄道', layer: 'secret_grotto', optional: true },
	{ id: 'dungeon_7',     prefix: 'D7',   layer: 'dungeon_7' },
	{ id: 'void_shrine',   prefix: '寄道', layer: 'void_shrine', optional: true },
	{ id: 'warlord_lair',  prefix: '寄道', layer: 'warlord_lair', optional: true },
	{ id: 'darklord_prison', prefix: '寄道', layer: 'darklord_prison', optional: true },
	{ id: 'dark_tower',    prefix: 'DT',   layer: 'dark_tower' },
];

// 進行地点の表示名＝`prefix`（進行上の位置）＋ 実マップのレイヤー名。
// マップが `name` を持たないレイヤーだけ ORDER の `fallbackName` に落ちる。
export function labelOf(map, cp) {
	const name = (cp.layer ? map?.layers?.[cp.layer]?.name : null) || cp.fallbackName || cp.layer || cp.id;
	return cp.prefix ? `${cp.prefix} ${name}` : name;
}

// 進行地点 id → 表示名（監査スクリプト・エディタのプリセットが読む）。
export function labelsFrom(map) {
	return new Map(ORDER.map((cp) => [cp.id, labelOf(map, cp)]));
}

// ── そのレイヤーの中で使える道具（旧 `scripts/lib/progression.mjs` の `UNLOCKED_AT`）──────
// 返り値＝`{ [layerName]: Set<道具名> }`。意味は **「入場時の所持」ではなく
// 「そのレイヤーの中に居るあいだに使える道具の上限」**＝入場時の所持 ∪ **そのレイヤー自身の報酬**。
//   例＝`dungeon_3` は `bow` を含む。弓は D3 の報酬だが、D3 の中で拾って D3 の奥の弓ゲートを
//        開ける∴「D3 の中で弓を要求する仕掛け」は正当。同じ形で D5 のはしご・D6 の爆弾も含む。
// ∴これは**緩い上限**＝「その部屋に来た時点で必ず持っている」ことは保証しない（部屋の順序は
//   見ない＝レイヤー単位の粒度）。ソフトロックの厳密判定には使えない。
// 寄道（ORDER の `optional`）の報酬は**次の地点へ持ち越さない**＝入らなくてもクリアできる
// （下限側に数えない＝`profilesAt` の min と同じ約束）。
// `field` は表に載らない＝地域ごとに到達時期が違う∴`?? new Set()` で空集合＝道具未所持として
// 扱う（読み手側の約束＝`scripts/lib/enemy-placement.mjs` のコメントも同じ前提）。
//
// 読み手＝`scripts/check-dungeon-integrity.mjs`（道具で封鎖される出口の検出＝引くのは
//         `ladder`/`bomb` だけ）／`scripts/migrate-place-new-enemies.mjs`・
//         `tests/enemy-placement.spec.js`（弱点持ちの敵を置ける地点の関門）ほか。
export function toolsUsableIn(map) {
	const perLayer = collectRewards(map);
	const table = {};
	const carried = new Set();          // 必須レイヤーの報酬だけを積み上げる
	for (const cp of ORDER) {
		if (!cp.layer) continue;
		const own = perLayer.get(cp.layer)?.items ?? [];
		table[cp.layer] = new Set([...carried, ...own]);   // 入場時 ∪ 自分の報酬
		if (!cp.optional) for (const k of own) carried.add(k);
	}
	return table;
}

// 宝箱／床置きから拾える「道具」＝プレビュー設定のチェックボックスと1対1で対応する。
// はしごは `player.hasLadder`（subItems ではない）だが、プレビューでは同じ扱いで足りる。
// ⚠️ 翼の羽衣（wingrobe）はここに入れない＝**宝箱に無い**。古代の祭壇で星の欠片を
//    全部捧げて授かる（`game/boss.js offerAtAltar()`）∴欠片の数から導出する（下記）。
// ⚠️ 銀のブーメラン（boomerangTier 1）は道具名ではなくティア番号で持つ＝`boomerang` の
//    所持とは別軸（`game/player.js equipBoomerangTier()` はティアを上げると所持もさせる）。
export const SUB_ITEM_KEYS = ['bow', 'boomerang', 'bomb', 'candle', 'ladder', 'flute'];

// ── ボス部屋の所在（0d-2.8・2026-08-25）──────────────────────────
// 「ボス直前の想定装備」を出すために、レイヤー内の報酬を**ボス部屋の内と外**で分ける。
// ボス部屋に置いてある物（ハートの器・星の欠片・D8 の銀の盾）は**ボスを倒した後**に
// 手に入る∴ボス戦の想定装備には数えない。
// 返り値は `${layer}|${stage}` の Set（レイヤー名にもステージキーにも `|` は使われない）。
export function bossRoomKeysOf(map) {
	const keys = new Set();
	for (const [layerName, layer] of Object.entries(map?.layers ?? {})) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			if (st?.isBossRoom) keys.add(`${layerName}|${sk}`);
		}
	}
	return keys;
}

// ボス部屋を1つでも持つレイヤー名の Set＝「ボス直前」の選択肢を出せる進行地点の判定に使う
// （ボス部屋を持たないレイヤーでは死んだ選択肢を作らない）。
// ⚠️ 「寄道はボス部屋を持たない」は 2026-09-05（0h）に**崩れた**＝`warlord_lair` の主の間は
//    `isBossRoom: true`（魔将 V の一戦）∴寄道でも「ボス直前」が出る。判定は実マップだけを見る。
export function bossRoomLayersOf(map) {
	const layers = new Set();
	for (const key of bossRoomKeysOf(map)) layers.add(key.slice(0, key.indexOf('|')));
	return layers;
}

// ── レイヤー→ボスのタイル文字（17-0・「Dn 踏破で台詞が変わる」の選択規則）─────────
// 手書きの層→ボス対応表は作らない（[[blade-enemy-tables-derive-from-meta]]）＝
// `bossRoomKeysOf` と同じやり方でボス部屋の中を実際に走査し、`ENEMY_META[c].isBoss`
// を満たすタイル文字を拾う（中ボス `W` はボス部屋フラグの立った stage には出現しない∴
// 自然に除外される＝実マップ全走査で確認済み）。
export function bossTileOfLayer(map, layerName) {
	const layer = map?.layers?.[layerName];
	if (!layer) return null;
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		if (!st?.isBossRoom) continue;
		for (const row of st.tiles ?? []) {
			for (const c of row) {
				if (isEnemyTile(c) && ENEMY_META[c].isBoss) return c;
			}
		}
	}
	return null;
}

// 進行順に並んだボスの一覧（実マップのボス部屋から導出＝手書きの表は作らない）。
// ボス部屋を持たないレイヤー（`start` と一部の寄道）は落ちる∴`ORDER` より短い。
// 読み手＝`shared/dialog-variants.js`（版の選択肢）／下の2関数／`editor/editor-io.js`。
export function bossesInOrder(map) {
	const out = [];
	for (const cp of ORDER) {
		if (!cp.layer) continue;
		const tile = bossTileOfLayer(map, cp.layer);
		if (!tile) continue;
		out.push({ id: cp.id, layer: cp.layer, tile, optional: !!cp.optional, cp });
	}
	return out;
}

// 「そのボスまで進めた」状態の撃破済み集合＝進行順でそれより前の**必須**レイヤーの
// ボス ＋ 自分自身。寄道を数えないのは `profilesAt` の min と同じ約束＝入らなくてもクリアできる
// ∴「最短で本編をここまで進めた人」の集合になる（寄道の版を試したいときは呼び手が足す）。
// 一覧に無いタイル（不明なボス）は自分自身だけを返す＝黙って落とさない。
export function bossesDefeatedUpTo(map, tile) {
	if (!tile) return [];
	const list = bossesInOrder(map);
	const idx  = list.findIndex((b) => b.tile === tile);
	if (idx < 0) return [tile];
	const out = list.slice(0, idx).filter((b) => !b.optional).map((b) => b.tile);
	out.push(tile);
	return out;
}

// 進行地点（`ORDER` の id）へ**到達した時点**で倒しているボス＝その地点より前の必須レイヤーの
// ボス（その地点自身のボスは**まだ倒していない**＝「ボス直前」も同じ集合）。
export function bossesDefeatedAt(map, cpId) {
	const i = ORDER.findIndex((cp) => cp.id === cpId);
	if (i < 0) return [];
	const ids = new Set(ORDER.slice(0, i).map((cp) => cp.id));
	return bossesInOrder(map).filter((b) => !b.optional && ids.has(b.id)).map((b) => b.tile);
}

// ⚠️ かつてここに `latestDefeatedBossType(map, defeatedBosses)`（「進行順で最も後に倒した
//    ボス」を1体に絞る関数）があった。2026-09-15 に**削除**＝会話の版の選択規則が
//    「条件がヒットした版のうち `variantOptions()` の並びで一番下を採る」に変わり、
//    版を1つに絞る段が要らなくなった（絞った先に版が無いと基本の台詞へ落ちる＝
//    寄道のボスを倒した瞬間に終盤の台詞が序盤へ戻る実害の元だった）。
//    規則の在処は `shared/dialog-variants.js` ＋ `game/ui.js pickDialogVariant()`。

// ── 実マップから報酬を集める（レイヤー単位）────────────────────────
// 「どのレイヤーに置いてあるか」だけを見る＝部屋の位置や関門は見ない。
// 関門（killAll/パズル）は「取れるかどうか」を左右するが「順序」は変えない。
// `excludeBossRooms: true` のときだけ部屋の位置を1点だけ見る＝ボス部屋の中身を落とす。
export function collectRewards(map, { excludeBossRooms = false } = {}) {
	const skip = excludeBossRooms ? bossRoomKeysOf(map) : null;
	const perLayer = new Map();   // layer → { sword:[], armor:[], shield:[], boomerang:[], items:[], hearts:n, triforce:n }
	const bump = (layer) => {
		if (!perLayer.has(layer)) {
			perLayer.set(layer, { sword: [], armor: [], shield: [], boomerang: [], items: [], hearts: 0, triforce: 0 });
		}
		return perLayer.get(layer);
	};
	for (const [layerName, layer] of Object.entries(map.layers ?? {})) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			if (skip?.has(`${layerName}|${sk}`)) continue;
			for (const src of ['chestContents', 'floorItems']) {
				for (const v of Object.values(st[src] ?? {})) {
					if (!v || typeof v !== 'object') continue;
					const bucket = bump(layerName);
					if (v.swordTier     != null) bucket.sword.push(v.swordTier);
					if (v.armorTier     != null) bucket.armor.push(v.armorTier);
					if (v.shieldTier    != null) bucket.shield.push(v.shieldTier);
					if (v.boomerangTier != null) {
						bucket.boomerang.push(v.boomerangTier);
						if (!bucket.items.includes('boomerang')) bucket.items.push('boomerang');
					}
					if (SUB_ITEM_KEYS.includes(v.item) && !bucket.items.includes(v.item)) bucket.items.push(v.item);
					if (v.type === 'heartContainer' || v.item === 'heartContainer') bucket.hearts += 1;
				}
			}
		}
	}
	// 星の欠片は宝箱ではなくタイル（`Q`）とボスのドロップ＝数え方は `shared/triforce.js` に
	// 集約済み∴そのまま使う（テストレイヤーはあちらで除外されている）。
	for (const e of listTriforceEntries(map)) {
		if (skip?.has(`${e.layer}|${e.stage}`)) continue;
		bump(e.layer).triforce += 1;
	}
	return perLayer;
}

// フィールドの報酬＝「寄道もフィールドも全部拾った」上限側にだけ数える（下限には数えない）。
export function fieldRewardsOf(perLayer) {
	const fr = perLayer.get('field')
		?? { sword: [], armor: [], shield: [], boomerang: [], items: [], hearts: 0, triforce: 0 };
	return {
		swordMax:     Math.max(-1, ...fr.sword),
		armorMax:     Math.max(-1, ...fr.armor),
		shieldMax:    Math.max(-1, ...fr.shield),
		boomerangMax: Math.max(-1, ...fr.boomerang),
		items:        [...fr.items],
		hearts:       fr.hearts,
	};
}

// 進行地点ごとのプレイヤー諸元＝実プレイが必ず入る帯（min ≦ 実プレイ ≦ max）。
//   min … その地点までの**必須レイヤー**の報酬だけ＋木の剣。
//         寄道（forest_cave / cave_1 / secret_grotto / void_shrine / warlord_lair
//         ＝ ORDER の optional）は
//         **入らなくてもクリアできる**∴下限には数えない。ここを数えると
//         「DT に来た人は必ず聖剣（ATK 14）を持っている」という嘘の下限になる
//         （実際は木の剣 ATK 4 で塔に入れる＝3.5 倍の差）。
//   max … 寄道もフィールドの宝も全部拾った（＝一番強い想定）。
//   boss… min ＋**そのレイヤーの中でボス部屋の外にある報酬**（0d-2.8）。
//         min は「そのダンジョンへ**入った瞬間**」＝ダンジョン内の拾い物を1つも含まない∴
//         min でボスに挑むのは「D1 の革の鎧も木の盾もハートの器も捨ててボス部屋へ直行する」
//         という実プレイでは起こらない下限だった（2026-08-25、D1 の G が min で勝てないと
//         いう実プレイ報告の真因）。ボス戦の判定はこちらで見る。
//         ボス部屋の中身（撃破報酬のハートの器・欠片・D8 の銀の盾）は数えない＝倒す前には無い。
//         ボス部屋を持たないレイヤー（寄道のうち forest_cave / cave_1 / secret_grotto /
//         void_shrine）と `start` では **null** を返す＝選択肢を作らない。
//         ⚠️ 寄道 `warlord_lair`（魔将の巣）は主の間が `isBossRoom` ∴ boss を作る（0h・2026-09-05）。
// ∴調整の当たり判定は min（道中）と boss（ボス戦）で見る。
// max で速いのは「寄道の剣＝報酬」＝設計どおり∴参考値として併記するだけ。
// 第4引数 `preBossHere`＝**この地点のレイヤーの**「ボス部屋の外」の報酬バケツ（`null` で boss なし）。
// どのレイヤーがボス部屋を持つかの判断は呼び手（`presetsFrom`）に置く＝ここは足し算だけ。
export function profilesAt(index, perLayer, fieldRewards, preBossHere = null) {
	const blank = () => ({ sword: -1, armor: -1, shield: -1, boomerang: -1, hearts: 3, triforce: 0, items: [] });
	const addTo = (acc, r) => {
		for (const t of r.sword)     acc.sword     = Math.max(acc.sword, t);
		for (const t of r.armor)     acc.armor     = Math.max(acc.armor, t);
		for (const t of r.shield)    acc.shield    = Math.max(acc.shield, t);
		for (const t of r.boomerang) acc.boomerang = Math.max(acc.boomerang, t);
		for (const k of r.items) if (!acc.items.includes(k)) acc.items.push(k);
		acc.hearts   += r.hearts;
		acc.triforce += r.triforce;
	};
	const need = blank();   // 必須レイヤーだけ
	const all  = blank();   // 寄道も含む
	for (let i = 0; i < index; i++) {
		const layer = ORDER[i].layer;
		if (!layer) continue;
		const r = perLayer.get(layer);
		if (!r) continue;
		for (const acc of ORDER[i].optional ? [all] : [need, all]) addTo(acc, r);
	}
	// 木の剣（swordTier 0）は必携＝min にも入れる（無いと剣が振れない）。
	const min = { ...need, sword: Math.max(need.sword, 0), items: sortItems(need.items) };
	const max = {
		sword:     Math.max(all.sword,     fieldRewards.swordMax),
		armor:     Math.max(all.armor,     fieldRewards.armorMax),
		shield:    Math.max(all.shield,    fieldRewards.shieldMax),
		boomerang: Math.max(all.boomerang, fieldRewards.boomerangMax),
		hearts:    all.hearts + fieldRewards.hearts,
		triforce:  all.triforce,
		items:     sortItems([...new Set([...all.items, ...fieldRewards.items])]),
	};
	// ボス直前＝min にそのレイヤーの「ボス部屋の外」の報酬を足す（無ければ null）。
	let boss = null;
	if (preBossHere) {
		const acc = { ...need, items: [...need.items] };
		addTo(acc, preBossHere);
		boss = { ...acc, sword: Math.max(acc.sword, 0), items: sortItems(acc.items) };
	}
	// 翼の羽衣＝古代の祭壇で星の欠片を全部捧げて授かる∴「その地点までに全欠片が揃うか」で導出する
	// （宝箱から拾える道具ではない＝SUB_ITEM_KEYS に入れられない例外）。
	const total = totalTriforceOf(perLayer);
	for (const p of [min, max, boss]) { if (p) p.wingrobe = total > 0 && p.triforce >= total; }
	return { min, max, boss };
}

function sortItems(items) {
	return SUB_ITEM_KEYS.filter((k) => items.includes(k));
}

export function totalTriforceOf(perLayer) {
	let total = 0;
	for (const r of perLayer.values()) total += r.triforce;
	return total;
}

// ── 使い勝手のための1関数（エディタのプリセットはこれだけ呼べばよい）──────────
// 返り値＝`[{ id, label, min, max, boss }, …]`（ORDER と同じ順・同じ長さ）。
// `boss` は「ボス部屋を持つレイヤーの地点」だけ非 null＝`start` とボス部屋の無い寄道では null
// （寄道でも `warlord_lair` は主の間を持つ∴非 null）。
export function presetsFrom(map) {
	const perLayer     = collectRewards(map);
	const preBoss      = collectRewards(map, { excludeBossRooms: true });
	const bossLayers   = bossRoomLayersOf(map);
	const fieldRewards = fieldRewardsOf(perLayer);
	const empty = { sword: [], armor: [], shield: [], boomerang: [], items: [], hearts: 0, triforce: 0 };
	return ORDER.map((cp, i) => {
		// ボス部屋が無いレイヤーは「ボス直前」を作らない（報酬が有っても選択肢にしない）。
		const preBossHere = cp.layer && bossLayers.has(cp.layer) ? (preBoss.get(cp.layer) ?? empty) : null;
		const { min, max, boss } = profilesAt(i, perLayer, fieldRewards, preBossHere);
		// ラベルは実マップのレイヤー名から導出する（ORDER は手書きの名前を持たない）。
		return { id: cp.id, label: labelOf(map, cp), min, max, boss };
	});
}

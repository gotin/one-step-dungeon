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
// ⚠️ `scripts/lib/progression.mjs`（`UNLOCKED_AT`）とは別物。あちらは「そのレイヤーへ入る
//    時点で持っている道具」の**手書き**テーブル（敵配置の弱点関門の判定用）。こちらは実マップの
//    宝箱・床置き・欠片タイルから**導出**する。将来あちらをこちらから導出するのが筋だが、
//    現状 `UNLOCKED_AT` はやや緩い（例：`dungeon_3` に `bow` が入っているが弓は D3 の報酬
//    ＝入場時には持っていない）∴突き合わせは別タスクにした（PLAN 実行キュー 0g）。

import { listTriforceEntries } from './triforce.js';

// ── 進行順（PLAN 9-1）＝報酬が手に入る順序の単一の真実 ────────────────
// 本編：D1→D2→D3→D4→D6→D5→D8→D7→（祭壇）→dark_tower
// 寄道は「入るのに必要な道具」で本編のどこに挟まるかが決まる（scripts/lib/progression.mjs）：
//   cave_1        … 爆弾+はしご（D5 の後）
//   forest_cave   … 爆弾（D6 の後）＝銅の剣 tier1
//   secret_grotto … 笛（D8 の後）＝銀の剣 tier2
//   void_shrine   … 翼の羽衣（祭壇の後）＝聖剣 tier3
export const ORDER = [
	{ id: 'start',         label: '開始直後',            layer: null },
	{ id: 'dungeon_1',     label: 'D1 森の遺跡',         layer: 'dungeon_1' },
	{ id: 'dungeon_2',     label: 'D2 岩窟',             layer: 'dungeon_2' },
	{ id: 'dungeon_3',     label: 'D3 湖の神殿',         layer: 'dungeon_3' },
	{ id: 'dungeon_4',     label: 'D4 砂の遺跡',         layer: 'dungeon_4' },
	{ id: 'dungeon_6',     label: 'D6 火山',             layer: 'dungeon_6' },
	{ id: 'forest_cave',   label: '寄道 樹海の岩室',     layer: 'forest_cave', optional: true },
	{ id: 'dungeon_5',     label: 'D5 氷の遺跡',         layer: 'dungeon_5' },
	{ id: 'cave_1',        label: '寄道 洞窟',           layer: 'cave_1', optional: true },
	{ id: 'dungeon_8',     label: 'D8 沼地',             layer: 'dungeon_8' },
	{ id: 'secret_grotto', label: '寄道 空中の遺跡',     layer: 'secret_grotto', optional: true },
	{ id: 'dungeon_7',     label: 'D7 空の神殿',         layer: 'dungeon_7' },
	{ id: 'void_shrine',   label: '寄道 虚空の祠',       layer: 'void_shrine', optional: true },
	{ id: 'dark_tower',    label: 'DT 暗黒の塔',         layer: 'dark_tower' },
];

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
// （寄道 4つは isBossRoom の部屋を持たない∴死んだ選択肢を作らない）。
export function bossRoomLayersOf(map) {
	const layers = new Set();
	for (const key of bossRoomKeysOf(map)) layers.add(key.slice(0, key.indexOf('|')));
	return layers;
}

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
//         寄道（forest_cave / secret_grotto / void_shrine / cave_1 ＝ ORDER の optional）は
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
//         ボス部屋を持たないレイヤー（寄道4つ）と `start` では **null** を返す＝選択肢を作らない。
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
// `boss` は「ボス部屋を持つレイヤーの地点」だけ非 null＝寄道4つと `start` では null。
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
		return { id: cp.id, label: cp.label, min, max, boss };
	});
}

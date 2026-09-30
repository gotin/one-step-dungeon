// ── ui-icons.js ── UI（HUD・ボタン・メッセージ・ポーズ・ショップ・エディタ）で
//    絵文字の代わりに出す「絵」の単一の真実（キュー10番 10e）。
//
// なぜ要るか＝絵文字は環境ごとに字形も色も変わり、ドット絵の盤面と並ぶと浮く
// （🧭 が青い円盤、🪽 が黒い羽、💰 が袋…）。盤面の物はすでに全部 32 ドットの自前絵に
// なっている（10d）∴UI 側も同じ絵を使えば「同じ物は同じ絵」が全画面で成立する。
//
// 🔴 ここは**名前の表**だけを持つ。絵とパレットは shared/sprites*.js が単一の真実で、
//    アイテムの絵は shared/items.js（ITEM_META.sprite / EQUIP_META.sprite）が持つ。
//    ∴同じ物の絵を2箇所に書かない（[[blade-tile-sprite-single-source]] と同じ理由）。
//
// 使い方：
//   iconCanvas('compass', 22)          → 22px 相当の <canvas>（ink で正規化）
//   iconCanvas({ spr:'heart', pal:'heart' }, 29, { fit:'box' }) → 従来の固定箱
//   iconText(el, 'ハートの器 {{heart}} を手に入れた！', 18)  → 文中に絵を混ぜる
//
// ⚠️ 見かけの大きさは **ink（不透明ドットの外接矩形）** で決まる。32 ドットの絵は
//    透明の余白を持つ∴32×32 の canvas を px 角の箱に入れると絵は px より小さく見える
//    （10d-3 で HEART_ICON_PX=29 という補正値を手で置いたのと同じ問題）。この表を通す
//    描画は既定で ink を切り出す＝**長辺が px** になる∴絵ごとの補正値は要らない。

import { SPRITES, PAL } from './sprites.js';
import { ITEM_META, EQUIP_META, SWORD_TIERS, ARMOR_TIERS, SHIELD_TIERS, BOOMERANG_TIERS } from './items.js';

// ── 表：UI のキー → スプライト名／パレット名 ────────────────────
// キーはメッセージ中の `{{key}}` とも共通（∴短く・物の名前で書く）。
export const UI_ICON = {
	// 体力・通貨・収集物
	heart:      { spr: 'heart',      pal: 'heart'      },
	heartHalf:  { spr: 'heartHalf',  pal: 'heartHalf'  },
	heartEmpty: { spr: 'heartEmpty', pal: 'heartEmpty' },
	heartPiece: { spr: 'heartPiece', pal: 'heart'      },   // ハートのかけら（キュー13）
	heartQ1:    { spr: 'heartQ1',    pal: 'heartHalf'  },   // かけらの集まり具合 1/4〜3/4
	heartQ2:    { spr: 'heartQ2',    pal: 'heartHalf'  },
	heartQ3:    { spr: 'heartQ3',    pal: 'heartHalf'  },
	rupee:      { spr: 'rupee',      pal: 'rupee'      },
	rupeeBlue:  { spr: 'rupee',      pal: 'rupeeBlue'  },   // 5ルピー（形は同じ・色だけ違う）
	triforce:   { spr: 'triforce',   pal: 'triforce'   },
	key:        { spr: 'key',        pal: 'key'        },
	// 装備
	sword:      { spr: 'sword',      pal: 'swordWood'   },
	shield:     { spr: 'shield',     pal: 'shieldWood'  },
	armor:      { spr: 'armor',      pal: 'armorCloth'  },
	// サブアイテム
	boomerang:  { spr: 'boomerang',  pal: 'boomerang'  },
	boomerangSilver: { spr: 'boomerang', pal: 'boomerangSilver' },  // 銀（形は同じ・色だけ違う）
	boomerangStar:   { spr: 'boomerang', pal: 'boomerangStar'   },  // 星（同上・キュー20b ⑤-b）
	bomb:       { spr: 'bombItem',   pal: 'bombItem'   },
	bow:        { spr: 'bow',        pal: 'bow'        },
	arrow:      { spr: 'arrow',      pal: 'arrow'      },
	potion:     { spr: 'potion',     pal: 'potion'     },
	potionBig:  { spr: 'bigHealPotion', pal: 'potionBig' },
	map:        { spr: 'dmap',       pal: 'dmap'       },
	compass:    { spr: 'compass',    pal: 'compass'    },
	flute:      { spr: 'flute',      pal: 'flute'      },
	candle:     { spr: 'candle',     pal: 'candle'     },
	ladder:     { spr: 'ladderV',    pal: 'ladder'     },
	wingRobe:   { spr: 'wingRobe',   pal: 'wingRobe'   },
	swiftBoots: { spr: 'swiftBoots', pal: 'swiftBoots' },   // 疾風の靴（キュー13）
	fairy:      { spr: 'fairyBottle', pal: 'fairyBottle' }, // 妖精の瓶（キュー13 ③）
	quiver:     { spr: 'quiver',     pal: 'quiver'     },   // 矢筒（キュー37）
	bombBag:    { spr: 'bombBag',    pal: 'bombBag'    },   // 爆弾袋（キュー37）
	// その他
	princess:   { spr: 'princess',   pal: 'princess'   },   // エディタの「姫状態」
	altar:      { spr: 'altar',      pal: 'altar'      },
	dice:       { spr: 'dice',       pal: 'dice'       },   // ショップのガチャ
	// メッセージで「盤面の物」を指すときはタイルの絵をそのまま使う
	// （🌿→茂み・🔥→かがり火・☐→宝箱・🔓→開いた扉。「同じ物は同じ絵」）。
	bush:       { spr: 'bush',       pal: 'bush'       },
	torch:      { spr: 'torch',      pal: 'torch'      },
	chest:      { spr: 'chest',      pal: 'chest'      },
	doorOpen:   { spr: 'doorOpen',   pal: 'door'       },
};

// ── 装備のティアの絵（キュー37）──────────────────────────────────
// ティアで色（と形）が変わる物＝剣・防具・盾・ブーメラン。絵は SWORD_TIERS 等の
// `sprite` / `pal` が単一の真実∴ここでは**表から引くだけ**（HUD・ポーズの装備欄
// `game/ui.js` も同じ関数を使う）。
// ⚠️ ティア表の `sprite` に絵の無い名前が書かれていたら（盾の shieldWood 等＝盾は形が共通で
//    色だけ違う）元の絵（EQUIP_META / ITEM_META）に落ちる＝表の嘘で無言の空欄にしない。
const TIER_TABLES = { sword: SWORD_TIERS, armor: ARMOR_TIERS, shield: SHIELD_TIERS, boomerang: BOOMERANG_TIERS };

/**
 * 装備の種類とティア番号から絵を引く。ティアが無い（-1・未定義）なら既定の絵。
 * @param {'sword'|'armor'|'shield'|'boomerang'} kind
 * @param {number} tierIdx
 * @returns {{spr:string, pal:string}|null}
 */
export function tierIconSpec(kind, tierIdx) {
	const base = EQUIP_META[kind] ?? ITEM_META[kind];
	if (!base?.sprite) return null;
	const tier = TIER_TABLES[kind]?.[tierIdx];
	if (!tier) return { spr: base.sprite, pal: base.pal ?? base.sprite };
	return {
		spr: tier.sprite && SPRITES[tier.sprite] ? tier.sprite : base.sprite,
		pal: tier.pal ?? base.pal ?? base.sprite,
	};
}

// 同じ絵（spr と pal が一致）を持つ既存のキー。
function keyOfSpec(spec) {
	if (!spec) return null;
	for (const [key, it] of Object.entries(UI_ICON)) {
		if (it.spr === spec.spr && it.pal === spec.pal) return key;
	}
	return null;
}

// 表に無い絵のキーを導出して足す（名前の表を手で増やさずに済ませる）：
//   ・ティア＝ `sword` + `Bronze` → `swordBronze`（キーは英字だけ＝`{{key}}` の正規表現に乗る）
//   ・道具＝ ITEM_META の id そのもの
// ⚠️ 手で書いた表が先＝同じ絵が表に在ればそのキーを使う（木の剣→`sword`・銀のブーメラン→`boomerangSilver`）。
const TIER_KEY = {};
for (const [kind, tiers] of Object.entries(TIER_TABLES)) {
	TIER_KEY[kind] = tiers.map((tier, i) => {
		const spec = tierIconSpec(kind, i);
		const have = keyOfSpec(spec);
		if (have) return have;
		const key = kind + tier.key[0].toUpperCase() + tier.key.slice(1);
		UI_ICON[key] = spec;
		return key;
	});
}
const ITEM_KEY = {};
for (const [id, meta] of Object.entries(ITEM_META)) {
	if (!meta.sprite) continue;
	const spec = { spr: meta.sprite, pal: meta.pal ?? meta.sprite };
	ITEM_KEY[id] = keyOfSpec(spec) ?? (UI_ICON[id] = spec, id);
}

// grantReward の content.type（装備系）→ ティア表の種類と tier の欄。
const REWARD_TIER = {
	weapon:    { kind: 'sword',     field: 'swordTier'     },
	armor:     { kind: 'armor',     field: 'armorTier'     },
	shield:    { kind: 'shield',    field: 'shieldTier'    },
	boomerang: { kind: 'boomerang', field: 'boomerangTier' },
};

/**
 * 報酬（宝箱の中身＝`game/player.js grantReward` の content）の絵のキー。
 * 宝箱の文の頭に出す＝**取った物の絵**（キュー37・ユーザー指摘「ゲットしたのは宝箱じゃない」）。
 * ⚠️ tier の既定は grantReward と同じ 0（`content.swordTier ?? 0`）。
 * 絵が引けない中身は 'chest'（宝箱の絵）に落ちる＝文の頭が空欄にも `{{…}}` の生文字にもならない。
 * @param {object} content
 * @returns {string} UI_ICON のキー
 */
export function rewardIconKey(content) {
	const t = content?.type;
	if (t === 'item') return ITEM_KEY[content.item] ?? 'chest';
	const tier = REWARD_TIER[t];
	if (tier) return TIER_KEY[tier.kind][content[tier.field] ?? 0] ?? 'chest';
	if (t === 'rupee') return 'rupee';
	if (t === 'heartContainer') return ITEM_KEY.heartContainer ?? 'chest';
	if (t === 'ladder') return ITEM_KEY.ladder ?? 'chest';
	return 'chest';
}

// 絵文字 → このキー（既存の文字列を機械的に置き換える時の対応表）。
// ⚠️ 「同じ絵文字が別の意味で使われている」ものは入れない（例：🏹 は弓と矢筒の両方）＝
//    機械置換できない∴呼び出し側で `{{bow}}` / `{{arrow}}` を選んで書く。
// この表は tests/ui-icons.spec.js が「UI の文字列にこの絵文字が残っていないこと」を
// 数えるのにも使う＝**絵がある物の絵文字が復活したら赤になる**（10e の不変条件）。
export const EMOJI_TO_ICON = {
	'❤': 'heart', '💰': 'rupee', '◭': 'triforce', '🗝': 'key',
	'⚔': 'sword', '🛡': 'shield', '⚚': 'armor',
	'🪃': 'boomerang', '💣': 'bomb', '🧪': 'potion', '💊': 'potionBig',
	'🗺': 'map', '🧭': 'compass', '🎵': 'flute', '🕯': 'candle', '🪜': 'ladder',
	'🪽': 'wingRobe', '👢': 'swiftBoots', '🧚': 'fairy', '⛩': 'altar', '🎲': 'dice',
	'🌿': 'bush', '🔥': 'torch', '☐': 'chest', '🔓': 'doorOpen',
	'◆': 'rupee', '◇': 'rupeeBlue',
};

// ── ink（不透明ドットの外接矩形）── スプライト名ごとに一度だけ数えて覚える ──
const inkCache = new Map();
export function iconInk(sprName) {
	if (inkCache.has(sprName)) return inkCache.get(sprName);
	const grid = SPRITES[sprName]?.[0];
	let ink = null;
	if (grid) {
		let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < grid[r].length; c++) {
				if (!grid[r][c]) continue;
				if (r < r0) r0 = r; if (r > r1) r1 = r;
				if (c < c0) c0 = c; if (c > c1) c1 = c;
			}
		}
		if (r1 >= 0) ink = { r0, c0, w: c1 - c0 + 1, h: r1 - r0 + 1 };
	}
	inkCache.set(sprName, ink);
	return ink;
}

function resolve(spec) {
	if (typeof spec === 'string') return UI_ICON[spec] ?? null;
	if (spec && spec.spr) return spec;
	return null;
}

// px を CSS の長さにする。ratio は ink の縦横比の補正（fit='ink' のとき）。
// ⚠️ px は**数値（px）でも CSS の長さの文字列でもよい**（例 'var(--hud-icon)'・'3vw'）。
//    文字列を受けるのは HUD の文字が vw 指定だから＝canvas を固定 px にすると
//    ビューポートが広いほど文字だけ大きくなり絵が相対的に縮む（10e-2 でユーザー指摘
//    「SUB: の文字より大きくていい」の原因）。文字列なら calc() で比率を掛ける∴
//    絵も文字と同じ vw で伸縮する（[[blade-fixed-box-sprite-scale]] と同型の罠）。
function cssLen(px, ratio) {
	if (typeof px === 'number') return `${(px * ratio).toFixed(2)}px`;
	return ratio === 1 ? String(px) : `calc(${px} * ${ratio.toFixed(4)})`;
}

/**
 * UI アイコンの <canvas> を作る。絵が無ければ null（呼び出し側は絵文字などに落とす）。
 * @param spec  UI_ICON のキー、または { spr, pal }
 * @param px    見かけの大きさ。数値（px）または CSS の長さの文字列（fit='ink' なら ink の長辺がこれになる）
 * @param opts  { fit:'ink'|'box', title, cls }
 */
export function iconCanvas(spec, px, opts = {}) {
	const { fit = 'ink', title = '', cls = '' } = opts;
	const it = resolve(spec);
	if (!it) return null;
	const grid = SPRITES[it.spr]?.[0];
	const palette = PAL[it.pal] || PAL[it.spr];
	if (!grid || !palette) return null;
	const ink = fit === 'ink' ? iconInk(it.spr) : null;
	const r0 = ink ? ink.r0 : 0, c0 = ink ? ink.c0 : 0;
	const w  = ink ? ink.w : grid[0].length, h = ink ? ink.h : grid.length;
	const cv = document.createElement('canvas');
	cv.width = w; cv.height = h;
	const long = Math.max(w, h);
	const cssW = cssLen(px, fit === 'ink' ? w / long : 1);
	const cssH = cssLen(px, fit === 'ink' ? h / long : 1);
	cv.style.cssText = `width:${cssW};height:${cssH};`
		+ 'image-rendering:pixelated;display:inline-block;flex-shrink:0;vertical-align:middle;';
	if (cls) cv.className = cls;
	if (title) cv.title = title;
	const ctx = cv.getContext('2d');
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < w; c++) {
			const idx = grid[r0 + r]?.[c0 + c] ?? 0;
			if (!idx) continue;
			ctx.fillStyle = palette[idx] ?? 'transparent';
			ctx.fillRect(c, r, 1, 1);
		}
	}
	return cv;
}

/**
 * 静的な HTML（game/index.html・editor/index.html）の絵文字を絵に差し替える。
 * 対象＝`data-icon="key"` を持つ要素。大きさは `data-icon-px`（無ければ px）。
 * `data-icon-px` は数値でも CSS の長さでもよい（例 `data-icon-px="var(--hud-icon)"`）。
 * ⚠️ HTML 側には**絵文字を残しておく**＝絵が引けなかった時にそのまま表示される
 *    （表の書き間違い・スプライト削除で無言の空欄にならない）。
 * 冪等＝すでに差し替えた要素（data-icon-done）は触らない。
 */
/**
 * 要素の `data-icon-px` を iconCanvas に渡せる形で読む。
 * 数値なら数値、CSS の長さ（`var(--hud-icon)` 等）ならそのまま文字列で返す。
 * ⚠️ `Number(...) || px` と書くと CSS の長さが NaN → 既定値に落ちて**黙って効かない**。
 */
export function iconPxOf(el, px = 20) {
	const raw = el?.dataset?.iconPx;
	if (!raw) return px;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : raw;
}

export function mountIconEls(root = document, px = 20) {
	for (const el of root.querySelectorAll('[data-icon]')) {
		if (el.dataset.iconDone) continue;
		const cv = iconCanvas(el.dataset.icon, iconPxOf(el, px));
		if (!cv) continue;
		el.textContent = '';
		el.appendChild(cv);
		el.dataset.iconDone = '1';
	}
}

/**
 * `{{key}}` を絵に差し替えながら要素の中身を作り直す。
 * ⚠️ テキストは**テキストノードとして残す**∴`el.textContent` は日本語の本文のままで、
 *    「メッセージバーに◯◯と出る」テストは絵を混ぜても緑のまま（canvas は文字を持たない）。
 * 絵が無いキーは `{{key}}` を消さずそのまま残す＝表の書き間違いが黙って消えない。
 */
export function iconText(el, text, px = 18) {
	el.textContent = '';
	const parts = String(text).split(/(\{\{[a-zA-Z]+\}\})/);
	for (const part of parts) {
		const m = /^\{\{([a-zA-Z]+)\}\}$/.exec(part);
		if (m) {
			const cv = iconCanvas(m[1], px);
			if (cv) { el.appendChild(cv); continue; }
		}
		if (part) el.appendChild(document.createTextNode(part));
	}
	return el;
}

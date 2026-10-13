// ── Blade of Lumia – NPC Definitions ─────────────────────────

// NPC タイルに対するスプライト・パレット対応表
export const NPC_SPRITE_MAP = {
	P: { sprite: 'princess', pal: 'princess' }, // 姫
	a: { sprite: 'npcA',     pal: 'npcA'     }, // 村人
	b: { sprite: 'npcB',     pal: 'npcB'     }, // 商人
	$: { sprite: 'npcShop',  pal: 'npcB'     }, // ショップ NPC
};

// 店（'$'）ごとの見た目の差し替え。shopData[セル].sprite にこの表のキーを書くと、
// その店だけ専用の絵で描く（書かない店・表に無い名前は NPC_SPRITE_MAP.$ のまま）。
// ゲーム（render-board.js）とエディタ（cell-appearance.js）は npcSpriteOf だけを通す＝食い違わない。
// 人物の差し替えは下の PERSON_NPC_SPRITES（npcData[セル].sprite）。
export const SHOP_NPC_SPRITES = {
	npcInfo: { sprite: 'npcInfo', pal: 'npcInfo', label: '情報屋' }, // refs/情報屋1.png・2.png（2026-09-30）
};

// 人物（村人 'a'・商人 'b'）ごとの見た目の差し替え（実行キュー56・2026-10-13）。
// npcData[セル].sprite にこの表のキーを書くと、その人だけ専用の絵で描く（書かない人・表に無い名前は
// NPC_SPRITE_MAP のタイルの絵のまま）。⚠️ 表に無い値は読まない＝エディタの旧選択欄が残した
// 'npcA'/'npcB' のような値で見た目が変わらない（2026-10-13 時点で実データに sprite 値は0件）。
export const PERSON_NPC_SPRITES = {
	npcElder: { sprite: 'npcElder', pal: 'npcElder', label: '老賢者' }, // refs/老賢者1.png・2.png（2026-10-13）
};

/** そのセルの NPC を描く絵 {sprite, pal}。NPC でないタイルは null。 */
export function npcSpriteOf(stageData, posKey, tile) {
	if (tile === '$') {
		const alt = SHOP_NPC_SPRITES[stageData?.shopData?.[posKey]?.sprite];
		if (alt) return alt;
	}
	if (tile === 'a' || tile === 'b') {
		const alt = PERSON_NPC_SPRITES[stageData?.npcData?.[posKey]?.sprite];
		if (alt) return alt;
	}
	return NPC_SPRITE_MAP[tile] ?? null;
}

// デフォルトの会話データ（エディタで上書き可能）
export const NPC_DEFAULT_DIALOG = {
	P: { name: '姫', lines: ['助けてくれてありがとう！', '魔王を倒してください…'] },
	a: { name: '村人', lines: ['こんにちは、旅人よ。'] },
	b: { name: '商人', lines: ['いらっしゃい！'] },
	$: { name: '道具屋', lines: ['何を買いますか？'] },
};

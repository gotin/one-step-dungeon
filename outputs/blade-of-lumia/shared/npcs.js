// ── Blade of Lumia – NPC Definitions ─────────────────────────

// NPC タイルに対するスプライト・パレット対応表
export const NPC_SPRITE_MAP = {
	P: { sprite: 'princess', pal: 'princess' }, // 姫
	a: { sprite: 'npcA',     pal: 'npcA'     }, // 村人
	b: { sprite: 'npcB',     pal: 'npcB'     }, // 商人
	$: { sprite: 'npcShop',  pal: 'npcB'     }, // ショップ NPC
};

// デフォルトの会話データ（エディタで上書き可能）
export const NPC_DEFAULT_DIALOG = {
	P: { name: '姫', lines: ['助けてくれてありがとう！', '魔王を倒してください…'] },
	a: { name: '村人', lines: ['こんにちは、旅人よ。'] },
	b: { name: '商人', lines: ['いらっしゃい！'] },
	$: { name: '道具屋', lines: ['何を買いますか？'] },
};

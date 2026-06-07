// ── Dungeon World – Enemy Definitions ────────────────────────
// 敵キャラクターのパラメータ定義
// game.js と editor.js の両方からインポートして使う

import { TILE } from './tiles.js';

// 敵の基本パラメータ（エディタでの設定がない場合のデフォルト）
// hp  : 最大HP
// atk : 攻撃力
// def : 防御力
// exp : 倒したときに得るEXP
// sprite : SPRITES オブジェクトのキー
// pal    : PAL オブジェクトのキー
// aggressive : true = 隣接したら攻撃する
export const ENEMY_META = {
	[TILE.PATROL]: { name: '巡回兵', hp:  5, atk: 3, def: 1, exp:  3, sprite: 'patrol', pal: 'patrol', aggressive: true },
	[TILE.CHASER]: { name: '追跡者', hp:  8, atk: 5, def: 2, exp:  6, sprite: 'chaser', pal: 'chaser', aggressive: true },
	[TILE.SENTRY]: { name: '騎士',   hp: 14, atk: 7, def: 3, exp: 12, sprite: 'sentry', pal: 'sentry', aggressive: true },
	[TILE.BOSS]:      { name: '魔将', hp: 20, atk: 9,  def: 4, exp: 20, sprite: 'escape',    pal: 'escape',    aggressive: true },
	[TILE.DARK_LORD]: { name: '魔王', hp: 50, atk: 50, def: 5, exp: 40, sprite: 'darklord',  pal: 'darklord',  aggressive: true, aura: true },
};

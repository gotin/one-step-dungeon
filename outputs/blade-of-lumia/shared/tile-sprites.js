// ── Blade of Lumia – Tile → Sprite 対応表（単一の真実）──────────
// エディタ（editor-palette.js）とゲーム（game/render-board.js）の両方が
// この表を参照する。「エディタとゲームで見た目が違う」を防ぐため、タイルが
// どのスプライト/パレットで描かれるかは必ずここ1か所で定義する。
//
// ※ 状態で見た目が変わるタイル（ドアの開閉・ゲートの開閉・ドアウェイ・宝箱の
//   開封・移動した石など）は、ゲーム側 addCellSprite が状態を見て個別に描く。
//   この表は「状態に依存しない基本スプライト」を表す（エディタは常にこれを描く）。

import { TILE } from './tiles.js';

export const TILE_SPRITE_MAP = {
	[TILE.BUTTON]:    { spr: 'button',   pal: 'button'   },
	[TILE.SWITCH]:    { spr: 'lever',    pal: 'lever'    },
	[TILE.GATE]:      { spr: 'gateG',    pal: 'gateG'    },
	[TILE.DOOR]:      { spr: 'door',     pal: 'door'     },
	[TILE.KEY]:       { spr: 'key',      pal: 'key'      },
	[TILE.STONE]:     { spr: 'block',    pal: 'block'    },
	[TILE.CHEST]:     { spr: 'chest',    pal: 'chest'    },
	[TILE.WATER]:     { spr: 'water',    pal: 'water'    },
	[TILE.LAVA]:      { spr: 'water',    pal: 'lava'     },  // 溶岩＝water 形状＋lava 赤橙パレット
	[TILE.TIDE_GATE]: { spr: 'water',    pal: 'tide'     },  // 潮ゲート＝water 形状＋tide 青緑パレット（閉＝満潮の見た目）
	[TILE.PATROL]:    { spr: 'patrol',   pal: 'patrol'   },
	[TILE.CHASER]:    { spr: 'chaser',   pal: 'chaser'   },
	[TILE.SENTRY]:    { spr: 'sentry',   pal: 'sentry'   },
	// Phase 5.5k: 向き別スプライトを持つ陸上敵はエディタでは DOWN（正面）の絵を出す
	// （エディタは状態を持たないので「その敵の代表となる1枚」＝正面を描く）。
	[TILE.SKELETON]:    { spr: 'skeletonD',   pal: 'skeleton'   },
	[TILE.SWORD_BEAST]: { spr: 'swordBeastD', pal: 'swordBeast' },
	// Phase 5.5k k-3（向き別を持たない3体＝1枚の絵＋左右反転で足りる）
	[TILE.BURROW_WORM]: { spr: 'burrowWorm', pal: 'burrowWorm' },
	[TILE.LEAP_SPIDER]: { spr: 'leapSpider', pal: 'leapSpider' },
	[TILE.BAT_SWARM]:   { spr: 'batSwarm',   pal: 'batSwarm'   },
	// Phase 5.5k k-4（方向依存の被ダメ）。盾騎士は向き別＝正面（D）の絵を代表に出す。
	// 火吐き亀は甲羅の開閉で絵が変わる（fireTurtle=開・fireTurtleClosed=閉）が、
	// エディタは状態を持たない∴代表は「開いている姿」＝素の名前。
	[TILE.SHIELD_KNIGHT]:{ spr: 'shieldKnightD', pal: 'shieldKnight' },
	[TILE.FIRE_TURTLE]:  { spr: 'fireTurtle',    pal: 'fireTurtle'   },
	// Phase 5.5k k-5（被弾が引き金になる2体）。どちらも向き別を持たない＝1枚の絵。
	// 分裂スライムの小型（splitSlimeSmall）はタイルとして配置しない（分裂でしか出ない）
	// ∴エディタの代表は親のスプライトだけで足りる。
	[TILE.SPLIT_SLIME]:  { spr: 'splitSlime',    pal: 'splitSlime'   },
	[TILE.RUPEE_EATER]:  { spr: 'rupeeEater',    pal: 'rupeeEater'   },
	// Phase 5.5k k-6（投擲物の種別追加）。2体とも向き別＝正面（D）の絵を代表に出す。
	[TILE.BOMB_OGRE]:      { spr: 'bombOgreD',      pal: 'bombOgre'      },
	[TILE.BOOMERANG_OGRE]: { spr: 'boomerangOgreD', pal: 'boomerangOgre' },
	// Phase 5.5k k-7（プレイヤー側の一時デバフ窓）。2体とも向き別を持たない＝1枚の絵。
	// ⚠️ **仮置き**＝既存絵のエイリアス（GUIDE §2「機構が先・絵は後」）。専用の 32×32 は
	// k-7b で描く（呪い火は「炎」に・毒沼ヒルは「ヒル」に見えないと機構が読めない）。
	[TILE.CURSE_FIRE]:   { spr: 'batSwarm',   pal: 'batSwarm'   },
	[TILE.POISON_LEECH]: { spr: 'burrowWorm', pal: 'burrowWorm' },
	[TILE.BOSS]:      { spr: 'escape',   pal: 'escape'   },
	[TILE.MONSTER]:   { spr: 'monster',  pal: 'monster'  },
	[TILE.DARK_LORD]: { spr: 'darklord', pal: 'darklord' },
	[TILE.FISH_SCHOOL]:{ spr: 'fishSchool', pal: 'fishSchool' },
	[TILE.LURK_SHARK]: { spr: 'lurkShark',  pal: 'lurkShark'  },
	[TILE.ARCHER_FISH]:{ spr: 'archerFish', pal: 'archerFish' },
	[TILE.PRINCESS]:  { spr: 'princess', pal: 'princess' },
	[TILE.PLAYER]:    { spr: 'heroD',    pal: 'hero'     },
	[TILE.NPC_A]:     { spr: 'npcA',     pal: 'npcA'     },
	[TILE.NPC_B]:     { spr: 'npcB',     pal: 'npcB'     },
	[TILE.ITEM_SWORD]:           { spr: 'sword',    pal: 'sword'    },
	[TILE.ITEM_SHIELD]:          { spr: 'shield',   pal: 'shield'   },
	[TILE.ITEM_BOOMERANG]:       { spr: 'boomerang',pal: 'boomerang'},
	[TILE.ITEM_RUPEE]:           { spr: 'rupee',    pal: 'rupee'    },
	[TILE.ITEM_RUPEE_LARGE]:     { spr: 'rupee',    pal: 'rupeeBlue'},
	[TILE.ITEM_TRIFORCE_PIECE]:  { spr: 'triforce', pal: 'triforce' },
	[TILE.TORCH]:                { spr: 'torch',    pal: 'torch'    },
	[TILE.BREAKABLE_WALL]:       { spr: 'breakableWall', pal: 'breakableWall' },
	[TILE.MAP_ENTER]:            { spr: 'mapEnter', pal: 'mapEnter' },
	[TILE.ITEM_HEART_CONTAINER]: { spr: 'heart',     pal: 'heart'     },
	[TILE.ITEM_ARMOR]:           { spr: 'armor',     pal: 'armor'     },
	[TILE.ITEM_BOMB]:            { spr: 'bombItem',  pal: 'bombItem'  },
	[TILE.ITEM_BOW]:             { spr: 'bow',       pal: 'bow'       },
	[TILE.ITEM_HEAL_POTION]:     { spr: 'potion',    pal: 'potion'    },
	[TILE.ITEM_BIG_HEAL_POTION]: { spr: 'bigHealPotion', pal: 'potionBig' },
	[TILE.ITEM_DUNGEON_MAP]:     { spr: 'dmap',      pal: 'dmap'      },
	[TILE.ITEM_COMPASS]:         { spr: 'compass',   pal: 'compass'   },
	[TILE.ALTAR]:                { spr: 'altar',     pal: 'altar'     },
	[TILE.DOORWAY]:              { spr: 'doorway',       pal: 'doorway'       },
	[TILE.DOORWAY_BOSS]:         { spr: 'doorwayBoss',   pal: 'doorwayBoss'   },
	[TILE.DOORWAY_LOCKED]:       { spr: 'doorwayLocked', pal: 'doorwayLocked' },
	[TILE.TREE]:        { spr: 'tree',      pal: 'tree'      },
	[TILE.MOUNTAIN]:    { spr: 'mountain',  pal: 'mountain'  },
	[TILE.BUSH]:        { spr: 'bush',      pal: 'bush'      },
	[TILE.FENCE]:       { spr: 'fence',     pal: 'fence'     },
	[TILE.HOUSE_WALL]:  { spr: 'houseWall', pal: 'houseWall' },
	[TILE.HOUSE_DOOR]:  { spr: 'houseDoor', pal: 'houseDoor' },
	[TILE.HOUSE_ROOF]:  { spr: 'houseRoof', pal: 'houseRoof' },
	[TILE.SIGN]:        { spr: 'sign',      pal: 'sign'      },
	[TILE.GRASS]:       { spr: 'grass',     pal: 'grass'     },
	[TILE.SAND]:        { spr: 'sand',      pal: 'sand'      },
	[TILE.STONE_FLOOR]: { spr: 'stoneFloor',pal: 'stoneFloor'},
	[TILE.BRIDGE]:      { spr: 'bridge',    pal: 'bridge'    },
	[TILE.SNOW]:        { spr: 'snow',      pal: 'snow'      },
	[TILE.ASH]:         { spr: 'sand',      pal: 'ash'       },
	[TILE.MUD]:         { spr: 'grass',     pal: 'mud'       },
	// Phase 5-1: 色スイッチ・色ゲート（基本スプライト。状態依存描画はゲーム側）
	[TILE.SWITCH_RED]:  { spr: 'switchRed', pal: 'switchRed' },
	[TILE.SWITCH_BLUE]: { spr: 'switchBlu', pal: 'switchBlu' },
	[TILE.GATE_RED]:    { spr: 'gateRed',   pal: 'gateRed'   },
	[TILE.GATE_BLUE]:   { spr: 'gateBlu',   pal: 'gateBlu'   },
};

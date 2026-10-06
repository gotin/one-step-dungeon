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
	// Phase 5.5k k-7（プレイヤー側の一時デバフ窓）。2体とも向き別を持たない＝1枚の絵
	// （k-7b で専用の 32×32 を手描きした＝呪い火は「剣を飲み込んだ炎」・毒沼ヒルは「毒の縞を
	// 持つヒル」に見えないと機構が読めない＝GUIDE §6-1）。
	[TILE.SORCERER]:     { spr: 'sorcerer',    pal: 'sorcerer'    },
	// Phase 5.5k k-9（直線突進）。向き別は持たない（sideView の左右反転で足りる）∴1枚の絵。
	[TILE.CHARGE_BOAR]:  { spr: 'chargeBoar',  pal: 'chargeBoar'  },
	[TILE.CURSE_FIRE]:   { spr: 'curseFire',   pal: 'curseFire'   },
	[TILE.POISON_LEECH]: { spr: 'poisonLeech', pal: 'poisonLeech' },
	// 勇者の絵を流用する3系統。2026-08-26 に directional:true へ載せた＝ENEMY_META と同じ
	// `…D`（正面）を指す（骸骨剣士 skeletonD・剣獣 swordBeastD と同じ作法）。
	// 素の `escape`/`monster`/`darklord` は heroR＝**右向き**∴ここに置くと
	// エディタのプレビューだけ横を向く食い違いになる。
	[TILE.BOSS]:      { spr: 'escapeD',   pal: 'escape'   },
	[TILE.MONSTER]:   { spr: 'monsterD',  pal: 'monster'  },
	[TILE.DARK_LORD]: { spr: 'darklordD', pal: 'darklord' },
	[TILE.FISH_SCHOOL]:{ spr: 'fishSchool', pal: 'fishSchool' },
	[TILE.LURK_SHARK]: { spr: 'lurkShark',  pal: 'lurkShark'  },
	[TILE.ARCHER_FISH]:{ spr: 'archerFish', pal: 'archerFish' },
	[TILE.PRINCESS]:  { spr: 'princess', pal: 'princess' },
	[TILE.PLAYER]:    { spr: 'heroD',    pal: 'hero'     },
	[TILE.NPC_A]:     { spr: 'npcA',     pal: 'npcA'     },
	[TILE.NPC_B]:     { spr: 'npcB',     pal: 'npcB'     },
	// 店。店ごとの差し替え（shopData.sprite）は shared/npcs.js npcSpriteOf が引く＝ここは既定の絵
	[TILE.NPC_SHOP]:  { spr: 'npcShop',  pal: 'npcB'     },
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
	// 実行キュー19: '6' は矢束＝弓の絵ではなく**矢**を描く（床に弓は落ちていない）。
	// 大きさだけは例外扱い＝下の TILE_SPRITE_SCALE を見ること。
	[TILE.ITEM_ARROWS]:          { spr: 'arrow',     pal: 'arrow'     },
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
	// キュー27：石碑・転移の石碑（絵は shared/sprites-monument.js）。転移碑の「灯った」絵
	// （warpStoneLit）は状態で決まる∴ゲーム側（render-board.js）が灯った碑だけ差し替える。
	[TILE.MONUMENT]:    { spr: 'monument',  pal: 'monument'  },
	[TILE.WARP_STONE]:  { spr: 'warpStone', pal: 'warpStone' },
	[TILE.GRASS]:       { spr: 'grass',     pal: 'grass'     },
	[TILE.SAND]:        { spr: 'sand',      pal: 'sand'      },
	[TILE.STONE_FLOOR]: { spr: 'stoneFloor',pal: 'stoneFloor'},
	[TILE.BRIDGE]:      { spr: 'bridge',    pal: 'bridge'    },
	[TILE.SNOW]:        { spr: 'snow',      pal: 'snow'      },
	// 灰・泥は砂/草の形の流用をやめて専用の形にした（2026-09-06）＝
	// 火山灰は角のある岩、泥はドロドロの溜まりに見せるため（同じ形＋色替えでは素材が違って見えない）
	[TILE.ASH]:         { spr: 'ash',       pal: 'ash'       },
	[TILE.MUD]:         { spr: 'mud',       pal: 'mud'       },
	// キュー40（2026-10-06）：氷の床＝押した石が滑る（絵は shared/sprites-tiles.js の iceFloor）
	[TILE.ICE]:         { spr: 'iceFloor',  pal: 'ice'       },
	// キュー10番・10c 追い作業：小さな島の丸い角（草地＋本物の水模様・手配置）
	[TILE.ISLAND_CORNER_NW]: { spr: 'islandCornerNw', pal: 'islandCorner' },
	[TILE.ISLAND_CORNER_NE]: { spr: 'islandCornerNe', pal: 'islandCorner' },
	[TILE.ISLAND_CORNER_SW]: { spr: 'islandCornerSw', pal: 'islandCorner' },
	[TILE.ISLAND_CORNER_SE]: { spr: 'islandCornerSe', pal: 'islandCorner' },
	// キュー10番・10c-2：手すりを手で決める橋。連結タイルなので実際の絵は
	// tile-connect.js が組む（この表は「連結を考えない基本の1枚」＝板の向きだけ）。
	[TILE.BRIDGE_V_BOTH]: { spr: 'bridgeDeckH', pal: 'bridge' },
	[TILE.BRIDGE_V_W]:    { spr: 'bridgeDeckH', pal: 'bridge' },
	[TILE.BRIDGE_V_E]:    { spr: 'bridgeDeckH', pal: 'bridge' },
	[TILE.BRIDGE_V_NONE]: { spr: 'bridgeDeckH', pal: 'bridge' },
	[TILE.BRIDGE_H_BOTH]: { spr: 'bridgeDeckV', pal: 'bridge' },
	[TILE.BRIDGE_H_N]:    { spr: 'bridgeDeckV', pal: 'bridge' },
	[TILE.BRIDGE_H_S]:    { spr: 'bridgeDeckV', pal: 'bridge' },
	[TILE.BRIDGE_H_NONE]: { spr: 'bridgeDeckV', pal: 'bridge' },
	// Phase 5-1: 色スイッチ・色ゲート（基本スプライト。状態依存描画はゲーム側）
	[TILE.SWITCH_RED]:  { spr: 'switchRed', pal: 'switchRed' },
	[TILE.SWITCH_BLUE]: { spr: 'switchBlu', pal: 'switchBlu' },
	[TILE.GATE_RED]:    { spr: 'gateRed',   pal: 'gateRed'   },
	[TILE.GATE_BLUE]:   { spr: 'gateBlu',   pal: 'gateBlu'   },
};

// 「セル全面より小さく貼る」床タイルの例外表（単一の真実・キュー19）。
//
// 既定は 32 ドットの絵をセル全面に貼る（game/css/board.css の .dot32）＝見かけの
// 大きさは絵の中の透明な余白で作る（shared/sprites-obj32.js の方針）。矢だけはこの
// 方針に乗れない：`arrow` の絵は余白なしの横向き（ink 27×15）で、飛翔中の矢・敵の
// ドロップ・床タイルの3か所が同じ絵を共有している。全面に貼ると「撃たれた矢が床を
// 横切っている」ように見え、同じ部屋の爆弾より大きくなる（キュー19 の自己レビュー）。
//
// ⚠️ 矢束のための専用の絵は試して捨てた（3案とも柵・鉢植え・マッチ棒に見えた）。
//    見本は**キュー18 でユーザー判定 OK になった敵ドロップの矢**＝同じ 0.35 に揃える
//    ∴game/game.js の FLOOR_DROP_SPRITE_SCALE.arrow はこの値を import して使う
//    （2か所に数字を書くと片方だけ直して食い違う）。
export const ARROW_CELL_SCALE = 0.35;

export const TILE_SPRITE_SCALE = {
	[TILE.ITEM_ARROWS]: ARROW_CELL_SCALE,
};

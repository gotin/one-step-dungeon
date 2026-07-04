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
	[TILE.PATROL]:    { spr: 'patrol',   pal: 'patrol'   },
	[TILE.CHASER]:    { spr: 'chaser',   pal: 'chaser'   },
	[TILE.SENTRY]:    { spr: 'sentry',   pal: 'sentry'   },
	[TILE.BOSS]:      { spr: 'escape',   pal: 'escape'   },
	[TILE.MONSTER]:   { spr: 'monster',  pal: 'monster'  },
	[TILE.DARK_LORD]: { spr: 'darklord', pal: 'darklord' },
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

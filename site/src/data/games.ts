// ゲームの一覧（/games とトップで共通）。新しいゲームを公開したらここに足す。
// ゲーム本体は outputs/ から public/ へコピーされる静的ページ（scripts/copy-games.mjs）。
// 絵は site/art/ に置き、同じスクリプトで public/art/ へ写す。
export type Game = {
  href: string;
  title: string;
  /** カードに出すゲーム画面（public からの URL） */
  thumb: string;
  desc: string;
  genre: string;
  wip?: boolean;
};

export type FeaturedGame = Game & {
  /** 見出しの下に出す一言 */
  tagline: string;
  /** ゲーム画面のギャラリー（先頭が大きい1枚） */
  shots: { src: string; caption: string }[];
};

// 作り込みの量が他と大きく違うので、Blade of Lumia だけを大きく扱う（2026-11-12 ユーザー判断）
export const FEATURED: FeaturedGame = {
  href: "/blade-of-lumia/game/",
  title: "Blade of Lumia",
  thumb: "/art/blade/field_13-5.jpg",
  desc: "剣・盾・ブーメランで、島じゅうのダンジョンを攻略するリアルタイムアクション RPG。",
  tagline: "いちばん時間をかけて作っているゲーム。",
  genre: "Action RPG",
  wip: true,
  shots: [
    { src: "/art/blade/field_13-5.jpg", caption: "雪の村" },
    { src: "/art/blade/dragon_lair_1-0.jpg", caption: "邪竜の巣" },
    { src: "/art/blade/dungeon_5_4-3.jpg", caption: "氷の廃墟" },
    { src: "/art/blade/dungeon_3_4-3.jpg", caption: "水の迷宮" },
  ],
};

export const OTHER_GAMES: Game[] = [
  {
    href: "/one-step-dungeon/",
    title: "One Step Dungeon",
    thumb: "/art/games/one-step-dungeon.jpg",
    desc: "敵の動きを読んで1手ずつ進む、ターン制の脱出パズル。",
    genre: "Puzzle",
  },
  {
    href: "/sword-duel/",
    title: "Sword Duel",
    thumb: "/art/games/sword-duel.jpg",
    desc: "移動・ジャンプ・盾・剣で CPU と斬り合う 1on1。",
    genre: "Action",
  },
  {
    href: "/dungeon-world/game/",
    title: "Dungeon World",
    thumb: "/art/games/dungeon-world.jpg",
    desc: "1歩ずつ進むダンジョン探索 RPG。",
    genre: "RPG",
    wip: true,
  },
];

export const GAMES: Game[] = [FEATURED, ...OTHER_GAMES];

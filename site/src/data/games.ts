// ゲームの一覧（/games とトップで共通）。新しいゲームを公開したらここに足す。
// ゲーム本体は outputs/ から public/ へコピーされる静的ページ（scripts/copy-games.mjs）。
export type Game = {
  href: string;
  title: string;
  icon: string;
  desc: string;
  genre: string;
  wip?: boolean;
};

export const GAMES: Game[] = [
  {
    href: "/one-step-dungeon/",
    title: "One Step Dungeon",
    icon: "🗺️",
    desc: "ターン制ダンジョン脱出パズル。敵の動きを読んで、1手ずつ慎重に進め！",
    genre: "Puzzle",
  },
  {
    href: "/sword-duel/",
    title: "Sword Duel",
    icon: "⚔️",
    desc: "1on1 剣戟アクション。移動・ジャンプ・盾・剣で敵CPUを倒せ！",
    genre: "Action",
  },
  {
    href: "/dungeon-world/game/",
    title: "Dungeon World",
    icon: "🏰",
    desc: "ゼルダ×ワンステップダンジョン×RPG。広大なダンジョンを1歩ずつ探索！",
    genre: "RPG",
    wip: true,
  },
  {
    href: "/blade-of-lumia/game/",
    title: "Blade of Lumia",
    icon: "🗡️",
    desc: "リアルタイムアクションRPG。剣・盾・ブーメランを駆使してダンジョンを攻略！",
    genre: "Action RPG",
    wip: true,
  },
];

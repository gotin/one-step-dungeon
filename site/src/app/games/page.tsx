import type { Metadata } from "next";
import { FeaturedGameCard, GameList } from "@/components/game-list";
import { FEATURED, OTHER_GAMES } from "@/data/games";

export const metadata: Metadata = {
  title: "Games",
  description: "ブラウザで遊べるゲーム集",
};

export default function GamesPage() {
  return (
    <>
      <h1 className="pixel-title page-title">Games</h1>
      <p className="muted">ブラウザで遊べるゲーム集。インストール不要。</p>
      <FeaturedGameCard game={FEATURED} full />
      <h2 className="section-title">ほかのゲーム</h2>
      <GameList games={OTHER_GAMES} />
    </>
  );
}

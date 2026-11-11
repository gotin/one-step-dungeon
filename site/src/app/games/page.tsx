import type { Metadata } from "next";
import { GameList } from "@/components/game-list";
import { GAMES } from "@/data/games";

export const metadata: Metadata = {
  title: "Games",
  description: "ブラウザで遊べるゲーム集",
};

export default function GamesPage() {
  return (
    <>
      <h1>Games</h1>
      <p className="muted">ブラウザで遊べるゲーム集。インストール不要。</p>
      <GameList games={GAMES} />
    </>
  );
}

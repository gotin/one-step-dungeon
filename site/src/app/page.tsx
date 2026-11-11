// トップ。紹介・最新記事・ゲームへの導線。
import Link from "next/link";
import { GameList } from "@/components/game-list";
import { PostList } from "@/components/post-list";
import { GAMES } from "@/data/games";
import { listPublishedPosts } from "@/server/posts";

export default async function Home() {
  const posts = await listPublishedPosts({ limit: 5 });
  return (
    <>
      <section className="intro">
        <h1>Small Isle</h1>
        <p>A small place for things I make.</p>
      </section>

      <section>
        <h2>最新の記事</h2>
        <PostList posts={posts} />
        <p>
          <Link href="/blog/">記事一覧へ →</Link>
        </p>
      </section>

      <section id="games">
        <h2>Games</h2>
        <GameList games={GAMES} />
        <p>
          <Link href="/games/">ゲーム一覧へ →</Link>
        </p>
      </section>
    </>
  );
}

// トップ。島の絵・最新記事・ゲームへの導線。
import Link from "next/link";
import { FeaturedGameCard, GameList } from "@/components/game-list";
import { PostList } from "@/components/post-list";
import { FEATURED, OTHER_GAMES } from "@/data/games";
import { listPublishedPosts } from "@/server/posts";

export default async function Home() {
  const posts = await listPublishedPosts({ limit: 5 });
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-sea">
          {/* biome-ignore lint/performance/noImgElement: ドット絵を整数倍で拡大して出す */}
          <img
            className="hero-island"
            src="/art/island.png"
            alt="Blade of Lumia のドット絵で描いた小さな島"
            width={512}
            height={160}
          />
        </div>
        <div className="hero-text">
          <h1 id="hero-title" className="pixel-title">
            Small Isle
          </h1>
          <p>A small place for things I make.</p>
        </div>
      </section>

      <section>
        <h2 className="section-title">最新の記事</h2>
        <PostList posts={posts} />
        <p className="more">
          <Link href="/blog/">記事一覧へ →</Link>
        </p>
      </section>

      <section id="games">
        <h2 className="section-title">Games</h2>
        <FeaturedGameCard game={FEATURED} />
        <GameList games={OTHER_GAMES} />
        <p className="more">
          <Link href="/games/">ゲーム一覧へ →</Link>
        </p>
      </section>
    </>
  );
}

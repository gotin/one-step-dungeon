// トップ。紹介・最新記事・ゲームへの導線。Projects への導線と /games の一覧ページは §10-7 で作る。
import Link from "next/link";
import { PostList } from "@/components/post-list";
import { listPublishedPosts } from "@/server/posts";

const GAMES = [
  {
    href: "/one-step-dungeon/",
    title: "One Step Dungeon",
    desc: "ターン制ダンジョン脱出パズル",
  },
  { href: "/sword-duel/", title: "Sword Duel", desc: "1on1 剣戟アクション" },
  {
    href: "/dungeon-world/game/",
    title: "Dungeon World",
    desc: "1歩ずつ探索するダンジョン RPG（開発中）",
  },
  {
    href: "/blade-of-lumia/game/",
    title: "Blade of Lumia",
    desc: "リアルタイムアクション RPG（開発中）",
  },
];

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
        <ul className="game-list">
          {GAMES.map((g) => (
            <li key={g.href}>
              {/* ゲームは Next.js の外の静的ページ＝通常の <a> で全画面遷移する */}
              <a href={g.href}>{g.title}</a>
              <span className="muted"> — {g.desc}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

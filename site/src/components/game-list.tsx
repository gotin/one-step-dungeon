import type { FeaturedGame, Game } from "@/data/games";

// ゲームは Next.js の外の静的ページ＝リンクは通常の <a> で全画面遷移する

function Badges({ game }: { game: Game }) {
  return (
    <span className="chips">
      <span className="chip">{game.genre}</span>
      {game.wip && <span className="chip chip-wip">開発中</span>}
    </span>
  );
}

/** Blade of Lumia：大きな画面＋ギャラリー。`full` は /games 用（画面を全部並べる） */
export function FeaturedGameCard({
  game,
  full = false,
}: {
  game: FeaturedGame;
  full?: boolean;
}) {
  const [main, ...rest] = game.shots;
  return (
    <article className="game-card featured">
      <a href={game.href} className="featured-shot pixel-frame">
        {/* biome-ignore lint/performance/noImgElement: 静的なドット絵を拡大せずそのまま出す */}
        <img src={main.src} alt={`${game.title}：${main.caption}`} />
        <span className="featured-play">▶ PLAY</span>
      </a>
      <div className="featured-body">
        <p className="featured-kicker">NOW MAKING</p>
        <h3 className="featured-title">
          <a href={game.href}>{game.title}</a>
        </h3>
        <p className="featured-desc">{game.desc}</p>
        <Badges game={game} />
      </div>
      {full && rest.length > 0 && (
        <ul className="featured-gallery">
          {rest.map((s) => (
            <li key={s.src}>
              <figure>
                {/* biome-ignore lint/performance/noImgElement: 同上 */}
                <img
                  src={s.src}
                  alt={`${game.title}：${s.caption}`}
                  loading="lazy"
                />
                <figcaption>{s.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** そのほかのゲーム：小さなカードを横に並べる */
export function GameList({ games }: { games: Game[] }) {
  return (
    <ul className="game-list">
      {games.map((g) => (
        <li key={g.href} className="game-card">
          <a href={g.href} className="game-card-link">
            <span className="game-card-thumb pixel-frame">
              {/* biome-ignore lint/performance/noImgElement: 同上 */}
              <img src={g.thumb} alt="" loading="lazy" />
            </span>
            <span className="game-card-title">{g.title}</span>
            <span className="game-card-desc">{g.desc}</span>
            <Badges game={g} />
          </a>
        </li>
      ))}
    </ul>
  );
}

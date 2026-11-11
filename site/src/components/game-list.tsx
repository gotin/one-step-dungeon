import type { Game } from "@/data/games";

export function GameList({ games }: { games: Game[] }) {
  return (
    <ul className="game-list">
      {games.map((g) => (
        <li key={g.href} className="game-card">
          {/* ゲームは Next.js の外の静的ページ＝通常の <a> で全画面遷移する */}
          <a href={g.href} className="game-card-link">
            <span className="game-card-icon" aria-hidden="true">
              {g.icon}
            </span>
            <span className="game-card-body">
              <span className="game-card-title">{g.title}</span>
              <span className="game-card-desc">{g.desc}</span>
              <span className="game-card-badges">
                <span className="game-card-badge">{g.genre}</span>
                {g.wip && <span className="game-card-badge">開発中</span>}
              </span>
            </span>
            <span className="game-card-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

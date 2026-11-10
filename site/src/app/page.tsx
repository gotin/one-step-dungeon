// 仮のトップ。中身（紹介・最新記事・Games / Projects への導線）は §10-3 で作る。
export default function Home() {
  return (
    <main>
      <h1>Small Isle</h1>
      <p>A small place for things I make.</p>
      <ul>
        <li>
          <a href="/one-step-dungeon/">One Step Dungeon</a>
        </li>
        <li>
          <a href="/sword-duel/">Sword Duel</a>
        </li>
        <li>
          <a href="/dungeon-world/game/">Dungeon World</a>
        </li>
        <li>
          <a href="/blade-of-lumia/game/">Blade of Lumia</a>
        </li>
      </ul>
    </main>
  );
}

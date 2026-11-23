import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシー",
  description: "Small Isle で預かる情報と、その使い道・消し方",
};

// ⚠️ 文面は案（2026-11-23・Claude 作成）。公開の前にサイトの持ち主が確かめて直す（Blade キュー117）。
export default function PrivacyPage() {
  return (
    <>
      <h1 className="pixel-title page-title">プライバシー</h1>
      <div className="markdown-body">
        <p>
          Small Isle（smallisle.works）が預かる情報と、その使い道・消し方です。
        </p>

        <h2>ゲームのログイン（Blade of Lumia）</h2>
        <p>
          Blade of Lumia では、Google
          でログインすると、セーブをこのサイトに預けて、別のブラウザでも続きから遊べます。ログインしなくても遊べます（そのときセーブはお使いのブラウザの中だけに残ります）。
        </p>
        <h3>預かるもの</h3>
        <ul>
          <li>
            Google アカウントの名前・メールアドレス・アイコン画像の
            URL（ログインのときに Google から受け取るもの）
          </li>
          <li>ゲームのセーブ（進み具合・クリアの記録・クリアの最短時間）</li>
          <li>
            ログインを保つための情報（ログインの有効期限、ログインしたときの IP
            アドレスとブラウザの種類）
          </li>
        </ul>
        <h3>使い道</h3>
        <p>
          ログインした本人を見分けて、セーブを保存し、読み出すためだけに使います。ほかの目的には使いません。広告や第三者への提供はしません。
        </p>
        <h3>置き場所</h3>
        <p>
          サイトは Vercel、データベースは
          Neon（PostgreSQL）のサービスの上で動いています。
        </p>
        <h3>消し方</h3>
        <p>
          ゲームのタイトル画面で、ログイン中に「退会」を押すと、アカウントと預かっているセーブをすべて消します（お使いのブラウザの中のセーブは残ります）。
        </p>

        <h2>Cookie</h2>
        <p>
          ログインを保つための Cookie のほかに、広告や追跡のための Cookie
          は使っていません。
        </p>
      </div>
    </>
  );
}

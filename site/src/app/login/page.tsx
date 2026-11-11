// 管理者のログイン画面。管理者以外が GitHub でログインすると ?error=not_admin で戻ってくる。
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInButton } from "./sign-in-button";

export const metadata: Metadata = {
  title: "ログイン",
  robots: { index: false, follow: false },
};

async function ErrorNote({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  if (!error) return null;
  const message =
    error === "not_admin"
      ? "このアカウントではログインできません。"
      : `ログインできませんでした（${String(error)}）。`;
  return <p className="error">{message}</p>;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <>
      <h1>ログイン</h1>
      <p className="muted">管理画面は管理者だけが使えます。</p>
      <Suspense>
        <ErrorNote {...props} />
      </Suspense>
      <SignInButton />
    </>
  );
}

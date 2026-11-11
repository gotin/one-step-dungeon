// 管理画面の共通の枠。管理者の確認は Cookie を読む＝リクエストごとの処理なので Suspense の中で行う。
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/server/admin";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: { default: "管理画面", template: "%s | 管理画面" },
  robots: { index: false, follow: false },
};

async function AdminGate({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <>
      <div className="admin-bar">
        <span className="muted">{admin.name} でログイン中</span>
        <form action={signOut}>
          <button type="submit" className="link-button">
            ログアウト
          </button>
        </form>
      </div>
      {children}
    </>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<p className="muted">確認中…</p>}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

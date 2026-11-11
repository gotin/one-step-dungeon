"use server";

import { redirect } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";
import { requireAdmin } from "@/server/admin";
import {
  deletePost,
  deleteUnusedTags,
  PostInputError,
  type PostStatus,
  savePost,
} from "@/server/admin-posts";

export type SaveState = { error: string | null };

const STATUSES: PostStatus[] = ["draft", "scheduled", "published"];

/** datetime-local の値（日本時間として入力）を Date にする */
function parseJstLocal(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    throw new PostInputError("公開日時の形式が正しくない");
  }
  return date;
}

export async function savePostAction(
  _prev: SaveState,
  form: FormData,
): Promise<SaveState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "") || null;
  const status = String(form.get("status")) as PostStatus;
  let savedId: string;
  try {
    if (!STATUSES.includes(status)) throw new PostInputError("状態が不正");
    savedId = await savePost(
      id,
      {
        slug: String(form.get("slug") ?? ""),
        title: String(form.get("title") ?? ""),
        excerpt: String(form.get("excerpt") ?? ""),
        body: String(form.get("body") ?? ""),
        status,
        publishedAt: parseJstLocal(String(form.get("publishedAt") ?? "")),
        tagNames: String(form.get("tags") ?? "").split(","),
      },
      "admin",
    );
    await deleteUnusedTags();
  } catch (error) {
    if (error instanceof PostInputError) return { error: error.message };
    throw error;
  }
  redirect(`/admin/posts/${savedId}/?saved=1`);
}

export async function deletePostAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (id) {
    await deletePost(id);
    await deleteUnusedTags();
  }
  redirect("/admin/");
}

/** エディタ右側のプレビュー。公開ページと同じ変換（サニタイズ込み）を使う */
export async function previewAction(markdown: string): Promise<string> {
  await requireAdmin();
  return renderMarkdown(markdown);
}

import type { EditablePost } from "@/server/admin-posts";
import type { EditorValues } from "./post-editor";

/** Date を datetime-local 用の日本時間の文字列（YYYY-MM-DDTHH:mm）にする */
export function toJstLocal(date: Date | null): string {
  if (!date) return "";
  const jst = new Date(date.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 16);
}

export function toEditorValues(post: EditablePost | null): EditorValues {
  if (!post) {
    return {
      id: null,
      slug: "",
      title: "",
      excerpt: "",
      body: "",
      status: "draft",
      publishedAt: "",
      tags: "",
    };
  }
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    status: post.status,
    publishedAt: toJstLocal(post.publishedAt),
    tags: post.tagNames.join(", "),
  };
}

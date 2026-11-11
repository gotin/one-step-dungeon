// CLI 用：全記事（下書きも含む）を本文つきで返す。`npm run export` が使う。
import { NextResponse } from "next/server";
import { getEditablePost, listAllPosts } from "@/server/admin-posts";
import { hasApiToken } from "@/server/api-token";
import { type PostJson, toPostJson } from "@/server/post-json";

export async function GET(request: Request): Promise<NextResponse> {
  if (!hasApiToken(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await listAllPosts();
  const result: PostJson[] = [];
  for (const row of rows) {
    const post = await getEditablePost({ id: row.id });
    if (post) result.push(toPostJson(post));
  }
  return NextResponse.json({ posts: result });
}

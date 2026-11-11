// CLI 用：1記事の取得（pull）と、slug をキーにした作成・更新（push）。
// 書き込みは管理画面と同じ savePost() を通る（版が残り、公開ページのキャッシュも更新される）。
import { NextResponse } from "next/server";
import {
  deleteUnusedTags,
  getEditablePost,
  PostInputError,
  savePost,
} from "@/server/admin-posts";
import { hasApiToken } from "@/server/api-token";
import { fromPostJson, toPostJson } from "@/server/post-json";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/cli/posts/[slug]">,
): Promise<NextResponse> {
  if (!hasApiToken(request)) return unauthorized();
  const { slug } = await params;
  const post = await getEditablePost({ slug: decodeURIComponent(slug) });
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ post: toPostJson(post) });
}

export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/cli/posts/[slug]">,
): Promise<NextResponse> {
  if (!hasApiToken(request)) return unauthorized();
  const slug = decodeURIComponent((await params).slug);
  try {
    const input = fromPostJson(await request.json());
    // slug は記事を見分けるキー。変えるときは管理画面で（旧 slug の転送もそこで登録される）
    if (input.slug !== slug) {
      throw new PostInputError(
        `URL の slug（${slug}）と本文の slug（${input.slug}）が違う`,
      );
    }
    const existing = await getEditablePost({ slug });
    const id = await savePost(existing?.id ?? null, input, "cli");
    await deleteUnusedTags();
    const saved = await getEditablePost({ id });
    return NextResponse.json(
      { created: !existing, post: saved && toPostJson(saved) },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof PostInputError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

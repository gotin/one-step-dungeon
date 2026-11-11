// 記事の画像のアップロード（ブラウザ → Vercel Blob へ直接）。ここはアップロード用の短期トークンを出すだけ。
// 管理者だけに出す。保存先は posts/ の下、名前の末尾にランダムな文字列を付けて上書きを防ぐ。
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getAdmin } from "@/server/admin";

const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
];
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  // アップロード完了の通知（onUploadCompleted）は使わない＝来るのはトークンの依頼だけ
  if (body.type !== "blob.generate-client-token") {
    return NextResponse.json({ error: "unsupported" }, { status: 400 });
  }
  if (!(await getAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("posts/") || pathname.includes("..")) {
          throw new Error("保存先が不正");
        }
        return {
          allowedContentTypes: IMAGE_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "upload failed" },
      { status: 400 },
    );
  }
}

// CLI / API（§6）の認証。`Authorization: Bearer <ADMIN_API_TOKEN>` を照合する。
// トークンが未設定の環境では、どのリクエストも通さない。
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function hasApiToken(request: Request): boolean {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  // 長さの違いで時間が変わらないよう、ハッシュにそろえてから比べる
  return timingSafeEqual(digest(match[1].trim()), digest(expected));
}

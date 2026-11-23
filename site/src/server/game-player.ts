// ゲームの API（/api/game/…）の本人確認。ログインの Cookie からユーザーを引く。
// 書き込みの API は、別のサイトから送られた要求を断る（Origin が自分のサイトと違えば 403）。
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export type GamePlayer = { userId: string };

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Origin が付いていて自分のサイトと違えば true（ブラウザは POST/PUT/DELETE の fetch に Origin を付ける） */
export function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin !== new URL(request.url).origin;
}

/** ログインしていればそのユーザー、していなければ null */
export async function getGamePlayer(
  request: Request,
): Promise<GamePlayer | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? { userId: session.user.id } : null;
}

// 退会：ログイン中のアカウントと、預かっているゲームのセーブを消す（手元のセーブはゲーム側に残る）
import { NextResponse } from "next/server";
import { getGamePlayer, isCrossOrigin, jsonError } from "@/server/game-player";
import { deleteUserAccount } from "@/server/game-saves";

export async function DELETE(request: Request): Promise<NextResponse> {
  if (isCrossOrigin(request)) return jsonError("forbidden", 403);
  const player = await getGamePlayer(request);
  if (!player) return jsonError("unauthorized", 401);
  await deleteUserAccount(player.userId);
  // セッションの行も連鎖で消える＝ブラウザに残った Cookie はもう誰も指さない（cookieCache は使っていない）
  return NextResponse.json({ deleted: true });
}

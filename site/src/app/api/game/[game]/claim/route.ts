// ゲームの画面を開いたとき：この画面を「書ける画面」にして（前に開いていた画面は書けなくなる）、預かっているセーブを返す
import { NextResponse } from "next/server";
import { getGamePlayer, isCrossOrigin, jsonError } from "@/server/game-player";
import { claimGameSave, isKnownGame } from "@/server/game-saves";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/game/[game]/claim">,
): Promise<NextResponse> {
  if (isCrossOrigin(request)) return jsonError("forbidden", 403);
  const { game } = await params;
  if (!isKnownGame(game)) return jsonError("not found", 404);
  const player = await getGamePlayer(request);
  if (!player) return jsonError("unauthorized", 401);
  const claimed = await claimGameSave(player.userId, game);
  return NextResponse.json({
    token: claimed.token,
    data: claimed.data,
    savedAt: claimed.savedAt?.toISOString() ?? null,
  });
}

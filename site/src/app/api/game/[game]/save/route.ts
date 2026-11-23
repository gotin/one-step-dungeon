// ゲームの保存。claim でもらった token が今のものと違えば 409（別の画面が後から開かれた＝ゲーム側が止まる）
import { NextResponse } from "next/server";
import { getGamePlayer, isCrossOrigin, jsonError } from "@/server/game-player";
import {
  GameSaveInputError,
  isKnownGame,
  parseGameSaveData,
  putGameSave,
} from "@/server/game-saves";

export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/game/[game]/save">,
): Promise<NextResponse> {
  if (isCrossOrigin(request)) return jsonError("forbidden", 403);
  const { game } = await params;
  if (!isKnownGame(game)) return jsonError("not found", 404);
  const player = await getGamePlayer(request);
  if (!player) return jsonError("unauthorized", 401);
  let token: string;
  let data: ReturnType<typeof parseGameSaveData>;
  try {
    const body = (await request.json()) as { token?: unknown; data?: unknown };
    if (typeof body?.token !== "string" || !body.token) {
      throw new GameSaveInputError("token が無い");
    }
    token = body.token;
    data = parseGameSaveData(game, body.data);
  } catch (error) {
    if (error instanceof GameSaveInputError || error instanceof SyntaxError) {
      return jsonError(error.message, 400);
    }
    throw error;
  }
  const result = await putGameSave(player.userId, game, token, data);
  if (!result.ok) return jsonError("taken over", 409);
  return NextResponse.json({ savedAt: result.savedAt.toISOString() });
}

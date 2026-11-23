// ゲームのセーブ（Blade of Lumia キュー117）。ログインした遊ぶ人のセーブを預かり、別のブラウザでも続けられるようにする。
// 同時プレイは「最後に開いた画面だけが書ける」：画面を開くたびに claim で active_token を作り直し、
// 保存はその token が今のものと同じときだけ通す（古い画面の保存は conflict になり、ゲーム側が止まる）。
// neon-http は対話的なトランザクションを持たないので、どちらも1文の SQL で条件と書き込みを同時に行う。
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type GameSaveData, gameSaves, user } from "@/db/schema";

/** 受け付けるゲームの名前と、送ってよいキー（手元の localStorage のキー） */
export const GAMES: Record<string, readonly string[]> = {
  "blade-of-lumia": [
    "blade-of-lumia-save",
    "blade-of-lumia-cleared",
    "blade-of-lumia-carry",
    "blade-of-lumia-best-time",
  ],
};

/** 1回に送れるセーブの大きさの上限（文字数）。Vercel の関数の本文の上限 4.5MB より十分小さく */
export const MAX_SAVE_CHARS = 2_000_000;

export class GameSaveInputError extends Error {}

export type ClaimedSave = {
  token: string;
  data: GameSaveData | null;
  savedAt: Date | null;
};

export function isKnownGame(game: string): boolean {
  return Object.hasOwn(GAMES, game);
}

/** 送られてきたセーブを確かめる。知らないキー・文字列でない値・大きすぎるものは断る */
export function parseGameSaveData(game: string, raw: unknown): GameSaveData {
  const keys = GAMES[game];
  if (!keys) throw new GameSaveInputError(`知らないゲーム：${game}`);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new GameSaveInputError("data はオブジェクトで送る");
  }
  const out: GameSaveData = {};
  let size = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!keys.includes(k)) throw new GameSaveInputError(`知らないキー：${k}`);
    if (v !== null && typeof v !== "string") {
      throw new GameSaveInputError(`${k} の値は文字列か null`);
    }
    size += k.length + (v?.length ?? 0);
    out[k] = v;
  }
  if (size > MAX_SAVE_CHARS) {
    throw new GameSaveInputError("セーブが大きすぎる");
  }
  return out;
}

function newToken(): string {
  return randomBytes(18).toString("base64url");
}

/** 画面を開いたとき：新しい token を発行して（前の画面の token は無効になる）、預かっているセーブを返す */
export async function claimGameSave(
  userId: string,
  game: string,
): Promise<ClaimedSave> {
  const token = newToken();
  const [row] = await getDb()
    .insert(gameSaves)
    .values({ userId, game, activeToken: token })
    .onConflictDoUpdate({
      target: [gameSaves.userId, gameSaves.game],
      set: { activeToken: token },
    })
    .returning({ data: gameSaves.data, savedAt: gameSaves.savedAt });
  return { token, data: row?.data ?? null, savedAt: row?.savedAt ?? null };
}

/** 保存：token が今のものと同じときだけ書く。違えば false（別の画面が後から開かれた） */
export async function putGameSave(
  userId: string,
  game: string,
  token: string,
  data: GameSaveData,
): Promise<{ ok: true; savedAt: Date } | { ok: false }> {
  const rows = await getDb()
    .update(gameSaves)
    .set({ data, savedAt: sql`now()` })
    .where(
      and(
        eq(gameSaves.userId, userId),
        eq(gameSaves.game, game),
        eq(gameSaves.activeToken, token),
      ),
    )
    .returning({ savedAt: gameSaves.savedAt });
  const savedAt = rows[0]?.savedAt;
  return savedAt ? { ok: true, savedAt } : { ok: false };
}

/** 退会：アカウントを消す。session・account・game_saves は外部キーの連鎖で一緒に消える */
export async function deleteUserAccount(userId: string): Promise<void> {
  await getDb().delete(user).where(eq(user.id, userId));
}

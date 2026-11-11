"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { MarkdownBody } from "@/components/markdown-body";
import {
  deletePostAction,
  previewAction,
  type SaveState,
  savePostAction,
} from "./actions";

export type EditorValues = {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: "draft" | "scheduled" | "published";
  /** datetime-local の値（日本時間）。無ければ空文字 */
  publishedAt: string;
  tags: string;
};

const initialState: SaveState = { error: null };

export function PostEditor({ values }: { values: EditorValues }) {
  const [state, formAction, saving] = useActionState(
    savePostAction,
    initialState,
  );
  const [body, setBody] = useState(values.body);
  const [preview, setPreview] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 本文の入力が 0.4 秒止まったらプレビューを作り直す
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const html = await previewAction(body);
      if (!cancelled) setPreview(html);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [body]);

  return (
    <>
      {/* form の action に直接渡すと、送信後に React が入力欄を初期値へ戻す＝エラー時に書いた内容が消える。
          onSubmit から呼んでそれを避ける */}
      <form
        className="editor"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        {values.id && <input type="hidden" name="id" value={values.id} />}
        {state.error && <p className="error">{state.error}</p>}

        <div className="editor-fields">
          <label>
            タイトル
            <input name="title" defaultValue={values.title} required />
          </label>
          <label>
            slug（URL の末尾。半角英小文字・数字・ハイフン）
            <input
              name="slug"
              defaultValue={values.slug}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </label>
          <label>
            概要（一覧に出る1〜2文）
            <input name="excerpt" defaultValue={values.excerpt} />
          </label>
          <label>
            タグ（カンマ区切り）
            <input name="tags" defaultValue={values.tags} />
          </label>
          <div className="editor-row">
            <label>
              状態
              <select name="status" defaultValue={values.status}>
                <option value="draft">下書き</option>
                <option value="scheduled">予約公開</option>
                <option value="published">公開</option>
              </select>
            </label>
            <label>
              公開日時（日本時間。公開で空なら保存した時刻）
              <input
                type="datetime-local"
                name="publishedAt"
                defaultValue={values.publishedAt}
              />
            </label>
          </div>
        </div>

        <div className="editor-panes">
          <label className="editor-body">
            本文（Markdown）
            <textarea
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={24}
            />
          </label>
          <div className="editor-preview">
            <span className="muted">プレビュー</span>
            <MarkdownBody html={preview} />
          </div>
        </div>

        <p>
          <button type="submit" className="button" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </p>
      </form>

      {values.id && (
        <form action={deletePostAction} className="editor-delete">
          <input type="hidden" name="id" value={values.id} />
          {confirmDelete ? (
            <>
              <span className="error">削除すると元に戻せない。</span>
              <button type="submit" className="button">
                削除する
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => setConfirmDelete(false)}
              >
                やめる
              </button>
            </>
          ) : (
            <button
              type="button"
              className="link-button"
              onClick={() => setConfirmDelete(true)}
            >
              この記事を削除…
            </button>
          )}
        </form>
      )}
    </>
  );
}

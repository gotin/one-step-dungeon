// 手元の Markdown で記事を書いて投稿する CLI（DESIGN.md §6・§7）。サイトの API（/api/cli/）を通す。
//
//   npm run post push <file.md> [...]   slug をキーに作成または更新する
//   npm run post pull <slug>            drafts/<slug>.md に書き出す
//   npm run post -- pull <slug> --force 既にあっても上書きする（-- が無いと npm が --force を自分の設定として食べる）
//   npm run post delete <slug>          記事を消す（版・転送も消える。画像は残る）
//   npm run export [dir]                全記事を dir（既定 content-backup/）へ書き出す
//
// 送り先と認証：既定は開発サーバ（http://localhost:3000）と .env.development.local の ADMIN_API_TOKEN。
// 本番へは POST_ENV_FILE=<env ファイル> で、POST_API_URL と ADMIN_API_TOKEN を書いたファイルを渡す。
// 本文中のローカル画像（![...](./a.png)）は push の前に Vercel Blob へ上げ、元のファイルの中も URL に書き換える
// （次の push で同じ画像を二重に上げないため）。Blob のトークンは .env.local の BLOB_READ_WRITE_TOKEN。
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { put } from "@vercel/blob";
import { parse, stringify } from "yaml";

type PostStatus = "draft" | "scheduled" | "published";
type PostJson = {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  status: PostStatus;
  publishedAt: string | null;
  updatedAt?: string;
  body: string;
};

const envFile = process.env.POST_ENV_FILE ?? ".env.development.local";
// 先に読んだ値が優先される（process.loadEnvFile は既にある変数を上書きしない）
process.loadEnvFile(envFile);
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const API_URL = (process.env.POST_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const TOKEN = process.env.ADMIN_API_TOKEN;

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function fail(message: string): never {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  if (!TOKEN) fail(`${envFile} に ADMIN_API_TOKEN がない`);
  try {
    return await fetch(`${API_URL}/api/cli/${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    fail(`${API_URL} につながらない（開発サーバは起動している？）`);
  }
}

async function errorText(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  return `${res.status} ${data?.error ?? res.statusText}`;
}

// ---- Markdown ⇔ 記事 ----

/** 日時を日本時間の ISO 8601 で書く（例: 2026-11-20T09:00:00+09:00） */
function toJstIso(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${jst.toISOString().slice(0, 19)}+09:00`;
}

function toMarkdown(post: PostJson): string {
  const front: Record<string, unknown> = {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    tags: post.tags,
    status: post.status,
  };
  if (post.publishedAt) front.published_at = toJstIso(post.publishedAt);
  const body = post.body.endsWith("\n") ? post.body : `${post.body}\n`;
  return `---\n${stringify(front)}---\n\n${body}`;
}

function fromMarkdown(text: string, file: string): PostJson {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) fail(`${file}：先頭に --- で囲んだ front matter が無い`);
  const front = (parse(match[1]) ?? {}) as Record<string, unknown>;
  const str = (key: string): string => {
    const value = front[key];
    if (value === undefined || value === null) return "";
    if (typeof value !== "string" && typeof value !== "number") {
      fail(`${file}：${key} は文字列で書く`);
    }
    return String(value);
  };
  const rawTags = front.tags ?? [];
  const tags = Array.isArray(rawTags)
    ? rawTags.map(String)
    : String(rawTags).split(",");
  const publishedAt = front.published_at;
  return {
    slug: str("slug"),
    title: str("title"),
    excerpt: str("excerpt"),
    tags: tags.map((t) => t.trim()).filter(Boolean),
    status: (str("status") || "draft") as PostStatus,
    publishedAt:
      publishedAt instanceof Date
        ? publishedAt.toISOString()
        : publishedAt
          ? String(publishedAt)
          : null,
    body: match[2].replace(/^\r?\n/, ""),
  };
}

// ---- 画像 ----

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;

/** 本文中のローカル画像を Blob へ上げて URL に置き換えた本文を返す */
async function uploadLocalImages(body: string, file: string): Promise<string> {
  const local = [...body.matchAll(IMAGE_PATTERN)]
    .map((m) => m[2])
    .filter(
      (src) =>
        !/^[a-z][a-z0-9+.-]*:/i.test(src) &&
        !src.startsWith("/") &&
        !src.startsWith("#"),
    );
  if (local.length === 0) return body;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    fail(
      ".env.local に BLOB_READ_WRITE_TOKEN がない（ローカル画像を上げられない）",
    );
  }
  const urls = new Map<string, string>();
  for (const src of new Set(local)) {
    const path = resolve(dirname(file), decodeURI(src));
    const type = IMAGE_TYPES[extname(path).toLowerCase()];
    if (!type) fail(`${src}：画像は PNG / JPEG / GIF / WebP / AVIF だけ`);
    if (!existsSync(path)) fail(`${src}：ファイルが無い（${path}）`);
    const data = readFileSync(path);
    if (data.length > MAX_IMAGE_BYTES) fail(`${src}：10MB を超えている`);
    const name = basename(path).replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await put(`posts/${name}`, data, {
      access: "public",
      contentType: type,
      addRandomSuffix: true,
    });
    urls.set(src, blob.url);
    console.log(`  画像を上げた: ${src} → ${blob.url}`);
  }
  return body.replace(
    IMAGE_PATTERN,
    (all, alt: string, src: string, title: string) => {
      const url = urls.get(src);
      return url ? `![${alt}](${url}${title})` : all;
    },
  );
}

// ---- コマンド ----

async function push(files: string[]): Promise<void> {
  if (files.length === 0) fail("push するファイルを指定する");
  for (const file of files) {
    if (!existsSync(file)) fail(`${file} が無い`);
    const text = readFileSync(file, "utf8");
    const post = fromMarkdown(text, file);
    if (!post.slug) fail(`${file}：slug が無い`);
    const body = await uploadLocalImages(post.body, file);
    if (body !== post.body) {
      // 上げた画像の URL を原稿にも残す（本文の部分だけを置き換える）
      writeFileSync(file, text.slice(0, text.length - post.body.length) + body);
      post.body = body;
    }
    const res = await api(`posts/${encodeURIComponent(post.slug)}/`, {
      method: "PUT",
      body: JSON.stringify(post),
    });
    if (!res.ok) fail(`${file}：${await errorText(res)}`);
    const data = (await res.json()) as { created: boolean; post: PostJson };
    console.log(
      `${data.created ? "作成" : "更新"}: ${data.post.slug}（${data.post.status}）← ${file}`,
    );
  }
}

async function pull(args: string[]): Promise<void> {
  const force = args.includes("--force");
  const slug = args.find((a) => !a.startsWith("--"));
  if (!slug) fail("pull する slug を指定する");
  const res = await api(`posts/${encodeURIComponent(slug)}/`);
  if (!res.ok) fail(`${slug}：${await errorText(res)}`);
  const { post } = (await res.json()) as { post: PostJson };
  const out = join("drafts", `${post.slug}.md`);
  if (existsSync(out) && !force)
    fail(
      `${out} が既にある（上書きするなら npm run post -- pull ${slug} --force）`,
    );
  mkdirSync("drafts", { recursive: true });
  writeFileSync(out, toMarkdown(post));
  console.log(`書き出した: ${out}`);
}

async function exportAll(args: string[]): Promise<void> {
  const dir = args[0] ?? "content-backup";
  const res = await api("posts/");
  if (!res.ok) fail(await errorText(res));
  const { posts } = (await res.json()) as { posts: PostJson[] };
  mkdirSync(dir, { recursive: true });
  const marker = join(dir, ".small-isle-export");
  const names = new Set(posts.map((p) => `${p.slug}.md`));
  // DB から消えた記事のファイルは消す（書き出し先は DB の写しなので）。
  // ただし前にこのコマンドで書き出した場所（目印のファイルがある）だけ＝無関係の .md を消さない
  if (existsSync(marker)) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".md") && !names.has(name)) rmSync(join(dir, name));
    }
  } else if (readdirSync(dir).some((n) => n.endsWith(".md"))) {
    fail(
      `${dir}/ に別の .md がある。空のディレクトリか、前に export した場所を指定する`,
    );
  }
  writeFileSync(
    marker,
    "npm run export の書き出し先。DB から消えた記事の .md はここから消える\n",
  );
  for (const post of posts)
    writeFileSync(join(dir, `${post.slug}.md`), toMarkdown(post));
  console.log(`${posts.length} 件を ${dir}/ に書き出した`);
}

const [command, ...rest] = process.argv.slice(2);
console.log(`送り先: ${API_URL}`);
switch (command) {
  case "push":
    await push(rest);
    break;
  case "pull":
    await pull(rest);
    break;
  case "delete": {
    const slug = rest[0];
    if (!slug) fail("delete する slug を指定する");
    const res = await api(`posts/${encodeURIComponent(slug)}/`, {
      method: "DELETE",
    });
    if (!res.ok) fail(`${slug}：${await errorText(res)}`);
    console.log(`削除: ${slug}`);
    break;
  }
  case "export":
    await exportAll(rest);
    break;
  default:
    fail(
      "使い方: npm run post push <file.md> | pull <slug> | delete <slug> | export [dir]",
    );
}

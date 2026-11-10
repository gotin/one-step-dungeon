import type { Metadata } from "next";
import { PostList } from "@/components/post-list";
import { listPublishedPosts } from "@/server/posts";

export const metadata: Metadata = { title: "Blog" };

export default async function BlogPage() {
  const posts = await listPublishedPosts();
  return (
    <>
      <h1>Blog</h1>
      <PostList posts={posts} />
    </>
  );
}

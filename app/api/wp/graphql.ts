import { GraphQLClient, gql } from "graphql-request";
import { GRAPHQL_URL, WP_URL } from "./config";
import { wpFetchHeaders, wpHttpFetch } from "./http";
import type { WpPost } from "./types";

const POSTS_QUERY = gql`
  query MigratePosts($after: String) {
    posts(first: 100, after: $after, where: { status: PUBLISH }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        databaseId
        slug
        status
        date
        modified
        title
        excerpt
        uri
        featuredImage {
          node {
            databaseId
          }
        }
        categories {
          nodes {
            databaseId
          }
        }
        tags {
          nodes {
            databaseId
          }
        }
      }
    }
  }
`;

const PAGES_QUERY = gql`
  query MigratePages($after: String) {
    pages(first: 100, after: $after, where: { status: PUBLISH }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        databaseId
        slug
        status
        date
        modified
        title
        excerpt
        uri
        featuredImage {
          node {
            databaseId
          }
        }
      }
    }
  }
`;

interface GraphQLNode {
  databaseId: number;
  slug: string;
  status: string;
  date: string;
  modified: string;
  title: string;
  content: string;
  excerpt: string;
  uri?: string;
  featuredImage?: { node?: { databaseId: number } };
  categories?: { nodes: { databaseId: number }[] };
  tags?: { nodes: { databaseId: number }[] };
}

function nodeToPost(node: GraphQLNode, type: "post" | "page"): WpPost {
  return {
    id: node.databaseId,
    slug: node.slug,
    status: node.status.toLowerCase(),
    type,
    link: node.uri ? `${WP_URL.replace(/\/$/, "")}${node.uri}` : "",
    date: node.date,
    modified: node.modified,
    title: { rendered: node.title },
    content: { rendered: "" },
    excerpt: { rendered: node.excerpt },
    featured_media: node.featuredImage?.node?.databaseId ?? 0,
    categories: node.categories?.nodes.map((c) => c.databaseId),
    tags: node.tags?.nodes.map((t) => t.databaseId),
  };
}

type PostsQueryResult = {
  posts: {
    pageInfo: { hasNextPage: boolean; endCursor: string };
    nodes: GraphQLNode[];
  };
};

type PagesQueryResult = {
  pages: {
    pageInfo: { hasNextPage: boolean; endCursor: string };
    nodes: GraphQLNode[];
  };
};

async function paginatePosts(client: GraphQLClient): Promise<WpPost[]> {
  const all: WpPost[] = [];
  let after: string | null = null;

  for (;;) {
    const data: PostsQueryResult = await client.request<PostsQueryResult>(
      POSTS_QUERY,
      { after },
    );

    all.push(...data.posts.nodes.map((n) => nodeToPost(n, "post")));
    if (!data.posts.pageInfo.hasNextPage) break;
    after = data.posts.pageInfo.endCursor;
  }

  return all;
}

async function paginatePages(client: GraphQLClient): Promise<WpPost[]> {
  const all: WpPost[] = [];
  let after: string | null = null;

  for (;;) {
    const data: PagesQueryResult = await client.request<PagesQueryResult>(
      PAGES_QUERY,
      { after },
    );

    all.push(...data.pages.nodes.map((n) => nodeToPost(n, "page")));
    if (!data.pages.pageInfo.hasNextPage) break;
    after = data.pages.pageInfo.endCursor;
  }

  return all;
}

/** Returns posts/pages from WPGraphQL when the plugin is installed; otherwise null. */
export async function fetchContentViaGraphQL(): Promise<{
  posts: WpPost[];
  pages: WpPost[];
} | null> {
  try {
    const client = new GraphQLClient(GRAPHQL_URL, {
      headers: Object.fromEntries(
        wpFetchHeaders({ "Content-Type": "application/json" }).entries(),
      ),
    });

    const [posts, pages] = await Promise.all([
      paginatePosts(client),
      paginatePages(client),
    ]);

    return { posts, pages };
  } catch (err) {
    console.warn("  ⚠ WPGraphQL failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function isGraphQLAvailable(): Promise<boolean> {
  try {
    const res = await wpHttpFetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

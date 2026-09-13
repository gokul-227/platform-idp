import type { ApiResponse } from "@ory/client-fetch";

/**
 * Rows per request. A screenful rather than a ceiling: the next page is one
 * token away, so there is nothing to gain from a page nobody scrolls.
 */
export const PAGE_SIZE = 50;

/**
 * The page tokens walked to reach the current page, oldest first: the last
 * addresses what is on screen. The whole trail, because neither admin API sends a
 * `rel="prev"` and Hydra's tokens are opaque, so remembering it is the only way
 * back.
 */
export const PAGE_PARAM = "pages";

export interface ListPage<T> {
  items: T[];
  /** Absent on the last page: both APIs omit `rel="next"` there. */
  nextToken: string | undefined;
}

const LINK_ENTRY = /<(?<url>[^>]+)>;\s*rel="(?<rel>[^"]+)"/g;

export function readTrail(value: string | undefined): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

/**
 * One page of an Ory list. The next page's token arrives in the `Link` header
 * and nowhere in the body, so this reads the raw response the parsed SDK call
 * throws away.
 */
export async function readPage<T>(
  request: Promise<ApiResponse<T[]>>
): Promise<ListPage<T>> {
  const response = await request;
  return {
    items: await response.value(),
    nextToken: nextTokenOf(response.raw.headers.get("link")),
  };
}

function nextTokenOf(link: string | null): string | undefined {
  if (!link) {
    return;
  }
  for (const entry of link.matchAll(LINK_ENTRY)) {
    const url = entry.groups?.url;
    if (entry.groups?.rel === "next" && url) {
      // Both APIs answer with a path, not an absolute URL.
      return (
        new URL(url, "http://ory.invalid").searchParams.get("page_token") ??
        undefined
      );
    }
  }
  return;
}

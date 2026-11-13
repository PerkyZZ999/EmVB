/**
 * W-1026: the site's own menus (EmDash's, which its WordPress import fills) as the links an
 * imported Elementor Nav Menu needs. Menus need `menus:read`; a link to a page or post is
 * resolved to its address through the content API.
 */
import type { MenuLink } from "../core/import/elementor/context.ts";
import { requestJson, type Fetcher } from "./api.ts";

type MenuSummary = { name: string; label?: string | null };
type MenuItem = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  type: string;
  referenceCollection: string | null;
  referenceId: string | null;
  customUrl: string | null;
  label: string;
  target: string | null;
};

/** A menu name as WordPress writes its slug: lower case, words joined by hyphens. */
export const menuKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Where a menu item goes: its own address, or the page or post it points at. */
async function itemHref(
  fetcher: Fetcher,
  item: MenuItem,
  slugs: Map<string, Promise<string | undefined>>,
): Promise<string | undefined> {
  if (item.customUrl) return item.customUrl;
  if (!item.referenceCollection || !item.referenceId) return undefined;
  const key = `${item.referenceCollection}/${item.referenceId}`;
  let slug = slugs.get(key);
  if (!slug) {
    slug = requestJson<{ item?: { slug?: string | null } }>(
      fetcher,
      `/_emdash/api/content/${encodeURIComponent(item.referenceCollection)}/${encodeURIComponent(item.referenceId)}`,
    ).then(
      (data) => data.item?.slug ?? undefined,
      () => undefined,
    );
    slugs.set(key, slug);
  }
  const found = await slug;
  if (found === undefined) return undefined;
  return item.referenceCollection === "pages"
    ? `/${found}`
    : `/${item.referenceCollection}/${found}`;
}

/** A menu's flat items as nested links, in the menu's order. */
async function menuLinks(fetcher: Fetcher, items: readonly MenuItem[]): Promise<MenuLink[]> {
  const slugs = new Map<string, Promise<string | undefined>>();
  const hrefs = new Map(
    await Promise.all(
      items.map(async (item) => [item.id, await itemHref(fetcher, item, slugs)] as const),
    ),
  );
  const under = (parent: string | null): MenuLink[] =>
    items
      .filter((item) => item.parentId === parent)
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => {
        const link: { -readonly [K in keyof MenuLink]: MenuLink[K] } = { text: item.label };
        const href = hrefs.get(item.id);
        const children = under(item.id);
        if (href) link.href = href;
        if (item.target === "_blank") link.newTab = true;
        if (children.length > 0) link.children = children;
        return link;
      });
  return under(null);
}

/**
 * The links of each wanted menu the site has, by the wanted name. A site menu matches by its
 * name or label written as a slug. Menus the site doesn't have (or can't be read) are left out.
 */
export async function loadSiteMenus(
  fetcher: Fetcher,
  wanted: readonly string[],
): Promise<Map<string, MenuLink[]>> {
  const found = new Map<string, MenuLink[]>();
  if (wanted.length === 0) return found;
  let menus: MenuSummary[];
  try {
    menus = await requestJson<MenuSummary[]>(fetcher, "/_emdash/api/menus");
  } catch {
    return found;
  }
  await Promise.all(
    wanted.map(async (name) => {
      const key = menuKey(name);
      const menu = menus.find((m) => menuKey(m.name) === key || menuKey(m.label ?? "") === key);
      if (!menu) return;
      try {
        const full = await requestJson<{ items?: MenuItem[] }>(
          fetcher,
          `/_emdash/api/menus/${encodeURIComponent(menu.name)}`,
        );
        found.set(name, await menuLinks(fetcher, full.items ?? []));
      } catch {
        // Unreadable: the import leaves that Menu empty and says so.
      }
    }),
  );
  return found;
}

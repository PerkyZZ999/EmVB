import * as React from "react";
import {
  collectLoopItemPartIds,
  collectSectionPartIds,
  type Layout,
  type ThemePartType,
} from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { listThemeParts, themePartLayout } from "../theme-api.ts";

const MAX_DEPTH = 8;

/**
 * Loads section parts one depth at a time. Siblings load together. A part that fails is left out;
 * the ones that loaded stay.
 */
export async function loadSectionTemplates(
  fetcher: Fetcher,
  ids: readonly string[],
  read: (id: string) => Promise<Layout | null> = (id) => themePartLayout(fetcher, id, "section"),
): Promise<Record<string, Layout>> {
  const acc: Record<string, Layout> = {};
  const walk = async (next: readonly string[], depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    const pending = next.filter((id) => !acc[id]);
    if (pending.length === 0) return;
    const loaded = await Promise.all(
      pending.map(async (id) => {
        try {
          return [id, await read(id)] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    );
    const nested: string[] = [];
    for (const [id, part] of loaded) {
      if (!part || acc[id]) continue;
      acc[id] = part;
      nested.push(...collectSectionPartIds(part));
    }
    await walk(nested, depth + 1);
  };
  await walk(ids, 0);
  return acc;
}

export interface PartTemplates {
  sectionTemplates: Record<string, Layout>;
  loopTemplates: Record<string, Layout>;
  /** W-970: each loaded part's publish state ("published", "changed", "draft"…). */
  partStatus?: Record<string, string>;
}

const MAX_PARTS = 64;

function partRefs(part: Layout): Array<[string, "section" | "loop_item"]> {
  return [
    ...collectSectionPartIds(part).map((id) => [id, "section"] as [string, "section"]),
    ...collectLoopItemPartIds(part).map((id) => [id, "loop_item"] as [string, "loop_item"]),
  ];
}

/**
 * W-658: synced sections and Loop Item parts referenced by the open layout, following parts nested
 * in either kind (a Loop inside a section, a section or Loop inside a loop item). The canvas used to
 * load only sections, so a Loop with a chosen Loop Item showed "Choose a Loop Item" instead of it.
 */
export async function loadPartTemplates(
  fetcher: Fetcher,
  layout: Layout,
  read: (id: string, kind: ThemePartType) => Promise<Layout | null> = (id, kind) =>
    themePartLayout(fetcher, id, kind),
): Promise<PartTemplates> {
  const out: PartTemplates = { sectionTemplates: {}, loopTemplates: {} };
  const seen = new Set<string>();
  let next = partRefs(layout);
  for (let depth = 0; depth <= MAX_DEPTH && next.length > 0; depth++) {
    const pending = next.filter(([id, kind]) => {
      const key = `${kind}\0${id}`;
      if (seen.has(key) || seen.size >= MAX_PARTS) return false;
      seen.add(key);
      return true;
    });
    // Each depth waits on the one before it: its ids come from the parts just read.
    // oxlint-disable-next-line no-await-in-loop
    const loaded = await Promise.all(
      pending.map(async ([id, kind]) => {
        try {
          return [id, kind, await read(id, kind)] as const;
        } catch {
          return [id, kind, null] as const;
        }
      }),
    );
    next = [];
    for (const [id, kind, part] of loaded) {
      if (!part) continue;
      (kind === "section" ? out.sectionTemplates : out.loopTemplates)[id] = part;
      next.push(...partRefs(part));
    }
  }
  return out;
}

function partKey(layout: Layout | null): string {
  if (!layout) return "";
  const s = collectSectionPartIds(layout);
  const l = collectLoopItemPartIds(layout);
  return s.length + l.length === 0 ? "" : JSON.stringify([s, l]);
}

const NO_PARTS: PartTemplates = { sectionTemplates: {}, loopTemplates: {} };

/** Section and Loop Item parts for the canvas (W-658). */
export function usePartTemplates(layout: Layout | null, fetcher: Fetcher): PartTemplates {
  const key = partKey(layout);
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  const [templates, setTemplates] = React.useState<PartTemplates>(NO_PARTS);

  React.useEffect(() => {
    const current = layoutRef.current;
    if (!key || !current) {
      setTemplates(NO_PARTS);
      return;
    }
    let cancelled = false;
    void Promise.all([
      loadPartTemplates(fetcher, current),
      // W-970: the canvas draws parts' latest saved version; the list says which are published.
      listThemeParts(fetcher).catch(() => []),
    ]).then(
      ([acc, parts]) => {
        if (cancelled) return;
        const loaded = new Set([
          ...Object.keys(acc.sectionTemplates),
          ...Object.keys(acc.loopTemplates),
        ]);
        const partStatus = Object.fromEntries(
          parts.filter((part) => loaded.has(part.id)).map((part) => [part.id, part.status]),
        );
        setTemplates({ ...acc, partStatus });
      },
      () => {
        if (!cancelled) setTemplates(NO_PARTS);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, fetcher]);

  return templates;
}

/** W-970: the canvas label's suffix for a part visitors don't see as drawn. */
export const partDraftLabel = (status: string): string =>
  status === "changed"
    ? "unpublished changes"
    : status === "scheduled"
      ? "scheduled"
      : "not published";

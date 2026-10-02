import * as React from "react";
import { collectSectionPartIds, type Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { themePartLayout } from "../theme-api.ts";

const MAX_DEPTH = 8;

/** Section theme parts referenced by the open layout, so the canvas shows the synced contents. */
export function useSectionTemplates(
  layout: Layout | null,
  fetcher: Fetcher,
): Record<string, Layout> {
  const key = layout ? collectSectionPartIds(layout).join("\0") : "";
  const [templates, setTemplates] = React.useState<Record<string, Layout>>({});

  React.useEffect(() => {
    const ids = key ? key.split("\0") : [];
    if (ids.length === 0) {
      setTemplates({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const acc: Record<string, Layout> = {};
      const walk = async (next: string[], depth: number) => {
        if (depth > MAX_DEPTH) return;
        for (const id of next) {
          if (acc[id]) continue;
          // Each nested section id comes from the part just loaded.
          // oxlint-disable-next-line no-await-in-loop
          const part = await themePartLayout(fetcher, id, "section");
          if (!part) continue;
          acc[id] = part;
          // oxlint-disable-next-line no-await-in-loop
          await walk(collectSectionPartIds(part), depth + 1);
        }
      };
      await walk(ids, 0);
      if (!cancelled) setTemplates(acc);
    };
    void load().catch(() => {
      if (!cancelled) setTemplates({});
    });
    return () => {
      cancelled = true;
    };
  }, [key, fetcher]);

  return templates;
}

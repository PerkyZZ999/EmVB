import * as React from "react";
import type { createKumoToastManager } from "@cloudflare/kumo";
import type { DesignSystem } from "../../core/index.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { previewUrl, saveDesign } from "../content-api.ts";
import { readCollection } from "../setup/run.ts";
import { isDirty, type EditorAction, type EditorState } from "./store.ts";
import type { useSave } from "./useSave.ts";

const publicPath = (pattern: string | null | undefined, slug: string) =>
  (pattern || "/{slug}").replace("{slug}", encodeURIComponent(slug));

/**
 * Opens a tab synchronously (so pop-up blockers allow it), then points it at `url` when known.
 * `url` resolves null when it already told the user why (a failed save); a throw goes to `onError`.
 */
export async function openInNewTab(
  url: () => Promise<string | null>,
  onError: (error: unknown) => void,
) {
  const tab = window.open("", "_blank");
  const target = await url().catch((error: unknown) => {
    onError(error);
    return null;
  });
  if (!tab) return;
  if (!target) return tab.close();
  tab.opener = null;
  tab.location.href = target;
}

/** Persistence commands: save, publish, preview and site-styles save (with the busy flag). */
export function useEditorCommands({
  fetcher,
  collection,
  latest,
  dispatch,
  saver,
  toasts,
}: {
  fetcher: Fetcher;
  collection: string;
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
  saver: ReturnType<typeof useSave>;
  toasts: ReturnType<typeof createKumoToastManager>;
}) {
  const [busy, setBusy] = React.useState<"save" | "publish" | null>(null);

  const save = async () => {
    setBusy("save");
    try {
      return await saver.save();
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setBusy("publish");
    try {
      if (!(await saver.publish())) return;
    } finally {
      setBusy(null);
    }
    if (collection === THEME_PARTS_COLLECTION) {
      toasts.add({ title: "Published" });
      return;
    }
    const pattern = await readCollection(fetcher, PAGES_COLLECTION).then(
      (coll) => coll?.urlPattern,
      () => null,
    );
    const path = publicPath(pattern, latest.current.page.slug);
    toasts.add({
      title: "Published",
      actions: [
        {
          children: "View page ↗",
          variant: "secondary",
          onClick: () => window.open(path, "_blank", "noopener"),
        },
      ],
    });
  };

  const preview = () =>
    void openInNewTab(
      async () => {
        if (isDirty(latest.current) && !(await save())) return null;
        return previewUrl(fetcher, latest.current.id);
      },
      (error) =>
        toasts.add({
          title: "Couldn't open the preview",
          description: error instanceof Error ? error.message : String(error),
        }),
    );

  const changeDesign = async (next: DesignSystem) => {
    try {
      const revision = await saveDesign(fetcher, next, latest.current.designRevision);
      dispatch({ type: "set-design", design: next, revision });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        throw new Error(
          "Site styles were changed somewhere else. Reload the editor and try again.",
          { cause: error },
        );
      }
      throw new Error(
        error instanceof ApiError
          ? `Couldn't save site styles. ${error.message}`
          : "Couldn't save site styles. Check your connection and try again.",
        { cause: error },
      );
    }
  };

  return { busy, save, publish, preview, changeDesign };
}

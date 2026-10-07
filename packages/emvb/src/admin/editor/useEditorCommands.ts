import * as React from "react";
import type { createKumoToastManager } from "@cloudflare/kumo";
import { DEVICE_PREVIEW_PX, type DesignSystem, type PopupDevice } from "../../core/index.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { previewUrl, publishDesign, saveDesign } from "../content-api.ts";
import { readCollection } from "../setup/run.ts";
import { isDirty, type EditorAction, type EditorState } from "./store.ts";
import { loadDesign } from "./useEditorData.ts";
import type { useSave } from "./useSave.ts";

const publicPath = (pattern: string | null | undefined, slug: string) =>
  (pattern || "/{slug}").replace("{slug}", encodeURIComponent(slug));

/** Window heights for the sized Tablet and Mobile previews (W-158); widths are the canvas's. */
const PREVIEW_HEIGHT = { tablet: 1024, mobile: 844 } as const;

/**
 * `window.open` features for a device preview (W-158): Desktop is an ordinary tab; Tablet and
 * Mobile open a window whose page area is the device width, so the page's own media queries apply.
 */
export function previewWindowFeatures(device: PopupDevice): string | undefined {
  if (device === "desktop") return undefined;
  return `popup,width=${DEVICE_PREVIEW_PX[device]},height=${PREVIEW_HEIGHT[device]}`;
}

/**
 * Opens a tab synchronously (so pop-up blockers allow it), then points it at `url` when known.
 * `url` resolves null when it already told the user why (a failed save); a throw goes to `onError`.
 * `features` opens a sized window instead of a tab (W-158).
 */
export async function openInNewTab(
  url: () => Promise<string | null>,
  onError: (error: unknown) => void,
  features?: string,
) {
  const tab = features ? window.open("", "_blank", features) : window.open("", "_blank");
  const target = await url().catch((error: unknown) => {
    onError(error);
    return null;
  });
  if (!tab) return;
  if (!target) return tab.close();
  tab.opener = null;
  tab.location.href = target;
}

const STYLES_PENDING =
  "Site styles have unpublished changes, so the public page may look unstyled until you publish styles.";

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
    // W-126: unpublished site styles (a new colour variable, a class) are not on the public
    // page yet, so it can look unstyled. Say so and offer to publish them.
    const stylesPending = latest.current.designUnpublished === true;
    toasts.add({
      title: "Published",
      ...(stylesPending ? { description: STYLES_PENDING } : {}),
      actions: [
        ...(stylesPending
          ? [
              {
                children: "Publish site styles",
                variant: "primary" as const,
                onClick: () =>
                  void publishStyles().then(
                    () => toasts.add({ title: "Site styles published" }),
                    (error: unknown) =>
                      toasts.add({
                        title: "Couldn't publish site styles",
                        description: error instanceof Error ? error.message : String(error),
                      }),
                  ),
              },
            ]
          : []),
        {
          children: "View page ↗",
          variant: "secondary",
          onClick: () => window.open(path, "_blank", "noopener"),
        },
      ],
    });
  };

  const preview = (device: PopupDevice = "desktop") =>
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
      previewWindowFeatures(device),
    );

  const changeDesign = async (next: DesignSystem) => {
    try {
      const revision = await saveDesign(fetcher, next, latest.current.designRevision);
      dispatch({ type: "set-design", design: next, revision });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // W-212: take the styles saved elsewhere (another editor tab, say), so the next change
        // can save, instead of every change failing until a reload that drops page edits.
        try {
          const fresh = await loadDesign(fetcher);
          dispatch({ type: "load-design", ...fresh });
        } catch {
          throw new Error(
            "Site styles were changed somewhere else. Reload the editor and try again.",
            { cause: error },
          );
        }
        throw new Error(
          "Site styles were changed in another tab or window. The latest styles are loaded now: make your change again.",
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

  const publishStyles = async () => {
    try {
      const revision = await publishDesign(fetcher, latest.current.publishedRevision ?? null);
      dispatch({ type: "publish-design", revision });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // W-212: as for a save, take what the other tab published so Publish can work again.
        try {
          const fresh = await loadDesign(fetcher);
          dispatch({ type: "load-design", ...fresh });
        } catch {
          throw new Error(
            "Site styles were published somewhere else. Reload the editor and try again.",
            { cause: error },
          );
        }
        throw new Error(
          "Site styles were published in another tab or window. The latest styles are loaded now: check them, then publish again.",
          { cause: error },
        );
      }
      throw new Error(
        error instanceof ApiError
          ? `Couldn't publish site styles. ${error.message}`
          : "Couldn't publish site styles. Check your connection and try again.",
        { cause: error },
      );
    }
  };

  return { busy, save, publish, preview, changeDesign, publishStyles };
}

import * as React from "react";
import type { createKumoToastManager } from "@cloudflare/kumo";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import {
  DEVICE_PREVIEW_PX,
  mergeDesign,
  type DesignSystem,
  type PopupDevice,
} from "../../core/index.ts";
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
          // UX-082: an icon, not "↗" read aloud as an arrow; the new tab is said in words.
          children: React.createElement(
            React.Fragment,
            null,
            "View page",
            React.createElement(ArrowSquareOutIcon, { "aria-hidden": true, size: 14 }),
            React.createElement("span", { className: "emvb-sr-only" }, " (opens in a new tab)"),
          ),
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

  // W-325: design saves run one at a time, each against the newest revision, like page saves.
  // Two quick edits used to both send the revision the editor started with, so the second one
  // was refused with a 409 by the first. `written` remembers the revision the last save produced
  // until the store catches up (the ref updates on the next render).
  const designQueue = React.useRef<Promise<unknown>>(Promise.resolve());
  // W-536: every revision this tab's run of saves went through, not just the last one. The store
  // can render an older one of them mid-run (save 1's revision while save 2 is out), which used
  // to send that stale revision with save 3 and get a 409.
  const written = React.useRef<{ chain: Set<string | null>; to: string } | null>(null);
  const baseRevision = () => {
    const current = latest.current.designRevision;
    const last = written.current;
    return last && last.chain.has(current) ? last.to : current;
  };
  const wrote = (sent: string | null, revision: string) => {
    const chain = written.current?.chain.has(sent) ? written.current.chain : new Set([sent]);
    // What the store shows now is behind this save too.
    chain.add(latest.current.designRevision);
    chain.add(revision);
    written.current = { chain, to: revision };
  };
  const queueDesign = <T>(task: () => Promise<T>): Promise<T> => {
    const run = designQueue.current.then(task, task);
    designQueue.current = run.catch(() => undefined);
    return run;
  };

  // W-536: the newest edit, shown at once. Each edit is built from the `design` the panels render,
  // which used to change only after the save came back, so a second quick edit to the same
  // class (Opacity, then Add shadow) was built without the first and saved over it.
  const shownDesign = React.useRef<DesignSystem | null>(null);
  const changeDesign = (next: DesignSystem) => {
    const base = latest.current.design;
    shownDesign.current = next;
    dispatch({ type: "preview-design", design: next });
    return queueDesign(() => saveDesignNow(next, base));
  };

  const saveDesignNow = async (next: DesignSystem, base: DesignSystem) => {
    try {
      const sent = baseRevision();
      const revision = await saveDesign(fetcher, next, sent);
      wrote(sent, revision);
      // A newer edit waiting in the queue stays on screen; its own save follows.
      dispatch({ type: "set-design", design: shownDesign.current ?? next, revision });
      if (shownDesign.current === next) shownDesign.current = null;
    } catch (error) {
      written.current = null;
      // A newer edit already on screen was built on this one, so it stays shown (W-536).
      const newer =
        shownDesign.current !== null && shownDesign.current !== next ? shownDesign.current : null;
      const settled = () => {
        if (!newer) shownDesign.current = null;
      };
      // Take back an edit that didn't save, unless a newer one is already on screen.
      const takeBack = () => {
        if (shownDesign.current !== next) return;
        shownDesign.current = null;
        dispatch({ type: "preview-design", design: base });
      };
      if (error instanceof ApiError && error.status === 409) {
        // W-333: replay this tab's edit onto the styles saved elsewhere when those keys
        // were not also changed there. A real clash still loads the server copy (W-212).
        try {
          const fresh = await loadDesign(fetcher);
          const merged = mergeDesign(base, next, fresh.design);
          const names = merged.conflicts.map((conflict) => conflict.name).join(", ");
          if (merged.conflicts.length > 0) {
            shownDesign.current = null;
            dispatch({ type: "load-design", ...fresh });
            throw new Error(
              `Site styles were changed in another tab or window (${names}). The latest styles are loaded now: make your change again.`,
              { cause: error },
            );
          }
          const unchanged = JSON.stringify(merged.design) === JSON.stringify(fresh.design);
          if (unchanged) {
            dispatch({ type: "load-design", ...fresh, ...(newer ? { design: newer } : {}) });
            settled();
            return;
          }
          const revision = await saveDesign(fetcher, merged.design, fresh.revision);
          wrote(fresh.revision, revision);
          dispatch({ type: "set-design", design: newer ?? merged.design, revision });
          settled();
          return;
        } catch (retry) {
          if (
            retry instanceof Error &&
            retry.message.includes("The latest styles are loaded now")
          ) {
            throw retry;
          }
          takeBack();
          throw new Error(
            "Site styles were changed somewhere else. Reload the editor and try again.",
            { cause: retry },
          );
        }
      }
      takeBack();
      throw new Error(
        error instanceof ApiError
          ? `Couldn't save site styles. ${error.message}`
          : "Couldn't save site styles. Check your connection and try again.",
        { cause: error },
      );
    }
  };

  const publishStyles = () => queueDesign(publishStylesNow);

  const publishStylesNow = async () => {
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

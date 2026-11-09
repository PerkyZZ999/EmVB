import * as React from "react";
import { PLUGIN_ID } from "../../constants.ts";
import { requestJson, type Fetcher } from "../api.ts";

/** Matches the server's PRESENCE_LEASE_MS / 3 (W-929): two missed beats still leave it live. */
const PRESENCE_BEAT_MS = 30_000;
const ROUTE = `/_emdash/api/plugins/${PLUGIN_ID}/presence`;

const bodyOf = (collection: string, id: string, open: boolean) => ({
  target: { collection, id },
  open,
});

function sendPresence(
  fetcher: Fetcher,
  collection: string,
  id: string,
  open: boolean,
): Promise<unknown> {
  return requestJson(fetcher, ROUTE, { method: "POST", body: bodyOf(collection, id, open) });
}

/** The closing beat outlives the page (keepalive), so leaving the admin frees the page at once. */
function sendClosed(fetcher: Fetcher, collection: string, id: string): void {
  fetcher(ROUTE, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyOf(collection, id, false)),
  }).catch(() => undefined);
}

/**
 * W-929 (D-064): tells the site this page is open in the editor while it is, so an agent's direct
 * writes are refused and it proposes changes for review instead. Best effort: a failed beat only
 * means an agent may write directly, which the editor's remote-change notice (W-466) still reports.
 */
export function useEditorPresence(fetcher: Fetcher, collection: string, id: string): void {
  React.useEffect(() => {
    const beat = () => {
      sendPresence(fetcher, collection, id, true).catch(() => undefined);
    };
    const close = () => sendClosed(fetcher, collection, id);
    const show = () => {
      if (document.visibilityState === "visible") beat();
    };
    beat();
    const timer = setInterval(beat, PRESENCE_BEAT_MS);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", beat);
    document.addEventListener("visibilitychange", show);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", beat);
      document.removeEventListener("visibilitychange", show);
      close();
    };
  }, [fetcher, collection, id]);
}

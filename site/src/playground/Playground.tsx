import { Button, Dialog } from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  EyeIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import {
  createPage,
  listPages,
  type PageSummary,
} from "../../../packages/emvb/src/admin/content-api.ts";
import { Editor } from "../../../packages/emvb/src/admin/editor/Editor.tsx";
import {
  EditorHostContext,
  type EditorHost,
} from "../../../packages/emvb/src/admin/editor/host.ts";
import { BUTTON, SOLID_DESTRUCTIVE, UI_CSS } from "../../../packages/emvb/src/admin/ui.ts";
import { PAGES_COLLECTION } from "../../../packages/emvb/src/constants.ts";
import { starterLayout } from "../../../packages/emvb/src/core/index.ts";
import { createBackend, type KeyValueStore } from "./mock/backend.ts";
import { PreviewOverlay } from "./PreviewOverlay.tsx";
import { browserUploads } from "./uploads.ts";
import { exportPage } from "./view.ts";

/**
 * emvb.dev/playground: the real EmVB editor, running against an in-browser stand-in for EmDash.
 * Nothing leaves the browser; edits are kept in localStorage until Reset.
 */

const STARTER_ENTRY = "page-landing";
const SITE_HOME = "/";
/** The editor's own minimum (EDITOR_MIN_WIDTH_QUERY). Below it, the playground asks first. */
const SMALL_SCREEN = "(max-width: 1023px)";

function browserStorage(): KeyValueStore | null {
  try {
    const probe = "emvb-playground:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const host: EditorHost = {
  exit: () => window.location.assign(SITE_HOME),
  back: { label: "emvb.dev", go: () => window.location.assign(SITE_HOME) },
};

function useMatches(query: string): boolean {
  const [matches, setMatches] = React.useState(() => window.matchMedia(query).matches);
  React.useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

const entryFromUrl = () => new URLSearchParams(window.location.search).get("page") || STARTER_ENTRY;

/** Opens another page through a real navigation, so the editor's unsaved-changes guard asks. */
const openPage = (id: string) => {
  const url = new URL(window.location.href);
  if (id === STARTER_ENTRY) url.searchParams.delete("page");
  else url.searchParams.set("page", id);
  window.location.assign(url.toString());
};

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="currentColor" />
      <rect x="7" y="8" width="18" height="4" rx="1" fill="var(--color-kumo-base, #fff)" />
      <rect
        x="7"
        y="15"
        width="11"
        height="9"
        rx="1"
        fill="var(--color-kumo-base, #fff)"
        opacity="0.55"
      />
      <rect
        x="20"
        y="15"
        width="5"
        height="9"
        rx="1"
        fill="none"
        stroke="#0a5ce6"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function SmallScreenGate({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="pg-gate" data-pg-small-screen="">
      <div className="pg-gate-card">
        <Logo />
        <h1>The EmVB editor is best on a larger screen</h1>
        <p>
          It's a desktop page builder: layers on the left, the canvas in the middle and styles on
          the right. A window at least 1280 px wide works best.
        </p>
        <p>You can still look around here: the editor opens zoomed out.</p>
        <div className="pg-gate-actions">
          <Button variant="primary" onClick={onContinue}>
            Continue anyway
          </Button>
          <Button variant="secondary" onClick={host.back.go}>
            Back to emvb.dev
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResetDialog({
  open,
  onOpenChange,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <div data-emvb-dialog="playground-reset" className="emvb-dialog">
          <Dialog.Title>Reset the playground?</Dialog.Title>
          <Dialog.Description>
            Every page, site style and upload you made here is deleted from this browser, and the
            starter pages come back. This can't be undone.
          </Dialog.Description>
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON}>
                  Cancel
                </Button>
              )}
            />
            <Button
              variant="destructive"
              className={BUTTON}
              style={SOLID_DESTRUCTIVE}
              onClick={onReset}
            >
              Reset
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

export default function Playground() {
  const storage = React.useMemo(browserStorage, []);
  const backend = React.useMemo(
    () => createBackend({ storage, uploads: browserUploads(), latency: 120 }),
    [storage],
  );
  const [entryId, setEntryId] = React.useState(entryFromUrl);
  const [generation, setGeneration] = React.useState(0);
  const [pages, setPages] = React.useState<PageSummary[]>([]);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const small = useMatches(SMALL_SCREEN);
  const [continued, setContinued] = React.useState(false);

  React.useEffect(() => {
    const refresh = () => void listPages(backend.fetcher).then(setPages, () => setPages([]));
    refresh();
    return backend.subscribe(refresh);
  }, [backend]);

  // An unknown ?page= (a deleted page, an old link) opens the starter page instead.
  React.useEffect(() => {
    if (!backend.snapshot().entries.some((e) => e.id === entryId)) setEntryId(STARTER_ENTRY);
  }, [backend, entryId]);

  React.useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const continueSmall = () => {
    // A phone lays the page out 1280 px wide and zooms out, so the editor has the room it needs.
    document.querySelector('meta[name="viewport"]')?.setAttribute("content", "width=1280");
    setContinued(true);
  };

  const reset = () => {
    setResetOpen(false);
    backend.reset();
    setEntryId(STARTER_ENTRY);
    setGeneration((n) => n + 1);
    const url = new URL(window.location.href);
    url.searchParams.delete("page");
    window.history.replaceState(null, "", url);
    setNotice("The playground is back to its starter pages.");
  };

  const newPage = async () => {
    const taken = new Set(pages.map((p) => p.slug));
    let n = 1;
    while (taken.has(`untitled-page-${n}`)) n += 1;
    const title = `Untitled page ${n}`;
    try {
      const id = await createPage(backend.fetcher, {
        title,
        slug: `untitled-page-${n}`,
        layout: starterLayout(title),
      });
      openPage(id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const exportJson = () => {
    const file = exportPage(backend.snapshot(), entryId);
    if (!file) return;
    download(file.filename, file.json);
    setNotice(`Downloaded ${file.filename} (the last saved version of this page).`);
  };

  const current = pages.find((p) => p.id === entryId);
  const gated = small && !continued;

  return (
    <EditorHostContext.Provider value={host}>
      <div className="pg-bar" role="banner" data-pg-bar="">
        <a className="pg-brand" href={SITE_HOME} title="Back to emvb.dev">
          <Logo />
          <span>
            EmVB <span className="pg-brand-sub">playground</span>
          </span>
        </a>
        {!gated && (
          <>
            <div className="pg-sep" aria-hidden="true" />
            <label className="pg-page">
              <span className="pg-label">Page</span>
              <select
                value={entryId}
                onChange={(event) => openPage(event.target.value)}
                aria-label="Page to edit"
              >
                {current ? null : <option value={entryId}>Loading…</option>}
                {pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.title}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              className={BUTTON}
              icon={<PlusIcon aria-hidden="true" />}
              onClick={() => void newPage()}
            >
              New page
            </Button>
            <p className="pg-note" role="note">
              {storage
                ? "Your edits stay in this browser. Nothing is uploaded."
                : "This browser blocks storage: edits last until you close the tab."}
            </p>
            <div className="pg-actions">
              <Button
                variant="secondary"
                className={BUTTON}
                icon={<EyeIcon aria-hidden="true" />}
                onClick={() => setPreview(true)}
                title="See the page as visitors would, rendered by EmVB's public renderer"
              >
                Visitor view
              </Button>
              <Button
                variant="ghost"
                className={BUTTON}
                icon={<DownloadSimpleIcon aria-hidden="true" />}
                onClick={exportJson}
                title="Download this page's saved layout and the site styles as JSON"
              >
                Export JSON
              </Button>
              <Button
                variant="ghost"
                className={BUTTON}
                icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
                onClick={() => setResetOpen(true)}
              >
                Reset
              </Button>
            </div>
          </>
        )}
      </div>
      {notice && (
        <div className="pg-toast" role="status">
          {notice}
        </div>
      )}
      {gated ? (
        <SmallScreenGate onContinue={continueSmall} />
      ) : (
        <Editor
          key={`${entryId}:${generation}`}
          fetcher={backend.fetcher}
          entryId={entryId}
          collection={PAGES_COLLECTION}
        />
      )}
      <ResetDialog open={resetOpen} onOpenChange={setResetOpen} onReset={reset} />
      {preview && (
        <PreviewOverlay
          entryId={entryId}
          published={current?.status !== "draft"}
          onClose={() => setPreview(false)}
        />
      )}
    </EditorHostContext.Provider>
  );
}

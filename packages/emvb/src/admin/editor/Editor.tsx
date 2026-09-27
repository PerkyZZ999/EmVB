import { Banner, Button, Empty, Loader } from "@cloudflare/kumo";
import { ArrowLeftIcon, KeyboardIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import { renderPage } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { CanvasFrame } from "./canvas/CanvasFrame.tsx";
import { EditorOverlay } from "./EditorOverlay.tsx";
import { exitTarget, PAGES_URL } from "./exit.ts";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import { SmallScreenNotice } from "./SmallScreenNotice.tsx";
import { useEditorData, type EditorData } from "./useEditorData.ts";
import { EDITOR_MIN_WIDTH_QUERY, useMediaQuery } from "./useMediaQuery.ts";

/** The full-screen editor for one `emvb_pages` entry (R-001). Editing arrives in W-010. */
export function Editor({ fetcher, entryId }: { fetcher: Fetcher; entryId: string }) {
  const wideEnough = useMediaQuery(EDITOR_MIN_WIDTH_QUERY);
  const data = useEditorData(fetcher, entryId);
  const title = data.state === "ready" ? data.entry.title : "Page";
  return (
    <EditorOverlay label={`EmVB editor: ${title}`}>
      {wideEnough ? <EditorFrame data={data} /> : <SmallScreenNotice />}
    </EditorOverlay>
  );
}

const exit = () => window.location.assign(exitTarget(document.referrer, window.location.origin));

function EditorFrame({ data }: { data: EditorData }) {
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  return (
    <>
      <header className="emvb-topbar">
        <Button variant="ghost" icon={<ArrowLeftIcon aria-hidden="true" />} onClick={exit}>
          Exit
        </Button>
        {data.state === "ready" && (
          <>
            <span className="emvb-topbar-title">{data.entry.title}</span>
            <span className="emvb-status" data-status={data.entry.status}>
              <span className="emvb-status-dot" aria-hidden="true" />
              {data.entry.status === "published" ? "Published" : "Draft"}
            </span>
          </>
        )}
        <span className="emvb-topbar-spacer" />
        <Button
          variant="ghost"
          shape="square"
          aria-label="Keyboard shortcuts"
          icon={<KeyboardIcon aria-hidden="true" />}
          onClick={() => setShortcutsOpen(true)}
        />
      </header>
      <EditorBody data={data} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

function EditorBody({ data }: { data: EditorData }) {
  const rendered = React.useMemo(
    () =>
      data.state === "ready" && data.entry.layout
        ? renderPage(data.entry.layout, data.design, { mode: "editor" })
        : null,
    [data],
  );
  if (data.state === "loading") {
    return (
      <div className="emvb-state">
        <Loader />
      </div>
    );
  }
  if (data.state === "not-found" || data.state === "forbidden") {
    return (
      <div className="emvb-state" data-emvb-editor-state={data.state}>
        <Empty
          title={data.state === "not-found" ? "Page not found" : "You can't open this page"}
          description={
            data.state === "not-found"
              ? "It may have been deleted. Choose another page from Visual pages."
              : "Your role doesn't allow editing this page."
          }
          contents={<a href={PAGES_URL}>Go to Visual pages</a>}
        />
      </div>
    );
  }
  if (data.state === "error") {
    return (
      <div className="emvb-state" data-emvb-editor-state="error">
        <Banner
          variant="error"
          icon={<WarningCircleIcon aria-hidden="true" />}
          title="Couldn't open this page"
          description={data.message}
        />
      </div>
    );
  }
  return (
    <div className="emvb-frame">
      <aside className="emvb-panel emvb-panel-left" aria-label="Elements" />
      <main className="emvb-canvas">
        <CanvasFrame vnode={rendered?.vnode ?? null} css={rendered?.css ?? ""} />
      </main>
      <aside className="emvb-panel emvb-panel-right" aria-label="Page settings">
        <h2 className="emvb-panel-title">Page settings</h2>
      </aside>
    </div>
  );
}

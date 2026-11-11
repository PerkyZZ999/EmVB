import { Button, Loader } from "@cloudflare/kumo";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { canvasSources, exportSite } from "../export-api.ts";
import { downloadBlob } from "../image-editor/flatten.ts";
import { BUTTON } from "../ui.ts";

/**
 * W-977: Export HTML on an entry's Canvas card. Downloads the entry's published layout as a zip
 * of HTML and CSS, with the header, footer, popups and floats it shows, the same as Export pages
 * does for EmVB pages.
 */
export function ExportEntryHtml({
  fetcher,
  entry,
  origin = window.location.origin,
}: {
  fetcher: Fetcher;
  entry: { collection: string; id: string };
  origin?: string;
}) {
  const [state, setState] = React.useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "done" | "error"; message: string }
  >({ kind: "idle" });
  const run = async () => {
    setState({ kind: "busy" });
    try {
      const source = (await canvasSources(fetcher)).find((s) => s.collection === entry.collection);
      if (!source) {
        setState({ kind: "error", message: "This collection has no EmVB layout field to export." });
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      const result = await exportSite(fetcher, {
        source,
        onlyPageId: entry.id,
        copyMedia: true,
        origin,
        date,
      });
      const page = result.site.report.pages[0];
      if (!page) {
        setState({
          kind: "error",
          message:
            "Only the published version is exported, and this entry has no published layout yet. Publish it first.",
        });
        return;
      }
      downloadBlob(
        new Blob([result.zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
        `emvb-export-${page.path.replace(/\/$/, "")}-${date}.zip`,
      );
      setState({
        kind: "done",
        message:
          "Downloaded the published layout as HTML and CSS. EXPORT-REPORT.md in the zip lists what only works on the live site.",
      });
    } catch (error) {
      setState({
        kind: "error",
        message: `The export didn't finish: ${error instanceof Error ? error.message : String(error)}. Try again.`,
      });
    }
  };
  return (
    <>
      <Button
        variant="secondary"
        className={BUTTON}
        icon={
          state.kind === "busy" ? <Loader size={14} /> : <DownloadSimpleIcon aria-hidden="true" />
        }
        disabled={state.kind === "busy"}
        onClick={() => void run()}
        data-emvb-export-entry=""
      >
        Export HTML
      </Button>
      {(state.kind === "done" || state.kind === "error") && (
        <p
          className="emvb-canvas-convert-note"
          role={state.kind === "error" ? "alert" : "status"}
          data-emvb-export-entry-status={state.kind}
        >
          {state.message}
        </p>
      )}
    </>
  );
}

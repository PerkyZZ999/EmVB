import { Button, Checkbox, Dialog, Loader, Select } from "@cloudflare/kumo";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import type { PageSummary } from "../content-api.ts";
import { DialogCloseButton } from "../editor/DialogCloseButton.tsx";
import { useMediaQuery } from "../editor/useMediaQuery.ts";
import { exportSite, type ExportResult } from "../export-api.ts";
import { downloadBlob } from "../image-editor/flatten.ts";
import { BUTTON, FIELD, SOLID_PRIMARY, UI_CSS } from "../ui.ts";

const ALL = "__all__";

/** Opens Export as HTML (W-963), next to Import on the Pages list. */
export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      className={BUTTON}
      icon={<DownloadSimpleIcon aria-hidden="true" />}
      onClick={onClick}
      data-emvb-export-html=""
    >
      Export as HTML
    </Button>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the finished export holds, in a sentence or two. */
function exportSummary(result: ExportResult): string {
  const { report } = result.site;
  const parts = [`Downloaded ${plural(report.pages.length, "page")}.`];
  if (report.skipped.length > 0)
    parts.push(
      `${plural(report.skipped.length, "page")} couldn't be read and ${report.skipped.length === 1 ? "is" : "are"} left out.`,
    );
  const snapshotPages = new Set(report.snapshots.map((s) => s.path)).size;
  if (snapshotPages > 0)
    parts.push(
      `${plural(snapshotPages, "page")} ${snapshotPages === 1 ? "has" : "have"} parts that need the live site, such as loops or forms.`,
    );
  if (result.copied > 0) parts.push(`${plural(result.copied, "media file")} copied.`);
  if (result.failed > 0)
    parts.push(
      `${plural(result.failed, "media file")} couldn't be copied and stay${result.failed === 1 ? "s" : ""} linked.`,
    );
  parts.push("EXPORT-REPORT.md in the zip has the details.");
  return parts.join(" ");
}

export function ExportDialog({
  fetcher,
  open,
  onOpenChange,
  pages,
}: {
  fetcher: Fetcher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: readonly PageSummary[];
}) {
  const published = pages.filter(
    (page) => page.status === "published" || page.status === "changed",
  );
  const [pageId, setPageId] = React.useState(ALL);
  const [copyMedia, setCopyMedia] = React.useState(true);
  const [state, setState] = React.useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "done"; text: string }
    | { kind: "error"; text: string }
  >({ kind: "idle" });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const busy = state.kind === "busy";

  React.useEffect(() => {
    if (open) setState({ kind: "idle" });
  }, [open]);

  const run = async () => {
    if (busy) return;
    setState({ kind: "busy" });
    try {
      const date = new Date().toISOString().slice(0, 10);
      const result = await exportSite(fetcher, {
        ...(pageId === ALL ? {} : { onlyPageId: pageId }),
        copyMedia,
        origin: window.location.origin,
        date,
      });
      if (result.site.report.pages.length === 0) {
        setState({ kind: "error", text: "There's nothing published to export yet." });
        return;
      }
      const name =
        pageId === ALL
          ? `emvb-export-${date}.zip`
          : `emvb-export-${result.site.report.pages[0]?.path.replace("/", "") ?? "page"}-${date}.zip`;
      downloadBlob(
        new Blob([result.zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
        name,
      );
      setState({ kind: "done", text: exportSummary(result) });
    } catch (error) {
      setState({
        kind: "error",
        text: `The export didn't finish: ${error instanceof Error ? error.message : String(error)}. Try again.`,
      });
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <div data-emvb-dialog="export-html" className="emvb-dialog">
          <Dialog.Title>Export as HTML</Dialog.Title>
          <Dialog.Description>
            Download published pages as plain HTML and CSS files you can host anywhere, with the
            header, footer and popups each page shows. Drafts and unpublished changes aren't
            included.
          </Dialog.Description>
          <div className="emvb-export-fields">
            <Select
              label="Pages"
              className={FIELD}
              value={pageId}
              onValueChange={(value) => setPageId(typeof value === "string" ? value : ALL)}
              renderValue={(value: unknown) =>
                value === ALL || !value
                  ? `All published pages (${published.length})`
                  : (published.find((page) => page.id === value)?.title ?? "Page")
              }
            >
              <Select.Option value={ALL}>All published pages ({published.length})</Select.Option>
              {published.map((page) => (
                <Select.Option key={page.id} value={page.id}>
                  {page.title}
                </Select.Option>
              ))}
            </Select>
            <Checkbox
              label="Copy this site's images and files into the export"
              checked={copyMedia}
              onCheckedChange={(checked: boolean) => setCopyMedia(checked)}
            />
          </div>
          <p
            className={state.kind === "error" ? "emvb-helper emvb-danger-text" : "emvb-helper"}
            role="status"
            data-emvb-export-status=""
          >
            {state.kind === "busy" && "Exporting…"}
            {(state.kind === "done" || state.kind === "error") && state.text}
          </p>
          <div className="emvb-dialog-actions">
            <DialogCloseButton>{state.kind === "done" ? "Close" : "Cancel"}</DialogCloseButton>
            <Button
              variant="primary"
              className={BUTTON}
              style={SOLID_PRIMARY}
              icon={
                busy && !reducedMotion ? (
                  <Loader size={14} />
                ) : (
                  <DownloadSimpleIcon aria-hidden="true" />
                )
              }
              aria-disabled={busy || published.length === 0}
              aria-busy={busy}
              onClick={() => {
                if (published.length > 0) void run();
              }}
            >
              {busy ? "Exporting…" : "Export"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

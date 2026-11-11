import { Button, Checkbox, Dialog, Loader, Radio, Select } from "@cloudflare/kumo";
import { CopySimpleIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import type { PageSummary } from "../content-api.ts";
import { DialogCloseButton } from "../editor/DialogCloseButton.tsx";
import { useMediaQuery } from "../editor/useMediaQuery.ts";
import {
  copyPagesAsRichText,
  richTextTargets,
  type CopyResult,
  type RichTextTarget,
} from "../copy-rich-text.ts";
import { exportSite, type ExportResult } from "../export-api.ts";
import { downloadBlob } from "../image-editor/flatten.ts";
import { leftOutText } from "../widgets/ConvertToRichText.tsx";
import { BUTTON, FIELD, SOLID_PRIMARY, UI_CSS } from "../ui.ts";

const ALL = "__all__";

/** Opens Export pages (W-963), next to Import on the Pages list. */
export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      className={BUTTON}
      icon={<DownloadSimpleIcon aria-hidden="true" />}
      onClick={onClick}
      data-emvb-export-pages=""
    >
      Export pages
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

/** What copying as rich text did, in a sentence or two. */
function copySummary(result: CopyResult, target: RichTextTarget): string {
  const parts = [`Created ${plural(result.created.length, "draft")} in ${target.label}.`];
  if (result.failed.length > 0)
    parts.push(`Not copied: ${result.failed.map((f) => `${f.title} (${f.message})`).join("; ")}.`);
  const left = leftOutText(result.skipped);
  if (left) parts.push(`Left out, as rich text can't hold them: ${left}.`);
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
  const [format, setFormat] = React.useState<"html" | "rich">("html");
  const [targets, setTargets] = React.useState<RichTextTarget[] | null>(null);
  const [targetSlug, setTargetSlug] = React.useState("");
  const target = targets?.find((t) => t.slug === targetSlug);
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

  React.useEffect(() => {
    if (!open || format !== "rich" || targets) return;
    let active = true;
    richTextTargets(fetcher).then(
      (found) => {
        if (!active) return;
        setTargets(found);
        setTargetSlug((current) => current || found[0]?.slug || "");
      },
      () => active && setTargets([]),
    );
    return () => {
      active = false;
    };
  }, [open, format, targets, fetcher]);

  const copy = async () => {
    if (busy || !target) return;
    setState({ kind: "busy" });
    try {
      const result = await copyPagesAsRichText(
        fetcher,
        target,
        pageId === ALL ? undefined : pageId,
      );
      setState({
        kind: result.created.length > 0 ? "done" : "error",
        text: copySummary(result, target),
      });
    } catch (error) {
      setState({
        kind: "error",
        text: `Copying didn't finish: ${error instanceof Error ? error.message : String(error)}. Try again.`,
      });
    }
  };
  const rich = format === "rich";
  const unavailable = published.length === 0 || (rich && !target);

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
        <div data-emvb-dialog="export-pages" className="emvb-dialog">
          <Dialog.Title>Export pages</Dialog.Title>
          <Dialog.Description>
            Take your published pages elsewhere. Drafts and unpublished changes aren't included, and
            your EmVB pages aren't changed.
          </Dialog.Description>
          <div className="emvb-export-fields">
            <Radio.Group
              legend="Export as"
              appearance="card"
              value={format}
              onValueChange={(value) => {
                setFormat(value === "rich" ? "rich" : "html");
                setState({ kind: "idle" });
              }}
              disabled={busy}
            >
              <Radio.Item
                value="html"
                label="HTML and CSS files"
                description="A zip you can host anywhere, with the header, footer and popups each page shows."
              />
              <Radio.Item
                value="rich"
                label="Rich text in a collection"
                description="A draft entry per page in one of your collections, with its words, headings, lists, links and images. The design doesn't come across."
              />
            </Radio.Group>
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
            {!rich && (
              <Checkbox
                label="Copy this site's images and files into the export"
                checked={copyMedia}
                onCheckedChange={(checked: boolean) => setCopyMedia(checked)}
              />
            )}
            {rich && targets === null && <p className="emvb-helper">Finding collections…</p>}
            {rich && targets?.length === 0 && (
              <p className="emvb-helper" data-emvb-no-targets="">
                None of your collections has a rich-text field to copy into.
              </p>
            )}
            {rich && targets && targets.length > 0 && (
              <Select
                label="Collection"
                className={FIELD}
                value={targetSlug}
                onValueChange={(value) => setTargetSlug(typeof value === "string" ? value : "")}
                renderValue={(value: unknown) =>
                  targets.find((t) => t.slug === value)?.label ?? "Choose a collection"
                }
              >
                {targets.map((t) => (
                  <Select.Option key={t.slug} value={t.slug}>
                    {t.label}
                  </Select.Option>
                ))}
              </Select>
            )}
          </div>
          <p
            className={state.kind === "error" ? "emvb-helper emvb-danger-text" : "emvb-helper"}
            role="status"
            data-emvb-export-status=""
          >
            {state.kind === "busy" && (rich ? "Copying…" : "Exporting…")}
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
                ) : rich ? (
                  <CopySimpleIcon aria-hidden="true" />
                ) : (
                  <DownloadSimpleIcon aria-hidden="true" />
                )
              }
              aria-disabled={busy || unavailable}
              aria-busy={busy}
              onClick={() => {
                if (unavailable) return;
                void (rich ? copy() : run());
              }}
            >
              {busy ? (rich ? "Copying…" : "Exporting…") : rich ? "Copy pages" : "Export"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

/**
 * "Save copy" export step (W-485), following photocn's `export-dialog.tsx`
 * (https://github.com/rbbydotdev/photocn, apps/www/src/registry/image-editor), MIT License,
 * Copyright (c) 2026 rbbydotdev: format, quality, W × H with "Full size", an error alert, and
 * Download next to the primary Save. Rebuilt with Kumo and EmVB tokens. EmVB changes: WebP 85%
 * first, the size starts capped at 2560 px on the longest side, and a JPEG of a photo with a
 * location gets "Remove location (GPS)", on by default. On phones the dialog sits at the bottom
 * like photocn's drawer.
 */
import { Button, Dialog, Select, Switch } from "@cloudflare/kumo";
import {
  DownloadSimpleIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { SOLID_PRIMARY } from "../ui.ts";
import { withDataUrlFetch } from "./data-url-fetch.ts";
import { downloadBlob, flattenToJpeg, needsFlatten } from "./flatten.ts";
import { useImageEditor } from "./engine.ts";
import { ValueSlider } from "./parts.tsx";
import {
  cappedWidth,
  DEFAULT_MAX_SIDE,
  EXPORT_FORMATS,
  formatInfo,
  outputSize,
  type ExportFormat,
} from "./save.ts";

export type ExportSettings = {
  format: ExportFormat;
  /** 0..1, lossy formats only. */
  quality?: number;
  /** Set when the copy is smaller than the crop: its longest side. */
  maxSide?: number;
  stripGps: boolean;
};

/** What photocn's `exportImage` returns, as far as saving needs it. */
export type ExportResult = { blob: Blob; width: number; height: number; type: string };

const MAX_PX = 16384;
type Pending = "download" | "save" | null;

export function ExportDialog({
  open,
  onOpenChange,
  mainThread,
  sourceHasGps,
  sourceType = "",
  downloadName = "image-edited.jpg",
  onSave,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Main-thread exports fetch `data:` URLs, which the admin CSP blocks without the shim. */
  mainThread: boolean;
  sourceHasGps: boolean;
  /** The source's MIME type: non-JPEG sources may be transparent (W-495). */
  sourceType?: string;
  downloadName?: string;
  onSave: (result: ExportResult, settings: ExportSettings) => Promise<void>;
  onClosed?: () => void;
}) {
  const [pending, setPending] = React.useState<Pending>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && pending === "save") return;
        onOpenChange(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
      }}
    >
      <Dialog className="emvb-ie-export">
        {open ? (
          <ExportForm
            mainThread={mainThread}
            sourceHasGps={sourceHasGps}
            sourceType={sourceType}
            downloadName={downloadName}
            onSave={onSave}
            pending={pending}
            onPendingChange={setPending}
          />
        ) : null}
      </Dialog>
    </Dialog.Root>
  );
}

function ExportForm({
  mainThread,
  sourceHasGps,
  sourceType,
  downloadName,
  onSave,
  pending,
  onPendingChange,
}: {
  mainThread: boolean;
  sourceHasGps: boolean;
  sourceType: string;
  downloadName: string;
  onSave: (result: ExportResult, settings: ExportSettings) => Promise<void>;
  pending: Pending;
  onPendingChange: (pending: Pending) => void;
}) {
  const editor = useImageEditor();
  const id = React.useId();
  const full = editor.geometry.outputSize;
  const [format, setFormat] = React.useState<ExportFormat>("webp");
  const selected = formatInfo(format);
  const [quality, setQuality] = React.useState<number>(selected.defaultQuality);
  // Output width in px; the height follows the crop. null = full size.
  const [width, setWidth] = React.useState<number | null>(() =>
    full ? cappedWidth(full, DEFAULT_MAX_SIDE) : null,
  );
  const [stripGps, setStripGps] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [failedSave, setFailedSave] = React.useState(false);
  const output = full ? outputSize(full, width) : null;
  const maximum = full
    ? outputSize(
        full,
        Math.max(1, Math.floor((MAX_PX * full.width) / Math.max(full.width, full.height))),
      )
    : null;
  const canExport = editor.isReady && !editor.disabled;
  const lossy = selected.lossy;
  const jpegGps = format === "jpeg" && sourceHasGps;

  const run = async (kind: "download" | "save") => {
    setError(null);
    onPendingChange(kind);
    const options = {
      format,
      quality: lossy ? quality : undefined,
      width: output && width ? output.width : undefined,
      height: output && width ? output.height : undefined,
    };
    const flatten = needsFlatten(format, sourceType);
    const exportTask = async (): Promise<ExportResult> => {
      if (!flatten) {
        return kind === "download" ? editor.download(options) : editor.exportImage(options);
      }
      // W-495: render as PNG, then fill the transparent parts with white for the JPEG.
      const png = await editor.exportImage({ ...options, format: "png", quality: undefined });
      const blob = await flattenToJpeg(png.blob, options.quality);
      if (kind === "download") downloadBlob(blob, downloadName);
      return { ...png, blob, type: "image/jpeg" };
    };
    try {
      const result = mainThread ? await withDataUrlFetch(exportTask) : await exportTask();
      if (kind === "save") {
        const settings: ExportSettings = {
          format,
          ...(lossy ? { quality } : {}),
          ...(width && output ? { maxSide: Math.max(output.width, output.height) } : {}),
          // Only JPEG copies carry EXIF over; WebP and PNG never have a location.
          stripGps: format === "jpeg" ? stripGps : true,
        };
        await onSave(result, settings);
      }
      setFailedSave(false);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Export failed.");
      if (kind === "save") setFailedSave(true);
    } finally {
      onPendingChange(null);
    }
  };

  const setSide = (raw: string, side: "width" | "height") => {
    if (!full || !maximum) return;
    const next = Number(raw);
    if (!(next > 0)) {
      setWidth(null);
      return;
    }
    const w = side === "width" ? Math.round(next) : Math.round((next * full.width) / full.height);
    setWidth(Math.max(1, Math.min(maximum.width, w)));
  };

  return (
    <div
      className="emvb-ie emvb-ie-export-body"
      data-slot="image-editor-export-dialog"
      data-emvb-image-export=""
    >
      <div className="emvb-ie-export-head">
        <Dialog.Title className="emvb-ie-export-title">Export image</Dialog.Title>
        <Dialog.Description className="emvb-ie-export-desc">
          Pick a format and size. Rendering always starts from the original.
        </Dialog.Description>
        <Dialog.Close
          disabled={pending === "save"}
          render={(props) => (
            <Button
              {...props}
              type="button"
              variant="ghost"
              size="sm"
              shape="square"
              className="emvb-ie-btn emvb-ie-btn-icon emvb-ie-export-close"
              aria-label="Close"
              icon={<XIcon aria-hidden="true" />}
            />
          )}
        />
      </div>
      <div className="emvb-ie-export-fields">
        <div className="emvb-ie-export-row">
          <span id={`${id}-format`} className="emvb-ie-label">
            Format
          </span>
          <Select
            aria-labelledby={`${id}-format`}
            className="emvb-ie-select emvb-ie-export-format"
            value={format}
            items={Object.fromEntries(EXPORT_FORMATS.map((o) => [o.value, o.label]))}
            onValueChange={(value) => {
              const next = EXPORT_FORMATS.find((o) => o.value === value);
              if (!next) return;
              setFormat(next.value);
              setQuality(next.defaultQuality);
            }}
          >
            {EXPORT_FORMATS.map((o) => (
              <Select.Option key={o.value} value={o.value}>
                {o.label}
              </Select.Option>
            ))}
          </Select>
        </div>

        {lossy ? (
          <ValueSlider
            label="Quality"
            name="export-quality"
            value={Math.round(quality * 100)}
            min={10}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) => setQuality(v / 100)}
          />
        ) : null}

        {full && output ? (
          <div className="emvb-ie-export-size">
            <div className="emvb-ie-export-row">
              <label htmlFor={`${id}-width`} className="emvb-ie-label">
                Size
              </label>
              {width ? (
                <button
                  type="button"
                  className="emvb-ie-link"
                  onClick={() => setWidth(null)}
                  data-emvb-image-export-full=""
                >
                  Full size
                </button>
              ) : null}
            </div>
            <div className="emvb-ie-export-dims">
              <input
                id={`${id}-width`}
                className="emvb-ie-number emvb-ie-export-px"
                aria-label="Width in pixels"
                type="number"
                inputMode="numeric"
                min={1}
                max={maximum?.width ?? MAX_PX}
                value={output.width}
                data-emvb-image-export-width=""
                onChange={(event) => setSide(event.currentTarget.value, "width")}
              />
              <span aria-hidden="true">×</span>
              <input
                className="emvb-ie-number emvb-ie-export-px"
                aria-label="Height in pixels"
                type="number"
                inputMode="numeric"
                min={1}
                max={maximum?.height ?? MAX_PX}
                value={output.height}
                data-emvb-image-export-height=""
                onChange={(event) => setSide(event.currentTarget.value, "height")}
              />
              <span className="emvb-ie-subtle">px</span>
            </div>
            <p className="emvb-ie-subtle" data-emvb-image-export-note="">
              {width
                ? `${Math.round((output.width / full.width) * 100)}% of the crop`
                : "Full resolution"}
              {format === "jpeg"
                ? jpegGps && stripGps
                  ? " · EXIF kept, location removed"
                  : " · EXIF preserved"
                : null}
            </p>
          </div>
        ) : null}

        {jpegGps ? (
          <Switch
            label="Remove location (GPS)"
            checked={stripGps}
            onCheckedChange={(checked) => setStripGps(checked === true)}
            data-emvb-image-export-gps=""
          />
        ) : null}

        {error ? (
          <div className="emvb-ie-alert" role="alert" data-emvb-image-export-error="">
            <WarningCircleIcon aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
      <div className="emvb-ie-export-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="emvb-ie-btn"
          disabled={!canExport || pending !== null}
          icon={
            pending === "download" ? (
              <span className="emvb-ie-spinner emvb-ie-spinner-sm" aria-hidden="true" />
            ) : (
              <DownloadSimpleIcon aria-hidden="true" />
            )
          }
          onClick={() => void run("download")}
          data-emvb-image-download=""
        >
          Download
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="emvb-ie-btn"
          style={SOLID_PRIMARY}
          disabled={!canExport || pending !== null}
          aria-busy={pending === "save" || undefined}
          icon={
            pending === "save" ? (
              <span className="emvb-ie-spinner emvb-ie-spinner-sm" aria-hidden="true" />
            ) : (
              <UploadSimpleIcon aria-hidden="true" />
            )
          }
          onClick={() => void run("save")}
          data-emvb-image-export-save=""
        >
          {pending === "save" ? "Saving…" : failedSave ? "Retry" : "Save copy"}
        </Button>
      </div>
    </div>
  );
}

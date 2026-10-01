import { Button, Input } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import * as React from "react";
import { sanitizeMediaUrl, type DesignSystem, type StyleProps } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { listImages, uploadImage, type MediaLibraryItem } from "../../../media-api.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { NumberField, type NumberSpec } from "./NumberRow.tsx";

type Gradient = NonNullable<StyleProps["gradient"]>;
type Overlay = NonNullable<StyleProps["overlay"]>;

const ANGLE: NumberSpec = { min: 0, max: 360, integer: true, example: "180", suffix: "°" };
const OVERLAY_OPACITY: NumberSpec = { min: 0, max: 100, scale: 100, example: "40", suffix: "%" };

const NEW_GRADIENT: Gradient = { angle: 180, from: "#ffffff", to: "#000000" };
const NEW_OVERLAY: Overlay = { color: "#000000", opacity: 0.4 };

/** Background image: library, upload, or a URL. Without `fetcher`, only the URL is offered. */
export function BackgroundImageControl({
  value,
  fetcher,
  onChange,
  reset,
}: {
  value: string | undefined;
  fetcher?: Fetcher;
  onChange: (next: string | undefined) => void;
  reset: React.ReactNode;
}) {
  const src = value ?? "";
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<MediaLibraryItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [urlDraft, setUrlDraft] = React.useState(src);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setUrlDraft(src);
  }, [src]);

  const loadLibrary = React.useCallback(async () => {
    if (!fetcher) return;
    setBusy(true);
    setError(null);
    try {
      setItems(await listImages(fetcher, { limit: 40 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load the media library.");
      setItems([]);
    } finally {
      setBusy(false);
    }
  }, [fetcher]);

  React.useEffect(() => {
    if (open) void loadLibrary();
  }, [open, loadLibrary]);

  const applyUrl = (next: string) => {
    const safe = sanitizeMediaUrl(next);
    if (!safe || /[()\\\s"'`]/.test(safe)) {
      setError(
        "Use a full URL such as https://example.com/photo.jpg or a path such as /uploads/photo.jpg.",
      );
      return;
    }
    setError(null);
    setOpen(false);
    onChange(safe);
  };

  const commitUrl = (explicit: boolean) => {
    const trimmed = urlDraft.trim();
    if (!explicit && trimmed === src) {
      setError(null);
      return;
    }
    if (trimmed === "") {
      setError(null);
      onChange(undefined);
      return;
    }
    applyUrl(trimmed);
  };

  return (
    <div
      className="emvb-style-row"
      data-emvb-style="backgroundImage"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group" data-emvb-background-image="">
        <span className="emvb-var-field-label">Image</span>
        {src ? (
          <div className="emvb-media-preview">
            <img src={src} alt="" className="emvb-media-thumb" />
            <span className="emvb-helper emvb-mono">{src}</span>
          </div>
        ) : (
          <p className="emvb-helper">No image yet. The background colour shows through.</p>
        )}
        {fetcher && (
          <div className="emvb-media-actions">
            <Button
              type="button"
              className={BUTTON}
              onClick={() => setOpen(true)}
              disabled={busy}
              data-emvb-bg-library=""
            >
              Choose from library
            </Button>
            <Button
              type="button"
              className={BUTTON}
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              data-emvb-bg-upload-btn=""
            >
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              className="emvb-sr-only"
              data-emvb-bg-upload=""
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file || !fetcher) return;
                setBusy(true);
                void uploadImage(fetcher, file)
                  .then((item) => applyUrl(item.url))
                  .catch((caught: unknown) => {
                    setError(caught instanceof Error ? caught.message : "Upload failed.");
                  })
                  .finally(() => {
                    setBusy(false);
                    if (fileRef.current) fileRef.current.value = "";
                  });
              }}
            />
          </div>
        )}
        <Input
          label="Image URL"
          className={FIELD}
          value={urlDraft}
          error={error ?? undefined}
          data-emvb-bg-url=""
          onChange={(event) => setUrlDraft(event.target.value)}
          onBlur={() => commitUrl(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitUrl(true);
          }}
        />
        {open && (
          <div className="emvb-media-dialog" role="dialog" aria-label="Media library">
            <div className="emvb-media-dialog-head">
              <h3 className="emvb-panel-title">Media library</h3>
              <Button
                type="button"
                className={BUTTON}
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>
            {busy && <p className="emvb-helper">Loading…</p>}
            {!busy && items.length === 0 && <p className="emvb-helper">No images yet.</p>}
            <ul className="emvb-media-grid">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="emvb-media-card"
                    data-emvb-bg-media-id={item.id}
                    onClick={() => applyUrl(item.url)}
                  >
                    <img src={item.url} alt={item.alt ?? item.filename} />
                    <span>{item.filename}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {reset}
    </div>
  );
}

export function GradientControl({
  value,
  design,
  onChange,
  onDesignChange,
  reset,
}: {
  value: Gradient | undefined;
  design: DesignSystem;
  onChange: (next: Gradient | undefined) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  reset: React.ReactNode;
}) {
  const patch = (part: Partial<Gradient>) => {
    if (!value) return;
    onChange({ ...value, ...part });
  };
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="gradient"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group">
        <span className="emvb-var-field-label">Gradient</span>
        {value ? (
          <>
            <NumberField
              fieldKey="gradient.angle"
              label="Angle"
              value={value.angle}
              spec={ANGLE}
              onCommit={(n) => patch({ angle: n ?? 0 })}
            />
            <ColorControl
              label="From"
              value={value.from}
              design={design}
              onChange={(from) => from && patch({ from })}
              onDesignChange={onDesignChange}
            />
            <ColorControl
              label="To"
              value={value.to}
              design={design}
              onChange={(to) => to && patch({ to })}
              onDesignChange={onDesignChange}
            />
          </>
        ) : (
          <Button
            type="button"
            className={BUTTON}
            variant="secondary"
            icon={PlusIcon}
            data-emvb-add-gradient=""
            onClick={() => onChange(NEW_GRADIENT)}
          >
            Add gradient
          </Button>
        )}
      </div>
      {reset}
    </div>
  );
}

export function OverlayControl({
  value,
  design,
  onChange,
  onDesignChange,
  reset,
}: {
  value: Overlay | undefined;
  design: DesignSystem;
  onChange: (next: Overlay | undefined) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  reset: React.ReactNode;
}) {
  const patch = (part: Partial<Overlay>) => {
    if (!value) return;
    onChange({ ...value, ...part });
  };
  return (
    <div className="emvb-style-row" data-emvb-style="overlay" data-set={value ? "true" : undefined}>
      <div className="emvb-field-group">
        <span className="emvb-var-field-label">Overlay</span>
        {value ? (
          <>
            <ColorControl
              label="Overlay color"
              value={value.color}
              design={design}
              onChange={(color) => color && patch({ color })}
              onDesignChange={onDesignChange}
            />
            <NumberField
              fieldKey="overlay.opacity"
              label="Overlay opacity"
              value={value.opacity}
              spec={OVERLAY_OPACITY}
              onCommit={(n) => patch({ opacity: n ?? 0 })}
            />
          </>
        ) : (
          <Button
            type="button"
            className={BUTTON}
            variant="secondary"
            icon={PlusIcon}
            data-emvb-add-overlay=""
            onClick={() => onChange(NEW_OVERLAY)}
          >
            Add overlay
          </Button>
        )}
      </div>
      {reset}
    </div>
  );
}

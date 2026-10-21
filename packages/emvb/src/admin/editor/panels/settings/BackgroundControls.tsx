import { Button, Input, Select } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import * as React from "react";
import { sanitizeMediaUrl, type DesignSystem, type StyleProps } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { listImages, uploadImage, type MediaLibraryItem } from "../../../media-api.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { NumberField, type NumberSpec } from "./NumberRow.tsx";
import { isCommitEnter } from "../../ime.ts";

type Gradient = NonNullable<StyleProps["gradient"]>;
type Overlay = NonNullable<StyleProps["overlay"]>;

const ANGLE: NumberSpec = { min: 0, max: 360, integer: true, example: "180", suffix: "°" };
const OVERLAY_OPACITY: NumberSpec = { min: 0, max: 100, scale: 100, example: "40", suffix: "%" };
const STOP_AT: NumberSpec = { min: 0, max: 100, integer: true, example: "50", suffix: "%" };

/**
 * Where a stop goes when its location is cleared: spaced evenly by its place in the list, the way
 * CSS places stops that have no location (W-180).
 */
const autoStopAt = (index: number, count: number) =>
  Math.round((index / Math.max(1, count - 1)) * 100);

export const NEW_GRADIENT: Gradient = {
  type: "linear",
  angle: 180,
  stops: [
    { color: "#ffffff", at: 0 },
    { color: "#000000", at: 100 },
  ],
};
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
  const [busy, setBusyState] = React.useState(false);
  // W-824: Choose from library and Upload stay focusable while busy (aria-disabled, presses
  // ignored), like W-819, so keyboard focus no longer drops to the page body during an upload.
  const busyRef = React.useRef(false);
  const setBusy = React.useCallback((next: boolean) => {
    busyRef.current = next;
    setBusyState(next);
  }, []);
  const [error, setError] = React.useState<string | null>(null);
  const [urlDraft, setUrlDraft] = React.useState(src);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // W-823: the background Media library didn't take focus, ignored Escape and dropped focus to
  // the page body when it closed. It now behaves like the image picker's library (W-741/W-817).
  const libraryOpenerRef = React.useRef<HTMLButtonElement>(null);
  const closeLibrary = () => {
    setOpen(false);
    libraryOpenerRef.current?.focus();
  };

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
  }, [fetcher, setBusy]);

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
          <p className="emvb-helper">No image yet, so this element has no background.</p>
        )}
        {fetcher && (
          <div className="emvb-media-actions">
            <Button
              type="button"
              className={BUTTON}
              onClick={() => {
                if (!busyRef.current) setOpen(true);
              }}
              aria-disabled={busy}
              ref={libraryOpenerRef}
              data-emvb-bg-library=""
            >
              Choose from library
            </Button>
            <Button
              type="button"
              className={BUTTON}
              variant="secondary"
              onClick={() => {
                if (!busyRef.current) fileRef.current?.click();
              }}
              aria-disabled={busy}
              data-emvb-bg-upload-btn=""
            >
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              className="emvb-sr-only"
              tabIndex={-1}
              aria-hidden="true"
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
            if (isCommitEnter(event)) commitUrl(true);
          }}
        />
        {open && (
          <div
            className="emvb-media-dialog"
            role="dialog"
            aria-label="Media library"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              event.stopPropagation();
              closeLibrary();
            }}
          >
            <div className="emvb-media-dialog-head">
              <h3 className="emvb-panel-title">Media library</h3>
              <Button
                type="button"
                className={BUTTON}
                variant="secondary"
                autoFocus
                onClick={closeLibrary}
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
                    onClick={() => {
                      applyUrl(item.url);
                      libraryOpenerRef.current?.focus();
                    }}
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

const GRADIENT_TYPES: { value: Gradient["type"]; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "radial", label: "Radial" },
  { value: "conic", label: "Conic" },
];

const RADIAL_AT = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top left",
  "top right",
  "bottom left",
  "bottom right",
] as const;

/** "top left" → "Top left". */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Linear, radial or conic, with 2–10 stops. Angle is a slider and a number. */
export function GradientControl({
  value,
  design,
  onChange,
  onDesignChange,
}: {
  value: Gradient;
  design: DesignSystem;
  onChange: (next: Gradient) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
}) {
  const stops = value.stops;
  const defaultAngle = value.type === "conic" ? 0 : 180;
  // An emptied angle goes back to the type's default instead of 0 (W-180).
  const setAngle = (angle: number | undefined) => {
    const next = { ...value, angle };
    if (angle === undefined) delete next.angle;
    onChange(next);
  };
  const setStop = (index: number, part: Partial<Gradient["stops"][number]>) => {
    onChange({
      ...value,
      stops: stops.map((stop, i) => (i === index ? { ...stop, ...part } : stop)),
    });
  };
  const addStop = () => {
    if (stops.length >= 10) return;
    const used = new Set(stops.map((stop) => stop.at));
    let at = 50;
    while (used.has(at) && at < 100) at += 1;
    onChange({ ...value, stops: [...stops, { color: "#808080", at }] });
  };
  return (
    <div className="emvb-field-group" data-emvb-gradient="">
      <Select
        label="Gradient type"
        className={FIELD}
        value={value.type}
        // UX-081: triggers show option names ("Linear", "Top left"), not raw values.
        renderValue={(v: unknown) =>
          GRADIENT_TYPES.find((option) => option.value === v)?.label ?? String(v)
        }
        onValueChange={(next) => {
          const type = GRADIENT_TYPES.find((option) => option.value === next)?.value;
          if (type) onChange({ ...value, type });
        }}
      >
        {GRADIENT_TYPES.map((option) => (
          <Select.Option key={option.value} value={option.value}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
      {value.type === "radial" ? (
        <Select
          label="Position"
          className={FIELD}
          value={value.position ?? "center"}
          renderValue={(v: unknown) => sentence(String(v))}
          onValueChange={(next) => {
            const position = RADIAL_AT.find((option) => option === next);
            if (position) onChange({ ...value, position });
          }}
        >
          {RADIAL_AT.map((option) => (
            <Select.Option key={option} value={option}>
              {sentence(option)}
            </Select.Option>
          ))}
        </Select>
      ) : (
        <div className="emvb-angle">
          <NumberField
            fieldKey="gradient.angle"
            label="Angle"
            value={value.angle}
            inherited={defaultAngle}
            spec={ANGLE}
            onCommit={setAngle}
          />
          <input
            type="range"
            className="emvb-angle-slider"
            min={0}
            max={360}
            aria-label="Angle slider"
            value={value.angle ?? defaultAngle}
            onChange={(event) => onChange({ ...value, angle: Number(event.target.value) })}
          />
        </div>
      )}
      {stops.map((stop, index) => (
        <div className="emvb-gradient-stop" key={index} data-emvb-gradient-stop={index}>
          <ColorControl
            label={`Color ${index + 1}`}
            value={stop.color}
            design={design}
            onChange={(color) => color && setStop(index, { color })}
            onDesignChange={onDesignChange}
          />
          <NumberField
            fieldKey={`gradient.stop.${index}`}
            label={`Location ${index + 1}`}
            value={stop.at}
            inherited={autoStopAt(index, stops.length)}
            spec={STOP_AT}
            onCommit={(n) => setStop(index, { at: n ?? autoStopAt(index, stops.length) })}
          />
          {stops.length > 2 && (
            <Button
              type="button"
              variant="secondary"
              className={BUTTON}
              onClick={() => onChange({ ...value, stops: stops.filter((_, i) => i !== index) })}
            >
              Remove color {index + 1}
            </Button>
          )}
        </div>
      ))}
      {stops.length < 10 && (
        <Button
          type="button"
          variant="secondary"
          className={BUTTON}
          data-emvb-add-stop=""
          icon={PlusIcon}
          onClick={addStop}
        >
          Add location
        </Button>
      )}
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

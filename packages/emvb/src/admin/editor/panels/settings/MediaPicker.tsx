import { Button, Input } from "@cloudflare/kumo";
import * as React from "react";
import { sanitizeMediaUrl, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import {
  listImages,
  propsFromMedia,
  uploadImage,
  type MediaLibraryItem,
} from "../../../media-api.ts";
import { BUTTON, FIELD } from "../../../ui.ts";

const propsOf = (node: LayoutNode): Record<string, unknown> =>
  node.props as Record<string, unknown>;

const withProps = (node: LayoutNode, props: Record<string, unknown>): LayoutNode =>
  ({ ...node, props }) as LayoutNode;

type Props = {
  node: LayoutNode;
  fetcher: Fetcher;
  onChange: (node: LayoutNode) => void;
  /** Field label; Page settings uses "Social image" (W-287). */
  label?: string;
};

/**
 * Image source control (W-024 / R-007): pick from EmDash media library, upload a file,
 * or paste a URL. Upload uses the same POST /_emdash/api/media path on both demos.
 */
export function MediaPicker({ node, fetcher, onChange, label = "Image" }: Props) {
  const props = propsOf(node);
  const src = typeof props.src === "string" ? props.src : "";
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<MediaLibraryItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [urlDraft, setUrlDraft] = React.useState(src);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setUrlDraft(src);
  }, [src, node.id]);

  const loadLibrary = React.useCallback(async () => {
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

  const applyItem = (item: MediaLibraryItem) => {
    onChange(withProps(node, propsFromMedia(propsOf(node), item)));
    setOpen(false);
    setError(null);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dims = await readImageSize(file).catch(
        () => ({}) as { width?: number; height?: number },
      );
      const item = await uploadImage(fetcher, file, dims);
      applyItem(item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** Enter always checks the field; leaving it (blur) only commits a real change (W-092). */
  const commitUrl = (explicit: boolean) => {
    const trimmed = urlDraft.trim();
    if (!explicit && trimmed === src) {
      setError(null);
      return;
    }
    if (trimmed === "") {
      setError("Choose a library image, upload a file, or enter a URL.");
      return;
    }
    const safe = sanitizeMediaUrl(trimmed);
    if (!safe) {
      setError(
        "Use a full URL such as https://example.com/photo.jpg or a path such as /uploads/photo.jpg.",
      );
      return;
    }
    setError(null);
    if (safe === src) return;
    const next: Record<string, unknown> = { ...propsOf(node), src: safe };
    delete next.mediaId;
    onChange(withProps(node, next));
  };

  return (
    <div className="emvb-field-group" data-emvb-field="src" data-emvb-media-picker="">
      <label className="emvb-field-label">{label}</label>
      {src ? (
        <div className="emvb-media-preview">
          <img src={src} alt="" className="emvb-media-thumb" />
          <span className="emvb-helper emvb-mono">{src}</span>
        </div>
      ) : (
        <p className="emvb-helper">No image selected yet.</p>
      )}
      <div className="emvb-media-actions">
        <Button
          type="button"
          className={BUTTON}
          onClick={() => setOpen(true)}
          disabled={busy}
          data-emvb-media-library=""
        >
          Choose from library
        </Button>
        <Button
          type="button"
          className={BUTTON}
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          data-emvb-media-upload-btn=""
        >
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          className="emvb-sr-only"
          data-emvb-media-upload=""
          onChange={(event) => void onUpload(event.target.files?.[0])}
        />
      </div>
      <Input
        label="Or paste a URL"
        className={FIELD}
        value={urlDraft}
        error={error ?? undefined}
        data-emvb-media-url=""
        onChange={(event) => setUrlDraft(event.target.value)}
        onBlur={() => commitUrl(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitUrl(true);
        }}
      />
      {open && (
        <div
          className="emvb-media-dialog"
          role="dialog"
          aria-label="Media library"
          data-emvb-media-dialog=""
        >
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
          {!busy && items.length === 0 && (
            <p className="emvb-helper">No images yet. Upload one to get started.</p>
          )}
          <ul className="emvb-media-grid">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="emvb-media-card"
                  data-emvb-media-id={item.id}
                  onClick={() => applyItem(item)}
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
  );
}

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.addEventListener("load", () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    });
    img.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read image dimensions."));
    });
    img.src = url;
  });
}

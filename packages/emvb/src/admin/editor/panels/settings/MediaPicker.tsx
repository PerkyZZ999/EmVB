import { Badge, Banner, Button, DropdownMenu, Input } from "@cloudflare/kumo";
import { DotsThreeIcon, MagicWandIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  ImageEdit,
  sanitizeMediaUrl,
  summarizeImageEdit,
  type LayoutNode,
} from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import {
  getMedia,
  listImages,
  propsFromMedia,
  propsFromOriginal,
  saveEditedCopy,
  propsFromUrl,
  uploadImage,
  type MediaLibraryItem,
} from "../../../media-api.ts";
import {
  ImageEditButton,
  ImageEditorLauncher,
  prefetchImageEditor,
} from "../../../image-editor/ImageEditButton.tsx";
import { editableSource } from "../../../image-editor/load.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import { isCommitEnter } from "../../ime.ts";

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
  /** Offer "Edit image" (Image elements only, W-482). */
  editable?: boolean;
};

/**
 * Image source control (W-024 / R-007): pick from EmDash media library, upload a file,
 * or paste a URL. Upload uses the same POST /_emdash/api/media path on both demos.
 */

/** W-492: Reset to original when the original was deleted from the library. */
const ORIGINAL_DELETED =
  "The original picture was deleted from the media library, so this image can't be reset. It keeps the edited copy.";

export function MediaPicker({ node, fetcher, onChange, label = "Image", editable = false }: Props) {
  const props = propsOf(node);
  const src = typeof props.src === "string" ? props.src : "";
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<MediaLibraryItem[]>([]);
  const [libraryError, setLibraryError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [urlDraft, setUrlDraft] = React.useState(src);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const libraryCloseRef = React.useRef<HTMLButtonElement>(null);
  const libraryOpenerRef = React.useRef<HTMLButtonElement>(null);
  const urlInputRef = React.useRef<HTMLInputElement>(null);
  // W-486: a library picture opened from its card's Edit… (null when the editor is closed).
  const [editing, setEditing] = React.useState<MediaLibraryItem | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const currentNode = React.useRef<LayoutNode | null>(node);

  React.useEffect(() => {
    currentNode.current = node;
    return () => {
      currentNode.current = null;
    };
  }, [node]);

  React.useEffect(() => {
    setUrlDraft(src);
  }, [src, node.id]);

  const loadLibrary = React.useCallback(async () => {
    setBusy(true);
    setLibraryError(null);
    try {
      setItems(await listImages(fetcher, { limit: 40 }));
    } catch (caught) {
      setLibraryError(
        caught instanceof Error ? caught.message : "Couldn't load the media library.",
      );
      setItems([]);
    } finally {
      setBusy(false);
    }
  }, [fetcher]);

  React.useEffect(() => {
    if (open) void loadLibrary();
  }, [open, loadLibrary]);

  const closeLibrary = () => {
    setOpen(false);
    const opener = libraryOpenerRef.current;
    const target = opener?.disabled ? urlInputRef.current : opener;
    target?.focus();
  };

  const edit = ImageEdit.safeParse(props.edit);
  /** W-487: say why a picture can't be edited instead of offering a button that fails. */
  const editCheck = src ? editableSource(props, window.location.origin) : null;
  const editSummary = edit.success ? summarizeImageEdit(edit.data.recipe, 12) || "Edited" : null;

  /** W-485: upload the edited copy as a new item; the original stays in the library. */
  const saveCopy = async (file: File, copy: { width: number; height: number; edit: unknown }) => {
    onChange(withProps(node, await saveEditedCopy(fetcher, props, file, copy)));
  };

  /** The props the element would have with this library picture (stable while editing). */
  const editingProps = React.useMemo(
    () => (editing ? propsFromMedia(props, editing) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new card opens a new edit.
    [editing],
  );

  /** W-486: Edit… saves a copy of the card's picture and selects it for this element. */
  const saveLibraryCopy = async (
    file: File,
    copy: { width: number; height: number; edit: unknown },
  ) => {
    if (!editingProps) return;
    onChange(withProps(node, await saveEditedCopy(fetcher, editingProps, file, copy)));
    setOpen(false);
  };

  const imageTarget = () => {
    const current = currentNode.current;
    if (!current || current.id !== node.id) return null;
    const latestProps = propsOf(current);
    return latestProps.src === props.src && latestProps.edit === props.edit ? current : null;
  };

  /** W-485: back to the untouched original; the edited copy is not deleted. */
  const resetToOriginal = async () => {
    if (!edit.success) return;
    setBusy(true);
    setError(null);
    try {
      const id = edit.data.originalMediaId;
      // W-492: a failed lookup is an error, not "no original"; a deleted original can't be reset
      // to (its recorded URL is gone too), so the element keeps the edited copy.
      const original = id ? await getMedia(fetcher, id) : null;
      const target = imageTarget();
      if (!target) return;
      if (id && !original) {
        setError(ORIGINAL_DELETED);
        return;
      }
      const next = propsFromOriginal(propsOf(target), original);
      if (next) onChange(withProps(target, next));
    } catch (caught) {
      if (!imageTarget()) return;
      setError(
        `Couldn't reach the media library to find the original.${caught instanceof Error && caught.message ? ` ${caught.message}` : ""}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const applyItem = (item: MediaLibraryItem, target: LayoutNode = node) => {
    onChange(withProps(target, propsFromMedia(propsOf(target), item)));
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
      const target = imageTarget();
      if (target) applyItem(item, target);
    } catch (caught) {
      if (!imageTarget()) return;
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
    onChange(withProps(node, propsFromUrl(propsOf(node), safe)));
  };

  return (
    <div className="emvb-field-group" data-emvb-field="src" data-emvb-media-picker="">
      <label className="emvb-field-label">{label}</label>
      {src ? (
        <div className="emvb-media-preview">
          <img src={src} alt="" className="emvb-media-thumb" />
          <span className="emvb-helper emvb-mono">{src}</span>
          {editSummary ? (
            <span className="emvb-media-edited" data-emvb-image-edited="">
              <Badge variant="neutral">Edited</Badge>
              <span className="emvb-helper" data-emvb-image-edit-summary="">
                {editSummary}
              </span>
            </span>
          ) : null}
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
          ref={libraryOpenerRef}
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
        {editable && src && editCheck?.ok ? (
          <ImageEditButton imageProps={props} onSave={saveCopy} />
        ) : null}
        {editable && edit.success ? (
          <Button
            type="button"
            className={BUTTON}
            variant="ghost"
            onClick={() => void resetToOriginal()}
            disabled={busy}
            data-emvb-image-reset-original=""
          >
            Reset to original
          </Button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          className="emvb-sr-only"
          data-emvb-media-upload=""
          onChange={(event) => void onUpload(event.target.files?.[0])}
        />
      </div>
      {editable && src && editCheck && !editCheck.ok ? (
        <p className="emvb-helper" data-emvb-image-cant-edit={editCheck.reason}>
          {editCheck.message}
        </p>
      ) : null}
      <Input
        ref={urlInputRef}
        label="Or paste a URL"
        className={FIELD}
        value={urlDraft}
        error={error ?? undefined}
        data-emvb-media-url=""
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
          data-emvb-media-dialog=""
        >
          <div className="emvb-media-dialog-head">
            <h3 className="emvb-panel-title">Media library</h3>
            <Button
              type="button"
              className={BUTTON}
              variant="secondary"
              ref={libraryCloseRef}
              autoFocus
              onClick={closeLibrary}
            >
              Close
            </Button>
          </div>
          {busy && (
            <p className="emvb-helper" role="status">
              Loading…
            </p>
          )}
          {!busy && libraryError && (
            <Banner
              role="alert"
              variant="error"
              icon={<WarningCircleIcon aria-hidden="true" />}
              title="Couldn't load the media library"
              description={libraryError}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  className={BUTTON}
                  onClick={() => {
                    libraryCloseRef.current?.focus();
                    void loadLibrary();
                  }}
                >
                  Retry
                </Button>
              }
            />
          )}
          {!busy && !libraryError && items.length === 0 && (
            <p className="emvb-helper">No images yet. Upload one to get started.</p>
          )}
          <ul className="emvb-media-grid">
            {items.map((item) => (
              <li key={item.id} className="emvb-media-cell">
                <button
                  type="button"
                  className="emvb-media-card"
                  data-emvb-media-id={item.id}
                  onClick={() => applyItem(item)}
                >
                  <img src={item.url} alt={item.alt ?? item.filename} />
                  <span>{item.filename}</span>
                </button>
                {editable && canEdit(item) ? (
                  <DropdownMenu onOpenChange={(next) => next && prefetchImageEditor()}>
                    <DropdownMenu.Trigger
                      render={
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          shape="square"
                          className="emvb-media-card-menu"
                          aria-label={`More for ${item.alt || item.filename}`}
                          icon={<DotsThreeIcon aria-hidden="true" weight="bold" />}
                          data-emvb-media-menu={item.id}
                        />
                      }
                    />
                    <DropdownMenu.Content align="end">
                      <DropdownMenu.Item
                        icon={MagicWandIcon}
                        onClick={() => {
                          setEditing(item);
                          setEditorOpen(true);
                        }}
                        data-emvb-media-edit={item.id}
                      >
                        Edit…
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {editingProps ? (
        <ImageEditorLauncher
          open={editorOpen}
          onOpenChange={setEditorOpen}
          imageProps={editingProps}
          onSave={saveLibraryCopy}
          onClosed={() => setEditing(null)}
        />
      ) : null}
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

/** Library pictures the editor can open: same-site JPEG, PNG, WebP or AVIF (not SVG or GIF). */
function canEdit(item: MediaLibraryItem): boolean {
  if (/svg|gif/i.test(item.mimeType)) return false;
  return editableSource({ src: item.url }, window.location.origin).ok;
}

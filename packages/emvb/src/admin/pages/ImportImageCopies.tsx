import { Button } from "@cloudflare/kumo";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { uploadImage } from "../media-api.ts";
import { BUTTON } from "../ui.ts";

/** An old-site image's copy in the media library. */
export type Copy = { url: string; id: string };

/** A URL's file name, decoded and lower-cased, to match a chosen file to the export's address (W-951, W-958). */
export function fileNameOf(url: string): string {
  const last = url.split(/[?#]/)[0]?.split("/").pop() ?? "";
  try {
    return decodeURIComponent(last).toLowerCase();
  } catch {
    return last.toLowerCase();
  }
}

/** W-958: an image copied into the media library is at most this large. */
const MAX_IMAGE_FILE = 20 * 1024 * 1024;

/** Fetches an old-site image without cookies; undefined when refused (CORS), not an image or too big. */
async function fetchImage(url: string): Promise<File | undefined> {
  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > MAX_IMAGE_FILE) return undefined;
    return new File([blob], fileNameOf(url) || "image", { type: blob.type });
  } catch {
    return undefined;
  }
}

/** Runs `run` on every item, at most `limit` at a time. */
async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    const index = next++;
    if (index >= items.length) return;
    await run(items[index] as T);
    return worker();
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * W-958 (shared with W-1074): the import dialogs' **Copy images** row. The browser fetches each
 * old-site image (without cookies) and uploads it to the media library; images the old site
 * won't let it read can be added as files, matched by file name. Nothing is fetched by the server.
 */
export function ImportImageCopies({
  fetcher,
  images,
  onCopied,
  dataAttribute,
}: {
  fetcher: Fetcher;
  /** Old-site image addresses not copied yet. */
  images: readonly string[];
  onCopied: (done: [string, Copy][]) => void;
  /** Marks the hidden file input for tests (`data-emvb-elementor-images`, …). */
  dataAttribute: string;
}) {
  const [status, setStatus] = React.useState<string>();
  const [copying, setCopying] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (url: string, file: File, done: [string, Copy][]) => {
    try {
      const item = await uploadImage(fetcher, file);
      done.push([url, { url: item.url, id: item.id }]);
    } catch {
      // Counted as not copied below.
    }
  };

  const copyImages = async () => {
    setCopying(true);
    const done: [string, Copy][] = [];
    const urls = [...images];
    await eachLimited(urls, 4, async (url) => {
      const file = await fetchImage(url);
      if (file) await upload(url, file, done);
    });
    onCopied(done);
    const failed = urls.length - done.length;
    setStatus(
      failed === 0
        ? `Copied ${done.length} ${done.length === 1 ? "image" : "images"} to the media library.`
        : `Copied ${done.length} of ${urls.length}. The rest couldn't be read from your old site from here: download them from its media library and add them with Add image files.`,
    );
    setCopying(false);
  };

  const addImages = async (files: readonly File[]) => {
    setCopying(true);
    const wanted = new Map(images.map((url) => [fileNameOf(url), url]));
    const usable = (file: File) =>
      file.size <= MAX_IMAGE_FILE &&
      file.type.startsWith("image/") &&
      wanted.has(file.name.toLowerCase());
    const unused = files.filter((file) => !usable(file)).map((file) => file.name);
    const done: [string, Copy][] = [];
    await eachLimited(files.filter(usable), 4, (file) =>
      upload(wanted.get(file.name.toLowerCase()) ?? "", file, done),
    );
    onCopied(done);
    setStatus(
      `Copied ${done.length} ${done.length === 1 ? "image" : "images"} to the media library.` +
        (unused.length > 0
          ? ` Not used (not in this export, not an image, or over 20 MB): ${unused.join(", ")}.`
          : ""),
    );
    setCopying(false);
  };

  if (images.length === 0 && !status) return null;
  return (
    <div className="emvb-import-row" data-emvb-import-images="">
      <Button
        type="button"
        variant="secondary"
        className={BUTTON}
        disabled={copying || images.length === 0}
        onClick={() => void copyImages()}
      >
        {copying ? "Copying…" : "Copy images"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={BUTTON}
        disabled={copying || images.length === 0}
        onClick={() => inputRef.current?.click()}
      >
        Add image files
      </Button>
      <span className="emvb-helper" role="status">
        {status ??
          `${images.length} ${images.length === 1 ? "image loads" : "images load"} from your old site. Copy them to your media library (copies stay there even if you don't import), or add the files.`}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        {...{ [dataAttribute]: "" }}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) void addImages(files);
        }}
      />
    </div>
  );
}

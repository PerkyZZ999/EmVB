import { Button, Dialog, Input, Switch } from "@cloudflare/kumo";
import * as React from "react";
import {
  encodeSharedPage,
  LONG_LINK_CHARS,
  shareUrl,
  type DesignSystem,
  type Layout,
  type LayoutNode,
} from "../../core/index.ts";
import { BUTTON, FIELD } from "../ui.ts";
import { DialogCloseButton } from "./DialogCloseButton.tsx";

const MEDIA_KEYS = ["src", "poster", "backgroundImage", "backgroundVideo"];
const siteOnly = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" && !/^(https?:)?\/\//i.test(value.trim());

/** Media on the page whose address only works on this site (W-321): a path, not a full URL. */
export function siteOnlyMedia(layout: Layout, design?: DesignSystem): number {
  let count = 0;
  type Owner = {
    style?: unknown;
    devices?: unknown;
    states?: unknown;
    query?: { style?: unknown };
  };
  const sheets = (owner: Owner): unknown[] => [
    owner.style,
    // Device and hover/focus/active styles can carry a background too (W-631), and so can a
    // container-query override (W-644).
    ...Object.values((owner.devices ?? {}) as Record<string, unknown>),
    ...Object.values((owner.states ?? {}) as Record<string, unknown>),
    owner.query?.style,
  ];
  // W-644: a background set by a class the page uses, when the link carries the site styles.
  const classes = new Map((design?.classes ?? []).map((c) => [c.id, c]));
  const counted = new Set<string>();
  const visit = (node: LayoutNode) => {
    const fromClasses = (node.classes ?? []).flatMap((id) => {
      const cls = classes.get(id);
      if (!cls || counted.has(id)) return [];
      counted.add(id);
      return sheets(cls as Owner);
    });
    const sources = [node.props, ...sheets(node as Owner), ...fromClasses];
    for (const source of sources) {
      if (typeof source !== "object" || source === null) continue;
      for (const key of MEDIA_KEYS) {
        const raw = (source as Record<string, unknown>)[key];
        const url = typeof raw === "object" && raw !== null ? (raw as { url?: unknown }).url : raw;
        if (siteOnly(url)) count += 1;
      }
    }
    const kids = (node as { children?: LayoutNode[] }).children;
    if (Array.isArray(kids)) for (const child of kids) visit(child);
  };
  visit(layout.root);
  return count;
}

/**
 * Shareable playground link (W-321): this page (as it is now, saved or not) and optionally the
 * Site styles, packed into a link that opens it on emvb.dev/playground. Nothing is uploaded: the
 * page travels in the link's `#` part, which browsers never send to a server.
 */
export function ShareLinkDialog({
  open,
  onOpenChange,
  layout,
  design,
  title,
  base,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: Layout | null;
  design: DesignSystem;
  title: string;
  /** Playground address; emvb.dev's by default. */
  base?: string;
}) {
  const [withStyles, setWithStyles] = React.useState(true);
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<"yes" | "no" | null>(null);
  const copyAttempt = React.useRef(0);

  React.useEffect(() => {
    if (!open || !layout) return;
    let cancelled = false;
    setLink(null);
    setError(null);
    setCopied(null);
    encodeSharedPage({ title, layout, ...(withStyles ? { design } : {}) }).then(
      (encoded) => {
        if (!cancelled) setLink(shareUrl(encoded, base));
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      cancelled = true;
      copyAttempt.current += 1;
    };
  }, [open, layout, design, title, withStyles, base]);

  const copy = () => {
    if (!link) return;
    const attempt = ++copyAttempt.current;
    const reportCopy = (result: "yes" | "no") => {
      if (attempt === copyAttempt.current) setCopied(result);
    };
    if (!navigator.clipboard?.writeText) {
      reportCopy("no");
      return;
    }
    navigator.clipboard.writeText(link).then(
      () => reportCopy("yes"),
      () => reportCopy("no"),
    );
  };

  const siteMedia = layout ? siteOnlyMedia(layout, withStyles ? design : undefined) : 0;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6 emvb-share" data-emvb-share="">
        <div className="emvb-dialog" data-emvb-dialog="share">
          <Dialog.Title>Share as a playground link</Dialog.Title>
          <Dialog.Description>
            Anyone with the link can open a copy of this page in the EmVB playground and edit it in
            their own browser. The page travels inside the link; nothing is uploaded.
          </Dialog.Description>
          <Switch
            label="Include Site styles (colours, fonts, sizes, classes)"
            checked={withStyles}
            onCheckedChange={(checked) => setWithStyles(checked === true)}
          />
          {error ? (
            <p className="emvb-helper" role="alert">
              Couldn't build the link: {error}
            </p>
          ) : (
            <Input
              label="Link"
              className={FIELD}
              readOnly
              value={link ?? "Building the link…"}
              data-emvb-share-link=""
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
          {link && (
            <p className="emvb-helper" data-emvb-share-size="">
              {link.length.toLocaleString("en")} characters
              {link.length > LONG_LINK_CHARS
                ? ". That's long: some chat apps cut links this size, so paste it somewhere that keeps it whole."
                : "."}
            </p>
          )}
          {siteMedia > 0 && (
            <p className="emvb-helper" data-emvb-share-media="">
              {siteMedia === 1 ? "1 image or video uses" : `${siteMedia} images or videos use`} an
              address on this site only, so the playground shows {siteMedia === 1 ? "it" : "them"}{" "}
              empty.
            </p>
          )}
          <p className="emvb-helper">
            Unsaved changes are included. Posts, forms and uploads stay on this site.
          </p>
          <div className="emvb-dialog-actions">
            {copied && (
              <span role="status" className="emvb-helper">
                {copied === "yes"
                  ? "Copied."
                  : "Copy didn't work here: select the link and copy it."}
              </span>
            )}
            <DialogCloseButton>Close</DialogCloseButton>
            <Button
              variant="primary"
              className={BUTTON}
              disabled={!link}
              onClick={copy}
              data-emvb-share-copy=""
            >
              Copy link
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

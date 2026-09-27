import { LinkButton, Text } from "@cloudflare/kumo";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { summarizeLayout } from "../../core/index.ts";
import { PAGES_COLLECTION, PLUGIN_ID } from "../../constants.ts";

export type FieldWidgetProps = {
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
  id: string;
  required?: boolean;
  options?: Record<string, unknown>;
  minimal?: boolean;
};

function parse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/** The entry id from `/_emdash/admin/content/emvb_pages/<id>`; field widgets don't receive it. */
export function entryIdFromLocation(pathname: string): string | undefined {
  const match = new RegExp(`/content/${PAGES_COLLECTION}/([^/?#]+)`).exec(pathname);
  const id = match?.[1];
  return id && id !== "new" ? decodeURIComponent(id) : undefined;
}

/**
 * Read-only widget for the hidden collection's `layout` field (D-019). It summarises the page and
 * links to EmVB. It has no inputs and never calls `onChange`, so the JSON can't be hand-edited here.
 */
export function LayoutField({ value, label, id }: FieldWidgetProps) {
  const summary = summarizeLayout(parse(value));
  const entryId = entryIdFromLocation(window.location.pathname);
  const href = entryId
    ? `/_emdash/admin/plugins/${PLUGIN_ID}/editor?entry=${encodeURIComponent(entryId)}`
    : `/_emdash/admin/plugins/${PLUGIN_ID}/pages`;
  const description = !summary
    ? "This page has no content yet."
    : `${summary.nodes} ${summary.nodes === 1 ? "element" : "elements"} · schema ${summary.schemaVersion ?? "unknown"}`;
  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      data-emvb-widget="layout"
      className="flex flex-col gap-2"
    >
      <Text variant="secondary">{label}</Text>
      <Text>{description}</Text>
      <Text variant="secondary">This page is edited in EmVB.</Text>
      <div>
        <LinkButton
          href={href}
          variant="secondary"
          icon={<ArrowSquareOutIcon aria-hidden="true" />}
        >
          {entryId ? "Open in EmVB" : "Go to Visual pages"}
        </LinkButton>
      </div>
    </div>
  );
}

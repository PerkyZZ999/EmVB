import { Button } from "@cloudflare/kumo";
import * as React from "react";
import { getBundledIcon, sanitizeSvgMarkup, type LayoutNode } from "../../../../core/index.ts";
import { serialize, type VNode } from "../../../../core/render/vnode.ts";
import type { Fetcher } from "../../../api.ts";
import { BUTTON } from "../../../ui.ts";
import { IconLibraryDialog } from "../../icons/IconLibraryDialog.tsx";
import {
  ICON_SETS,
  locateIcon,
  UPLOADS,
  UPLOADS_CATEGORY,
  type LibraryIcon,
} from "../../icons/library.ts";

const propsOf = (node: LayoutNode): Record<string, unknown> =>
  node.props as Record<string, unknown>;

const withProps = (node: LayoutNode, patch: Record<string, unknown>): LayoutNode => {
  const props = { ...propsOf(node), ...patch };
  return { ...node, props } as LayoutNode;
};

const preview = (tree: VNode): string =>
  serialize({
    tag: "svg",
    attrs: {
      viewBox: "0 0 24 24",
      ...tree.attrs,
      width: "20",
      height: "20",
      "aria-hidden": "true",
      focusable: "false",
    },
    children: tree.children,
  });

/** The 20px preview of the stored icon: its saved SVG, else the bundled glyph. */
export function currentIconPreview(iconId: string, iconSvg: unknown): string {
  const picked = typeof iconSvg === "string" && iconSvg ? sanitizeSvgMarkup(iconSvg) : undefined;
  if (picked) return preview(picked);
  const bundled = getBundledIcon(iconId);
  if (!bundled) return "";
  return preview({
    tag: "svg",
    attrs: {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    children: bundled.children.map((child) => ({
      tag: child.tag,
      attrs: { ...child.attrs },
      children: [],
    })),
  });
}

/** "fa-solid:arrow-right" → "Arrow right"; a bundled id gives its own label. */
export function iconNameLabel(iconId: string): string {
  const bundled = getBundledIcon(iconId);
  if (bundled) return bundled.label;
  const name = iconId.slice(iconId.indexOf(":") + 1).replaceAll("-", " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "Font Awesome · Solid" for a stored id, or undefined when the id names no known set. */
function sourceLabel(iconId: string): string | undefined {
  const at = locateIcon(iconId);
  if (!at) return undefined;
  if (at.set === UPLOADS) return UPLOADS_CATEGORY.label;
  const set = ICON_SETS.find((item) => item.id === at.set);
  if (!set) return undefined;
  const style = set.styles.find((item) => item.id === at.style);
  return style && style.label !== set.label ? `${set.label} · ${style.label}` : set.label;
}

/**
 * The Icon element's icon field (W-025 / W-236): the current icon and a button that opens the
 * icon library. Inserting stores the set-prefixed id (so the library reopens on it) and the
 * icon's SVG (so the published page needs no icon set).
 */
export function IconPicker({
  node,
  fetcher,
  onChange,
}: {
  node: LayoutNode;
  /** Enables My uploads in the library (W-239). */
  fetcher?: Fetcher;
  onChange: (node: LayoutNode) => void;
}) {
  const props = propsOf(node);
  const current = typeof props.iconId === "string" ? props.iconId : "";
  const [open, setOpen] = React.useState(false);
  const field = React.useRef<HTMLDivElement | null>(null);
  // However the library closes (Insert, Close, Escape), focus comes back to Choose. Done once the
  // dialog has finished closing: during its exit animation the focus trap still holds focus.
  const refocus = () =>
    field.current?.querySelector<HTMLButtonElement>("[data-emvb-icon-open]")?.focus();
  const markup = currentIconPreview(current, props.iconSvg);
  // An upload's id is random; its title names it (set from the file name on insert).
  const name =
    current && locateIcon(current)?.set === UPLOADS
      ? (typeof props.title === "string" && props.title) || UPLOADS_CATEGORY.label
      : current
        ? iconNameLabel(current)
        : undefined;
  const source = current ? sourceLabel(current) : undefined;

  const insert = (icon: LibraryIcon) => {
    const title = typeof props.title === "string" ? props.title : "";
    const previous = name?.toLowerCase();
    const patch: Record<string, unknown> = { iconId: icon.id, iconSvg: icon.markup };
    // Keep the title in step with the glyph while it is still a default or the old icon's name
    // (new Icon elements ship title "Star" with iconId "star"); a written title stays.
    if (!title || title === "Icon" || title.toLowerCase() === previous) patch.title = icon.label;
    onChange(withProps(node, patch));
  };

  return (
    <div ref={field} className="emvb-field-group" data-emvb-field="iconId" data-emvb-icon-picker="">
      <span className="emvb-field-label">Icon</span>
      <div className="emvb-icon-current" data-emvb-icon-current={current}>
        <button
          type="button"
          className="emvb-icon-current-preview"
          aria-label={`Change icon (now ${name ?? "none"})`}
          onClick={() => setOpen(true)}
        >
          {markup ? (
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
          ) : (
            <span aria-hidden="true">?</span>
          )}
        </button>
        <span className="emvb-icon-current-text">
          <strong>{name ?? "No icon"}</strong>
          <span>
            {markup
              ? (source ?? "Saved SVG")
              : current
                ? "Not found — choose another"
                : "Choose one"}
          </span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          className={BUTTON}
          data-emvb-icon-open=""
          onClick={() => setOpen(true)}
        >
          Choose…
        </Button>
      </div>
      <IconLibraryDialog
        open={open}
        onOpenChange={setOpen}
        onClosed={refocus}
        currentId={current || undefined}
        fetcher={fetcher}
        onInsert={insert}
      />
    </div>
  );
}

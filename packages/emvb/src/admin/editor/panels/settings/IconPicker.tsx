import { Input } from "@cloudflare/kumo";
import * as React from "react";
import { BUNDLED_ICONS, getBundledIcon, type LayoutNode } from "../../../../core/index.ts";
import { serialize, type VNode } from "../../../../core/render/vnode.ts";
import { FIELD } from "../../../ui.ts";

const propsOf = (node: LayoutNode): Record<string, unknown> =>
  node.props as Record<string, unknown>;

const withProps = (node: LayoutNode, patch: Record<string, unknown>): LayoutNode => {
  const props = { ...propsOf(node), ...patch };
  return { ...node, props } as LayoutNode;
};

function previewSvg(iconId: string): string {
  const icon = getBundledIcon(iconId);
  if (!icon) return "";
  const children: VNode[] = icon.children.map((child) => ({
    tag: child.tag,
    attrs: { ...child.attrs },
    children: [],
  }));
  return serialize({
    tag: "svg",
    attrs: {
      xmlns: "http://www.w3.org/2000/svg",
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    children,
  });
}

/** Lucide icon grid for the Icon element (W-025 / A-04). */
export function IconPicker({
  node,
  onChange,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
}) {
  const current = typeof propsOf(node).iconId === "string" ? String(propsOf(node).iconId) : "";
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const matched = BUNDLED_ICONS.filter(
    (icon) => !q || icon.id.includes(q) || icon.label.toLowerCase().includes(q),
  );

  return (
    <div className="emvb-field-group" data-emvb-field="iconId" data-emvb-icon-picker="">
      <Input
        label="Search icons"
        className={FIELD}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search icons"
      />
      {matched.length === 0 ? (
        <p className="emvb-helper">No icons match &quot;{query.trim()}&quot;.</p>
      ) : (
        <ul className="emvb-icon-grid" role="listbox" aria-label="Icons">
          {matched.map((icon) => {
            const selected = icon.id === current;
            return (
              <li key={icon.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="emvb-icon-tile"
                  data-emvb-icon-id={icon.id}
                  data-selected={selected ? "true" : undefined}
                  onClick={() => {
                    const title = propsOf(node).title;
                    const previous = getBundledIcon(current)?.label;
                    const patch: Record<string, unknown> = { iconId: icon.id };
                    // Keep title in sync with the glyph when it still matches the prior
                    // default/label (defaults ship title "Star" with iconId "star").
                    if (
                      !title ||
                      title === "Icon" ||
                      (previous !== undefined && title === previous)
                    ) {
                      patch.title = icon.label;
                    }
                    onChange(withProps(node, patch));
                  }}
                >
                  <span
                    className="emvb-icon-preview"
                    dangerouslySetInnerHTML={{ __html: previewSvg(icon.id) }}
                  />
                  <span>{icon.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { SquaresFourIcon, TextHIcon } from "@phosphor-icons/react";
import type { Layout, LayoutNode } from "../../../core/index.ts";
import { ELEMENT_NAMES } from "./ElementPanel.tsx";

const ICONS: Record<string, typeof TextHIcon> = { heading: TextHIcon, container: SquaresFourIcon };

const rows = (node: LayoutNode, depth: number): Array<{ node: LayoutNode; depth: number }> => [
  { node, depth },
  ...(node.type === "container" ? node.children.flatMap((child) => rows(child, depth + 1)) : []),
];

/** The Layers list (IA). The Add tab and drag and drop arrive with S2 (R-003). */
export function LayersPanel({
  layout,
  selectedId,
  onSelect,
}: {
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="emvb-panel-body">
      <h2 className="emvb-panel-title">Layers</h2>
      {layout ? (
        <ul className="emvb-layers" aria-label="Layers">
          {rows(layout.root, 0).map(({ node, depth }) => {
            const Icon = ICONS[node.type] ?? SquaresFourIcon;
            const name = ELEMENT_NAMES[node.type] ?? node.type;
            return (
              <li key={node.id}>
                <button
                  type="button"
                  className="emvb-layer-row"
                  aria-current={node.id === selectedId ? "true" : undefined}
                  style={{ paddingLeft: 8 + depth * 12 }}
                  onClick={() => onSelect(node.id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{name}</span>
                  {node.type === "heading" && node.props.text && (
                    <span className="emvb-layer-preview">{node.props.text}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="emvb-helper">This page is empty.</p>
      )}
    </div>
  );
}

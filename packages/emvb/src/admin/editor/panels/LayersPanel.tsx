import { CaretDownIcon, CaretRightIcon, SquaresFourIcon, TextHIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  firstChild,
  isParentNode,
  isHeadingNode,
  nextInOrder,
  parentOf,
  previousInOrder,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";
import { EXISTING_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { ELEMENT_NAMES } from "./ElementPanel.tsx";

const ICONS: Record<string, typeof TextHIcon> = {
  heading: TextHIcon,
  container: SquaresFourIcon,
  "div-block": SquaresFourIcon,
  flexbox: SquaresFourIcon,
};

const rows = (
  node: LayoutNode,
  depth: number,
  collapsed: Set<string>,
): Array<{ node: LayoutNode; depth: number }> => {
  const self = [{ node, depth }];
  if (!isParentNode(node) || collapsed.has(node.id) || node.children.length === 0) return self;
  return self.concat(node.children.flatMap((child) => rows(child, depth + 1, collapsed)));
};

/** Layers list (IA / W-018): tree with collapse, keyboard navigation, auto-expand to selection. */
export function LayersPanel({
  layout,
  selectedId,
  onSelect,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    if (!layout || !selectedId) return;
    setCollapsed((current) => {
      const next = new Set(current);
      let id: string | undefined = selectedId;
      while (id) {
        next.delete(id);
        id = parentOf(layout, id);
      }
      return next;
    });
  }, [layout, selectedId]);

  React.useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-emvb-layer="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (!layout) return <p className="emvb-helper">This page is empty.</p>;

  const items = rows(layout.root, 0, collapsed);
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="emvb-panel-body" data-emvb-panel="layers">
      <ul
        ref={listRef}
        className="emvb-layers"
        role="tree"
        aria-label="Layers"
        onKeyDown={(event) => {
          if (!selectedId) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            const next = nextInOrder(layout, selectedId);
            if (next) onSelect(next);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            const prev = previousInOrder(layout, selectedId);
            if (prev) onSelect(prev);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            if (collapsed.has(selectedId)) toggle(selectedId);
            else {
              const child = firstChild(layout, selectedId);
              if (child) onSelect(child);
            }
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            const node = items.find((row) => row.node.id === selectedId)?.node;
            if (
              node &&
              isParentNode(node) &&
              !collapsed.has(selectedId) &&
              node.children.length > 0
            ) {
              toggle(selectedId);
            } else {
              const parent = parentOf(layout, selectedId);
              if (parent) onSelect(parent);
            }
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) {
              const parent = parentOf(layout, selectedId);
              if (parent) onSelect(parent);
            } else {
              const child = firstChild(layout, selectedId);
              if (child) onSelect(child);
            }
          }
        }}
      >
        {items.map(({ node, depth }) => {
          const Icon = ICONS[node.type] ?? SquaresFourIcon;
          const name = ELEMENT_NAMES[node.type] ?? node.type;
          const hasChildren = isParentNode(node) && node.children.length > 0;
          const isCollapsed = collapsed.has(node.id);
          return (
            <li
              key={node.id}
              role="treeitem"
              aria-expanded={hasChildren ? !isCollapsed : undefined}
            >
              <div
                className="emvb-layer-row"
                data-emvb-layer={node.id}
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={() => onSelect(node.id)}
              >
                {hasChildren ? (
                  <span
                    className="emvb-layer-caret"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(node.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        toggle(node.id);
                      }
                    }}
                    role="button"
                    tabIndex={-1}
                    aria-label={isCollapsed ? "Expand" : "Collapse"}
                  >
                    {isCollapsed ? (
                      <CaretRightIcon size={12} aria-hidden="true" />
                    ) : (
                      <CaretDownIcon size={12} aria-hidden="true" />
                    )}
                  </span>
                ) : (
                  <span className="emvb-layer-caret" />
                )}
                <button
                  type="button"
                  className="emvb-layer-select"
                  aria-current={node.id === selectedId ? "true" : undefined}
                  draggable={node.id !== layout.root.id}
                  onDragStart={(event) => {
                    if (node.id === layout.root.id) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData(EXISTING_ELEMENT_MIME, node.id);
                    event.dataTransfer.effectAllowed = "move";
                    try {
                      sessionStorage.setItem("emvb-drag-id", node.id);
                      sessionStorage.removeItem("emvb-drag-type");
                    } catch {
                      /* private mode */
                    }
                  }}
                  onClick={() => onSelect(node.id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{name}</span>
                  {isHeadingNode(node) && node.props.text ? (
                    <span className="emvb-layer-preview">{node.props.text}</span>
                  ) : null}
                </button>
                {node.id !== layout.root.id && (
                  <span className="emvb-layer-menu">
                    <button
                      type="button"
                      className="emvb-layer-menu-btn"
                      aria-label={`Actions for ${name}`}
                      aria-expanded={menuId === node.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuId((current) => (current === node.id ? null : node.id));
                      }}
                    >
                      ···
                    </button>
                    {menuId === node.id && (
                      <div className="emvb-layer-menu-list" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuId(null);
                            onDuplicate(node.id);
                          }}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuId(null);
                            onMoveUp(node.id);
                          }}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuId(null);
                            onMoveDown(node.id);
                          }}
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="emvb-danger-text"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuId(null);
                            onDelete(node.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

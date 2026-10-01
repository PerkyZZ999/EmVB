import { CaretDownIcon, CaretRightIcon, SquaresFourIcon, TextHIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  firstChild,
  hasStateStyles,
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
import { dragStash } from "../dnd/drag-stash.ts";
import { StateDot } from "./settings/StateSwitcher.tsx";
import type { ClipboardActions } from "../useClipboardActions.ts";

const ICONS: Record<string, typeof TextHIcon> = {
  heading: TextHIcon,
  container: SquaresFourIcon,
  svg: SquaresFourIcon,
  tabs: SquaresFourIcon,
  "tab-panel": SquaresFourIcon,
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

type LayerActions = {
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDelete: (id: string) => void;
  /** Copy and paste (W-093); without it the menu has no clipboard items. */
  clipboard?: ClipboardActions;
};

type MenuItem = {
  label: string;
  run: (id: string) => void;
  className?: string;
  disabled?: boolean;
};

/** Why a paste item is disabled: nothing copied, or only a style. */
const pasteHint = (clip: ClipboardActions | undefined) =>
  clip ? (clip.pasteStyleBlocked ?? clip.pasteBlocked) : null;

/** The ··· menu: clipboard items, then Duplicate and the moves; the root row gets what applies to it. */
function menuItems(node: LayoutNode, isRoot: boolean, actions: LayerActions): MenuItem[] {
  const clip = actions.clipboard;
  const parent = isParentNode(node);
  const clipboard: MenuItem[] = clip
    ? [
        { label: "Copy", run: clip.copy },
        ...(isRoot
          ? []
          : [
              {
                label: "Paste",
                run: (id: string) => clip.paste(id),
                disabled: !!clip.pasteBlocked,
              },
            ]),
        ...(parent
          ? [
              {
                label: "Paste inside",
                run: (id: string) => clip.paste(id, "inside"),
                disabled: !!clip.pasteBlocked,
              },
            ]
          : []),
      ]
    : [];
  const style: MenuItem[] = clip
    ? [
        { label: "Copy style", run: clip.copyStyle },
        { label: "Paste style", run: clip.pasteStyle, disabled: !!clip.pasteStyleBlocked },
      ]
    : [];
  if (isRoot) return [...clipboard, ...style];
  return [
    ...clipboard,
    { label: "Duplicate", run: actions.onDuplicate },
    ...style,
    { label: "Move up", run: actions.onMoveUp },
    { label: "Move down", run: actions.onMoveDown },
    { label: "Delete", run: actions.onDelete, className: "emvb-danger-text" },
  ];
}

/** What a key does in the tree: select another row, toggle the selected one, or nothing. */
function treeKey(
  event: { key: string; shiftKey: boolean },
  layout: Layout,
  id: string,
  collapsed: Set<string>,
  node: LayoutNode | undefined,
): { select?: string; toggle?: true } | null {
  switch (event.key) {
    case "ArrowDown":
      return { select: nextInOrder(layout, id) };
    case "ArrowUp":
      return { select: previousInOrder(layout, id) };
    case "ArrowRight":
      return collapsed.has(id) ? { toggle: true } : { select: firstChild(layout, id) };
    case "ArrowLeft": {
      const open = !!node && isParentNode(node) && !collapsed.has(id) && node.children.length > 0;
      return open ? { toggle: true } : { select: parentOf(layout, id) };
    }
    case "Enter":
      return { select: event.shiftKey ? parentOf(layout, id) : firstChild(layout, id) };
    default:
      return null;
  }
}

/** Layers list (IA / W-018): tree with collapse, keyboard navigation, auto-expand to selection. */
export function LayersPanel({
  layout,
  selectedId,
  ...actions
}: {
  layout: Layout | null;
  selectedId: string | null;
} & LayerActions) {
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
          const node = items.find((row) => row.node.id === selectedId)?.node;
          const action = treeKey(event, layout, selectedId, collapsed, node);
          if (!action) return;
          event.preventDefault();
          if (action.toggle) toggle(selectedId);
          else if (action.select) actions.onSelect(action.select);
        }}
      >
        {items.map(({ node, depth }) => (
          <LayerRow
            key={node.id}
            node={node}
            depth={depth}
            isRoot={node.id === layout.root.id}
            selected={node.id === selectedId}
            collapsed={collapsed.has(node.id)}
            menuOpen={menuId === node.id}
            onToggle={() => toggle(node.id)}
            onMenu={(open) => setMenuId(open ? node.id : null)}
            actions={actions}
          />
        ))}
      </ul>
    </div>
  );
}

function LayerRow({
  node,
  depth,
  isRoot,
  selected,
  collapsed,
  menuOpen,
  onToggle,
  onMenu,
  actions,
}: {
  node: LayoutNode;
  depth: number;
  isRoot: boolean;
  selected: boolean;
  collapsed: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  onMenu: (open: boolean) => void;
  actions: LayerActions;
}) {
  const Icon = ICONS[node.type] ?? SquaresFourIcon;
  const name = ELEMENT_NAMES[node.type] ?? node.type;
  const hasChildren = isParentNode(node) && node.children.length > 0;
  return (
    <li role="treeitem" aria-expanded={hasChildren ? !collapsed : undefined}>
      <div
        className="emvb-layer-row"
        data-emvb-layer={node.id}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => actions.onSelect(node.id)}
      >
        {hasChildren ? (
          <span
            className="emvb-layer-caret"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onToggle();
              }
            }}
            role="button"
            tabIndex={-1}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
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
          aria-current={selected ? "true" : undefined}
          draggable={!isRoot}
          onDragStart={(event) => {
            if (isRoot) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.setData(EXISTING_ELEMENT_MIME, node.id);
            event.dataTransfer.effectAllowed = "move";
            dragStash.existing(node.id);
          }}
          onClick={() => actions.onSelect(node.id)}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{name}</span>
          {isHeadingNode(node) && node.props.text ? (
            <span className="emvb-layer-preview">{node.props.text}</span>
          ) : null}
          {hasStateStyles(node) && <StateDot />}
        </button>
        {(!isRoot || actions.clipboard) && (
          <span className="emvb-layer-menu">
            <button
              type="button"
              className="emvb-layer-menu-btn"
              aria-label={`Actions for ${name}`}
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                onMenu(!menuOpen);
              }}
            >
              ···
            </button>
            {menuOpen && (
              <div className="emvb-layer-menu-list" role="menu">
                {menuItems(node, isRoot, actions).map(({ label, run, className, disabled }) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    className={className}
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMenu(false);
                      run(node.id);
                    }}
                  >
                    {label}
                  </button>
                ))}
                {pasteHint(actions.clipboard) && (
                  <p className="emvb-layer-menu-hint" data-emvb-paste-hint="">
                    {pasteHint(actions.clipboard)}
                  </p>
                )}
              </div>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

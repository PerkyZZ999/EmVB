import {
  CaretDownIcon,
  CaretRightIcon,
  RowsIcon,
  SquaresFourIcon,
  TextHIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import {
  firstChild,
  hasStateStyles,
  isParentNode,
  nextInOrder,
  parentOf,
  previousInOrder,
  type Layout,
  type LayoutNode,
  nodeScript,
  SCRIPT_LABELS,
  type PageScript,
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
  "layout-section": RowsIcon,
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
  /** Sets or clears a node's editor-only name (W-157); without it rows can't be renamed. */
  onRename?: (id: string, label: string | undefined) => void;
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
/** W-311: an element that makes the page load a script says so; everything else is zero-JS. */
function JsBadge({ script }: { script: PageScript | undefined }) {
  if (!script) return null;
  return (
    <span
      className="emvb-js-badge"
      title={`Adds a script: ${SCRIPT_LABELS[script]}`}
      aria-hidden="true"
    >
      JS
    </span>
  );
}

function menuItems(
  node: LayoutNode,
  isRoot: boolean,
  actions: LayerActions,
  clip: ClipboardActions | undefined,
  rename: () => void,
): MenuItem[] {
  const naming: MenuItem[] = actions.onRename ? [{ label: "Rename", run: rename }] : [];
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
  if (isRoot) return [...naming, ...clipboard, ...style];
  return [
    ...naming,
    ...clipboard,
    { label: "Duplicate", run: actions.onDuplicate },
    ...style,
    { label: "Move up", run: actions.onMoveUp },
    { label: "Move down", run: actions.onMoveDown },
    { label: "Delete", run: actions.onDelete, className: "emvb-danger-text" },
  ];
}

/** What a key does in the tree: select another row, toggle the selected one, or nothing. */
export function treeKey(
  event: { key: string; shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  layout: Layout,
  id: string,
  collapsed: Set<string>,
  node: LayoutNode | undefined,
): { select?: string; toggle?: true } | null {
  // W-233: Alt+arrows move the element and Ctrl/⌘ keys are shortcuts; the editor-wide handler owns
  // them. Selecting here first made the move act on the newly selected row instead.
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
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

/** Whether a key or click target sits in a row's ··· button or its menu (W-258). */
const inRowMenu = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(".emvb-layer-menu") !== null;

/**
 * After a row menu action the menu is gone and focus with it (W-258): put focus on the selected
 * row, unless the action moved focus somewhere on purpose (Rename's name field).
 */
function focusSelectedRow(tree: Element | null): void {
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected) return;
  tree?.querySelector<HTMLElement>('.emvb-layer-select[aria-current="true"]')?.focus();
}

/** Layers list (IA / W-018): tree with collapse, keyboard navigation, auto-expand to selection. */

/** Props whose text tells same-type elements apart in Layers (the layer-row preview, W-143). */
const PREVIEW_PROP: Partial<Record<string, string>> = {
  heading: "text",
  text: "text",
  label: "text",
  link: "text",
  button: "text",
  "accordion-item": "summary",
  "tab-panel": "label",
  "menu-item": "text",
  // W-246: an icon's title names it ("Bell"); the default "Icon" says nothing the row doesn't.
  icon: "title",
};

/** The first line of the element's own text, or undefined when it has none. */
export function layerPreview(node: LayoutNode): string | undefined {
  const key = PREVIEW_PROP[node.type];
  if (!key) return undefined;
  const value = (node.props as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const first = value.trim().split("\n")[0]?.trim();
  if (node.type === "icon" && first?.toLowerCase() === "icon") return undefined;
  return first || undefined;
}

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
  // W-268: rows are memoized, so they get callbacks that never change and call the latest
  // actions. Selecting a row then re-renders two rows, not all of them (300+ on a long page).
  const live = React.useRef(actions);
  live.current = actions;
  const canRename = !!actions.onRename;
  const rowActions = React.useMemo<LayerActions>(
    () => ({
      onSelect: (id) => live.current.onSelect(id),
      onDuplicate: (id) => live.current.onDuplicate(id),
      onMoveUp: (id) => live.current.onMoveUp(id),
      onMoveDown: (id) => live.current.onMoveDown(id),
      onDelete: (id) => live.current.onDelete(id),
      onRename: canRename ? (id, label) => live.current.onRename?.(id, label) : undefined,
    }),
    [canRename],
  );
  const onRowMenu = React.useCallback(
    (id: string, open: boolean) => setMenuId(open ? id : null),
    [],
  );
  const toggle = React.useMemo(() => toggleIn(setCollapsed), []);

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
    // W-257: while a Layers row has focus, focus follows the selection (↑/↓, Enter).
    const active = document.activeElement;
    if (active?.classList.contains("emvb-layer-select") && listRef.current.contains(active)) {
      row?.querySelector<HTMLElement>(".emvb-layer-select")?.focus({ preventScroll: true });
    }
  }, [selectedId]);

  if (!layout) return <p className="emvb-helper">This page is empty.</p>;

  const items = rows(layout.root, 0, collapsed);

  return (
    <div className="emvb-panel-body" data-emvb-panel="layers">
      <ul
        ref={listRef}
        className="emvb-layers"
        role="tree"
        aria-label="Layers"
        onKeyDown={(event) => {
          if (!selectedId) return;
          // W-258: keys on a row's ··· button or its menu belong to them (Enter opens the menu).
          if (inRowMenu(event.target)) return;
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
            onToggle={toggle}
            onMenu={onRowMenu}
            actions={rowActions}
            hasClipboard={!!actions.clipboard}
            clip={menuId === node.id ? actions.clipboard : undefined}
          />
        ))}
      </ul>
    </div>
  );
}

/** Collapses or expands a row; the same function every render (setState is stable). */
const toggleIn =
  (setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

const LayerRow = React.memo(function LayerRow({
  node,
  depth,
  isRoot,
  selected,
  collapsed,
  menuOpen,
  onToggle: toggleRow,
  onMenu: menuRow,
  actions,
  hasClipboard,
  clip,
}: {
  node: LayoutNode;
  depth: number;
  isRoot: boolean;
  selected: boolean;
  collapsed: boolean;
  menuOpen: boolean;
  onToggle: (id: string) => void;
  onMenu: (id: string, open: boolean) => void;
  actions: LayerActions;
  /** Whether copy and paste exist (the root row's menu has only those). */
  hasClipboard: boolean;
  /** The clipboard, passed only to the row whose menu is open so the other rows stay memoized. */
  clip: ClipboardActions | undefined;
}) {
  const onToggle = () => toggleRow(node.id);
  const onMenu = (open: boolean) => menuRow(node.id, open);
  const Icon = ICONS[node.type] ?? SquaresFourIcon;
  const preview = layerPreview(node);
  const typeName = ELEMENT_NAMES[node.type] ?? node.type;
  // A label names the row in place of the type (W-157); the type stays in the tooltip.
  const name = node.label ?? typeName;
  // Names and previews truncate, so the tooltip carries them in full (DESIGN.md, W-168).
  const tooltip = node.label
    ? `${node.label} (${typeName})`
    : preview
      ? `${typeName}: ${preview}`
      : typeName;
  const hasChildren = isParentNode(node) && node.children.length > 0;
  const [renaming, setRenaming] = React.useState(false);
  const startRename = () => {
    if (actions.onRename) setRenaming(true);
  };
  // W-259: Escape in an open row menu closes it and returns to its ··· button; it doesn't also
  // reach the editor, which would clear the selection. W-260: ↑/↓/Home/End move between items.
  const menuList = React.useRef<HTMLDivElement | null>(null);
  const menuItemsEls = () =>
    [...(menuList.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(
      (item) => !(item as HTMLButtonElement).disabled,
    );
  React.useEffect(() => {
    if (menuOpen) menuItemsEls()[0]?.focus();
  }, [menuOpen]);
  const menuKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!menuOpen) {
      if (
        event.key === "ArrowDown" &&
        event.currentTarget.classList.contains("emvb-layer-menu-btn")
      ) {
        event.preventDefault();
        onMenu(true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onMenu(false);
      const button = event.currentTarget
        .closest(".emvb-layer-menu")
        ?.querySelector<HTMLElement>(".emvb-layer-menu-btn");
      button?.focus();
      return;
    }
    const items = menuItemsEls();
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (at + 1) % items.length
        : event.key === "ArrowUp"
          ? (at <= 0 ? items.length : at) - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  };
  // W-256: Enter or Escape hands focus back to the row; leaving by click keeps the new focus.
  const selectButton = React.useRef<HTMLButtonElement | null>(null);
  const refocus = React.useRef(false);
  React.useEffect(() => {
    if (renaming || !refocus.current) return;
    refocus.current = false;
    selectButton.current?.focus();
  }, [renaming]);
  const finishRename = (text: string | null, byKey = false) => {
    refocus.current = byKey;
    setRenaming(false);
    if (text === null || !actions.onRename) return;
    const next = text.trim().slice(0, 80) || undefined;
    if (next !== node.label) actions.onRename(node.id, next);
  };
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
        {renaming ? (
          <RenameInput initial={node.label ?? ""} placeholder={typeName} onDone={finishRename} />
        ) : (
          <button
            ref={selectButton}
            type="button"
            className="emvb-layer-select"
            aria-current={selected ? "true" : undefined}
            title={tooltip}
            data-emvb-layer-label={node.label ? "" : undefined}
            onDoubleClick={startRename}
            onKeyDown={(event) => {
              if (event.key === "F2") {
                event.preventDefault();
                event.stopPropagation();
                startRename();
              }
            }}
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
            <span className="emvb-layer-name">{name}</span>
            {preview ? <span className="emvb-layer-preview">{preview}</span> : null}
            {hasStateStyles(node) && <StateDot />}
            <JsBadge script={nodeScript(node)} />
          </button>
        )}
        {(!isRoot || hasClipboard) && (
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
              onKeyDown={menuKeys}
            >
              ···
            </button>
            {menuOpen && (
              <div ref={menuList} className="emvb-layer-menu-list" role="menu" onKeyDown={menuKeys}>
                {menuItems(node, isRoot, actions, clip, startRename).map(
                  ({ label, run, className, disabled }) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      className={className}
                      disabled={disabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        const tree = event.currentTarget.closest('[role="tree"]');
                        onMenu(false);
                        run(node.id);
                        window.setTimeout(() => focusSelectedRow(tree), 0);
                      }}
                    >
                      {label}
                    </button>
                  ),
                )}
                {pasteHint(clip) && (
                  <p className="emvb-layer-menu-hint" data-emvb-paste-hint="">
                    {pasteHint(clip)}
                  </p>
                )}
              </div>
            )}
          </span>
        )}
      </div>
    </li>
  );
});

/** The inline name field (W-157): Enter or leaving saves, Escape cancels, empty clears the name. */
function RenameInput({
  initial,
  placeholder,
  onDone,
}: {
  initial: string;
  placeholder: string;
  onDone: (text: string | null, byKey?: boolean) => void;
}) {
  const [text, setText] = React.useState(initial);
  const done = React.useRef(false);
  const finish = (value: string | null, byKey = false) => {
    if (done.current) return;
    done.current = true;
    onDone(value, byKey);
  };
  return (
    <input
      className="emvb-layer-rename"
      aria-label="Layer name"
      data-emvb-layer-rename=""
      value={text}
      placeholder={placeholder}
      maxLength={80}
      ref={(el) => {
        if (el && !done.current && document.activeElement !== el) {
          el.focus();
          el.select();
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => finish(text)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(text, true);
        if (event.key === "Escape") finish(null, true);
      }}
    />
  );
}

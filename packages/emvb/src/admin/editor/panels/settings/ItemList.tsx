import { Button } from "@cloudflare/kumo";
import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { MAX_TABS, type FieldDescriptor, type LayoutNode } from "../../../../core/index.ts";
import { BUTTON } from "../../../ui.ts";
import { newAccordionItem, newTabPanel } from "../../dnd/new-element.ts";
import { DraftTextField } from "./DraftTextField.tsx";

/** Layout operations the list runs through the editor, so limits, history and Restore apply. */
export type ItemActions = {
  add: (parentId: string, node: LayoutNode) => void;
  /** Deletes with the editor's usual confirm and Restore toast. */
  remove: (id: string) => void;
  move: (id: string, direction: "up" | "down") => void;
};

type Kind = {
  noun: string;
  field: (n: number) => FieldDescriptor;
  make: (n: number) => LayoutNode;
  max?: number;
};

const KINDS: Record<string, Kind> = {
  accordion: {
    noun: "item",
    field: (n) => ({ key: "summary", kind: "text", label: `Item ${n} title` }),
    make: (n) => newAccordionItem(n),
  },
  tabs: {
    noun: "tab",
    field: (n) => ({ key: "label", kind: "text", label: `Tab ${n} label` }),
    make: (n) => newTabPanel(n),
    max: MAX_TABS,
  },
};

/** True for the elements whose Content tab is a list of their items (W-130). */
export const hasItemList = (type: string) => type in KINDS;

const childrenOf = (node: LayoutNode): LayoutNode[] =>
  "children" in node && Array.isArray(node.children) ? (node.children as LayoutNode[]) : [];

/** Fallback when no editor actions are wired (isolated panels): plain edits of the parent. */
function localActions(node: LayoutNode, onChange: (node: LayoutNode) => void): ItemActions {
  const kids = childrenOf(node);
  const set = (children: LayoutNode[]) => onChange({ ...node, children } as LayoutNode);
  return {
    add: (_parentId, child) => set([...kids, child]),
    remove: (id) => set(kids.filter((child) => child.id !== id)),
    move: (id, direction) => {
      const from = kids.findIndex((child) => child.id === id);
      const to = direction === "up" ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= kids.length) return;
      const next = [...kids];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      set(next);
    },
  };
}

/**
 * Accordion items or Tabs panels as a list: title, edit (select it), move, delete, and Add
 * (W-130). Each item's content is its child elements, edited on the canvas.
 */
export function ItemList({
  node,
  onChange,
  onSelect,
  actions,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
  onSelect: (id: string) => void;
  actions?: ItemActions;
}) {
  const kind = KINDS[node.type];
  const kids = childrenOf(node);
  // An added item's title field takes focus with its text selected, so typing names it (W-154).
  const listRef = React.useRef<HTMLDivElement>(null);
  const focusNew = React.useRef<string | null>(null);
  const ids = kids.map((child) => child.id).join(" ");
  React.useEffect(() => {
    const id = focusNew.current;
    if (!id || !ids.split(" ").includes(id)) return;
    focusNew.current = null;
    const field = listRef.current?.querySelector<HTMLInputElement>(
      `[data-emvb-item="${id}"] input`,
    );
    field?.focus();
    field?.select();
  }, [ids]);
  if (!kind) return null;
  const run = actions ?? localActions(node, onChange);
  const Noun = kind.noun === "tab" ? "Tab" : "Item";
  const full = kind.max !== undefined && kids.length >= kind.max;
  return (
    <div className="emvb-item-list" data-emvb-item-list={node.type} ref={listRef}>
      <h3 className="emvb-section-label">{kind.noun === "tab" ? "Tabs" : "Items"}</h3>
      {kids.length === 0 ? (
        <p className="emvb-helper" data-emvb-item-empty="">
          {kind.noun === "tab"
            ? "No tabs yet. Add a tab, then put elements in its panel on the canvas."
            : "No items yet. Add an item, then put elements in its body on the canvas."}
        </p>
      ) : (
        <ol className="emvb-trigger-list">
          {kids.map((child, index) => {
            const n = index + 1;
            return (
              <li key={child.id} className="emvb-item-row" data-emvb-item={child.id}>
                <DraftTextField
                  field={kind.field(n)}
                  node={child}
                  onChange={(next) =>
                    onChange({
                      ...node,
                      children: kids.map((k) => (k.id === next.id ? next : k)),
                    } as LayoutNode)
                  }
                />
                <div className="emvb-item-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    shape="square"
                    className={BUTTON}
                    aria-label={`Edit ${kind.noun} ${n}`}
                    title={`Select ${kind.noun} ${n} to edit its settings and content`}
                    icon={<PencilSimpleIcon aria-hidden="true" />}
                    onClick={() => onSelect(child.id)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    shape="square"
                    className={BUTTON}
                    aria-label={`Move ${kind.noun} ${n} up`}
                    title={`Move ${kind.noun} ${n} up`}
                    disabled={index === 0}
                    icon={<ArrowUpIcon aria-hidden="true" />}
                    onClick={() => run.move(child.id, "up")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    shape="square"
                    className={BUTTON}
                    aria-label={`Move ${kind.noun} ${n} down`}
                    title={`Move ${kind.noun} ${n} down`}
                    disabled={index === kids.length - 1}
                    icon={<ArrowDownIcon aria-hidden="true" />}
                    onClick={() => run.move(child.id, "down")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    shape="square"
                    className={BUTTON}
                    aria-label={`Delete ${kind.noun} ${n}`}
                    title={`Delete ${kind.noun} ${n}`}
                    icon={<TrashIcon aria-hidden="true" />}
                    onClick={() => run.remove(child.id)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Button
        type="button"
        variant="secondary"
        className={BUTTON}
        icon={<PlusIcon aria-hidden="true" />}
        disabled={full}
        onClick={() => {
          const fresh = kind.make(kids.length + 1);
          focusNew.current = fresh.id;
          run.add(node.id, fresh);
        }}
      >
        {`Add ${kind.noun}`}
      </Button>
      {full && (
        <p className="emvb-helper">
          {Noun}s can show up to {kind.max} {kind.noun}s.
        </p>
      )}
    </div>
  );
}

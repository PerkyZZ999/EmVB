import { Button, Input } from "@cloudflare/kumo";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { componentProvider } from "@perkyzz/emvb-provider-api";
import { newNodeId, type LayoutNode, type ProviderNode } from "../../../../core/index.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
const clone = (node: ProviderNode): ProviderNode => ({
  ...node,
  id: newNodeId(),
  children: node.children?.map((child) => clone(child as ProviderNode)),
});
export function ProviderCollectionEditor({
  node: raw,
  onChange,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
}) {
  if (raw.type !== "provider") return null;
  const node = raw as ProviderNode;
  const provider = componentProvider(node.provider);
  const config = provider?.collections?.find((item) => item.parentComponent === node.component);
  if (!provider || !config) return null;
  const children = (node.children ?? []) as ProviderNode[];
  const change = (next: ProviderNode[]) => onChange({ ...node, children: next });
  const update = (id: string, key: string, value: string | boolean) =>
    change(
      children.map((child) =>
        child.id === id ? { ...child, props: { ...child.props, [key]: value } } : child,
      ),
    );
  return (
    <section data-emvb-provider-items={`${node.provider}:${node.component}`}>
      <h3>{config.itemLabel}s</h3>
      {children.map((child, index) => (
        <div key={child.id} className="emvb-item-row">
          <strong>
            {config.itemLabel} {index + 1}
          </strong>
          {config.fields.map((key) =>
            typeof child.props[key] === "boolean" ? (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={child.props[key] === true}
                  onChange={(event) => update(child.id, key, event.target.checked)}
                />
                {key}
              </label>
            ) : (
              <Input
                key={key}
                label={key}
                className={FIELD}
                value={String(child.props[key] ?? "")}
                onChange={(event) => update(child.id, key, event.target.value)}
              />
            ),
          )}
          {config.allowReorder !== false && (
            <>
              <Button
                className={BUTTON}
                disabled={index === 0}
                onClick={() => {
                  const next = [...children];
                  const above = next[index - 1];
                  const current = next[index];
                  if (above && current) next.splice(index - 1, 2, current, above);
                  change(next);
                }}
              >
                <ArrowUpIcon />
                Up
              </Button>
              <Button
                className={BUTTON}
                disabled={index === children.length - 1}
                onClick={() => {
                  const next = [...children];
                  const current = next[index];
                  const below = next[index + 1];
                  if (current && below) next.splice(index, 2, below, current);
                  change(next);
                }}
              >
                <ArrowDownIcon />
                Down
              </Button>
            </>
          )}
          {config.allowDuplicate !== false && (
            <Button
              className={BUTTON}
              onClick={() => {
                const next = [...children];
                next.splice(index + 1, 0, clone(child));
                change(next);
              }}
            >
              <CopyIcon />
              Duplicate
            </Button>
          )}
          {config.allowRemove !== false && (
            <Button
              className={BUTTON}
              onClick={() => change(children.filter((item) => item.id !== child.id))}
            >
              <TrashIcon />
              Delete
            </Button>
          )}
        </div>
      ))}
      {config.allowAdd !== false && (
        <Button
          className={BUTTON}
          onClick={() =>
            change([...children, config.createItem(newNodeId(), children.length) as ProviderNode])
          }
        >
          <PlusIcon />
          Add {config.itemLabel}
        </Button>
      )}
    </section>
  );
}

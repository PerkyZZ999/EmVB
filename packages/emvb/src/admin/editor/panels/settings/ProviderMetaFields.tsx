import { Input, Select } from "@cloudflare/kumo";
import { componentProvider, type ProviderMetaFieldDescriptor } from "@perkyzz/emvb-provider-api";
import type { LayoutNode, ProviderNode } from "../../../../core/index.ts";
import { FIELD } from "../../../ui.ts";
const update = (
  node: ProviderNode,
  key: string,
  value: string | boolean | undefined,
): ProviderNode => {
  const providerMeta: Record<string, string | number | boolean> = { ...node.providerMeta };
  if (value === "" || value === undefined) delete providerMeta[key];
  else providerMeta[key] = value;
  return { ...node, providerMeta: Object.keys(providerMeta).length ? providerMeta : undefined };
};
function MetaField({
  field,
  node,
  onChange,
}: {
  field: ProviderMetaFieldDescriptor;
  node: ProviderNode;
  onChange: (node: LayoutNode) => void;
}) {
  const raw = node.providerMeta?.[field.key];
  if (field.kind === "select")
    return (
      <Select
        label={field.label}
        className={FIELD}
        value={typeof raw === "string" ? raw : ""}
        onValueChange={(value: string | null) =>
          onChange(update(node, field.key, value === null ? undefined : value))
        }
      >
        {(field.options ?? []).map((option) => (
          <Select.Option key={option.value || "inherit"} value={option.value}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
    );
  if (field.kind === "boolean")
    return (
      <label>
        <input
          type="checkbox"
          checked={raw === true}
          onChange={(event) => onChange(update(node, field.key, event.target.checked || undefined))}
        />
        {field.label}
      </label>
    );
  return (
    <Input
      label={field.label}
      className={FIELD}
      value={typeof raw === "string" ? raw : ""}
      onChange={(event) => onChange(update(node, field.key, event.target.value || undefined))}
    />
  );
}
export function ProviderMetaFields({
  node,
  onChange,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
}) {
  if (node.type !== "provider") return null;
  const providerNode = node as ProviderNode;
  const fields = componentProvider(providerNode.provider)?.metaFields ?? [];
  if (fields.length === 0) return null;
  return (
    <div data-emvb-provider-meta={providerNode.provider}>
      {fields.map((field) => (
        <MetaField key={field.key} field={field} node={providerNode} onChange={onChange} />
      ))}
    </div>
  );
}

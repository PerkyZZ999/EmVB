import { Select, Switch } from "@cloudflare/kumo";
import type { FieldDescriptor, LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { FIELD } from "../../../ui.ts";
import { DraftTextField } from "./DraftTextField.tsx";
import { FieldBindControl } from "./FieldBindControl.tsx";
import { FormBindControl } from "./FormBindControl.tsx";
import { LoopItemBindControl } from "./LoopItemBindControl.tsx";
import { IconPicker } from "./IconPicker.tsx";
import { MediaPicker } from "./MediaPicker.tsx";
import { propsOf, withProp } from "./node-props.ts";

/** Content-tab control driven by a FieldDescriptor (W-021 / W-024). */
export function FieldControl({
  field,
  node,
  onChange,
  fetcher,
  parentFormId,
}: {
  field: FieldDescriptor;
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
  /** Required for media library / upload fields (W-024). */
  fetcher?: Fetcher;
  /** Enclosing form's formId for field pickers (W-036). */
  parentFormId?: string;
}) {
  const props = propsOf(node);
  const raw = props[field.key];

  if (field.key === "formId" && fetcher) {
    return (
      <FormBindControl
        key={field.key}
        value={typeof raw === "string" ? raw : ""}
        fetcher={fetcher}
        onChange={(formId) => onChange(withProp(node, "formId", formId))}
      />
    );
  }

  if (field.key === "itemPartId" && fetcher) {
    return (
      <LoopItemBindControl
        key={field.key}
        value={typeof raw === "string" ? raw : ""}
        fetcher={fetcher}
        onChange={(itemPartId) => onChange(withProp(node, "itemPartId", itemPartId || undefined))}
      />
    );
  }

  if (field.key === "field" && fetcher) {
    return (
      <FieldBindControl
        key={field.key}
        value={typeof raw === "string" ? raw : ""}
        formId={parentFormId}
        fetcher={fetcher}
        onChange={(name) => onChange(withProp(node, "field", name))}
      />
    );
  }

  if (field.kind === "icon") {
    return <IconPicker key={field.key} node={node} onChange={onChange} />;
  }

  if (field.kind === "media") {
    if (!fetcher) {
      return (
        <p key={field.key} className="emvb-helper" data-emvb-field={field.key}>
          Media library needs a signed-in session.
        </p>
      );
    }
    return <MediaPicker key={field.key} node={node} fetcher={fetcher} onChange={onChange} />;
  }

  if (field.kind === "boolean") {
    return (
      <div className="emvb-field-group" data-emvb-field={field.key}>
        <Switch
          label={field.label}
          checked={Boolean(raw)}
          onCheckedChange={(checked) => onChange(withProp(node, field.key, checked || undefined))}
        />
      </div>
    );
  }

  if (field.kind === "select" && field.options) {
    const value = raw ?? field.options[0]?.value ?? "";
    return (
      <div data-emvb-field={field.key}>
        <Select
          label={field.label}
          className={FIELD}
          value={String(value)}
          onValueChange={(next) => {
            const option = field.options?.find((o) => String(o.value) === String(next));
            onChange(withProp(node, field.key, option ? option.value : next));
          }}
          renderValue={(current: unknown) =>
            field.options?.find((o) => String(o.value) === String(current))?.label ??
            String(current)
          }
        >
          {field.options.map((option) => (
            <Select.Option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      </div>
    );
  }

  return <DraftTextField field={field} node={node} onChange={onChange} />;
}

/** Field kinds the panel implements — coverage tests assert this stays complete. */
export const IMPLEMENTED_FIELD_KINDS = [
  "text",
  "textarea",
  "number",
  "int",
  "select",
  "boolean",
  "href",
  "media",
  "icon",
  "list-items",
] as const;

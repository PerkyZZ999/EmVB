import * as React from "react";
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
  device = "desktop",
  duplicateName = false,
}: {
  field: FieldDescriptor;
  node: LayoutNode;
  /** The canvas device: a field with `devices` edits that device's value (W-139). */
  device?: "desktop" | "tablet" | "mobile";
  onChange: (node: LayoutNode) => void;
  /** Required for media library / upload fields (W-024). */
  fetcher?: Fetcher;
  /** Enclosing form's formId for field pickers (W-036). */
  parentFormId?: string;
  /** Another control in the same form uses this field name (W-194). */
  duplicateName?: boolean;
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

  if (field.key === "partId" && node.type === "section" && fetcher) {
    return (
      <LoopItemBindControl
        key={field.key}
        value={typeof raw === "string" ? raw : ""}
        fetcher={fetcher}
        partType="section"
        label="Section part"
        emptyLabel="Inline section"
        marker="section"
        onChange={(partId) => onChange(withProp(node, "partId", partId || undefined))}
      />
    );
  }

  if (field.key === "field" && fetcher) {
    return (
      <React.Fragment key={field.key}>
        <FieldBindControl
          key={field.key}
          value={typeof raw === "string" ? raw : ""}
          formId={parentFormId}
          fetcher={fetcher}
          onChange={(name, label) => {
            const next = withProp(node, "field", name);
            onChange(label ? withProp(next, "label", label) : next);
          }}
        />
        {duplicateName && (
          <p className="emvb-inline-error" role="alert" data-emvb-duplicate-field>
            Another field in this form uses this name, so only one value is submitted. Give each
            field its own name.
          </p>
        )}
      </React.Fragment>
    );
  }

  if (field.kind === "icon") {
    return <IconPicker key={field.key} node={node} fetcher={fetcher} onChange={onChange} />;
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

  if (field.kind === "select" && field.options && field.devices) {
    return (
      <DeviceSelectField
        field={field}
        devices={field.devices}
        node={node}
        device={device}
        onChange={onChange}
      />
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

const DEVICE_NAMES = { tablet: "tablet", mobile: "mobile" } as const;

/**
 * A select with tablet and mobile values (W-139): on Desktop it edits the field and lists the
 * device values under it; on Tablet or Mobile it edits that device's value, where the first
 * option follows the next wider device.
 */
function DeviceSelectField({
  field,
  devices,
  node,
  device,
  onChange,
}: {
  field: FieldDescriptor;
  devices: { tablet: string; mobile: string };
  node: LayoutNode;
  device: "desktop" | "tablet" | "mobile";
  onChange: (node: LayoutNode) => void;
}) {
  const props = propsOf(node);
  const options = field.options ?? [];
  const labelOf = (value: unknown) =>
    options.find((o) => String(o.value) === String(value))?.label ?? String(value);
  const desktop = props[field.key] ?? options[0]?.value;
  const tablet = props[devices.tablet];
  const mobile = props[devices.mobile];
  if (device === "desktop") {
    const notes = [
      tablet !== undefined ? `Tablet ${labelOf(tablet)}` : null,
      mobile !== undefined ? `Mobile ${labelOf(mobile)}` : null,
    ].filter((note): note is string => note !== null);
    return (
      <div data-emvb-field={field.key}>
        <Select
          label={field.label}
          className={FIELD}
          value={String(desktop ?? "")}
          onValueChange={(next) => {
            const option = options.find((o) => String(o.value) === String(next));
            onChange(withProp(node, field.key, option ? option.value : next));
          }}
          renderValue={(current: unknown) => labelOf(current)}
        >
          {options.map((option) => (
            <Select.Option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
        {notes.length > 0 && (
          <p className="emvb-helper" data-emvb-device-values={field.key}>
            {notes.join(" · ")}. Switch the canvas to Tablet or Mobile to change them.
          </p>
        )}
      </div>
    );
  }
  const key = devices[device];
  const own = props[key];
  const wider = device === "mobile" && tablet !== undefined ? tablet : desktop;
  const SAME = "same";
  const sameLabel = `Same as ${device === "mobile" && tablet !== undefined ? "tablet" : "desktop"} (${labelOf(wider)})`;
  return (
    <div data-emvb-field={key}>
      <Select
        label={`${field.label} on ${DEVICE_NAMES[device]}`}
        className={FIELD}
        value={own === undefined ? SAME : String(own)}
        onValueChange={(next) => {
          if (next === SAME) {
            onChange(withProp(node, key, undefined));
            return;
          }
          const option = options.find((o) => String(o.value) === String(next));
          onChange(withProp(node, key, option ? option.value : next));
        }}
        renderValue={(current: unknown) => (current === SAME ? sameLabel : labelOf(current))}
      >
        <Select.Option value={SAME}>{sameLabel}</Select.Option>
        {options.map((option) => (
          <Select.Option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
    </div>
  );
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

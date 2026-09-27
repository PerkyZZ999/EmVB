import { Input, Select, Switch } from "@cloudflare/kumo";
import * as React from "react";
import {
  MAX_TEXT_LENGTH,
  sanitizeHref,
  type FieldDescriptor,
  type LayoutNode,
} from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { FIELD } from "../../../ui.ts";
import { FieldBindControl } from "./FieldBindControl.tsx";
import { FormBindControl } from "./FormBindControl.tsx";
import { LoopItemBindControl } from "./LoopItemBindControl.tsx";
import { IconPicker } from "./IconPicker.tsx";
import { MediaPicker } from "./MediaPicker.tsx";

const propsOf = (node: LayoutNode): Record<string, unknown> =>
  node.props as Record<string, unknown>;

const withProp = (node: LayoutNode, key: string, value: unknown): LayoutNode => {
  const props = { ...propsOf(node) };
  if (value === undefined) delete props[key];
  else props[key] = value;
  return { ...node, props } as LayoutNode;
};

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
  const [draft, setDraft] = React.useState(String(raw ?? ""));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (field.kind === "number" && raw && typeof raw === "object" && "value" in raw) {
      setDraft(String((raw as { value: number }).value));
    } else if (field.kind === "int" && typeof raw === "number") {
      setDraft(String(raw));
    } else if (field.kind === "list-items" && Array.isArray(raw)) {
      setDraft(raw.join("\n"));
    } else if (field.kind !== "boolean" && field.kind !== "select" && field.kind !== "media") {
      setDraft(raw === undefined || raw === null ? "" : String(raw));
    }
    setError(null);
  }, [node.id, field.key, field.kind, raw]);

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

  if (field.kind === "textarea" || field.kind === "list-items") {
    const commitList = () => {
      const items = draft
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      onChange(withProp(node, field.key, items.length > 0 ? items : [""]));
    };
    return (
      <div className="emvb-field-group" data-emvb-field={field.key}>
        <label className="emvb-field-label">{field.label}</label>
        <textarea
          className={`${FIELD} emvb-textarea`}
          rows={field.kind === "list-items" ? 4 : 5}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (field.kind === "list-items") commitList();
            else onChange(withProp(node, field.key, draft));
          }}
        />
      </div>
    );
  }

  if (field.kind === "int") {
    const commit = () => {
      if (draft.trim() === "" && field.optional) {
        setError(null);
        onChange(withProp(node, field.key, undefined));
        return;
      }
      const value = Number(draft);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        setError(field.message ?? "Enter a positive whole number.");
        return;
      }
      if (value > 10_000) {
        setError("Enter a number up to 10000.");
        return;
      }
      setError(null);
      onChange(withProp(node, field.key, value));
    };
    return (
      <Input
        label={field.label}
        className={`${FIELD} emvb-mono`}
        inputMode="numeric"
        value={draft}
        error={error ?? undefined}
        data-emvb-field={field.key}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    );
  }

  if (field.kind === "number") {
    const unit =
      raw && typeof raw === "object" && "unit" in raw
        ? String((raw as { unit: string }).unit)
        : "px";
    const commit = () => {
      if (draft.trim() === "" && field.optional) {
        setError(null);
        onChange(withProp(node, field.key, undefined));
        return;
      }
      const value = Number(draft);
      if (!Number.isFinite(value) || value < 0) {
        setError(field.message ?? "Enter 0 or more.");
        return;
      }
      if (value > 10_000) {
        setError("Enter a number up to 10000.");
        return;
      }
      setError(null);
      onChange(withProp(node, field.key, { value, unit }));
    };
    return (
      <Input
        label={`${field.label} (${unit})`}
        className={`${FIELD} emvb-mono`}
        inputMode="numeric"
        value={draft}
        error={error ?? undefined}
        data-emvb-field={field.key}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    );
  }

  if (field.kind === "href") {
    const commit = () => {
      const trimmed = draft.trim();
      if (trimmed === "" && field.optional) {
        setError(null);
        onChange(withProp(node, field.key, undefined));
        return;
      }
      const safe = sanitizeHref(trimmed);
      if (!safe) {
        setError(
          field.message ?? "Use a full URL such as https://example.com or a path such as /pricing.",
        );
        return;
      }
      setError(null);
      onChange(withProp(node, field.key, safe));
    };
    return (
      <Input
        label={field.label}
        className={FIELD}
        value={draft}
        error={error ?? undefined}
        data-emvb-field={field.key}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    );
  }

  // text
  const tooLong = draft.length > MAX_TEXT_LENGTH;
  return (
    <Input
      label={field.label}
      className={FIELD}
      value={draft}
      error={
        tooLong
          ? `Text can be up to ${MAX_TEXT_LENGTH} characters. Shorten it.`
          : (error ?? undefined)
      }
      data-emvb-field={field.key}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(withProp(node, field.key, event.target.value));
      }}
    />
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

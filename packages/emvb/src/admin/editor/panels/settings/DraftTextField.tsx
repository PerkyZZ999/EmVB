import { Input } from "@cloudflare/kumo";
import * as React from "react";
import {
  MAX_TEXT_LENGTH,
  sanitizeHref,
  type FieldDescriptor,
  type LayoutNode,
} from "../../../../core/index.ts";
import { FIELD } from "../../../ui.ts";
import { propsOf, withProp } from "./node-props.ts";

const MAX_FIELD_NUMBER = 10_000;

/**
 * Text-like content-tab controls (W-021): textarea/list-items, int, number, href and text. Owns
 * the draft buffer and its validation; commit rules differ per field kind.
 */
export function DraftTextField({
  field,
  node,
  onChange,
}: {
  field: FieldDescriptor;
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
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

  const commitClearable = () => {
    if (draft.trim() === "" && field.optional) {
      setError(null);
      onChange(withProp(node, field.key, undefined));
      return true;
    }
    return false;
  };

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

  if (field.kind === "int" || field.kind === "number") {
    const integer = field.kind === "int";
    const unit =
      !integer && raw && typeof raw === "object" && "unit" in raw
        ? String((raw as { unit: string }).unit)
        : "px";
    const commit = () => {
      if (commitClearable()) return;
      const value = Number(draft);
      if (
        !Number.isFinite(value) ||
        (integer && !Number.isInteger(value)) ||
        value < (integer ? 1 : 0)
      ) {
        setError(
          field.message ?? (integer ? "Enter a positive whole number." : "Enter 0 or more."),
        );
        return;
      }
      if (value > MAX_FIELD_NUMBER) {
        setError(`Enter a number up to ${MAX_FIELD_NUMBER}.`);
        return;
      }
      setError(null);
      onChange(withProp(node, field.key, integer ? value : { value, unit }));
    };
    return (
      <Input
        label={integer ? field.label : `${field.label} (${unit})`}
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

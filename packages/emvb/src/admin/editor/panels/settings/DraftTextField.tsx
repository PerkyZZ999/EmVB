import { Input } from "@cloudflare/kumo";
import * as React from "react";
import {
  MAX_TEXT_LENGTH,
  LAYOUT_SCHEMA_VERSION,
  sanitizeHref,
  validateLayout,
  type FieldDescriptor,
  type LayoutNode,
} from "../../../../core/index.ts";
import { FIELD } from "../../../ui.ts";
import { propsOf, withProp } from "./node-props.ts";

const MAX_FIELD_NUMBER = 10_000;

/** An input that keeps a draft and commits it on blur or Enter. */
function CommitInput({
  label,
  className,
  inputMode,
  fieldKey,
  draft,
  error,
  setDraft,
  commit,
}: {
  label: string;
  className: string;
  inputMode?: "numeric";
  fieldKey: string;
  draft: string;
  error: string | null;
  setDraft: (draft: string) => void;
  commit: () => void;
}) {
  return (
    <Input
      label={label}
      className={className}
      inputMode={inputMode}
      value={draft}
      error={error ?? undefined}
      data-emvb-field={fieldKey}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

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
  // The textarea's label must name it, for screen readers and click-to-focus (W-124).
  const areaId = React.useId();

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
        <label className="emvb-field-label" htmlFor={areaId}>
          {field.label}
        </label>
        <textarea
          id={areaId}
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
      // A whole-number field past its schema's maximum would fail the save (W-223).
      if (integer && field.max !== undefined && value > field.max) {
        setError(field.message ?? `Enter a whole number from 1 to ${field.max}.`);
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
      <CommitInput
        label={integer ? field.label : `${field.label} (${unit})`}
        className={`${FIELD} emvb-mono`}
        inputMode="numeric"
        fieldKey={field.key}
        draft={draft}
        error={error}
        setDraft={setDraft}
        commit={commit}
      />
    );
  }

  if (field.kind === "href") {
    const commit = () => {
      if (commitClearable()) return;
      const safe = sanitizeHref(draft.trim());
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
      <CommitInput
        label={field.label}
        className={FIELD}
        fieldKey={field.key}
        draft={draft}
        error={error}
        setDraft={setDraft}
        commit={commit}
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
        const next = event.target.value;
        setDraft(next);
        if (next.trim() === "" && field.optional) {
          setError(null);
          onChange(withProp(node, field.key, undefined));
          return;
        }
        // A value that would make a savable element unsavable (an emptied required field, an
        // overlong one) stays in the box with its error and is not stored (W-192).
        const candidate = withProp(node, field.key, next);
        if (next.length > MAX_TEXT_LENGTH) return;
        if (savableNode(node) && !savableNode(candidate)) {
          setError(
            next.trim() === "" ? `${field.label} can't be empty.` : "This value can't be saved.",
          );
          return;
        }
        setError(null);
        onChange(candidate);
      }}
    />
  );
}

/** Whether `node` passes the layout schema on its own (inside a bare container). */
function savableNode(node: LayoutNode): boolean {
  return validateLayout({
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: { id: "draftroot", type: "container", props: {}, children: [node] },
  }).ok;
}

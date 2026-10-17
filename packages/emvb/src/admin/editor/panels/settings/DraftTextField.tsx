import { Input } from "@cloudflare/kumo";
import { hrefError } from "./link-rules.ts";
import { fieldNumber } from "./number-input.ts";
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
import { isCommitEnter } from "../../ime.ts";

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
        if (isCommitEnter(event)) commit();
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
      if (items.length === 0 && field.optional) {
        setError(null);
        onChange(withProp(node, field.key, undefined));
        return;
      }
      const next = withProp(node, field.key, items.length > 0 ? items : [""]);
      // W-394: a line the schema refuses (a grid track like 4fr) stays in the field with the
      // field's hint instead of making the page fail to save.
      if (!savableNode(next) && savableNode(node)) {
        setError(field.message ?? "One of these lines can't be saved.");
        return;
      }
      setError(null);
      onChange(next);
    };
    return (
      <div className="emvb-field-group" data-emvb-field={field.key}>
        <label className="emvb-field-label" htmlFor={areaId}>
          {field.label}
        </label>
        <textarea
          id={areaId}
          // W-272: right-to-left text (Arabic, Hebrew) lines up from the right as typed.
          dir="auto"
          className={`${FIELD} emvb-textarea`}
          rows={field.kind === "list-items" ? 4 : 5}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [field.kind === "list-items" ? `${areaId}-hint` : "", error ? `${areaId}-error` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (field.kind === "list-items") commitList();
            else onChange(withProp(node, field.key, draft));
          }}
        />
        {/* UX-041: nothing else said each line becomes one item. */}
        {field.kind === "list-items" && (
          <span className="emvb-helper" id={`${areaId}-hint`} data-emvb-field-hint="">
            One per line.
          </span>
        )}
        {error && (
          <span className="emvb-helper" id={`${areaId}-error`} data-emvb-field-error="">
            {error}
          </span>
        )}
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
      const value = fieldNumber(draft, integer ? undefined : unit);
      // W-388: a field may start at 0 (a focal point, a gap); others start at 1.
      const min = integer ? (field.min ?? 1) : 0;
      const range =
        integer && field.max !== undefined
          ? `Enter a whole number from ${min} to ${field.max}.`
          : undefined;
      if (
        draft.trim() === "" ||
        !Number.isFinite(value) ||
        (integer && !Number.isInteger(value)) ||
        value < min
      ) {
        setError(
          field.message ??
            range ??
            (integer
              ? min === 0
                ? "Enter 0 or a positive whole number."
                : "Enter a positive whole number."
              : "Enter 0 or more."),
        );
        return;
      }
      // A whole-number field past its schema's maximum would fail the save (W-223).
      if (integer && field.max !== undefined && value > field.max) {
        setError(field.message ?? range ?? `Enter a whole number from ${min} to ${field.max}.`);
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
        setError(hrefError(draft, field.message));
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
      // W-272: the field follows its text's direction, so RTL text reads from the right.
      dir="auto"
      value={draft}
      // UX-045: a text field's message explains it (never an error), so show it up front.
      description={field.message}
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
export function savableNode(node: LayoutNode): boolean {
  return validateLayout({
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: { id: "draftroot", type: "container", props: {}, children: [node] },
  }).ok;
}

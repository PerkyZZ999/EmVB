import { Input, Select } from "@cloudflare/kumo";
import * as React from "react";
import type { Fetcher } from "../../../api.ts";
import { loadFormFields, type DefinitionField } from "../../../forms-api.ts";
import { FIELD_NAME_PATTERN, MAX_FIELD_NAME } from "../../../../core/index.ts";
import { FIELD } from "../../../ui.ts";

const MANUAL = "__manual__";
const CHOOSE = "Choose a field…";

/** Why a typed field name can't be stored, or null (W-202: same rule as save). */
export function fieldNameError(name: string): string | null {
  if (!name) return "Give the field a name.";
  if (name.length > MAX_FIELD_NAME) return `Use at most ${MAX_FIELD_NAME} characters.`;
  if (!FIELD_NAME_PATTERN.test(name))
    return "Start with a letter, then use letters, digits, - or _ (no spaces).";
  return null;
}

/** The Field name box shares its draft with the definition picker (W-720). */
function FieldNameInput({
  value,
  onChange,
  manual,
}: {
  value: string;
  onChange: (name: string) => void;
  manual?: boolean;
}) {
  const error = fieldNameError(value.trim());
  return (
    <>
      <Input
        label="Field name"
        className={`${FIELD} emvb-mono`}
        value={value}
        aria-invalid={error ? true : undefined}
        {...(manual ? { "data-emvb-field-bind": "manual" } : {})}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p className="emvb-inline-error" data-emvb-field-name-error>
          {error}
        </p>
      )}
    </>
  );
}

const fieldLabel = (field: DefinitionField) => `${field.label}${field.required ? " *" : ""}`;

/** Field name binder: options from public definition when the parent form id is known. */
export function FieldBindControl({
  value,
  formId,
  fetcher,
  onChange,
}: {
  value: string;
  formId: string | undefined;
  fetcher: Fetcher;
  onChange: (field: string, label?: string) => void;
}) {
  const [fields, setFields] = React.useState<DefinitionField[] | null>(null);
  const [loading, setLoading] = React.useState(Boolean(formId));
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  const changeName = (next: string) => {
    setDraft(next);
    if (fieldNameError(next.trim()) === null) onChange(next.trim());
  };

  React.useEffect(() => {
    let cancelled = false;
    setLoading(Boolean(formId));
    setFields(null);
    if (!formId) return;
    void loadFormFields(fetcher, formId).then((next) => {
      if (!cancelled) {
        setFields(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, formId]);

  const hasFields = fields !== null && fields.length > 0;
  const name = draft.trim();
  const known = fields?.some((field) => field.name === name);
  let feedback = "";
  if (!formId)
    feedback =
      "Choose a form on the parent Form element to list its fields, or enter a field name manually.";
  else if (loading) feedback = "Loading form fields… You can enter a field name.";
  else if (fields === null) feedback = "Could not load form fields. Enter a field name manually.";
  else if (fields.length === 0)
    feedback = "This form has no fields yet. Enter a field name manually.";

  return (
    <div className="emvb-field-group" data-emvb-field-bind={hasFields ? "list" : undefined}>
      {hasFields && (
        <Select
          label="Field"
          className={FIELD}
          value={known ? name : MANUAL}
          onValueChange={(next) => {
            if (!next || next === MANUAL) return;
            const picked = fields.find((each) => each.name === next);
            setDraft(next);
            onChange(next, picked?.label);
          }}
          renderValue={(current: unknown) => {
            const field = fields.find((each) => each.name === current);
            return field ? fieldLabel(field) : CHOOSE;
          }}
        >
          {!known && <Select.Option value={MANUAL}>{CHOOSE}</Select.Option>}
          {fields.map((field) => (
            <Select.Option key={field.name} value={field.name}>
              {fieldLabel(field)}
            </Select.Option>
          ))}
        </Select>
      )}
      <FieldNameInput value={draft} onChange={changeName} manual={!hasFields} />
      <p className="emvb-helper" role="status" aria-label="Form fields status" aria-live="polite">
        {feedback}
      </p>
    </div>
  );
}

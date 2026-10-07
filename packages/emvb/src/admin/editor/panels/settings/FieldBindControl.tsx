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

/** The Field name box: keeps what you type, stores it only once it's a valid name (W-202). */
function FieldNameInput({
  value,
  onChange,
  manual,
}: {
  value: string;
  onChange: (name: string) => void;
  manual?: boolean;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => {
    setDraft((current) => (fieldNameError(current.trim()) === null ? value : current));
  }, [value]);
  const error = fieldNameError(draft.trim());
  return (
    <>
      <Input
        label="Field name"
        className={`${FIELD} emvb-mono`}
        value={draft}
        aria-invalid={error ? true : undefined}
        {...(manual ? { "data-emvb-field-bind": "manual" } : {})}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (fieldNameError(next.trim()) === null) onChange(next.trim());
        }}
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

  React.useEffect(() => {
    let cancelled = false;
    if (!formId) {
      setFields(null);
      return;
    }
    void loadFormFields(fetcher, formId).then((next) => {
      if (!cancelled) setFields(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, formId]);

  if (fields && fields.length > 0) {
    const known = fields.some((field) => field.name === value);
    return (
      <div data-emvb-field-bind="list">
        <Select
          label="Field"
          className={FIELD}
          value={known ? value : MANUAL}
          onValueChange={(next) => {
            if (!next || next === MANUAL) return;
            const picked = fields.find((each) => each.name === next);
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
        <FieldNameInput value={value} onChange={(name) => onChange(name)} />
      </div>
    );
  }

  return <FieldNameInput value={value} onChange={(name) => onChange(name)} manual />;
}

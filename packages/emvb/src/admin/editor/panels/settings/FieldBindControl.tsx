import { Input, Select } from "@cloudflare/kumo";
import * as React from "react";
import type { Fetcher } from "../../../api.ts";
import { loadFormFields, type DefinitionField } from "../../../forms-api.ts";
import { FIELD } from "../../../ui.ts";

const MANUAL = "__manual__";
const CHOOSE = "Choose a field…";

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
        <Input
          label="Field name"
          className={`${FIELD} emvb-mono`}
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
        />
      </div>
    );
  }

  return (
    <Input
      label="Field name"
      className={`${FIELD} emvb-mono`}
      value={value}
      data-emvb-field-bind="manual"
      onChange={(event) => onChange(event.target.value.trim())}
    />
  );
}

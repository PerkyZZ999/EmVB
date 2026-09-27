import { Input, Select } from "@cloudflare/kumo";
import * as React from "react";
import type { Fetcher } from "../../../api.ts";
import {
  loadFormsCapability,
  type FormListItem,
  type FormsCapability,
} from "../../../forms-api.ts";
import { FIELD } from "../../../ui.ts";

const MANUAL = "__manual__";

/**
 * Form id binder (W-036 / D-015): admins pick from forms/list; others enter the id.
 */
export function FormBindControl({
  value,
  fetcher,
  onChange,
}: {
  value: string;
  fetcher: Fetcher;
  onChange: (formId: string) => void;
}) {
  const [capability, setCapability] = React.useState<FormsCapability | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void loadFormsCapability(fetcher).then((next) => {
      if (!cancelled) setCapability(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  if (capability?.status === "missing") {
    return (
      <p className="emvb-helper" data-emvb-forms-missing="">
        The forms plugin is not installed. Form elements are unavailable until it is added to the
        site.
      </p>
    );
  }

  if (capability?.status === "ready" && capability.forms.length > 0) {
    const known = capability.forms.some((form) => form.id === value);
    return (
      <div data-emvb-form-bind="list">
        <Select
          label="Form"
          className={FIELD}
          value={known ? value : MANUAL}
          onValueChange={(next) => {
            if (!next || next === MANUAL) return;
            onChange(next);
          }}
        >
          {!known && value ? (
            <Select.Option value={MANUAL}>Current id (not in list)</Select.Option>
          ) : (
            <Select.Option value={MANUAL}>Choose a form…</Select.Option>
          )}
          {capability.forms.map((form: FormListItem) => (
            <Select.Option key={form.id} value={form.id}>
              {form.name}
            </Select.Option>
          ))}
        </Select>
        <Input
          label="Form id"
          className={`${FIELD} emvb-mono`}
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
        />
        <p className="emvb-helper">
          <a href="/_emdash/admin/plugins/emdash-forms/pages">Create or edit forms</a>
        </p>
      </div>
    );
  }

  return (
    <div data-emvb-form-bind="manual">
      <Input
        label="Form id"
        className={`${FIELD} emvb-mono`}
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
      />
      <p className="emvb-helper">
        Paste a forms-plugin form id.{" "}
        <a href="/_emdash/admin/plugins/emdash-forms/pages">Open Forms</a>
      </p>
    </div>
  );
}

import { Checkbox } from "@cloudflare/kumo";
import type { ImportedForm, ImportedFormField } from "../../core/index.ts";
import type { FormsCapability } from "../forms-api.ts";

/** How a field reads in the list: "Email (email, required)". */
function fieldSummary(field: ImportedFormField): string {
  const notes = [field.type, ...(field.required ? ["required"] : [])];
  const label = field.label === field.name ? field.name : `${field.label} [${field.name}]`;
  return `${label} (${notes.join(", ")})`;
}

/**
 * W-1091 (#27): Elementor forms arrive as EmVB Forms that aren't connected to a form yet, so they
 * show nothing on the live site. The import says so where it can't be missed, lists each form's
 * fields (names and types) and success message, and offers to create them in EmDash Forms.
 */
export function ImportForms({
  forms,
  capability,
  create,
  onCreateChange,
}: {
  forms: readonly ImportedForm[];
  /** The forms plugin: there and listable, there for an id only, or not installed. */
  capability: FormsCapability | undefined;
  create: boolean;
  onCreateChange: (create: boolean) => void;
}) {
  if (forms.length === 0) return null;
  const one = forms.length === 1;
  return (
    <section className="emvb-import-forms" aria-label="Forms" data-emvb-import-forms="">
      <p className="emvb-import-summary">
        {one
          ? "This page has a form that needs connecting to an EmDash form. Until it is, it doesn't show on your live site."
          : `This page has ${forms.length} forms that need connecting to EmDash forms. Until they are, they don't show on your live site.`}
      </p>
      <ul>
        {forms.map((form) => {
          const fields = form.pages.flatMap((page) => page.fields);
          return (
            <li key={form.nodeId} data-emvb-import-form="">
              <strong>{form.name}:</strong>{" "}
              {fields.length > 0 ? fields.map(fieldSummary).join(", ") : "no fields"}.
              {form.successMessage ? ` Success message: “${form.successMessage}”` : ""}
            </li>
          );
        })}
      </ul>
      {capability?.status === "missing" ? (
        <p className="emvb-helper">
          Install the EmDash Forms plugin, create {one ? "the form" : "the forms"} there, then pick{" "}
          {one ? "it" : "each"} in the Form's settings.
        </p>
      ) : (
        <>
          <Checkbox
            label="Create the forms in EmDash Forms"
            checked={create}
            onCheckedChange={(checked: boolean) => onCreateChange(checked)}
          />
          <p className="emvb-helper">
            {create
              ? "Each becomes an EmDash form with these fields, types and success message, connected to the page. Needs an administrator."
              : "Or create them in Forms yourself, then pick each in the Form's settings."}
          </p>
        </>
      )}
    </section>
  );
}

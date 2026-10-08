/** Minimal public form definition (forms-plugin `definition` route). */
export type PublicFormField = {
  name: string;
  type: string;
  label: string;
  required: boolean;
  options?: ReadonlyArray<{ label: string; value: string }>;
  placeholder?: string;
  /** Constraints the forms plugin's own embed puts on the control (W-297). */
  validation?: PublicFieldValidation;
};

/** The constraint subset the renderer can apply; anything else is ignored. */
export type PublicFieldValidation = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
};

export type PublicFormDefinition = {
  name: string;
  slug: string;
  status: string;
  pages: ReadonlyArray<{ fields: ReadonlyArray<PublicFormField> }>;
  settings: {
    spamProtection?: string;
    submitLabel?: string;
  };
};

export type FormDefinitions = ReadonlyMap<string, PublicFormDefinition>;

export function fieldsOf(definition: PublicFormDefinition): PublicFormField[] {
  return definition.pages.flatMap((page) => [...page.fields]);
}

export function fieldByName(
  definition: PublicFormDefinition | undefined,
  name: string,
): PublicFormField | undefined {
  if (!definition) return undefined;
  return fieldsOf(definition).find((field) => field.name === name);
}

/** Minimal public form definition (forms-plugin `definition` route). */
export type PublicFormField = {
  name: string;
  type: string;
  label: string;
  required: boolean;
  options?: ReadonlyArray<{ label: string; value: string }>;
  placeholder?: string;
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

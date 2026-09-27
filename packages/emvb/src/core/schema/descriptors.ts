/** Field kinds the settings panel knows how to draw (W-021). */
export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "href"
  | "list-items";

export type FieldOption = { value: string | number | boolean; label: string };

export type FieldDescriptor = {
  key: string;
  kind: FieldKind;
  label: string;
  options?: FieldOption[];
  /** Shown under the control when the value is invalid. */
  message?: string;
  optional?: boolean;
};

export type ElementDescriptor = {
  type: string;
  name: string;
  group: "layout" | "content";
  /** Default right-panel tab when this element is selected. */
  defaultTab: "content" | "style";
  fields: FieldDescriptor[];
};

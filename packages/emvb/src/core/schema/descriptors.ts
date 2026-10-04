/** Field kinds the settings panel knows how to draw (W-021). */
export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "int"
  | "select"
  | "boolean"
  | "href"
  | "media"
  | "icon"
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
  /** Props that hold this field's tablet and mobile values (W-139); unset follows the wider device. */
  devices?: { tablet: string; mobile: string };
};

export type ElementDescriptor = {
  type: string;
  name: string;
  group: "layout" | "content" | "form" | "dynamic";
  /** Default right-panel tab when this element is selected. */
  defaultTab: "content" | "style";
  fields: FieldDescriptor[];
};

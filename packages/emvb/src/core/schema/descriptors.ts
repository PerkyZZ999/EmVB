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
  | "list-items"
  | "image-sources"
  /** W-950: formatting (bold, italic, colour, link) on words of the element's Text. */
  | "marks";

export type FieldOption = { value: string | number | boolean; label: string };

export type FieldDescriptor = {
  key: string;
  kind: FieldKind;
  label: string;
  options?: FieldOption[];
  /** Shown under the control when the value is invalid. */
  message?: string;
  optional?: boolean;
  /** Highest value a whole-number field accepts, matching its schema (W-223). */
  max?: number;
  /** Lowest value a whole-number field accepts; unset is 1 (W-388). */
  min?: number;
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

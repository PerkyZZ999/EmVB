/** W-1068: a template node as stored: layout JSON whose styles may hold `tpl-*` references. */
export type TemplateData = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: Record<string, unknown>;
  classes?: string[];
  children?: TemplateData[];
};

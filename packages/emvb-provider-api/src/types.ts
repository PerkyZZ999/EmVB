export type ProviderFieldKind =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "href"
  /** A date and time picker. The value is a wall-clock string such as `2026-12-31T18:00`. */
  | "datetime"
  | "media";
export type ProviderFieldValue = string | number | boolean;
export type ProviderProps = Record<string, ProviderFieldValue | undefined>;

export interface ProviderVNode {
  tag: string;
  // Values are strings; a key may be absent. Conditional attrs (`...(cond ? { open: "open" } : {})`)
  // produce optional keys, so the value type includes `undefined`. Renderers MUST skip undefined
  // values (EmVB's serializer does) so an absent attribute never renders as `="undefined"`.
  attrs: Record<string, string | undefined>;
  children: Array<ProviderVNode | string>;
}

export interface ProviderComponentNode {
  id: string;
  type: string;
  component: string;
  providerVersion?: number;
  props: ProviderProps;
  children?: ProviderComponentNode[];
}

export interface ProviderFieldDescriptor {
  key: string;
  kind: ProviderFieldKind;
  label: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface ProviderMetaFieldDescriptor {
  key: string;
  kind: "text" | "boolean" | "select";
  label: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface ProviderComponentDescriptor {
  type: string;
  provider: string;
  component: string;
  name: string;
  group: "content";
  defaultTab: "content";
  fields: ProviderFieldDescriptor[];
  category?: string;
  /** True when the component holds child elements: EmVB renders them inside it and lets the editor place them there. */
  container?: boolean;
  support?: "verified" | "experimental";
  icon?: string;
  keywords?: readonly string[];
  order?: number;
}

export interface ProviderComponent<N extends ProviderComponentNode = ProviderComponentNode> {
  descriptor: ProviderComponentDescriptor;
  defaults: () => Omit<N, "id">;
  build: (node: N, attrs?: Record<string, string>, children?: ProviderVNode[]) => ProviderVNode;
}

export interface ProviderCollectionDefinition<
  N extends ProviderComponentNode = ProviderComponentNode,
> {
  parentComponent: string;
  itemComponent: string;
  itemLabel: string;
  fields: readonly string[];
  createItem: (id: string, index: number) => N;
  allowAdd?: boolean;
  allowDuplicate?: boolean;
  allowRemove?: boolean;
  allowReorder?: boolean;
}

export interface ProviderRecipe<N extends ProviderComponentNode = ProviderComponentNode> {
  id: string;
  name: string;
  description: string;
  category: string;
  create: (id: () => string) => N[];
}

export interface ProviderValidationIssue {
  code: string;
  nodeId: string;
  path: string;
  message: string;
}

export interface ProviderRenderContext {
  mode: "editor" | "public";
  previewState?: Readonly<Record<string, unknown>>;
}

export interface ComponentProvider<N extends ProviderComponentNode = ProviderComponentNode> {
  id: string;
  version?: string;
  providerApiVersion?: number;
  nodeVersion?: number;
  label: string;
  nodeType: string;
  components: ReadonlyMap<string, ProviderComponent<N>>;
  recipes?: readonly ProviderRecipe<N>[];
  metaFields?: readonly ProviderMetaFieldDescriptor[];
  collections?: readonly ProviderCollectionDefinition<N>[];
  acceptsChildren?(node: N): boolean;
  migrateNode?(node: N, context: { fromVersion: number; toVersion: number }): N;
  createNode(component: string, id: string): N;
  render(
    node: N,
    attrs?: Record<string, string>,
    children?: ProviderVNode[],
    context?: ProviderRenderContext,
  ): ProviderVNode;
  validate?(nodes: readonly N[]): ProviderValidationIssue[];
  cssEntryPoints: readonly string[];
  runtimeEntryPoints?: readonly string[];
  needsRuntime?(node: N): boolean;
  rootAttributes?(nodes: readonly N[], context?: ProviderRenderContext): Record<string, string>;
}

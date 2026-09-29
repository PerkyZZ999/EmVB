import type { FormDefinitions } from "../forms/definition.ts";
import type { LayoutNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import type { VNode } from "./vnode.ts";

export type RenderMode = "public" | "editor";

/** What the per-element renderers share with the page walk. */
export type RenderContext = {
  mode: RenderMode;
  definitions: FormDefinitions;
  /** Renders child nodes against the given dynamic data, dropping those that render nothing. */
  children: (nodes: LayoutNode[], dynamic: ThemeDynamicData | undefined) => VNode[];
};

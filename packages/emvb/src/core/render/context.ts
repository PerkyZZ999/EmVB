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
  /**
   * An HTML id unique in this render (W-249): `base` the first time, then `base-r2`, `base-r3`.
   * The same synced section placed twice, or a loop item repeated per post, renders the same
   * element ids again; Tabs, form fields and the honeypot use this so labels and radio groups
   * stay with their own copy.
   */
  uniqueId: (base: string) => string;
};

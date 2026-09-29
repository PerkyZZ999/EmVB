import type { ElementDescriptor } from "../schema/descriptors.ts";
import type { VNode } from "../render/vnode.ts";

/** Shared shape of an element definition: defaults, descriptor, CSS, and its VNode build. */
export type Build<N> = (node: N, attrs: Record<string, string>, children: VNode[]) => VNode;

export type ElementDefinition<N> = {
  baseCss: string;
  build: Build<N>;
  descriptor: ElementDescriptor;
  defaults: () => Omit<N, "id">;
};

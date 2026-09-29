import * as forms from "../../src/core/elements/form-elements.ts";
import type { VNode } from "../../src/core/render/vnode.ts";

type AnyDefinition = {
  defaults: () => { props: Record<string, unknown> };
  descriptor: unknown;
  baseCss?: string;
  build: (node: never, attrs: Record<string, string>, children: VNode[]) => VNode;
};

/** Every form element's defaults, descriptor, base CSS and built VNode for a few prop variations. */
export function formElementCases(): Record<string, unknown> {
  const cases: Record<string, unknown> = {};
  const attrs = { class: "emvb-e-x", "data-emvb-id": "node0001" };
  const variations: Record<string, Record<string, unknown>> = {
    defaults: {},
    bare: { label: undefined, placeholder: undefined },
    placeholder: { placeholder: "Type here" },
    unlabelled: { label: "" },
  };
  for (const [name, definition] of Object.entries(forms) as unknown as [string, AnyDefinition][]) {
    const defaults = definition.defaults();
    const built: Record<string, unknown> = {};
    for (const [variant, props] of Object.entries(variations)) {
      const node = { id: "node0001", ...defaults, props: { ...defaults.props, ...props } };
      built[variant] = definition.build(node as never, { ...attrs }, [
        { tag: "i", attrs: {}, children: [] },
      ]);
      built[`${variant}, no class`] = definition.build(node as never, {}, []);
    }
    cases[name] = {
      defaults,
      descriptor: definition.descriptor,
      baseCss: definition.baseCss,
      built,
    };
  }
  return cases;
}

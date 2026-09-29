import { isTabPanelNode, type TabsNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

const MAX_TABS = 12;

/** CSS-only tabs (radio inputs and labels) that the optional tabs script enhances. */
export function renderTabs(
  node: TabsNode,
  id: string | undefined,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode {
  const panels = node.children.filter(isTabPanelNode).slice(0, MAX_TABS);
  const group = `emvb-tabs-${id ?? "x"}`;
  const inputs: VNode[] = [];
  const labels: VNode[] = [];
  const panelNodes: VNode[] = [];
  panels.forEach((panel, i) => {
    const inputId = `${group}-${i}`;
    const inputAttrs: Record<string, string> = {
      type: "radio",
      name: group,
      id: inputId,
      class: "emvb-tab-input",
    };
    if (i === 0) inputAttrs.checked = "checked";
    inputs.push({ tag: "input", attrs: inputAttrs, children: [] });
    const panelDomId = `${group}-panel-${i}`;
    const tabDomId = `${group}-tab-${i}`;
    labels.push({
      tag: "label",
      attrs: {
        class: "emvb-tab-label",
        for: inputId,
        id: tabDomId,
        role: "tab",
        "aria-selected": i === 0 ? "true" : "false",
        "aria-controls": panelDomId,
        tabindex: i === 0 ? "0" : "-1",
      },
      children: [panel.props.label],
    });
    const panelAttrs: Record<string, string> = {
      class: "emvb-tab-panel",
      id: panelDomId,
      role: "tabpanel",
      "aria-labelledby": tabDomId,
    };
    if (ctx.mode === "editor") panelAttrs["data-emvb-id"] = panel.id;
    panelNodes.push({
      tag: "div",
      attrs: panelAttrs,
      children: ctx.children(panel.children, dynamic),
    });
  });
  return {
    tag: "div",
    attrs,
    children: [
      ...inputs,
      {
        tag: "div",
        attrs: { class: "emvb-tab-list", role: "tablist", "aria-orientation": "horizontal" },
        children: labels,
      },
      { tag: "div", attrs: { class: "emvb-tab-panels" }, children: panelNodes },
    ],
  };
}

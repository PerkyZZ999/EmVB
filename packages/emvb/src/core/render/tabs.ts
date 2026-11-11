import { MAX_TABS } from "../limits.ts";
import { isTabPanelNode, type TabsNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

/** CSS-only tabs (radio inputs and labels) that the optional tabs script enhances. */
export function renderTabs(
  node: TabsNode,
  id: string | undefined,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode {
  const panels = node.children.filter(isTabPanelNode).slice(0, MAX_TABS);
  const group = ctx.uniqueId(`emvb-tabs-${id ?? "x"}`);
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
    // W-975: ARIA allows no role on a <label>, so the tab is a span inside it; the label still
    // switches the radio, which keeps the tabs working without the script.
    labels.push({
      tag: "label",
      attrs: { class: "emvb-tab-label", for: inputId },
      children: [
        {
          tag: "span",
          attrs: {
            class: "emvb-tab",
            id: tabDomId,
            role: "tab",
            "aria-selected": i === 0 ? "true" : "false",
            "aria-controls": panelDomId,
            tabindex: i === 0 ? "0" : "-1",
          },
          // W-664: a label of only spaces made a zero-width tab nobody could click or hear.
          children: [panel.props.label.trim() || `Tab ${i + 1}`],
        },
      ],
    });
    // W-598: the panel renders like any element, so its own style, classes and device
    // visibility reach the page; the tab wiring is added on top.
    const built = ctx.children([panel], dynamic)[0];
    const own = built?.attrs ?? {};
    const panelAttrs: Record<string, string> = {
      ...own,
      class: `emvb-tab-panel ${own.class ?? ""}`
        .split(/\s+/)
        .filter((c, at, all) => c && all.indexOf(c) === at)
        .join(" "),
      id: panelDomId,
      role: "tabpanel",
      "aria-labelledby": tabDomId,
    };
    if (ctx.mode === "editor") panelAttrs["data-emvb-id"] = panel.id;
    panelNodes.push({
      tag: "div",
      attrs: panelAttrs,
      children: built ? built.children : ctx.children(panel.children, dynamic),
    });
  });
  return {
    tag: "div",
    attrs,
    children: [
      ...inputs,
      {
        tag: "div",
        // W-275: a tablist needs tabs (axe aria-required-children); Tabs with no panels yet get
        // a plain box.
        attrs:
          labels.length > 0
            ? { class: "emvb-tab-list", role: "tablist", "aria-orientation": "horizontal" }
            : { class: "emvb-tab-list" },
        children: labels,
      },
      { tag: "div", attrs: { class: "emvb-tab-panels" }, children: panelNodes },
    ],
  };
}

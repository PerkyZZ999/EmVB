import type { MenuItemNode, MenuNode } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import type { VNode } from "../render/vnode.ts";
import type { ElementDefinition } from "./definition.ts";

const newTabAttrs = (newTab: boolean | undefined): Record<string, string> =>
  newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

/** Names the item's own disclosure. Nested panels already carry their parent item's name. */
function stampGroup(children: VNode["children"], name: string): VNode["children"] {
  return children.map((child) => {
    if (typeof child === "string" || child.tag !== "li") return child;
    return {
      ...child,
      children: child.children.map((bar) => {
        if (typeof bar === "string" || bar.tag !== "div") return bar;
        return {
          ...bar,
          children: bar.children.map((inner) => {
            if (typeof inner === "string" || inner.tag !== "details") return inner;
            return { ...inner, attrs: { ...inner.attrs, name } };
          }),
        };
      }),
    };
  });
}

/** Runs of menu items become a list. Other elements stay in the panel beside that list. */
function groupItems(children: VNode["children"]): VNode["children"] {
  const out: VNode["children"] = [];
  let batch: VNode[] = [];
  const flush = () => {
    if (batch.length === 0) return;
    out.push({
      tag: "ul",
      attrs: { class: "emvb-menu__list emvb-menu__list--sub" },
      children: batch,
    });
    batch = [];
  };
  for (const child of children) {
    if (typeof child !== "string" && child.tag === "li") batch.push(child);
    else {
      flush();
      out.push(child);
    }
  }
  flush();
  return out;
}

const MENU_CSS = [
  // The list inherits the menu's flex styles, so Layout's direction, alignment and gap move the items.
  ".emvb-menu{position:relative;display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:.25rem 1.25rem}",
  ".emvb-menu>.emvb-menu__list{display:flex;flex:1 1 auto;flex-direction:inherit;flex-wrap:inherit;align-items:inherit;justify-content:inherit;gap:inherit;min-width:0;margin:0;padding:0;list-style:none}",
  ".emvb-menu--column{flex-direction:column;align-items:stretch;gap:.15rem}",
  ".emvb-menu__list--sub{display:flex;flex-direction:column;align-items:stretch;gap:.15rem;margin:0;padding:0;list-style:none}",
  ".emvb-menu-item{position:relative}",
  ".emvb-menu-item--wide{position:static}",
  ".emvb-menu-item__bar{display:flex;align-items:center;gap:.15rem}",
  ".emvb-menu-item__link,.emvb-menu-item__label{color:inherit;text-decoration:none}",
  ".emvb-menu-item__toggle{display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;padding:0;cursor:pointer;list-style:none}",
  ".emvb-menu-item__toggle::-webkit-details-marker{display:none}",
  ".emvb-menu-item__toggle::before{content:'';width:.4rem;height:.4rem;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-1px)}",
  ".emvb-menu-panel{display:none;position:absolute;z-index:30;top:100%;inset-inline-start:0;min-width:12rem;padding:.75rem;background:canvas;color:canvastext;border:1px solid #00000014;box-shadow:0 12px 32px #00000029}",
  ".emvb-menu-item__disclosure[open]>.emvb-menu-panel{display:block}",
  "@media (hover:hover) and (pointer:fine){.emvb-menu-item:hover>.emvb-menu-item__bar>.emvb-menu-item__disclosure>.emvb-menu-panel,.emvb-menu-item:focus-within>.emvb-menu-item__bar>.emvb-menu-item__disclosure>.emvb-menu-panel{display:block}}",
  // W-267: a closed <details> hides its content (::details-content is content-visibility:hidden),
  // so the hover rule above showed nothing until the details' content is made visible too. Its own
  // rule: a browser without ::details-content drops only this one. Hover only: keyboard users open
  // a dropdown with its toggle, and Tab doesn't walk through every closed dropdown's links.
  "@media (hover:hover) and (pointer:fine){.emvb-menu-item:hover>.emvb-menu-item__bar>.emvb-menu-item__disclosure::details-content{content-visibility:visible}}",
  ".emvb-menu-panel--wide{inset-inline:0;min-width:0}",
  ".emvb-menu--column .emvb-menu-panel{top:0;inset-inline-start:100%}",
  ".emvb-menu--column .emvb-menu-panel--wide{inset-inline:auto;inset-inline-start:100%;min-width:18rem}",
].join("");

export const menu: ElementDefinition<MenuNode> = {
  baseCss: MENU_CSS,
  defaults: () => ({ type: "menu", props: { direction: "row" }, children: [] }),
  descriptor: {
    type: "menu",
    name: "Menu",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "label",
        kind: "text",
        label: "Name",
        optional: true,
        message: "Names the menu for assistive technology. Leave it blank to use Menu.",
      },
      {
        key: "direction",
        kind: "select",
        label: "Direction",
        options: [
          { value: "row", label: "Horizontal" },
          { value: "column", label: "Vertical" },
        ],
      },
    ],
  },
  build: (node, attrs, children) => {
    const column = node.props.direction === "column";
    const classes = [attrs.class, column ? "emvb-menu--column" : ""].filter(Boolean).join(" ");
    // W-198: a Menu with nothing in it is no navigation landmark; a plain box keeps its styles.
    if (children.length === 0) {
      return {
        tag: "div",
        attrs: { ...attrs, class: classes, "data-emvb-menu-empty": "" },
        children: [],
      };
    }
    const label = node.props.label?.trim() || "Menu";
    return {
      tag: "nav",
      attrs: { ...attrs, class: classes, "aria-label": label },
      children: [
        {
          tag: "ul",
          attrs: { class: "emvb-menu__list" },
          children: stampGroup(children, `emvb-menu-${node.id}`),
        },
      ],
    };
  },
};

export const menuItem: ElementDefinition<MenuItemNode> = {
  baseCss: "",
  defaults: () => ({ type: "menu-item", props: { text: "Item", href: "/" }, children: [] }),
  descriptor: {
    type: "menu-item",
    name: "Menu item",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "text", label: "Label" },
      {
        key: "href",
        kind: "href",
        label: "Link",
        optional: true,
        message: "Use a full URL such as https://example.com or a path such as /pricing.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
      { key: "wide", kind: "boolean", label: "Wide panel", optional: true },
    ],
  },
  build: (node, attrs, children) => {
    const wide = node.props.wide === true;
    const classes = [attrs.class, wide ? "emvb-menu-item--wide" : ""].filter(Boolean).join(" ");
    const href = node.props.href?.trim() ? sanitizeHref(node.props.href) : undefined;
    const label: VNode = href
      ? {
          tag: "a",
          attrs: { class: "emvb-menu-item__link", href, ...newTabAttrs(node.props.newTab) },
          children: [node.props.text],
        }
      : { tag: "span", attrs: { class: "emvb-menu-item__label" }, children: [node.props.text] };
    const bar: VNode["children"] = [label];
    if (children.length > 0) {
      const panelClass = wide ? "emvb-menu-panel emvb-menu-panel--wide" : "emvb-menu-panel";
      bar.push({
        tag: "details",
        attrs: { class: "emvb-menu-item__disclosure" },
        children: [
          {
            tag: "summary",
            attrs: { class: "emvb-menu-item__toggle", "aria-label": `Open ${node.props.text}` },
            children: [],
          },
          {
            tag: "div",
            attrs: { class: panelClass },
            children: groupItems(stampGroup(children, `emvb-menu-${node.id}`)),
          },
        ],
      });
    }
    return {
      tag: "li",
      attrs: { ...attrs, class: classes },
      children: [{ tag: "div", attrs: { class: "emvb-menu-item__bar" }, children: bar }],
    };
  },
};

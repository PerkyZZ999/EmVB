import type { SearchFormNode } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import type { ElementDefinition } from "./definition.ts";

/**
 * W-1073: where a Search form sends the words: a site path or a web address; anything else
 * (another scheme, a refused link) falls back to EmDash's own search page.
 */
export function searchAction(action: string | undefined): string {
  const safe = action?.trim() ? sanitizeHref(action.trim()) : undefined;
  return safe && !/^(mailto|tel):/i.test(safe) ? safe : "/search";
}

export const searchForm: ElementDefinition<SearchFormNode> = {
  baseCss:
    ".emvb-search-form{display:flex;align-items:stretch;gap:0.5em;max-width:100%}.emvb-search-input{flex:1 1 12em;min-width:0;padding:0.5em 0.75em;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:inherit}.emvb-search-button{padding:0.5em 1em;border:1px solid currentColor;border-radius:4px;background:none;color:inherit;font:inherit;cursor:pointer}.emvb-search-input:focus-visible,.emvb-search-button:focus-visible{outline:2px solid currentColor;outline-offset:2px}",
  defaults: () => ({ type: "search-form", props: { placeholder: "Search this site" } }),
  descriptor: {
    type: "search-form",
    name: "Search form",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "label",
        kind: "text",
        label: "Name for screen readers",
        optional: true,
        message: "Leave it empty for Search.",
      },
      { key: "placeholder", kind: "text", label: "Placeholder", optional: true },
      { key: "buttonText", kind: "text", label: "Button text", optional: true },
      {
        key: "action",
        kind: "text",
        label: "Search page",
        optional: true,
        message: "Where the words go, as ?q=…. Leave it empty for /search.",
      },
    ],
  },
  build: (node, attrs) => {
    const label = node.props.label?.trim() || "Search";
    const placeholder = node.props.placeholder?.trim();
    return {
      tag: "form",
      attrs: {
        ...attrs,
        role: "search",
        "aria-label": label,
        method: "get",
        action: searchAction(node.props.action),
      },
      children: [
        {
          tag: "input",
          attrs: {
            class: "emvb-search-input",
            type: "search",
            name: "q",
            "aria-label": label,
            ...(placeholder ? { placeholder } : {}),
          },
          children: [],
        },
        {
          tag: "button",
          attrs: { class: "emvb-search-button", type: "submit" },
          children: [node.props.buttonText?.trim() || "Search"],
        },
      ],
    };
  },
};

import { generateCss } from "../css/generate.ts";
import { ELEMENTS } from "../elements/index.ts";
import {
  fieldByName,
  type FormDefinitions,
  type PublicFormDefinition,
} from "../forms/definition.ts";
import { layoutHasForm } from "../forms/binding.ts";
import type { DesignSystem } from "../schema/design.ts";
import {
  isFormNode,
  isLoopNode,
  isParentNode,
  isTabsNode,
  isTabPanelNode,
  type Layout,
  type LayoutNode,
} from "../schema/layout.ts";
import { cssLength, styleClassName, styleDeclarations, type Declaration } from "../sanitize/css.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { resolveEmbedUrl } from "../sanitize/embed-url.ts";
import {
  portableTextToVNodes,
  resolvePostForRender,
  resolvePostsForLoop,
  type ThemeDynamicData,
  type ThemePostFields,
} from "../theme/dynamic.ts";
import { serialize, type VNode } from "./vnode.ts";

export type RenderMode = "public" | "editor";
export type RenderWarning = {
  nodeId: string;
  code: "unknown-type" | "rejected-style" | "unknown-variable";
  detail: string;
};
export type RenderResult = {
  vnode: VNode;
  html: string;
  css: string;
  needsFormsRuntime: boolean;
  warnings: RenderWarning[];
};

const ID = /^[A-Za-z0-9_-]{4,24}$/;
const HTML_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const FORMS_SUBMIT_PATH = "/_emdash/api/plugins/emdash-forms/submit";

const honeypot = (formId: string): VNode => ({
  tag: "div",
  attrs: {
    class: "ec-form-hp",
    "aria-hidden": "true",
  },
  children: [
    {
      tag: "label",
      attrs: { for: `${formId}-_hp` },
      children: ["Leave blank"],
    },
    {
      tag: "input",
      attrs: {
        type: "text",
        id: `${formId}-_hp`,
        name: "_hp",
        tabindex: "-1",
        autocomplete: "off",
      },
      children: [],
    },
  ],
});

function withSelectOptions(
  vnode: VNode,
  definition: PublicFormDefinition | undefined,
  field: string,
): VNode {
  const meta = fieldByName(definition, field);
  if (!meta?.options?.length) return vnode;
  const options: VNode[] = [
    { tag: "option", attrs: { value: "" }, children: ["Choose…"] },
    ...meta.options.map((option): VNode => ({
      tag: "option",
      attrs: { value: option.value },
      children: [option.label],
    })),
  ];
  const patch = (node: VNode): VNode => {
    if (node.tag === "select") return { ...node, children: options };
    return {
      ...node,
      children: node.children.map((child) => (typeof child === "string" ? child : patch(child))),
    };
  };
  return patch(vnode);
}

function withRadioOptions(
  vnode: VNode,
  definition: PublicFormDefinition | undefined,
  field: string,
): VNode {
  const meta = fieldByName(definition, field);
  if (!meta?.options?.length) return vnode;
  const options: VNode[] = meta.options.map((option) => ({
    tag: "label",
    attrs: { class: "emvb-form-radio-label" },
    children: [
      { tag: "input", attrs: { type: "radio", name: field, value: option.value }, children: [] },
      ` ${option.label}`,
    ],
  }));
  const patch = (node: VNode): VNode => {
    if (node.tag === "fieldset" && (node.attrs.class ?? "").includes("emvb-radio-group")) {
      return { ...node, children: options };
    }
    return {
      ...node,
      children: node.children.map((child) => (typeof child === "string" ? child : patch(child))),
    };
  };
  return patch(vnode);
}

/**
 * Renders a validated layout to lean HTML and CSS (R-031, R-032). Walks defensively: unknown types
 * render nothing publicly and a placeholder in the editor (R-033); unsafe style values are dropped.
 */
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

function renderDynamicPost(
  node: LayoutNode,
  attrs: Record<string, string>,
  post: ThemePostFields | undefined,
  mode: RenderMode,
): VNode | undefined {
  if (node.type === "post-title") {
    if (!post)
      return mode === "editor" ? { tag: "h1", attrs, children: ["Post Title"] } : undefined;
    const level = (node.props as { level?: number }).level ?? 1;
    const tag = HEADING_TAGS[Math.min(6, Math.max(1, level)) - 1] ?? "h1";
    return { tag, attrs, children: [post.title] };
  }
  if (node.type === "post-excerpt") {
    if (!post) {
      return mode === "editor" ? { tag: "p", attrs, children: ["Post excerpt…"] } : undefined;
    }
    if (!post.excerpt) return undefined;
    return { tag: "p", attrs, children: [post.excerpt] };
  }
  if (node.type === "post-content") {
    if (!post) {
      return mode === "editor"
        ? {
            tag: "div",
            attrs,
            children: [{ tag: "p", attrs: {}, children: ["Post content…"] }],
          }
        : undefined;
    }
    const blocks = portableTextToVNodes(post.content);
    if (blocks.length === 0) return undefined;
    return { tag: "div", attrs, children: blocks };
  }
  if (node.type === "post-image") {
    if (!post?.featuredImageUrl) {
      return mode === "editor"
        ? {
            tag: "div",
            attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-post-image-missing`.trim() },
            children: ["Featured image"],
          }
        : undefined;
    }
    const src = sanitizeMediaUrl(post.featuredImageUrl);
    if (!src) return undefined;
    const decorative = (node.props as { decorative?: boolean }).decorative === true;
    const imgAttrs: Record<string, string> = { ...attrs, src };
    if (decorative) imgAttrs["alt"] = "";
    else imgAttrs["alt"] = post.featuredImageAlt?.trim() || post.title || "Featured image";
    return { tag: "img", attrs: imgAttrs, children: [] };
  }
  if (node.type === "post-link") {
    if (!post) {
      return mode === "editor"
        ? { tag: "a", attrs: { ...attrs, href: "#" }, children: ["Post link"] }
        : undefined;
    }
    const href = sanitizeHref(post.permalink);
    if (!href) return undefined;
    const label = (node.props as { text?: string }).text?.trim() || post.title || post.permalink;
    const linkAttrs: Record<string, string> = { ...attrs, href };
    if ((node.props as { newTab?: boolean }).newTab) {
      linkAttrs.target = "_blank";
      linkAttrs.rel = "noopener noreferrer";
    }
    return { tag: "a", attrs: linkAttrs, children: [label] };
  }
  return undefined;
}

export function renderPage(
  layout: Layout,
  design: DesignSystem,
  opts: {
    mode?: RenderMode;
    formDefinitions?: FormDefinitions;
    dynamic?: ThemeDynamicData;
  } = {},
): RenderResult {
  const mode = opts.mode ?? "public";
  const definitions = opts.formDefinitions ?? new Map();
  const baseDynamic = opts.dynamic;
  const warnings: RenderWarning[] = [];
  const usedTypes = new Set<string>();
  const localRules: { id: string; declarations: Declaration[] }[] = [];
  const knownVariables = new Set(design.variables.colors.map((c) => c.id));

  const visit = (
    node: LayoutNode,
    isRoot: boolean,
    dynamic: ThemeDynamicData | undefined = baseDynamic,
  ): VNode | undefined => {
    const id = ID.test(node.id) ? node.id : undefined;
    const nodeId = id ?? "(invalid id)";
    const type: string = node.type;
    if (!Object.hasOwn(ELEMENTS, type)) {
      warnings.push({ nodeId, code: "unknown-type", detail: type });
      if (mode === "public") return undefined;
      return {
        tag: "div",
        attrs: { class: "emvb-unknown", ...(id ? { "data-emvb-id": id } : {}) },
        children: [`Unknown element "${type}"`],
      };
    }
    usedTypes.add(type);
    const classes = [...(isRoot ? ["emvb-root"] : []), `emvb-${type}`];
    for (const classId of node.classes ?? []) {
      const name = styleClassName(classId);
      if (name) classes.push(name);
    }
    const { declarations, rejected } = styleDeclarations(node.style);
    for (const key of rejected) warnings.push({ nodeId, code: "rejected-style", detail: key });
    if (node.type === "spacer") {
      const height = cssLength((node as { props: { height: unknown } }).props.height);
      if (height) declarations.push({ property: "height", value: height });
    }
    const color = node.style?.color;
    if (typeof color === "object" && !knownVariables.has(color.var)) {
      warnings.push({ nodeId, code: "unknown-variable", detail: color.var });
    }
    if (id && declarations.length > 0) {
      classes.push(`emvb-e-${id}`);
      localRules.push({ id, declarations });
    }
    const attrs: Record<string, string> = { class: classes.join(" ") };
    if (mode === "editor" && id) attrs["data-emvb-id"] = id;
    if (node.htmlId && HTML_ID.test(node.htmlId)) attrs.id = node.htmlId;
    const def = ELEMENTS[type as keyof typeof ELEMENTS];

    if (isFormNode(node)) {
      const formId = node.props.formId.trim();
      // Unbound forms: no live <form>/ec-form shell (avoids broken preview; public stays zero-JS).
      if (!formId) {
        if (mode === "public") return undefined;
        return {
          tag: "div",
          attrs: {
            ...attrs,
            class: `${attrs.class} emvb-form-unbound`.trim(),
            "data-emvb-form-unbound": "",
          },
          children: ["Bind a form in settings to preview it here."],
        };
      }
      const definition = definitions.get(formId);
      const submitLabel = definition?.settings.submitLabel ?? "Submit";
      const children = node.children
        .map((child) => visit(child, false, dynamic))
        .filter((child): child is VNode => child !== undefined);
      const page: VNode = {
        tag: "div",
        attrs: { "data-page": "0" },
        children,
      };
      const formAttrs: Record<string, string> = {
        ...attrs,
        class: `${attrs.class} ec-form`.trim(),
        method: "POST",
        action: FORMS_SUBMIT_PATH,
        "data-ec-form": "",
        "data-form-id": formId,
        "data-submit-label": submitLabel,
      };
      const built: VNode = {
        tag: "form",
        attrs: formAttrs,
        children: [
          page,
          { tag: "input", attrs: { type: "hidden", name: "formId", value: formId }, children: [] },
          honeypot(formId),
          {
            tag: "div",
            attrs: { class: "ec-form-status", "data-form-status": "", "aria-live": "polite" },
            children: [],
          },
        ],
      };
      return built;
    }

    if (isLoopNode(node)) {
      const posts = resolvePostsForLoop(dynamic, mode);
      const itemPartId = node.props.itemPartId?.trim() ?? "";
      const templateLayout =
        itemPartId && dynamic?.loopTemplates ? dynamic.loopTemplates[itemPartId] : undefined;
      const templateNodes: LayoutNode[] = templateLayout
        ? templateLayout.root.children
        : node.children;
      if (posts.length === 0) {
        if (mode === "editor") {
          return {
            tag: "div",
            attrs: { ...attrs, "data-emvb-loop-empty": "" },
            children: ["Loop — add posts on the public archive to see items."],
          };
        }
        return undefined;
      }
      const children: VNode[] = [];
      for (const post of posts) {
        const itemDynamic: ThemeDynamicData = { ...dynamic, post };
        const itemChildren = templateNodes
          .map((child) => visit(child, false, itemDynamic))
          .filter((child): child is VNode => child !== undefined);
        children.push({
          tag: "div",
          attrs: { class: "emvb-loop-item", "data-emvb-loop-item": post.id },
          children: itemChildren,
        });
      }
      return def.build(node as never, attrs, children);
    }

    if (
      node.type === "post-title" ||
      node.type === "post-excerpt" ||
      node.type === "post-content" ||
      node.type === "post-image" ||
      node.type === "post-link"
    ) {
      const post = resolvePostForRender(dynamic, mode);
      return renderDynamicPost(node, attrs, post, mode);
    }

    if (isTabsNode(node)) {
      const panels = node.children.filter(isTabPanelNode).slice(0, 12);
      const group = `emvb-tabs-${id ?? "x"}`;
      const inputs: VNode[] = [];
      const labels: VNode[] = [];
      const panelNodes: VNode[] = [];
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        if (!panel) continue;
        const inputId = `${group}-${i}`;
        const inputAttrs: Record<string, string> = {
          type: "radio",
          name: group,
          id: inputId,
          class: "emvb-tab-input",
        };
        if (i === 0) inputAttrs.checked = "checked";
        inputs.push({ tag: "input", attrs: inputAttrs, children: [] });
        labels.push({
          tag: "label",
          attrs: {
            class: "emvb-tab-label",
            for: inputId,
            role: "tab",
          },
          children: [panel.props.label],
        });
        const body = panel.children
          .map((child) => visit(child, false, dynamic))
          .filter((child): child is VNode => child !== undefined);
        const panelAttrs: Record<string, string> = {
          class: "emvb-tab-panel",
          role: "tabpanel",
        };
        if (mode === "editor") panelAttrs["data-emvb-id"] = panel.id;
        panelNodes.push({ tag: "div", attrs: panelAttrs, children: body });
      }
      return {
        tag: "div",
        attrs,
        children: [
          ...inputs,
          { tag: "div", attrs: { class: "emvb-tab-list", role: "tablist" }, children: labels },
          { tag: "div", attrs: { class: "emvb-tab-panels" }, children: panelNodes },
        ],
      };
    }

    if (isParentNode(node)) {
      const children = node.children
        .map((child) => visit(child, false, dynamic))
        .filter((child): child is VNode => child !== undefined);
      return def.build(node as never, attrs, children);
    }

    let vnode = def.build(node as never, attrs, []);
    // Canvas iframe has no allow-scripts (D-011): live YouTube/Vimeo players fail there.
    if (mode === "editor" && node.type === "video") {
      const target = resolveEmbedUrl((node.props as { url: string }).url);
      if (target?.kind === "iframe") {
        const label =
          (node.props as { title?: string }).title?.trim() ||
          (target.provider === "youtube" ? "YouTube video" : "Vimeo video");
        return {
          tag: "div",
          attrs: {
            ...attrs,
            class: `${attrs.class} emvb-video-preview`.trim(),
            "data-emvb-video-preview": target.provider,
          },
          children: [`${label} — plays on the published page`],
        };
      }
    }
    if (node.type === "select" || node.type === "radio") {
      const field = (node.props as { field: string }).field;
      for (const definition of definitions.values()) {
        if (!fieldByName(definition, field)) continue;
        vnode =
          node.type === "select"
            ? withSelectOptions(vnode, definition, field)
            : withRadioOptions(vnode, definition, field);
        break;
      }
    }
    return vnode;
  };

  const vnode = visit(layout.root, true) ?? {
    tag: "div",
    attrs: { class: "emvb-root" },
    children: [],
  };
  const baseCss = new Map(Object.entries(ELEMENTS).map(([type, def]) => [type, def.baseCss]));
  return {
    vnode,
    html: serialize(vnode),
    css: generateCss({ design, usedTypes, baseCss, localRules }),
    needsFormsRuntime: layoutHasForm(layout),
    warnings,
  };
}

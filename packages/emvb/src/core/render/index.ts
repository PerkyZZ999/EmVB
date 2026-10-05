import { generateCss } from "../css/generate.ts";
import { cssScopeToken, scopeAttribute, scopeCss, scopeWrapperCss } from "../css/scope.ts";
import { ELEMENTS } from "../elements/index.ts";
import { layoutHasForm } from "../forms/binding.ts";
import { layoutHasTabs } from "../tabs/presence.ts";
import type { DesignSystem } from "../schema/design.ts";
import {
  isFormNode,
  isLoopNode,
  isParentNode,
  isSectionNode,
  isTabsNode,
  type Layout,
  type LayoutNode,
} from "../schema/layout.ts";
import {
  cssLength,
  stateDeclarations,
  styleClassName,
  styleDeclarations,
  type Declaration,
  type StateDeclarations,
} from "../sanitize/css.ts";
import { STYLE_STATES } from "../schema/state-names.ts";
import { resolveEmbedUrl } from "../sanitize/embed-url.ts";
import { resolvePostForRender, type ThemeDynamicData } from "../theme/dynamic.ts";
import type { FormDefinitions } from "../forms/definition.ts";
import type { PopupDevice } from "../theme/popup-rules.ts";
import type { RenderContext, RenderMode } from "./context.ts";
import { isDynamicPostNode, renderDynamicPost } from "./dynamic-post.ts";
import { renderForm, withFieldOptions } from "./form.ts";
import { renderLoop } from "./loop.ts";
import { renderSection } from "./section.ts";
import { renderTabs } from "./tabs.ts";
import { serialize, type VNode } from "./vnode.ts";
import { classStylesInListOrder } from "../design/cascade.ts";
import {
  applyBackgroundVideo,
  applyBoxLink,
  customAttributes,
  safeBackgroundVideo,
} from "./extras.ts";

export type { RenderMode } from "./context.ts";
export { FORMS_SUBMIT_PATH } from "./form.ts";

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
  needsTabsRuntime: boolean;
  warnings: RenderWarning[];
};

const ID = /^[A-Za-z0-9_-]{4,24}$/;
const HTML_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

// Canvas iframe has no allow-scripts (D-011): live YouTube/Vimeo players fail there.
function videoPreview(node: LayoutNode, attrs: Record<string, string>): VNode | undefined {
  const target = resolveEmbedUrl((node.props as { url: string }).url);
  if (target?.kind !== "iframe") return undefined;
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

/**
 * Renders a validated layout to lean HTML and CSS (R-031, R-032). Walks defensively: unknown types
 * render nothing publicly and a placeholder in the editor (R-033); unsafe style values are dropped.
 */
/** `grid-template-columns` for a whole column count from 1 to 12; anything else emits nothing. */
const gridTracks = (columns: unknown): Declaration[] =>
  typeof columns === "number" && Number.isInteger(columns) && columns >= 1 && columns <= 12
    ? [{ property: "grid-template-columns", value: `repeat(${columns}, minmax(0, 1fr))` }]
    : [];

export function renderPage(
  layout: Layout,
  design: DesignSystem,
  opts: {
    mode?: RenderMode;
    formDefinitions?: FormDefinitions;
    dynamic?: ThemeDynamicData;
    /** Public renders: wrap the markup and scope the CSS to it, so sheets can't override each other (W-112). */
    scope?: string;
    /** Editor canvas: device rules follow this device, not the frame width (W-116). */
    previewDevice?: PopupDevice;
  } = {},
): RenderResult {
  const mode = opts.mode ?? "public";
  const baseDynamic = opts.dynamic;
  const warnings: RenderWarning[] = [];
  const usedTypes = new Set<string>();
  const localRules: {
    id: string;
    declarations: Declaration[];
    states: StateDeclarations;
    tablet?: Declaration[];
    mobile?: Declaration[];
    hiddenOn?: LayoutNode["hiddenOn"];
  }[] = [];
  const knownVariables = new Set(design.variables.colors.map((c) => c.id));
  let backgroundVideo = false;

  const ctx: RenderContext = {
    mode,
    definitions: opts.formDefinitions ?? new Map(),
    children: (nodes, dynamic) =>
      nodes
        .map((child) => visit(child, false, dynamic))
        .filter((child): child is VNode => child !== undefined),
  };

  const nodeAttrs = (
    node: LayoutNode,
    isRoot: boolean,
    id: string | undefined,
    nodeId: string,
  ): Record<string, string> => {
    const classes = [...(isRoot ? ["emvb-root"] : []), `emvb-${node.type}`];
    for (const classId of node.classes ?? []) {
      const name = styleClassName(classId);
      if (name) classes.push(name);
    }
    const { declarations, rejected } = styleDeclarations(node.style);
    const tablet = styleDeclarations(node.devices?.tablet);
    const mobile = styleDeclarations(node.devices?.mobile);
    for (const key of [...rejected, ...tablet.rejected, ...mobile.rejected]) {
      warnings.push({ nodeId, code: "rejected-style", detail: key });
    }
    if (node.type === "spacer") {
      const height = cssLength((node as { props: { height: unknown } }).props.height);
      if (height) declarations.push({ property: "height", value: height });
    }
    if (node.type === "layout-section") {
      // The inner box's width (W-156): full width, or a length; unset keeps the 1140 px default.
      const props = (node as { props: { contentWidth?: unknown; fullWidth?: unknown } }).props;
      const width = props.fullWidth === true ? "none" : cssLength(props.contentWidth);
      if (width) declarations.push({ property: "--emvb-content-width", value: width });
    }
    if (node.type === "grid") {
      const props = (node as { props: Record<string, unknown> }).props;
      declarations.push(...gridTracks(props["columns"]));
      // Tablet and mobile counts go in their media queries (W-139).
      tablet.declarations.unshift(...gridTracks(props["columnsTablet"]));
      mobile.declarations.unshift(...gridTracks(props["columnsMobile"]));
    }
    const states = stateDeclarations(node.states);
    for (const key of states.rejected) {
      warnings.push({ nodeId, code: "rejected-style", detail: key });
    }
    for (const color of [node.style?.color, ...STYLE_STATES.map((s) => node.states?.[s]?.color)]) {
      if (typeof color === "object" && !knownVariables.has(color.var)) {
        warnings.push({ nodeId, code: "unknown-variable", detail: color.var });
      }
    }
    const hiddenOn = node.hiddenOn;
    const responsive =
      tablet.declarations.length > 0 ||
      mobile.declarations.length > 0 ||
      (hiddenOn?.length ?? 0) > 0;
    if (id && (declarations.length > 0 || Object.keys(states.states).length > 0 || responsive)) {
      classes.push(`emvb-e-${id}`);
      localRules.push({
        id,
        declarations,
        states: states.states,
        tablet: tablet.declarations,
        mobile: mobile.declarations,
        hiddenOn,
      });
    }
    const attrs: Record<string, string> = { class: classes.join(" "), ...customAttributes(node) };
    if (mode === "editor" && id) attrs["data-emvb-id"] = id;
    if (node.htmlId && HTML_ID.test(node.htmlId)) attrs.id = node.htmlId;
    return attrs;
  };

  function visit(
    node: LayoutNode,
    isRoot: boolean,
    dynamic: ThemeDynamicData | undefined = baseDynamic,
  ): VNode | undefined {
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
    const attrs = nodeAttrs(node, isRoot, id, nodeId);
    const def = ELEMENTS[type as keyof typeof ELEMENTS];
    if (isFormNode(node)) return finish(node, renderForm(node, attrs, ctx, dynamic));
    if (isLoopNode(node)) return finish(node, renderLoop(node, attrs, ctx, dynamic));
    if (isSectionNode(node)) return finish(node, renderSection(node, attrs, ctx, dynamic));
    if (isDynamicPostNode(node)) {
      return finish(
        node,
        renderDynamicPost(node, attrs, resolvePostForRender(dynamic, mode), mode),
      );
    }
    if (isTabsNode(node)) return finish(node, renderTabs(node, id, attrs, ctx, dynamic));
    if (isParentNode(node)) {
      return finish(node, def.build(node as never, attrs, ctx.children(node.children, dynamic)));
    }
    if (mode === "editor" && node.type === "video") {
      const preview = videoPreview(node, attrs);
      if (preview) return finish(node, preview);
    }
    return finish(
      node,
      withFieldOptions(def.build(node as never, attrs, []), node, ctx.definitions),
    );
  }

  function videoOf(node: LayoutNode): string | undefined {
    let found: string | undefined;
    for (const style of classStylesInListOrder(design.classes, node.classes ?? [])) {
      const safe = safeBackgroundVideo(style?.backgroundVideo);
      if (safe) found = safe;
    }
    const own = safeBackgroundVideo(node.style?.backgroundVideo);
    return own ?? found;
  }

  function finish(node: LayoutNode, vnode: VNode | undefined): VNode | undefined {
    if (!vnode) return undefined;
    const src = videoOf(node);
    if (src) backgroundVideo = true;
    return applyBackgroundVideo(applyBoxLink(node, vnode), src);
  }

  const vnode = visit(layout.root, true) ?? {
    tag: "div",
    attrs: { class: "emvb-root" },
    children: [],
  };
  const baseCss = new Map(Object.entries(ELEMENTS).map(([type, def]) => [type, def.baseCss]));
  const html = serialize(vnode);
  const css = generateCss({
    design,
    usedTypes,
    baseCss,
    localRules,
    previewStates: mode === "editor",
    backgroundVideo,
    ...(mode === "editor" && opts.previewDevice ? { previewDevice: opts.previewDevice } : {}),
  });
  const scope = opts.scope === undefined ? undefined : cssScopeToken(opts.scope);
  return {
    vnode,
    html: scope ? `<div ${scopeAttribute(scope)}>${html}</div>` : html,
    css: scope ? scopeWrapperCss() + scopeCss(css, scope) : css,
    needsFormsRuntime: layoutHasForm(layout),
    needsTabsRuntime: layoutHasTabs(layout),
    warnings,
  };
}

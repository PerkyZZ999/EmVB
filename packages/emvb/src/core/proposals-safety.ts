import { ELEMENT_DESCRIPTORS } from "./elements/index.ts";
import { isFlatMotionKey } from "./migrate/v18.ts";
import { isRecord } from "./record.ts";
import { isSafeCssValue, isSafeFontStack } from "./sanitize/css.ts";
import { sanitizeHref } from "./sanitize/href.ts";
import { sanitizeMediaUrl } from "./sanitize/media-url.ts";
import { isSafeSvgMarkup } from "./sanitize/svg.ts";
import type { DesignSystem } from "./schema/design.ts";
import type { Layout } from "./schema/layout.ts";
import { stableJson } from "./stable-json.ts";
import { findNode, forEachNode } from "./tree-ops.ts";

const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

function styleRefusal(raw: unknown, key = ""): string | undefined {
  if (typeof raw === "string" && raw !== "") {
    const safe = key === "fontFamily" ? isSafeFontStack(raw) : isSafeCssValue(raw);
    if (!safe) return `Unsafe style value at ${key}.`;
  }
  if (Array.isArray(raw)) {
    for (const value of raw) {
      const reason = styleRefusal(value, key);
      if (reason) return reason;
    }
  } else if (isRecord(raw)) {
    for (const [name, value] of Object.entries(raw)) {
      if (key !== "motion" && isFlatMotionKey(name))
        return "Use frozen style.motion keys, not legacy motion fields.";
      if ((name === "src" || name === "url") && typeof value === "string") {
        if (value.trim() && !sanitizeMediaUrl(value)) return "Unsafe background media URL.";
      } else {
        const reason = styleRefusal(value, name);
        if (reason) return reason;
      }
    }
  }
  return undefined;
}

/** Reuse the renderer's allowlists. Old, unchanged unsafe fields remain readable like MCP writes. */
export function proposalSafetyRefusal(
  before: Layout,
  after: Layout,
  oldDesign: DesignSystem,
  design: DesignSystem,
): string | undefined {
  let reason: string | undefined;
  forEachNode(after.root, (node) => {
    if (reason) return;
    const old = findNode(before, node.id);
    const props = node.props as Record<string, unknown>;
    const oldProps = old?.props as Record<string, unknown> | undefined;
    for (const field of ELEMENT_DESCRIPTORS.find((d) => d.type === node.type)?.fields ?? []) {
      const value = props[field.key];
      if (
        field.kind === "href" &&
        typeof value === "string" &&
        value.trim() &&
        value !== oldProps?.[field.key] &&
        sanitizeHref(value) === undefined
      )
        reason = `Unsafe link on ${node.id}.${field.key}.`;
    }
    if (!same(node.props, old?.props)) {
      const sources = node.type === "image" && Array.isArray(props.sources) ? props.sources : [];
      const urls = [
        node.type === "image" || node.type === "video" ? props.src : undefined,
        ...sources.map((s: { src?: unknown }) => s.src),
      ];
      if (urls.some((url) => typeof url === "string" && url.trim() && !sanitizeMediaUrl(url)))
        reason = `Unsafe media URL on ${node.id}.`;
      for (const markup of [node.type === "svg" ? props.markup : undefined, props.iconSvg]) {
        if (typeof markup === "string" && markup.trim() && !isSafeSvgMarkup(markup))
          reason = `Unsafe SVG on ${node.id}.`;
      }
    }
    for (const key of ["style", "states", "devices", "query"] as const) {
      if (!same(node[key], old?.[key])) reason ??= styleRefusal(node[key]);
    }
  });
  for (const cls of design.classes ?? []) {
    if (
      !same(
        cls,
        oldDesign.classes?.find((c) => c.id === cls.id),
      )
    ) {
      for (const raw of [cls.style, cls.states, cls.devices]) reason ??= styleRefusal(raw);
    }
  }
  for (const font of design.variables.fonts ?? []) {
    if (
      !same(
        font,
        oldDesign.variables.fonts?.find((v) => v.id === font.id),
      ) &&
      !isSafeFontStack(font.value)
    )
      reason ??= "Unsafe font stack.";
  }
  return reason;
}

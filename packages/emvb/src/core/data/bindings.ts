import type { Binding, BindSource, LayoutNode } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import type { ThemePostFields } from "../theme/dynamic.ts";

/**
 * Live data bindings (W-307). A text, image or link field can read a post field, a site setting
 * or a URL parameter instead of its typed value. The typed value stays as the fallback, so a page
 * never shows an empty heading because a parameter is missing. Values are plain text: the element
 * still escapes text and sanitizes links and image URLs, exactly as for a typed value.
 */

/** How a bound value is used, which decides how it's cleaned before the element sees it. */
export type BindKind = "text" | "url" | "image";

export type BindableField = { key: string; label: string; kind: BindKind };

const TEXT = (label = "Text"): BindableField => ({ key: "text", label, kind: "text" });
const HREF = (label = "Link"): BindableField => ({ key: "href", label, kind: "url" });

/** Which props of which elements can be bound. Anything else in `bind` is ignored on render. */
export const BINDABLE_FIELDS: Readonly<Record<string, readonly BindableField[]>> = {
  heading: [TEXT(), HREF()],
  text: [TEXT()],
  label: [TEXT()],
  link: [TEXT(), HREF("URL")],
  button: [TEXT(), HREF()],
  image: [
    { key: "src", label: "Image", kind: "image" },
    { key: "alt", label: "Alt text", kind: "text" },
  ],
  icon: [HREF(), { key: "title", label: "Title", kind: "text" }],
  "menu-item": [TEXT("Label"), HREF()],
  container: [HREF()],
  "div-block": [HREF()],
  flexbox: [HREF()],
  grid: [HREF()],
};

export const bindableFields = (type: string): readonly BindableField[] =>
  Object.hasOwn(BINDABLE_FIELDS, type) ? (BINDABLE_FIELDS[type] ?? []) : [];

/** The post fields the editor offers by name; any other key reads the post's own data. */
export const POST_BIND_KEYS = [
  { key: "title", label: "Title" },
  { key: "excerpt", label: "Excerpt" },
  { key: "permalink", label: "Permalink" },
  { key: "slug", label: "Slug" },
  { key: "publishedAt", label: "Published date" },
  { key: "authorName", label: "Author" },
  { key: "featuredImageUrl", label: "Featured image" },
  { key: "featuredImageAlt", label: "Featured image alt" },
] as const;

/** Site settings hosts pass in by default (EmDash's `getSiteSettings`). */
export const SITE_BIND_KEYS = [
  { key: "title", label: "Site title" },
  { key: "tagline", label: "Tagline" },
  { key: "url", label: "Site URL" },
] as const;

export const BIND_SOURCE_LABELS: Readonly<Record<BindSource, string>> = {
  post: "Post field",
  site: "Site setting",
  param: "URL parameter",
};

/** Where bound values come from on this render. */
export type BindingData = {
  post?: ThemePostFields;
  site?: Readonly<Record<string, string>>;
  params?: Readonly<Record<string, string>>;
};

/** Longest bound value an element receives; longer values are cut (URL parameters are untrusted). */
export const MAX_BOUND_LENGTH = 500;

const POST_KEYS = new Set<string>(POST_BIND_KEYS.map((k) => k.key));

function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
}

function postValue(post: ThemePostFields | undefined, key: string): string | undefined {
  if (!post) return undefined;
  if (POST_KEYS.has(key)) return scalar((post as Record<string, unknown>)[key]);
  const fields = post.fields;
  if (!fields || !Object.hasOwn(fields, key)) return undefined;
  return scalar(fields[key]);
}

/** Text with control characters removed and its length capped. */
function clean(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 10 || code === 9) out += char === "\t" ? " " : char;
    else if (code >= 32 && code !== 127) out += char;
    if (out.length >= MAX_BOUND_LENGTH) break;
  }
  return out.slice(0, MAX_BOUND_LENGTH).trim();
}

/** The live value of one binding, or undefined when its source has nothing for this key. */
export function resolveBinding(binding: Binding, data: BindingData): string | undefined {
  let raw: string | undefined;
  if (binding.source === "post") raw = postValue(data.post, binding.key);
  else if (binding.source === "site") {
    raw = data.site && Object.hasOwn(data.site, binding.key) ? data.site[binding.key] : undefined;
  } else {
    raw =
      data.params && Object.hasOwn(data.params, binding.key) ? data.params[binding.key] : undefined;
  }
  if (raw === undefined) return undefined;
  const value = clean(raw);
  return value.length > 0 ? value : undefined;
}

/** True when the node has at least one binding render would use. */
export function hasBindings(node: LayoutNode): boolean {
  const bind = node.bind;
  if (!bind) return false;
  return bindableFields(node.type).some((field) => Object.hasOwn(bind, field.key));
}

/**
 * The node with its bound props replaced by live values (W-307). Unbindable keys, empty values and
 * links or images the sanitizer would refuse leave the typed prop as it is, so a bad URL parameter
 * can't blank a button or an image. A bound text field that is single-line stays single-line.
 */
export function applyBindings(node: LayoutNode, data: BindingData): LayoutNode {
  const bind = node.bind;
  if (!bind) return node;
  let props: Record<string, unknown> | undefined;
  for (const field of bindableFields(node.type)) {
    const binding = Object.hasOwn(bind, field.key) ? bind[field.key] : undefined;
    if (!binding) continue;
    let value = resolveBinding(binding, data);
    if (value === undefined) continue;
    if (field.kind !== "text" || node.type !== "text") value = value.replace(/\s*\n\s*/g, " ");
    if (field.kind === "url" && !sanitizeHref(value)) continue;
    if (field.kind === "image" && !sanitizeMediaUrl(value)) continue;
    props ??= { ...(node.props as Record<string, unknown>) };
    props[field.key] = value;
    // A bound image is no longer the media library item it was picked from.
    if (field.kind === "image") delete props["mediaId"];
  }
  return props ? ({ ...node, props } as LayoutNode) : node;
}

/** Sets or clears one binding, dropping `bind` once it is empty. */
export function withBinding(
  node: LayoutNode,
  key: string,
  binding: Binding | undefined,
): LayoutNode {
  const next: Record<string, Binding> = { ...node.bind };
  if (binding) next[key] = binding;
  else delete next[key];
  const { bind: _old, ...rest } = node;
  return (Object.keys(next).length > 0 ? { ...rest, bind: next } : rest) as LayoutNode;
}

/** Search parameters as a plain record, first value per name, with names and values capped. */
export function paramsFromSearch(search: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  let count = 0;
  for (const [name, value] of search) {
    if (count >= 50) break;
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) || Object.hasOwn(params, name)) continue;
    params[name] = value.slice(0, MAX_BOUND_LENGTH * 4);
    count += 1;
  }
  return params;
}

/** Site settings as flat text for bindings (W-307): `title`, `tagline`, `url`, `social.github`… */
export function siteBindingValues(settings: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!settings || typeof settings !== "object") return out;
  const add = (key: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = String(value);
  };
  for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
    if (key === "seo") continue;
    if (value && typeof value === "object") {
      if (key === "logo" || key === "favicon") {
        const media = value as { src?: unknown; url?: unknown };
        add(key, media.src ?? media.url);
        continue;
      }
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        add(`${key}.${inner}`, innerValue);
      }
      continue;
    }
    add(key, value);
  }
  return out;
}

/** Whether any node in the tree reads a source (hosts fetch site settings only when needed). */
export function layoutUsesSource(root: LayoutNode, source: BindSource): boolean {
  const walk = (node: LayoutNode): boolean => {
    if (node.bind && Object.values(node.bind).some((b) => b.source === source)) return true;
    const children: unknown = (node as { children?: unknown }).children;
    return Array.isArray(children) && (children as LayoutNode[]).some(walk);
  };
  return walk(root);
}

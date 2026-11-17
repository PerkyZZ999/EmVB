import { MAX_URL_PARAM_RULES, URL_PARAM_NAME, type UrlParamRule } from "../../../core/index.ts";

/**
 * W-1081: a popup's URL rules as the editor writes them, one per line: `utm_source=newsletter`
 * (that value), `coupon` (there at all), `!preview` or `!lang=fr` (not there).
 */
export function formatUrlRules(rules: readonly UrlParamRule[] | null | undefined): string {
  return (rules ?? [])
    .map((r) => `${r.absent ? "!" : ""}${r.name}${r.value === undefined ? "" : `=${r.value}`}`)
    .join("\n");
}

export type ParsedUrlRules = { ok: true; rules: UrlParamRule[] } | { ok: false; message: string };

export function parseUrlRules(text: string): ParsedUrlRules {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > MAX_URL_PARAM_RULES)
    return { ok: false, message: `Use at most ${MAX_URL_PARAM_RULES} rules.` };
  const rules: UrlParamRule[] = [];
  for (const line of lines) {
    const absent = line.startsWith("!");
    const body = absent ? line.slice(1).trim() : line;
    const at = body.indexOf("=");
    const name = (at === -1 ? body : body.slice(0, at)).trim();
    if (!URL_PARAM_NAME.test(name))
      return {
        ok: false,
        message: `"${line}" isn't a rule: write a name such as utm_source, then =value if you like.`,
      };
    const value = at === -1 ? undefined : body.slice(at + 1).trim();
    if (value !== undefined && value.length > 200)
      return { ok: false, message: "A value can be at most 200 characters." };
    rules.push({
      name,
      ...(value === undefined ? {} : { value }),
      ...(absent ? { absent: true } : {}),
    });
  }
  return { ok: true, rules };
}

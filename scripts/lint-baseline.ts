/**
 * W-1012: findings from oxlint's react and jsx-a11y plugins that predate them, recorded per rule
 * and file as `"off"` overrides at the end of `.oxlintrc.json`. New files get every rule; a file
 * leaves the baseline once it is fixed.
 *
 *   bun scripts/lint-baseline.ts          rewrite the baseline from the current findings
 *   bun scripts/lint-baseline.ts --check  fail when an entry no longer has a finding
 */
import { $ } from "bun";

const CONFIG =
  process.env["LINT_BASELINE_CONFIG"] ?? new URL("../.oxlintrc.json", import.meta.url).pathname;
const ROOT = new URL("..", import.meta.url).pathname;

type Override = { files: string[]; rules: Record<string, unknown> };
type Config = { overrides?: Override[] } & Record<string, unknown>;

/** Diagnostic code as oxlint prints it, e.g. "react(refs)", to its config name "react/refs". */
export const ruleName = (code: string) => code.replace(/^([\w-]+)\((.+)\)$/, "$1/$2");

/** A baseline entry: a single rule turned off for a list of files. */
export const isBaselineEntry = (o: Override, plugins: readonly string[]) => {
  const rules = Object.entries(o.rules);
  return (
    rules.length === 1 &&
    rules[0]?.[1] === "off" &&
    plugins.some((p) => rules[0]?.[0].startsWith(`${p}/`))
  );
};

export const BASELINE_PLUGINS = ["react", "react-hooks", "jsx-a11y"] as const;

/** Groups findings into one override per rule, files sorted, rules sorted. */
export function baselineFrom(diagnostics: { code: string; filename: string }[]): Override[] {
  const byRule = new Map<string, Set<string>>();
  for (const f of diagnostics) {
    const rule = ruleName(f.code);
    if (!BASELINE_PLUGINS.some((p) => rule.startsWith(`${p}/`))) continue;
    (byRule.get(rule) ?? byRule.set(rule, new Set()).get(rule))?.add(f.filename);
  }
  return [...byRule.keys()]
    .toSorted()
    .map((rule) => ({ files: [...(byRule.get(rule) ?? [])].toSorted(), rules: { [rule]: "off" } }));
}

async function findings(config: Config) {
  const temp = `${ROOT}.oxlintrc.baseline-tmp.json`;
  await Bun.write(temp, JSON.stringify(config));
  try {
    const out = await $`bunx oxlint -c ${temp} --format=json`.cwd(ROOT).nothrow().quiet();
    return (
      JSON.parse(out.stdout.toString()) as {
        diagnostics: { code: string; filename: string }[];
      }
    ).diagnostics;
  } finally {
    await $`rm -f ${temp}`.quiet();
  }
}

if (import.meta.main) {
  const config = (await Bun.file(CONFIG).json()) as Config;
  const kept = (config.overrides ?? []).filter((o) => !isBaselineEntry(o, BASELINE_PLUGINS));
  const fresh = baselineFrom(await findings({ ...config, overrides: kept }));
  if (process.argv.includes("--check")) {
    const current = (config.overrides ?? []).filter((o) => isBaselineEntry(o, BASELINE_PLUGINS));
    const have = new Set(
      fresh.flatMap((o) => o.files.map((f) => `${Object.keys(o.rules)[0]} ${f}`)),
    );
    const stale = current.flatMap((o) =>
      o.files.map((f) => `${Object.keys(o.rules)[0]} ${f}`).filter((k) => !have.has(k)),
    );
    if (stale.length > 0) {
      // oxlint-disable-next-line no-console -- a CLI
      console.error(
        `Lint baseline entries with nothing left to excuse; run bun scripts/lint-baseline.ts:\n  ${stale.join("\n  ")}`,
      );
      process.exit(1);
    }
    // oxlint-disable-next-line no-console -- a CLI
    console.info("lint baseline: every entry still has a finding");
  } else {
    await Bun.write(CONFIG, JSON.stringify({ ...config, overrides: [...kept, ...fresh] }, null, 2));
    await $`bunx oxfmt ${CONFIG}`.cwd(ROOT).quiet();
    // oxlint-disable-next-line no-console -- a CLI
    console.info(`lint baseline: ${fresh.reduce((n, o) => n + o.files.length, 0)} entries`);
  }
}

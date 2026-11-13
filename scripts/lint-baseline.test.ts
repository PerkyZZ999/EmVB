import { expect, test } from "bun:test";
import { $ } from "bun";
import { BASELINE_PLUGINS, baselineFrom, isBaselineEntry, ruleName } from "./lint-baseline.ts";

// W-1012: the react, jsx-a11y and vitest oxlint plugins are on; findings from before them are a
// per-file baseline that only shrinks.

test("W-1012: the react, jsx-a11y and vitest plugins are on", async () => {
  const config = (await Bun.file(new URL("../.oxlintrc.json", import.meta.url)).json()) as {
    plugins: string[];
  };
  expect(config.plugins).toEqual(expect.arrayContaining(["react", "jsx-a11y", "vitest"]));
});

test("W-1012: findings group into one off-override per rule; other plugins never baseline", () => {
  const entries = baselineFrom([
    { code: "react(refs)", filename: "b.tsx" },
    { code: "react(refs)", filename: "a.tsx" },
    { code: "jsx-a11y(no-autofocus)", filename: "a.tsx" },
    { code: "eslint(no-console)", filename: "a.tsx" },
    { code: "typescript(no-explicit-any)", filename: "a.tsx" },
  ]);
  expect(entries).toEqual([
    { files: ["a.tsx"], rules: { "jsx-a11y/no-autofocus": "off" } },
    { files: ["a.tsx", "b.tsx"], rules: { "react/refs": "off" } },
  ]);
  expect(ruleName("react-hooks(exhaustive-deps)")).toBe("react-hooks/exhaustive-deps");
});

test("W-1012: only single-rule off-overrides of the baselined plugins count as baseline", () => {
  expect(isBaselineEntry({ files: ["x"], rules: { "react/refs": "off" } }, BASELINE_PLUGINS)).toBe(
    true,
  );
  expect(
    isBaselineEntry({ files: ["x"], rules: { "no-await-in-loop": "off" } }, BASELINE_PLUGINS),
  ).toBe(false);
  expect(
    isBaselineEntry({ files: ["x"], rules: { "react/refs": "error" } }, BASELINE_PLUGINS),
  ).toBe(false);
});

test("W-1012: every baseline entry still excuses a finding", async () => {
  const out = await $`bun ${new URL("./lint-baseline.ts", import.meta.url).pathname} --check`
    .nothrow()
    .quiet();
  expect(out.stderr.toString()).toBe("");
  expect(out.exitCode).toBe(0);
}, 60_000);

test("W-1012: an entry whose file no longer has the finding is reported", async () => {
  const config = (await Bun.file(new URL("../.oxlintrc.json", import.meta.url)).json()) as {
    overrides: { files: string[]; rules: Record<string, string> }[];
  };
  const path = `${process.env["TMPDIR"] ?? "/tmp"}/emvb-lint-baseline-${process.pid}.json`;
  await Bun.write(
    path,
    JSON.stringify({
      ...config,
      overrides: [
        ...config.overrides,
        { files: ["packages/emvb/src/index.ts"], rules: { "react/refs": "off" } },
      ],
    }),
  );
  try {
    const out = await $`bun ${new URL("./lint-baseline.ts", import.meta.url).pathname} --check`
      .env({ ...process.env, LINT_BASELINE_CONFIG: path })
      .nothrow()
      .quiet();
    expect(out.exitCode).toBe(1);
    expect(out.stderr.toString()).toContain("react/refs packages/emvb/src/index.ts");
  } finally {
    await $`rm -f ${path}`.quiet();
  }
}, 60_000);

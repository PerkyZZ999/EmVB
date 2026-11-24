import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// W-1063: CI runs a Node-demo e2e smoke set on PRs and the whole suite on release tags, on the
// EmDash 1.4 floor and on the latest.
type Job = {
  if?: string;
  env?: Record<string, string>;
  strategy?: { matrix?: Record<string, unknown[]> };
  steps: { run?: string; uses?: string; with?: Record<string, unknown> }[];
};
const ci = Bun.YAML.parse(
  readFileSync(join(import.meta.dir, "../.github/workflows/ci.yml"), "utf8"),
) as { on: { push: { tags?: string[] } }; jobs: Record<string, Job> };
const runs = (job: Job | undefined) => (job?.steps ?? []).map((step) => step.run ?? "");

test("W-1063: the e2e smoke set runs on pull requests", () => {
  const smoke = ci.jobs["e2e-smoke"];
  expect(runs(smoke)).toContain("bun run e2e:smoke");
  expect(smoke?.if ?? "").not.toContain("refs/tags/v");
  expect(smoke?.env?.["EMVB_CHROMIUM"]).toBeTruthy();
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  expect(pkg.scripts["e2e:smoke"]).toContain("--project=node");
});

test("W-1063: the whole e2e suite runs on release tags, on EmDash 1.4 and the latest", () => {
  const full = ci.jobs["e2e-full"];
  expect(ci.on.push.tags).toContain("v*");
  expect(full?.if ?? "").toContain("refs/tags/v");
  expect(runs(full).some((run) => run.startsWith("bun run e2e:full"))).toBe(true);
  expect(full?.strategy?.matrix?.["emdash"]).toEqual(["1.4.0", "latest"]);
  expect(runs(full)).toContain("bun scripts/use-emdash.ts ${{ matrix.emdash }}");
});

test("W-1096: the tag run splits the suite in shards that together cover every spec file", () => {
  const full = ci.jobs["e2e-full"];
  const shards = full?.strategy?.matrix?.["shard"] ?? [];
  const run = runs(full).find((r) => r.startsWith("bun run e2e:full")) ?? "";
  expect(run).toBe(`bun run e2e:full --shards ${shards.length} --only-shard \${{ matrix.shard }}`);
  // One job per shard number, 1 to n: none left out.
  expect(shards).toEqual(Array.from({ length: shards.length }, (_, i) => i + 1));
});

test("W-1075: the compat corpus is compared by look on every run, against the base's files", () => {
  const look = ci.jobs["compat-look"];
  expect(look?.if).toBeUndefined();
  expect(runs(look)).toContain("bun run compat:look --all");
  expect(look?.env?.["EMVB_CHROMIUM"]).toBeTruthy();
  expect(look?.env?.["EMVB_COMPAT_BASE"]).toContain("github.event.pull_request.base.sha");
  expect(
    look?.steps.find((s) => s.uses?.startsWith("actions/checkout"))?.with?.["fetch-depth"],
  ).toBe(0);
  const upload = look?.steps.find((s) => s.uses?.startsWith("actions/upload-artifact"));
  expect(upload?.with?.["path"]).toBe("test-results/compat-look/");
});

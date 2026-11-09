/**
 * The whole e2e suite, fast (W-942): one Playwright run per platform, both at once. Each run
 * starts its demo server once (node on 4411, Cloudflare on 4412) instead of once per file, and
 * the two platforms never share a server or data, so they can't disturb each other.
 *
 *   bun run e2e:full [playwright args...]   e.g. `bun run e2e:full e2e/devices.e2e.ts -g W-956`
 *
 * Output goes to e2e/.results/<platform>.log and test-results/<platform>/; failures are listed at
 * the end. Traces are off unless you pass --trace (re-run a failing test with --trace on). Exits
 * non-zero when either platform fails.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const out = join(root, "e2e/.results");
await mkdir(out, { recursive: true });
const extra = process.argv.slice(2);
const platforms = ["node", "cloudflare"] as const;

const started = Date.now();
const runs = platforms.map(async (platform) => {
  const log = Bun.file(join(out, `${platform}.log`));
  const child = Bun.spawn(
    [
      "bunx",
      "playwright",
      "test",
      `--project=${platform}`,
      // Each run has its own results folder: one cleaning it must not break the other.
      `--output=test-results/${platform}`,
      // Recording a trace for every test costs about a third of the CPU; re-run one with --trace on.
      ...(extra.some((arg) => arg.startsWith("--trace")) ? [] : ["--trace=off"]),
      ...extra,
    ],
    {
      cwd: root,
      env: { ...process.env, EMVB_E2E_PLATFORM: platform, CI: process.env["CI"] ?? "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const code = await child.exited;
  await Bun.write(log, stdout + stderr);
  const summary = (stdout.match(/^\s+\d+ (passed|failed|flaky|skipped|did not run).*$/gm) ?? [])
    .map((line) => line.trim())
    .join(", ");
  const failures = stdout.match(/^\s+✘.*$/gm) ?? [];
  return { platform, code, summary, failures };
});

const results = await Promise.all(runs);
const minutes = ((Date.now() - started) / 60_000).toFixed(1);
const print = (line: string) => process.stdout.write(`${line}\n`);
for (const { platform, code, summary, failures } of results) {
  print(`${platform}: ${code === 0 ? "ok" : `exit ${code}`} — ${summary || "no summary"}`);
  for (const line of failures) print(`  ${line.trim()}`);
}
print(`e2e:full finished in ${minutes} min; logs in e2e/.results/`);
process.exit(results.every((r) => r.code === 0) ? 0 : 1);

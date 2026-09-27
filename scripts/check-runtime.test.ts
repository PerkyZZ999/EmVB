import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProblems, runsOnNode } from "./check-runtime.ts";

describe("runsOnNode", () => {
  test.each([
    ["astro dev --port 1", true],
    ["wrangler dev", true],
    ["HOST=1 PORT=2 astro build", true],
    ["bunx wrangler dev", true],
    ["bun build && vitest run", true],
    ["bun --bun astro dev", false],
    ["bunx --bun vitest run", false],
    ["bun ./dist/server/entry.mjs", false],
    ["oxlint --deny-warnings", false],
  ])("%s -> %p", (command, expected) => {
    expect(runsOnNode(command)).toBe(expected);
  });
});

describe("findProblems", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function fixture(scripts: Record<string, string>, listed: string[]) {
    root = await mkdtemp(join(tmpdir(), "emvb-runtime-"));
    await mkdir(join(root, "demos/site"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["demos/*"] }));
    await writeFile(join(root, "demos/site/package.json"), JSON.stringify({ scripts }));
    const node = listed.map((script) => ({ script, reason: "r", evidence: "e" }));
    await writeFile(join(root, "runtime-exceptions.json"), JSON.stringify({ node }));
    return root;
  }

  test("accepts listed Node scripts and Bun scripts", async () => {
    const dir = await fixture({ dev: "astro dev", build: "bun --bun astro build" }, [
      "demos/site#dev",
    ]);
    expect(await findProblems(dir)).toEqual([]);
  });

  test("reports an unlisted Node script", async () => {
    const dir = await fixture({ dev: "astro dev" }, []);
    expect(await findProblems(dir)).toEqual([
      'demos/site#dev runs on Node ("astro dev") but is not listed in runtime-exceptions.json',
    ]);
  });

  test("reports a listed script that now runs on Bun, and one that no longer exists", async () => {
    const dir = await fixture({ dev: "bun --bun astro dev" }, [
      "demos/site#dev",
      "demos/site#gone",
    ]);
    expect(await findProblems(dir)).toEqual([
      'demos/site#dev is listed but now runs on Bun ("bun --bun astro dev")',
      "demos/site#gone is listed but no such script exists",
    ]);
  });
});

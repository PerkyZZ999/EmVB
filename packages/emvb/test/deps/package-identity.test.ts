import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ADMIN_ENTRY } from "../../src/constants.ts";
import { emvb } from "../../src/index.ts";

type Manifest = { name: string; version: string; exports: Record<string, string> };

const manifest = (): Promise<Manifest> =>
  Bun.file(join(import.meta.dir, "../../package.json")).json();

describe("package identity (W-123)", () => {
  test("the descriptor's entrypoint is the npm package name, so a host can import it", async () => {
    expect(emvb().entrypoint).toBe((await manifest()).name);
  });

  test("the admin entry is the package's ./admin export", async () => {
    const pkg = await manifest();
    expect(ADMIN_ENTRY).toBe(`${pkg.name}/admin`);
    expect(pkg.exports["./admin"]).toBe("./src/admin/index.tsx");
  });

  test("the plugin reports the package version", async () => {
    expect(emvb().version).toBe((await manifest()).version);
  });
});

test("W-1011: the entrypoint exports createPlugin by name only, as EmDash imports it", async () => {
  const entry = (await import("../../src/index.ts")) as Record<string, unknown>;
  expect(typeof entry["createPlugin"]).toBe("function");
  expect(Object.hasOwn(entry, "default")).toBe(false);
});

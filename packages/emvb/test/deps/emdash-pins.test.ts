import { describe, expect, test } from "bun:test";
import { join } from "node:path";

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const pluginDir = join(import.meta.dir, "../..");
const read = (dir: string): Promise<Manifest> => Bun.file(join(dir, "package.json")).json();

/** The installed package folder that `from` resolves `name` to. */
function packageDir(name: string, from: string): string {
  const entry = Bun.resolveSync(name, from);
  const marker = `/node_modules/${name}/`;
  return entry.slice(0, entry.lastIndexOf(marker) + marker.length - 1);
}

/**
 * The Kumo each supported EmDash pins exactly: 1.4 (what this repository builds with) and 1.5
 * (W-993). npm refuses to install EmVB next to a Kumo its peer range doesn't name.
 */
const SUPPORTED_KUMO = { "emdash 1.4": "2.6.0", "emdash 1.5": "2.15.0" };

describe("EmDash's exact pins (D-030)", () => {
  test("the Kumo dev version equals the Kumo that @emdash-cms/admin pins, and the peer names it", async () => {
    const plugin = await read(pluginDir);
    const admin = await read(packageDir("@emdash-cms/admin", packageDir("emdash", pluginDir)));
    const kumo = admin.dependencies?.["@cloudflare/kumo"];
    expect(kumo).toMatch(/^\d+\.\d+\.\d+$/);
    expect(plugin.devDependencies?.["@cloudflare/kumo"]).toBe(kumo);
    expect(peerVersions(plugin)).toContain(kumo);
  });

  test("the Kumo peer is exact versions only, one per supported EmDash (W-993)", async () => {
    const plugin = await read(pluginDir);
    const peer = plugin.peerDependencies?.["@cloudflare/kumo"] ?? "";
    expect(peer).toMatch(/^\d+\.\d+\.\d+( \|\| \d+\.\d+\.\d+)*$/);
    expect(peerVersions(plugin)).toEqual(Object.values(SUPPORTED_KUMO));
  });
});

function peerVersions(plugin: Manifest): string[] {
  return (plugin.peerDependencies?.["@cloudflare/kumo"] ?? "").split(" || ");
}

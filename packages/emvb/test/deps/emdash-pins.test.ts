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

describe("EmDash's exact pins (D-030)", () => {
  test("the Kumo peer and dev versions equal the Kumo that @emdash-cms/admin pins", async () => {
    const plugin = await read(pluginDir);
    const admin = await read(packageDir("@emdash-cms/admin", packageDir("emdash", pluginDir)));
    const kumo = admin.dependencies?.["@cloudflare/kumo"];
    expect(kumo).toMatch(/^\d+\.\d+\.\d+$/);
    expect(plugin.peerDependencies?.["@cloudflare/kumo"]).toBe(kumo);
    expect(plugin.devDependencies?.["@cloudflare/kumo"]).toBe(kumo);
  });
});

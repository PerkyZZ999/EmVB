import { afterEach, describe, expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBridgeServer } from "../src/bridge.ts";
import { OptionsError } from "../src/options.ts";
import type { Remote, ToolResult } from "../src/remote.ts";
import { readTokenFile } from "../src/token-file.ts";

/** Bridge fixes from the 0.5.0 live MCP run (W-474). */
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function bridgeWith(remote: Remote) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createBridgeServer({ remote, allowPublish: false }).connect(serverSide);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

describe("token file (W-474)", () => {
  const dir = mkdtempSync(join(tmpdir(), "emvb-token-"));
  test("a file other users can read is refused, or used with a warning when allowed (W-1001)", () => {
    const path = join(dir, "loose.token");
    writeFileSync(path, "secret", { mode: 0o644 });
    const warnings: string[] = [];
    if (process.platform !== "win32") {
      expect(() => readTokenFile((m) => warnings.push(m))(path)).toThrow("chmod 600");
      expect(() => readTokenFile((m) => warnings.push(m))(path)).toThrow(OptionsError);
    }
    expect(readTokenFile((m) => warnings.push(m))(path, true)).toBe("secret");
    if (process.platform !== "win32") expect(warnings.join(" ")).toContain("chmod 600");
  });
  test("a private file reads without a warning", () => {
    const path = join(dir, "tight.token");
    writeFileSync(path, "secret", { mode: 0o600 });
    const warnings: string[] = [];
    readTokenFile((m) => warnings.push(m))(path);
    expect(warnings).toEqual([]);
  });
  test("a missing file is a plain options error", () => {
    expect(() => readTokenFile(() => undefined)(join(dir, "nope"))).toThrow(OptionsError);
    expect(() => readTokenFile(() => undefined)(join(dir, "nope"))).toThrow("No token file at");
  });
});

describe("bridge errors and resources (W-474)", () => {
  test("a revoked or expired token gets the new-token advice", async () => {
    const c = await bridgeWith({
      call: async () => {
        throw new Error(
          'Error POSTing to endpoint: {"success":false,"error":{"code":"INVALID_TOKEN","message":"Invalid or expired token"}}',
        );
      },
      close: async () => undefined,
    });
    const result = (await c.callTool({ name: "list_pages", arguments: {} })) as ToolResult;
    expect(result.content[0]?.text).toContain("revoked or expired");
  });

  test("an unknown page resource view is an error, not the layout", async () => {
    const c = await bridgeWith({
      call: async () => ({ content: [], structuredContent: { rev: "r" } }),
      close: async () => undefined,
    });
    await expect(c.readResource({ uri: "emvb://pages/p1/bogus" })).rejects.toThrow("Unknown view");
  });

  test("the design reference is served with the skill", async () => {
    const c = await bridgeWith({
      call: async () => ({ content: [] }),
      close: async () => undefined,
    });
    const design = await c.readResource({ uri: "skill://emvb-page-builder/references/design.md" });
    expect((design.contents[0] as { text: string }).text).toContain("fs-4xl");
  });
});

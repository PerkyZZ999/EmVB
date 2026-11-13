import { describe, expect, test } from "bun:test";
import { parseOptions } from "../src/options.ts";
import { redactToken } from "../src/remote.ts";

const read = (path: string) => (path === "/tok" ? "ec_pat_file\n" : "");

describe("bridge options (W-461)", () => {
  test("site and token from env; the endpoint is EmDash's MCP", () => {
    const o = parseOptions(
      ["--site", "https://example.com/some/path"],
      { EMVB_TOKEN: "ec_pat_x" },
      read,
    );
    expect(o.endpoint.href).toBe("https://example.com/_emdash/api/mcp");
    expect(o.token).toBe("ec_pat_x");
    expect(o.allowPublish).toBe(false);
  });

  test("token from a file; --allow-publish", () => {
    const o = parseOptions(
      ["--site=https://a.dev", "--token-file", "/tok", "--allow-publish"],
      {},
      read,
    );
    expect(o.token).toBe("ec_pat_file");
    expect(o.allowPublish).toBe(true);
  });

  test("refuses a token on the command line, plain http and a missing token", () => {
    expect(() => parseOptions(["--site", "https://a.dev", "--token", "x"], {}, read)).toThrow(
      "never on the command line",
    );
    expect(() => parseOptions(["--site", "http://a.dev"], { EMVB_TOKEN: "x" }, read)).toThrow(
      "https",
    );
    expect(() => parseOptions(["--site", "https://a.dev"], {}, read)).toThrow("EMVB_TOKEN");
  });

  test("http is allowed for localhost", () => {
    const o = parseOptions(["--site", "http://localhost:4321"], { EMVB_TOKEN: "x" }, read);
    expect(o.endpoint.href).toBe("http://localhost:4321/_emdash/api/mcp");
  });
});

describe("bridge release identity (W-472)", () => {
  test("the bridge version, its package version and the EmVB core it bundles match", async () => {
    const { BRIDGE_VERSION } = await import("../src/bridge.ts");
    const readPkg = async (path: string) =>
      (await Bun.file(new URL(path, import.meta.url)).json()) as {
        version: string;
        devDependencies: Record<string, string>;
      };
    const bridge = await readPkg("../package.json");
    const core = await readPkg("../../emvb/package.json");
    expect(bridge.version).toBe(BRIDGE_VERSION);
    expect(bridge.devDependencies["@perkyzz/emvb"]).toBe(core.version);
    expect(bridge.version).toBe(core.version);
  });
});

describe("tokens that would leak or be ignored (W-498)", () => {
  const twoLines = () => "abc123\n# my token\n";
  test("a token file with a second line is refused without echoing the token", () => {
    let message = "";
    try {
      parseOptions(["--site", "https://a.dev", "--token-file", "/t"], {}, twoLines);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("must hold only the token");
    expect(message).not.toContain("abc123");
  });
  test("a token with a space in EMVB_TOKEN is refused; a trailing newline is fine", () => {
    expect(() =>
      parseOptions(["--site", "https://a.dev"], { EMVB_TOKEN: "ab cd" }, twoLines),
    ).toThrow("space or line break");
    expect(
      parseOptions(["--site", "https://a.dev"], { EMVB_TOKEN: "abcd\n" }, twoLines).token,
    ).toBe("abcd");
  });
  test("--token-file with no path is an error, not a silent fallback", () => {
    expect(() =>
      parseOptions(["--site", "https://a.dev", "--token-file"], { EMVB_TOKEN: "t" }, twoLines),
    ).toThrow("--token-file needs a path");
  });
  test("an error that quotes the token is redacted", () => {
    const e = redactToken(new Error('Headers.append: "Bearer s3cr3t" is invalid'), "s3cr3t");
    expect((e as Error).message).toBe('Headers.append: "Bearer [token]" is invalid');
  });
});

test("W-1001: --allow-loose-token-file reaches the token file reader", () => {
  const asked: boolean[] = [];
  const reader = (path: string, allowLoose: boolean) => {
    asked.push(allowLoose);
    return path === "/tok" ? "ec_pat_file" : "";
  };
  parseOptions(["--site", "https://a.dev", "--token-file", "/tok"], {}, reader);
  parseOptions(
    ["--site", "https://a.dev", "--token-file", "/tok", "--allow-loose-token-file"],
    {},
    reader,
  );
  expect(asked).toEqual([false, true]);
});

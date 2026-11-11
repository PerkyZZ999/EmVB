import { describe, expect, test } from "bun:test";
import { crc32, safeZipPath, zipFiles } from "./zip.ts";

/** Reads a stored ZIP back through its central directory, checking each CRC. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, decoder.decode(data));
    at += 46 + nameLength;
  }
  return out;
}

describe("zipFiles (W-963)", () => {
  test("known CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  test("entries read back with their names and bytes", () => {
    const files = unzip(
      zipFiles([
        { path: "index.html", data: "<p>Hi</p>" },
        { path: "about/style.css", data: ".a{color:red}" },
        { path: "media/é.txt", data: new Uint8Array([104, 105]) },
      ]),
    );
    expect([...files.keys()]).toEqual(["index.html", "about/style.css", "media/é.txt"]);
    expect(files.get("about/style.css")).toBe(".a{color:red}");
    expect(files.get("media/é.txt")).toBe("hi");
  });

  test("the same files give the same bytes", () => {
    const one = zipFiles([{ path: "a.txt", data: "x" }]);
    expect(zipFiles([{ path: "a.txt", data: "x" }])).toEqual(one);
  });

  test("refuses paths that leave the folder or repeat", () => {
    for (const bad of ["../x", "/abs", "a/../b", "a\\b", "", "a//b"])
      expect(safeZipPath(bad)).toBe(false);
    expect(() => zipFiles([{ path: "../evil", data: "" }])).toThrow(/Unsafe/);
    expect(() =>
      zipFiles([
        { path: "a", data: "" },
        { path: "a", data: "" },
      ]),
    ).toThrow(/Repeated/);
  });
});

export { unzip };

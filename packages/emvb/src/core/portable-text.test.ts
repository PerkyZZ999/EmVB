import { describe, expect, test } from "bun:test";
import { portableTextToLayout } from "./portable-text.ts";

const span = (text: string) => ({ _type: "span", text, marks: [] });
const block = (text: string, extra: Record<string, unknown> = {}) => ({
  _type: "block",
  style: "normal",
  children: [span(text)],
  ...extra,
});

describe("Portable Text to a starter layout (W-912)", () => {
  test("W-912: headings, text, lists and images become elements in order", () => {
    const body = [
      block("Intro", { style: "h2" }),
      block("Hello "),
      block("One", { listItem: "bullet" }),
      block("Two", { listItem: "bullet" }),
      block("First", { listItem: "number" }),
      { _type: "image", alt: "A cat", asset: { _ref: "med_1", url: "/media/cat.jpg" } },
      { _type: "code", code: "x" },
    ];
    const result = portableTextToLayout(body, "My page");
    expect(result).not.toBeNull();
    const kids = result?.layout.root.children?.map((n) => [n.type, n.props]);
    expect(kids).toEqual([
      ["heading", { text: "My page", level: 1 }],
      ["heading", { text: "Intro", level: 2 }],
      ["text", { text: "Hello" }],
      ["list", { ordered: false, items: ["One", "Two"] }],
      ["list", { ordered: true, items: ["First"] }],
      ["image", { src: "/media/cat.jpg", alt: "A cat", mediaId: "med_1" }],
    ]);
    expect(result?.skipped).toBe(1);
    expect(result?.converted).toBe(5);
  });

  test("W-912: hostile input is copied as text only and unsafe image URLs are dropped", () => {
    const body = [
      block('<script>alert(1)</script><img src=x onerror="y">'),
      { _type: "image", alt: "x", asset: { url: "javascript:alert(1)" } },
      { _type: "image", asset: { url: "data:image/png;base64,AAA" } },
      { _type: "image", asset: { url: "//evil.example/x.png" } },
      { _type: "image", asset: { url: "https://cdn.example/x.png", _ref: "../../etc" } },
      { _type: "block", style: "h9", children: [{ text: 42 }, span("ok")] },
      "string",
      null,
    ];
    const result = portableTextToLayout(body);
    const kids = result?.layout.root.children ?? [];
    expect(kids.map((n) => n.type)).toEqual(["text", "image", "text"]);
    expect(kids[0]?.props).toEqual({ text: '<script>alert(1)</script><img src=x onerror="y">' });
    expect(kids[1]?.props).toEqual({ src: "https://cdn.example/x.png", alt: "", decorative: true });
    expect(kids[2]?.props).toEqual({ text: "ok" });
    expect(result?.skipped).toBe(5);
  });

  test("W-912: anything but a block array is refused, and the input is never changed", () => {
    expect(portableTextToLayout("<p>hi</p>")).toBeNull();
    expect(portableTextToLayout({ blocks: [] })).toBeNull();
    const body = [block("Keep me", { style: "h3" })];
    const copy = structuredClone(body);
    portableTextToLayout(body, "T");
    expect(body).toEqual(copy);
  });
});

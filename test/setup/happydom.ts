import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect } from "bun:test";

// Component tests run against the admin URL shape that plugin pages see in the browser.
GlobalRegistrator.register({ url: "http://127.0.0.1:4411/_emdash/admin/plugins/emvb/pages" });

// Tells React that component tests wrap updates in act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A failing matcher prints its values, and a happy-dom node reaches the whole window and React
// fiber graph: one failed `expect(element).toBeNull()` printed gigabytes and got the desktop
// killed (2026-09-30). So nodes print as a short tag, and the diff matchers, which ignore that
// hook, refuse nodes outright.
const MAX_PRINT = 200;

/** A node as bun prints it in a failure: its markup, cut to a few lines. */
function briefNode(node: Node): string {
  const text = node instanceof Element ? node.outerHTML : `${node.nodeName} ${node.textContent}`;
  return text.length > MAX_PRINT ? `${text.slice(0, MAX_PRINT)}…` : text;
}

Object.defineProperty(Object.getPrototypeOf(Node.prototype) as object, Bun.inspect.custom, {
  configurable: true,
  value(this: unknown) {
    return this instanceof Node ? briefNode(this) : `[${String(this?.constructor.name)}]`;
  },
});

/** Whether a node or the window sits in a value, looking through arrays, plain objects and mocks. */
export function holdsDomNode(value: unknown, seen = new Set<unknown>()): boolean {
  if (value instanceof Node || value === window) return true;
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const calls = (value as { mock?: { calls?: unknown } }).mock?.calls;
  if (typeof value === "function") return Array.isArray(calls) && holdsDomNode(calls, seen);
  const proto: unknown = Object.getPrototypeOf(value);
  if (value instanceof Map || value instanceof Set) {
    return [...value.values()].some((item) => holdsDomNode(item, seen));
  }
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).some((item) => holdsDomNode(item, seen));
}

type BuiltIn = (this: unknown, ...args: unknown[]) => unknown;
const matchers = Object.getPrototypeOf(expect(null)) as Record<string, BuiltIn | undefined>;
// Taken before expect.extend below replaces them on the same prototype.
const builtIns = new Map(
  [
    "toEqual",
    "toStrictEqual",
    "toMatchObject",
    "toHaveProperty",
    "toHaveBeenCalledWith",
    "toHaveBeenLastCalledWith",
    "toHaveBeenNthCalledWith",
  ].map((name) => [name, matchers[name]]),
);

function refuseNodes(
  context: { isNot: boolean },
  name: string,
  received: unknown,
  args: unknown[],
) {
  const builtIn = builtIns.get(name);
  if (!builtIn) throw new Error(`bun:test has no ${name} to guard`);
  if (holdsDomNode(received) || args.some((arg) => holdsDomNode(arg))) {
    return {
      pass: context.isNot,
      message: () =>
        `${name} refuses DOM nodes (printing one takes gigabytes). ` +
        "Compare a property such as textContent or outerHTML, or use toBe for identity.",
    };
  }
  try {
    builtIn.apply(context.isNot ? expect(received).not : expect(received), args);
    return { pass: !context.isNot, message: () => `${name} passed` };
  } catch (error) {
    // Bun heads the failure with the matcher's name, so drop the built-in's own heading.
    const detail = error instanceof Error ? error.message : String(error);
    return { pass: context.isNot, message: () => detail.replace(/^expect\(.*\n+/, "") };
  }
}

// Plain methods: bun reads the failure heading, e.g. "toEqual(expected)", from their source.
expect.extend({
  toEqual(received: unknown, expected: unknown) {
    return refuseNodes(this, "toEqual", received, [expected]);
  },
  toStrictEqual(received: unknown, expected: unknown) {
    return refuseNodes(this, "toStrictEqual", received, [expected]);
  },
  toMatchObject(received: unknown, expected: unknown) {
    return refuseNodes(this, "toMatchObject", received, [expected]);
  },
  toHaveProperty(received: unknown, ...expected: unknown[]) {
    return refuseNodes(this, "toHaveProperty", received, expected);
  },
  toHaveBeenCalledWith(received: unknown, ...expected: unknown[]) {
    return refuseNodes(this, "toHaveBeenCalledWith", received, expected);
  },
  toHaveBeenLastCalledWith(received: unknown, ...expected: unknown[]) {
    return refuseNodes(this, "toHaveBeenLastCalledWith", received, expected);
  },
  toHaveBeenNthCalledWith(received: unknown, ...expected: unknown[]) {
    return refuseNodes(this, "toHaveBeenNthCalledWith", received, expected);
  },
});

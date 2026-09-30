import { expect, test } from "bun:test";
import { validateConditions } from "./conditions.ts";
import { validateTriggers } from "./triggers.ts";

// Recorded before W-086 L2 shared the JSON/schema step of both validators.
const INPUTS: unknown[] = [
  "{not json",
  "",
  "null",
  null,
  42,
  [],
  {},
  { schemaVersion: 2, rules: [], open: [] },
  { schemaVersion: 1, rules: [{ id: "", op: "maybe", group: "x", name: "", args: { a: [] } }] },
  {
    schemaVersion: 1,
    open: [{ type: "delay", ms: -1 }, { type: "nope" }],
    advanced: { showTimes: 0 },
  },
  { schemaVersion: 1, rules: [], open: [{ type: "page_load" }], extra: true },
  JSON.stringify({ schemaVersion: 1, rules: [], open: [{ type: "page_load" }] }),
  { schemaVersion: 1, rules: [{ id: "a", op: "include", group: "general", name: "nowhere" }] },
  { schemaVersion: 1, open: [{ type: "click", selector: "<b>" }] },
];

test("both validators report the same issues for every input", () => {
  expect(INPUTS.map((raw) => [validateConditions(raw), validateTriggers(raw)])).toMatchSnapshot();
});

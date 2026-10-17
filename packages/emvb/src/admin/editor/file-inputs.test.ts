import { expect, test } from "bun:test";
import { Glob } from "bun";

test("UX-050: a visually hidden file input stays out of the Tab order and the accessibility tree", async () => {
  const offenders: string[] = [];
  let seen = 0;
  for await (const path of new Glob("**/*.tsx").scan({ cwd: `${import.meta.dir}/..` })) {
    if (path.includes(".test.")) continue;
    const source = await Bun.file(`${import.meta.dir}/../${path}`).text();
    for (const match of source.matchAll(/<input\b(?:(?!<input\b)[\s\S])*?\/>/g)) {
      const tag = match[0];
      if (!tag.includes('type="file"')) continue;
      seen += 1;
      if (/\bhidden\b(?!=)/.test(tag)) continue;
      if (!tag.includes("tabIndex={-1}") || !tag.includes('aria-hidden="true"')) {
        offenders.push(`${path}: ${tag.match(/data-emvb-[\w-]+/)?.[0] ?? "file input"}`);
      }
    }
  }
  expect(seen >= 4 ? "scanned" : `only ${seen} file inputs found`).toBe("scanned");
  expect(offenders).toEqual([]);
});

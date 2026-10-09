import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  createPage,
  createThemePart,
  publishPage,
  publishThemePart,
  setUpEmvbOnce,
} from "./support/api.ts";
import { unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** The elements under test: an A/B pair, a Canada-only heading and a hidden-on-mobile note. */
const personalized = (id: string, name: string) => [
  {
    id: `${id}a`,
    type: "heading",
    props: { text: `Arm A ${name}`, level: 2 },
    variant: { test: name, arm: "a" },
  },
  {
    id: `${id}b`,
    type: "heading",
    props: { text: `Arm B ${name}`, level: 2 },
    variant: { test: name, arm: "b" },
  },
  {
    id: `${id}c`,
    type: "heading",
    props: { text: `Hello Canada ${name}`, level: 2 },
    audience: { countries: ["CA"] },
  },
  {
    id: `${id}d`,
    type: "text",
    props: { text: `Not on phones ${name}` },
    audience: { devices: ["mobile"], hide: true },
  },
];

const layoutOf = (children: unknown[]) => ({
  schemaVersion: 13,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Personal", level: 1 } },
      ...children,
    ],
  },
});

/** A public GET with no session, so only the cookies we send count. */
async function visit(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string> = {},
) {
  const response = await request.get(path, { headers, maxRedirects: 0 });
  expect(response.status()).toBe(200);
  return {
    html: await response.text(),
    cacheControl: response.headers()["cache-control"] ?? "",
    setCookie: response
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value)
      .join("\n"),
  };
}

async function expectPersonalized(visitor: APIRequestContext, path: string, name: string) {
  const cookie = `emvb_ab_${name.replaceAll("-", "_")}`;

  // A first visit gets one arm, a cookie that keeps it, and a private response.
  const first = await visit(visitor, path, { "cf-ipcountry": "CA" });
  const arms = [`Arm A ${name}`, `Arm B ${name}`].filter((t) => first.html.includes(t));
  expect(arms).toHaveLength(1);
  expect(first.setCookie).toMatch(new RegExp(`${cookie}=[ab];`));
  expect(first.setCookie).toContain("HttpOnly");
  expect(first.cacheControl).toContain("private");
  expect(first.cacheControl).toContain("no-store");
  expect(first.html).toContain(`Hello Canada ${name}`);
  expect(first.html).toContain(`Not on phones ${name}`);

  // The cookie decides the arm on later visits, and sets nothing new.
  for (const arm of ["a", "b"] as const) {
    const again = await visit(visitor, path, { cookie: `${cookie}=${arm}; emvb_seen=1` });
    expect(again.html).toContain(`Arm ${arm.toUpperCase()} ${name}`);
    expect(again.html).not.toContain(`Arm ${arm === "a" ? "B" : "A"} ${name}`);
    expect(again.setCookie).not.toContain(cookie);
  }

  // Another country, or no country at all, doesn't see the Canada heading; phones lose the note.
  const us = await visit(visitor, path, { "cf-ipcountry": "US", "user-agent": IPHONE });
  expect(us.html).not.toContain(`Hello Canada ${name}`);
  expect(us.html).not.toContain(`Not on phones ${name}`);
  // Cloudflare's dev server fills request.cf with the dev machine's own country, so only the
  // Node demo truly has no country here.
  if (test.info().project.name === "node") {
    const unknown = await visit(visitor, path, { "cf-ipcountry": "XX" });
    expect(unknown.html).not.toContain(`Hello Canada ${name}`);
  }
}

test("A/B arms and visitor rules are decided on the server, per visitor (W-312, W-313)", async ({
  request,
  playwright,
  baseURL,
}) => {
  const tag = unique();
  const testName = `ab-${tag}`.slice(0, 32);
  const slug = `personal-${tag}`;
  const id = await createPage(
    request,
    `Personal ${tag}`,
    layoutOf(personalized("pers", testName)),
    slug,
  );
  await publishPage(request, id);
  const visitor = await playwright.request.newContext({ baseURL, storageState: undefined });
  try {
    await expectPersonalized(visitor, `/${slug}`, testName);
  } finally {
    await visitor.dispose();
  }
});

test("A/B arms and visitor rules inside a synced section work too", async ({
  request,
  playwright,
  baseURL,
}) => {
  const tag = unique();
  const testName = `sync-${tag}`.slice(0, 32);
  const partId = await createThemePart(request, {
    title: `Synced ${tag}`,
    partType: "section",
    layout: {
      schemaVersion: 13,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: personalized("sync", testName),
      },
    },
  });
  await publishThemePart(request, partId);
  const slug = `personal-sync-${tag}`;
  const id = await createPage(
    request,
    `Personal sync ${tag}`,
    layoutOf([{ id: "sect0001", type: "section", props: { partId }, children: [] }]),
    slug,
  );
  await publishPage(request, id);
  const visitor = await playwright.request.newContext({ baseURL, storageState: undefined });
  try {
    await expectPersonalized(visitor, `/${slug}`, testName);
  } finally {
    await visitor.dispose();
  }
});

test("a page without tests or visitor rules sets no cookies and isn't private", async ({
  request,
  playwright,
  baseURL,
}) => {
  const slug = `plain-${unique()}`;
  const id = await createPage(request, "Plain", layoutOf([]), slug);
  await publishPage(request, id);
  const visitor = await playwright.request.newContext({ baseURL, storageState: undefined });
  try {
    const plain = await visit(visitor, `/${slug}`);
    expect(plain.setCookie).not.toContain("emvb_");
    expect(plain.cacheControl).not.toContain("private");
  } finally {
    await visitor.dispose();
  }
});

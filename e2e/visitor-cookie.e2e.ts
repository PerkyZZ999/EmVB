import { expect, test, type APIRequestContext } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

// W-1092 (#34): both demos run with emvb({ visitorCookie: "consent",
// visitorCookieConsent: { cookie: "emvb_demo_consent" } }).
test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const CONSENT = "emvb_demo_consent=1";

const layoutOf = (children: unknown[]) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Cookies", level: 1 } },
      ...children,
    ],
  },
});

/**
 * A public GET with no session, from a fresh context each time: a shared one would keep the
 * cookies earlier responses set, so only the cookies we send count.
 */
async function visit(open: () => Promise<APIRequestContext>, path: string, cookie?: string) {
  const visitor = await open();
  try {
    const response = await visitor.get(path, {
      headers: cookie ? { cookie } : {},
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    return {
      html: await response.text(),
      setCookie: response
        .headersArray()
        .filter((h) => h.name.toLowerCase() === "set-cookie")
        .map((h) => h.value)
        .join("\n"),
    };
  } finally {
    await visitor.dispose();
  }
}

async function publish(request: APIRequestContext, name: string, children: unknown[]) {
  const slug = `${name}-${unique()}`;
  const id = await createPage(request, `Cookies ${slug}`, layoutOf(children), slug);
  await publishPage(request, id);
  return `/${slug}`;
}

test("only a new/returning rule sets emvb_seen, and only with consent (W-1092)", async ({
  request,
  playwright,
  baseURL,
}) => {
  const tag = unique();
  const countryPage = await publish(request, "cookie-country", [
    {
      id: "ctry0001",
      type: "heading",
      props: { text: `Canada ${tag}`, level: 2 },
      audience: { countries: ["CA"] },
    },
    {
      id: "devc0001",
      type: "text",
      props: { text: `Phones ${tag}` },
      audience: { devices: ["mobile"] },
    },
  ]);
  const visitorPage = await publish(request, "cookie-visitor", [
    {
      id: "newv0001",
      type: "heading",
      props: { text: `Welcome new ${tag}`, level: 2 },
      audience: { visitor: "new" },
    },
    {
      id: "retv0001",
      type: "heading",
      props: { text: `Welcome back ${tag}`, level: 2 },
      audience: { visitor: "returning" },
    },
  ]);
  const visitor = () => playwright.request.newContext({ baseURL, storageState: undefined });
  // A page with only country and device rules never sets it, consent or not.
  for (const cookie of [undefined, CONSENT]) {
    const plain = await visit(visitor, countryPage, cookie);
    expect(plain.setCookie).not.toContain("emvb_seen");
  }

  // With consent, a first visit is new and gets the one-year cookie.
  const first = await visit(visitor, visitorPage, CONSENT);
  expect(first.html).toContain(`Welcome new ${tag}`);
  expect(first.html).not.toContain(`Welcome back ${tag}`);
  expect(first.setCookie).toMatch(/emvb_seen=1;/);
  expect(first.setCookie).toContain("HttpOnly");
  expect(first.setCookie).toMatch(/Max-Age=31536000/i);

  // With consent and the cookie, the visitor is returning and nothing new is set.
  const back = await visit(visitor, visitorPage, `${CONSENT}; emvb_seen=1`);
  expect(back.html).toContain(`Welcome back ${tag}`);
  expect(back.html).not.toContain(`Welcome new ${tag}`);
  expect(back.setCookie).not.toContain("emvb_seen");

  // Without consent: no cookie, and everyone is new.
  const noConsent = await visit(visitor, visitorPage);
  expect(noConsent.html).toContain(`Welcome new ${tag}`);
  expect(noConsent.html).not.toContain(`Welcome back ${tag}`);
  expect(noConsent.setCookie).not.toContain("emvb_seen");

  // Consent withdrawn (or refused): an old cookie is ignored and cleared.
  const withdrawn = await visit(visitor, visitorPage, "emvb_demo_consent=no; emvb_seen=1");
  expect(withdrawn.html).toContain(`Welcome new ${tag}`);
  expect(withdrawn.html).not.toContain(`Welcome back ${tag}`);
  expect(withdrawn.setCookie).toMatch(/emvb_seen=;/);
  expect(withdrawn.setCookie).toMatch(/Max-Age=0/i);
});

import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Component tests run against the admin URL shape that plugin pages see in the browser.
GlobalRegistrator.register({ url: "http://127.0.0.1:4411/_emdash/admin/plugins/emvb/pages" });

// Tells React that component tests wrap updates in act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

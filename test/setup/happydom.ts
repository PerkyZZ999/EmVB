import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Component tests run against the admin URL shape that plugin pages see in the browser.
GlobalRegistrator.register({ url: "http://127.0.0.1:4411/_emdash/admin/plugins/emvb/pages" });

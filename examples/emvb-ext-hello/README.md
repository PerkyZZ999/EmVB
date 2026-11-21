# emvb-ext-hello

Sample EmVB Extensions API v1 package (W-927). Adds:

- a **Greeting** element (`ext:emvb-ext-hello/greeting`) with a text prop
- an **About Hello** editor panel (declarative Kumo slot)
- a read-only **site-info** source with `title` and `tagline`
- (W-1086) a class allowlist (`hello-card`, `hello-title`, `hello-wave`), a stylesheet
  (`src/hello.css`) and a small runtime (`src/hello-runtime.js`) that marks each card ready and
  plays a one-time wave unless the visitor prefers reduced motion. `module: import.meta.url` lets
  EmVB bundle the package into the server build (Cloudflare Workers included) and find both files.

Register it in `astro.config`:

```js
import { emvb } from "@perkyzz/emvb";
import hello from "emvb-ext-hello";

emvb({
  canvasStyles: ["/site.css"],
  canvasCollections: ["pages"],
  extensions: [hello],
});
```

Removing the extension leaves pages that used the Greeting element valid: EmVB
shows a placeholder instead of crashing.

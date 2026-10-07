# Third-party notices

EmVB is MIT licensed. The editor's **Icon library** (`src/admin/editor/icons/sets/*.json`) contains icons from the projects below. They keep their own licenses, copied in full in [`licenses/`](licenses/). `scripts/build-icon-sets.ts` in the EmVB repository builds the set files from the pinned npm packages. It refuses to build when a package's license file changes.

Changes made to every set: the SVG markup is reformatted into compact JSON, and only elements and attributes in EmVB's SVG allowlist are kept. Class attributes and comments are removed. Shared presentation attributes (stroke or fill, viewBox) move to the root `<svg>`. Set-specific changes are listed with each set.

When an editor picks an icon, its SVG is stored with the page and shown inline on the public site. No icon library is loaded there.

## Lucide

- Package: `lucide-static` 1.52.0, <https://lucide.dev>
- License: ISC, Copyright (c) 2026 Lucide Icons and Contributors. Icons derived from Feather: MIT, Copyright (c) 2013-present Cole Bemis. Full text: [`licenses/lucide-static.LICENSE`](licenses/lucide-static.LICENSE).
- The 26 icons EmVB bundled before the library (`src/core/icons/catalog.ts`) are also Lucide icons, under the same license.

## Font Awesome Free

- Package: `@fortawesome/fontawesome-free` 7.3.1, <https://fontawesome.com>
- Icons: Font Awesome Free by Fonticons, Inc., licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Full text: [`licenses/fontawesome-free.LICENSE`](licenses/fontawesome-free.LICENSE).
- Changes: the attribution comment in each SVG file is removed by EmVB's sanitizer, so this notice carries the attribution. Each path's `fill="currentColor"` moves to the root `<svg>`.
- Brand icons are trademarks of their owners. Use them only to represent the company, product or service they refer to.

## Tabler Icons

- Package: `@tabler/icons` 3.49.0, <https://tabler.io/icons>
- License: MIT, Copyright (c) 2020-2026 Paweł Kuna. Full text: [`licenses/tabler-icons.LICENSE`](licenses/tabler-icons.LICENSE).
- Changes: the invisible 24×24 bounding path (`M0 0h24v24H0z`) is left out.

## Remix Icon

- Package: `remixicon` 4.8.0, <https://remixicon.com>. 4.8.0 is the last release under Apache-2.0; 4.9.0 moved to the custom "Remix Icon License v1.0", which forbids competing icon libraries, so EmVB stays on 4.8.0.
- License: Apache License 2.0, Copyright (c) Remix Design. Full text: [`licenses/remixicon.LICENSE`](licenses/remixicon.LICENSE).
- Changes (Apache-2.0 §4(b)): path coordinates are rounded to two decimals. All Remix paths use absolute commands, so the error stays under 0.005 units on the 24-unit grid. The icon files are not otherwise modified.

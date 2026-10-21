Icon sets for the EmVB editor only. Remix Icon stays on 4.8.0 (Apache-2.0). Later Remix releases use a license that does not allow shipping them inside another icon library.

Each set keeps its own license, copied in full in [`licenses/`](licenses/):

- Lucide (`lucide-static` 1.61.0): ISC, Copyright (c) 2026 Lucide Icons and Contributors; icons derived from Feather are MIT, Copyright (c) 2013-present Cole Bemis. [`licenses/lucide-static.LICENSE`](licenses/lucide-static.LICENSE)
- Font Awesome Free (`@fortawesome/fontawesome-free` 7.3.1): icons by Fonticons, Inc., CC BY 4.0. The attribution comment in each SVG is removed by EmVB's sanitizer, so this notice carries the attribution. Brand icons are trademarks of their owners. [`licenses/fontawesome-free.LICENSE`](licenses/fontawesome-free.LICENSE)
- Tabler Icons (`@tabler/icons` 3.49.0): MIT, Copyright (c) 2020-2026 Paweł Kuna. [`licenses/tabler-icons.LICENSE`](licenses/tabler-icons.LICENSE)
- Remix Icon (`remixicon` 4.8.0): Apache License 2.0, Copyright (c) Remix Design. Changed: path coordinates rounded to two decimals. [`licenses/remixicon.LICENSE`](licenses/remixicon.LICENSE)

Changes made to every set: the SVG markup is reformatted into compact JSON, and only elements and attributes in EmVB's SVG allowlist are kept. The full notes are in the EmVB package's THIRD_PARTY_NOTICES.md.

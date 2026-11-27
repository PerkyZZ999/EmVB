/**
 * Compiled CSS for one responsive daisyUI class, taken from a real build: daisyUI 5.8.2 with
 * Tailwind 4.3.5 and `prefix: daisy-`. classes-assets.test.ts uses it to pin how a prefixed
 * responsive class is spelled.
 *
 * Tailwind builds a prefixed variant class variant-first: the class it knows is
 * `sm:daisy-card-side`, and `daisy-sm:card-side` produces no rule at all. A kit that wants the
 * prefix first (so every class name starts with the extension prefix, as the allowlist requires)
 * asks Tailwind for the variant-first name, then renames the selector in the built CSS.
 *
 * To reproduce: a stylesheet with `@import "tailwindcss" source(none);`,
 * `@plugin "daisyui" { prefix: daisy-; }` and `@source inline("daisy-card sm:daisy-card-side");`,
 * built with the Tailwind CLI.
 */
/** Tailwind's own output for the class. */
export const RAW_CARD_SIDE_CSS = String.raw`
@media (width >= 40rem) {
    @layer daisyui.l1.l2 {
      .sm\:daisy-card-side {
        align-items: stretch;
        flex-direction: row;
      }
      .sm\:daisy-card-side :where(figure:first-child) {
        overflow: hidden;
        border-start-start-radius: inherit;
        border-start-end-radius: unset;
        border-end-start-radius: inherit;
        border-end-end-radius: unset;
      }
      .sm\:daisy-card-side :where(figure:last-child) {
        overflow: hidden;
        border-start-start-radius: unset;
        border-start-end-radius: inherit;
        border-end-start-radius: unset;
        border-end-end-radius: inherit;
      }
      .sm\:daisy-card-side figure > * {
        max-width: unset;
      }
      .sm\:daisy-card-side :where(figure > *) {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }
  }
`;
/** The same block as the kit ships it: selector renamed prefix-first, layers flattened. */
export const SHIPPED_CARD_SIDE_CSS = String.raw`
@media (width >= 40rem) {.daisy-sm\:card-side{
        align-items: stretch;
        flex-direction: row;
      }.daisy-sm\:card-side :where(figure:first-child){
        overflow: hidden;
        border-start-start-radius: inherit;
        border-start-end-radius: unset;
        border-end-start-radius: inherit;
        border-end-end-radius: unset;
      }.daisy-sm\:card-side :where(figure:last-child){
        overflow: hidden;
        border-start-start-radius: unset;
        border-start-end-radius: inherit;
        border-end-start-radius: unset;
        border-end-end-radius: inherit;
      }.daisy-sm\:card-side figure > *{
        max-width: unset;
      }.daisy-sm\:card-side :where(figure > *){
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    
  }
`;

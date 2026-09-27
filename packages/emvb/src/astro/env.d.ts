// Astro's language tools type `.astro` imports in Astro projects; plain `tsc` needs this.
declare module "*.astro" {
  const component: (props: Record<string, unknown>) => unknown;
  export default component;
}

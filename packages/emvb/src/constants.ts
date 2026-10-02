export const PLUGIN_ID = "emvb";
export const PLUGIN_VERSION = "0.0.0";
export const PACKAGE_NAME = "emvb";
export const ADMIN_ENTRY = `${PACKAGE_NAME}/admin`;
export const PAGES_COLLECTION = "emvb_pages";
/** Hidden collection for Header/Footer theme parts (D-TB-03). Not public URLs. */
export const THEME_PARTS_COLLECTION = "emvb_theme_parts";
/** EDITOR in EmDash's RBAC (`packages/auth/src/rbac.ts`); EmVB is for editors and above (D-020). */
export const EDITOR_ROLE = 40;
export const DESIGN_KEY = "system";
/** Editor working copy. The public route keeps reading `DESIGN_KEY` (W-100). */
export const DESIGN_DRAFT_KEY = "draft";

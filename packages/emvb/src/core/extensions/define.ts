/**
 * Identity helper that pins `extensionApi: 1` for package authors (W-927).
 */

import type { EmVBExtension } from "./types.ts";
import { EXTENSION_API_VERSION } from "./types.ts";

/** Mark an extension object as API v1. Does not validate — `emvb()` / normalize does. */
export function defineExtension<T extends Omit<EmVBExtension, "extensionApi">>(
  extension: T,
): T & { extensionApi: typeof EXTENSION_API_VERSION } {
  return { ...extension, extensionApi: EXTENSION_API_VERSION };
}

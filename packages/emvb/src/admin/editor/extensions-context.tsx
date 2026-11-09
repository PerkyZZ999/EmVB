import * as React from "react";
import type { ExtensionManifest } from "../../core/index.ts";
import { extensionElementManifests } from "./useExtensions.ts";

const ExtensionsContext = React.createContext<readonly ExtensionManifest[]>([]);

export function ExtensionsProvider({
  extensions,
  children,
}: {
  extensions: readonly ExtensionManifest[];
  children: React.ReactNode;
}) {
  return <ExtensionsContext.Provider value={extensions}>{children}</ExtensionsContext.Provider>;
}

export function useExtensions(): readonly ExtensionManifest[] {
  return React.useContext(ExtensionsContext);
}

export function useExtensionElements() {
  return extensionElementManifests(useExtensions());
}

export function useExtensionElement(type: string) {
  return useExtensionElements().find((el) => el.type === type);
}

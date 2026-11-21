import * as React from "react";
import type { ExtensionManifest } from "../../core/index.ts";
import type { ExtensionSourceValues } from "../extension-outputs.ts";
import { extensionElementManifests } from "./useExtensions.ts";

const ExtensionsContext = React.createContext<readonly ExtensionManifest[]>([]);
/** W-1088: the values of the sources extension panels name; undefined while loading. */
const ExtensionSourcesContext = React.createContext<ExtensionSourceValues | undefined>(undefined);

export function ExtensionsProvider({
  extensions,
  sourceValues,
  children,
}: {
  extensions: readonly ExtensionManifest[];
  sourceValues?: ExtensionSourceValues;
  children: React.ReactNode;
}) {
  return (
    <ExtensionsContext.Provider value={extensions}>
      <ExtensionSourcesContext.Provider value={sourceValues}>
        {children}
      </ExtensionSourcesContext.Provider>
    </ExtensionsContext.Provider>
  );
}

export function useExtensionSourceValuesContext(): ExtensionSourceValues | undefined {
  return React.useContext(ExtensionSourcesContext);
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

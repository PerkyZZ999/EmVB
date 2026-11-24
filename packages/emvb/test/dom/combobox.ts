/** Kumo Select uses aria-label or points to its visible label, depending on the version. */
export function comboboxName(control: Element): string | null {
  const root = control.getRootNode() as ParentNode;
  const label = control
    .getAttribute("aria-labelledby")
    ?.split(/\s+/)
    .filter(Boolean)
    .map((id) => root.querySelector(`#${CSS.escape(id)}`)?.textContent?.trim())
    .filter(Boolean)
    .join(" ");
  return label || control.getAttribute("aria-label");
}

export function findCombobox(name: string, host: ParentNode = document): HTMLElement | null {
  return (
    [...host.querySelectorAll<HTMLElement>('[role="combobox"]')].find(
      (control) => comboboxName(control) === name,
    ) ?? null
  );
}

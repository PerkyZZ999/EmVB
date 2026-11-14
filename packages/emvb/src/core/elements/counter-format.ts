/**
 * W-1038: how a Counter writes its number. Shared by the renderer and the opt-in counter runtime,
 * so the count-up ends on exactly the text the page was rendered with.
 */

/** `value` with `decimals` digits after a "." and `separator` between thousands. */
export function formatCounter(value: number, decimals = 0, separator = ""): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole = "0", fraction] = fixed.split(".");
  const grouped = separator ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : whole;
  // With "." between thousands, the decimal mark is ",", as people write it.
  const mark = separator === "." ? "," : ".";
  const sign = value < 0 && Number(fixed) !== 0 ? "-" : "";
  return `${sign}${grouped}${fraction === undefined ? "" : `${mark}${fraction}`}`;
}

/** The style states (W-089, D-032), in cascade order. Focus means `:focus-visible`. */
export const STYLE_STATES = ["hover", "focus", "active"] as const;

export type StyleStateName = (typeof STYLE_STATES)[number];

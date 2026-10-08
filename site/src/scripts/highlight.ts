/**
 * A build-time highlighter for the short JSON, HTML and CSS samples on the home page. Every piece
 * of source text is escaped; only the wrapping spans are markup. Each line comes back in its own
 * `.line` span for the line numbers.
 */
export type Language = "json" | "html" | "css";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const span = (kind: string, text: string) => `<span class="tok-${kind}">${escape(text)}</span>`;

const PATTERNS: Record<Language, RegExp> = {
  json: /("(?:\\.|[^"\\\n])*")(\s*:)?|(-?\b\d+(?:\.\d+)?\b)|([{}[\],])/g,
  html: /(<\/?)([\w-]+)|([\w-]+)(=)("[^"\n]*")|(\/?>)/g,
  css: /(@[\w-]+)|([.#][\w-]+)|([\w-]+)(?=:)|(\b\d+(?:\.\d+)?(?:px|rem|em|%)?)|([{}():;,])/g,
};

function render(language: Language, m: RegExpExecArray): string {
  if (language === "json") {
    if (m[1]) return m[2] ? span("key", m[1]) + escape(m[2]) : span("string", m[1]);
    return m[3] ? span("number", m[3]) : span("punct", m[0]);
  }
  if (language === "html") {
    if (m[2]) return span("punct", m[1] ?? "") + span("tag", m[2]);
    if (m[3]) return span("key", m[3]) + span("punct", m[4] ?? "") + span("string", m[5] ?? "");
    return span("punct", m[0]);
  }
  if (m[1] || m[2]) return span("tag", m[0]);
  if (m[3]) return span("key", m[3]);
  if (m[4]) return span("number", m[4]);
  return span("punct", m[0]);
}

export function highlight(code: string, language: Language): string {
  let out = "";
  let last = 0;
  for (const m of code.matchAll(PATTERNS[language])) {
    out += escape(code.slice(last, m.index)) + render(language, m);
    last = m.index + m[0].length;
  }
  out += escape(code.slice(last));
  return out
    .split("\n")
    .map((line) => `<span class="line">${line}</span>`)
    .join("");
}

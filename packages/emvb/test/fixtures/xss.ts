/** Injection attempts for text and attribute fields (R-032). Each must render as inert text. */
export const XSS_CORPUS: string[] = [
  "<script>alert(1)</script>",
  '"><img src=x onerror=alert(1)>',
  "'><svg onload=alert(1)>",
  "</h1><script>alert(1)</script><h1>",
  "</style><script>alert(1)</script>",
  "<iframe src=javascript:alert(1)>",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  '<a href="javascript:alert(1)">x</a>',
  "<!-- <script>alert(1)</script> -->",
  "<![CDATA[<script>alert(1)</script>]]>",
  "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
  "\u003cscript\u003ealert(1)\u003c/script\u003e",
  "a & b < c > d \" e ' f",
];

/** Values that must never reach a stylesheet (R-032). */
export const CSS_INJECTION_CORPUS: string[] = [
  "red;}body{background:red",
  "#fff}",
  "#fff;",
  "</style><script>alert(1)</script>",
  "url(https://evil.example/x.png)",
  "expression(alert(1))",
  "red/*",
  "@import 'x'",
];

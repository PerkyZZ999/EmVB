# Security policy

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's private vulnerability reporting: on the repository's **Security** tab, choose **Report a vulnerability**. Include the steps to reproduce, and the layout JSON or request that triggers the problem if you have one.

Expect a reply within a week. A fix goes out on `main`, credited to you if you like.

## Supported versions

EmVB isn't released yet. Only the `main` branch is supported.

## Scope

In scope: script or markup injection through a layout, a design document or a theme part; CSS sanitizer bypasses; URL checks that let `javascript:` or another site's URL through; EmVB routes or saves reachable below the editor role; anything EmVB writes to logs that it shouldn't.

Out of scope: the demo sites' dev-only sign-in (`/_emdash/api/setup/dev-bypass`), which exists only on dev servers, and bugs in EmDash itself, which go to [EmDash](https://github.com/emdash-cms/emdash).

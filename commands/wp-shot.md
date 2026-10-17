---
description: Screenshot and visually audit a WordPress theme
argument-hint: "[route] [--url URL] [--out FILE] [--dark]"
allowed-tools: Bash(wptk:*), Bash(node:*), Read
---

Use the `wp-theme-preview` skill.

Run `wptk doctor` first if the site URL or browser is unknown. Then run
`wptk shot $ARGUMENTS` for an image, or `wptk audit` to check console errors,
failed assets, horizontal overflow, unloaded images, and missing selectors.

Do not overwrite `screenshot.png` when guards fail. Fix the layout or pass
`--no-guard` only to capture diagnostic evidence.

If `wptk` is not on PATH:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/wp-theme-kit.mjs shot $ARGUMENTS
```

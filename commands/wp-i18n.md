---
description: Generate or check a WordPress theme POT file
argument-hint: "[--out FILE] [--check]"
allowed-tools: Bash(wptk:*), Bash(node:*), Read, Edit, Grep, Glob
---

Use the `wp-theme-i18n` skill.

Run `wptk pot $ARGUMENTS` to regenerate the POT, or `wptk pot --check` to verify
freshness. Only literal strings with the theme's own text domain are extracted.
Fix the call when a string is skipped as dynamic or as another domain.

Commit the POT together with the code change.

If `wptk` is not on PATH:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/wp-theme-kit.mjs pot $ARGUMENTS
```

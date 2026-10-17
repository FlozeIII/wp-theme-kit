---
description: Route a WordPress theme task to the right wp-theme-kit workflow
argument-hint: "[task or theme directory]"
allowed-tools: Bash(wptk:*), Bash(node:*), Read, Grep, Glob
---

Use the `wp-theme-dev` skill.

Inspect the current directory, read `.wp-theme-kit.json` if present, and run
`wptk doctor` if the environment is unknown. Then route the task to one of:
`wp-theme-check`, `wp-theme-scaffold`, `wp-theme-preview`, `wp-theme-package`,
or `wp-theme-i18n`.

If `wptk` is not on PATH, use:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/wp-theme-kit.mjs <command>
```

User request: $ARGUMENTS

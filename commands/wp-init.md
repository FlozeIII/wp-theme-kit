---
description: Create or extend a WordPress theme with scaffolding
argument-hint: "[slug] [--type classic|block|hybrid]"
allowed-tools: Bash(wptk:*), Bash(node:*), Read, Write, Edit, Grep, Glob
---

Use the `wp-theme-scaffold` skill.

For a new theme, run `wptk init $ARGUMENTS`. For an existing theme, run
`wptk adopt`. For additional files, use `wptk make template|part|module|block|pattern <name>`.

Read generated files before editing them. Do not overwrite user files without
`--force`. Run `wptk check` after scaffolding.

If `wptk` is not on PATH:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/wp-theme-kit.mjs init $ARGUMENTS
```

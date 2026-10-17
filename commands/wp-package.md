---
description: Package and verify a WordPress theme release
argument-hint: "[output.zip] [--rev tag|sha]"
allowed-tools: Bash(wptk:*), Bash(node:*), Bash(git:*), Read
---

Use the `wp-theme-package` skill.

Run `wptk package $ARGUMENTS`, then `wptk verify-package` on the produced file.
Packaging reads committed files only. Inspect `.distignore` if development files
leak, and fix the cause instead of passing `--no-check`.

Never push, tag, or publish without an explicit instruction from the user.
`wptk release` only prepares the artifact and prints the human checklist.

If `wptk` is not on PATH:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/wp-theme-kit.mjs package $ARGUMENTS
```

---
description: Run WordPress theme checks and fix findings
argument-hint: "[theme directory] [--fail-on warning]"
allowed-tools: Bash(wptk:*), Bash(node:*), Read, Edit, Grep, Glob
---

Use the `wp-theme-check` skill.

Run `wptk check $ARGUMENTS` and read the JSON report if the human output is
ambiguous. Fix errors first, then warnings. Re-run the same command after each
group of fixes. Do not suppress findings unless they are confirmed false
positives; use a rule-specific `wptk-ignore` or a baseline entry and explain why.

If `wptk` is not on PATH:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/wp-theme-kit.mjs check $ARGUMENTS
```

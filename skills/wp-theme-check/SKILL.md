---
name: wp-theme-check
description: Run offline acceptance checks on a WordPress theme and fix findings safely. Use after editing PHP templates, theme.json, block templates, CSS, or JavaScript, or when the user asks for a theme review, Theme Check-style validation, escaping review, text-domain check, or release gate.
license: MIT
metadata:
  author: FlozeIII
  version: "0.1.0"
---

# Check a WordPress Theme

Run the check before and after a change. Treat errors as blockers and warnings
as review items. Do not "fix" a warning without understanding it.

## Commands

```bash
wptk check
wptk check ../my-theme --fail-on warning
wptk check --format json
wptk check --baseline .wp-theme-kit-baseline.json
wptk check --update-baseline
```

- `--fail-on error` is the default. Use `warning` for a stricter gate and
  `info` only when investigating.
- `--format json` returns `{ theme, analyzer, summary, findings }`. Each finding
  has `rule`, `severity`, `file`, `line`, `message`, and `hint`.
- `--update-baseline` records current findings so existing debt does not block
  a first adoption. It never changes theme code.

## Workflow

1. Run `wptk check` and read the summary.
2. Fix errors first, then warnings that affect behavior or security.
3. Apply the smallest change at the correct layer:
   - output escaping at the output site;
   - text domain in the gettext call;
   - nonce and capability checks in the handler;
   - `$wpdb->prepare()` for SQL;
   - prefix only the symbol you touched.
4. Re-run the same command. Stop when the target severity is clean.
5. If a finding is a false positive, suppress it narrowly and leave a reason.

## Reading findings

- `(theme)` means a theme-level finding; look at `style.css`, `theme.json`, or
  the template structure rather than a single line.
- `analyzer` says whether PHP `token_get_all` or the built-in lexer ran. The
  rules are the same; the PHP analyzer is more precise.
- `suppressed` counts baseline matches, not inline ignores.

## Suppression

```php
echo $html; // phpcs:ignore WordPress.Security.EscapeOutput -- pre-escaped by yuki_card()
```

```php
// wptk-ignore-next-line
echo $trusted_html;
```

Prefer a rule-specific ignore over `*`. Do not blanket-disable a rule for a
whole file unless the file is generated.

## What not to do

- Do not add `esc_html()` around values that must contain markup; use
  `wp_kses_post()` or a documented pre-escaped helper.
- Do not change the text domain to match a finding; change the call.
- Do not silence a nonce or capability finding without checking the actual
  request flow.
- Do not run the checker on an extracted package when you mean to check the
  worktree, or vice versa.

## 中文摘要

改动前后都跑 `wptk check`。error 必须修，warning 要逐条判断。修复时改最靠近
问题的那一层：输出处转义、gettext 调用里写文本域、请求处理里加 nonce 与权限、
SQL 用 `$wpdb->prepare()`。确认是误报时才用行内 `wptk-ignore` 或 baseline
抑制，并写明原因。不要为了让检查变绿而改文本域或大范围关规则。

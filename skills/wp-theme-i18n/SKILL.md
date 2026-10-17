---
name: wp-theme-i18n
description: Generate and check WordPress theme translation templates. Use when adding translatable strings, updating the theme POT file in languages, checking text-domain consistency, or preparing a release that must ship a current POT file.
license: MIT
metadata:
  author: FlozeIII
  version: "0.1.0"
---

# Theme Internationalization

The POT file is generated from code, not hand-edited.

## Commands

```bash
wptk pot
wptk pot --out /tmp/theme.pot
wptk pot --check
wptk pot --check --json
```

- The default output is `languages/<text-domain>.pot`.
- `--check` compares the msgid set with the existing POT and exits 1 when
  strings were added or removed.
- `package` runs the same check before building a zip.

## What is extracted

- PHP gettext calls with a literal string and the theme's text domain:
  `__`, `_e`, `_x`, `_ex`, `_n`, `_nx`, `esc_html__`, `esc_html_e`,
  `esc_attr__`, `esc_attr_e`, `esc_html_x`, `esc_attr_x`, `translate`,
  `translate_with_gettext_context`, `_n_noop`, `_nx_noop`.
- JavaScript `wp.i18n.__`, `_x`, `_n`, and `_nx` calls.
- The theme `Description` header from `style.css`.

Dynamic strings, missing domains, and calls using another domain are skipped and
counted in the command output. Fix the call instead of adding the string by
hand.

## Workflow

1. Add or change strings with the literal theme text domain.
2. Run `wptk pot`.
3. Review the diff: new msgids, changed references, removed strings.
4. Run `wptk pot --check` and make sure it exits 0.
5. Commit the POT with the code change.

## Translator comments

Add a `translators:` comment before strings with placeholders:

```php
printf(
    /* translators: %s: author display name. */
    esc_html__( 'Written by %s', 'my-theme' ),
    esc_html( get_the_author() )
);
```

## 中文摘要

POT 由代码生成，不手改。只提取字面量字符串和本主题文本域；动态字符串、缺文本域
或别的文本域会被跳过并计数。改完文案先 `wptk pot`，再 `wptk pot --check`，
最后把 POT 和代码一起提交。含占位符的字符串前面加 `translators:` 注释。

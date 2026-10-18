---
name: wp-theme-i18n
description: Generate and check WordPress theme translation templates. Use when adding translatable strings, updating the theme POT file in languages, checking text-domain consistency, or preparing a release that must ship a current POT file.
license: MIT
metadata:
  author: FlozeIII
  version: "0.1.0"
---

# Theme Internationalization

POT entries are generated from code. Use `--merge` when regenerating a file with
maintained header metadata.

## Commands

```bash
wptk pot
wptk pot --merge
wptk pot --out /tmp/theme.pot
wptk pot --check
wptk pot --check --json
```

- The default output is `languages/<text-domain>.pot`.
- `--merge` retains header comments, manual metadata and custom fields from the
  existing output (also with `--out`). It refreshes `Project-Id-Version`,
  `POT-Creation-Date`, `X-Generator`, `X-Domain` and UTF-8 `Content-Type`.
  Missing files are generated normally; invalid UTF-8, malformed headers and
  duplicate field names exit 2 without replacing the file. Repair the header or
  use ordinary generation to replace it. This preserves header metadata only;
  message entries and empty translations are rebuilt from source.
- `--check` compares the msgid set with the existing POT and exits 1 when
  strings were added or removed. Run it separately from `--merge`.
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
2. Run `wptk pot --merge` to retain maintained header metadata, or `wptk pot`
   for a fresh header.
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

POT 词条由代码生成。`pot --merge` 保留头部人工信息和自定义字段，并更新自动字段；
已有文件头部异常时先修复，或用普通生成明确替换。只提取字面量字符串和本主题文本域；
动态字符串、缺文本域或别的文本域会被跳过并计数。改完文案先生成，再单独 `wptk pot --check`，
最后把 POT 和代码一起提交。含占位符的字符串前面加 `translators:` 注释。

# Check Rule Catalog

Severity is only a default. Override a rule in `.wp-theme-kit.json`:

```json
{
  "checks": {
    "failOn": "error",
    "rules": {
      "php.abspath-guard": "off",
      "php.asset-version": "warning"
    }
  }
}
```

## Theme structure

| Rule | Default | What it checks |
|---|---|---|
| `theme.style-css` | error | `style.css` exists |
| `theme.style-header` | error | required header fields; Theme Name, Version, Text Domain, License are errors |
| `theme.tested-up-to` | warning | `Tested up to` is numeric |
| `theme.text-domain` | warning | header text domain matches the slug |
| `theme.version-mismatch` | warning | `style.css` and `package.json` versions agree |
| `theme.screenshot` | info | PNG exists, is readable, and is at most 1200x900 |
| `theme.distignore` | info | `.distignore` exists |
| `theme.unknown-type` | error | classic or block structure can be determined |

## Classic templates

| Rule | Default | What it checks |
|---|---|---|
| `classic.index-missing` | error | `index.php` exists |
| `classic.markup` | warning | `wp_head`, `wp_footer`, `wp_body_open`, `body_class`, `language_attributes`; skip link is info |
| `classic.title-tag` | info | `title-tag` support or a literal `<title>` exists |
| `php.template-part-missing` | warning | literal `get_header`, `get_footer`, `get_sidebar`, `get_template_part`, `comments_template` targets exist |

## PHP

| Rule | Default | What it checks |
|---|---|---|
| `php.unescaped-output` | warning | `echo`, `print`, and `<?=` output has escaping |
| `php.unescaped-printf` | warning | `printf()` values are escaped |
| `php.text-domain` | warning | gettext calls use the expected literal domain; a different literal domain is an error |
| `php.translator-comment` | info | placeholder strings have a `translators:` comment |
| `php.forbidden-function` | error | removed or unsafe functions |
| `php.superglobal-direct` | info | superglobals are read without a visible sanitizer |
| `php.sql-interpolation` | error | `$wpdb` queries interpolate variables |
| `php.nonce-check` | info | request data is read without a nonce check in the file |
| `php.capability-check` | info | a state-changing write has no visible capability check |
| `php.abspath-guard` | info | library files under `inc/`, `includes/`, `src/`, `lib/`, `classes/` have an ABSPATH guard |
| `php.global-prefix` | info | global functions use the configured prefix |
| `php.hardcoded-local-path` | warning | local hosts, drive letters, or home paths |
| `php.require-glob` | info | files are discovered dynamically and included |
| `php.asset-version` | info | enqueues have a version argument |

## Block themes

| Rule | Default | What it checks |
|---|---|---|
| `block.index-missing` | error | `templates/index.html` exists |
| `block.theme-json` | error | valid JSON, version 2 or 3, `$schema` present |
| `block.template-parts` | warning | referenced template parts and patterns exist |
| `block.block-json` | error | required fields and `render`/`style` targets |
| `block.pattern-header` | warning | pattern files have Title and Slug headers |

## HTML, CSS, JavaScript

| Rule | Default | What it checks |
|---|---|---|
| `html.img-alt` | info | `<img>` has `alt` |
| `html.inline-handler` | info | no inline `onclick`-style handlers |
| `html.target-blank` | info | `target="_blank"` has `rel="noopener"` |
| `js.text-domain` | warning | `wp.i18n` calls use the expected domain |
| `js.console` | info | no `console.log`/`debug`/`info` |
| `js.hardcoded-host` | warning | no local hosts in shipped JavaScript |
| `css.local-url` | warning | no local hosts in CSS URLs |

## Extending the escaping allowlist

If the theme has project-specific helpers that return escaped HTML, list them so
`php.unescaped-output` does not flag them:

```json
{
  "checks": {
    "safeOutputFunctions": ["my_theme_card"],
    "escapedHelpers": ["my_theme_escaped_title"]
  }
}
```

Both arrays are additive; the built-in WordPress allowlist still applies.

## Inline suppression

```php
echo $pre_escaped; // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by my_theme_card()
// wptk-ignore-next-line
echo $trusted;
```

PHPCS sniff names are mapped to the corresponding rule. An unknown PHPCS sniff
suppresses all findings on that line.

## Baseline

`wptk check --update-baseline` writes fingerprints, not line numbers alone.
Moving a finding to a different line surfaces it again. Delete an entry to
surface a known problem intentionally.

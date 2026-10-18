# Mu-plugin helpers

Use these helpers when a theme feature must be observed against a real
WordPress runtime: outgoing HTTP calls, or mail sent by `wp_mail()`.

They are development-time tools. Never install them on production, never commit
a site's harness directory, and never print cookie or credential values.

## Commands

```bash
wptk mu-plugin install --wp-root ../wordpress
wptk mu-plugin status --wp-root ../wordpress
wptk mu-plugin mail --limit 5 --wp-root ../wordpress
wptk mu-plugin mail --clear --wp-root ../wordpress
wptk mu-plugin remove --wp-root ../wordpress
```

`--helper mail|http` limits `install` and `remove`. An existing helper is
upgraded only when its `Version` is older; newer or unmarked files are refused
unless `--force` is passed. `remove` exits 1 when no manifest exists and deletes
only files recorded in `wp-content/mu-plugins/.wp-theme-kit-harness.json`.

The WordPress root comes from `--wp-root`, then `wordpress.path` in
`.wp-theme-kit.json`, `WPTK_WP_ROOT`, or an ancestor containing `wp-load.php`.

## Configuration

`install` writes
`wp-content/wp-theme-kit-harness/wp-theme-kit-harness.json` once:

```json
{
  "version": 1,
  "enabled": { "mail": true, "http": true },
  "mailDir": "mail",
  "httpDir": "http",
  "http": { "strict": false, "hosts": [] }
}
```

Later installs keep an existing file. Both helpers are inert when
`wp_get_environment_type()` is `production`, unless the
`wp_theme_kit_harness_enabled` filter returns true.

## Mail capture

Captured messages are written under `wp-content/wp-theme-kit-harness/mail/` as
an `.eml` file plus one line in `index.jsonl`; delivery is suppressed and the
filter returns true. `wptk mu-plugin mail` lists newest first, `--limit n`
narrows the list, and `--clear` removes only indexed messages and attachments.

## HTTP fixtures

Put `*.json` files in `wp-content/wp-theme-kit-harness/http/`. They are
evaluated in file-name order and the first match wins:

```json
{
  "match": { "method": "GET", "url": "^https://api\\.example\\.com/v1/" },
  "status": 200,
  "headers": { "content-type": "application/json" },
  "json": { "ok": true }
}
```

- `match.method`: uppercase method or `*`.
- `match.url`: regular expression over the full URL.
- Exactly one body source: `body` (text), `json` (encoded JSON), `bodyFile`
  (relative path, at most 5 MiB) or `base64`.
- `status` defaults to 200; `delayMs` defaults to 0.

Unmatched requests pass through to the network. Set `http.strict` to true to
return a `wptk_no_fixture` `WP_Error` instead. Use `http.hosts` to limit which
hosts are stubbed. `wptk mu-plugin status` lists invalid fixtures without
printing their contents.

## Acceptance

- `tests/unit/mu-plugin.test.mjs`: fixture validation, loading, matching,
  manifest, install planning, mail index parsing and deletion.
- `tests/integration/mu-plugin-install.test.mjs`: CLI install/status/remove/mail
  against a fake WordPress root, plus `php -l` when PHP exists.
- `tests/integration/mu-plugin-behavior.test.mjs`: mail capture, fixture replay,
  invalid-fixture skipping, pass-through/strict mode and the production guard
  with stub WordPress functions (skipped when PHP is unavailable).

# Environment

`wptk doctor` is the first command to run on a new machine. It reports:

- Node version (the CLI requires 22.2 or newer);
- Git;
- PHP CLI and whether deep PHP analysis is available;
- WordPress root and site reachability;
- WP-CLI;
- a Chromium-family browser for screenshots;
- the current theme's root, type, slug, and text domain.

## Configuration

Environment variables override the config file:

| Variable | Purpose |
|---|---|
| `WPTK_WP_ROOT` | WordPress root |
| `WPTK_PHP` | PHP executable |
| `WPTK_SITE` | Site base URL |
| `WPTK_BROWSER` | Browser executable |
| `WPTK_WP_CLI` | WP-CLI phar |
| `WPTK_KIT` | Kit root, when `wptk` is not on PATH |
| `WPTK_DEBUG` | Print stack traces |
| `WPTK_NO_COLOR` | Disable ANSI colors |

## Local WordPress

This repository's reference environment is a portable install:

```text
C:/Users/<user>/wp-dev/
├── tools/php/php.exe
├── tools/wp-cli.phar
├── wordpress/
│   └── wp-content/themes/<slug>  (junction to the theme source)
└── var/
```

The theme source and the deployed theme directory can be the same directory via
a Windows junction. Edits are live immediately.

Use `http://localhost:8080`, not `http://127.0.0.1:8080`, when the local server
binds to `[::1]`. `wptk doctor` reports the URL it probed.

## Browser

Screenshots use CDP directly, with no Playwright or Puppeteer dependency.
The viewport is set before navigation, so media queries see the real width.

If no browser is found, install Microsoft Edge or Google Chrome, or set
`WPTK_BROWSER`. `wptk shot` and `wptk audit` exit with a clear message instead
of silently producing a wrong image.

## PHP analysis

`checks.analyzer` accepts:

- `auto` (default): use PHP `token_get_all` when PHP is available, otherwise the
  built-in lexer;
- `js`: always use the built-in lexer;
- `php`: require PHP and fail if it is missing.

Both analyzers produce the same normalized token stream, so rules are identical.
The PHP analyzer is more precise around interpolated strings and heredocs.

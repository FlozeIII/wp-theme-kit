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

JSON findings include `documentationUrl`, an absolute `file:` URL to this
installed catalogue with an explicit rule anchor (for example,
`#php-unescaped-output`). The URL is encoded and refers to the kit installation,
not the checked theme. It works offline in Markdown viewers supporting HTML
anchors, while `wptk check --explain <rule-id>` reads the entry in the terminal.
Diff/fix reports use the same links. Baseline identities and files exclude
this presentation metadata; pretty and GitHub output remain unchanged.

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
| `php.template-part-missing` | warning | literal template API targets exist; `get_template_part` also supports literal positional array unpacking |

## PHP

| Rule | Default | What it checks |
|---|---|---|
| `php.unescaped-output` | warning | `echo`, `print`, and `<?=` output has escaping |
| `php.unescaped-printf` | warning | `printf()` values are escaped |
| `php.printf-arguments` | warning | literal `printf()` formats have enough value arguments |
| `php.script-footer` | warning | `wp_enqueue_script()` uses boolean footer values or supported options arrays |
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
| `block.markup-balance` | error | block delimiters in `templates/` and `parts/` HTML are balanced |
| `block.attribute-json` | error | opening and self-closing block attributes contain valid JSON |

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

## Changed-file checks

Use `wptk check --diff <ref>` to report only findings in changed source files.
The comparison includes staged, unstaged, and non-ignored untracked paths and
works when the theme is a repository subdirectory. The full theme is still
scanned for context; findings without a concrete file (`(theme)`) are omitted.
Run an ordinary `check` for the complete theme-wide gate.

The scope also limits `--fix` and survives its recheck. Existing baselines can
be read, but `--update-baseline` must run separately without `--diff`.
See the README's Changed-file checks section for JSON fields and path behavior.

## Mechanical fixes

Run `wptk check --fix --dry-run` to preview edits, then `wptk check --fix` to
apply and recheck. See the README's Mechanical fixes section for CLI reporting.

| Rule | Whitelisted edit |
|---|---|
| `classic.markup` | Insert `wp_body_open()` after one unambiguous `<body>` in classic/hybrid `header.php` |
| `php.text-domain` | Append the configured domain to a two-argument gettext call whose first argument is a literal and whose signature places the domain third (`_x`, `_ex`, `esc_html_x`, `esc_attr_x`, `translate_with_gettext_context`, `_n_noop`) |
| `theme.tested-up-to` | Remove a `WP`, `WordPress`, or `v` wrapper around one numeric version in the `style.css` header |

Only visible findings are eligible: rule overrides, path ignores, inline ignores,
and baselines still apply. Named arguments, unpacking, namespaced/imported calls,
dynamic first arguments, existing domains, ambiguous headers, and symlinked files
are left for manual review. `--update-baseline` must run separately from `--fix`.

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

HTML sources also accept directives in HTML comments. The directive's actual
line determines the suppressed line; parsing continues even when a finding is
hidden.

```html
<!-- wptk-ignore-next-line block.markup-balance -->
<!-- wp:group -->
```

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

## Rule explanations

Use `wptk check --explain <rule-id>` to read an entry without scanning a theme.
Each entry below uses a level-three heading containing its exact rule ID;
the CLI reads that entry directly from this shipped catalogue.
Keep its explicit `<a id="rule-id-with-hyphens"></a>` anchor stable so existing
JSON documentation links keep locating the rule. Internal diagnostics are
documented separately from the 40 registered checks.
The output is Markdown by default; `--json` or `--format json` returns
`{ "rule": "<id>", "documentation": "<Markdown entry>" }`. This mode needs
no theme or toolchain, does not load configuration, and rejects scan options
such as `--fix`, `--diff`, baseline flags, `--analyzer`, and `--fail-on`.
IDs are exact and case-sensitive; invalid IDs or combinations exit 2.

### `php.unescaped-output`

<a id="php-unescaped-output"></a>

Default: warning. Applies to PHP output through `echo`, `print`, and `<?=`.

Rationale: Unescaped dynamic output can cause cross-site scripting. Escape at
the output boundary for the actual HTML, attribute, or URL context. The rule
uses an escaping allowlist and cannot prove that every expression is safe;
configure documented safe helpers when appropriate.

Before:

```php
echo $title;
```

After:

```php
echo esc_html( $title );
```

### `theme.style-css`

<a id="theme-style-css"></a>

Default: error. Applies to the theme root.

Rationale: WordPress reads the theme's identity from the `style.css` header.
A block theme still needs this file even when its styling lives in `theme.json`.

Before:

```text
demo-theme/theme.json (no style.css)
```

After:

```css
/* Theme Name: Demo Theme */
```

### `theme.style-header`

<a id="theme-style-header"></a>

Default: error. Missing secondary header fields are warnings.

Rationale: Theme metadata supports discovery, licensing, compatibility, and
translations. Theme Name, Version, Text Domain, and License are required errors;
the other catalogue header requirements are warnings.

Before:

```css
/* Theme Name: Demo Theme */
```

After:

```css
/*
Theme Name: Demo Theme
Author: Example Author
Description: A blog theme.
Version: 1.0.0
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Text Domain: demo-theme
Tags: blog
*/
```

### `theme.tested-up-to`

<a id="theme-tested-up-to"></a>

Default: warning. Applies to the `style.css` header.

Rationale: Compatibility tools expect a numeric WordPress version in
`Tested up to`. Use a version actually tested; the checker only validates syntax.

Before:

```css
/* Tested up to: WordPress 7.1 */
```

After:

```css
/* Tested up to: 7.1 */
```

### `theme.text-domain`

<a id="theme-text-domain"></a>

Default: warning. Applies to the `style.css` header.

Rationale: The header text domain should match the deployed theme directory
slug so WordPress translation discovery uses one stable identifier.

Before:

```text
Directory: demo-theme/
Text Domain: old-theme
```

After:

```text
Directory: demo-theme/
Text Domain: demo-theme
```

### `theme.version-mismatch`

<a id="theme-version-mismatch"></a>

Default: warning. Applies when `package.json` declares a version.

Rationale: Conflicting release versions make artifacts and cache keys confusing.
Keep `style.css` and `package.json` aligned. The `theme.json` version is a schema
version and is deliberately excluded.

Before:

```text
style.css Version: 1.0.0
package.json version: 0.9.0
```

After:

```text
style.css Version: 1.0.0
package.json version: 1.0.0
```

### `theme.screenshot`

<a id="theme-screenshot"></a>

Default: info. Invalid PNGs and dimensions above 1200x900 are warnings.

Rationale: The WordPress Themes screen needs a recognizable preview. Ship a
readable PNG no larger than 1200x900; a 4:3 aspect ratio is recommended.

Before:

```text
screenshot.png: 1600x1000
```

After:

```text
screenshot.png: valid PNG, 1200x900
```

### `theme.distignore`

<a id="theme-distignore"></a>

Default: info. Applies to the theme root.

Rationale: A distribution exclusion file keeps development files out of the
installable artifact. This kit accepts root-relative literal paths, not globs.

Before:

```text
No .distignore; tests/ and docs/ may enter the artifact.
```

After:

```text
# .distignore
tests/
docs/
.scratch/
```

### `theme.unknown-type`

<a id="theme-unknown-type"></a>

Default: error. Applies to theme structure detection.

Rationale: Checks need a recognizable classic or block layout to select the
right rules. A stylesheet alone does not establish a template fallback.

Before:

```text
style.css only
```

After:

```text
Classic: style.css + index.php
Block: style.css + theme.json + templates/index.html
```

### `classic.index-missing`

<a id="classic-index-missing"></a>

Default: error. Applies to classic and hybrid themes.

Rationale: `index.php` is the final fallback in the classic template hierarchy.
Without it, requests with no more specific template cannot render reliably.

Before:

```text
header.php + single.php + footer.php; no index.php
```

After:

```php
// index.php
get_header();
while ( have_posts() ) { the_post(); the_content(); }
get_footer();
```

### `classic.markup`

<a id="classic-markup"></a>

Default: warning. A missing skip link is info.

Rationale: WordPress hooks allow plugins to inject assets and body content;
language attributes and body classes support correct markup and styling. A skip
link helps keyboard navigation. Checks inspect header, footer, and index markup.

Before:

```html
<html><head></head><body><main id="content"></main></body></html>
```

After:

```php
<html <?php language_attributes(); ?>>
<head><?php wp_head(); ?></head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link screen-reader-text" href="#content">Skip to content</a>
<main id="content"></main>
<?php wp_footer(); ?></body></html>
```

### `classic.title-tag`

<a id="classic-title-tag"></a>

Default: info. Applies to classic and hybrid themes.

Rationale: Every page needs a document title. Declare `title-tag` support so
WordPress can generate it; the checker also accepts a literal `<title>` element.

Before:

```php
function demo_theme_setup() { add_theme_support( 'post-thumbnails' ); }
```

After:

```php
function demo_theme_setup() { add_theme_support( 'title-tag' ); }
add_action( 'after_setup_theme', 'demo_theme_setup' );
```

### `php.script-footer`

<a id="php-script-footer"></a>

Default: warning. Applies to PHP files in all theme types.

Rationale: WordPress coerces footer values by truthiness, so the string `'false'`
still puts a script in the footer. Use an explicit boolean to express intent.
The fifth `wp_enqueue_script()` argument accepts a boolean, or an options array
since WordPress 6.3. The rule warns on known string, numeric and null fifth
arguments. Simple quoted interpolations such as "footer-$name" are recognized;
complex interpolations with nested same-quote expressions are skipped.

Short/long literal arrays are accepted. If `in_footer` is present, its final
known value should be boolean; string, numeric, null and array values warn.
Duplicate known keys follow PHP's last-value behavior. Omitted fifth arguments,
empty arrays and arrays without `in_footer` are accepted. Other fields such as
`strategy`, `fetchpriority` or `module_dependencies` are outside this rule.

Variables, constants, calls, concatenation, indexed expressions, named arguments
and call-level unpacking are skipped. Unresolved array keys or top-level array
unpacking cause that array to be skipped because they may replace `in_footer`.
Heredoc/nowdoc, binary strings, and double-quoted keys with numeric/Unicode
escapes are conservatively skipped. Parentheses, comments, nesting and trailing
commas are supported. Only global function calls are checked, case-insensitively;
methods, constructors, attributes and namespace-qualified functions are excluded.
Files with namespaces/imports require an explicitly global function name.
`wp_register_script()` and `wp_enqueue_style()` are outside this rule.

PHP `token_get_all` and the JS fallback use the same literal classification,
without executing inspected PHP. Severity, suppression, baselines, diff, output
formats and fix rechecks apply as usual. There is no automatic fix because
choosing the intended footer value requires judgement.

Existing fallback limitation: a heredoc/nowdoc closing label sharing its line
with a closing parenthesis or other syntax can make the JS lexer consume later
source. Later calls may be missed in JS mode; use the PHP analyzer for such
files. This rule does not extend the shared lexer.

Before:

```php
wp_enqueue_script( 'app', '/app.js', array(), '1.0', 'false' );
```

After:

```php
wp_enqueue_script( 'app', '/app.js', array(), '1.0', false );
// WordPress 6.3+: array( 'strategy' => 'defer', 'in_footer' => false ) also works.
```

### `php.printf-arguments`

<a id="php-printf-arguments"></a>

Default: warning. Applies to PHP files in all theme types.

Rationale: Missing `printf()` values cause formatting failures and can interrupt
page rendering. This rule checks the minimum number of value arguments required
by an exact single/double-quoted format, including source strings returned by
`__`, `_x`, `esc_html__`, `esc_attr__`, `esc_xml__`, `esc_html_x`, `esc_attr_x`,
`translate`, and `translate_with_gettext_context`. It does not load translations.

`%%` consumes no value. Positional indexes such as `%2$s` may repeat and do not
advance the ordinary sequential cursor. Flags, custom ASCII padding, literal
width/precision, `l`, and conversions `bcdeEfFgGhHosuxX` are recognized. Star width
and precision consume arguments too, including `%2$*3$.*4$f` (PHP 8+ syntax).
The required count is the highest referenced index, not the number of `%` signs.
PHP allows extra values, so surplus arguments are not reported.
Position indexes may have leading zeros. Literal width/precision and argument
indexes outside PHP's accepted integer bounds are skipped.

Bare and fully qualified global function names are case-insensitive. Methods,
constructors, attributes, and namespace-qualified names are excluded. In files
with namespace declarations or imports, bare function and wrapper names are
skipped; explicitly global calls with known formats still work. Dynamic,
concatenated or interpolated formats, heredoc/nowdoc, double-quoted numeric or
Unicode escapes, plural/unknown wrappers, named arguments, unpacking, first-class
callables, binary-prefixed strings and unsupported/malformed conversions are
conservatively skipped. Literal dollar signs such as "$" or "$5" are accepted.
Nested value expressions, comments and trailing commas do not affect counting.
The checker uses PHP `token_get_all` or the JS fallback without evaluating source.

Severity overrides, ignores, baselines, diff and output formats apply as usual.
The rule has no automatic fix: adding values or changing a format requires intent.

Before:

```php
printf( '%s: %d', esc_html( $label ) );
```

After:

```php
printf( '%s: %d', esc_html( $label ), $count );
```

### `php.unescaped-printf`

<a id="php-unescaped-printf"></a>

Default: warning. Applies to PHP `printf()` calls.

Rationale: Formatting a string does not escape its dynamic arguments. Escape
each value for its output context; this is a heuristic, not a complete HTML audit.

Before:

```php
printf( '<span>%s</span>', $title );
```

After:

```php
printf( '<span>%s</span>', esc_html( $title ) );
```

### `php.text-domain`

<a id="php-text-domain"></a>

Default: warning. A different literal domain is an error; dynamic domains are warnings.

Rationale: Translation extraction needs the expected literal domain in each
gettext call. Use the configured theme domain at the argument position required
by the function's signature.

Before:

```php
__( 'Read more' );
```

After:

```php
__( 'Read more', 'demo-theme' );
```

### `php.translator-comment`

<a id="php-translator-comment"></a>

Default: info. Applies to gettext strings containing placeholders.

Rationale: Translators need to know what substituted values mean, especially
when reordering numbered placeholders. Put a `translators:` comment near the call.

Before:

```php
__( 'Written by %s', 'demo-theme' );
```

After:

```php
/* translators: %s: author display name. */
__( 'Written by %s', 'demo-theme' );
```

### `php.forbidden-function`

<a id="php-forbidden-function"></a>

Default: error. Some discouraged functions are warnings.

Rationale: Removed APIs, executable input, and query-mutating helpers can break
themes or compromise a site. Replace the flagged function with an appropriate
WordPress API; for secondary queries, use `WP_Query` rather than `query_posts`.

Before:

```php
query_posts( 'cat=1' );
```

After:

```php
$query = new WP_Query( array( 'cat' => 1 ) );
// Render the secondary loop, then restore post state.
wp_reset_postdata();
```

### `php.superglobal-direct`

<a id="php-superglobal-direct"></a>

Default: info. Applies to request superglobal reads.

Rationale: Request input is untrusted. Unslash and sanitize it for the intended
type before use, then escape at output. The nearby-sanitizer check is a heuristic;
it does not replace nonce and capability checks for writes.

Before:

```php
$search = $_GET['search'];
```

After:

```php
$search = isset( $_GET['search'] ) ? sanitize_text_field( wp_unslash( $_GET['search'] ) ) : '';
```

### `php.sql-interpolation`

<a id="php-sql-interpolation"></a>

Default: error. Queries passed as plain variables are info for manual review.

Rationale: Interpolating request-derived values into SQL can permit SQL
injection. Use `$wpdb->prepare()` with placeholders for values. The checker
inspects query expressions rather than tracing data flow across assignments.

Before:

```php
$wpdb->get_results( "SELECT * FROM {$wpdb->posts} WHERE post_title = '$title'" );
```

After:

```php
$wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->posts} WHERE post_title = %s", $title ) );
```

### `php.nonce-check`

<a id="php-nonce-check"></a>

Default: info. Applies to files reading `$_POST` or `$_REQUEST`.

Rationale: Verify request intent before processing submitted data to reduce
cross-site request forgery. A nonce is not authorization; state-changing handlers
also need a capability check. This rule looks for verification in the same file.

Before:

```php
$label = sanitize_text_field( wp_unslash( $_POST['label'] ?? '' ) );
```

After:

```php
check_admin_referer( 'demo_theme_save' );
$label = sanitize_text_field( wp_unslash( $_POST['label'] ?? '' ) );
```

### `php.capability-check`

<a id="php-capability-check"></a>

Default: info. Applies to request-driven state-changing WordPress calls.

Rationale: A valid request still needs authorization for the specific action.
Check an appropriate capability before writing; a nonce check is separate. The
rule only recognizes visible capability checks within the file.

Before:

```php
update_option( 'demo_theme_label', sanitize_text_field( wp_unslash( $_POST['label'] ?? '' ) ) );
```

After:

```php
if ( ! current_user_can( 'edit_theme_options' ) ) { wp_die( 'Forbidden' ); }
check_admin_referer( 'demo_theme_save' );
update_option( 'demo_theme_label', sanitize_text_field( wp_unslash( $_POST['label'] ?? '' ) ) );
```

### `php.abspath-guard`

<a id="php-abspath-guard"></a>

Default: info. Applies to PHP libraries under `inc/`, `includes/`, `src/`,
`lib/`, and `classes/`, rather than ordinary template files.

Rationale: A library may be requested directly without WordPress loaded.
An early ABSPATH guard prevents accidental execution outside that environment.

Before:

```php
<?php
function demo_theme_helper() { return 'value'; }
```

After:

```php
<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
function demo_theme_helper() { return 'value'; }
```

### `php.global-prefix`

<a id="php-global-prefix"></a>

Default: info. Applies to named global PHP functions, excluding class methods.

Rationale: Themes and plugins share PHP's global function namespace. Use the
configured prefix to avoid collisions; a `demo-theme` slug defaults to
`demo_theme_` for these functions.

Before:

```php
function render_card() { return 'card'; }
```

After:

```php
function demo_theme_render_card() { return 'card'; }
```

### `php.hardcoded-local-path`

<a id="php-hardcoded-local-path"></a>

Default: warning. Applies to PHP string literals.

Rationale: Development hostnames and machine-specific paths fail after
deployment. Derive public URLs and filesystem paths from WordPress APIs.

Before:

```php
$image = 'http://localhost/wp-content/themes/demo-theme/assets/hero.png';
```

After:

```php
$image = get_theme_file_uri( 'assets/hero.png' );
```

### `php.template-part-missing`

<a id="php-template-part-missing"></a>

Default: warning. Applies to literal template references in classic/hybrid themes.

Rationale: Missing template files silently remove expected page content.
Check literal header, footer, sidebar, comment, and template-part targets.
Dynamic targets are skipped; `get_template_part()` also checks the slug fallback.

Literal positional argument arrays may be unpacked with either PHP syntax:

```php
get_template_part( ...[ 'template-parts/card', 'single' ] );
get_template_part( ...array( 'template-parts/card', 'single' ) );
get_template_part( 'template-parts/card', ...[ 'single', [ 'value' => $data ] ] );
```

The named candidate is tried before `template-parts/card.php`; the checker warns
only if neither exists. Multiple literal unpacks, empty arrays, comments and
trailing commas are supported. Null, empty or omitted names use the generic
candidate. The third `$args` value is data, not another target.

Expanded global calls also accept `\get_template_part`. Slug/name expressions
must each be an exact non-interpolated single/double-quoted string literal (or
the optional null name). Heredoc/nowdoc paths, keyed arrays, nested array
unpacking, concatenation, indexed expressions, dynamic path values, unknown
spread sources, namespace-qualified functions and object/static methods are
skipped. The kit does not evaluate checked PHP.
An ordinary array passed as slug is not a WordPress candidate-list API.

Before:

```text
get_template_part( 'template-parts/card' );
template-parts/card.php is missing.
```

After:

```text
get_template_part( 'template-parts/card' );
template-parts/card.php exists.
```

### `php.require-glob`

<a id="php-require-glob"></a>

Default: info. Applies to files with dynamic discovery and PHP includes.

Rationale: Directory scans hide load order and make included behavior difficult
to audit. Prefer explicit includes. The rule observes both operations within a
file and may need manual review when they are unrelated.

Before:

```php
foreach ( glob( __DIR__ . '/inc/*.php' ) as $file ) { require_once $file; }
```

After:

```php
require_once __DIR__ . '/inc/setup.php';
require_once __DIR__ . '/inc/assets.php';
```

### `php.asset-version`

<a id="php-asset-version"></a>

Default: info. Applies to script/style enqueue and registration calls.

Rationale: An explicit asset version gives deployments a cache invalidation
key. Pass the theme version or a deliberate asset version as the fourth argument.
The checker flags absent and empty-string arguments, not every cache strategy.

Before:

```php
wp_enqueue_style( 'demo-theme', get_stylesheet_uri() );
```

After:

```php
wp_enqueue_style( 'demo-theme', get_stylesheet_uri(), array(), wp_get_theme()->get( 'Version' ) );
```

### `block.index-missing`

<a id="block-index-missing"></a>

Default: error. Applies to block themes.

Rationale: Block themes need `templates/index.html` as the final template
fallback. More specific templates cannot replace that fallback for every request.

Before:

```text
templates/single.html exists; templates/index.html is missing.
```

After:

```html
<!-- templates/index.html -->
<!-- wp:paragraph --><p>Content fallback</p><!-- /wp:paragraph -->
```

### `block.theme-json`

<a id="block-theme-json"></a>

Default: error. Unsupported/missing version is warning; missing `$schema` is info.

Rationale: WordPress must parse valid JSON before using theme settings and
styles. Use schema version 2 or 3 and a `$schema` string for editor assistance.
This rule checks structure, not the complete remote schema, and never fetches it.

Before:

```json
{ "version": 1 }
```

After:

```json
{ "$schema": "https://schemas.wp.org/trunk/theme.json", "version": 3, "settings": {}, "styles": {} }
```

### `block.template-parts`

<a id="block-template-parts"></a>

Default: warning. Applies to template references in block/hybrid themes.

Rationale: A template-part slug needs a matching file under `parts/`; a pattern
reference needs a PHP pattern declaring that Slug. Missing references leave
content absent even when the surrounding template parses correctly.

Before:

```text
<!-- wp:template-part {"slug":"header"} /-->
parts/header.html is missing.
```

After:

```text
<!-- wp:template-part {"slug":"header"} /-->
parts/header.html exists.
```

### `block.block-json`

<a id="block-block-json"></a>

Default: error. Missing name/title/category fields are warnings.

Rationale: A block manifest needs valid JSON, identifying metadata, and existing
local `render`/`style` targets. The rule checks files under `blocks/` and accepts
the `file:` prefix; it is not a complete block registration validator.

Before:

```json
{ "name": "demo-theme/card", "render": "file:missing.php" }
```

After:

```json
{ "name": "demo-theme/card", "title": "Card", "category": "widgets", "render": "file:render.php" }
```

Create `render.php` beside this manifest before using the After example.

### `block.pattern-header`

<a id="block-pattern-header"></a>

Default: warning. Applies to PHP files under `patterns/`.

Rationale: WordPress discovers pattern titles and slugs from the leading file
header. Include both so the pattern has a stable identity and an editor label.

Before:

```php
<?php /* Title: Hero */ ?>
```

After:

```php
<?php
/**
 * Title: Hero
 * Slug: demo-theme/hero
 */
?>
```

### `html.img-alt`

<a id="html-img-alt"></a>

Default: info. Applies to literal image markup in HTML and PHP inline HTML.

Rationale: Alternative text makes image meaning available to assistive
technology. Use a useful description, or `alt=""` when the image is decorative.
The rule checks attribute presence rather than judging the description.

Before:

```html
<img src="hero.png">
```

After:

```html
<img src="hero.png" alt="A forest trail at sunrise">
```

### `html.inline-handler`

<a id="html-inline-handler"></a>

Default: info. Applies to recognized inline event attributes in HTML/PHP markup.

Rationale: Inline event handlers mix executable behavior with markup and make
security policy and maintenance harder. Enqueue a script and attach listeners
there. Placeholder handlers that only return false are ignored.

Before:

```html
<button onclick="openMenu()">Menu</button>
```

After:

```html
<button class="menu-toggle">Menu</button>
```

Attach `openMenu` with `addEventListener` in the enqueued script.

### `html.target-blank`

<a id="html-target-blank"></a>

Default: info. Applies to literal links with `target="_blank"`.

Rationale: Explicit `rel="noopener"` prevents an opened page from controlling
the opener in browsers that do not provide this protection by default. The
checker also accepts `noreferrer`.

Before:

```html
<a href="https://example.org" target="_blank">Visit</a>
```

After:

```html
<a href="https://example.org" target="_blank" rel="noopener">Visit</a>
```

### `js.text-domain`

<a id="js-text-domain"></a>

Default: warning. Wrong literal domains are errors; dynamic domains are info.

Rationale: `wp.i18n.__`, `_x`, and `_n` need the expected literal domain for
translation tooling to match theme strings. Other import/call forms are outside
this rule's current scope.

Before:

```javascript
wp.i18n.__( 'Read more' );
```

After:

```javascript
wp.i18n.__( 'Read more', 'demo-theme' );
```

### `js.console`

<a id="js-console"></a>

Default: info. Applies to `console.log`, `console.debug`, and `console.info`.

Rationale: Debug logging in shipped JavaScript adds noise and may expose
internal values. Remove temporary diagnostics from the production asset.

Before:

```javascript
console.log( state );
render( state );
```

After:

```javascript
render( state );
```

### `js.hardcoded-host`

<a id="js-hardcoded-host"></a>

Default: warning. Applies to localhost and 127.0.0.1 in shipped JavaScript.

Rationale: Local development URLs do not point at the deployed site. Pass a
WordPress-generated URL from PHP, for example through `wp_localize_script`,
and consume that configuration in the script.

Before:

```javascript
const endpoint = 'http://localhost/wp-json/demo-theme/v1/cards';
```

After:

```javascript
const endpoint = demoThemeConfig.cardsUrl;
```

### `css.local-url`

<a id="css-local-url"></a>

Default: warning. Applies to localhost and 127.0.0.1 inside CSS `url()`.

Rationale: A stylesheet referencing a developer's server loses its assets on
deployment. Prefer a URL relative to the shipped stylesheet.

Before:

```css
.hero { background-image: url('http://localhost/hero.png'); }
```

After:

```css
.hero { background-image: url('../images/hero.png'); }
```

### `block.markup-balance`

<a id="block-markup-balance"></a>

Default: error. Applies to HTML files recursively under `templates/` and `parts/`.

Rationale: An unclosed or misnested block delimiter changes how WordPress
interprets the remaining template. Balance opening and closing names in nesting
order, or use a self-closing delimiter for a block with no serialized content.
This rule checks delimiter structure, not HTML validity, block registration,
or attribute JSON syntax.

Unclosed blocks point to their opening line; unexpected or misnested closing
delimiters point to the closing line. A block delimiter comment without `-->`
also reports an error. Bare names match their `core/` forms; custom namespaces
stay distinct. Self-closing blocks never enter the nesting stack. Ordinary
comments and escaped markup are ignored.

After a close matches an ancestor instead of the innermost block, the checker
reports the closing-order error and discards that ancestor and its children.
An unexpected close leaves the open stack intact. Scope/inline ignores,
baselines, severity overrides, diff checks and output formats apply normally.
No mechanical fix is offered for ambiguous block structure.

Before:

```html
<!-- wp:group -->
<main>Content</main>
```

After:

```html
<!-- wp:group -->
<main>Content</main>
<!-- /wp:group -->
```

### `block.attribute-json`

<a id="block-attribute-json"></a>

Default: error. Applies to HTML files recursively under `templates/` and `parts/`.

Rationale: WordPress needs valid JSON to read serialized block attributes.
Check nonempty attribute text on complete opening and self-closing block
delimiters. Closing and unterminated comments are excluded; delimiter balance
is checked independently. Findings point to the opening comment's line.

This rule checks JSON syntax only, not attribute types, schemas, or block
registration. No automatic repair is offered for ambiguous attribute values.

Trim attribute text after the name and remove the final self-closing slash
before parsing. Missing attributes are allowed. Valid JSON values of any type
are accepted, including arrays and primitives; this is not schema validation.
Nested objects, escaped quotes and backslashes are handled by JSON parsing.
Each invalid delimiter produces one stable error, independent of engine-specific
parse-error text. The message includes the one-based opening column (UTF-16 code
units), preserving separate errors for same-name blocks on one line. Invalid
JSON does not change the separate balance stack.

Scope ignores, HTML-comment suppression, rule overrides, baselines, diff and
fail-on thresholds apply normally. Other mechanical fixes preserve remaining
attribute errors on recheck. Ordinary comments and escaped markup are ignored.

Before:

```html
<!-- wp:group {"layout": } -->
<!-- /wp:group -->
```

After:

```html
<!-- wp:group {"layout":{"type":"constrained"}} -->
<!-- /wp:group -->
```

### `meta.rule-error`

<a id="meta-rule-error"></a>

Default: info. This is an internal diagnostic, not one of the 40 registered checks.

Rationale: When a rule throws, the checker reports the exception and continues
with other rules. This diagnostic means that one rule did not finish; it does
not certify that the input is valid. Use the named rule and exception message
to reproduce the failure, and enable `WPTK_DEBUG=1` for its stack trace when
reporting a toolkit bug. Baselines and failure thresholds still apply.

Before:

```text
Rule block.theme-json failed: Cannot read properties of null ...
```

After:

```text
Reproduce with WPTK_DEBUG=1, then report the rule, stack trace, and minimal input.
After the toolkit bug is repaired, rerun the complete theme check.
```

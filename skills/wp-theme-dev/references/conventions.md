# Project Conventions

These are the defaults the checker and scaffolding assume. Override them in
`.wp-theme-kit.json` when a project has its own conventions.

## Naming

- Theme slug: lowercase kebab-case. It is also the deployed directory name.
- Text domain: the slug. Use it literally in every gettext call.
- PHP prefix: the slug with hyphens replaced by underscores, plus `_`.
  Example: `my-theme` -> `my_theme_`.
- Global functions, classes, constants, option keys, meta keys, transients, and
  REST namespaces use the prefix.
- CSS classes use the slug as a prefix: `my-theme-card`.
- Block names use the slug as the namespace: `my-theme/callout`.

## PHP layout

- One module per file under `inc/<feature>.php`.
- Connect modules with explicit `require_once` calls in `functions.php`.
  Do not `glob()` or scan directories.
- Register hooks next to the callback they belong to.
- Use `add_action` and `add_filter` with an explicit priority only when order
  matters.
- Prefer long array syntax (`array()`) in WordPress code for consistency, but
  match the surrounding file.
- Do not close PHP files with `?>`.

## Templates

- Shared list items live in `template-parts/`.
- A template part receives data through the loop or `set_query_var()`, not
  through globals.
- Use `get_template_part()` rather than `include`.
- Keep `header.php` responsible for `wp_head()`, `wp_body_open()`, and
  `body_class()`.
- Keep `footer.php` responsible for `wp_footer()`.

## Assets

- Enqueue in a `wp_enqueue_scripts` callback.
- Use a version derived from `wp_get_theme()->get( 'Version' )`.
- Do not hard-code `/wp-content/themes/...`; use
  `get_template_directory_uri()`.
- Register scripts with `wp_enqueue_script` and `array()` dependencies, not
  inline `<script>` tags.

## Text and translation

- No translatable string without a literal text domain.
- Add `translators:` comments for placeholders.
- Do not translate user-generated content.
- Keep the POT file current before packaging.

## Documentation

- `AGENTS.md` holds instructions for coding agents.
- `CLAUDE.md` may point at `AGENTS.md`; do not duplicate content.
- Record architectural decisions in `docs/adr/` when a choice constrains future
  work.

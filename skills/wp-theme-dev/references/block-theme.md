# Block Themes

A block theme is configured by `theme.json` and rendered by block templates. PHP
is used for registration and dynamic blocks, not for the template layout.

## Minimum structure

```text
theme/
├── style.css
├── functions.php
├── theme.json
├── templates/
│   ├── index.html
│   ├── single.html
│   ├── page.html
│   ├── archive.html
│   ├── search.html
│   └── 404.html
└── parts/
    ├── header.html
    └── footer.html
```

`templates/index.html` is required as the final fallback.

## theme.json

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {
    "appearanceTools": true,
    "layout": { "contentSize": "720px", "wideSize": "1120px" }
  },
  "styles": {
    "color": { "background": "#fdfbf7", "text": "#2d2d35" }
  }
}
```

- `version` is the schema version (2 or 3), not the theme release version.
- Keep design tokens in `theme.json` presets, not in a second stylesheet source.
- `style.css` still carries the theme header and may hold global CSS.

## Templates and parts

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:post-title {"level":1} /-->
  <!-- wp:post-content /-->
</main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

`wp:template-part` with slug `header` resolves to `parts/header.html`.

## Custom blocks

`blocks/<name>/block.json`:

```json
{
  "apiVersion": 3,
  "name": "my-theme/callout",
  "title": "Callout",
  "category": "theme",
  "textdomain": "my-theme",
  "render": "file:./render.php",
  "style": "file:./style.css"
}
```

`render.php` receives `$attributes`, `$content`, and `$block`. Escape output:

```php
<div <?php echo get_block_wrapper_attributes(); ?>>
  <?php echo wp_kses_post( $content ); ?>
</div>
```

Register in `functions.php`:

```php
add_action(
    'init',
    function () {
        register_block_type( __DIR__ . '/blocks/callout' );
    }
);
```

## Patterns

Pattern files live in `patterns/` and start with a header:

```php
<?php
/**
 * Title: Call to action
 * Slug: my-theme/cta
 * Categories: featured
 */
?>
```

## Hybrid themes

A hybrid theme ships both PHP templates and block templates. WordPress prefers
block templates for matching routes, so verify the route you expect actually
uses the block template. Keep one design-token source so the two render paths do
not drift.

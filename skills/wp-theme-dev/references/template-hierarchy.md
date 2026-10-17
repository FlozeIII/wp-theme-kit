# Template Hierarchy

WordPress picks the most specific template that exists. `index.php` is always the
final fallback for classic themes.

| Request | Classic templates, most specific first |
|---|---|
| Single post | `single-{post_type}-{slug}.php`, `single-{post_type}.php`, `single.php`, `singular.php`, `index.php` |
| Static page | `page-{slug}.php`, `page-{id}.php`, `page-{parent}.php`, `page.php`, `singular.php`, `index.php` |
| Category | `category-{slug}.php`, `category-{id}.php`, `category.php`, `archive.php`, `index.php` |
| Tag | `tag-{slug}.php`, `tag-{id}.php`, `tag.php`, `archive.php`, `index.php` |
| Custom taxonomy | `taxonomy-{taxonomy}-{term}.php`, `taxonomy-{taxonomy}.php`, `taxonomy.php`, `archive.php`, `index.php` |
| Author | `author-{nicename}.php`, `author-{id}.php`, `author.php`, `archive.php`, `index.php` |
| Date | `date.php`, `archive.php`, `index.php` |
| Search | `search.php`, `index.php` |
| 404 | `404.php`, `index.php` |
| Front page | `front-page.php`, `home.php`, `index.php` |
| Blog home | `home.php`, `index.php` |
| Archive | `archive-{post_type}.php`, `archive.php`, `index.php` |

## Template parts

```php
get_template_part( 'template-parts/content', get_post_type() );
```

This loads `template-parts/content-{post_type}.php`, then
`template-parts/content.php`.

## Header, footer, sidebar

```php
get_header();
get_header( 'minimal' );   // header-minimal.php, then header.php
get_footer();
get_footer( 'compact' );   // footer-compact.php, then footer.php
get_sidebar();
get_sidebar( 'shop' );     // sidebar-shop.php, then sidebar.php
```

## Comments

```php
comments_template();       // comments.php
comments_template( '/parts/comments-custom.php' );
```

## Block themes

Block themes use `templates/*.html` and `parts/*.html` instead of PHP templates.
The block template hierarchy mirrors the classic names: `single.html`,
`page.html`, `archive.html`, `search.html`, `404.html`, `index.html`. A
`template-part` block with `{"slug":"header"}` resolves to `parts/header.html`.

## Checks

`wptk check` verifies that literal `get_header()`, `get_footer()`,
`get_sidebar()`, `get_template_part()`, and `comments_template()` targets exist.
Dynamic arguments are skipped.

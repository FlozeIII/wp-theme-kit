# Escaping and Security

Escape at the output site. The value may be trusted in one context and unsafe in
another, so escaping belongs next to the HTML that consumes it.

## Output escaping

| Context | Function |
|---|---|
| HTML text | `esc_html()` |
| Attribute value | `esc_attr()` |
| URL | `esc_url()` |
| JavaScript string | `esc_js()` |
| Textarea content | `esc_textarea()` |
| Allow limited post HTML | `wp_kses_post()` |
| Allow an explicit tag list | `wp_kses( $value, $allowed )` |
| JSON in a script tag | `wp_json_encode()` |

```php
<h1><?php echo esc_html( get_the_title() ); ?></h1>
<a href="<?php echo esc_url( get_permalink() ); ?>"><?php echo esc_html( get_the_title() ); ?></a>
<div><?php echo wp_kses_post( $content ); ?></div>
```

`esc_html_e( 'Text', 'domain' )` and `esc_attr_e()` combine translation and
escaping.

## Input sanitization

| Data | Function |
|---|---|
| Plain text | `sanitize_text_field()` |
| Textarea | `sanitize_textarea_field()` |
| Email | `sanitize_email()` |
| Key | `sanitize_key()` |
| URL | `esc_url_raw()` |
| Integer | `absint()` or `intval()` |
| File name | `sanitize_file_name()` |
| HTML | `wp_kses_post()` on write if markup is allowed |

Unslash before sanitizing form data: `wp_unslash( $_POST['field'] )`.

## Nonces and capabilities

```php
if ( ! isset( $_POST['my_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['my_nonce'] ), 'my_action' ) ) {
    wp_die( esc_html__( 'Invalid request.', 'my-theme' ) );
}

if ( ! current_user_can( 'edit_posts' ) ) {
    wp_die( esc_html__( 'Not allowed.', 'my-theme' ) );
}
```

- `check_admin_referer( 'my_action' )` for admin forms.
- `check_ajax_referer( 'my_action', 'nonce' )` for AJAX.
- A nonce proves intent, not permission. Check capabilities separately.
- Public comment endpoints follow WordPress core behavior; document deliberate
  exceptions.

## Database

```php
$rows = $wpdb->get_results(
    $wpdb->prepare( "SELECT * FROM {$wpdb->posts} WHERE post_author = %d", $author_id )
);
```

Never interpolate a variable into SQL. Use placeholders (`%d`, `%s`, `%f`).
Table names cannot be placeholders; build them from known `$wpdb` properties.

## Files and URLs

- Use `get_template_directory()` and `get_template_directory_uri()` for parent
  theme paths.
- Use `get_stylesheet_directory()` for child theme overrides.
- Use `home_url()`, `site_url()`, and `admin_url()` instead of hard-coded hosts.
- Do not ship `localhost`, `127.0.0.1`, drive letters, or absolute home paths.

## Direct file access

Library files can be requested directly. Start them with:

```php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
```

Template files loaded by WordPress do not need this guard; the checker only
expects it under `inc/`, `includes/`, `src/`, `lib/`, and `classes/`.

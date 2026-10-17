<?php
/**
 * Not found.
 *
 * @package {{name}}
 */

get_header();
?>
<h1 class="entry-title"><?php esc_html_e( 'Page not found', '{{textDomain}}' ); ?></h1>
<p><?php esc_html_e( 'The page you were looking for does not exist.', '{{textDomain}}' ); ?></p>
<?php get_search_form(); ?>
<?php
get_footer();

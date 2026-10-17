<?php
/**
 * Search form.
 *
 * @package {{name}}
 */
?>
<form role="search" method="get" class="search-form" action="<?php echo esc_url( home_url( '/' ) ); ?>">
	<label>
		<span class="screen-reader-text"><?php esc_html_e( 'Search for:', '{{textDomain}}' ); ?></span>
		<input type="search" class="search-field" value="<?php echo esc_attr( get_search_query() ); ?>" name="s">
	</label>
	<button type="submit"><?php esc_html_e( 'Search', '{{textDomain}}' ); ?></button>
</form>

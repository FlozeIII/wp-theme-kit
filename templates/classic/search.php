<?php
/**
 * Search results.
 *
 * @package {{name}}
 */

get_header();
?>
<h1 class="entry-title">
	<?php
	printf(
		/* translators: %s: search query. */
		esc_html__( 'Search results for: %s', '{{textDomain}}' ),
		esc_html( get_search_query() )
	);
	?>
</h1>
<?php if ( have_posts() ) : ?>
	<div class="post-list">
		<?php
		while ( have_posts() ) :
			the_post();
			get_template_part( 'template-parts/content', get_post_type() );
		endwhile;
		?>
	</div>
	<?php the_posts_pagination(); ?>
<?php else : ?>
	<p><?php esc_html_e( 'Nothing found.', '{{textDomain}}' ); ?></p>
	<?php get_search_form(); ?>
<?php endif; ?>
<?php
get_footer();

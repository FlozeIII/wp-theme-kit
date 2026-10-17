<?php
/**
 * {{templateTitle}} template.
 *
 * @package {{name}}
 */

get_header();
?>
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
<?php endif; ?>
<?php
get_footer();

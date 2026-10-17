<?php
/**
 * Archive template.
 *
 * @package {{name}}
 */

get_header();
?>
<h1 class="entry-title"><?php the_archive_title(); ?></h1>
<?php the_archive_description(); ?>
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

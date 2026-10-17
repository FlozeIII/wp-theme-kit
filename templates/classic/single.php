<?php
/**
 * Single post.
 *
 * @package {{name}}
 */

get_header();
?>
<div class="with-sidebar">
	<div>
		<?php
		while ( have_posts() ) :
			the_post();
			?>
			<article <?php post_class(); ?>>
				<h1 class="entry-title"><?php the_title(); ?></h1>
				<div class="entry-content"><?php the_content(); ?></div>
				<?php the_post_navigation(); ?>
				<?php comments_template(); ?>
			</article>
			<?php
		endwhile;
		?>
	</div>
	<?php get_sidebar(); ?>
</div>
<?php
get_footer();

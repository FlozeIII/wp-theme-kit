<?php
/**
 * Static page.
 *
 * @package {{name}}
 */

get_header();
?>
<?php
while ( have_posts() ) :
	the_post();
	?>
	<article <?php post_class(); ?>>
		<h1 class="entry-title"><?php the_title(); ?></h1>
		<div class="entry-content"><?php the_content(); ?></div>
		<?php comments_template(); ?>
	</article>
	<?php
endwhile;
?>
<?php
get_footer();

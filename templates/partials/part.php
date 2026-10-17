<?php
/**
 * Template part: {{partName}}.
 *
 * @package {{name}}
 */
?>
<section class="template-part template-part--{{partSlug}}">
	<?php if ( have_posts() ) : ?>
		<?php
		while ( have_posts() ) :
			the_post();
			?>
			<article <?php post_class(); ?>>
				<h2 class="entry-title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
				<div class="entry-summary"><?php the_excerpt(); ?></div>
			</article>
			<?php
		endwhile;
		?>
	<?php endif; ?>
</section>

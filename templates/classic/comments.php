<?php
/**
 * Comments.
 *
 * @package {{name}}
 */

if ( post_password_required() ) {
	return;
}
?>
<div id="comments" class="comments-area">
	<?php if ( have_comments() ) : ?>
		<h2 class="comments-title"><?php esc_html_e( 'Comments', '{{textDomain}}' ); ?></h2>
		<ol class="comment-list"><?php wp_list_comments(); ?></ol>
		<?php the_comments_navigation(); ?>
	<?php endif; ?>
	<?php comment_form(); ?>
</div>

<?php
/**
 * Title: {{patternTitle}}
 * Slug: {{slug}}/{{patternSlug}}
 * Categories: featured
 * Description: {{patternTitle}}
 * Keywords: {{patternSlug}}
 * Viewport Width: 1200
 */
?>
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
	<!-- wp:heading -->
	<h2 class="wp-block-heading"><?php echo esc_html__( '{{patternTitle}}', '{{textDomain}}' ); ?></h2>
	<!-- /wp:heading -->

	<!-- wp:paragraph -->
	<p><?php echo esc_html__( 'Replace this paragraph with the pattern content.', '{{textDomain}}' ); ?></p>
	<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->

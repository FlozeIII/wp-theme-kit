<?php
/**
 * Server render for {{blockTitle}}.
 *
 * @package {{name}}
 *
 * @var array $attributes Block attributes.
 * @var string $content Saved content.
 * @var WP_Block $block Block instance.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$attributes = isset( $attributes ) && is_array( $attributes ) ? $attributes : array();
?>
<div <?php echo get_block_wrapper_attributes(); ?>>
	<?php echo wp_kses_post( $content ); ?>
</div>

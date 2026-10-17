<?php
/**
 * Site header.
 *
 * @package {{name}}
 */
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link screen-reader-text" href="#content"><?php esc_html_e( 'Skip to content', '{{textDomain}}' ); ?></a>
<header class="site-header">
	<a class="site-title" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php bloginfo( 'name' ); ?></a>
	<?php if ( has_nav_menu( 'primary' ) ) : ?>
		<nav class="site-nav" aria-label="<?php esc_attr_e( 'Primary menu', '{{textDomain}}' ); ?>">
			<?php
			wp_nav_menu(
				array(
					'theme_location' => 'primary',
					'container'      => false,
				)
			);
			?>
		</nav>
	<?php endif; ?>
</header>
<main id="content" class="site-main">

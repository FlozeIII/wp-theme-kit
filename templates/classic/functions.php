<?php
/**
 * Theme functions.
 *
 * @package {{name}}
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register theme supports and menus.
 */
function {{prefix}}_setup() {
	load_theme_textdomain( '{{textDomain}}', get_template_directory() . '/languages' );

	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support(
		'html5',
		array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' )
	);

	register_nav_menus(
		array(
			'primary' => __( 'Primary Menu', '{{textDomain}}' ),
		)
	);
}
add_action( 'after_setup_theme', '{{prefix}}_setup' );

/**
 * Register the sidebar.
 */
function {{prefix}}_widgets_init() {
	register_sidebar(
		array(
			'name'          => __( 'Sidebar', '{{textDomain}}' ),
			'id'            => 'sidebar-1',
			'before_widget' => '<section id="%1$s" class="widget %2$s">',
			'after_widget'  => '</section>',
			'before_title'  => '<h2 class="widget-title">',
			'after_title'   => '</h2>',
		)
	);
}
add_action( 'widgets_init', '{{prefix}}_widgets_init' );

/**
 * Enqueue the stylesheet and script.
 */
function {{prefix}}_assets() {
	$version = wp_get_theme()->get( 'Version' );

	wp_enqueue_style( '{{slug}}-style', get_stylesheet_uri(), array(), $version );
	wp_enqueue_script(
		'{{slug}}-theme',
		get_template_directory_uri() . '/assets/js/theme.js',
		array(),
		$version,
		true
	);
}
add_action( 'wp_enqueue_scripts', '{{prefix}}_assets' );

/* wp-theme-kit:modules */

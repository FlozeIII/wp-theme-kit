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
 * Register block theme supports.
 */
function {{prefix}}_setup() {
	load_theme_textdomain( '{{textDomain}}', get_template_directory() . '/languages' );

	add_theme_support( 'wp-block-styles' );
	add_theme_support( 'editor-styles' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support(
		'html5',
		array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' )
	);

	add_editor_style( 'style.css' );
}
add_action( 'after_setup_theme', '{{prefix}}_setup' );

/**
 * Enqueue the shared stylesheet.
 */
function {{prefix}}_assets() {
	wp_enqueue_style( '{{slug}}-style', get_stylesheet_uri(), array(), wp_get_theme()->get( 'Version' ) );
}
add_action( 'wp_enqueue_scripts', '{{prefix}}_assets' );

/* wp-theme-kit:blocks */

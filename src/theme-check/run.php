<?php
/** Static WordPress libraries only: no wp-load, site config, DB or theme PHP. */
$slug = $args[0];
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', ABSPATH . 'wp-content' );
define( 'WP_PLUGIN_DIR', WP_CONTENT_DIR . '/plugins' );
define( 'WP_LANG_DIR', WP_CONTENT_DIR . '/languages' );
define( 'WP_DEBUG', false );
define( 'WP_CACHE', false );
define( 'WP_INSTALLING', true );
define( 'WP_HTTP_BLOCK_EXTERNAL', true );
define( 'WP_CONTENT_URL', 'http://wptk.invalid/wp-content' );
define( 'WP_PLUGIN_URL', WP_CONTENT_URL . '/plugins' );
define( 'WP_DEFAULT_THEME', $slug );

global $wp_version, $wp_db_version, $wp_theme_directories, $l10n;
$libraries = array(
    'version.php', 'compat-utf8.php', 'compat.php', 'load.php', 'plugin.php',
    'class-wp-exception.php', 'class-wp-error.php', 'class-wp-list-util.php',
    'class-wp-token-map.php', 'utf8.php', 'formatting.php', 'functions.php',
    'cache.php', 'pomo/translations.php', 'l10n.php', 'theme.php', 'class-wp-theme.php',
    'class-wp-paused-extensions-storage.php', 'class-wp-recovery-mode-cookie-service.php',
    'class-wp-recovery-mode-key-service.php', 'class-wp-recovery-mode-link-service.php',
    'class-wp-recovery-mode-email-service.php', 'class-wp-recovery-mode.php',
    'error-protection.php', 'default-constants.php', 'kses.php',
);
foreach ( $libraries as $file ) {
    if ( is_file( ABSPATH . WPINC . '/' . $file ) ) {
        require_once ABSPATH . WPINC . '/' . $file;
    }
}
wp_initial_constants();
wp_cache_init();
$l10n = array( 'default' => new NOOP_Translations(), 'theme-check' => new NOOP_Translations() );

// A static theme inspection has no site options. Short-circuit before any DB call.
add_filter( 'pre_option', function ( $pre, $name ) use ( $slug ) {
    $values = array(
        'stylesheet' => $slug, 'template' => $slug, 'blog_charset' => 'UTF-8',
        'siteurl' => 'http://wptk.invalid', 'home' => 'http://wptk.invalid',
    );
    return isset( $values[ $name ] ) ? $values[ $name ] : null;
}, 10, 2 );
add_filter( 'pre_http_request', function () {
    return new WP_Error( 'wptk_offline', 'Theme Check runs offline.' );
} );
$wp_theme_directories = array( WP_CONTENT_DIR . '/themes' );

require_once WP_PLUGIN_DIR . '/theme-check/wp-cli/class-theme-check-cli.php';
$command = new Theme_Check_Command();
$command->run( array( $slug ), array( 'format' => 'json' ) );

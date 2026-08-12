<?php
/**
 * Plugin Name:       WP Instatic Export
 * Plugin URI:        https://github.com/your-org/wordpress-Migration
 * Description:       Exports a WordPress site as a clean static HTML/CSS/JS ZIP for Instatic Super Import. Auto-detects the page builder and rewrites assets to relative paths.
 * Version:           0.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            WP Migration Studio
 * License:           GPL-2.0-or-later
 * Text Domain:       wp-instatic-export
 *
 * @package WpInstaticExport
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WPIE_VERSION', '0.1.0' );
define( 'WPIE_PLUGIN_FILE', __FILE__ );
define( 'WPIE_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'WPIE_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'WPIE_INCLUDES_DIR', WPIE_PLUGIN_DIR . 'includes/' );

spl_autoload_register(
	static function ( $class ) {
		$prefix = 'WpInstaticExport\\';
		if ( strncmp( $prefix, $class, strlen( $prefix ) ) !== 0 ) {
			return;
		}

		$relative   = substr( $class, strlen( $prefix ) );
		$relative   = str_replace( '\\', '/', $relative );
		$parts      = explode( '/', $relative );
		$class_name = array_pop( $parts );
		$file_name  = 'class-' . strtolower( str_replace( '_', '-', $class_name ) ) . '.php';
		$sub_dir    = $parts ? strtolower( implode( '/', $parts ) ) . '/' : '';
		$path       = WPIE_PLUGIN_DIR . ( $sub_dir ? $sub_dir : 'includes/' ) . $file_name;

		if ( is_readable( $path ) ) {
			require_once $path;
		}
	}
);

add_action(
	'plugins_loaded',
	static function () {
		$plugin = new \WpInstaticExport\Plugin();
		$plugin->boot();
	}
);

<?php
/**
 * Plugin Name:       WP Grape Export
 * Plugin URI:        https://github.com/your-org/wordpress-Migration
 * Description:       Exports a complete, structured site snapshot (routes, layout, menus, rendered pages, templates, assets, media) for conversion into a React + GrapeJS project. Runs inside WordPress so shortcodes, Elementor and Theme Builder templates are fully resolved.
 * Version:           0.1.12
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            WP Migration Studio
 * License:           GPL-2.0-or-later
 * Text Domain:       wp-grape-export
 *
 * @package WpGrapeExport
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WPGE_VERSION', '0.1.12' );
define( 'WPGE_SCHEMA_VERSION', 2 );
define( 'WPGE_PLUGIN_FILE', __FILE__ );
define( 'WPGE_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'WPGE_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'WPGE_INCLUDES_DIR', WPGE_PLUGIN_DIR . 'includes/' );

/**
 * PSR-4-ish autoloader for the WpGrapeExport\ namespace.
 *
 * WpGrapeExport\Site_Scanner  ->  includes/class-site-scanner.php
 * WpGrapeExport\Rest\Controller -> rest/class-controller.php
 */
spl_autoload_register(
	static function ( $class ) {
		$prefix = 'WpGrapeExport\\';
		if ( strncmp( $prefix, $class, strlen( $prefix ) ) !== 0 ) {
			return;
		}

		$relative = substr( $class, strlen( $prefix ) );
		$relative = str_replace( '\\', '/', $relative );

		$parts     = explode( '/', $relative );
		$class_name = array_pop( $parts );
		$file_name  = 'class-' . strtolower( str_replace( '_', '-', $class_name ) ) . '.php';

		$sub_dir = '';
		if ( $parts ) {
			$sub_dir = strtolower( implode( '/', $parts ) ) . '/';
		}

		$path = WPGE_PLUGIN_DIR . ( $sub_dir ? $sub_dir : 'includes/' ) . $file_name;
		if ( is_readable( $path ) ) {
			require_once $path;
		}
	}
);

/**
 * Boot the plugin once all plugins are loaded so builder integrations
 * (Elementor, ElementsKit) are available.
 */
function wpge_bootstrap() {
	\WpGrapeExport\Plugin::instance()->init();
}
add_action( 'plugins_loaded', 'wpge_bootstrap', 20 );

register_activation_hook(
	__FILE__,
	static function () {
		// Ensure the export working directory exists.
		$uploads = wp_upload_dir();
		$dir     = trailingslashit( $uploads['basedir'] ) . 'wp-grape-export';
		if ( ! file_exists( $dir ) ) {
			wp_mkdir_p( $dir );
		}
	}
);

<?php
/**
 * CLI export for the local inner loop. Runs inside the WordPress container:
 *
 *   docker compose exec -T radius_wordpress php \
 *     /var/www/html/wp-content/plugins/wp-grape-export/cli/export.php [--copy-media]
 *
 * No REST auth, no plugin ZIP upload. The plugin folder is bind-mounted, so
 * PHP edits on the host are used immediately.
 *
 * Prints a JSON object on stdout. Progress goes to stderr.
 */

if ( PHP_SAPI !== 'cli' ) {
	fwrite( STDERR, "This script is CLI-only.\n" );
	exit( 1 );
}

$copy_media = in_array( '--copy-media', $argv, true );

$abspath = dirname( __DIR__, 4 );
$wp_load = $abspath . '/wp-load.php';
if ( ! is_readable( $wp_load ) ) {
	fwrite( STDERR, "wp-load.php not found at {$wp_load}\n" );
	exit( 1 );
}

if ( empty( $_SERVER['HTTP_HOST'] ) ) {
	$_SERVER['HTTP_HOST'] = getenv( 'WP_HOME_HOST' ) ?: 'localhost:8084';
}
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI']    = '/';

define( 'WP_USE_THEMES', false );
if ( ! defined( 'WP_DEBUG_DISPLAY' ) ) {
	define( 'WP_DEBUG_DISPLAY', false );
}
ini_set( 'display_errors', '0' );

fwrite( STDERR, "Loading WordPress…\n" );
require $wp_load;
ini_set( 'display_errors', '0' );

require_once ABSPATH . 'wp-admin/includes/plugin.php';
$plugin_basename = 'wp-grape-export/wp-grape-export.php';
if ( ! is_plugin_active( $plugin_basename ) ) {
	fwrite( STDERR, "Activating wp-grape-export…\n" );
	$activated = activate_plugin( $plugin_basename );
	if ( is_wp_error( $activated ) ) {
		fwrite( STDERR, 'Activate failed: ' . $activated->get_error_message() . "\n" );
		exit( 1 );
	}
}

if ( ! class_exists( '\\WpGrapeExport\\Plugin' ) ) {
	fwrite( STDERR, "WpGrapeExport\\Plugin not loaded. Is the plugin file readable?\n" );
	exit( 1 );
}

fwrite( STDERR, 'Exporting site (copy_media=' . ( $copy_media ? 'yes' : 'no' ) . ")…\n" );

try {
	$result = \WpGrapeExport\Plugin::instance()->run_export(
		array(
			'post_types' => array( 'page', 'post' ),
			'copy_media' => $copy_media,
		)
	);
} catch ( Throwable $e ) {
	fwrite( STDERR, 'Export failed: ' . $e->getMessage() . "\n" );
	fwrite( STDERR, $e->getTraceAsString() . "\n" );
	exit( 1 );
}

fwrite( STDERR, "Export complete.\n" );
$payload = wp_json_encode(
	array(
		'ok'        => true,
		'zip'       => $result['zip'] ?? '',
		'url'       => $result['url'] ?? '',
		'latestDir' => $result['latestDir'] ?? '',
		'latestZip' => $result['latestZip'] ?? '',
		'stats'     => $result['stats'] ?? array(),
	)
);
$marker_file = '';
if ( ! empty( $result['latestDir'] ) ) {
	$marker_file = trailingslashit( dirname( $result['latestDir'] ) ) . 'latest-result.json';
} elseif ( ! empty( $result['latestZip'] ) ) {
	$marker_file = dirname( $result['latestZip'] ) . '/latest-result.json';
}
if ( $marker_file ) {
	file_put_contents( $marker_file, $payload ); // phpcs:ignore WordPress.WP.AlternativeFunctions
}
echo "\n__WPGE_JSON_START__\n{$payload}\n__WPGE_JSON_END__\n";

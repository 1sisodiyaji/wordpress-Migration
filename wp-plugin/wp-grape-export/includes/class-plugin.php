<?php
/**
 * Main plugin container.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Singleton that wires up admin UI and REST endpoints and exposes the
 * export runner.
 */
class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Get the singleton.
	 *
	 * @return Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Register hooks.
	 */
	public function init() {
		Rest_Auth::register();

		if ( is_admin() ) {
			( new Admin_Page() )->register();
		}

		add_action(
			'rest_api_init',
			static function () {
				( new Rest\Controller() )->register_routes();
			}
		);
	}

	/**
	 * Run a full export and return the path to the generated ZIP.
	 *
	 * @param array $args Optional export arguments.
	 * @return array{zip:string,url:string,stats:array}
	 */
	public function run_export( array $args = array() ) {
		$job = new Export_Job( $args );
		return $job->run();
	}
}

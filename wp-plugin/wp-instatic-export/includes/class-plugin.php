<?php
/**
 * Plugin bootstrap.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wires admin UI.
 */
class Plugin {

	/**
	 * Register hooks.
	 */
	public function boot() {
		if ( is_admin() ) {
			$admin = new Admin_Page();
			$admin->register();
		}
	}
}

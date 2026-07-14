<?php
/**
 * REST API for programmatic exports (Studio integration).
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport\Rest;

use WpGrapeExport\Plugin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Exposes export endpoints under /wp-json/wp-grape-export/v1.
 */
class Controller {

	const NAMESPACE_V1 = 'wp-grape-export/v1';

	/**
	 * Register REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/ping',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( $this, 'ping' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/whoami',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( $this, 'whoami' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/export',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( $this, 'can_export' ),
				'callback'            => array( $this, 'export' ),
				'args'                => array(
					'post_types' => array(
						'type'     => 'array',
						'required' => false,
						'items'    => array( 'type' => 'string' ),
					),
					'copy_media' => array(
						'type'     => 'boolean',
						'required' => false,
						'default'  => false,
					),
				),
			)
		);
	}

	/**
	 * Permission check for export.
	 *
	 * @return bool|\WP_Error
	 */
	public function can_export() {
		if ( current_user_can( 'manage_options' ) ) {
			return true;
		}
		if ( ! is_user_logged_in() ) {
			$hint = \WpGrapeExport\Rest_Auth::request_has_auth_header()
				? __( 'Credentials were sent but WordPress did not accept them. On live sites you must use an Application Password (Users → Profile → Application Passwords), not your normal login password. Spaces in the app password are optional.', 'wp-grape-export' )
				: __( 'No Authorization header reached WordPress (hosting often strips it). Use HTTPS + an Application Password, or export from wp-admin → Tools → Grape Export and upload the zip.', 'wp-grape-export' );

			return new \WP_Error(
				'rest_not_logged_in',
				$hint,
				array( 'status' => 401 )
			);
		}
		return new \WP_Error(
			'rest_forbidden',
			__( 'The authenticated user must be an Administrator.', 'wp-grape-export' ),
			array( 'status' => 403 )
		);
	}

	/**
	 * Simple availability probe.
	 *
	 * @return \WP_REST_Response
	 */
	public function ping() {
		return rest_ensure_response(
			array(
				'ok'            => true,
				'plugin'        => 'wp-grape-export',
				'version'       => WPGE_VERSION,
				'schemaVersion' => WPGE_SCHEMA_VERSION,
			)
		);
	}

	/**
	 * Auth diagnostic for Studio (safe: no secrets returned).
	 *
	 * @return \WP_REST_Response
	 */
	public function whoami() {
		$user = wp_get_current_user();
		$logged_in = $user && $user->ID > 0;

		return rest_ensure_response(
			array(
				'ok'              => true,
				'authHeaderSeen'  => \WpGrapeExport\Rest_Auth::request_has_auth_header(),
				'loggedIn'        => $logged_in,
				'canExport'       => current_user_can( 'manage_options' ),
				'userLogin'       => $logged_in ? $user->user_login : null,
				'isLocalHost'     => \WpGrapeExport\Rest_Auth::is_local_request(),
				'appPasswordsOn'  => function_exists( 'wp_is_application_passwords_available' )
					? (bool) wp_is_application_passwords_available()
					: null,
			)
		);
	}

	/**
	 * Run an export and return the download URL + stats.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function export( $request ) {
		$post_types = $request->get_param( 'post_types' );
		$copy_media = (bool) $request->get_param( 'copy_media' );

		if ( empty( $post_types ) || ! is_array( $post_types ) ) {
			$post_types = array( 'page', 'post' );
		}
		$post_types = array_map( 'sanitize_key', $post_types );

		try {
			$result = Plugin::instance()->run_export(
				array(
					'post_types' => $post_types,
					'copy_media' => $copy_media,
				)
			);
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'wpge_export_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response(
			array(
				'ok'    => true,
				'url'   => $result['url'],
				'stats' => $result['stats'],
			)
		);
	}
}

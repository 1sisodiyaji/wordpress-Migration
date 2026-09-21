<?php
/**
 * REST authentication helpers.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Restores Basic Authorization headers stripped by many hosts, enables
 * Application Passwords over HTTP on localhost, and accepts regular
 * wp-admin passwords via Basic auth only on local/docker requests.
 */
class Rest_Auth {

	/**
	 * Register filters.
	 */
	public static function register() {
		// Run early so Application Passwords / Basic auth see the header.
		self::restore_authorization_header();

		add_filter( 'wp_is_application_passwords_available', array( __CLASS__, 'allow_app_passwords_on_http' ) );
		add_filter( 'determine_current_user', array( __CLASS__, 'authenticate_basic_local' ), 20 );
	}

	/**
	 * Many Apache/CGI/Nginx setups drop Authorization before PHP sees it.
	 * WordPress Application Passwords need that header for REST Basic auth.
	 */
	public static function restore_authorization_header() {
		if ( ! empty( $_SERVER['HTTP_AUTHORIZATION'] ) || ! empty( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
			if ( empty( $_SERVER['HTTP_AUTHORIZATION'] ) && ! empty( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
				$_SERVER['HTTP_AUTHORIZATION'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
			}
			return;
		}

		$candidates = array(
			'HTTP_AUTHORIZATION',
			'REDIRECT_HTTP_AUTHORIZATION',
			'PHP_AUTH_USER',
		);

		// Authorization passed via rewrite env (Apache).
		if ( function_exists( 'apache_request_headers' ) ) {
			$headers = apache_request_headers();
			if ( is_array( $headers ) ) {
				foreach ( $headers as $key => $value ) {
					if ( 0 === strcasecmp( (string) $key, 'Authorization' ) && is_string( $value ) && '' !== $value ) {
						$_SERVER['HTTP_AUTHORIZATION'] = $value;
						self::hydrate_php_auth( $value );
						return;
					}
				}
			}
		}

		foreach ( $candidates as $key ) {
			if ( empty( $_SERVER[ $key ] ) ) {
				continue;
			}
			if ( 'PHP_AUTH_USER' === $key ) {
				return;
			}
			$_SERVER['HTTP_AUTHORIZATION'] = (string) $_SERVER[ $key ];
			self::hydrate_php_auth( (string) $_SERVER[ $key ] );
			return;
		}
	}

	/**
	 * Populate PHP_AUTH_USER / PHP_AUTH_PW from a Basic Authorization header.
	 *
	 * @param string $header Authorization header value.
	 */
	private static function hydrate_php_auth( $header ) {
		if ( empty( $_SERVER['PHP_AUTH_USER'] ) && 0 === stripos( $header, 'basic ' ) ) {
			$decoded = base64_decode( substr( $header, 6 ), true );
			if ( $decoded && false !== strpos( $decoded, ':' ) ) {
				list( $user, $pass ) = array_pad( explode( ':', $decoded, 2 ), 2, '' );
				$_SERVER['PHP_AUTH_USER'] = $user;
				$_SERVER['PHP_AUTH_PW']   = $pass;
			}
		}
	}

	/**
	 * Allow Application Passwords on HTTP (required for docker localhost).
	 *
	 * @param bool $available Whether app passwords are available.
	 * @return bool
	 */
	public static function allow_app_passwords_on_http( $available ) {
		if ( $available ) {
			return true;
		}
		return self::is_local_request();
	}

	/**
	 * On localhost only, accept HTTP Basic auth with a normal wp-admin password.
	 *
	 * @param int|false $user_id Current user ID.
	 * @return int|false
	 */
	public static function authenticate_basic_local( $user_id ) {
		if ( $user_id ) {
			return $user_id;
		}
		if ( ! self::is_local_request() ) {
			return $user_id;
		}

		$creds = self::basic_credentials();
		if ( ! $creds ) {
			return $user_id;
		}

		$user = wp_authenticate( $creds['username'], $creds['password'] );
		if ( is_wp_error( $user ) ) {
			return $user_id;
		}

		return (int) $user->ID;
	}

	/**
	 * Whether the incoming request targets a local/dev host.
	 *
	 * @return bool
	 */
	public static function is_local_request() {
		$host = isset( $_SERVER['HTTP_HOST'] ) ? strtolower( (string) wp_unslash( $_SERVER['HTTP_HOST'] ) ) : '';
		if ( $host && ( false !== strpos( $host, 'localhost' ) || false !== strpos( $host, '127.0.0.1' ) ) ) {
			return true;
		}

		$addr = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '';
		return in_array( $addr, array( '127.0.0.1', '::1' ), true );
	}

	/**
	 * Whether the request carried an Authorization / Basic auth header.
	 *
	 * @return bool
	 */
	public static function request_has_auth_header() {
		if ( ! empty( $_SERVER['PHP_AUTH_USER'] ) ) {
			return true;
		}
		$header = isset( $_SERVER['HTTP_AUTHORIZATION'] ) ? (string) $_SERVER['HTTP_AUTHORIZATION'] : '';
		if ( '' === $header && ! empty( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
			$header = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
		}
		return '' !== $header;
	}

	/**
	 * Parse HTTP Basic credentials from the request.
	 *
	 * @return array{username:string,password:string}|null
	 */
	private static function basic_credentials() {
		$user = null;
		$pass = null;

		if ( isset( $_SERVER['PHP_AUTH_USER'] ) ) {
			$user = (string) wp_unslash( $_SERVER['PHP_AUTH_USER'] );
			$pass = isset( $_SERVER['PHP_AUTH_PW'] ) ? (string) wp_unslash( $_SERVER['PHP_AUTH_PW'] ) : '';
		} elseif ( isset( $_SERVER['HTTP_AUTHORIZATION'] ) ) {
			$header = (string) wp_unslash( $_SERVER['HTTP_AUTHORIZATION'] );
			if ( 0 === stripos( $header, 'basic ' ) ) {
				$decoded = base64_decode( substr( $header, 6 ), true );
				if ( $decoded && false !== strpos( $decoded, ':' ) ) {
					list( $user, $pass ) = array_pad( explode( ':', $decoded, 2 ), 2, '' );
				}
			}
		}

		if ( ! $user || '' === $pass ) {
			return null;
		}

		return array(
			'username' => $user,
			'password' => $pass,
		);
	}
}

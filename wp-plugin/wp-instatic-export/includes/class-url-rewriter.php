<?php
/**
 * Rewrite absolute site URLs to zip-relative / root-relative paths.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * URL rewriting helpers.
 */
class Url_Rewriter {

	/** @var string */
	private $home;

	/** @var string */
	private $home_host;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->home      = untrailingslashit( home_url() );
		$parts           = wp_parse_url( home_url( '/' ) );
		$this->home_host = isset( $parts['host'] ) ? strtolower( $parts['host'] ) : '';
	}

	/**
	 * Whether a URL points at this WordPress site.
	 *
	 * @param string $url Absolute or protocol-relative URL.
	 * @return bool
	 */
	public function is_local_url( $url ) {
		$url = trim( $url );
		if ( '' === $url || 0 === strpos( $url, 'data:' ) || 0 === strpos( $url, '#' ) || 0 === strpos( $url, 'mailto:' ) || 0 === strpos( $url, 'tel:' ) ) {
			return false;
		}
		if ( 0 === strpos( $url, '//' ) ) {
			$url = 'https:' . $url;
		}
		if ( 0 === strpos( $url, '/' ) && 0 !== strpos( $url, '//' ) ) {
			return true;
		}
		$parts = wp_parse_url( $url );
		if ( empty( $parts['host'] ) ) {
			return true;
		}
		return strtolower( $parts['host'] ) === $this->home_host;
	}

	/**
	 * Normalize any local URL to a site path key starting without leading slash, e.g. wp-content/uploads/a.png
	 *
	 * @param string $url URL.
	 * @return string|null Path key or null if external.
	 */
	public function to_site_path_key( $url ) {
		$url = html_entity_decode( trim( $url ), ENT_QUOTES );
		if ( ! $this->is_local_url( $url ) ) {
			return null;
		}
		if ( 0 === strpos( $url, '//' ) ) {
			$url = 'https:' . $url;
		}
		if ( 0 === strpos( $url, '/' ) && 0 !== strpos( $url, '//' ) ) {
			$path = $url;
		} else {
			$path = wp_make_link_relative( $url );
			if ( 0 === strpos( $url, $this->home ) ) {
				$path = substr( $url, strlen( $this->home ) );
			}
		}
		$path = preg_replace( '#\?.*$#', '', (string) $path );
		$path = preg_replace( '#\#.*$#', '', (string) $path );
		$path = ltrim( rawurldecode( $path ), '/' );
		if ( '' === $path ) {
			return null;
		}
		return $path;
	}

	/**
	 * Map site path key into zip layout under assets/.
	 *
	 * @param string $site_path e.g. wp-content/themes/x/style.css
	 * @return string e.g. assets/wp-content/themes/x/style.css
	 */
	public function to_zip_asset_path( $site_path ) {
		$site_path = ltrim( str_replace( '\\', '/', $site_path ), '/' );
		if ( 0 === strpos( $site_path, 'assets/' ) ) {
			return $site_path;
		}
		return 'assets/' . $site_path;
	}

	/**
	 * Compute relative href from an HTML page path to an asset zip path.
	 *
	 * @param string $page_file Zip path of the HTML file (e.g. about/index.html).
	 * @param string $asset_file Zip path of the asset (e.g. assets/css/a.css).
	 * @return string Relative URL.
	 */
	public function relative_href( $page_file, $asset_file ) {
		$page_dir = str_replace( '\\', '/', dirname( $page_file ) );
		if ( '.' === $page_dir ) {
			$page_dir = '';
		}
		$from = array_values( array_filter( explode( '/', $page_dir ), 'strlen' ) );
		$to   = array_values( array_filter( explode( '/', str_replace( '\\', '/', $asset_file ) ), 'strlen' ) );

		while ( $from && $to && $from[0] === $to[0] ) {
			array_shift( $from );
			array_shift( $to );
		}
		$prefix = str_repeat( '../', count( $from ) );
		return $prefix . implode( '/', $to );
	}
}

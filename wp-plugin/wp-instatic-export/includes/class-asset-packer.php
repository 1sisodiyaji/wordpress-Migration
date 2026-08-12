<?php
/**
 * Collect local assets referenced by HTML/CSS and copy into the staging tree.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Asset packer.
 */
class Asset_Packer {

	/** @var Url_Rewriter */
	private $rewriter;

	/** @var string Absolute staging directory. */
	private $staging;

	/** @var array<string,string> site_path_key => zip_asset_path */
	private $map = array();

	/** @var string[] */
	private $missing = array();

	/**
	 * @param Url_Rewriter $rewriter Rewriter.
	 * @param string       $staging  Staging dir.
	 */
	public function __construct( Url_Rewriter $rewriter, $staging ) {
		$this->rewriter = $rewriter;
		$this->staging  = rtrim( $staging, '/\\' );
	}

	/**
	 * @return array<string,string>
	 */
	public function map() {
		return $this->map;
	}

	/**
	 * @return string[]
	 */
	public function missing() {
		return $this->missing;
	}

	/**
	 * Ensure a local URL is copied into staging and return its zip path.
	 *
	 * @param string $url Absolute, root-relative, or protocol-relative URL.
	 * @return string|null Zip path or null if external/unresolvable.
	 */
	public function pack_url( $url ) {
		$key = $this->rewriter->to_site_path_key( $url );
		if ( null === $key ) {
			return null;
		}
		if ( isset( $this->map[ $key ] ) ) {
			return $this->map[ $key ];
		}

		$abs = $this->resolve_filesystem_path( $key );
		$zip = $this->rewriter->to_zip_asset_path( $key );

		if ( ! $abs || ! is_readable( $abs ) || is_dir( $abs ) ) {
			// Try downloading once (CDN-style local host, optimized images, etc.).
			$abs_url = $this->absolutize( $url );
			$tmp     = $this->download_to_temp( $abs_url );
			if ( ! $tmp ) {
				$this->missing[] = $key;
				return null;
			}
			$this->write_file( $zip, file_get_contents( $tmp ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			$this->map[ $key ] = $zip;
			return $zip;
		}

		$this->copy_file( $abs, $zip );
		$this->map[ $key ] = $zip;
		return $zip;
	}

	/**
	 * Rewrite url(...) references inside a CSS string, packing nested assets.
	 *
	 * @param string $css        CSS text.
	 * @param string $css_zip    Zip path of this CSS file (for relative resolution context of original — unused after pack).
	 * @param string $from_page  Optional page zip path when inlining — not used for file CSS.
	 * @return string
	 */
	public function rewrite_css( $css, $css_zip = '', $from_page = '' ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter
		return preg_replace_callback(
			'/url\(\s*([\'"]?)([^\'")]+)\1\s*\)/i',
			function ( $m ) use ( $css_zip ) {
				$raw = trim( $m[2] );
				if ( '' === $raw || 0 === stripos( $raw, 'data:' ) || 0 === strpos( $raw, '#' ) ) {
					return $m[0];
				}
				// Resolve relative url() against original CSS location on the site when possible.
				$candidate = $raw;
				if ( 0 !== strpos( $raw, '/' ) && ! preg_match( '#^(https?:)?//#i', $raw ) && $css_zip ) {
					// css zip is assets/.../file.css → derive site-relative dir for joining.
					$site_css = preg_replace( '#^assets/#', '', $css_zip );
					$dir      = trailingslashit( dirname( $site_css ) );
					$candidate = $dir . $raw;
					while ( false !== strpos( $candidate, '../' ) ) {
						$candidate = preg_replace( '#[^/]+/\.\./#', '', $candidate, 1 );
					}
					$candidate = '/' . ltrim( $candidate, '/' );
				}
				$packed = $this->pack_url( $candidate );
				if ( ! $packed ) {
					return $m[0];
				}
				if ( $css_zip ) {
					$rel = ( new Url_Rewriter() )->relative_href( $css_zip, $packed );
					return 'url(' . $m[1] . $rel . $m[1] . ')';
				}
				return 'url(' . $m[1] . '/' . ltrim( $packed, '/' ) . $m[1] . ')';
			},
			$css
		);
	}

	/**
	 * @param string $url URL.
	 * @return string
	 */
	private function absolutize( $url ) {
		$url = trim( $url );
		if ( 0 === strpos( $url, '//' ) ) {
			return ( is_ssl() ? 'https:' : 'http:' ) . $url;
		}
		if ( 0 === strpos( $url, '/' ) ) {
			return home_url( $url );
		}
		return $url;
	}

	/**
	 * @param string $site_path_key Path key.
	 * @return string|null Absolute filesystem path.
	 */
	private function resolve_filesystem_path( $site_path_key ) {
		$site_path_key = ltrim( str_replace( '\\', '/', $site_path_key ), '/' );
		$abs           = trailingslashit( ABSPATH ) . str_replace( '/', DIRECTORY_SEPARATOR, $site_path_key );
		if ( is_readable( $abs ) ) {
			return $abs;
		}
		// Uploads may live outside ABSPATH.
		$uploads = wp_upload_dir();
		if ( empty( $uploads['error'] ) && 0 === strpos( $site_path_key, 'wp-content/uploads/' ) ) {
			$rel = substr( $site_path_key, strlen( 'wp-content/uploads/' ) );
			$try = trailingslashit( $uploads['basedir'] ) . str_replace( '/', DIRECTORY_SEPARATOR, $rel );
			if ( is_readable( $try ) ) {
				return $try;
			}
		}
		return null;
	}

	/**
	 * @param string $url Absolute URL.
	 * @return string|null Temp file path.
	 */
	private function download_to_temp( $url ) {
		$response = wp_remote_get(
			$url,
			array(
				'timeout'   => 60,
				'sslverify' => apply_filters( 'wpie_sslverify', false ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return null;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 400 ) {
			return null;
		}
		$body = wp_remote_retrieve_body( $response );
		if ( '' === $body ) {
			return null;
		}
		$tmp = wp_tempnam( 'wpie-asset' );
		if ( ! $tmp ) {
			return null;
		}
		file_put_contents( $tmp, $body ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		return $tmp;
	}

	/**
	 * @param string $abs Absolute source.
	 * @param string $zip Relative zip path.
	 */
	private function copy_file( $abs, $zip ) {
		$dest = $this->staging . '/' . str_replace( '\\', '/', $zip );
		$dir  = dirname( $dest );
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		if ( ! file_exists( $dest ) ) {
			copy( $abs, $dest ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_copy
		}
	}

	/**
	 * @param string $zip  Zip path.
	 * @param string $data Binary/text.
	 */
	private function write_file( $zip, $data ) {
		$dest = $this->staging . '/' . str_replace( '\\', '/', $zip );
		$dir  = dirname( $dest );
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		file_put_contents( $dest, $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}
}

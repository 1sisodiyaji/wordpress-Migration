<?php
/**
 * Fetch live front-end HTML and extract layout / content regions.
 *
 * Used when Elementor Theme Builder templates are absent (Neve, classic themes,
 * Gutenberg) so header/footer and plugin-rendered page bodies still export.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * HTTP capture helpers for theme chrome and page content slots.
 */
class Front_Html {

	/**
	 * Fetch HTML for a public URL (home or permalink).
	 *
	 * @param string $url Absolute URL.
	 * @return string|null
	 */
	public static function fetch( $url ) {
		$url = (string) $url;
		if ( '' === $url ) {
			return null;
		}

		$path = wp_parse_url( $url, PHP_URL_PATH );
		$path = is_string( $path ) && '' !== $path ? $path : '/';
		if ( '/' !== substr( $path, -1 ) && ! preg_match( '/\.[a-z0-9]+$/i', $path ) ) {
			// Pretty permalinks often 301 to the trailing-slash form.
			$path_slash = trailingslashit( $path );
		} else {
			$path_slash = $path;
		}

		$candidates = array_unique(
			array_filter(
				array(
					// Prefer in-network host (Docker). Never follow redirects to host-only localhost:5001.
					'http://fresh_wordpress' . $path,
					'http://fresh_wordpress' . $path_slash,
					'http://wordpress' . $path,
					home_url( $path ),
					site_url( $path ),
					$url,
					'http://localhost:5001' . $path,
					'http://127.0.0.1:5001' . $path,
				)
			)
		);

		foreach ( $candidates as $candidate ) {
			$host_header = null;
			if ( preg_match( '#^https?://fresh_wordpress#i', $candidate ) || preg_match( '#^https?://wordpress/#i', $candidate ) ) {
				// Keep WP from canonical-redirecting to http://localhost:5001/… (unreachable from CLI containers).
				$host_header = 'localhost:5001';
			}

			$args = array(
				'timeout'     => 45,
				'redirection' => 0,
				'sslverify'   => false,
				'headers'     => array(
					'Accept' => 'text/html',
				),
			);
			if ( $host_header ) {
				$args['headers']['Host'] = $host_header;
			}

			$response = wp_remote_get( $candidate, $args );
			if ( is_wp_error( $response ) ) {
				continue;
			}
			$code = (int) wp_remote_retrieve_response_code( $response );
			$body = (string) wp_remote_retrieve_body( $response );

			// Follow one internal redirect, rewriting localhost → fresh_wordpress.
			if ( in_array( $code, array( 301, 302, 303, 307, 308 ), true ) ) {
				$loc = wp_remote_retrieve_header( $response, 'location' );
				if ( is_array( $loc ) ) {
					$loc = $loc[0] ?? '';
				}
				$loc = (string) $loc;
				if ( $loc ) {
					$loc_path = wp_parse_url( $loc, PHP_URL_PATH );
					$loc_path = is_string( $loc_path ) && '' !== $loc_path ? $loc_path : '/';
					$retry    = 'http://fresh_wordpress' . $loc_path;
					$response = wp_remote_get(
						$retry,
						array(
							'timeout'     => 45,
							'redirection' => 0,
							'sslverify'   => false,
							'headers'     => array(
								'Accept' => 'text/html',
								'Host'   => 'localhost:5001',
							),
						)
					);
					if ( is_wp_error( $response ) ) {
						continue;
					}
					$code = (int) wp_remote_retrieve_response_code( $response );
					$body = (string) wp_remote_retrieve_body( $response );
				}
			}

			if ( $code >= 200 && $code < 400 && strlen( $body ) > 200 && false !== stripos( $body, '<html' ) ) {
				return $body;
			}
		}

		return null;
	}

	/**
	 * Extract the site header markup from a full HTML document.
	 *
	 * @param string $html Full page HTML.
	 * @return string
	 */
	public static function extract_header( $html ) {
		$html = (string) $html;
		$patterns = array(
			'/<header\b[^>]*class="[^"]*\bheader\b[^"]*"[^>]*>.*?<\/header>/is',
			'/<header\b[^>]*id="[^"]*header[^"]*"[^>]*>.*?<\/header>/is',
			'/<header\b[^>]*>.*?<\/header>/is',
		);
		foreach ( $patterns as $pattern ) {
			if ( preg_match( $pattern, $html, $m ) ) {
				return trim( $m[0] );
			}
		}
		return '';
	}

	/**
	 * Extract the site footer markup from a full HTML document.
	 *
	 * @param string $html Full page HTML.
	 * @return string
	 */
	public static function extract_footer( $html ) {
		$html = (string) $html;
		$patterns = array(
			'/<footer\b[^>]*class="[^"]*\bsite-footer\b[^"]*"[^>]*>.*?<\/footer>/is',
			'/<footer\b[^>]*id="[^"]*site-footer[^"]*"[^>]*>.*?<\/footer>/is',
			'/<footer\b[^>]*>.*?<\/footer>/is',
		);
		foreach ( $patterns as $pattern ) {
			if ( preg_match( $pattern, $html, $m ) ) {
				return trim( $m[0] );
			}
		}
		return '';
	}

	/**
	 * Extract the main content slot (Neve entry-content / main).
	 *
	 * @param string $html Full page HTML.
	 * @return string
	 */
	public static function extract_content( $html ) {
		$html = (string) $html;

		if ( preg_match( '/<div\b[^>]*class="[^"]*\bnv-content-wrap\b[^"]*entry-content[^"]*"[^>]*>(.*?)<\/div>/is', $html, $m ) ) {
			$inner = trim( $m[1] );
			if ( '' !== $inner ) {
				return $inner;
			}
		}
		if ( preg_match( '/<div\b[^>]*class="[^"]*\bentry-content\b[^"]*"[^>]*>(.*?)<\/div>/is', $html, $m ) ) {
			$inner = trim( $m[1] );
			if ( '' !== $inner ) {
				return $inner;
			}
		}
		if ( preg_match( '/<main\b[^>]*>(.*?)<\/main>/is', $html, $m ) ) {
			$inner = trim( $m[1] );
			// Strip Neve wrapper chrome when possible.
			if ( preg_match( '/class="[^"]*\bentry-content\b[^"]*"[^>]*>(.*?)<\/div>/is', $inner, $m2 ) ) {
				$slot = trim( $m2[1] );
				if ( '' !== $slot ) {
					return $slot;
				}
			}
			return $inner;
		}

		return '';
	}

	/**
	 * Whether rendered content looks empty / unresolved and needs a live crawl.
	 *
	 * @param string $html Rendered HTML from the_content / shortcodes.
	 * @return bool
	 */
	public static function needs_live_content( $html ) {
		$html = trim( (string) $html );
		if ( '' === $html ) {
			return true;
		}
		// Unresolved shortcodes only.
		$stripped = preg_replace( '/\[[^\]]+\]/', '', $html );
		$stripped = trim( wp_strip_all_tags( (string) $stripped ) );
		if ( '' === $stripped ) {
			return true;
		}
		// Tiny stubs ("Content coming soon.") still look "done" but aren't real pages.
		if ( strlen( $stripped ) < 80 || preg_match( '/content coming soon|coming soon|lorem ipsum/i', $stripped ) ) {
			return true;
		}
		if ( strlen( $html ) < 40 && false !== strpos( $html, '[' ) ) {
			return true;
		}
		return false;
	}

	/**
	 * Extract a posts archive / blog index region from a full HTML document.
	 *
	 * @param string $html Full page HTML.
	 * @return string
	 */
	public static function extract_posts_index( $html ) {
		$html = (string) $html;

		if ( preg_match( '/<div\b[^>]*class="[^"]*\bnv-index-posts\b[^"]*"[^>]*>/i', $html, $m, PREG_OFFSET_CAPTURE ) ) {
			$start = (int) $m[0][1];
			$chunk = self::extract_balanced_div( $html, $start );
			if ( $chunk && strlen( $chunk ) > 200 ) {
				return $chunk;
			}
		}

		if ( preg_match( '/<div\b[^>]*class="[^"]*\bposts-wrapper\b[^"]*"[^>]*>/i', $html, $m, PREG_OFFSET_CAPTURE ) ) {
			$start = (int) $m[0][1];
			$chunk = self::extract_balanced_div( $html, $start );
			if ( $chunk && strlen( $chunk ) > 200 ) {
				return $chunk;
			}
		}

		if ( preg_match( '/<main\b[^>]*>(.*?)<\/main>/is', $html, $m ) ) {
			$inner = trim( $m[1] );
			if ( strlen( $inner ) > 200 && ( false !== stripos( $inner, 'blog-entry' ) || false !== stripos( $inner, 'entry-title' ) ) ) {
				return $inner;
			}
		}

		return self::extract_content( $html );
	}

	/**
	 * Slice a balanced <div>…</div> starting at $start (index of "<div").
	 *
	 * @param string $html  Full HTML.
	 * @param int    $start Offset of opening <div.
	 * @return string
	 */
	private static function extract_balanced_div( $html, $start ) {
		$len   = strlen( $html );
		$depth = 0;
		$i     = $start;
		while ( $i < $len ) {
			$next_open  = stripos( $html, '<div', $i );
			$next_close = stripos( $html, '</div>', $i );
			if ( false === $next_close ) {
				break;
			}
			if ( false !== $next_open && $next_open < $next_close ) {
				++$depth;
				$i = $next_open + 4;
				continue;
			}
			--$depth;
			$i = $next_close + 6;
			if ( 0 === $depth ) {
				return trim( substr( $html, $start, $i - $start ) );
			}
		}
		return '';
	}
}

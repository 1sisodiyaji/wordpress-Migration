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

		$home_parts  = wp_parse_url( home_url( '/' ) );
		$public_host = isset( $home_parts['host'] ) ? (string) $home_parts['host'] : 'localhost';
		$public_port = isset( $home_parts['port'] ) ? (int) $home_parts['port'] : 0;
		$public_hdr  = $public_port > 0 ? $public_host . ':' . $public_port : $public_host;

		$candidates = array_unique(
			array_filter(
				array(
					// Inside Docker the site listens on :80; Host must stay the public URL.
					'http://127.0.0.1' . $path,
					'http://127.0.0.1' . $path_slash,
					'http://localhost' . $path,
					'http://localhost' . $path_slash,
					// Prefer in-network host (Docker). Never follow redirects to host-only localhost:5001.
					'http://fresh_wordpress' . $path,
					'http://fresh_wordpress' . $path_slash,
					'http://wordpress' . $path,
					home_url( $path ),
					site_url( $path ),
					$url,
					'http://localhost:5001' . $path,
					'http://127.0.0.1:5001' . $path,
					'http://localhost:4000' . $path,
					'http://127.0.0.1:4000' . $path,
				)
			)
		);

		foreach ( $candidates as $candidate ) {
			$host_header = null;
			if ( preg_match( '#^https?://(127\.0\.0\.1|localhost)(/|$)#i', $candidate ) ) {
				$host_header = $public_hdr;
			} elseif ( preg_match( '#^https?://fresh_wordpress#i', $candidate ) || preg_match( '#^https?://wordpress/#i', $candidate ) ) {
				// Keep WP from canonical-redirecting to a host-only URL unreachable from CLI.
				$host_header = $public_hdr;
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
	 * Extract the main content slot (Neve entry-content / FSE page body / classic #content).
	 *
	 * Block themes often place hero/banner patterns BETWEEN the header
	 * template-part and <main> (e.g. wellness-center front-page). Prefer the
	 * chrome-stripped FSE tree so those sections export into the page body.
	 *
	 * Classic themes (Abiz / Techboost frontpage): content lives in
	 * `#content.abiz-theme-data` between get_header() and get_footer(), often
	 * filled by a companion plugin action (e.g. daddy_plus_abiz_frontpage).
	 *
	 * @param string $html Full page HTML.
	 * @return string
	 */
	public static function extract_content( $html ) {
		$html = (string) $html;

		// Elementor full-page canvas (must beat empty classic .entry-content stubs).
		$elementor = self::extract_elementor_content( $html );
		if ( '' !== $elementor ) {
			return $elementor;
		}

		// Block themes (FSE): designed homepage lives in wp-site-blocks.
		if ( preg_match( '/<div\b[^>]*class="[^"]*\bwp-site-blocks\b[^"]*"[^>]*>/i', $html, $m, PREG_OFFSET_CAPTURE ) ) {
			$chunk = self::extract_balanced_div( $html, (int) $m[0][1] );
			if ( $chunk && strlen( wp_strip_all_tags( $chunk ) ) > 40 ) {
				// Keep everything between header/footer template parts — including
				// patterns that sit outside <main> (hero / banner sections).
				$stripped = self::strip_fse_chrome( $chunk );
				if ( $stripped && strlen( wp_strip_all_tags( $stripped ) ) > 40 ) {
					// Unwrap a lone <main> so its sections sit alongside outer patterns
					// (banner + pricing + …) as peer content for the converter.
					return self::unwrap_lone_main( $stripped );
				}
				// Fallback: <main> only (classic FSE posts with no outer patterns).
				if ( preg_match( '/<main\b[^>]*>/i', $chunk, $main_m, PREG_OFFSET_CAPTURE ) ) {
					$main = self::extract_balanced_element( $chunk, (int) $main_m[0][1], 'main' );
					if ( $main ) {
						$inner = self::inner_html( $main );
						if ( $inner && strlen( wp_strip_all_tags( $inner ) ) > 20 ) {
							return $inner;
						}
						return $main;
					}
				}
				return $chunk;
			}
		}

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

		// Classic themes: primary content wrappers (Abiz `#content.abiz-theme-data`, etc.).
		$classic = self::extract_classic_content( $html );
		if ( '' !== $classic ) {
			return $classic;
		}

		return '';
	}

	/**
	 * Elementor page body — prefer the data-elementor-type=wp-page / single canvas.
	 *
	 * @param string $html Full page HTML.
	 * @return string
	 */
	private static function extract_elementor_content( $html ) {
		$html = (string) $html;
		if ( false === stripos( $html, 'elementor' ) ) {
			return '';
		}

		$open_patterns = array(
			'/<div\b[^>]*data-elementor-type=["\'](?:wp-page|page|wp-post)["\'][^>]*>/i',
			'/<div\b[^>]*class="[^"]*\belementor\b[^"]*\belementor-\d+\b[^"]*"[^>]*>/i',
			'/<div\b[^>]*class="[^"]*\belementor\b[^"]*"[^>]*data-elementor-id=/i',
		);

		foreach ( $open_patterns as $pattern ) {
			if ( ! preg_match( $pattern, $html, $m, PREG_OFFSET_CAPTURE ) ) {
				continue;
			}
			$chunk = self::extract_balanced_div( $html, (int) $m[0][1] );
			if ( ! $chunk ) {
				continue;
			}
			$text = trim( wp_strip_all_tags( $chunk ) );
			if ( strlen( $text ) > 40 || preg_match( '/elementor-section|elementor-element|e-con/i', $chunk ) ) {
				return trim( $chunk );
			}
		}

		return '';
	}

	/**
	 * Classic / hybrid theme content slot (Abiz, Astra-like shells, Bootstrap themes).
	 *
	 * @param string $html Full page HTML.
	 * @return string
	 */
	private static function extract_classic_content( $html ) {
		$html = (string) $html;

		$open_patterns = array(
			'/<div\b[^>]*\bid=["\']content["\'][^>]*>/i',
			'/<div\b[^>]*class="[^"]*\babiz-theme-data\b[^"]*"[^>]*>/i',
			'/<div\b[^>]*class="[^"]*\bsite-content\b[^"]*"[^>]*>/i',
			'/<div\b[^>]*\bid=["\']primary["\'][^>]*>/i',
			'/<div\b[^>]*class="[^"]*\bcontent-area\b[^"]*"[^>]*>/i',
			'/<div\b[^>]*class="[^"]*\bsite-main\b[^"]*"[^>]*>/i',
			'/<div\b[^>]*\bid=["\']page["\'][^>]*>/i',
			'/<div\b[^>]*class="[^"]*\bast-container\b[^"]*"[^>]*>/i',
			'/<div\b[^>]*class="[^"]*\btheme-content\b[^"]*"[^>]*>/i',
		);

		foreach ( $open_patterns as $pattern ) {
			if ( ! preg_match( $pattern, $html, $m, PREG_OFFSET_CAPTURE ) ) {
				continue;
			}
			$chunk = self::extract_balanced_div( $html, (int) $m[0][1] );
			if ( ! $chunk ) {
				continue;
			}
			$inner = self::inner_html( $chunk );
			$text  = trim( wp_strip_all_tags( (string) $inner ) );
			// Real homepage modules (slider/sections) or substantial copy.
			if ( strlen( $text ) > 40 || preg_match( '/<(section|article|div)\b/i', (string) $inner ) ) {
				return trim( (string) $inner );
			}
		}

		// Last resort: everything between the first </header> and the first <footer.
		if ( preg_match( '/<\/header\s*>/i', $html, $hm, PREG_OFFSET_CAPTURE ) ) {
			$start = (int) $hm[0][1] + strlen( $hm[0][0] );
			if ( preg_match( '/<footer\b/i', $html, $fm, PREG_OFFSET_CAPTURE ) ) {
				$end = (int) $fm[0][1];
				if ( $end > $start ) {
					$mid = trim( substr( $html, $start, $end - $start ) );
					// Drop the Abiz content wrapper open/close if present but empty of siblings.
					$mid = preg_replace( '/^<div\b[^>]*\bid=["\']content["\'][^>]*>/i', '', $mid );
					$mid = preg_replace( '/<\/div>\s*$/i', '', (string) $mid );
					$mid = trim( (string) $mid );
					if ( strlen( wp_strip_all_tags( $mid ) ) > 40 || preg_match( '/<(section|article|div)\b/i', $mid ) ) {
						return $mid;
					}
				}
			}
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
		// Markup with almost no structure (single empty wrapper) — prefer live crawl.
		$structure = preg_match_all( '/<(section|article|div|img|h[1-6]|p)\b/i', $html );
		if ( $structure < 2 && strlen( $stripped ) < 200 ) {
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
		return self::extract_balanced_element( $html, $start, 'div' );
	}

	/**
	 * Slice a balanced element starting at $start (index of opening "<tag").
	 *
	 * @param string $html  Full HTML.
	 * @param int    $start Offset of opening tag.
	 * @param string $tag   Tag name (lowercase).
	 * @return string
	 */
	private static function extract_balanced_element( $html, $start, $tag ) {
		$tag   = strtolower( (string) $tag );
		$len   = strlen( $html );
		$depth = 0;
		$i     = $start;
		$open  = '<' . $tag;
		$close = '</' . $tag . '>';
		$close_len = strlen( $close );
		while ( $i < $len ) {
			$next_open  = stripos( $html, $open, $i );
			$next_close = stripos( $html, $close, $i );
			if ( false === $next_close ) {
				break;
			}
			// Ensure next_open is a real tag boundary (not <mainx).
			if ( false !== $next_open && $next_open < $next_close ) {
				$after = $next_open + strlen( $open );
				$ch    = $after < $len ? $html[ $after ] : '';
				if ( '>' === $ch || ctype_space( $ch ) || '/' === $ch ) {
					++$depth;
					$i = $after;
					continue;
				}
				$i = $after;
				continue;
			}
			--$depth;
			$i = $next_close + $close_len;
			if ( 0 === $depth ) {
				return trim( substr( $html, $start, $i - $start ) );
			}
		}
		return '';
	}

	/**
	 * Inner HTML of a balanced element string.
	 *
	 * @param string $element Full element markup.
	 * @return string
	 */
	private static function inner_html( $element ) {
		$element = (string) $element;
		if ( ! preg_match( '/^<[^>]+>/', $element, $m ) ) {
			return $element;
		}
		$close = strrpos( $element, '</' );
		if ( false === $close || $close <= strlen( $m[0] ) ) {
			return '';
		}
		return trim( substr( $element, strlen( $m[0] ), $close - strlen( $m[0] ) ) );
	}

	/**
	 * If markup is "outer siblings + one <main>…</main>", replace that main with
	 * its children so FSE patterns outside main stay peers of sections inside it.
	 *
	 * @param string $html Chrome-stripped FSE body.
	 * @return string
	 */
	private static function unwrap_lone_main( $html ) {
		$html = trim( (string) $html );
		if ( ! preg_match( '/<main\b[^>]*>/i', $html, $m, PREG_OFFSET_CAPTURE ) ) {
			return $html;
		}
		$start = (int) $m[0][1];
		$main  = self::extract_balanced_element( $html, $start, 'main' );
		if ( ! $main ) {
			return $html;
		}
		$inner = self::inner_html( $main );
		if ( '' === trim( (string) $inner ) ) {
			return $html;
		}
		return trim( substr( $html, 0, $start ) . $inner . substr( $html, $start + strlen( $main ) ) );
	}

	/**
	 * Remove FSE header/footer template parts from a wp-site-blocks chunk.
	 *
	 * @param string $html FSE markup.
	 * @return string
	 */
	private static function strip_fse_chrome( $html ) {
		$html = (string) $html;
		$patterns = array(
			'/<header\b[^>]*class="[^"]*\bwp-block-template-part\b[^"]*"[^>]*>/i',
			'/<footer\b[^>]*class="[^"]*\bwp-block-template-part\b[^"]*"[^>]*>/i',
			'/<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>/i',
			'/<footer\b[^>]*class="[^"]*\bsite-footer\b[^"]*"[^>]*>/i',
		);
		foreach ( $patterns as $pattern ) {
			for ( $n = 0; $n < 10; $n++ ) {
				if ( ! preg_match( $pattern, $html, $m, PREG_OFFSET_CAPTURE ) ) {
					break;
				}
				$start = (int) $m[0][1];
				$tag   = strtolower( preg_replace( '/^<([a-z]+).*/i', '$1', $m[0][0] ) );
				$el    = self::extract_balanced_element( $html, $start, $tag );
				if ( ! $el ) {
					break;
				}
				$html = substr( $html, 0, $start ) . substr( $html, $start + strlen( $el ) );
			}
		}
		return trim( $html );
	}

	/**
	 * Extract SVG filter defs with wp-duotone-* ids from front HTML.
	 * These are required for .wp-duotone-* site logos (white/black etc.).
	 *
	 * @param string $html Full front-page HTML.
	 * @return string Concatenated SVG markup (may be empty).
	 */
	public static function extract_duotone_svgs( $html ) {
		$html = (string) $html;
		if ( '' === $html || false === stripos( $html, 'wp-duotone' ) ) {
			return '';
		}
		$out = '';
		if ( preg_match_all( '/<svg\b[^>]*>[\s\S]*?<\/svg>/i', $html, $matches ) ) {
			foreach ( $matches[0] as $svg ) {
				if ( false !== stripos( $svg, 'wp-duotone' ) ) {
					$out .= $svg . "\n";
				}
			}
		}
		return trim( $out );
	}

	/**
	 * Pull --wp--preset--duotone--* custom properties from printed global-styles.
	 *
	 * @param string $html Full front-page HTML.
	 * @return string CSS block for :root (may be empty).
	 */
	public static function extract_duotone_css_vars( $html ) {
		$html = (string) $html;
		$vars = array();
		if ( preg_match_all(
			'/--wp--preset--duotone--([a-z0-9-]+)\s*:\s*([^;}+]+);/i',
			$html,
			$matches,
			PREG_SET_ORDER
		) ) {
			foreach ( $matches as $m ) {
				$slug = strtolower( $m[1] );
				$vars[ $slug ] = trim( $m[2] );
			}
		}
		if ( empty( $vars ) ) {
			return '';
		}
		$lines = array( '/* Duotone presets captured from front HTML */', ':root {' );
		foreach ( $vars as $slug => $value ) {
			$lines[] = sprintf( '  --wp--preset--duotone--%s: %s;', $slug, $value );
		}
		$lines[] = '}';
		return implode( "\n", $lines );
	}
}

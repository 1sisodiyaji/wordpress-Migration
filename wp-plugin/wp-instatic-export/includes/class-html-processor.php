<?php
/**
 * Rewrite rendered HTML so assets and internal links use zip-relative paths.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * HTML processor.
 */
class Html_Processor {

	/** @var Url_Rewriter */
	private $rewriter;

	/** @var Asset_Packer */
	private $packer;

	/** @var array<string,string> path (with trailing slash for dirs) => page zip file */
	private $route_files;

	/**
	 * @param Url_Rewriter         $rewriter    Rewriter.
	 * @param Asset_Packer         $packer      Packer.
	 * @param array<string,string> $route_files Map of URL path => zip html path.
	 */
	public function __construct( Url_Rewriter $rewriter, Asset_Packer $packer, array $route_files ) {
		$this->rewriter    = $rewriter;
		$this->packer      = $packer;
		$this->route_files = $route_files;
	}

	/**
	 * Process a full HTML document for a given page zip path.
	 *
	 * @param string $html      Source HTML.
	 * @param string $page_file e.g. about/index.html.
	 * @return string
	 */
	public function process( $html, $page_file ) {
		$html = $this->strip_admin_artifacts( $html );
		$html = $this->rewrite_srcset( $html, $page_file );
		$html = $this->rewrite_attr( $html, 'src', $page_file, true );
		$html = $this->rewrite_attr( $html, 'href', $page_file, false );
		$html = $this->rewrite_attr( $html, 'poster', $page_file, true );
		$html = $this->rewrite_attr( $html, 'data-src', $page_file, true );
		$html = $this->rewrite_attr( $html, 'data-lazy-src', $page_file, true );
		$html = $this->rewrite_style_urls( $html, $page_file );
		$html = $this->rewrite_inline_stylesheets( $html, $page_file );
		return $html;
	}

	/**
	 * @param string $html HTML.
	 * @return string
	 */
	private function strip_admin_artifacts( $html ) {
		$html = preg_replace( '#<script[^>]*>[^<]*admin-bar[^<]*</script>#i', '', $html );
		$html = preg_replace( '#<link[^>]+id=[\'"]admin-bar[^\>]*>#i', '', $html );
		$html = preg_replace( '#\s*id=[\'"]wpadminbar[\'"][^>]*>.*?</div>#is', '>', $html );
		return $html;
	}

	/**
	 * @param string $html HTML.
	 * @param string $attr Attribute name.
	 * @param string $page_file Page zip path.
	 * @param bool   $force_asset Treat as asset even if HTML link.
	 * @return string
	 */
	private function rewrite_attr( $html, $attr, $page_file, $force_asset ) {
		$pattern = '/\s' . preg_quote( $attr, '/' ) . '\s*=\s*(["\'])([^"\']+)\1/i';
		return preg_replace_callback(
			$pattern,
			function ( $m ) use ( $page_file, $force_asset, $attr ) {
				$quote = $m[1];
				$url   = html_entity_decode( $m[2], ENT_QUOTES );
				$repl  = $this->map_url( $url, $page_file, $force_asset || 'href' !== $attr );
				if ( null === $repl ) {
					return $m[0];
				}
				return ' ' . $attr . '=' . $quote . esc_attr( $repl ) . $quote;
			},
			$html
		);
	}

	/**
	 * @param string $html HTML.
	 * @param string $page_file Page.
	 * @return string
	 */
	private function rewrite_srcset( $html, $page_file ) {
		return preg_replace_callback(
			'/\s(?:srcset|data-srcset)\s*=\s*(["\'])([^"\']+)\1/i',
			function ( $m ) use ( $page_file ) {
				$quote  = $m[1];
				$parts  = array_map( 'trim', explode( ',', $m[2] ) );
				$out    = array();
				foreach ( $parts as $part ) {
					if ( '' === $part ) {
						continue;
					}
					$bits = preg_split( '/\s+/', $part, 2 );
					$url  = html_entity_decode( $bits[0], ENT_QUOTES );
					$desc = isset( $bits[1] ) ? ' ' . $bits[1] : '';
					$repl = $this->map_url( $url, $page_file, true );
					$out[] = ( null === $repl ? $url : $repl ) . $desc;
				}
				return ' srcset=' . $quote . esc_attr( implode( ', ', $out ) ) . $quote;
			},
			$html
		);
	}

	/**
	 * @param string $html HTML.
	 * @param string $page_file Page.
	 * @return string
	 */
	private function rewrite_style_urls( $html, $page_file ) {
		return preg_replace_callback(
			'/\sstyle\s*=\s*(["\'])([^"\']+)\1/i',
			function ( $m ) use ( $page_file ) {
				$css = $this->packer->rewrite_css( html_entity_decode( $m[2], ENT_QUOTES ), '', $page_file );
				// Convert packed assets/ paths in url() to page-relative.
				$css = preg_replace_callback(
					'/url\(\s*([\'"]?)(?:\/)?(assets\/[^\'")]+)\1\s*\)/i',
					function ( $u ) use ( $page_file ) {
						$rel = $this->rewriter->relative_href( $page_file, $u[2] );
						return 'url(' . $u[1] . $rel . $u[1] . ')';
					},
					$css
				);
				return ' style=' . $m[1] . esc_attr( $css ) . $m[1];
			},
			$html
		);
	}

	/**
	 * Process <style> blocks url().
	 *
	 * @param string $html HTML.
	 * @param string $page_file Page.
	 * @return string
	 */
	private function rewrite_inline_stylesheets( $html, $page_file ) {
		return preg_replace_callback(
			'/<style\b([^>]*)>(.*?)<\/style>/is',
			function ( $m ) use ( $page_file ) {
				$css = $this->packer->rewrite_css( $m[2], '', $page_file );
				$css = preg_replace_callback(
					'/url\(\s*([\'"]?)(?:\/)?(assets\/[^\'")]+)\1\s*\)/i',
					function ( $u ) use ( $page_file ) {
						$rel = $this->rewriter->relative_href( $page_file, $u[2] );
						return 'url(' . $u[1] . $rel . $u[1] . ')';
					},
					$css
				);
				return '<style' . $m[1] . '>' . $css . '</style>';
			},
			$html
		);
	}

	/**
	 * Map a URL to a relative path for this page, packing assets as needed.
	 *
	 * @param string $url         URL.
	 * @param string $page_file   Page zip path.
	 * @param bool   $as_asset    Prefer asset packing.
	 * @return string|null Replacement or null to leave unchanged.
	 */
	private function map_url( $url, $page_file, $as_asset ) {
		$url = trim( $url );
		if ( '' === $url || 0 === strpos( $url, '#' ) || 0 === strpos( $url, 'mailto:' ) || 0 === strpos( $url, 'tel:' ) || 0 === strpos( $url, 'data:' ) || 0 === strpos( $url, 'javascript:' ) ) {
			return null;
		}

		if ( ! $this->rewriter->is_local_url( $url ) ) {
			return null;
		}

		$path_key = $this->rewriter->to_site_path_key( $url );
		$ext      = $path_key ? strtolower( pathinfo( $path_key, PATHINFO_EXTENSION ) ) : '';

		$asset_exts = array( 'css', 'js', 'mjs', 'map', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'mp4', 'webm', 'pdf', 'json' );

		if ( $as_asset || in_array( $ext, $asset_exts, true ) ) {
			$packed = $this->packer->pack_url( $url );
			if ( ! $packed ) {
				return null;
			}
			return $this->rewriter->relative_href( $page_file, $packed );
		}

		// Internal page link.
		$route_path = $this->url_to_route_path( $url );
		if ( isset( $this->route_files[ $route_path ] ) ) {
			return $this->rewriter->relative_href( $page_file, $this->route_files[ $route_path ] );
		}
		// Try with/without trailing slash.
		$alt = '/' === substr( $route_path, -1 ) ? rtrim( $route_path, '/' ) : $route_path . '/';
		if ( isset( $this->route_files[ $alt ] ) ) {
			return $this->rewriter->relative_href( $page_file, $this->route_files[ $alt ] );
		}

		return null;
	}

	/**
	 * @param string $url URL.
	 * @return string Route path.
	 */
	private function url_to_route_path( $url ) {
		$key = $this->rewriter->to_site_path_key( $url );
		if ( null === $key || '' === $key ) {
			return '/';
		}
		// Strip known file-like endings that aren't pages.
		$path = '/' . $key;
		if ( ! preg_match( '#/$#', $path ) && false === strpos( basename( $path ), '.' ) ) {
			$path .= '/';
		}
		return $path;
	}
}

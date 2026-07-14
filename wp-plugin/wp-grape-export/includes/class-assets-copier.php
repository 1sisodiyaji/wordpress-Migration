<?php
/**
 * Copies CSS/JS (and inline blocks) from the asset manifest into the bundle.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Resolves wp-content asset URLs to disk paths and stages them under
 * assets/wp-content/… plus assets/inline/… for inline style/script blocks.
 */
class Assets_Copier {

	/**
	 * Bundle writer.
	 *
	 * @var Bundle_Writer
	 */
	private $writer;

	/**
	 * @var string[]
	 */
	private $warnings = array();

	/**
	 * @var int
	 */
	private $copied_files = 0;

	/**
	 * @param Bundle_Writer $writer Bundle writer.
	 */
	public function __construct( Bundle_Writer $writer ) {
		$this->writer = $writer;
	}

	/**
	 * Copy all local assets referenced by the manifest and Elementor post CSS.
	 *
	 * @param array    $manifest  Asset manifest (stylesheets + scripts).
	 * @param int[]    $post_ids  Post IDs to pull Elementor per-page CSS for.
	 * @return array{copied:int,warnings:string[],manifest:array}
	 */
	public function copy( array $manifest, array $post_ids = array() ) {
		$manifest = $this->copy_manifest_entries( $manifest );
		$this->copy_elementor_css( $post_ids );

		return array(
			'copied'   => $this->copied_files,
			'warnings' => $this->warnings,
			'manifest' => $manifest,
		);
	}

	/**
	 * @return string[]
	 */
	public function warnings() {
		return $this->warnings;
	}

	/**
	 * Copy stylesheet + script files and persist inline blocks.
	 *
	 * @param array $manifest Manifest.
	 * @return array Updated manifest (adds bundlePath where applicable).
	 */
	private function copy_manifest_entries( array $manifest ) {
		if ( isset( $manifest['stylesheets'] ) && is_array( $manifest['stylesheets'] ) ) {
			foreach ( $manifest['stylesheets'] as $i => $entry ) {
				$manifest['stylesheets'][ $i ] = $this->copy_entry( $entry, 'styles' );
			}
		}
		if ( isset( $manifest['scripts'] ) && is_array( $manifest['scripts'] ) ) {
			foreach ( $manifest['scripts'] as $i => $entry ) {
				$manifest['scripts'][ $i ] = $this->copy_entry( $entry, 'scripts' );
			}
		}
		return $manifest;
	}

	/**
	 * @param array  $entry Entry.
	 * @param string $kind  styles|scripts.
	 * @return array
	 */
	private function copy_entry( array $entry, $kind ) {
		$handle = isset( $entry['handle'] ) ? (string) $entry['handle'] : 'asset';
		$src    = isset( $entry['src'] ) ? (string) $entry['src'] : '';

		if ( $src ) {
			$rel = $this->wp_content_rel_from_url( $src );
			if ( $rel ) {
				$source = $this->resolve_source_path( $rel );
				if ( $source && is_readable( $source ) ) {
					$dest = 'assets/wp-content/' . $rel;
					if ( $this->writer->copy( $source, $dest ) ) {
						$entry['bundlePath'] = $dest;
						$this->copied_files++;
					}
				} else {
					$this->warnings[] = sprintf( 'Stylesheet/script file missing on disk: %s', $src );
				}
			}
		}

		$inline = null;
		if ( 'styles' === $kind && ! empty( $entry['inlineAfter'] ) ) {
			$inline = (string) $entry['inlineAfter'];
		}
		if ( 'scripts' === $kind ) {
			$parts = array();
			if ( ! empty( $entry['inlineBefore'] ) ) {
				$parts[] = (string) $entry['inlineBefore'];
			}
			if ( ! empty( $entry['inlineAfter'] ) ) {
				$parts[] = (string) $entry['inlineAfter'];
			}
			$inline = trim( implode( "\n", $parts ) );
		}

		if ( $inline ) {
			$ext  = 'styles' === $kind ? 'css' : 'js';
			$file = 'assets/inline/' . $kind . '/' . sanitize_file_name( $handle ) . '.' . $ext;
			$this->writer->write( $file, $inline );
			$entry['bundleInline'] = $file;
			$this->copied_files++;
		}

		return $entry;
	}

	/**
	 * Copy Elementor per-post/global CSS from uploads/elementor/css.
	 *
	 * @param int[] $post_ids Post IDs.
	 */
	private function copy_elementor_css( array $post_ids ) {
		$css_dir = WP_CONTENT_DIR . '/uploads/elementor/css';
		if ( ! is_dir( $css_dir ) ) {
			return;
		}

		$copied = array();
		foreach ( $post_ids as $post_id ) {
			$post_id = (int) $post_id;
			if ( ! $post_id ) {
				continue;
			}
			$file = $css_dir . '/post-' . $post_id . '.css';
			if ( is_readable( $file ) ) {
				$dest = 'assets/wp-content/uploads/elementor/css/post-' . $post_id . '.css';
				if ( $this->writer->copy( $file, $dest ) ) {
					$copied[ basename( $file ) ] = true;
					$this->copied_files++;
				}
			}
		}

		// Shared kit / global styles (post-*.css for templates, global*.css).
		foreach ( glob( $css_dir . '/*.css' ) as $file ) {
			$base = basename( $file );
			if ( isset( $copied[ $base ] ) ) {
				continue;
			}
			if ( preg_match( '/^(global|post-\d+)\.css$/', $base ) ) {
				$dest = 'assets/wp-content/uploads/elementor/css/' . $base;
				if ( $this->writer->copy( $file, $dest ) ) {
					$this->copied_files++;
				}
			}
		}

		// Google fonts CSS + font files used by Elementor.
		$fonts_css_dir = WP_CONTENT_DIR . '/uploads/elementor/google-fonts/css';
		if ( is_dir( $fonts_css_dir ) ) {
			foreach ( glob( $fonts_css_dir . '/*.css' ) as $file ) {
				$base = basename( $file );
				$this->writer->copy( $file, 'assets/wp-content/uploads/elementor/google-fonts/css/' . $base );
				$this->copied_files++;
			}
		}
		$fonts_dir = WP_CONTENT_DIR . '/uploads/elementor/google-fonts/fonts';
		if ( is_dir( $fonts_dir ) ) {
			foreach ( glob( $fonts_dir . '/*' ) as $file ) {
				if ( ! is_file( $file ) ) {
					continue;
				}
				$this->writer->copy( $file, 'assets/wp-content/uploads/elementor/google-fonts/fonts/' . basename( $file ) );
				$this->copied_files++;
			}
		}
	}

	/**
	 * Extract the wp-content-relative path from an asset URL.
	 *
	 * @param string $url Asset URL.
	 * @return string|null
	 */
	private function wp_content_rel_from_url( $url ) {
		$url = preg_replace( '#\?.*$#', '', (string) $url );
		if ( preg_match( '#/wp-content/(.+)$#i', $url, $matches ) ) {
			return $matches[1];
		}
		return null;
	}

	/**
	 * Resolve a wp-content-relative path to an absolute source file.
	 *
	 * @param string $rel Relative path under wp-content.
	 * @return string|null
	 */
	private function resolve_source_path( $rel ) {
		$candidates = array(
			WP_CONTENT_DIR . '/' . $rel,
		);

		// Some manifests still reference /smartco/wp-content/… while the site runs at /.
		if ( 0 === strpos( $rel, 'smartco/' ) ) {
			$candidates[] = WP_CONTENT_DIR . '/' . substr( $rel, strlen( 'smartco/' ) );
		}

		foreach ( $candidates as $path ) {
			if ( is_readable( $path ) ) {
				return $path;
			}
		}

		return null;
	}
}

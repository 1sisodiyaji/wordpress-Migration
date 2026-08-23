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
		$this->copy_critical_builder_css();

		$widget_assets = new Widget_Assets();
		$inventory     = $widget_assets->site_inventory( $post_ids );
		$this->copied_files += $widget_assets->copy_inventory( $this->writer, $inventory );

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

		$keep_ids = array_fill_keys( array_map( 'intval', $post_ids ), true );

		foreach ( glob( $css_dir . '/*.css' ) as $file ) {
			$base = basename( $file );
			if ( preg_match( '/^post-(\d+)\.css$/', $base, $m ) && empty( $keep_ids[ (int) $m[1] ] ) ) {
				continue;
			}
			$dest = 'assets/wp-content/uploads/elementor/css/' . $base;
			if ( $this->writer->copy( $file, $dest ) ) {
				$this->copied_files++;
			}
		}

		$this->copy_css_dir( 'plugins/elementor/assets/css/conditionals' );

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
	 * Always stage core Elementor / ElementsKit CSS even when enqueue missed them.
	 */
	private function copy_critical_builder_css() {
		$rels = array(
			'plugins/elementor/assets/css/frontend.min.css',
			'plugins/elementor/assets/lib/eicons/css/elementor-icons.min.css',
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
			'plugins/elementor/assets/css/widget-heading.min.css',
			'plugins/elementor/assets/css/widget-image.min.css',
			'plugins/elementor/assets/css/widget-text-editor.min.css',
			'plugins/elementor/assets/css/widget-image-carousel.min.css',
			'plugins/elementor/assets/css/widget-icon-box.min.css',
			'plugins/elementor/assets/css/widget-icon-list.min.css',
			'plugins/elementor/assets/css/widget-divider.min.css',
			'plugins/elementor/assets/css/widget-social-icons.min.css',
			'plugins/elementor/assets/css/widget-counter.min.css',
			'plugins/elementor/assets/lib/animations/animations.min.css',
			'plugins/elementor-pro/assets/css/widget-form.min.css',
			'plugins/elementor-pro/assets/css/widget-nav-menu.min.css',
			'plugins/elementor-pro/assets/css/widget-carousel-module-base.min.css',
			'plugins/elementor/assets/css/widget-icon.min.css',
			'plugins/elementor/assets/css/widget-button.min.css',
			'plugins/elementskit-lite/modules/elementskit-icon-pack/assets/css/ekiticons.css',
			'plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css',
			'plugins/elementskit-lite/widgets/init/assets/css/responsive.css',
			'plugins/elementskit-lite/widgets/init/assets/css/common.css',
			'plugins/elementskit-lite/widgets/init/assets/css/client-logo.css',
			'plugins/elementskit-lite/widgets/init/assets/css/button.css',
			'plugins/elementskit-lite/widgets/init/assets/css/funfact.css',
			'plugins/elementskit-lite/widgets/init/assets/css/icon-box.css',
			'plugins/elementskit-lite/widgets/init/assets/css/nav-menu.css',
			'plugins/elementskit-lite/widgets/init/assets/css/header-offcanvas.css',
			'plugins/elementskit-lite/widgets/init/assets/css/header-search.css',
			'plugins/elementskit-lite/widgets/init/assets/css/header-info.css',
			'plugins/slide-everything-for-elementor/scripts/main.js',
			'plugins/elementor/assets/lib/font-awesome/css/all.min.css',
			'plugins/elementor/assets/lib/font-awesome/css/v4-shims.min.css',
			'uploads/elementor/css/custom-pro-widget-nav-menu.min.css',
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
			'plugins/elementor/assets/js/webpack.runtime.min.js',
			'plugins/elementor/assets/js/frontend-modules.min.js',
			'plugins/elementor/assets/js/frontend.min.js',
			'plugins/elementor-pro/assets/js/webpack-pro.runtime.min.js',
			'plugins/elementor-pro/assets/js/frontend.min.js',
			'plugins/elementor-pro/assets/js/elements-handlers.min.js',
			'plugins/elementor-pro/assets/lib/smartmenus/jquery.smartmenus.min.js',
		);

		foreach ( $rels as $rel ) {
			$source = WP_CONTENT_DIR . '/' . $rel;
			if ( ! is_readable( $source ) ) {
				continue;
			}
			$dest = 'assets/wp-content/' . $rel;
			if ( $this->writer->copy( $source, $dest ) ) {
				$this->copied_files++;
			}
		}

		// Icon fonts referenced by the CSS above.
		$font_dirs = array(
			'plugins/elementor/assets/lib/eicons/fonts',
			'plugins/elementskit-lite/modules/elementskit-icon-pack/assets/fonts',
			'plugins/elementor/assets/lib/font-awesome/webfonts',
		);
		foreach ( $font_dirs as $dir_rel ) {
			$abs = WP_CONTENT_DIR . '/' . $dir_rel;
			if ( ! is_dir( $abs ) ) {
				continue;
			}
			foreach ( glob( $abs . '/*' ) as $file ) {
				if ( ! is_file( $file ) ) {
					continue;
				}
				if ( $this->writer->copy( $file, 'assets/wp-content/' . $dir_rel . '/' . basename( $file ) ) ) {
					$this->copied_files++;
				}
			}
		}

		// ElementsKit split the old widget-styles.css into per-widget files.
		$this->copy_css_dir( 'plugins/elementskit-lite/widgets/init/assets/css' );
		$this->copy_css_dir( 'plugins/elementskit/widgets/init/assets/css' );
	}

	/**
	 * Copy every .css file from a wp-content-relative directory.
	 *
	 * @param string $dir_rel Directory under wp-content.
	 */
	private function copy_css_dir( $dir_rel ) {
		$abs = WP_CONTENT_DIR . '/' . $dir_rel;
		if ( ! is_dir( $abs ) ) {
			return;
		}
		foreach ( glob( $abs . '/*.css' ) as $file ) {
			if ( ! is_file( $file ) ) {
				continue;
			}
			if ( $this->writer->copy( $file, 'assets/wp-content/' . $dir_rel . '/' . basename( $file ) ) ) {
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

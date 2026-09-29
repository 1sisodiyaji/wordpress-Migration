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
	 * Count of intentionally skipped Gutenberg editor-only block stylesheets.
	 *
	 * @var int
	 */
	private $skipped_editor_block_styles = 0;

	/**
	 * @param Bundle_Writer $writer Bundle writer.
	 */
	public function __construct( Bundle_Writer $writer ) {
		$this->writer = $writer;
	}

	/**
	 * Copy all local assets referenced by the manifest and builder-specific CSS.
	 *
	 * @param array    $manifest  Asset manifest (stylesheets + scripts).
	 * @param int[]    $post_ids  Post IDs to pull Elementor per-page CSS for.
	 * @param string   $builder   Detected page builder.
	 * @return array{copied:int,warnings:string[],manifest:array}
	 */
	public function copy( array $manifest, array $post_ids = array(), $builder = 'elementor' ) {
		$builder  = $builder ? (string) $builder : 'elementor';
		$manifest = $this->copy_manifest_entries( $manifest );

		if ( 'elementor' === $builder ) {
			$this->copy_elementor_css( $post_ids );
			$this->copy_critical_elementor_css();
			$widget_assets = new Widget_Assets();
			$inventory     = $widget_assets->site_inventory( $post_ids );
			$this->copied_files += $widget_assets->copy_inventory( $this->writer, $inventory );
		} else {
			$this->copy_critical_block_theme_css();
			$this->copy_otter_runtime_assets();
		}

		// Always stage core Gutenberg CSS. FSE headers/navbars use wp-block-navigation
		// even when site-level builder detection is classic/elementor, and manifest
		// copy of /wp-includes/blocks/*/style.min.css can miss when the file was
		// only referenced (src set, no inline dump).
		$this->copy_core_block_library_css();

		if ( $this->skipped_editor_block_styles > 0 ) {
			$this->warnings[] = sprintf(
				'Skipped %d Gutenberg editor block stylesheet(s) (editor-only, not needed on front-end).',
				$this->skipped_editor_block_styles
			);
		}

		$this->localize_font_files();

		return array(
			'copied'   => $this->copied_files,
			'warnings' => $this->warnings,
			'manifest' => $manifest,
		);
	}

	/**
	 * Copy font files referenced by exported CSS and point url() at the bundle.
	 * WordPress font-library CSS keeps http://site/wp-content/fonts/... which
	 * the React app cannot load (CORS). Files land under assets/wp-content/fonts.
	 */
	private function localize_font_files() {
		$root = rtrim( $this->writer->root(), '/\\' );
		if ( ! is_dir( $root ) ) {
			return;
		}
		$iterator = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( $root, \FilesystemIterator::SKIP_DOTS )
		);
		foreach ( $iterator as $file ) {
			if ( ! $file->isFile() || ! preg_match( '/\.css$/i', $file->getFilename() ) ) {
				continue;
			}
			$path = $file->getPathname();
			$css  = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			if ( ! is_string( $css ) || '' === $css ) {
				continue;
			}
			$rewritten = $this->rewrite_css_font_urls( $css );
			if ( $rewritten !== $css ) {
				file_put_contents( $path, $rewritten ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			}
		}
	}

	/**
	 * @param string $css Stylesheet text.
	 * @return string
	 */
	private function rewrite_css_font_urls( $css ) {
		$pattern = '#url\(\s*([\'"]?)(https?:)?//([^)\'"\s]+)\1\s*\)#i';
		return preg_replace_callback(
			$pattern,
			function ( $m ) {
				$absolute = ( $m[2] ? $m[2] : 'https:' ) . '//' . $m[3];
				$local    = $this->store_font_url( $absolute );
				if ( ! $local ) {
					return $m[0];
				}
				return 'url("' . $local . '")';
			},
			$css
		);
	}

	/**
	 * @param string $url Absolute font or font-css URL.
	 * @return string|null Root path served from public/assets, or null.
	 */
	private function store_font_url( $url ) {
		$clean = preg_replace( '#\?.*$#', '', $url );
		$path  = (string) wp_parse_url( $clean, PHP_URL_PATH );
		if ( '' === $path || ! preg_match( '#\.(woff2?|ttf|otf|eot)$#i', $path ) ) {
			return null;
		}

		if ( preg_match( '#/wp-content/fonts/(.+)$#i', $path, $match ) ) {
			$rel    = rawurldecode( $match[1] );
			$source = WP_CONTENT_DIR . '/fonts/' . $rel;
			$dest   = 'assets/wp-content/fonts/' . $rel;
			if ( is_readable( $source ) && $this->writer->copy( $source, $dest ) ) {
				$this->copied_files++;
				return '/assets/wp-content/fonts/' . $rel;
			}
		}

		$bytes = $this->download_binary( $clean );
		if ( null === $bytes ) {
			return null;
		}
		$name = sanitize_file_name( basename( $path ) );
		$dest = 'assets/inline/fonts/remote/' . $name;
		$this->writer->write( $dest, $bytes );
		$this->copied_files++;
		return '/assets/inline/fonts/remote/' . $name;
	}

	/**
	 * Font Awesome + animations used by Otter when that plugin is installed.
	 */
	private function copy_otter_runtime_assets() {
		$rels = array(
			'plugins/otter-blocks/build/atomic-wind/animations-frontend.js',
			'plugins/otter-blocks/build/atomic-wind/style-animations-frontend.css',
			'plugins/otter-blocks/assets/fontawesome/css/all.min.css',
			'plugins/otter-blocks/assets/fontawesome/css/v4-shims.min.css',
			'plugins/otter-blocks/build/blocks/form/style.css',
			'plugins/otter-blocks/build/blocks/font-awesome-icons/style.css',
			'plugins/otter-blocks/build/blocks/icon-list/style.css',
			'plugins/otter-blocks/build/blocks/sharing-icons/style.css',
		);
		$this->copy_rel_list( $rels );

		$fa_webfonts = WP_CONTENT_DIR . '/plugins/otter-blocks/assets/fontawesome/webfonts';
		if ( is_dir( $fa_webfonts ) ) {
			$this->copy_font_dirs( array( 'plugins/otter-blocks/assets/fontawesome/webfonts' ) );
		}
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
			} elseif ( 'styles' === $kind ) {
				// Every core stylesheet under wp-includes, including skip-link
				// and block CSS. Do not filter by an allow-list.
				$includes_rel = $this->wp_includes_rel_from_url( $src );
				if ( $includes_rel && preg_match( '#\.css$#i', $includes_rel ) ) {
					$source = ABSPATH . 'wp-includes/' . $includes_rel;
					if ( is_readable( $source ) ) {
						$dest = 'assets/wp-includes/' . $includes_rel;
						if ( $this->writer->copy( $source, $dest ) ) {
							$entry['bundlePath'] = $dest;
							$this->copied_files++;
						} else {
							$this->warnings[] = sprintf( 'Failed to copy wp-includes stylesheet: %s', $src );
						}
					} else {
						$this->warnings[] = sprintf( 'wp-includes stylesheet missing on disk: %s', $src );
					}
				}
			}

			// Remote stylesheets (Google Fonts and other CDNs) are enqueued
			// with an https URL and never map to a file under wp-content.
			if ( 'styles' === $kind && empty( $entry['bundlePath'] ) && preg_match( '#^https?://#i', $src ) ) {
				$saved = $this->save_remote_stylesheet( $handle, $src );
				if ( $saved ) {
					$entry['bundlePath'] = $saved;
					$this->copied_files++;
				}
			} elseif ( 'scripts' === $kind ) {
				// Frontend jQuery (and migrate) — needed for Elementor / some FSE widgets.
				$includes_rel = $this->wp_includes_rel_from_url( $src );
				if ( $includes_rel && $this->is_allowed_wp_includes_script( $handle, $includes_rel ) ) {
					$source = ABSPATH . 'wp-includes/' . $includes_rel;
					if ( is_readable( $source ) ) {
						$dest = 'assets/wp-includes/' . $includes_rel;
						if ( $this->writer->copy( $source, $dest ) ) {
							$entry['bundlePath'] = $dest;
							$this->copied_files++;
						}
					}
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

		// Shared kit / global / custom widget styles.
		foreach ( glob( $css_dir . '/*.css' ) as $file ) {
			$base = basename( $file );
			if ( isset( $copied[ $base ] ) ) {
				continue;
			}
			if ( preg_match( '/^(global|post-\d+|custom-|base-).*\.css$/', $base ) ) {
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
	 * Always stage core Elementor / ElementsKit CSS even when enqueue missed them.
	 */
	private function copy_critical_elementor_css() {
		$rels = array(
			'plugins/elementor/assets/css/frontend.min.css',
			'plugins/elementor/assets/lib/eicons/css/elementor-icons.min.css',
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
			'plugins/elementor/assets/css/widget-heading.min.css',
			'plugins/elementor/assets/css/widget-image.min.css',
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
			'plugins/elementskit-lite/modules/elementskit-icon-pack/assets/css/ekiticons.css',
			'plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css',
			'plugins/elementskit-lite/widgets/init/assets/css/responsive.css',
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
			'plugins/elementor/assets/js/webpack.runtime.min.js',
			'plugins/elementor/assets/js/frontend-modules.min.js',
			'plugins/elementor/assets/js/frontend.min.js',
			'plugins/elementor-pro/assets/js/webpack-pro.runtime.min.js',
			'plugins/elementor-pro/assets/js/frontend.min.js',
			'plugins/elementor-pro/assets/js/elements-handlers.min.js',
			'plugins/elementor-pro/assets/lib/smartmenus/jquery.smartmenus.min.js',
		);

		$this->copy_rel_list( $rels );

		$font_dirs = array(
			'plugins/elementor/assets/lib/eicons/fonts',
			'plugins/elementskit-lite/modules/elementskit-icon-pack/assets/fonts',
		);
		$this->copy_font_dirs( $font_dirs );
	}

	/**
	 * Stage Neve / Otter / block theme CSS for Gutenberg exports.
	 */
	private function copy_critical_block_theme_css() {
		$rels = array();

		foreach ( array( get_stylesheet(), get_template() ) as $theme ) {
			foreach ( array( 'assets/images', 'assets/fonts', 'assets/img', 'assets/css' ) as $subdir ) {
				$dir = WP_CONTENT_DIR . '/themes/' . $theme . '/' . $subdir;
				if ( is_dir( $dir ) ) {
					$this->copy_font_dirs( array( 'themes/' . $theme . '/' . $subdir ) );
				}
			}
			// Theme CSS trees (Spexo / block themes often keep styles under assets/css).
			$css_dir = WP_CONTENT_DIR . '/themes/' . $theme . '/assets/css';
			if ( is_dir( $css_dir ) ) {
				foreach ( glob( $css_dir . '/*.css' ) ?: array() as $file ) {
					$rel    = 'themes/' . $theme . '/assets/css/' . basename( $file );
					$rels[] = $rel;
				}
			}
		}

		$theme_rel_candidates = array(
			'themes/' . get_stylesheet() . '/style-main-new.min.css',
			'themes/' . get_template() . '/style-main-new.min.css',
			'themes/' . get_stylesheet() . '/style-main.min.css',
			'themes/' . get_template() . '/style-main.min.css',
			'themes/' . get_stylesheet() . '/style.css',
			'themes/' . get_template() . '/style.css',
			'themes/' . get_stylesheet() . '/assets/css/mega-menu.min.css',
			'themes/' . get_template() . '/assets/css/mega-menu.min.css',
		);
		foreach ( $theme_rel_candidates as $rel ) {
			if ( is_readable( WP_CONTENT_DIR . '/' . $rel ) ) {
				$rels[] = $rel;
			}
		}

		$otter_globs = array(
			'plugins/otter-blocks/build/atomic-wind/style-animations-frontend.css',
			'plugins/otter-blocks/build/atomic-wind/style-animations-frontend-rtl.css',
			'plugins/otter-blocks/build/style.css',
			'plugins/otter-blocks/build/blocks/style.css',
			'plugins/otter-blocks/build/animation/index.css',
		);
		foreach ( $otter_globs as $rel ) {
			if ( is_readable( WP_CONTENT_DIR . '/' . $rel ) ) {
				$rels[] = $rel;
			}
		}

		// Block frontend styles only (skip editor CSS).
		$blocks_dir = WP_CONTENT_DIR . '/plugins/otter-blocks/build/blocks';
		if ( is_dir( $blocks_dir ) ) {
			foreach ( glob( $blocks_dir . '/*/style.css' ) ?: array() as $file ) {
				$rel    = ltrim( str_replace( WP_CONTENT_DIR, '', wp_normalize_path( $file ) ), '/' );
				$rels[] = $rel;
			}
		}

		$this->copy_rel_list( array_values( array_unique( $rels ) ) );
		// copy_core_block_library_css() is also invoked from copy() for all builders.
	}

	/**
	 * Always stage Gutenberg core block-library CSS from wp-includes.
	 * Includes the bundled library CSS plus per-block frontend styles
	 * (image, group, columns, cover, gallery…) used for section layouts.
	 */
	private function copy_core_block_library_css() {
		$files = array(
			'css/dist/block-library/style.min.css',
			'css/dist/block-library/style.css',
			'css/dist/block-library/theme.min.css',
			'css/dist/block-library/theme.css',
			'css/dist/block-library/common.min.css',
			'css/dist/block-library/common.css',
			'css/dist/theme/design-tokens.min.css',
			'css/dist/theme/design-tokens.css',
			'css/classic-themes.min.css',
			'css/classic-themes.css',
		);
		foreach ( $files as $rel ) {
			$source = ABSPATH . 'wp-includes/' . $rel;
			if ( ! is_readable( $source ) ) {
				continue;
			}
			$dest = 'assets/wp-includes/' . $rel;
			if ( $this->writer->copy( $source, $dest ) ) {
				$this->copied_files++;
			}
		}

		// Per-block frontend CSS (WP 5.9+ when separate block assets are enabled).
		$blocks_root = ABSPATH . 'wp-includes/blocks';
		if ( is_dir( $blocks_root ) ) {
			$wanted = array(
				'image',
				'gallery',
				'cover',
				'group',
				'columns',
				'column',
				'media-text',
				'heading',
				'paragraph',
				'buttons',
				'button',
				'separator',
				'spacer',
				'quote',
				'list',
				'table',
				'video',
				'audio',
				'embed',
				'pullquote',
				'site-logo',
				'site-title',
				'navigation',
				'page-list',
				'post-title',
				'post-featured-image',
				'post-content',
				'query',
				'template-part',
			);
			foreach ( $wanted as $block ) {
				foreach ( array( 'style.min.css', 'style.css', 'theme.min.css', 'theme.css' ) as $name ) {
					$source = $blocks_root . '/' . $block . '/' . $name;
					if ( ! is_readable( $source ) ) {
						continue;
					}
					$dest = 'assets/wp-includes/blocks/' . $block . '/' . $name;
					if ( $this->writer->copy( $source, $dest ) ) {
						$this->copied_files++;
					}
				}
			}
		}
	}

	/**
	 * @param string[] $rels Paths under wp-content.
	 */
	private function copy_rel_list( array $rels ) {
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
	}

	/**
	 * @param string[] $font_dirs Paths under wp-content.
	 */
	private function copy_font_dirs( array $font_dirs ) {
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
	}

	/**
	 * @deprecated Renamed to copy_critical_elementor_css().
	 */
	private function copy_critical_builder_css() {
		$this->copy_critical_elementor_css();
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
	 * Download a remote stylesheet into the bundle.
	 *
	 * Themes enqueue Google Fonts (and similar) as https URLs. Those never
	 * map to a file on disk, so the export previously left bundlePath empty.
	 *
	 * @param string $handle Style handle.
	 * @param string $url    Absolute stylesheet URL.
	 * @return string|null Bundle path, or null when the download failed.
	 */
	private function save_remote_stylesheet( $handle, $url ) {
		if ( ! function_exists( 'wp_remote_get' ) ) {
			return null;
		}

		$response = wp_remote_get(
			$url,
			array(
				'timeout'    => 20,
				'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
			)
		);
		if ( is_wp_error( $response ) ) {
			$this->warnings[] = sprintf( 'Remote stylesheet failed (%s): %s', $handle, $response->get_error_message() );
			return null;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = (string) wp_remote_retrieve_body( $response );
		if ( $code < 200 || $code >= 300 || '' === trim( $body ) ) {
			$this->warnings[] = sprintf( 'Remote stylesheet HTTP %d: %s', $code, $handle );
			return null;
		}

		$body = $this->vendor_remote_font_files( $handle, $body );

		$file = 'assets/inline/styles/' . sanitize_file_name( $handle ) . '.css';
		$this->writer->write( $file, $body );
		return $file;
	}

	/**
	 * Download font files referenced by a remote stylesheet and rewrite url()
	 * to paths under public/assets/inline/fonts (Vite serves public/assets).
	 *
	 * @param string $handle Style handle.
	 * @param string $css    Stylesheet text.
	 * @return string
	 */
	private function vendor_remote_font_files( $handle, $css ) {
		if ( ! preg_match_all( '#https?://[^)\'"\s]+#i', $css, $matches ) ) {
			return $css;
		}

		$slug    = sanitize_file_name( $handle );
		$rewrote = array();
		foreach ( array_unique( $matches[0] ) as $font_url ) {
			$path = (string) wp_parse_url( $font_url, PHP_URL_PATH );
			$base = $path ? basename( $path ) : '';
			if ( ! preg_match( '#\.(woff2?|ttf|otf|eot)$#i', $base ) ) {
				continue;
			}
			$bytes = $this->download_binary( $font_url );
			if ( null === $bytes ) {
				$this->warnings[] = sprintf( 'Font file not downloaded: %s', $font_url );
				continue;
			}
			$name = sanitize_file_name( $base );
			$dest = 'assets/inline/fonts/' . $slug . '/' . $name;
			$this->writer->write( $dest, $bytes );
			$this->copied_files++;
			$rewrote[ $font_url ] = '/assets/inline/fonts/' . $slug . '/' . $name;
		}

		foreach ( $rewrote as $remote => $local ) {
			$css = str_replace( $remote, $local, $css );
		}
		return $css;
	}

	/**
	 * @param string $url Absolute URL.
	 * @return string|null Raw bytes, or null on failure.
	 */
	private function download_binary( $url ) {
		if ( ! function_exists( 'wp_remote_get' ) ) {
			return null;
		}
		$response = wp_remote_get(
			$url,
			array(
				'timeout'    => 20,
				'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
			)
		);
		if ( is_wp_error( $response ) ) {
			return null;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		if ( $code < 200 || $code >= 300 || ! is_string( $body ) || '' === $body ) {
			return null;
		}
		return $body;
	}

	/**
	 * Extract wp-includes-relative path from an asset URL.
	 *
	 * @param string $url Asset URL.
	 * @return string|null
	 */
	private function wp_includes_rel_from_url( $url ) {
		$url = preg_replace( '#\?.*$#', '', (string) $url );
		if ( preg_match( '#/wp-includes/(.+)$#i', $url, $matches ) ) {
			return $matches[1];
		}
		return null;
	}

	/**
	 * Only stage frontend Gutenberg CSS from wp-includes (never editor chrome).
	 *
	 * @param string $handle Style handle.
	 * @param string $rel    Path under wp-includes.
	 * @return bool
	 */
	private function is_allowed_wp_includes_style( $handle, $rel ) {
		$handle = strtolower( (string) $handle );
		$rel    = strtolower( (string) $rel );

		if ( preg_match( '/block-editor|block-directory|components|preferences|editor/i', $handle ) ) {
			return false;
		}
		if ( preg_match( '#block-library/(editor|reset)#', $rel ) ) {
			return false;
		}
		if ( preg_match( '#css/dist/block-library/(style|theme|common)(\.min)?\.css$#', $rel ) ) {
			return true;
		}
		// WP 6.8+ design tokens (handle: wp-theme) — required for FSE color/spacing fidelity.
		if ( preg_match( '#css/dist/theme/(design-tokens|theme-json)(\.min)?\.css$#', $rel ) ) {
			return true;
		}
		if ( preg_match( '#blocks/[a-z0-9-]+/(style|theme)(\.min)?\.css$#', $rel ) ) {
			return true;
		}
		if ( preg_match( '#css/classic-themes(\.min)?\.css$#', $rel ) ) {
			return true;
		}
		// Skip link is frontend chrome printed on every block theme page.
		if ( preg_match( '#^css/wp-block-template-skip-link(\.min)?\.css$#', $rel ) ) {
			return true;
		}
		if ( in_array(
			$handle,
			array(
				'wp-block-library',
				'wp-block-library-theme',
				'classic-theme-styles',
				'wp-block-template-skip-link',
				'wp-theme',
				'wp-theme-json',
			),
			true
		) ) {
			return true;
		}
		return false;
	}

	/**
	 * Frontend-only wp-includes scripts (never editor/vendor React).
	 *
	 * @param string $handle Script handle.
	 * @param string $rel    Path under wp-includes.
	 * @return bool
	 */
	private function is_allowed_wp_includes_script( $handle, $rel ) {
		$handle = strtolower( (string) $handle );
		$rel    = strtolower( (string) $rel );

		if ( preg_match( '/^(jquery-core|jquery-migrate|jquery)$/', $handle ) ) {
			return true;
		}
		if ( preg_match( '#^js/jquery/#', $rel ) ) {
			return true;
		}
		return false;
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

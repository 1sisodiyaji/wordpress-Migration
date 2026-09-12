<?php
/**
 * Collects the enqueue order of styles and scripts.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Drives the standard enqueue lifecycle and reads the resulting
 * dependency-resolved list of styles + scripts, including inline blocks.
 *
 * Behaviour is builder-aware:
 * - elementor → simulate Elementor frontend enqueue + critical Elementor CSS
 * - gutenberg/classic → theme + block/plugin CSS (Neve, Otter Atomic Wind / Tailwind)
 */
class Assets_Collector {

	/**
	 * Collect the asset manifest for the detected page builder.
	 *
	 * @param int    $front_id Front page ID (for context), may be 0.
	 * @param int[]  $post_ids Additional post IDs to render for enqueue discovery.
	 * @param string $builder  Detected site builder (elementor|gutenberg|…).
	 * @return array{stylesheets:array,scripts:array,builder:string}
	 */
	public function collect( $front_id = 0, array $post_ids = array(), $builder = '' ) {
		global $wp_styles, $wp_scripts;

		$builder = $builder ? (string) $builder : 'classic';
		$ids     = array_values( array_unique( array_filter( array_map( 'intval', array_merge( array( $front_id ), $post_ids ) ) ) ) );

		if ( 'elementor' === $builder ) {
			$this->collect_elementor_context( $ids );
		} else {
			$this->collect_block_theme_context( $front_id ? (int) $front_id : ( $ids[0] ?? 0 ), $ids );
		}

		if ( ! did_action( 'wp_enqueue_scripts' ) ) {
			do_action( 'wp_enqueue_scripts' );
		}

		if ( 'elementor' === $builder ) {
			$this->enqueue_critical_elementor_styles();
		} else {
			$this->enqueue_critical_block_theme_styles();
		}

		$stylesheets = $this->read_registry( $wp_styles );
		$scripts     = $this->read_registry( $wp_scripts, true );

		// Gutenberg / Otter: Tailwind + theme vars often only exist as printed <style> tags.
		if ( 'elementor' !== $builder ) {
			$stylesheets = $this->merge_stylesheet_entries(
				$stylesheets,
				$this->capture_front_page_style_tags()
			);
			$stylesheets = $this->merge_stylesheet_entries(
				$stylesheets,
				$this->collect_atomic_wind_caches( $ids )
			);
			$scripts = $this->ensure_otter_generator_script( $scripts, $ids );
		}

		wp_reset_postdata();

		return array(
			'stylesheets' => $stylesheets,
			'scripts'     => $scripts,
			'builder'     => $builder,
		);
	}

	/**
	 * Merge every post's Otter `_atomic_wind_css` cache into the manifest.
	 *
	 * Home alone is not enough — About/Pricing/etc. cache different utilities
	 * (icon sizes, section backgrounds). Uncached pages still need the JS generator.
	 *
	 * @param int[] $post_ids Post IDs.
	 * @return array[]
	 */
	private function collect_atomic_wind_caches( array $post_ids ) {
		$entries = array();
		$seen    = array();

		foreach ( $post_ids as $post_id ) {
			$post_id = (int) $post_id;
			if ( $post_id <= 0 ) {
				continue;
			}
			$css = get_post_meta( $post_id, '_atomic_wind_css', true );
			if ( ! is_string( $css ) || '' === trim( $css ) ) {
				continue;
			}
			$hash = md5( $css );
			if ( isset( $seen[ $hash ] ) ) {
				continue;
			}
			$seen[ $hash ] = true;
			$handle        = 'atomic-wind-tailwind-' . $post_id;
			$entries[]     = array(
				'handle'      => $handle,
				'src'         => null,
				'deps'        => array(),
				'ver'         => null,
				'inlineAfter' => $css,
				'media'       => 'all',
				'source'      => 'atomic-wind-cache',
			);
		}

		return $entries;
	}

	/**
	 * Ensure Otter's client Tailwind generator is listed when any page lacks a cache.
	 *
	 * @param array[] $scripts Existing script entries.
	 * @param int[]   $post_ids Post IDs.
	 * @return array[]
	 */
	private function ensure_otter_generator_script( array $scripts, array $post_ids ) {
		$needs = false;
		foreach ( $post_ids as $post_id ) {
			$post_id = (int) $post_id;
			if ( $post_id <= 0 ) {
				continue;
			}
			$post = get_post( $post_id );
			if ( ! $post ) {
				continue;
			}
			$content = (string) $post->post_content;
			if ( false === strpos( $content, '<!-- wp:atomic-wind/' ) ) {
				continue;
			}
			$cached = get_post_meta( $post_id, '_atomic_wind_css', true );
			if ( ! is_string( $cached ) || '' === trim( $cached ) ) {
				$needs = true;
				break;
			}
		}

		if ( ! $needs ) {
			return $scripts;
		}

		$rel = 'plugins/otter-blocks/build/atomic-wind/tailwind-generator-frontend.js';
		$abs = WP_CONTENT_DIR . '/' . $rel;
		if ( ! is_readable( $abs ) ) {
			return $scripts;
		}

		foreach ( $scripts as $entry ) {
			$src = isset( $entry['src'] ) ? (string) $entry['src'] : '';
			if ( false !== strpos( $src, 'tailwind-generator-frontend' ) ) {
				return $scripts;
			}
		}

		$scripts[] = array(
			'handle'       => 'atomic-wind-tailwind-generator',
			'src'          => content_url( $rel ),
			'deps'         => array(),
			'ver'          => null,
			'inlineBefore' => null,
			'inlineAfter'  => null,
			'source'       => 'otter-generator',
		);

		return $scripts;
	}

	/**
	 * Elementor path: render posts so widget CSS registers, then enqueue frontend.
	 *
	 * @param int[] $ids Post IDs.
	 */
	private function collect_elementor_context( array $ids ) {
		$elementor = new Elementor_Bridge();
		$widgets   = new Widget_Assets( $elementor );
		$inventory = $widgets->site_inventory( $ids );

		foreach ( $ids as $post_id ) {
			$this->prime_post_context( $post_id );
			if ( Elementor_Bridge::available() && Elementor_Bridge::is_built_with( $post_id ) ) {
				$elementor->ensure_post_css( $post_id );
				$elementor->render( $post_id );
			}
		}

		$widgets->enqueue_inventory( $inventory );

		if ( Elementor_Bridge::available() ) {
			try {
				$frontend = \Elementor\Plugin::$instance->frontend;
				if ( $frontend && method_exists( $frontend, 'enqueue_styles' ) ) {
					$frontend->enqueue_styles();
				}
				if ( $frontend && method_exists( $frontend, 'enqueue_scripts' ) ) {
					$frontend->enqueue_scripts();
				}
			} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
				// Best-effort.
			}
		}

		if ( wp_style_is( 'elementor-frontend', 'registered' ) && ! wp_style_is( 'elementor-frontend', 'enqueued' ) ) {
			wp_enqueue_style( 'elementor-frontend' );
		}
		if ( ! wp_style_is( 'elementor-frontend', 'registered' ) ) {
			$el_css = WP_PLUGIN_DIR . '/elementor/assets/css/frontend.min.css';
			if ( file_exists( $el_css ) ) {
				wp_register_style(
					'elementor-frontend',
					content_url( 'plugins/elementor/assets/css/frontend.min.css' ),
					array(),
					defined( 'ELEMENTOR_VERSION' ) ? ELEMENTOR_VERSION : null
				);
				wp_enqueue_style( 'elementor-frontend' );
			}
		}
	}

	/**
	 * Block / classic theme path: prime a real front page so Neve + Otter enqueue.
	 *
	 * @param int   $primary_id Primary post to prime.
	 * @param int[] $ids        Extra IDs (unused for render, kept for API symmetry).
	 */
	private function collect_block_theme_context( $primary_id, array $ids ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter
		if ( $primary_id > 0 ) {
			$this->prime_post_context( $primary_id );
		}

		// Let themes/plugins register their front-end handles.
		// Avoid template_redirect: redirect_canonical() can abort CLI/REST exports.
		if ( ! did_action( 'wp' ) ) {
			do_action( 'wp' );
		}
	}

	/**
	 * Hard-ensure Elementor / ElementsKit CSS when builder is Elementor.
	 */
	private function enqueue_critical_elementor_styles() {
		$files = array(
			'elementor-frontend'         => 'elementor/assets/css/frontend.min.css',
			'elementor-icons'            => 'elementor/assets/lib/eicons/css/elementor-icons.min.css',
			'elementor-widget-heading'   => 'elementor/assets/css/widget-heading.min.css',
			'elementor-widget-image'     => 'elementor/assets/css/widget-image.min.css',
			'elementor-widget-icon-box'  => 'elementor/assets/css/widget-icon-box.min.css',
			'elementor-widget-icon-list' => 'elementor/assets/css/widget-icon-list.min.css',
			'elementor-widget-divider'   => 'elementor/assets/css/widget-divider.min.css',
			'e-widget-nav-menu'          => 'elementor-pro/assets/css/widget-nav-menu.min.css',
			'widget-form'                => 'elementor-pro/assets/css/widget-form.min.css',
			'ekiticons'                  => 'elementskit-lite/modules/elementskit-icon-pack/assets/css/ekiticons.css',
			'ekit-widget-styles'         => 'elementskit-lite/widgets/init/assets/css/widget-styles.css',
			'ekit-responsive'            => 'elementskit-lite/widgets/init/assets/css/responsive.css',
		);

		foreach ( $files as $handle => $rel ) {
			$this->register_and_enqueue_plugin_style( $handle, $rel );
		}
	}

	/**
	 * Enqueue theme + Otter / block library CSS for Gutenberg sites (Neve, etc.).
	 */
	private function enqueue_critical_block_theme_styles() {
		global $wp_styles;

		$theme_candidates = array(
			'neve-style' => array(
				get_stylesheet_directory() . '/style-main-new.min.css',
				get_template_directory() . '/style-main-new.min.css',
				get_stylesheet_directory() . '/style-main.min.css',
				get_template_directory() . '/style-main.min.css',
			),
			'theme-style' => array(
				get_stylesheet_directory() . '/style.css',
			),
		);

		foreach ( $theme_candidates as $handle => $paths ) {
			foreach ( $paths as $abs ) {
				if ( ! is_readable( $abs ) ) {
					continue;
				}
				$rel = $this->wp_content_rel_from_abs( $abs );
				if ( ! $rel ) {
					continue;
				}
				if ( ! wp_style_is( $handle, 'registered' ) ) {
					wp_register_style( $handle, content_url( $rel ), array(), null );
				}
				wp_enqueue_style( $handle );
				break;
			}
		}

		$otter_files = array(
			'atomic-wind-animations' => 'otter-blocks/build/atomic-wind/style-animations-frontend.css',
			'otter-blocks'           => 'otter-blocks/build/style.css',
			'otter-blocks-frontend'  => 'otter-blocks/build/blocks/style.css',
		);
		foreach ( $otter_files as $handle => $rel ) {
			$this->register_and_enqueue_plugin_style( $handle, $rel );
		}

		if ( function_exists( 'wp_enqueue_global_styles' ) ) {
			wp_enqueue_global_styles();
		}
		if ( function_exists( 'wp_enqueue_style' ) && wp_style_is( 'wp-block-library', 'registered' ) ) {
			wp_enqueue_style( 'wp-block-library' );
		}

		if ( $wp_styles && ! empty( $wp_styles->registered ) ) {
			foreach ( $wp_styles->registered as $handle => $_obj ) {
				if ( preg_match( '/^(neve|otter|atomic-wind|themeisle|wp-block)/i', (string) $handle ) ) {
					wp_enqueue_style( $handle );
				}
			}
		}
	}

	/**
	 * @param string $handle Style handle.
	 * @param string $rel    Path under wp-content/plugins/.
	 */
	private function register_and_enqueue_plugin_style( $handle, $rel ) {
		$abs = WP_PLUGIN_DIR . '/' . $rel;
		if ( ! is_readable( $abs ) ) {
			return;
		}
		if ( ! wp_style_is( $handle, 'registered' ) ) {
			wp_register_style( $handle, content_url( 'plugins/' . $rel ), array(), null );
		}
		if ( ! wp_style_is( $handle, 'enqueued' ) ) {
			wp_enqueue_style( $handle );
		}
	}

	/**
	 * Fetch the public front page and harvest <link stylesheet> + <style id="…"> tags.
	 * Critical for Otter Atomic Wind Tailwind dump and Neve customizer CSS.
	 *
	 * @return array[] Stylesheet entries compatible with the manifest.
	 */
	private function capture_front_page_style_tags() {
		$html = $this->fetch_front_html();
		if ( ! $html ) {
			return array();
		}

		$entries = array();

		if ( preg_match_all( '/<link\b[^>]*rel=[\'"]stylesheet[\'"][^>]*>/i', $html, $link_matches ) ) {
			foreach ( $link_matches[0] as $tag ) {
				$id  = '';
				$href = '';
				if ( preg_match( '/\bid=[\'"]([^\'"]+)[\'"]/i', $tag, $m ) ) {
					$id = preg_replace( '/-css$/', '', $m[1] );
				}
				if ( preg_match( '/\bhref=[\'"]([^\'"]+)[\'"]/i', $tag, $m ) ) {
					$href = html_entity_decode( $m[1], ENT_QUOTES );
					if ( 0 === strpos( $href, '//' ) ) {
						$href = ( is_ssl() ? 'https:' : 'http:' ) . $href;
					}
				}
				if ( ! $href ) {
					continue;
				}
				// Skip admin / editor chrome.
				if ( preg_match( '/admin-bar|dashicons|wp-includes\/css\/dist\/block-library\/reset/i', $href ) ) {
					continue;
				}
				$handle = $id ? $id : ( 'remote-' . substr( md5( $href ), 0, 10 ) );
				$entries[] = array(
					'handle'      => $handle,
					'src'         => $href,
					'deps'        => array(),
					'ver'         => null,
					'inlineAfter' => null,
					'media'       => 'all',
					'source'      => 'front-html',
				);
			}
		}

		if ( preg_match_all( '/<style\b([^>]*)>(.*?)<\/style>/is', $html, $style_matches, PREG_SET_ORDER ) ) {
			foreach ( $style_matches as $i => $match ) {
				$attrs = $match[1];
				$css   = trim( $match[2] );
				if ( '' === $css ) {
					continue;
				}
				$id = '';
				if ( preg_match( '/\bid=[\'"]([^\'"]+)[\'"]/i', $attrs, $m ) ) {
					$id = $m[1];
				}
				// Prefer theme / otter / block / customizer dumps; skip tiny noise.
				$keep = false;
				if ( $id && preg_match( '/atomic-wind|otter|neve|global-styles|wp-block|customizer|core-block/i', $id ) ) {
					$keep = true;
				}
				if ( ! $keep && preg_match( '/--nv-|wp-block-atomic-wind|@tailwind|@layer\s+utilities/i', $css ) ) {
					$keep = true;
				}
				if ( ! $keep && strlen( $css ) > 400 && preg_match( '/\.wp-block-|\.nv-|#header-grid/i', $css ) ) {
					$keep = true;
				}
				if ( ! $keep ) {
					continue;
				}

				$handle = $id ? preg_replace( '/-inline-css$|-css$/', '', $id ) : ( 'inline-front-' . $i );
				$entries[] = array(
					'handle'      => $handle,
					'src'         => null,
					'deps'        => array(),
					'ver'         => null,
					'inlineAfter' => $css,
					'media'       => 'all',
					'source'      => 'front-html-inline',
				);
			}
		}

		return $entries;
	}

	/**
	 * @return string|null HTML body or null.
	 */
	private function fetch_front_html() {
		return Front_Html::fetch( home_url( '/' ) );
	}

	/**
	 * Merge stylesheet lists without dropping earlier enqueue order; prefer first handle.
	 *
	 * @param array[] $base    Existing entries.
	 * @param array[] $extra   Extra entries.
	 * @return array[]
	 */
	private function merge_stylesheet_entries( array $base, array $extra ) {
		$seen = array();
		$out  = array();
		foreach ( array_merge( $base, $extra ) as $entry ) {
			$handle = isset( $entry['handle'] ) ? (string) $entry['handle'] : '';
			$key    = $handle ? $handle : ( 'src:' . ( $entry['src'] ?? md5( (string) ( $entry['inlineAfter'] ?? '' ) ) ) );
			if ( isset( $seen[ $key ] ) ) {
				// Prefer entry that has inline CSS if the earlier one does not.
				$idx = $seen[ $key ];
				if ( empty( $out[ $idx ]['inlineAfter'] ) && ! empty( $entry['inlineAfter'] ) ) {
					$out[ $idx ] = $entry;
				}
				continue;
			}
			$seen[ $key ] = count( $out );
			$out[]        = $entry;
		}
		return $out;
	}

	/**
	 * @param string $abs Absolute path under wp-content.
	 * @return string|null Rel path under wp-content.
	 */
	private function wp_content_rel_from_abs( $abs ) {
		$abs  = wp_normalize_path( $abs );
		$root = wp_normalize_path( WP_CONTENT_DIR );
		if ( 0 === strpos( $abs, $root ) ) {
			return ltrim( substr( $abs, strlen( $root ) ), '/' );
		}
		return null;
	}

	/**
	 * @deprecated Use collect() with post IDs.
	 */
	public function collect_legacy( $front_id = 0 ) {
		return $this->collect( $front_id, array() );
	}

	/**
	 * Put WordPress in a singular page context for enqueue simulation.
	 *
	 * @param int $post_id Post ID.
	 */
	private function prime_post_context( $post_id ) {
		global $post;
		$post = get_post( $post_id ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride
		if ( ! $post ) {
			return;
		}
		setup_postdata( $post );
		if ( isset( $GLOBALS['wp_query'] ) ) {
			$GLOBALS['wp_query']->is_page               = true;
			$GLOBALS['wp_query']->is_singular           = true;
			$GLOBALS['wp_query']->queried_object        = $post;
			$GLOBALS['wp_query']->queried_object_id     = $post_id;
		}
	}

	/**
	 * Read a WP_Dependencies registry in dependency-resolved order.
	 *
	 * @param \WP_Dependencies $registry  Styles or scripts registry.
	 * @param bool             $is_script Whether this is the scripts registry.
	 * @return array[]
	 */
	private function read_registry( $registry, $is_script = false ) {
		if ( ! $registry || empty( $registry->queue ) ) {
			return array();
		}

		$registry->all_deps( $registry->queue );
		$handles = $registry->to_do ? $registry->to_do : $registry->queue;

		$out = array();
		foreach ( $handles as $handle ) {
			if ( ! isset( $registry->registered[ $handle ] ) ) {
				continue;
			}
			$dep = $registry->registered[ $handle ];

			$src = $dep->src;
			if ( $src && ! preg_match( '#^https?://#', $src ) && 0 !== strpos( (string) $src, '//' ) ) {
				$src = $registry->base_url . $src;
			}

			$ver = null;
			if ( isset( $dep->ver ) && $dep->ver ) {
				$ver = (string) $dep->ver;
			}

			$entry = array(
				'handle' => $handle,
				'src'    => $src ? $src : null,
				'deps'   => array_values( (array) $dep->deps ),
				'ver'    => $ver,
			);

			if ( $is_script ) {
				$before = $registry->get_data( $handle, 'before' );
				$after  = $registry->get_data( $handle, 'after' );
				$entry['inlineBefore'] = $this->flatten_inline( $before );
				$entry['inlineAfter']  = $this->flatten_inline( $after );
				$entry['position']     = ( isset( $dep->extra['group'] ) && $dep->extra['group'] ) ? 'footer' : 'head';

				$l10n = $registry->get_data( $handle, 'data' );
				if ( $l10n ) {
					$entry['inlineBefore'] = trim( (string) $l10n . "\n" . (string) $entry['inlineBefore'] );
				}
			} else {
				$after = $registry->get_data( $handle, 'after' );
				$entry['inlineAfter'] = $this->flatten_inline( $after );
				$entry['media']       = isset( $dep->args ) && $dep->args ? $dep->args : 'all';
			}

			$out[] = $entry;
		}

		return $out;
	}

	/**
	 * Flatten inline script/style data (may be array) into a string.
	 *
	 * @param mixed $data Inline data.
	 * @return string|null
	 */
	private function flatten_inline( $data ) {
		if ( empty( $data ) ) {
			return null;
		}
		if ( is_array( $data ) ) {
			$data = implode( "\n", array_filter( $data, 'is_string' ) );
		}
		$data = trim( (string) $data );
		return '' === $data ? null : $data;
	}
}

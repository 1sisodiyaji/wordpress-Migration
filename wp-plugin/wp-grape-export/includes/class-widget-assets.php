<?php
/**
 * Detects builder widgets used on exported posts and maps them to CSS/JS.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Scans Elementor trees (and rendered HTML) so export includes conditional
 * assets that only load on the real front-end (carousels, nav menus, etc.).
 */
class Widget_Assets {

	/**
	 * Widget type → plugin-relative asset paths (under wp-content/).
	 *
	 * @var array<string,string[]>
	 */
	const WIDGET_STYLES = array(
		'image-carousel'        => array(
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
			'plugins/elementor/assets/css/widget-image-carousel.min.css',
		),
		'media-carousel'        => array(
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
			'plugins/elementor-pro/assets/css/widget-carousel-module-base.min.css',
			'plugins/elementor-pro/assets/css/widget-media-carousel.min.css',
		),
		'nested-carousel'       => array(
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
			'plugins/elementor-pro/assets/css/widget-carousel-module-base.min.css',
			'plugins/elementor-pro/assets/css/widget-nested-carousel.min.css',
		),
		'testimonial-carousel'  => array(
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
			'plugins/elementor-pro/assets/css/widget-carousel-module-base.min.css',
			'plugins/elementor-pro/assets/css/widget-testimonial-carousel.min.css',
		),
		'carousel'              => array(
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
		),
		'slides'                => array(
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
			'plugins/elementor-pro/assets/css/widget-slides.min.css',
		),
		'loop-carousel'         => array(
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
			'plugins/elementor-pro/assets/css/widget-loop-common.min.css',
			'plugins/elementor-pro/assets/css/widget-loop-carousel.min.css',
		),
		'nav-menu'              => array(
			'plugins/elementor-pro/assets/css/widget-nav-menu.min.css',
		),
		'form'                  => array(
			'plugins/elementor-pro/assets/css/widget-form.min.css',
		),
		'icon-list'             => array(
			'plugins/elementor/assets/css/widget-icon-list.min.css',
		),
		'icon-box'              => array(
			'plugins/elementor/assets/css/widget-icon-box.min.css',
		),
		'social-icons'          => array(
			'plugins/elementor/assets/css/widget-social-icons.min.css',
		),
		'counter'               => array(
			'plugins/elementor/assets/css/widget-counter.min.css',
		),
		'accordion'             => array(
			'plugins/elementor/assets/css/widget-accordion.min.css',
		),
		'tabs'                  => array(
			'plugins/elementor/assets/css/widget-tabs.min.css',
		),
		'video'                 => array(
			'plugins/elementor/assets/css/widget-video.min.css',
		),
		'gallery'               => array(
			'plugins/elementor/assets/css/widget-gallery.min.css',
			'plugins/elementor/assets/css/conditionals/lightbox.min.css',
		),
	);

	/**
	 * Widget type → plugin-relative script paths (under wp-content/).
	 *
	 * @var array<string,string[]>
	 */
	const WIDGET_SCRIPTS = array(
		'image-carousel'       => array(
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
		),
		'media-carousel'       => array(
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
		),
		'nested-carousel'      => array(
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
		),
		'testimonial-carousel' => array(
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
		),
		'carousel'             => array(
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
		),
		'slides'               => array(
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
		),
		'loop-carousel'        => array(
			'plugins/elementor/assets/lib/swiper/v8/swiper.min.js',
		),
		'nav-menu'             => array(
			'plugins/elementor-pro/assets/lib/smartmenus/jquery.smartmenus.min.js',
		),
	);

	/**
	 * Always-safe Elementor / ElementsKit front-end assets.
	 *
	 * @var string[]
	 */
	const BASE_STYLES = array(
		'plugins/elementor/assets/css/frontend.min.css',
		'plugins/elementor/assets/lib/eicons/css/elementor-icons.min.css',
		'plugins/elementor/assets/css/widget-heading.min.css',
		'plugins/elementor/assets/css/widget-image.min.css',
		'plugins/elementor/assets/css/widget-divider.min.css',
		'plugins/elementskit-lite/modules/elementskit-icon-pack/assets/css/ekiticons.css',
		'plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css',
		'plugins/elementskit-lite/widgets/init/assets/css/responsive.css',
	);

	/**
	 * Elementor front-end runtime (always needed when Elementor is active).
	 *
	 * @var string[]
	 */
	const BASE_SCRIPTS = array(
		'plugins/elementor/assets/js/webpack.runtime.min.js',
		'plugins/elementor/assets/js/frontend-modules.min.js',
		'plugins/elementor/assets/js/frontend.min.js',
		'plugins/elementor-pro/assets/js/webpack-pro.runtime.min.js',
		'plugins/elementor-pro/assets/js/frontend.min.js',
		'plugins/elementor-pro/assets/js/elements-handlers.min.js',
	);

	/**
	 * Elementor kit / custom CSS under uploads.
	 *
	 * @var string[]
	 */
	const UPLOADS_ELEMENTOR_CSS = array(
		'uploads/elementor/css/custom-frontend.min.css',
		'uploads/elementor/css/custom-widget-icon-box.min.css',
		'uploads/elementor/css/custom-widget-icon-list.min.css',
		'uploads/elementor/css/custom-pro-widget-nav-menu.min.css',
		'uploads/elementor/css/base-desktop.css',
	);

	/**
	 * HTML class/markers → extra styles.
	 *
	 * @var array<string,string[]>
	 */
	const HTML_STYLE_SIGNALS = array(
		'swiper'     => array(
			'plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css',
			'plugins/elementor/assets/css/conditionals/e-swiper.min.css',
		),
		'ekit-'      => array(
			'plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css',
			'plugins/elementskit-lite/widgets/init/assets/css/responsive.css',
			'plugins/elementskit-lite/modules/elementskit-icon-pack/assets/css/ekiticons.css',
		),
		'elementor-animation-' => array(
			'plugins/elementor/assets/lib/animations/animations.min.css',
		),
		'data-aos'   => array(),
		'aos-'       => array(),
	);

	/**
	 * Active WP plugins that contribute front-end design / animation assets.
	 * Key = plugin basename. HTML signals are checked in rendered output.
	 *
	 * @var array<string,array{styles:string[],scripts:string[],htmlSignals:string[]}>
	 */
	const PLUGIN_PACKAGES = array(
		'elementskit-lite/elementskit-lite.php' => array(
			'styles'      => array(
				'plugins/elementskit-lite/modules/elementskit-icon-pack/assets/css/ekiticons.css',
				'plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css',
				'plugins/elementskit-lite/widgets/init/assets/css/responsive.css',
			),
			'scripts'     => array(
				'plugins/elementskit-lite/libs/framework/assets/js/frontend-script.js',
				'plugins/elementskit-lite/widgets/init/assets/js/widget-scripts.js',
				'plugins/elementskit-lite/widgets/init/assets/js/elementor.js',
				'plugins/elementskit-lite/widgets/init/assets/js/animate-circle.min.js',
			),
			'htmlSignals' => array( 'ekit-', 'elementskit' ),
		),
		'aos/aos.php' => array(
			'styles'      => array( 'plugins/aos/assets/css/aos.css' ),
			'scripts'     => array( 'plugins/aos/assets/js/aos.js' ),
			'htmlSignals' => array( 'data-aos', 'aos-init', 'aos-animate' ),
		),
		'gsap-animation-addon/gsap-animation-addon.php' => array(
			'styles'      => array(),
			'scripts'     => array( 'plugins/gsap-animation-addon/assets/js/gsap.min.js' ),
			'htmlSignals' => array( 'gsap', 'ScrollTrigger', 'data-speed' ),
		),
		'locomotive-scroll/locomotive-scroll.php' => array(
			'styles'      => array( 'plugins/locomotive-scroll/locomotive-scroll.css' ),
			'scripts'     => array( 'plugins/locomotive-scroll/locomotive-scroll.min.js' ),
			'htmlSignals' => array( 'locomotive-scroll', 'data-scroll', 'c-scrollbar' ),
		),
	);

	/**
	 * @var Elementor_Bridge
	 */
	private $elementor;

	/**
	 * @param Elementor_Bridge|null $elementor Optional bridge.
	 */
	public function __construct( Elementor_Bridge $elementor = null ) {
		$this->elementor = $elementor ? $elementor : new Elementor_Bridge();
	}

	/**
	 * Collect widget types used across post IDs.
	 *
	 * @param int[] $post_ids Post IDs.
	 * @return string[]
	 */
	public function scan_post_ids( array $post_ids ) {
		$widgets = array();

		foreach ( $post_ids as $post_id ) {
			$post_id = (int) $post_id;
			if ( ! $post_id ) {
				continue;
			}
			$data = $this->elementor->data( $post_id );
			if ( is_array( $data ) ) {
				$this->walk_elementor_tree( $data, $widgets );
			}

			// ElementsKit / shortcodes may only appear in rendered HTML.
			$html = $this->elementor->render( $post_id );
			if ( is_string( $html ) && '' !== $html ) {
				$this->scan_html_signals( $html, $widgets );
			} else {
				$post = get_post( $post_id );
				if ( $post && is_string( $post->post_content ) ) {
					$this->scan_html_signals( $post->post_content, $widgets );
				}
			}
		}

		return array_values( array_unique( array_filter( $widgets ) ) );
	}

	/**
	 * Build a per-page/profile descriptor: widgets, animations, plugin deps, asset paths.
	 * Used for pages/{key}/assets.json and export completeness audits.
	 *
	 * @param int $post_id Post ID.
	 * @return array
	 */
	public function build_page_profile( $post_id ) {
		$post_id = (int) $post_id;
		$widgets = array();
		$animations = array();
		$html = '';

		$data = $this->elementor->data( $post_id );
		if ( is_array( $data ) ) {
			$this->walk_elementor_tree( $data, $widgets );
			$animations = $this->scan_animations_from_tree( $data );
		}

		if ( Elementor_Bridge::is_built_with( $post_id ) ) {
			$html = $this->elementor->render( $post_id );
		}
		if ( ! is_string( $html ) || '' === $html ) {
			$post = get_post( $post_id );
			$html = $post && is_string( $post->post_content ) ? $post->post_content : '';
		}
		if ( $html ) {
			$this->scan_html_signals( $html, $widgets );
			$animations = array_merge( $animations, $this->scan_animations_from_html( $html ) );
		}

		$widgets    = array_values( array_unique( array_filter( $widgets ) ) );
		$animations = array_values( array_unique( array_filter( $animations ) ) );
		$plugins    = $this->detect_plugin_packages( $html );
		$paths      = $this->required_paths( $widgets );
		$paths      = $this->merge_paths( $paths, $this->animation_paths( $animations ) );
		$paths      = $this->merge_paths( $paths, $this->plugin_package_paths( $plugins ) );

		return array(
			'postId'     => $post_id,
			'widgets'    => $widgets,
			'animations' => $animations,
			'plugins'    => $plugins,
			'styles'     => $paths['styles'],
			'scripts'    => $paths['scripts'],
			'postCss'    => is_readable( WP_CONTENT_DIR . '/uploads/elementor/css/post-' . $post_id . '.css' )
				? 'uploads/elementor/css/post-' . $post_id . '.css'
				: null,
		);
	}

	/**
	 * Site-wide inventory across all exported posts (for audit + union asset copy).
	 *
	 * @param int[] $post_ids Post IDs.
	 * @return array{widgets:string[],animations:string[],plugins:string[],styles:string[],scripts:string[],pages:array[]}
	 */
	public function site_inventory( array $post_ids ) {
		$widgets    = array();
		$animations = array();
		$plugins    = array();
		$styles     = array();
		$scripts    = array();
		$pages      = array();

		foreach ( $post_ids as $post_id ) {
			$profile = $this->build_page_profile( $post_id );
			$pages[] = array(
				'postId'     => $profile['postId'],
				'widgets'    => $profile['widgets'],
				'animations' => $profile['animations'],
				'plugins'    => $profile['plugins'],
			);
			$widgets    = array_merge( $widgets, $profile['widgets'] );
			$animations = array_merge( $animations, $profile['animations'] );
			$plugins    = array_merge( $plugins, $profile['plugins'] );
			$styles     = array_merge( $styles, $profile['styles'] );
			$scripts    = array_merge( $scripts, $profile['scripts'] );
		}

		return array(
			'widgets'    => array_values( array_unique( $widgets ) ),
			'animations' => array_values( array_unique( $animations ) ),
			'plugins'    => array_values( array_unique( $plugins ) ),
			'styles'     => array_values( array_unique( $styles ) ),
			'scripts'    => array_values( array_unique( $scripts ) ),
			'pages'      => $pages,
		);
	}

	/**
	 * Enqueue everything required for a site inventory (union of all pages).
	 *
	 * @param array $inventory From site_inventory().
	 */
	public function enqueue_inventory( array $inventory ) {
		$this->enqueue_for_widgets( $inventory['widgets'] ?? array() );

		foreach ( $inventory['styles'] ?? array() as $rel ) {
			$this->enqueue_style_path( $rel );
		}
		foreach ( $inventory['scripts'] ?? array() as $rel ) {
			$this->enqueue_script_path( $rel );
		}
	}

	/**
	 * Copy all assets referenced by a site inventory.
	 *
	 * @param Bundle_Writer $writer    Bundle writer.
	 * @param array         $inventory Site inventory.
	 * @return int Files copied.
	 */
	public function copy_inventory( Bundle_Writer $writer, array $inventory ) {
		$copied = $this->copy_for_widgets( $writer, $inventory['widgets'] ?? array() );
		$rels   = array_merge( $inventory['styles'] ?? array(), $inventory['scripts'] ?? array() );

		foreach ( array_unique( $rels ) as $rel ) {
			$source = WP_CONTENT_DIR . '/' . $rel;
			if ( ! is_readable( $source ) ) {
				continue;
			}
			if ( $writer->copy( $source, 'assets/wp-content/' . $rel ) ) {
				$copied++;
			}
		}

		return $copied;
	}

	/**
	 * Audit which required asset files are missing on disk.
	 *
	 * @param array $inventory Site inventory.
	 * @return string[] Missing wp-content-relative paths.
	 */
	public function missing_assets( array $inventory ) {
		$missing = array();
		$rels    = array_unique( array_merge( $inventory['styles'] ?? array(), $inventory['scripts'] ?? array() ) );

		foreach ( $rels as $rel ) {
			if ( ! is_readable( WP_CONTENT_DIR . '/' . $rel ) ) {
				$missing[] = $rel;
			}
		}

		return $missing;
	}

	/**
	 * Resolve style + script paths required for the given widget set.
	 *
	 * @param string[] $widgets Widget types.
	 * @return array{styles:string[],scripts:string[]}
	 */
	public function required_paths( array $widgets ) {
		$styles  = self::BASE_STYLES;
		$scripts = Elementor_Bridge::available() ? self::BASE_SCRIPTS : array();

		foreach ( $widgets as $widget ) {
			$widget = sanitize_key( (string) $widget );
			if ( isset( self::WIDGET_STYLES[ $widget ] ) ) {
				$styles = array_merge( $styles, self::WIDGET_STYLES[ $widget ] );
			}
			if ( isset( self::WIDGET_SCRIPTS[ $widget ] ) ) {
				$scripts = array_merge( $scripts, self::WIDGET_SCRIPTS[ $widget ] );
			}
			// ElementsKit widgets register as ekit-* inside Elementor.
			if ( 0 === strpos( $widget, 'elementskit-' ) || 0 === strpos( $widget, 'ekit-' ) ) {
				$styles[] = 'plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css';
				$styles[] = 'plugins/elementskit-lite/widgets/init/assets/css/responsive.css';
				$styles[] = 'plugins/elementskit-lite/modules/elementskit-icon-pack/assets/css/ekiticons.css';
			}
		}

		$styles  = array_values( array_unique( $styles ) );
		$scripts = array_values( array_unique( $scripts ) );

		return array(
			'styles'  => $styles,
			'scripts' => $scripts,
		);
	}

	/**
	 * Register + enqueue resolved paths so they appear in the asset manifest.
	 *
	 * @param string[] $widgets Widget types.
	 */
	public function enqueue_for_widgets( array $widgets ) {
		$paths = $this->required_paths( $widgets );

		foreach ( $paths['styles'] as $rel ) {
			$this->enqueue_style_path( $rel );
		}
		foreach ( $paths['scripts'] as $rel ) {
			$this->enqueue_script_path( $rel );
		}

		$this->enqueue_theme_styles();
	}

	/**
	 * Copy resolved widget assets + kit CSS into the export bundle.
	 *
	 * @param Bundle_Writer $writer   Bundle writer.
	 * @param string[]      $widgets  Widget types.
	 * @return int Number of files copied.
	 */
	public function copy_for_widgets( Bundle_Writer $writer, array $widgets ) {
		$paths  = $this->required_paths( $widgets );
		$rels   = array_merge( $paths['styles'], $paths['scripts'], self::UPLOADS_ELEMENTOR_CSS );
		$copied = 0;

		foreach ( $rels as $rel ) {
			$source = WP_CONTENT_DIR . '/' . $rel;
			if ( ! is_readable( $source ) ) {
				continue;
			}
			$dest = 'assets/wp-content/' . $rel;
			if ( $writer->copy( $source, $dest ) ) {
				$copied++;
			}
		}

		// Theme stylesheet (Astra / child theme).
		$theme_css = get_stylesheet_directory() . '/style.css';
		if ( is_readable( $theme_css ) ) {
			$theme_rel = 'themes/' . get_stylesheet() . '/style.css';
			if ( $writer->copy( $theme_css, 'assets/wp-content/' . $theme_rel ) ) {
				$copied++;
			}
		}

		$astra_main = get_template_directory() . '/assets/css/minified/main.min.css';
		if ( is_readable( $astra_main ) ) {
			if ( $writer->copy( $astra_main, 'assets/wp-content/themes/' . get_template() . '/assets/css/minified/main.min.css' ) ) {
				$copied++;
			}
		}

		return $copied;
	}

	/**
	 * Walk an Elementor JSON tree and collect widgetType values.
	 *
	 * @param array  $nodes   Nodes.
	 * @param string[] $widgets Accumulator.
	 */
	private function walk_elementor_tree( array $nodes, array &$widgets ) {
		foreach ( $nodes as $node ) {
			if ( ! is_array( $node ) ) {
				continue;
			}
			if ( ! empty( $node['widgetType'] ) ) {
				$widgets[] = (string) $node['widgetType'];
			}
			if ( ! empty( $node['elements'] ) && is_array( $node['elements'] ) ) {
				$this->walk_elementor_tree( $node['elements'], $widgets );
			}
		}
	}

	/**
	 * Infer widgets / style signals from rendered HTML.
	 *
	 * @param string   $html    HTML or content.
	 * @param string[] $widgets Accumulator.
	 */
	private function scan_html_signals( $html, array &$widgets ) {
		if ( ! is_string( $html ) || '' === $html ) {
			return;
		}

		if ( false !== stripos( $html, 'swiper' ) || false !== stripos( $html, 'image-carousel' ) ) {
			$widgets[] = 'image-carousel';
		}
		if ( false !== stripos( $html, 'ekit-' ) || false !== stripos( $html, 'elementskit' ) ) {
			$widgets[] = 'elementskit-widget';
		}
		if ( preg_match_all( '/elementor-widget-([a-z0-9_-]+)/i', $html, $matches ) ) {
			foreach ( $matches[1] as $type ) {
				$widgets[] = sanitize_key( $type );
			}
		}
	}

	/**
	 * Register + enqueue a style by wp-content-relative path.
	 *
	 * @param string $rel Path under wp-content/.
	 */
	private function enqueue_style_path( $rel ) {
		$abs = WP_CONTENT_DIR . '/' . $rel;
		if ( ! is_readable( $abs ) ) {
			return;
		}
		$handle = 'wpge-' . md5( $rel );
		if ( ! wp_style_is( $handle, 'registered' ) ) {
			wp_register_style( $handle, content_url( $rel ), array(), null );
		}
		if ( ! wp_style_is( $handle, 'enqueued' ) ) {
			wp_enqueue_style( $handle );
		}
	}

	/**
	 * Register + enqueue a script by wp-content-relative path.
	 *
	 * @param string $rel Path under wp-content/.
	 */
	private function enqueue_script_path( $rel ) {
		$abs = WP_CONTENT_DIR . '/' . $rel;
		if ( ! is_readable( $abs ) ) {
			return;
		}
		$handle = 'wpge-' . md5( $rel );
		if ( ! wp_script_is( $handle, 'registered' ) ) {
			wp_register_script( $handle, content_url( $rel ), array( 'jquery' ), null, true );
		}
		if ( ! wp_script_is( $handle, 'enqueued' ) ) {
			wp_enqueue_script( $handle );
		}
	}

	/**
	 * Enqueue the active theme stylesheet handles.
	 */
	private function enqueue_theme_styles() {
		$theme = wp_get_theme();
		if ( $theme->parent() ) {
			$parent = $theme->parent()->get_stylesheet();
			if ( $parent ) {
				wp_enqueue_style( $parent . '-style', get_template_directory_uri() . '/style.css', array(), $theme->parent()->get( 'Version' ) );
			}
		}
		wp_enqueue_style( $theme->get_stylesheet() . '-style', get_stylesheet_uri(), array(), $theme->get( 'Version' ) );
	}

	/**
	 * Detect third-party design plugins whose assets should ship in the bundle.
	 *
	 * @param string $html Rendered HTML for signal matching.
	 * @return string[] Plugin basenames.
	 */
	private function detect_plugin_packages( $html ) {
		$active = (array) get_option( 'active_plugins', array() );
		$found  = array();

		foreach ( self::PLUGIN_PACKAGES as $basename => $pkg ) {
			if ( ! in_array( $basename, $active, true ) ) {
				continue;
			}
			$signals = isset( $pkg['htmlSignals'] ) ? (array) $pkg['htmlSignals'] : array();
			$match   = empty( $signals );
			foreach ( $signals as $signal ) {
				if ( is_string( $html ) && false !== stripos( $html, $signal ) ) {
					$match = true;
					break;
				}
			}
			if ( $match ) {
				$found[] = $basename;
			}
		}

		if ( Elementor_Bridge::available() ) {
			$found[] = 'elementor/elementor.php';
		}
		if ( is_plugin_active_safe( 'elementor-pro/elementor-pro.php' ) ) {
			$found[] = 'elementor-pro/elementor-pro.php';
		}

		return array_values( array_unique( $found ) );
	}

	/**
	 * Resolve asset paths for matched plugin packages.
	 *
	 * @param string[] $plugin_basenames Plugin basenames.
	 * @return array{styles:string[],scripts:string[]}
	 */
	private function plugin_package_paths( array $plugin_basenames ) {
		$styles  = array();
		$scripts = array();

		foreach ( $plugin_basenames as $basename ) {
			if ( ! isset( self::PLUGIN_PACKAGES[ $basename ] ) ) {
				continue;
			}
			$pkg = self::PLUGIN_PACKAGES[ $basename ];
			if ( ! empty( $pkg['styles'] ) ) {
				$styles = array_merge( $styles, (array) $pkg['styles'] );
			}
			if ( ! empty( $pkg['scripts'] ) ) {
				$scripts = array_merge( $scripts, (array) $pkg['scripts'] );
			}
		}

		return array(
			'styles'  => array_values( array_unique( $styles ) ),
			'scripts' => array_values( array_unique( $scripts ) ),
		);
	}

	/**
	 * Scan Elementor JSON for entrance / hover animation settings.
	 *
	 * @param array $nodes Elementor tree.
	 * @return string[] Animation names.
	 */
	private function scan_animations_from_tree( array $nodes ) {
		$out = array();
		foreach ( $nodes as $node ) {
			if ( ! is_array( $node ) ) {
				continue;
			}
			$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : array();
			foreach ( array( '_animation', 'animation', '_hover_animation', 'hover_animation' ) as $key ) {
				if ( empty( $settings[ $key ] ) || 'none' === $settings[ $key ] ) {
					continue;
				}
				$out[] = sanitize_key( (string) $settings[ $key ] );
			}
			if ( ! empty( $node['elements'] ) && is_array( $node['elements'] ) ) {
				$out = array_merge( $out, $this->scan_animations_from_tree( $node['elements'] ) );
			}
		}
		return $out;
	}

	/**
	 * Scan rendered HTML for animation class names.
	 *
	 * @param string $html HTML.
	 * @return string[]
	 */
	private function scan_animations_from_html( $html ) {
		$out = array();
		if ( ! is_string( $html ) || '' === $html ) {
			return $out;
		}
		if ( preg_match_all( '/elementor-animation-([a-z0-9_-]+)/i', $html, $matches ) ) {
			foreach ( $matches[1] as $name ) {
				$out[] = sanitize_key( $name );
			}
		}
		if ( preg_match_all( '/animation[_-]([a-z0-9_-]+)/i', $html, $matches ) ) {
			foreach ( $matches[1] as $name ) {
				$out[] = sanitize_key( $name );
			}
		}
		return $out;
	}

	/**
	 * Map animation names to Elementor animation stylesheets.
	 *
	 * @param string[] $animations Animation names.
	 * @return array{styles:string[],scripts:string[]}
	 */
	private function animation_paths( array $animations ) {
		$styles = array();
		if ( empty( $animations ) ) {
			return array( 'styles' => array(), 'scripts' => array() );
		}

		$styles[] = 'plugins/elementor/assets/lib/animations/animations.min.css';
		foreach ( $animations as $name ) {
			$name = sanitize_file_name( $name );
			if ( ! $name ) {
				continue;
			}
			$candidates = array(
				'plugins/elementor/assets/lib/animations/styles/' . $name . '.min.css',
				'plugins/elementor/assets/lib/animations/styles/e-animation-' . $name . '.min.css',
			);
			foreach ( $candidates as $rel ) {
				if ( is_readable( WP_CONTENT_DIR . '/' . $rel ) ) {
					$styles[] = $rel;
					break;
				}
			}
		}

		return array(
			'styles'  => array_values( array_unique( $styles ) ),
			'scripts' => array(),
		);
	}

	/**
	 * Merge two path maps.
	 *
	 * @param array $a First map.
	 * @param array $b Second map.
	 * @return array{styles:string[],scripts:string[]}
	 */
	private function merge_paths( array $a, array $b ) {
		return array(
			'styles'  => array_values( array_unique( array_merge( $a['styles'] ?? array(), $b['styles'] ?? array() ) ) ),
			'scripts' => array_values( array_unique( array_merge( $a['scripts'] ?? array(), $b['scripts'] ?? array() ) ) ),
		);
	}
}

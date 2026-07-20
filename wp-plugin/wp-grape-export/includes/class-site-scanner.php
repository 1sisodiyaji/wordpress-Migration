<?php
/**
 * Collects site meta, detects the page builder and enumerates routes.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads global site information and the list of public routes to export.
 */
class Site_Scanner {

	/**
	 * Post types that are public in WP but must never become site routes.
	 * They belong in templates/layout only (Theme Builder / ElementsKit / kits).
	 *
	 * @var string[]
	 */
	const EXCLUDED_ROUTE_POST_TYPES = array(
		'attachment',
		'elementor_library',
		'e-floating-buttons',
		'elementskit_template',
		'elementskit_content',
		'elementskit_widget',
		'wpcf7_contact_form',
	);

	/**
	 * Elementor `_elementor_template_type` values that are library items, not pages.
	 *
	 * @var string[]
	 */
	const EXCLUDED_ELEMENTOR_TEMPLATE_TYPES = array(
		'kit',
		'header',
		'footer',
		'section',
		'popup',
		'widget',
		'loop-item',
		'loop',
		'admin-page',
		'error-404',
		'search-results',
		'single',
		'single-post',
		'single-page',
		'archive',
		'product',
		'product-archive',
	);

	/**
	 * Export arguments.
	 *
	 * @var array
	 */
	private $args;

	/**
	 * @param array $args Export arguments (expects 'post_types').
	 */
	public function __construct( array $args ) {
		$this->args = $args;
		if ( isset( $this->args['post_types'] ) ) {
			$this->args['post_types'] = self::sanitize_route_post_types( (array) $this->args['post_types'] );
		}
	}

	/**
	 * Strip library/template CPTs from a post_types list.
	 *
	 * @param string[] $post_types Requested types.
	 * @return string[]
	 */
	public static function sanitize_route_post_types( array $post_types ) {
		$out = array();
		foreach ( $post_types as $type ) {
			$type = sanitize_key( (string) $type );
			if ( ! $type || in_array( $type, self::EXCLUDED_ROUTE_POST_TYPES, true ) ) {
				continue;
			}
			$out[] = $type;
		}
		if ( empty( $out ) ) {
			$out = array( 'page', 'post' );
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * Build the site descriptor.
	 *
	 * @return array
	 */
	public function site() {
		$theme = wp_get_theme();

		return array(
			'name'           => get_bloginfo( 'name' ),
			'description'    => get_bloginfo( 'description' ),
			'url'            => site_url(),
			'home'           => home_url(),
			'language'       => get_bloginfo( 'language' ),
			'timezone'       => wp_timezone_string(),
			'charset'        => get_bloginfo( 'charset' ),
			'pageBuilder'    => $this->detect_builder(),
			'theme'          => array(
				'name'         => $theme->get( 'Name' ),
				'stylesheet'   => get_stylesheet(),
				'template'     => get_template(),
				'version'      => $theme->get( 'Version' ),
				'hasThemeJson' => (bool) ( method_exists( 'WP_Theme_JSON_Resolver', 'theme_has_support' ) && \WP_Theme_JSON_Resolver::theme_has_support() ),
			),
			'activePlugins'  => $this->active_plugins(),
			'builderPlugins' => $this->builder_plugins(),
		);
	}

	/**
	 * Detect the primary page builder used by the front page / most pages.
	 *
	 * @return string
	 */
	public function detect_builder() {
		if ( defined( 'ELEMENTOR_VERSION' ) || is_plugin_active_safe( 'elementor/elementor.php' ) ) {
			$front = $this->front_page_id();
			if ( $front && get_post_meta( $front, '_elementor_edit_mode', true ) === 'builder' ) {
				return 'elementor';
			}
			return 'elementor';
		}

		if ( function_exists( 'has_blocks' ) ) {
			$front = $this->front_page_id();
			if ( $front && has_blocks( get_post_field( 'post_content', $front ) ) ) {
				return 'gutenberg';
			}
		}

		if ( defined( 'ET_BUILDER_VERSION' ) ) {
			return 'divi';
		}
		if ( defined( 'WPB_VC_VERSION' ) ) {
			return 'wpbakery';
		}

		return 'classic';
	}

	/**
	 * Enumerate public routes to export (real pages/posts only — not Theme Builder templates).
	 *
	 * @return array[] Array of route descriptors (pre-file-path).
	 */
	public function routes() {
		$routes   = array();
		$front_id = $this->front_page_id();
		$seen     = array();

		$post_types = self::sanitize_route_post_types( (array) $this->args['post_types'] );

		foreach ( $post_types as $post_type ) {
			if ( ! post_type_exists( $post_type ) ) {
				continue;
			}

			$posts = get_posts(
				array(
					'post_type'        => $post_type,
					'post_status'      => 'publish',
					'numberposts'      => -1,
					'suppress_filters' => false,
					'orderby'          => 'menu_order title',
					'order'            => 'ASC',
				)
			);

			foreach ( $posts as $post ) {
				if ( isset( $seen[ $post->ID ] ) ) {
					continue;
				}
				if ( ! $this->is_exportable_route_post( $post ) ) {
					continue;
				}
				$seen[ $post->ID ] = true;

				$permalink = get_permalink( $post );
				$path      = $this->url_to_path( $permalink, $post );
				if ( null === $path ) {
					continue;
				}

				$is_front = ( (int) $post->ID === (int) $front_id );
				if ( $is_front ) {
					$path = '/';
				}

				$routes[] = array(
					'id'          => (int) $post->ID,
					'path'        => $path,
					'slug'        => $post->post_name,
					'type'        => $is_front ? 'home' : ( 'page' === $post_type ? 'page' : ( 'post' === $post_type ? 'post' : 'cpt' ) ),
					'postType'    => $post_type,
					'title'       => get_the_title( $post ),
					'status'      => $post->post_status,
					'pageBuilder' => $this->post_builder( $post->ID ),
					'template'    => get_page_template_slug( $post->ID ),
					'parentId'    => $post->post_parent ? (int) $post->post_parent : null,
					'menuOrder'   => (int) $post->menu_order,
					'isFront'     => $is_front,
				);
			}
		}

		$routes = $this->dedupe_routes_by_path( $routes );

		usort(
			$routes,
			static function ( $a, $b ) {
				if ( '/' === $a['path'] ) {
					return -1;
				}
				if ( '/' === $b['path'] ) {
					return 1;
				}
				return strcmp( $a['path'], $b['path'] );
			}
		);

		return $routes;
	}

	/**
	 * Whether a post should become a navigable site route.
	 *
	 * @param \WP_Post $post Post.
	 * @return bool
	 */
	private function is_exportable_route_post( $post ) {
		if ( ! $post instanceof \WP_Post ) {
			return false;
		}
		if ( in_array( $post->post_type, self::EXCLUDED_ROUTE_POST_TYPES, true ) ) {
			return false;
		}

		$el_type = (string) get_post_meta( $post->ID, '_elementor_template_type', true );
		if ( $el_type && in_array( $el_type, self::EXCLUDED_ELEMENTOR_TEMPLATE_TYPES, true ) ) {
			return false;
		}
		// Elementor "wp-post" on ElementsKit templates is still a library item.
		if ( 'wp-post' === $el_type && in_array( $post->post_type, array( 'elementskit_template', 'elementor_library' ), true ) ) {
			return false;
		}

		$ekit = (string) (
			get_post_meta( $post->ID, 'ekit_template_type', true )
			?: get_post_meta( $post->ID, '_ekit_template_type', true )
		);
		if ( $ekit && in_array( strtolower( $ekit ), array( 'header', 'footer', 'section', 'mega-menu', 'popup' ), true ) ) {
			return false;
		}

		return true;
	}

	/**
	 * Keep one route per path. Prefer front page, then page, then lower menu order.
	 *
	 * @param array[] $routes Routes.
	 * @return array[]
	 */
	private function dedupe_routes_by_path( array $routes ) {
		$by_path = array();
		foreach ( $routes as $route ) {
			$path = $route['path'];
			if ( ! isset( $by_path[ $path ] ) ) {
				$by_path[ $path ] = $route;
				continue;
			}
			$existing = $by_path[ $path ];
			if ( ! empty( $route['isFront'] ) ) {
				$by_path[ $path ] = $route;
				continue;
			}
			if ( ! empty( $existing['isFront'] ) ) {
				continue;
			}
			if ( 'page' === $route['postType'] && 'page' !== $existing['postType'] ) {
				$by_path[ $path ] = $route;
				continue;
			}
			if ( $route['menuOrder'] < $existing['menuOrder'] ) {
				$by_path[ $path ] = $route;
			}
		}
		return array_values( $by_path );
	}

	/**
	 * Determine the builder used by a single post.
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public function post_builder( $post_id ) {
		if ( get_post_meta( $post_id, '_elementor_edit_mode', true ) === 'builder' ) {
			return 'elementor';
		}
		$content = get_post_field( 'post_content', $post_id );
		if ( function_exists( 'has_blocks' ) && has_blocks( $content ) ) {
			return 'gutenberg';
		}
		return 'classic';
	}

	/**
	 * Front page (static) ID, or the latest-post-page front where applicable.
	 *
	 * @return int
	 */
	public function front_page_id() {
		$front = (int) get_option( 'page_on_front' );
		if ( $front ) {
			return $front;
		}
		return 0;
	}

	/**
	 * Convert an absolute permalink to a site-relative path.
	 * Returns null when the URL is a query-string CPT permalink (not a real route).
	 *
	 * @param string        $url  Permalink.
	 * @param \WP_Post|null $post Optional post (for slug fallback).
	 * @return string|null
	 */
	private function url_to_path( $url, $post = null ) {
		$parts = wp_parse_url( (string) $url );
		if ( ! is_array( $parts ) ) {
			return null;
		}

		// Library CPTs use ?elementor_library=… / ?elementskit_template=… — not routes.
		if ( ! empty( $parts['query'] ) ) {
			parse_str( $parts['query'], $query );
			foreach ( array( 'elementor_library', 'elementskit_template', 'elementskit_content', 'p', 'page_id', 'preview' ) as $bad ) {
				if ( isset( $query[ $bad ] ) && 'p' !== $bad && 'page_id' !== $bad ) {
					return null;
				}
			}
			// Bare ?p=123 without a pretty path is not a stable public route.
			if ( isset( $query['p'] ) || isset( $query['page_id'] ) ) {
				if ( empty( $parts['path'] ) || '/' === $parts['path'] ) {
					if ( $post && ! empty( $post->post_name ) ) {
						return '/' . $post->post_name;
					}
					return null;
				}
			}
		}

		$path = isset( $parts['path'] ) ? $parts['path'] : '/';

		$home_path = wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		$home_path = is_string( $home_path ) ? untrailingslashit( $home_path ) : '';
		if ( $home_path && '/' !== $home_path && 0 === strpos( $path, $home_path ) ) {
			$path = substr( $path, strlen( $home_path ) );
			if ( false === $path || '' === $path ) {
				$path = '/';
			}
		}

		$path = '/' . trim( (string) $path, '/' );
		if ( '/' === $path ) {
			return '/';
		}

		return $path;
	}

	/**
	 * List of active plugin basenames.
	 *
	 * @return string[]
	 */
	private function active_plugins() {
		$active = (array) get_option( 'active_plugins', array() );
		if ( is_multisite() ) {
			$network = (array) get_site_option( 'active_sitewide_plugins', array() );
			$active  = array_merge( $active, array_keys( $network ) );
		}
		return array_values( array_unique( $active ) );
	}

	/**
	 * Subset of active plugins that affect layout/rendering.
	 *
	 * @return string[]
	 */
	private function builder_plugins() {
		$needles = array( 'elementor', 'elementskit', 'divi', 'js_composer', 'beaver', 'brizy', 'oxygen', 'astra' );
		$out     = array();
		foreach ( $this->active_plugins() as $plugin ) {
			foreach ( $needles as $needle ) {
				if ( false !== stripos( $plugin, $needle ) ) {
					$out[] = $plugin;
					break;
				}
			}
		}
		return array_values( array_unique( $out ) );
	}
}

if ( ! function_exists( 'WpGrapeExport\\is_plugin_active_safe' ) ) {
	/**
	 * is_plugin_active() is only defined in admin context; provide a safe wrapper.
	 *
	 * @param string $plugin Plugin basename.
	 * @return bool
	 */
	function is_plugin_active_safe( $plugin ) {
		$active = (array) get_option( 'active_plugins', array() );
		return in_array( $plugin, $active, true );
	}
}

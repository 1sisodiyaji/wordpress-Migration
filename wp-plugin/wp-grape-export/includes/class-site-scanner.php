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
			// Confirm at least one page is built with Elementor.
			$front = $this->front_page_id();
			if ( $front && get_post_meta( $front, '_elementor_edit_mode', true ) === 'builder' ) {
				return 'elementor';
			}
			// Fall through: Elementor active but front page may be classic.
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
	 * Enumerate public routes to export.
	 *
	 * @return array[] Array of route descriptors (pre-file-path).
	 */
	public function routes() {
		$routes    = array();
		$front_id  = $this->front_page_id();
		$seen      = array();

		$post_types = (array) $this->args['post_types'];

		foreach ( $post_types as $post_type ) {
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
				$seen[ $post->ID ] = true;

				$permalink = get_permalink( $post );
				$path      = $this->url_to_path( $permalink );
				$is_front  = ( (int) $post->ID === (int) $front_id );

				$routes[] = array(
					'id'          => (int) $post->ID,
					'path'        => $is_front ? '/' : $path,
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

		// Ensure the front page sorts first.
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
		// "Latest posts" front page has no single post ID; fall back to 0.
		return 0;
	}

	/**
	 * Convert an absolute permalink to a site-relative path.
	 *
	 * @param string $url Permalink.
	 * @return string
	 */
	private function url_to_path( $url ) {
		$home = home_url();
		$path = str_replace( $home, '', $url );
		$path = wp_parse_url( $path, PHP_URL_PATH );
		if ( ! $path ) {
			$path = '/';
		}
		return '/' . trim( $path, '/' );
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

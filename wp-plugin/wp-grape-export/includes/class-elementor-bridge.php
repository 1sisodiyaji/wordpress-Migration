<?php
/**
 * Bridge to Elementor rendering + data APIs.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wraps Elementor's frontend renderer so pages/templates can be exported
 * as fully rendered HTML plus their raw _elementor_data tree.
 */
class Elementor_Bridge {

	/**
	 * In-progress render stack (guards nested template cycles).
	 *
	 * @var array<int,true>
	 */
	private $render_stack = array();

	/**
	 * Whether Elementor is available.
	 *
	 * @return bool
	 */
	public static function available() {
		return did_action( 'elementor/loaded' ) || class_exists( '\\Elementor\\Plugin' );
	}

	/**
	 * Whether a post is built with Elementor.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function is_built_with( $post_id ) {
		return get_post_meta( $post_id, '_elementor_edit_mode', true ) === 'builder';
	}

	/**
	 * Render a post's Elementor content for display.
	 *
	 * Sets up front-end post context (required for many widgets/shortcodes),
	 * then optionally runs {@see Shortcode_Resolver} so template embeds and
	 * leftover `[shortcodes]` become real HTML in the export.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $opts {
	 *     @type bool $resolve_shortcodes Expand shortcodes/templates after render (default true).
	 * }
	 * @return string Rendered HTML (empty string on failure).
	 */
	public function render( $post_id, $opts = array() ) {
		$post_id = (int) $post_id;
		if ( ! $post_id || ! self::available() ) {
			return '';
		}
		if ( isset( $this->render_stack[ $post_id ] ) ) {
			return '';
		}

		$opts = wp_parse_args(
			$opts,
			array(
				'resolve_shortcodes' => true,
			)
		);

		$this->render_stack[ $post_id ] = true;

		$previous_post = isset( $GLOBALS['post'] ) ? $GLOBALS['post'] : null;
		$post          = get_post( $post_id );
		$html          = '';

		try {
			if ( $post ) {
				// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
				$GLOBALS['post'] = $post;
				setup_postdata( $post );
			}

			$plugin = \Elementor\Plugin::$instance;
			if ( $plugin && isset( $plugin->frontend ) && method_exists( $plugin->frontend, 'get_builder_content_for_display' ) ) {
				// with_css = true so the per-post CSS is registered/enqueued.
				$rendered = $plugin->frontend->get_builder_content_for_display( $post_id, true );
				$html     = is_string( $rendered ) ? $rendered : '';
			}

			if ( $opts['resolve_shortcodes'] && '' !== $html && false !== strpos( $html, '[' ) ) {
				$resolver = new Shortcode_Resolver( $this );
				$html     = $resolver->resolve(
					$html,
					array(
						'postId' => $post_id,
					)
				);
			}
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
			$html = is_string( $html ) ? $html : '';
		} finally {
			unset( $this->render_stack[ $post_id ] );
			if ( $previous_post ) {
				// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
				$GLOBALS['post'] = $previous_post;
				setup_postdata( $previous_post );
			} elseif ( $post ) {
				wp_reset_postdata();
			}
		}

		return $html;
	}

	/**
	 * Get the raw _elementor_data tree for a post.
	 *
	 * @param int $post_id Post ID.
	 * @return array|null Decoded JSON tree, or null.
	 */
	public function data( $post_id ) {
		$raw = get_post_meta( $post_id, '_elementor_data', true );
		if ( empty( $raw ) ) {
			return null;
		}
		if ( is_string( $raw ) ) {
			$decoded = json_decode( $raw, true );
			return is_array( $decoded ) ? $decoded : null;
		}
		if ( is_object( $raw ) ) {
			$raw = json_decode( wp_json_encode( $raw ), true );
		}
		return is_array( $raw ) ? $this->to_array_deep( $raw ) : null;
	}

	/**
	 * Recursively cast stdClass nodes to associative arrays.
	 *
	 * @param mixed $value Value.
	 * @return mixed
	 */
	private function to_array_deep( $value ) {
		if ( is_object( $value ) ) {
			$value = (array) $value;
		}
		if ( is_array( $value ) ) {
			foreach ( $value as $k => $v ) {
				$value[ $k ] = $this->to_array_deep( $v );
			}
		}
		return $value;
	}

	/**
	 * Elementor document type for a post (wp-page, header, footer, etc.).
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public function document_type( $post_id ) {
		return (string) get_post_meta( $post_id, '_elementor_template_type', true );
	}

	/**
	 * Collect nested Elementor template IDs referenced by a document.
	 *
	 * @param int $post_id Post ID.
	 * @return int[]
	 */
	public function nested_template_ids( $post_id ) {
		$tree = $this->data( $post_id );
		if ( ! $tree ) {
			return array();
		}
		$resolver = new Shortcode_Resolver( $this );
		$found    = $resolver->collect_from_elementor_data( $tree );
		$ids      = array();
			foreach ( $found as $row ) {
			if ( ! empty( $row['templateId'] ) ) {
				$ids[] = (int) $row['templateId'];
				continue;
			}
			$attrs = isset( $row['attrs'] ) ? $row['attrs'] : array();
			if ( is_object( $attrs ) ) {
				$attrs = (array) $attrs;
			}
			if ( ! is_array( $attrs ) ) {
				continue;
			}
			$id = 0;
			if ( ! empty( $attrs['id'] ) && is_numeric( $attrs['id'] ) ) {
				$id = (int) $attrs['id'];
			}
			if ( $id <= 0 ) {
				continue;
			}
			$tag = isset( $row['tag'] ) ? (string) $row['tag'] : '';
			if ( in_array( $tag, Shortcode_Resolver::TEMPLATE_SHORTCODE_TAGS, true ) ) {
				$ids[] = $id;
			}
		}
		return array_values( array_unique( array_filter( $ids ) ) );
	}

	/**
	 * Regenerate Elementor per-post CSS on disk when missing or stale.
	 *
	 * @param int $post_id Post ID.
	 * @return bool Whether a CSS file exists after the attempt.
	 */
	public function ensure_post_css( $post_id ) {
		$post_id = (int) $post_id;
		if ( ! $post_id || ! self::available() || ! self::is_built_with( $post_id ) ) {
			return false;
		}

		$css_file = WP_CONTENT_DIR . '/uploads/elementor/css/post-' . $post_id . '.css';

		try {
			if ( class_exists( '\Elementor\Core\Files\CSS\Post' ) ) {
				$post_css = new \Elementor\Core\Files\CSS\Post( $post_id );
				if ( method_exists( $post_css, 'update' ) ) {
					$post_css->update();
				} elseif ( method_exists( $post_css, 'enqueue' ) ) {
					$post_css->enqueue();
				}
			} else {
				// Fallback: rendering with_css=true triggers CSS registration.
				$this->render( $post_id, array( 'resolve_shortcodes' => false ) );
			}
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
			$this->render( $post_id, array( 'resolve_shortcodes' => false ) );
		}

		return is_readable( $css_file );
	}
}

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
	 * @param int $post_id Post ID.
	 * @return string Rendered HTML (empty string on failure).
	 */
	public function render( $post_id ) {
		if ( ! self::available() ) {
			return '';
		}

		try {
			$plugin = \Elementor\Plugin::$instance;
			if ( $plugin && isset( $plugin->frontend ) && method_exists( $plugin->frontend, 'get_builder_content_for_display' ) ) {
				// with_css = true so the per-post CSS is registered/enqueued.
				$html = $plugin->frontend->get_builder_content_for_display( $post_id, true );
				return is_string( $html ) ? $html : '';
			}
		} catch ( \Throwable $e ) {
			return '';
		}

		return '';
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
		return is_array( $raw ) ? $raw : null;
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
}

<?php
/**
 * Detect which page builder powers the site / a given post.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builder auto-detection.
 */
class Builder_Detector {

	const ELEMENTOR  = 'elementor';
	const GUTENBERG  = 'gutenberg';
	const CLASSIC    = 'classic';
	const DIVI       = 'divi';
	const WPBAKERY   = 'wpbakery';
	const BEAVER     = 'beaver';
	const UNKNOWN    = 'unknown';

	/**
	 * Detect the primary site builder from active plugins + sample posts.
	 *
	 * @return array{builder:string,confidence:string,activePlugins:string[],notes:string[]}
	 */
	public function detect_site() {
		$plugins = $this->active_plugin_slugs();
		$notes   = array();

		if ( in_array( 'elementor/elementor.php', $plugins, true ) || class_exists( '\Elementor\Plugin' ) ) {
			$count = $this->count_elementor_posts();
			$notes[] = sprintf( 'Elementor plugin active; %d published Elementor documents sampled.', $count );
			return array(
				'builder'       => self::ELEMENTOR,
				'confidence'    => $count > 0 ? 'high' : 'medium',
				'activePlugins' => $plugins,
				'notes'         => $notes,
			);
		}

		if ( in_array( 'divi-builder/divi-builder.php', $plugins, true ) || defined( 'ET_BUILDER_VERSION' ) ) {
			return array(
				'builder'       => self::DIVI,
				'confidence'    => 'medium',
				'activePlugins' => $plugins,
				'notes'         => array( 'Divi builder signals detected.' ),
			);
		}

		if ( in_array( 'js_composer/js_composer.php', $plugins, true ) ) {
			return array(
				'builder'       => self::WPBAKERY,
				'confidence'    => 'medium',
				'activePlugins' => $plugins,
				'notes'         => array( 'WPBakery (js_composer) active.' ),
			);
		}

		if ( in_array( 'bb-plugin/fl-builder.php', $plugins, true ) ) {
			return array(
				'builder'       => self::BEAVER,
				'confidence'    => 'medium',
				'activePlugins' => $plugins,
				'notes'         => array( 'Beaver Builder active.' ),
			);
		}

		$blockish = $this->sample_has_blocks();
		if ( $blockish ) {
			return array(
				'builder'       => self::GUTENBERG,
				'confidence'    => 'medium',
				'activePlugins' => $plugins,
				'notes'         => array( 'Block markup found in published content.' ),
			);
		}

		return array(
			'builder'       => self::CLASSIC,
			'confidence'    => 'low',
			'activePlugins' => $plugins,
			'notes'         => array( 'No known builder plugin detected; treating as classic/theme templates.' ),
		);
	}

	/**
	 * Detect builder for one post.
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public function detect_post( $post_id ) {
		$post_id = (int) $post_id;
		if ( $post_id <= 0 ) {
			return self::UNKNOWN;
		}

		$mode = get_post_meta( $post_id, '_elementor_edit_mode', true );
		$data = get_post_meta( $post_id, '_elementor_data', true );
		if ( 'builder' === $mode || ( is_string( $data ) && strlen( $data ) > 2 ) || ( is_array( $data ) && $data ) ) {
			return self::ELEMENTOR;
		}

		$post = get_post( $post_id );
		if ( $post && function_exists( 'has_blocks' ) && has_blocks( $post->post_content ) ) {
			return self::GUTENBERG;
		}

		if ( $post && false !== strpos( (string) $post->post_content, '[vc_' ) ) {
			return self::WPBAKERY;
		}

		return self::CLASSIC;
	}

	/**
	 * @return string[]
	 */
	private function active_plugin_slugs() {
		if ( ! function_exists( 'get_option' ) ) {
			return array();
		}
		$active = get_option( 'active_plugins', array() );
		return is_array( $active ) ? $active : array();
	}

	/**
	 * @return int
	 */
	private function count_elementor_posts() {
		$q = new \WP_Query(
			array(
				'post_type'      => array( 'page', 'post' ),
				'post_status'    => 'publish',
				'posts_per_page' => 20,
				'fields'         => 'ids',
				'meta_key'       => '_elementor_edit_mode',
				'meta_value'     => 'builder',
				'no_found_rows'  => true,
			)
		);
		return count( $q->posts );
	}

	/**
	 * @return bool
	 */
	private function sample_has_blocks() {
		$q = new \WP_Query(
			array(
				'post_type'      => array( 'page', 'post' ),
				'post_status'    => 'publish',
				'posts_per_page' => 10,
				'no_found_rows'  => true,
			)
		);
		foreach ( $q->posts as $post ) {
			if ( function_exists( 'has_blocks' ) && has_blocks( $post->post_content ) ) {
				return true;
			}
		}
		return false;
	}
}

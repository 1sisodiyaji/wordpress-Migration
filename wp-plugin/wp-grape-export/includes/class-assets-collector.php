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
 */
class Assets_Collector {

	/**
	 * Collect the asset manifest, simulating front-end renders so Elementor
	 * and theme/plugin enqueues are captured (not just admin context).
	 *
	 * @param int   $front_id  Front page ID (for context), may be 0.
	 * @param int[] $post_ids  Additional post IDs to render for enqueue discovery.
	 * @return array{stylesheets:array,scripts:array}
	 */
	public function collect( $front_id = 0, array $post_ids = array() ) {
		global $wp_styles, $wp_scripts;

		$ids = array_values( array_unique( array_filter( array_map( 'intval', array_merge( array( $front_id ), $post_ids ) ) ) ) );

		foreach ( $ids as $post_id ) {
			$this->prime_post_context( $post_id );
			if ( Elementor_Bridge::available() && Elementor_Bridge::is_built_with( $post_id ) ) {
				( new Elementor_Bridge() )->render( $post_id );
			}
		}

		// Elementor only prints elementorFrontendConfig via frontend->enqueue_scripts(),
		// which is skipped in admin/REST export requests unless we call it explicitly.
		if ( Elementor_Bridge::available() ) {
			try {
				$frontend = \Elementor\Plugin::$instance->frontend;
				if ( $frontend && method_exists( $frontend, 'enqueue_scripts' ) ) {
					$frontend->enqueue_scripts();
				}
			} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
				// Best-effort; generator can synthesize a fallback config.
			}
		}

		if ( ! did_action( 'wp_enqueue_scripts' ) ) {
			do_action( 'wp_enqueue_scripts' );
		}

		$stylesheets = $this->read_registry( $wp_styles );
		$scripts     = $this->read_registry( $wp_scripts, true );

		wp_reset_postdata();

		return array(
			'stylesheets' => $stylesheets,
			'scripts'     => $scripts,
		);
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
			$GLOBALS['wp_query']->is_page     = true;
			$GLOBALS['wp_query']->is_singular   = true;
			$GLOBALS['wp_query']->queried_object    = $post;
			$GLOBALS['wp_query']->queried_object_id = $post_id;
		}
	}

	/**
	 * @deprecated Use collect() with post IDs.
	 */
	public function collect_legacy( $front_id = 0 ) {
		return $this->collect( $front_id, array() );
	}

	/**
	 * Read a WP_Dependencies registry in dependency-resolved order.
	 *
	 * @param \WP_Dependencies $registry   Styles or scripts registry.
	 * @param bool             $is_script  Whether this is the scripts registry.
	 * @return array[]
	 */
	private function read_registry( $registry, $is_script = false ) {
		if ( ! $registry || empty( $registry->queue ) ) {
			return array();
		}

		// Resolve full dependency order.
		$registry->all_deps( $registry->queue );
		$handles = $registry->to_do ? $registry->to_do : $registry->queue;

		$out = array();
		foreach ( $handles as $handle ) {
			if ( ! isset( $registry->registered[ $handle ] ) ) {
				continue;
			}
			$dep = $registry->registered[ $handle ];

			$src = $dep->src;
			if ( $src && ! preg_match( '#^https?://#', $src ) ) {
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

				// Localized data (wp_localize_script).
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

<?php
/**
 * Exports individual routes: rendered content slot + raw data + audit.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renders each route's main content region (not header/footer), resolving
 * shortcodes through the WordPress runtime.
 */
class Page_Exporter {

	/**
	 * Bundle writer.
	 *
	 * @var Bundle_Writer
	 */
	private $writer;

	/**
	 * Site page builder.
	 *
	 * @var string
	 */
	private $builder;

	/**
	 * Elementor bridge.
	 *
	 * @var Elementor_Bridge
	 */
	private $elementor;

	/**
	 * Unresolved shortcode audit entries.
	 *
	 * @var array[]
	 */
	private $unresolved = array();

	/**
	 * Warnings.
	 *
	 * @var string[]
	 */
	private $warnings = array();

	/**
	 * @param Bundle_Writer $writer  Bundle writer.
	 * @param string        $builder Detected page builder.
	 */
	public function __construct( Bundle_Writer $writer, $builder ) {
		$this->writer    = $writer;
		$this->builder   = $builder;
		$this->elementor = new Elementor_Bridge();
	}

	/**
	 * Export a single route.
	 *
	 * @param array $route Route descriptor from Site_Scanner.
	 * @return array{route:array}|null
	 */
	public function export_route( array $route ) {
		$post_id = (int) $route['id'];
		$post    = get_post( $post_id );
		if ( ! $post ) {
			return null;
		}

		$key = $this->route_key( $route['path'] );
		$dir = 'pages/' . $key;

		$builder = $route['pageBuilder'];
		$raw     = (string) $post->post_content;

		$found_shortcodes = $this->scan_shortcodes( $raw );

		if ( 'elementor' === $builder && Elementor_Bridge::is_built_with( $post_id ) ) {
			$this->elementor->ensure_post_css( $post_id );
			$rendered = $this->elementor->render( $post_id );
			$raw_data = $this->elementor->data( $post_id );
		} elseif ( 'gutenberg' === $builder ) {
			// Gutenberg: render blocks through the_content AND capture the
			// structured block tree so the converter can map blocks -> components.
			$rendered = $this->render_classic( $raw );
			$raw_data = $this->parse_blocks_tree( $raw );
		} else {
			// Classic: resolve shortcodes through the_content.
			$rendered = $this->render_classic( $raw );
			$raw_data = null;
		}

		// Record shortcodes that survived rendering.
		$this->audit_unresolved( $rendered, $route );

		$rendered_file = $dir . '/rendered.html';
		$this->writer->write( $rendered_file, $rendered );

		$raw_file = null;
		if ( null !== $raw_data ) {
			$raw_file = $dir . '/raw.json';
			$this->writer->write_json( $raw_file, $raw_data );
		} elseif ( '' !== trim( $raw ) ) {
			$raw_file = $dir . '/raw.html';
			$this->writer->write( $raw_file, $raw );
		}

		$meta = array(
			'postId'       => $post_id,
			'path'         => $route['path'],
			'slug'         => $route['slug'],
			'title'        => $route['title'],
			'type'         => $route['type'],
			'pageBuilder'  => $builder,
			'template'     => $route['template'],
			'renderedFile' => $rendered_file,
			'rawFile'      => $raw_file,
			'assetsFile'   => $dir . '/assets.json',
			'slots'        => array(
				'headerTemplateId' => null,
				'footerTemplateId' => null,
			),
			'shortcodes'   => $found_shortcodes,
		);
		$this->writer->write_json( $dir . '/meta.json', $meta );

		$page_assets = new Widget_Assets( $this->elementor );
		$this->writer->write_json( $dir . '/assets.json', $page_assets->build_page_profile( $post_id ) );

		$route['dir'] = $dir;

		return array( 'route' => $route );
	}

	/**
	 * Render classic/Gutenberg content through the_content filters.
	 *
	 * @param string $content Raw post content.
	 * @return string
	 */
	private function render_classic( $content ) {
		// apply_filters('the_content') runs do_shortcode, wpautop, block rendering.
		$rendered = apply_filters( 'the_content', $content );
		return is_string( $rendered ) ? $rendered : '';
	}

	/**
	 * Parse Gutenberg block content into a normalized, serializable tree.
	 *
	 * @param string $content Raw post content.
	 * @return array{blocks:array}|null
	 */
	private function parse_blocks_tree( $content ) {
		if ( ! function_exists( 'parse_blocks' ) ) {
			return null;
		}

		$blocks     = parse_blocks( $content );
		$normalized = array();
		foreach ( $blocks as $block ) {
			$node = $this->normalize_block( $block );
			if ( null !== $node ) {
				$normalized[] = $node;
			}
		}

		return array( 'blocks' => $normalized );
	}

	/**
	 * Normalize a single parsed block (recursively) for JSON export.
	 *
	 * @param array $block Parsed block from parse_blocks().
	 * @return array|null
	 */
	private function normalize_block( array $block ) {
		$name = isset( $block['blockName'] ) ? $block['blockName'] : null;

		// Skip empty freeform whitespace nodes.
		if ( null === $name && '' === trim( (string) ( $block['innerHTML'] ?? '' ) ) ) {
			return null;
		}

		$children = array();
		if ( ! empty( $block['innerBlocks'] ) && is_array( $block['innerBlocks'] ) ) {
			foreach ( $block['innerBlocks'] as $child ) {
				$node = $this->normalize_block( $child );
				if ( null !== $node ) {
					$children[] = $node;
				}
			}
		}

		return array(
			'name'      => $name ? $name : 'core/freeform',
			'attrs'     => isset( $block['attrs'] ) && is_array( $block['attrs'] ) && ! empty( $block['attrs'] )
				? $block['attrs']
				: new \stdClass(),
			'html'      => isset( $block['innerHTML'] ) ? trim( (string) $block['innerHTML'] ) : '',
			'innerBlocks' => $children,
		);
	}

	/**
	 * Find shortcodes present in raw content.
	 *
	 * @param string $content Raw content.
	 * @return array[]
	 */
	private function scan_shortcodes( $content ) {
		$out = array();
		if ( false === strpos( $content, '[' ) ) {
			return $out;
		}

		$pattern = get_shortcode_regex();
		if ( preg_match_all( '/' . $pattern . '/s', $content, $matches, PREG_SET_ORDER ) ) {
			foreach ( $matches as $m ) {
				$tag   = $m[2];
				$attrs = shortcode_parse_atts( $m[3] );
				$out[] = array(
					'tag'      => $tag,
					'attrs'    => is_array( $attrs ) ? $attrs : new \stdClass(),
					'resolved' => shortcode_exists( $tag ),
				);
			}
		}

		return $out;
	}

	/**
	 * Record any shortcode-looking leftovers in rendered output.
	 *
	 * @param string $rendered Rendered HTML.
	 * @param array  $route    Route descriptor.
	 */
	private function audit_unresolved( $rendered, array $route ) {
		if ( false === strpos( $rendered, '[' ) ) {
			return;
		}
		if ( preg_match_all( '/\[([a-zA-Z0-9_\-]+)[\s\]]/', $rendered, $matches ) ) {
			foreach ( array_unique( $matches[1] ) as $tag ) {
				if ( shortcode_exists( $tag ) ) {
					// Registered but left in output (nested/escaped) — still flag lightly.
					continue;
				}
				$this->unresolved[] = array(
					'tag'    => $tag,
					'postId' => (int) $route['id'],
					'path'   => $route['path'],
				);
			}
		}
	}

	/**
	 * Turn a route path into a filesystem-safe key.
	 *
	 * @param string $path Route path.
	 * @return string
	 */
	private function route_key( $path ) {
		if ( '/' === $path ) {
			return 'home';
		}
		$key = trim( $path, '/' );
		$key = str_replace( '/', '__', $key );
		$key = sanitize_title( $key );
		return $key ? $key : 'page-' . wp_rand( 1000, 9999 );
	}

	/**
	 * Audit results.
	 *
	 * @return array{unresolvedShortcodes:array,warnings:array}
	 */
	public function audit() {
		return array(
			'unresolvedShortcodes' => $this->unresolved,
			'warnings'             => $this->warnings,
		);
	}
}

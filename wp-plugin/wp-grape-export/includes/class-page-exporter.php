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
 * shortcodes through the WordPress runtime and expanding Elementor/ElementsKit
 * template embeds so the export contains real HTML, not `[shortcode]` stubs.
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
	 * Shared shortcode resolver.
	 *
	 * @var Shortcode_Resolver
	 */
	private $resolver;

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
		$this->resolver  = new Shortcode_Resolver( $this->elementor );
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

		$this->resolver->reset_inventory();

		$found_shortcodes = $this->scan_shortcodes( $raw );
		$raw_data         = null;

		if ( 'elementor' === $builder && Elementor_Bridge::is_built_with( $post_id ) ) {
			$this->elementor->ensure_post_css( $post_id );
			foreach ( $this->elementor->nested_template_ids( $post_id ) as $nested_id ) {
				$this->elementor->ensure_post_css( $nested_id );
			}

			$raw_data         = $this->elementor->data( $post_id );
			$found_shortcodes = array_merge(
				$found_shortcodes,
				$this->resolver->collect_from_elementor_data( $raw_data )
			);

			$rendered = $this->elementor->render( $post_id );
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

		// Final pass — catches embeds Elementor left as literal shortcodes
		// (HTML widget, failed template shortcode, etc.).
		$rendered = $this->resolver->resolve(
			$rendered,
			array(
				'postId' => $post_id,
				'path'   => isset( $route['path'] ) ? $route['path'] : '',
			)
		);

		$this->unresolved = array_merge(
			$this->unresolved,
			$this->resolver->audit_unresolved( $rendered, $route )
		);

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

		$shortcode_report = array(
			'detected' => $this->dedupe_shortcodes( $found_shortcodes ),
			'expanded' => $this->resolver->inventory(),
			'leftover'  => $this->resolver->audit_unresolved( $rendered, $route ),
		);
		$this->writer->write_json( $dir . '/shortcodes.json', $shortcode_report );

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
			'shortcodes'   => $shortcode_report['detected'],
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
		$rendered = is_string( $rendered ) ? $rendered : '';
		return $this->resolver->resolve( $rendered );
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
			'name'        => $name ? $name : 'core/freeform',
			'attrs'       => isset( $block['attrs'] ) && is_array( $block['attrs'] ) && ! empty( $block['attrs'] )
				? $block['attrs']
				: array(),
			'html'        => isset( $block['innerHTML'] ) ? trim( (string) $block['innerHTML'] ) : '',
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
					'attrs'    => is_array( $attrs ) ? $attrs : array(),
					'raw'      => isset( $m[0] ) ? (string) $m[0] : '',
					'source'   => 'post_content',
					'resolved' => shortcode_exists( $tag ),
				);
			}
		}

		return $out;
	}

	/**
	 * Deduplicate shortcode inventory rows.
	 *
	 * @param array[] $rows Rows.
	 * @return array[]
	 */
	private function dedupe_shortcodes( array $rows ) {
		$seen = array();
		$out  = array();
		foreach ( $rows as $row ) {
			$key = ( isset( $row['source'] ) ? $row['source'] : '' ) . '|' .
				( isset( $row['tag'] ) ? $row['tag'] : '' ) . '|' .
				( isset( $row['raw'] ) ? $row['raw'] : wp_json_encode( isset( $row['attrs'] ) ? $row['attrs'] : array() ) );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = $row;
		}
		return $out;
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

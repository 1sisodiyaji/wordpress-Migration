<?php
/**
 * Resolve WordPress shortcodes and Elementor/ElementsKit template embeds for export.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Post-processes rendered HTML so `[shortcodes]` and `[elementor-template …]`
 * expand to real markup (with nested templates) inside the export bundle.
 *
 * Why this exists:
 * - Elementor HTML widgets intentionally leave shortcodes unresolved.
 * - CTA / section / mega-menu embeds are often `[tag id="123"]` whose body
 *   lives in `wp_postmeta._elementor_data` on that post ID — not in the host page.
 * - Template embeds can fail in admin/REST/CLI context; we fall back to
 *   rendering the referenced Elementor/ElementsKit document ourselves.
 */
class Shortcode_Resolver {

	/**
	 * Known shortcode tags that pull in Elementor (or Elementor-compatible) documents.
	 *
	 * @var string[]
	 */
	const TEMPLATE_SHORTCODE_TAGS = array(
		'elementor-template',
		'elementor_template',
		'INSERT_ELEMENTOR',
		'elementskit_template',
		'ekit_template',
		'ekit-template',
		'hfe_template',
		'hfe-template',
		'ae_template', // AnyWhere Elementor
		'ELEMENTOR',
	);

	/**
	 * Attribute keys that commonly hold the target post/document ID.
	 *
	 * @var string[]
	 */
	const ID_ATTR_KEYS = array(
		'id',
		'template_id',
		'templateID',
		'post_id',
		'postId',
		'template',
		'eid',
		'element_id',
	);

	/**
	 * Elementor bridge used to render nested documents.
	 *
	 * @var Elementor_Bridge
	 */
	private $elementor;

	/**
	 * Map of "raw shortcode → resolved HTML" for this resolve pass.
	 *
	 * @var array<string,string>
	 */
	private $resolved = array();

	/**
	 * Document IDs successfully rendered from postmeta during this pass.
	 *
	 * @var array<int,true>
	 */
	private $resolved_ids = array();

	/**
	 * Nesting depth guard.
	 *
	 * @var int
	 */
	private $depth = 0;

	/**
	 * @param Elementor_Bridge $elementor Elementor bridge.
	 */
	public function __construct( Elementor_Bridge $elementor ) {
		$this->elementor = $elementor;
	}

	/**
	 * Expand shortcodes / template embeds in HTML.
	 *
	 * @param string $html    HTML that may contain shortcodes.
	 * @param array  $context Optional context (postId, path).
	 * @return string
	 */
	public function resolve( $html, array $context = array() ) {
		$html = is_string( $html ) ? $html : '';
		if ( '' === $html || false === strpos( $html, '[' ) ) {
			return $html;
		}
		if ( $this->depth >= 8 ) {
			return $html;
		}

		++$this->depth;
		try {
			// First expand template-style / ID-based shortcodes via postmeta.
			$html = $this->expand_template_shortcodes( $html, $context );
			$html = $this->expand_id_based_shortcodes( $html, $context );

			// Then run WordPress shortcodes (CF7, galleries, plugin tags, …).
			for ( $i = 0; $i < 4; $i++ ) {
				if ( false === strpos( $html, '[' ) ) {
					break;
				}
				$next = do_shortcode( $html );
				if ( ! is_string( $next ) || $next === $html ) {
					break;
				}
				$html = $next;
				$html = $this->expand_template_shortcodes( $html, $context );
				$html = $this->expand_id_based_shortcodes( $html, $context );
			}
		} finally {
			--$this->depth;
		}

		return $html;
	}

	/**
	 * Snapshot of shortcodes replaced during the last resolve() calls.
	 *
	 * @return array[]
	 */
	public function inventory() {
		$out = array();
		foreach ( $this->resolved as $raw => $html ) {
			$out[] = array(
				'raw'       => $raw,
				'htmlBytes' => strlen( $html ),
				'expanded'  => '' !== trim( $html ) && $html !== $raw,
			);
		}
		return $out;
	}

	/**
	 * Document IDs that were rendered from `_elementor_data` during resolve.
	 *
	 * @return int[]
	 */
	public function resolved_document_ids() {
		return array_map( 'intval', array_keys( $this->resolved_ids ) );
	}

	/**
	 * Reset the resolved inventory (call between pages).
	 */
	public function reset_inventory() {
		$this->resolved     = array();
		$this->resolved_ids = array();
	}

	/**
	 * Pull a numeric document/post ID from shortcode attributes.
	 *
	 * @param array $atts Attributes.
	 * @return int
	 */
	public static function extract_document_id( array $atts ) {
		foreach ( self::ID_ATTR_KEYS as $key ) {
			if ( ! empty( $atts[ $key ] ) && is_numeric( $atts[ $key ] ) ) {
				return (int) $atts[ $key ];
			}
		}
		// Positional / bare numeric value: [tag 123].
		foreach ( $atts as $k => $v ) {
			if ( is_int( $k ) && is_numeric( $v ) ) {
				return (int) $v;
			}
			if ( is_string( $v ) && is_numeric( $v ) && (string) (int) $v === (string) $v ) {
				// Prefer explicit id keys already checked; accept lone numeric values.
				if ( is_int( $k ) || '' === (string) $k ) {
					return (int) $v;
				}
			}
		}
		return 0;
	}

	/**
	 * Walk Elementor `_elementor_data` for shortcode / template widgets.
	 *
	 * @param array|null $tree Decoded Elementor data.
	 * @return array[]
	 */
	public function collect_from_elementor_data( $tree ) {
		$found = array();
		if ( ! is_array( $tree ) ) {
			return $found;
		}
		$this->walk_elementor_nodes( $tree, $found );
		return $found;
	}

	/**
	 * Audit leftovers that still look like *real* shortcodes (not JS `[idx]`).
	 *
	 * @param string $html  Rendered HTML.
	 * @param array  $route Route descriptor.
	 * @return array[]
	 */
	public function audit_unresolved( $html, array $route ) {
		$out = array();
		if ( '' === $html || false === strpos( $html, '[' ) ) {
			return $out;
		}

		$pattern = get_shortcode_regex();
		if ( $pattern && preg_match_all( '/' . $pattern . '/s', $html, $matches, PREG_SET_ORDER ) ) {
			foreach ( $matches as $m ) {
				$tag = isset( $m[2] ) ? (string) $m[2] : '';
				if ( '' === $tag ) {
					continue;
				}
				$out[] = array(
					'tag'    => $tag,
					'raw'    => isset( $m[0] ) ? (string) $m[0] : '',
					'postId' => isset( $route['id'] ) ? (int) $route['id'] : 0,
					'path'   => isset( $route['path'] ) ? (string) $route['path'] : '',
					'reason' => shortcode_exists( $tag ) ? 'registered-but-unexpanded' : 'unknown',
				);
			}
		}

		foreach ( self::TEMPLATE_SHORTCODE_TAGS as $tag ) {
			if ( preg_match_all( '/\[' . preg_quote( $tag, '/' ) . '\s[^\]]*\]/i', $html, $matches ) ) {
				foreach ( $matches[0] as $raw ) {
					$out[] = array(
						'tag'    => $tag,
						'raw'    => $raw,
						'postId' => isset( $route['id'] ) ? (int) $route['id'] : 0,
						'path'   => isset( $route['path'] ) ? (string) $route['path'] : '',
						'reason' => 'template-shortcode-unexpanded',
					);
				}
			}
		}

		$seen    = array();
		$deduped = array();
		foreach ( $out as $row ) {
			$key = $row['tag'] . '|' . $row['raw'];
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$deduped[]    = $row;
		}
		return $deduped;
	}

	/**
	 * Expand known Elementor / ElementsKit / HFE template shortcodes via Elementor_Bridge.
	 *
	 * @param string $html    HTML.
	 * @param array  $context Context.
	 * @return string
	 */
	private function expand_template_shortcodes( $html, array $context ) {
		$tag_alt = implode(
			'|',
			array_map(
				static function ( $t ) {
					return preg_quote( $t, '/' );
				},
				self::TEMPLATE_SHORTCODE_TAGS
			)
		);

		return (string) preg_replace_callback(
			'/\[(' . $tag_alt . ')\s+([^\]]*)\]/i',
			function ( $m ) use ( $context ) {
				return $this->replace_id_shortcode( $m[0], strtolower( $m[1] ), $m[2], $context );
			},
			$html
		);
	}

	/**
	 * Catch any leftover `[something id="123"]` that points at an Elementor document.
	 *
	 * This covers CTA / section embeds registered under custom shortcode tags
	 * whose markup is stored in `wp_postmeta._elementor_data` for that ID.
	 *
	 * @param string $html    HTML.
	 * @param array  $context Context.
	 * @return string
	 */
	private function expand_id_based_shortcodes( $html, array $context ) {
		// [tag … id="123" …] or [tag id=123]
		return (string) preg_replace_callback(
			'/\[([a-zA-Z][\w-]*)\s+([^\]]*\b(?:id|template_id|post_id|template)\s*=\s*["\']?\d+["\']?[^\]]*)\]/i',
			function ( $m ) use ( $context ) {
				$tag = strtolower( $m[1] );
				// Skip already-handled known tags (still OK to re-run).
				return $this->replace_id_shortcode( $m[0], $tag, $m[2], $context );
			},
			$html
		);
	}

	/**
	 * Replace one ID-based shortcode with rendered Elementor HTML from postmeta.
	 *
	 * @param string $raw     Full shortcode string.
	 * @param string $tag     Tag name.
	 * @param string $attrstr Attribute string.
	 * @param array  $context Context.
	 * @return string
	 */
	private function replace_id_shortcode( $raw, $tag, $attrstr, array $context ) {
		if ( isset( $this->resolved[ $raw ] ) ) {
			return $this->resolved[ $raw ];
		}

		$atts = shortcode_parse_atts( $attrstr );
		if ( ! is_array( $atts ) ) {
			$atts = array();
		}

		$id = self::extract_document_id( $atts );
		if ( $id <= 0 ) {
			return $raw;
		}

		// Prefer the real WP shortcode when it expands to non-empty markup.
		if ( shortcode_exists( $tag ) ) {
			$via_wp = do_shortcode( $raw );
			if ( is_string( $via_wp ) && $via_wp !== $raw && '' !== trim( wp_strip_all_tags( $via_wp ) ) ) {
				// Still walk nested shortcodes.
				$via_wp                 = $this->resolve( $via_wp, $context );
				$this->resolved[ $raw ] = $via_wp;
				$this->resolved_ids[ $id ] = true;
				return $via_wp;
			}
		}

		// Fallback: load `_elementor_data` for that post ID and render.
		if ( ! Elementor_Bridge::has_elementor_data( $id ) && ! Elementor_Bridge::is_built_with( $id ) ) {
			return $raw;
		}

		$this->elementor->ensure_post_css( $id );
		foreach ( $this->elementor->nested_template_ids( $id ) as $nested_id ) {
			$this->elementor->ensure_post_css( $nested_id );
		}

		$inner = $this->elementor->render( $id, array( 'resolve_shortcodes' => true ) );
		if ( ! is_string( $inner ) || '' === trim( $inner ) ) {
			return $raw;
		}

		$this->resolved[ $raw ]    = $inner;
		$this->resolved_ids[ $id ] = true;
		return $inner;
	}

	/**
	 * Recurse Elementor nodes collecting shortcode/template widgets.
	 *
	 * @param array $nodes Nodes.
	 * @param array $found Accumulator (by ref).
	 */
	private function walk_elementor_nodes( $nodes, array &$found ) {
		if ( is_object( $nodes ) ) {
			$nodes = (array) $nodes;
		}
		if ( ! is_array( $nodes ) ) {
			return;
		}

		$is_list = array_keys( $nodes ) === range( 0, count( $nodes ) - 1 );
		if ( $is_list ) {
			foreach ( $nodes as $child ) {
				$this->walk_elementor_nodes( $child, $found );
			}
			return;
		}

		$el_type     = isset( $nodes['elType'] ) ? (string) $nodes['elType'] : '';
		$widget_type = isset( $nodes['widgetType'] ) ? (string) $nodes['widgetType'] : '';
		$settings    = array();
		if ( isset( $nodes['settings'] ) ) {
			if ( is_array( $nodes['settings'] ) ) {
				$settings = $nodes['settings'];
			} elseif ( is_object( $nodes['settings'] ) ) {
				$settings = (array) $nodes['settings'];
			}
		}

		if ( 'widget' === $el_type ) {
			if ( 'shortcode' === $widget_type ) {
				$raw = isset( $settings['shortcode'] ) ? trim( (string) $settings['shortcode'] ) : '';
				$tag = '';
				if ( $raw && preg_match( '/\[([a-zA-Z0-9_-]+)/', $raw, $m ) ) {
					$tag = $m[1];
				}
				$attrs = $this->attrs_array( $raw );
				$found[] = array(
					'tag'        => $tag ? $tag : 'shortcode',
					'attrs'      => $attrs,
					'raw'        => $raw,
					'source'     => 'elementor-shortcode-widget',
					'templateId' => self::extract_document_id( $attrs ),
					'resolved'   => $tag ? shortcode_exists( $tag ) : false,
				);
			} elseif (
				in_array(
					$widget_type,
					array(
						'template',
						'elementskit-template',
						'elementskit_template',
						'call-to-action', // sometimes linked
					),
					true
				)
				|| false !== stripos( $widget_type, 'template' )
			) {
				$template_id = 0;
				foreach ( array_merge( self::ID_ATTR_KEYS, array( 'ekit_template_id', 'select_template', 'template_id' ) ) as $key ) {
					if ( ! empty( $settings[ $key ] ) && is_numeric( $settings[ $key ] ) ) {
						$template_id = (int) $settings[ $key ];
						break;
					}
				}
				// call-to-action may nest a shortcode string.
				if ( $template_id <= 0 && ! empty( $settings['shortcode'] ) && is_string( $settings['shortcode'] ) ) {
					$attrs       = $this->attrs_array( $settings['shortcode'] );
					$template_id = self::extract_document_id( $attrs );
				}
				$found[] = array(
					'tag'        => 'elementor-template',
					'attrs'      => array( 'id' => $template_id ),
					'raw'        => $template_id ? sprintf( '[elementor-template id="%d"]', $template_id ) : '',
					'source'     => 'elementor-template-widget:' . $widget_type,
					'templateId' => $template_id,
					'resolved'   => $template_id > 0,
				);
			} else {
				foreach ( array( 'editor', 'html', 'shortcode', 'content', 'text', 'description' ) as $key ) {
					if ( empty( $settings[ $key ] ) || ! is_string( $settings[ $key ] ) ) {
						continue;
					}
					$value = $settings[ $key ];
					if ( false === strpos( $value, '[' ) ) {
						continue;
					}
					foreach ( $this->scan_raw_shortcodes( $value, 'elementor-' . $widget_type . ':' . $key ) as $row ) {
						$found[] = $row;
					}
				}
			}
		}

		if ( ! empty( $nodes['elements'] ) && is_array( $nodes['elements'] ) ) {
			foreach ( $nodes['elements'] as $child ) {
				$this->walk_elementor_nodes( $child, $found );
			}
		}
	}

	/**
	 * Scan a string with WP shortcode regex.
	 *
	 * @param string $content Source string.
	 * @param string $source  Provenance label.
	 * @return array[]
	 */
	private function scan_raw_shortcodes( $content, $source ) {
		$out = array();
		if ( false === strpos( $content, '[' ) ) {
			return $out;
		}
		$pattern = get_shortcode_regex();
		if ( ! $pattern || ! preg_match_all( '/' . $pattern . '/s', $content, $matches, PREG_SET_ORDER ) ) {
			foreach ( self::TEMPLATE_SHORTCODE_TAGS as $tag ) {
				if ( preg_match_all( '/\[' . preg_quote( $tag, '/' ) . '\s[^\]]*\]/i', $content, $ms ) ) {
					foreach ( $ms[0] as $raw ) {
						$attrs = $this->attrs_array( $raw );
						$out[] = array(
							'tag'        => $tag,
							'attrs'      => $attrs,
							'raw'        => $raw,
							'source'     => $source,
							'templateId' => self::extract_document_id( $attrs ),
							'resolved'   => shortcode_exists( $tag ),
						);
					}
				}
			}
			return $out;
		}

		foreach ( $matches as $m ) {
			$tag   = isset( $m[2] ) ? (string) $m[2] : '';
			$attrs = shortcode_parse_atts( isset( $m[3] ) ? $m[3] : '' );
			$attrs = is_array( $attrs ) ? $attrs : array();
			$out[] = array(
				'tag'        => $tag,
				'attrs'      => $attrs,
				'raw'        => isset( $m[0] ) ? (string) $m[0] : '',
				'source'     => $source,
				'templateId' => self::extract_document_id( $attrs ),
				'resolved'   => shortcode_exists( $tag ),
			);
		}
		return $out;
	}

	/**
	 * Parse attributes from a raw shortcode string into an array for JSON.
	 *
	 * @param string $raw Raw shortcode.
	 * @return array
	 */
	private function attrs_array( $raw ) {
		if ( ! is_string( $raw ) || ! preg_match( '/\[[a-zA-Z0-9_-]+\s+([^\]]*)\]/', $raw, $m ) ) {
			return array();
		}
		$attrs = shortcode_parse_atts( $m[1] );
		return is_array( $attrs ) ? $attrs : array();
	}
}

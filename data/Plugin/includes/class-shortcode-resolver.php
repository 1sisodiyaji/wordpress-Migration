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
 * - Text-editor / custom widgets may leave registered shortcodes in output
 *   when render runs outside a normal front-end request.
 * - Template embeds can fail in admin/REST/CLI context; we fall back to
 *   rendering the referenced Elementor/ElementsKit document ourselves.
 */
class Shortcode_Resolver {

	/**
	 * Known shortcode tags that pull in Elementor documents.
	 *
	 * @var string[]
	 */
	const TEMPLATE_SHORTCODE_TAGS = array(
		'elementor-template',
		'elementor_template',
		'elementskit_template',
		'ekit_template',
		'ekit-template',
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
		if ( $this->depth >= 6 ) {
			return $html;
		}

		++$this->depth;
		try {
			// First expand template-style shortcodes with our Elementor fallback.
			$html = $this->expand_template_shortcodes( $html, $context );

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
	 * Reset the resolved inventory (call between pages).
	 */
	public function reset_inventory() {
		$this->resolved = array();
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

		// Prefer WordPress's own shortcode matcher (registered tags only).
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

		// Also catch known template shortcodes even if unregistered in this request.
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

		// Dedupe by raw string.
		$seen = array();
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
	 * Expand Elementor / ElementsKit template shortcodes via Elementor_Bridge.
	 *
	 * @param string $html    HTML.
	 * @param array  $context Context.
	 * @return string
	 */
	private function expand_template_shortcodes( $html, array $context ) {
		$tag_alt = implode( '|', array_map( static function ( $t ) {
			return preg_quote( $t, '/' );
		}, self::TEMPLATE_SHORTCODE_TAGS ) );

		return (string) preg_replace_callback(
			'/\[(' . $tag_alt . ')\s+([^\]]*)\]/i',
			function ( $m ) use ( $context ) {
				$raw  = $m[0];
				$tag  = strtolower( $m[1] );
				$atts = shortcode_parse_atts( $m[2] );
				if ( ! is_array( $atts ) ) {
					// WP returns a string when there are no key="value" attrs.
					$atts = array();
				}

				$id = 0;
				foreach ( array( 'id', 'template_id', 'post_id', 'template' ) as $key ) {
					if ( ! empty( $atts[ $key ] ) && is_numeric( $atts[ $key ] ) ) {
						$id = (int) $atts[ $key ];
						break;
					}
				}
				if ( $id <= 0 ) {
					return $raw;
				}

				// Prefer the real WP shortcode when available.
				if ( shortcode_exists( $tag ) ) {
					$via_wp = do_shortcode( $raw );
					if ( is_string( $via_wp ) && $via_wp !== $raw && '' !== trim( $via_wp ) ) {
						$this->resolved[ $raw ] = $via_wp;
						return $this->resolve( $via_wp, $context );
					}
				}

				$this->elementor->ensure_post_css( $id );
				$inner = $this->elementor->render( $id, array( 'resolve_shortcodes' => true ) );
				if ( ! is_string( $inner ) || '' === trim( $inner ) ) {
					return $raw;
				}

				$this->resolved[ $raw ] = $inner;
				return $inner;
			},
			$html
		);
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

		// Tree may be a list of sections or a single node.
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
				$found[] = array(
					'tag'      => $tag ? $tag : 'shortcode',
					'attrs'    => $this->attrs_array( $raw ),
					'raw'      => $raw,
					'source'   => 'elementor-shortcode-widget',
					'resolved' => $tag ? shortcode_exists( $tag ) : false,
				);
			} elseif ( 'template' === $widget_type || 'elementskit-template' === $widget_type ) {
				$template_id = 0;
				foreach ( array( 'template_id', 'templateID', 'ekit_template_id', 'select_template' ) as $key ) {
					if ( ! empty( $settings[ $key ] ) && is_numeric( $settings[ $key ] ) ) {
						$template_id = (int) $settings[ $key ];
						break;
					}
				}
				$found[] = array(
					'tag'        => 'elementor-template',
					'attrs'      => array( 'id' => $template_id ),
					'raw'        => $template_id ? sprintf( '[elementor-template id="%d"]', $template_id ) : '',
					'source'     => 'elementor-template-widget',
					'templateId' => $template_id,
					'resolved'   => $template_id > 0,
				);
			} else {
				// Text / HTML widgets may embed shortcodes in string settings.
				foreach ( array( 'editor', 'html', 'shortcode', 'content' ) as $key ) {
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
			// Still catch template shortcodes that may be unregistered.
			foreach ( self::TEMPLATE_SHORTCODE_TAGS as $tag ) {
				if ( preg_match_all( '/\[' . preg_quote( $tag, '/' ) . '\s[^\]]*\]/i', $content, $ms ) ) {
					foreach ( $ms[0] as $raw ) {
						$out[] = array(
							'tag'      => $tag,
							'attrs'    => $this->attrs_array( $raw ),
							'raw'      => $raw,
							'source'   => $source,
							'resolved' => shortcode_exists( $tag ),
						);
					}
				}
			}
			return $out;
		}

		foreach ( $matches as $m ) {
			$tag   = isset( $m[2] ) ? (string) $m[2] : '';
			$attrs = shortcode_parse_atts( isset( $m[3] ) ? $m[3] : '' );
			$out[] = array(
				'tag'      => $tag,
				'attrs'    => is_array( $attrs ) ? $attrs : array(),
				'raw'      => isset( $m[0] ) ? (string) $m[0] : '',
				'source'   => $source,
				'resolved' => shortcode_exists( $tag ),
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

<?php
/**
 * Exports the shared layout: header, footer and template library.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Resolves Theme Builder / ElementsKit header + footer templates and the
 * full template library, rendering each to HTML.
 */
class Layout_Exporter {

	/**
	 * Bundle writer.
	 *
	 * @var Bundle_Writer
	 */
	private $writer;

	/**
	 * Detected page builder.
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
	 * Cached template records.
	 *
	 * @var array[]|null
	 */
	private $templates = null;

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
	 * Build the layout descriptor (header + footer regions).
	 *
	 * @return array
	 */
	public function export() {
		$templates = $this->templates();

		$header = $this->pick_region( $templates, 'header' );
		$footer = $this->pick_region( $templates, 'footer' );

		return array(
			'header' => $header,
			'footer' => $footer,
			'menus'  => array(), // Filled in by Menu_Exporter.
		);
	}

	/**
	 * Return the full template library, rendering + persisting each.
	 *
	 * @return array[]
	 */
	public function templates() {
		if ( null !== $this->templates ) {
			return $this->templates;
		}

		$records   = array();
		$post_types = array();

		if ( post_type_exists( 'elementor_library' ) ) {
			$post_types[] = 'elementor_library';
		}
		if ( post_type_exists( 'elementskit_template' ) ) {
			$post_types[] = 'elementskit_template';
		}
		if ( post_type_exists( 'elementskit_content' ) ) {
			$post_types[] = 'elementskit_content';
		}

		if ( empty( $post_types ) ) {
			$this->templates = array();
			return $this->templates;
		}

		$posts = get_posts(
			array(
				'post_type'        => $post_types,
				'post_status'      => array( 'publish', 'draft', 'inherit' ),
				'numberposts'      => -1,
				'suppress_filters' => false,
			)
		);

		$resolver = new Shortcode_Resolver( $this->elementor );

		foreach ( $posts as $post ) {
			$type = $this->template_type( $post );
			$this->elementor->ensure_post_css( $post->ID );
			foreach ( $this->elementor->nested_template_ids( $post->ID ) as $nested_id ) {
				$this->elementor->ensure_post_css( $nested_id );
			}

			// Render with shortcode/template expansion so nested embeds are real HTML.
			$html = $this->elementor->render( $post->ID );
			$html = $resolver->resolve(
				$html,
				array(
					'postId' => (int) $post->ID,
					'path'   => 'template:' . $post->post_name,
				)
			);
			$data      = $this->elementor->data( $post->ID );
			$html_file = 'templates/' . $post->ID . '-' . sanitize_title( $type ? $type : 'template' ) . '.html';
			$data_file = null;

			$this->writer->write( $html_file, $html );
			if ( $data ) {
				$data_file = 'templates/' . $post->ID . '-' . sanitize_title( $type ? $type : 'template' ) . '.json';
				$this->writer->write_json( $data_file, $data );
			}

			$shortcodes = $resolver->collect_from_elementor_data( $data );
			$records[]  = array(
				'id'         => (int) $post->ID,
				'slug'       => $post->post_name,
				'title'      => get_the_title( $post ),
				'type'       => $type,
				'source'     => $post->post_type,
				'htmlFile'   => $html_file,
				'dataFile'   => $data_file,
				'conditions' => $this->conditions( $post ),
				'shortcodes' => $shortcodes,
			);
		}

		$this->templates = $records;
		return $this->templates;
	}

	/**
	 * Choose the best matching region (header/footer) and build its record.
	 *
	 * ElementsKit often stores header/footer as type "wp-post" with slug/title
	 * like "header-all" / "Header-All". Elementor library may store them as
	 * "section" titled "Header" / "Footer". Prefer exact type, then ElementsKit
	 * *-all, then slug/title match.
	 *
	 * @param array[] $templates Template records.
	 * @param string  $type      "header" or "footer".
	 * @return array|null
	 */
	private function pick_region( $templates, $type ) {
		$candidates = array();

		foreach ( $templates as $tpl ) {
			$score = $this->region_score( $tpl, $type );
			if ( $score > 0 ) {
				$candidates[] = array( 'score' => $score, 'tpl' => $tpl );
			}
		}

		if ( empty( $candidates ) ) {
			return null;
		}

		usort(
			$candidates,
			static function ( $a, $b ) {
				return $b['score'] - $a['score'];
			}
		);

		$tpl = $candidates[0]['tpl'];
		return array(
			'source'     => $tpl['source'],
			'postId'     => $tpl['id'],
			'title'      => $tpl['title'],
			'htmlFile'   => $tpl['htmlFile'],
			'dataFile'   => $tpl['dataFile'],
			'assignedTo' => $tpl['conditions'] ? $tpl['conditions'] : array( 'all' ),
		);
	}

	/**
	 * Score how likely a template is the site-wide header or footer.
	 *
	 * @param array  $tpl  Template record.
	 * @param string $type "header" or "footer".
	 * @return int
	 */
	private function region_score( $tpl, $type ) {
		$slug  = strtolower( (string) ( $tpl['slug'] ?? '' ) );
		$title = strtolower( (string) ( $tpl['title'] ?? '' ) );
		$ttype = strtolower( (string) ( $tpl['type'] ?? '' ) );
		$src   = (string) ( $tpl['source'] ?? '' );

		if ( $ttype === $type ) {
			return 100;
		}

		// ElementsKit site-wide: Header-All / Footer-All.
		if ( $slug === $type . '-all' || $title === $type . '-all' ) {
			return 90;
		}
		if ( false !== strpos( $slug, $type ) && false !== strpos( $slug, 'all' ) ) {
			return 85;
		}
		if ( false !== strpos( $title, $type ) && false !== strpos( $title, 'all' ) ) {
			return 85;
		}

		// Elementor library sections literally named Header / Footer.
		if ( $slug === $type || $title === $type ) {
			return ( 'elementskit_template' === $src ) ? 80 : 70;
		}

		if ( 0 === strpos( $slug, $type ) || 0 === strpos( $title, $type ) ) {
			return 50;
		}

		return 0;
	}

	/**
	 * Determine a template's type (header/footer/section/popup/...).
	 *
	 * @param \WP_Post $post Template post.
	 * @return string
	 */
	private function template_type( $post ) {
		// Elementor library stores it directly.
		$meta = get_post_meta( $post->ID, '_elementor_template_type', true );
		if ( $meta && ! in_array( $meta, array( 'wp-post', 'section', 'page' ), true ) ) {
			return $this->normalize_type( $meta );
		}

		// ElementsKit uses a taxonomy on its template CPT.
		foreach ( array( 'elementskit_template_type', 'elementor_library_type' ) as $tax ) {
			if ( taxonomy_exists( $tax ) ) {
				$terms = wp_get_post_terms( $post->ID, $tax, array( 'fields' => 'slugs' ) );
				if ( ! is_wp_error( $terms ) && ! empty( $terms ) ) {
					$norm = $this->normalize_type( $terms[0] );
					if ( in_array( $norm, array( 'header', 'footer' ), true ) ) {
						return $norm;
					}
				}
			}
		}

		// ElementsKit meta fallbacks.
		foreach ( array( '_ekit_template_type', 'ekit_template_type' ) as $key ) {
			$val = get_post_meta( $post->ID, $key, true );
			if ( $val ) {
				$norm = $this->normalize_type( $val );
				if ( in_array( $norm, array( 'header', 'footer' ), true ) ) {
					return $norm;
				}
			}
		}

		// Infer from slug / title (Header-All, Footer, etc.).
		$inferred = $this->infer_type_from_name( $post->post_name, get_the_title( $post ) );
		if ( $inferred ) {
			return $inferred;
		}

		if ( $meta ) {
			return $this->normalize_type( $meta );
		}

		// Last resort: sniff rendered markup for ElementsKit region classes.
		$html = $this->elementor->render( $post->ID );
		if ( false !== stripos( $html, 'ekit-template-content-header' ) ) {
			return 'header';
		}
		if ( false !== stripos( $html, 'ekit-template-content-footer' ) ) {
			return 'footer';
		}

		return 'section';
	}

	/**
	 * Infer header/footer from post slug or title.
	 *
	 * @param string $slug  Post slug.
	 * @param string $title Post title.
	 * @return string|null
	 */
	private function infer_type_from_name( $slug, $title ) {
		$slug  = strtolower( (string) $slug );
		$title = strtolower( (string) $title );
		foreach ( array( 'header', 'footer' ) as $region ) {
			if ( $slug === $region || $slug === $region . '-all' || 0 === strpos( $slug, $region ) ) {
				return $region;
			}
			if ( $title === $region || $title === $region . '-all' || 0 === strpos( $title, $region ) ) {
				return $region;
			}
		}
		return null;
	}

	/**
	 * Normalize builder-specific type strings.
	 *
	 * @param string $type Raw type.
	 * @return string
	 */
	private function normalize_type( $type ) {
		$type = strtolower( trim( $type ) );
		$map  = array(
			'header'          => 'header',
			'footer'          => 'footer',
			'single'          => 'single',
			'single-post'     => 'single',
			'single-page'     => 'page',
			'archive'         => 'archive',
			'popup'           => 'popup',
			'section'         => 'section',
			'page'            => 'page',
			'widget'          => 'widget',
			'error-404'       => 'error',
		);
		return isset( $map[ $type ] ) ? $map[ $type ] : $type;
	}

	/**
	 * Extract display conditions for a template, when discoverable.
	 *
	 * @param \WP_Post $post Template post.
	 * @return string[]
	 */
	private function conditions( $post ) {
		$out = array();

		// Elementor Pro Theme Builder conditions.
		$conditions = get_post_meta( $post->ID, '_elementor_conditions', true );
		if ( is_array( $conditions ) ) {
			foreach ( $conditions as $cond ) {
				$out[] = is_string( $cond ) ? $cond : wp_json_encode( $cond );
			}
		}

		return $out;
	}
}

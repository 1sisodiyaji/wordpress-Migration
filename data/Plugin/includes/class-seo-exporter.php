<?php
/**
 * Exports SEO packages (Yoast / Rank Math / core + head scrape fallback).
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Writes seo/site.json, seo/redirects.json, and pages/{key}/seo.json so the
 * migrated app can render titles/meta/OG/JSON-LD without inventing them.
 */
class Seo_Exporter {

	/**
	 * Bundle writer.
	 *
	 * @var Bundle_Writer
	 */
	private $writer;

	/**
	 * @var string[]
	 */
	private $warnings = array();

	/**
	 * @param Bundle_Writer $writer Bundle writer.
	 */
	public function __construct( Bundle_Writer $writer ) {
		$this->writer = $writer;
	}

	/**
	 * @return string[]
	 */
	public function warnings() {
		return $this->warnings;
	}

	/**
	 * Detect which SEO stack is active.
	 *
	 * @return string yoast|rankmath|core
	 */
	public function detect_provider() {
		if ( defined( 'WPSEO_VERSION' ) || class_exists( '\WPSEO_Frontend', false ) || function_exists( 'YoastSEO' ) ) {
			return 'yoast';
		}
		if ( defined( 'RANK_MATH_VERSION' ) || class_exists( '\RankMath', false ) ) {
			return 'rankmath';
		}
		return 'core';
	}

	/**
	 * Export site-level SEO + per-route SEO files.
	 *
	 * @param array[] $routes Route records (path, id, slug, …).
	 * @return array{provider:string,pages:int,redirects:int}
	 */
	public function export( array $routes ) {
		$provider = $this->detect_provider();
		$site     = $this->site_seo( $provider );
		$this->writer->write_json( 'seo/site.json', $site );

		$redirects = $this->collect_redirects( $provider );
		$this->writer->write_json( 'seo/redirects.json', $redirects );

		$pages = 0;
		foreach ( $routes as $route ) {
			$key = $this->route_key( isset( $route['path'] ) ? $route['path'] : '/' );
			$seo = $this->page_seo( $route, $provider );
			$this->writer->write_json( 'pages/' . $key . '/seo.json', $seo );
			$pages++;
		}

		return array(
			'provider'  => $provider,
			'pages'     => $pages,
			'redirects' => count( $redirects ),
		);
	}

	/**
	 * @param string $provider Provider id.
	 * @return array
	 */
	private function site_seo( $provider ) {
		$blogname = get_bloginfo( 'name' );
		$desc     = get_bloginfo( 'description' );
		$url      = home_url( '/' );

		$out = array(
			'provider'    => $provider,
			'siteName'    => $blogname,
			'tagline'     => $desc,
			'homeUrl'     => $url,
			'separator'   => '-',
			'social'      => array(),
			'defaults'    => array(
				'title'       => $blogname,
				'description' => $desc,
			),
		);

		if ( 'yoast' === $provider ) {
			$opts = get_option( 'wpseo_titles', array() );
			if ( is_array( $opts ) ) {
				if ( ! empty( $opts['separator'] ) ) {
					$out['separator'] = (string) $opts['separator'];
				}
				if ( ! empty( $opts['company_name'] ) ) {
					$out['social']['organization'] = (string) $opts['company_name'];
				}
			}
			$social = get_option( 'wpseo_social', array() );
			if ( is_array( $social ) ) {
				foreach ( array( 'facebook_site', 'twitter_site', 'instagram_url', 'linkedin_url' ) as $k ) {
					if ( ! empty( $social[ $k ] ) ) {
						$out['social'][ $k ] = (string) $social[ $k ];
					}
				}
			}
		}

		if ( 'rankmath' === $provider ) {
			$titles = get_option( 'rank-math-options-titles', array() );
			if ( is_array( $titles ) && ! empty( $titles['title_separator'] ) ) {
				$out['separator'] = (string) $titles['title_separator'];
			}
		}

		return $out;
	}

	/**
	 * @param array  $route    Route descriptor.
	 * @param string $provider Provider id.
	 * @return array
	 */
	private function page_seo( array $route, $provider ) {
		$post_id = isset( $route['id'] ) ? (int) $route['id'] : 0;
		$path    = isset( $route['path'] ) ? (string) $route['path'] : '/';
		$title   = '';
		$desc    = '';
		$robots  = array();
		$og      = array();
		$twitter = array();
		$json_ld = array();
		$canonical = '';
		$focus   = '';

		if ( $post_id > 0 ) {
			$post = get_post( $post_id );
			if ( $post ) {
				$title = get_the_title( $post );
				$desc  = $this->excerpt_fallback( $post );
			}
		} else {
			$title = get_bloginfo( 'name' );
			$desc  = get_bloginfo( 'description' );
		}

		if ( 'yoast' === $provider && $post_id > 0 ) {
			$title = $this->yoast_meta( $post_id, 'title', $title );
			$desc  = $this->yoast_meta( $post_id, 'metadesc', $desc );
			$canonical = $this->yoast_meta( $post_id, 'canonical', '' );
			$focus = $this->yoast_meta( $post_id, 'focuskw', '' );
			$noindex = $this->yoast_meta( $post_id, 'meta-robots-noindex', '' );
			if ( '1' === (string) $noindex ) {
				$robots[] = 'noindex';
			}
			$og['title']       = $this->yoast_meta( $post_id, 'opengraph-title', $title );
			$og['description'] = $this->yoast_meta( $post_id, 'opengraph-description', $desc );
			$og['image']       = $this->yoast_meta( $post_id, 'opengraph-image', '' );
			$twitter['title']  = $this->yoast_meta( $post_id, 'twitter-title', $title );
			$twitter['description'] = $this->yoast_meta( $post_id, 'twitter-description', $desc );
			$twitter['image']  = $this->yoast_meta( $post_id, 'twitter-image', '' );
		}

		if ( 'rankmath' === $provider && $post_id > 0 ) {
			$rm_title = get_post_meta( $post_id, 'rank_math_title', true );
			$rm_desc  = get_post_meta( $post_id, 'rank_math_description', true );
			$rm_canon = get_post_meta( $post_id, 'rank_math_canonical_url', true );
			$rm_focus = get_post_meta( $post_id, 'rank_math_focus_keyword', true );
			$rm_robots = get_post_meta( $post_id, 'rank_math_robots', true );
			if ( $rm_title ) {
				$title = (string) $rm_title;
			}
			if ( $rm_desc ) {
				$desc = (string) $rm_desc;
			}
			if ( $rm_canon ) {
				$canonical = (string) $rm_canon;
			}
			if ( $rm_focus ) {
				$focus = (string) $rm_focus;
			}
			if ( is_array( $rm_robots ) ) {
				$robots = array_values( array_map( 'strval', $rm_robots ) );
			}
			$og['title']       = (string) ( get_post_meta( $post_id, 'rank_math_facebook_title', true ) ?: $title );
			$og['description'] = (string) ( get_post_meta( $post_id, 'rank_math_facebook_description', true ) ?: $desc );
			$og['image']       = (string) get_post_meta( $post_id, 'rank_math_facebook_image', true );
			$twitter['title']  = (string) ( get_post_meta( $post_id, 'rank_math_twitter_title', true ) ?: $title );
			$twitter['description'] = (string) ( get_post_meta( $post_id, 'rank_math_twitter_description', true ) ?: $desc );
			$twitter['image']  = (string) get_post_meta( $post_id, 'rank_math_twitter_image', true );
		}

		if ( ! $canonical ) {
			$canonical = $post_id > 0 ? (string) get_permalink( $post_id ) : home_url( $path );
		}

		// Head scrape fallback for JSON-LD / missing OG when a public URL exists.
		$url = $post_id > 0 ? get_permalink( $post_id ) : home_url( $path );
		if ( $url ) {
			$scraped = $this->scrape_head( (string) $url );
			if ( empty( $og['image'] ) && ! empty( $scraped['og']['image'] ) ) {
				$og['image'] = $scraped['og']['image'];
			}
			if ( empty( $desc ) && ! empty( $scraped['description'] ) ) {
				$desc = $scraped['description'];
			}
			if ( ! empty( $scraped['jsonLd'] ) ) {
				$json_ld = $scraped['jsonLd'];
			}
			if ( empty( $title ) && ! empty( $scraped['title'] ) ) {
				$title = $scraped['title'];
			}
		}

		return array(
			'provider'    => $provider,
			'path'        => $path,
			'postId'      => $post_id > 0 ? $post_id : null,
			'title'       => $title,
			'description' => $desc,
			'canonical'   => $canonical,
			'robots'      => $robots,
			'og'          => array_filter( $og ),
			'twitter'     => array_filter( $twitter ),
			'jsonLd'      => $json_ld,
			'focusKeyword'=> $focus,
		);
	}

	/**
	 * @param int    $post_id Post ID.
	 * @param string $key     Yoast meta key (without _).
	 * @param string $default Default.
	 * @return string
	 */
	private function yoast_meta( $post_id, $key, $default = '' ) {
		if ( class_exists( '\WPSEO_Meta' ) ) {
			$val = \WPSEO_Meta::get_value( $key, $post_id );
			if ( is_string( $val ) && '' !== $val ) {
				return $val;
			}
		}
		$val = get_post_meta( $post_id, '_yoast_wpseo_' . str_replace( '-', '_', $key ), true );
		if ( is_string( $val ) && '' !== $val ) {
			return $val;
		}
		// Common Yoast keys use hyphens in the meta key suffix.
		$val = get_post_meta( $post_id, '_yoast_wpseo_' . $key, true );
		if ( is_string( $val ) && '' !== $val ) {
			return $val;
		}
		return $default;
	}

	/**
	 * @param \WP_Post $post Post.
	 * @return string
	 */
	private function excerpt_fallback( $post ) {
		$text = has_excerpt( $post ) ? $post->post_excerpt : wp_strip_all_tags( $post->post_content );
		$text = preg_replace( '/\s+/', ' ', (string) $text );
		return mb_substr( trim( $text ), 0, 160 );
	}

	/**
	 * Lightweight head scrape for JSON-LD + meta.
	 *
	 * @param string $url Absolute URL.
	 * @return array
	 */
	private function scrape_head( $url ) {
		$out = array(
			'title'       => '',
			'description' => '',
			'og'          => array(),
			'jsonLd'      => array(),
		);
		$response = wp_remote_get(
			$url,
			array(
				'timeout'     => 12,
				'redirection' => 3,
				'user-agent'  => 'WP-Grape-Export-SEO/' . ( defined( 'WPGE_VERSION' ) ? WPGE_VERSION : '1' ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $out;
		}
		$body = (string) wp_remote_retrieve_body( $response );
		if ( '' === $body ) {
			return $out;
		}
		if ( preg_match( '/<title[^>]*>(.*?)<\/title>/is', $body, $m ) ) {
			$out['title'] = html_entity_decode( wp_strip_all_tags( $m[1] ), ENT_QUOTES, 'UTF-8' );
		}
		if ( preg_match( '/<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']/i', $body, $m ) ) {
			$out['description'] = html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' );
		}
		foreach ( array( 'og:title', 'og:description', 'og:image', 'og:url', 'og:type' ) as $prop ) {
			$pattern = '/<meta[^>]+property=["\']' . preg_quote( $prop, '/' ) . '["\'][^>]+content=["\']([^"\']*)["\']/i';
			if ( preg_match( $pattern, $body, $m ) ) {
				$key = substr( $prop, 3 );
				$out['og'][ $key ] = html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' );
			}
		}
		if ( preg_match_all( '/<script[^>]+type=["\']application\/ld\+json["\'][^>]*>([\s\S]*?)<\/script>/i', $body, $matches ) ) {
			foreach ( $matches[1] as $raw ) {
				$decoded = json_decode( trim( $raw ), true );
				if ( null !== $decoded ) {
					$out['jsonLd'][] = $decoded;
				}
			}
		}
		return $out;
	}

	/**
	 * @param string $provider Provider.
	 * @return array[]
	 */
	private function collect_redirects( $provider ) {
		$redirects = array();

		if ( 'yoast' === $provider && class_exists( '\WPSEO_Redirect_Option' ) ) {
			try {
				$opt = new \WPSEO_Redirect_Option();
				$all = method_exists( $opt, 'get_all' ) ? $opt->get_all() : array();
				if ( is_array( $all ) ) {
					foreach ( $all as $row ) {
						if ( empty( $row['origin'] ) || empty( $row['url'] ) ) {
							continue;
						}
						$redirects[] = array(
							'from'   => (string) $row['origin'],
							'to'     => (string) $row['url'],
							'type'   => isset( $row['type'] ) ? (int) $row['type'] : 301,
							'source' => 'yoast',
						);
					}
				}
			} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
				$this->warnings[] = 'Yoast redirects unavailable: ' . $e->getMessage();
			}
		}

		// Rank Math redirections table (if present).
		global $wpdb;
		if ( 'rankmath' === $provider && isset( $wpdb ) ) {
			$table = $wpdb->prefix . 'rank_math_redirections';
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
			if ( $exists === $table ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery
				$rows = $wpdb->get_results( "SELECT sources, url_to, header_code FROM {$table} WHERE status = 'active' LIMIT 500", ARRAY_A );
				if ( is_array( $rows ) ) {
					foreach ( $rows as $row ) {
						$sources = maybe_unserialize( $row['sources'] );
						$from    = '';
						if ( is_array( $sources ) && isset( $sources[0]['pattern'] ) ) {
							$from = (string) $sources[0]['pattern'];
						}
						if ( ! $from || empty( $row['url_to'] ) ) {
							continue;
						}
						$redirects[] = array(
							'from'   => $from,
							'to'     => (string) $row['url_to'],
							'type'   => isset( $row['header_code'] ) ? (int) $row['header_code'] : 301,
							'source' => 'rankmath',
						);
					}
				}
			}
		}

		return $redirects;
	}

	/**
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
		return $key ? $key : 'page';
	}
}

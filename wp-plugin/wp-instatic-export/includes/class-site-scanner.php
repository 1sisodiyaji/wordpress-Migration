<?php
/**
 * Collect published routes to export.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Site route scanner.
 */
class Site_Scanner {

	/**
	 * @return array<int,array{id:int,path:string,slug:string,title:string,type:string,builder:string}>
	 */
	public function routes() {
		$detector = new Builder_Detector();
		$out      = array();

		$q = new \WP_Query(
			array(
				'post_type'      => array( 'page', 'post' ),
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'orderby'        => 'menu_order title',
				'order'          => 'ASC',
				'no_found_rows'  => true,
			)
		);

		$front_id = (int) get_option( 'page_on_front' );
		$blog_id  = (int) get_option( 'page_for_posts' );

		foreach ( $q->posts as $post ) {
			$path = $this->path_for_post( $post, $front_id, $blog_id );
			$out[] = array(
				'id'      => (int) $post->ID,
				'path'    => $path,
				'slug'    => $post->post_name ? $post->post_name : sanitize_title( $post->post_title ),
				'title'   => get_the_title( $post ),
				'type'    => $post->post_type,
				'builder' => $detector->detect_post( (int) $post->ID ),
			);
		}

		return $out;
	}

	/**
	 * @param \WP_Post $post Post.
	 * @param int      $front_id Front page ID.
	 * @param int      $blog_id Posts page ID.
	 * @return string URL path starting with /.
	 */
	private function path_for_post( $post, $front_id, $blog_id ) {
		if ( $front_id && (int) $post->ID === $front_id ) {
			return '/';
		}
		$permalink = get_permalink( $post );
		if ( ! $permalink ) {
			return '/' . $post->post_name . '/';
		}
		$home = trailingslashit( home_url( '/' ) );
		$path = wp_make_link_relative( $permalink );
		if ( 0 === strpos( $permalink, $home ) ) {
			$path = '/' . ltrim( substr( $permalink, strlen( $home ) ), '/' );
		}
		$path = '/' . ltrim( (string) $path, '/' );
		if ( '/' !== $path && ! preg_match( '#/$#', $path ) && false === strpos( basename( $path ), '.' ) ) {
			$path .= '/';
		}
		return $path;
	}
}

<?php
/**
 * Builds a map of media attachments (id -> path/alt/sizes).
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Exports the media library as a lookup map and, optionally, copies the
 * underlying files into the bundle.
 */
class Media_Mapper {

	/**
	 * Bundle writer.
	 *
	 * @var Bundle_Writer
	 */
	private $writer;

	/**
	 * Whether to copy files into the bundle.
	 *
	 * @var bool
	 */
	private $copy_files;

	/**
	 * @param Bundle_Writer $writer     Bundle writer.
	 * @param bool          $copy_files Whether to copy media into the bundle.
	 */
	public function __construct( Bundle_Writer $writer, $copy_files = false ) {
		$this->writer     = $writer;
		$this->copy_files = (bool) $copy_files;
	}

	/**
	 * Export the media map.
	 *
	 * @return array[]
	 */
	public function export() {
		$out         = array();
		$uploads     = wp_upload_dir();
		$content_dir = defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : ABSPATH . 'wp-content';

		$attachments = get_posts(
			array(
				'post_type'        => 'attachment',
				'post_status'      => 'inherit',
				'numberposts'      => -1,
				'suppress_filters' => false,
			)
		);

		foreach ( $attachments as $att ) {
			$url  = wp_get_attachment_url( $att->ID );
			$file = get_attached_file( $att->ID );

			$rel_content = '';
			if ( $file && 0 === strpos( $file, $content_dir ) ) {
				$rel_content = ltrim( substr( $file, strlen( $content_dir ) ), '/' );
			}

			$meta  = wp_get_attachment_metadata( $att->ID );
			$sizes = array();
			if ( isset( $meta['sizes'] ) && is_array( $meta['sizes'] ) ) {
				foreach ( $meta['sizes'] as $size => $info ) {
					$sizes[ $size ] = array(
						'width'  => isset( $info['width'] ) ? (int) $info['width'] : null,
						'height' => isset( $info['height'] ) ? (int) $info['height'] : null,
						'file'   => isset( $info['file'] ) ? $info['file'] : null,
					);
				}
			}

			$out[] = array(
				'id'    => (int) $att->ID,
				'url'   => $url ? $url : '',
				'path'  => $rel_content,
				'alt'   => (string) get_post_meta( $att->ID, '_wp_attachment_image_alt', true ),
				'mime'  => $att->post_mime_type,
				'sizes' => (object) $sizes,
			);

			if ( $this->copy_files && $file && $rel_content ) {
				$this->writer->copy( $file, 'assets/wp-content/' . $rel_content );
				// srcset uses intermediate sizes (300x45, 768w, …). Copy those too or
				// the browser picks a missing candidate and the logo/image never shows.
				$dir     = dirname( $file );
				$rel_dir = dirname( $rel_content );
				foreach ( $sizes as $info ) {
					$name = isset( $info['file'] ) ? $info['file'] : '';
					if ( ! $name ) {
						continue;
					}
					$size_abs = $dir . '/' . $name;
					if ( is_readable( $size_abs ) ) {
						$this->writer->copy( $size_abs, 'assets/wp-content/' . $rel_dir . '/' . $name );
					}
				}
			}
		}

		return $out;
	}
}

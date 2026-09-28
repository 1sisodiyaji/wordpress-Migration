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
				// Also copy intermediate sizes next to the original.
				if ( ! empty( $meta['sizes'] ) && is_array( $meta['sizes'] ) && $file ) {
					$base_dir = trailingslashit( dirname( $file ) );
					$rel_dir  = trailingslashit( dirname( $rel_content ) );
					foreach ( $meta['sizes'] as $info ) {
						if ( empty( $info['file'] ) ) {
							continue;
						}
						$sized = $base_dir . $info['file'];
						if ( is_readable( $sized ) ) {
							$this->writer->copy( $sized, 'assets/wp-content/' . $rel_dir . $info['file'] );
						}
					}
				}
			}
		}

		return $out;
	}

	/**
	 * Always copy uploads referenced by exported HTML (header/footer/pages),
	 * even when copy_media is false — site logos and footer images must ship.
	 *
	 * @param string $staging Absolute staging directory (bundle root).
	 * @return int Files copied.
	 */
	public function copy_referenced_uploads( $staging ) {
		$staging = trailingslashit( (string) $staging );
		if ( ! is_dir( $staging ) ) {
			return 0;
		}

		$content_dir = defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : ABSPATH . 'wp-content';
		$uploads     = wp_upload_dir();
		$upload_base = ! empty( $uploads['basedir'] ) ? trailingslashit( $uploads['basedir'] ) : '';
		$upload_url  = ! empty( $uploads['baseurl'] ) ? trailingslashit( $uploads['baseurl'] ) : '';

		$paths = array();
		$iterator = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( $staging, \FilesystemIterator::SKIP_DOTS )
		);
		foreach ( $iterator as $file ) {
			if ( ! $file->isFile() ) {
				continue;
			}
			$ext = strtolower( pathinfo( $file->getFilename(), PATHINFO_EXTENSION ) );
			if ( ! in_array( $ext, array( 'html', 'htm', 'css', 'json' ), true ) ) {
				continue;
			}
			$paths[] = $file->getPathname();
		}

		$copied = 0;
		$seen   = array();

		// Always include the custom logo attachment when set.
		$logo_id = (int) get_theme_mod( 'custom_logo' );
		if ( $logo_id > 0 ) {
			$copied += $this->copy_attachment_tree( $logo_id, $seen );
		}

		foreach ( $paths as $path ) {
			$contents = @file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions, WordPress.PHP.NoSilencedErrors
			if ( ! is_string( $contents ) || '' === $contents ) {
				continue;
			}
			if ( ! preg_match_all( '#(?:https?:)?//[^"\'\s\)]+/wp-content/uploads/([^"\'\s\)]+)#i', $contents, $matches ) ) {
				continue;
			}
			foreach ( $matches[1] as $rel ) {
				$rel = rawurldecode( strtok( $rel, '?#' ) );
				$rel = ltrim( str_replace( '\\', '/', $rel ), '/' );
				if ( '' === $rel || isset( $seen[ $rel ] ) ) {
					continue;
				}
				$seen[ $rel ] = true;

				$abs = '';
				if ( $upload_base && is_readable( $upload_base . $rel ) ) {
					$abs = $upload_base . $rel;
				} elseif ( is_readable( trailingslashit( $content_dir ) . 'uploads/' . $rel ) ) {
					$abs = trailingslashit( $content_dir ) . 'uploads/' . $rel;
				}
				if ( ! $abs ) {
					continue;
				}
				if ( $this->writer->copy( $abs, 'assets/wp-content/uploads/' . $rel ) ) {
					++$copied;
				}
			}
		}

		return $copied;
	}

	/**
	 * Copy one attachment + its intermediate sizes into the bundle.
	 *
	 * @param int   $attachment_id Attachment ID.
	 * @param array $seen          Rel paths already copied (by ref).
	 * @return int Files copied.
	 */
	private function copy_attachment_tree( $attachment_id, array &$seen ) {
		$file = get_attached_file( $attachment_id );
		if ( ! $file || ! is_readable( $file ) ) {
			return 0;
		}
		$content_dir = defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : ABSPATH . 'wp-content';
		if ( 0 !== strpos( $file, $content_dir ) ) {
			return 0;
		}
		$rel = ltrim( substr( $file, strlen( $content_dir ) ), '/' );
		$copied = 0;
		if ( ! isset( $seen[ $rel ] ) ) {
			$seen[ $rel ] = true;
			if ( $this->writer->copy( $file, 'assets/wp-content/' . $rel ) ) {
				++$copied;
			}
		}
		$meta = wp_get_attachment_metadata( $attachment_id );
		if ( empty( $meta['sizes'] ) || ! is_array( $meta['sizes'] ) ) {
			return $copied;
		}
		$base_dir = trailingslashit( dirname( $file ) );
		$rel_dir  = trailingslashit( dirname( $rel ) );
		foreach ( $meta['sizes'] as $info ) {
			if ( empty( $info['file'] ) ) {
				continue;
			}
			$sized_rel = $rel_dir . $info['file'];
			if ( isset( $seen[ $sized_rel ] ) ) {
				continue;
			}
			$seen[ $sized_rel ] = true;
			$sized = $base_dir . $info['file'];
			if ( is_readable( $sized ) && $this->writer->copy( $sized, 'assets/wp-content/' . $sized_rel ) ) {
				++$copied;
			}
		}
		return $copied;
	}
}

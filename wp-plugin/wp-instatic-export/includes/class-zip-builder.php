<?php
/**
 * Zips a staging directory.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Zip builder.
 */
class Zip_Builder {

	/**
	 * @param string $source_dir Staging directory.
	 * @param string $zip_path   Output zip path.
	 * @return bool
	 * @throws \RuntimeException On failure.
	 */
	public function build( $source_dir, $zip_path ) {
		if ( ! class_exists( '\\ZipArchive' ) ) {
			throw new \RuntimeException( 'ZipArchive PHP extension is not available.' );
		}

		$zip = new \ZipArchive();
		if ( true !== $zip->open( $zip_path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE ) ) {
			throw new \RuntimeException( 'Could not create ZIP at ' . $zip_path );
		}

		$source_dir = rtrim( $source_dir, '/\\' );
		$iterator   = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( $source_dir, \FilesystemIterator::SKIP_DOTS ),
			\RecursiveIteratorIterator::LEAVES_ONLY
		);

		foreach ( $iterator as $file ) {
			if ( $file->isDir() ) {
				continue;
			}
			$file_path     = $file->getRealPath();
			$relative_path = ltrim( str_replace( '\\', '/', substr( $file_path, strlen( $source_dir ) ) ), '/' );
			$zip->addFile( $file_path, $relative_path );
		}

		$zip->close();
		return true;
	}
}

<?php
/**
 * Zips the staged bundle directory.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wraps ZipArchive to package the staging directory into a single archive.
 */
class Zip_Builder {

	/**
	 * Build a ZIP from a directory.
	 *
	 * @param string $source_dir Absolute path to the staging directory.
	 * @param string $zip_path   Absolute path for the output archive.
	 * @return bool
	 * @throws \RuntimeException When ZipArchive is unavailable or fails.
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
			$relative_path = ltrim( substr( $file_path, strlen( $source_dir ) ), '/\\' );
			$zip->addFile( $file_path, $relative_path );
		}

		$zip->close();
		return true;
	}
}

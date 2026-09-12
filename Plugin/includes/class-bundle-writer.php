<?php
/**
 * Writes files into the export staging directory.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Small helper around the staging directory used to assemble the bundle
 * before it is zipped.
 */
class Bundle_Writer {

	/**
	 * Absolute path to the staging root.
	 *
	 * @var string
	 */
	private $root;

	/**
	 * @param string $root Absolute path to an (empty) staging directory.
	 */
	public function __construct( $root ) {
		$this->root = trailingslashit( $root );
		if ( ! file_exists( $this->root ) ) {
			wp_mkdir_p( $this->root );
		}
	}

	/**
	 * @return string Absolute staging root path.
	 */
	public function root() {
		return $this->root;
	}

	/**
	 * Write a value as pretty JSON.
	 *
	 * @param string $relative Path relative to the staging root.
	 * @param mixed  $data     JSON-serializable data.
	 */
	public function write_json( $relative, $data ) {
		$this->write(
			$relative,
			wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		);
	}

	/**
	 * Write raw text/HTML.
	 *
	 * @param string $relative Path relative to the staging root.
	 * @param string $contents File contents.
	 */
	public function write( $relative, $contents ) {
		$path = $this->root . ltrim( $relative, '/' );
		$dir  = dirname( $path );
		if ( ! file_exists( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		file_put_contents( $path, $contents ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	}

	/**
	 * Copy an arbitrary file into the bundle.
	 *
	 * @param string $source   Absolute source path.
	 * @param string $relative Destination relative to staging root.
	 * @return bool
	 */
	public function copy( $source, $relative ) {
		if ( ! is_readable( $source ) ) {
			return false;
		}
		$path = $this->root . ltrim( $relative, '/' );
		$dir  = dirname( $path );
		if ( ! file_exists( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		return copy( $source, $path );
	}
}

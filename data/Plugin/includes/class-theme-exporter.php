<?php
/**
 * Copies the active (and parent) theme tree into the export bundle.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Full theme fidelity: style.css, theme.json, templates/, parts/, patterns/,
 * styles/, assets/, and other theme files — not just enqueued fragments.
 */
class Theme_Exporter {

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
	 * Directory / file name patterns to skip.
	 *
	 * @var string[]
	 */
	private $skip_names = array(
		'.',
		'..',
		'.git',
		'.svn',
		'node_modules',
		'vendor',
		'.DS_Store',
		'Thumbs.db',
	);

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
	 * Export stylesheet + parent theme trees.
	 *
	 * @return array{index:array,copied:int}
	 */
	public function export() {
		$stylesheet = get_stylesheet();
		$template   = get_template();
		$copied     = 0;
		$themes     = array();

		$slugs = array_values( array_unique( array_filter( array( $stylesheet, $template ) ) ) );
		foreach ( $slugs as $slug ) {
			$theme = wp_get_theme( $slug );
			if ( ! $theme->exists() ) {
				$this->warnings[] = sprintf( 'Theme "%s" not found on disk.', $slug );
				continue;
			}
			$root = $theme->get_stylesheet_directory();
			if ( ! is_dir( $root ) ) {
				$this->warnings[] = sprintf( 'Theme directory missing: %s', $root );
				continue;
			}

			$count = $this->copy_tree( $root, 'theme/' . $slug );
			$copied += $count;

			$themes[] = array(
				'slug'         => $slug,
				'name'         => $theme->get( 'Name' ),
				'version'      => $theme->get( 'Version' ),
				'isStylesheet' => ( $slug === $stylesheet ),
				'isTemplate'   => ( $slug === $template ),
				'hasThemeJson' => is_readable( trailingslashit( $root ) . 'theme.json' ),
				'path'         => 'theme/' . $slug,
				'filesCopied'  => $count,
			);
		}

		// Merged theme.json data (tokens) when available — editable source of truth.
		$merged = null;
		if ( class_exists( '\WP_Theme_JSON_Resolver' ) ) {
			try {
				$data = \WP_Theme_JSON_Resolver::get_merged_data();
				if ( $data && method_exists( $data, 'get_data' ) ) {
					$merged = $data->get_data();
				}
			} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
				$this->warnings[] = 'Could not dump merged theme.json data: ' . $e->getMessage();
			}
		}
		if ( null !== $merged ) {
			$this->writer->write_json( 'theme/global-styles.json', $merged );
		}

		$index = array(
			'stylesheet'   => $stylesheet,
			'template'     => $template,
			'hasThemeJson' => (bool) wp_get_theme()->get_file_path( 'theme.json' ),
			'themes'       => $themes,
			'globalStyles' => null !== $merged ? 'theme/global-styles.json' : null,
		);
		$this->writer->write_json( 'theme/index.json', $index );

		return array(
			'index'  => $index,
			'copied' => $copied,
		);
	}

	/**
	 * Recursively copy a directory into the bundle.
	 *
	 * @param string $source Absolute source dir.
	 * @param string $dest   Relative bundle path.
	 * @return int Files copied.
	 */
	private function copy_tree( $source, $dest ) {
		$count  = 0;
		$source = untrailingslashit( $source );
		$items  = @scandir( $source ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
		if ( ! is_array( $items ) ) {
			return 0;
		}

		foreach ( $items as $item ) {
			if ( in_array( $item, $this->skip_names, true ) ) {
				continue;
			}
			$from = $source . '/' . $item;
			$to   = trailingslashit( $dest ) . $item;

			if ( is_dir( $from ) ) {
				$count += $this->copy_tree( $from, $to );
				continue;
			}
			if ( ! is_file( $from ) || ! is_readable( $from ) ) {
				continue;
			}
			// Skip huge binaries that aren't needed for design fidelity.
			$ext = strtolower( pathinfo( $from, PATHINFO_EXTENSION ) );
			if ( in_array( $ext, array( 'zip', 'tar', 'gz', 'map' ), true ) ) {
				continue;
			}
			if ( $this->writer->copy( $from, $to ) ) {
				$count++;
			}
		}

		return $count;
	}
}

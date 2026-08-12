<?php
/**
 * Orchestrates a static HTML/CSS/JS export for Instatic Super Import.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Export job.
 */
class Export_Job {

	/** @var array */
	private $args;

	/** @var string[] */
	private $warnings = array();

	/**
	 * @param array $args {
	 *     @type bool $include_posts Include blog posts (default true).
	 * }
	 */
	public function __construct( array $args = array() ) {
		$this->args = wp_parse_args(
			$args,
			array(
				'include_posts' => true,
			)
		);
	}

	/**
	 * Run export.
	 *
	 * @return array{zip:string,url:string,stats:array}
	 */
	public function run() {
		@set_time_limit( 0 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			throw new \RuntimeException( 'Uploads directory is not writable: ' . $uploads['error'] );
		}

		$base = trailingslashit( $uploads['basedir'] ) . 'wp-instatic-export';
		if ( ! wp_mkdir_p( $base ) || ! is_writable( $base ) ) {
			throw new \RuntimeException( 'Cannot write export directory: ' . $base );
		}

		$stamp   = gmdate( 'Ymd-His' );
		$staging = trailingslashit( $base ) . 'staging-' . $stamp;
		if ( ! wp_mkdir_p( $staging ) ) {
			throw new \RuntimeException( 'Cannot create staging directory: ' . $staging );
		}

		$detector = new Builder_Detector();
		$detected = $detector->detect_site();

		$scanner = new Site_Scanner();
		$routes  = $scanner->routes();
		if ( empty( $this->args['include_posts'] ) ) {
			$routes = array_values(
				array_filter(
					$routes,
					static function ( $r ) {
						return 'page' === $r['type'];
					}
				)
			);
		}

		$route_files = array();
		foreach ( $routes as $route ) {
			$route_files[ $route['path'] ] = $this->html_path_for_route( $route['path'] );
		}

		$rewriter = new Url_Rewriter();
		$packer   = new Asset_Packer( $rewriter, $staging );
		$fetcher  = new Page_Fetcher();
		$processor = new Html_Processor( $rewriter, $packer, $route_files );

		$pages_ok = 0;
		$page_meta = array();

		foreach ( $routes as $route ) {
			$url       = home_url( $route['path'] );
			$page_file = $route_files[ $route['path'] ];
			try {
				$html = $fetcher->fetch( $url );
				$html = $processor->process( $html, $page_file );
				$this->write_staging_file( $staging, $page_file, $html );
				$pages_ok++;
				$page_meta[] = array(
					'id'      => $route['id'],
					'path'    => $route['path'],
					'file'    => $page_file,
					'title'   => $route['title'],
					'builder' => $route['builder'],
				);
			} catch ( \Throwable $e ) {
				$this->warnings[] = $route['path'] . ': ' . $e->getMessage();
			}
		}

		$this->rewrite_all_packed_css( $packer, $staging );
		$this->write_manifest(
			$staging,
			array(
				'generator'     => 'wp-instatic-export',
				'version'       => WPIE_VERSION,
				'exportedAt'    => gmdate( 'c' ),
				'siteUrl'       => home_url( '/' ),
				'siteName'      => get_bloginfo( 'name' ),
				'builder'       => $detected,
				'pages'         => $page_meta,
				'assets'        => array_values( $packer->map() ),
				'missingAssets' => array_values( array_unique( $packer->missing() ) ),
				'warnings'      => $this->warnings,
			)
		);

		$zip_name = 'instatic-export-' . $stamp . '.zip';
		$zip_path = trailingslashit( $base ) . $zip_name;
		( new Zip_Builder() )->build( $staging, $zip_path );

		$this->rrmdir( $staging );

		$url = trailingslashit( $uploads['baseurl'] ) . 'wp-instatic-export/' . $zip_name;

		$stats = array(
			'builder'       => $detected['builder'],
			'confidence'    => $detected['confidence'],
			'pages'         => $pages_ok,
			'routes'        => count( $routes ),
			'assets'        => count( $packer->map() ),
			'missingAssets' => count( array_unique( $packer->missing() ) ),
			'warnings'      => count( $this->warnings ),
		);

		update_option(
			'wpie_last_export',
			array(
				'zip'   => $zip_path,
				'url'   => $url,
				'stats' => $stats,
				'time'  => time(),
			),
			false
		);

		return array(
			'zip'   => $zip_path,
			'url'   => $url,
			'stats' => $stats,
		);
	}

	/**
	 * Map a site path to an HTML file inside the zip.
	 *
	 * @param string $path Route path.
	 * @return string
	 */
	private function html_path_for_route( $path ) {
		$path = '/' . ltrim( $path, '/' );
		if ( '/' === $path ) {
			return 'index.html';
		}
		$path = trim( $path, '/' );
		if ( '' === $path ) {
			return 'index.html';
		}
		return $path . '/index.html';
	}

	/**
	 * @param string $staging Staging.
	 * @param string $rel     Relative file.
	 * @param string $data    Contents.
	 */
	private function write_staging_file( $staging, $rel, $data ) {
		$dest = trailingslashit( $staging ) . str_replace( '\\', '/', $rel );
		$dir  = dirname( $dest );
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		file_put_contents( $dest, $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}

	/**
	 * @param string $staging Staging.
	 * @param array  $manifest Manifest data.
	 */
	private function write_manifest( $staging, array $manifest ) {
		$this->write_staging_file(
			$staging,
			'instatic-manifest.json',
			wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES )
		);
	}

	/**
	 * Rewrite url() inside every packed CSS file to be relative to that file.
	 *
	 * @param Asset_Packer $packer  Packer.
	 * @param string       $staging Staging root.
	 */
	private function rewrite_all_packed_css( Asset_Packer $packer, $staging ) {
		$rewriter = new Url_Rewriter();
		foreach ( $packer->map() as $zip ) {
			if ( 'css' !== strtolower( pathinfo( $zip, PATHINFO_EXTENSION ) ) ) {
				continue;
			}
			$abs = trailingslashit( $staging ) . $zip;
			if ( ! is_readable( $abs ) ) {
				continue;
			}
			$css = file_get_contents( $abs ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$css = $packer->rewrite_css( $css, $zip );
			file_put_contents( $abs, $css ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		unset( $rewriter );
	}

	/**
	 * @param string $dir Directory.
	 */
	private function rrmdir( $dir ) {
		if ( ! is_dir( $dir ) ) {
			return;
		}
		$items = scandir( $dir );
		if ( false === $items ) {
			return;
		}
		foreach ( $items as $item ) {
			if ( '.' === $item || '..' === $item ) {
				continue;
			}
			$path = $dir . DIRECTORY_SEPARATOR . $item;
			if ( is_dir( $path ) ) {
				$this->rrmdir( $path );
			} else {
				@unlink( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			}
		}
		@rmdir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
	}
}

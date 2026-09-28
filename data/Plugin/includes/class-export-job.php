<?php
/**
 * Orchestrates a full site export into a ZIP bundle.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Runs each exporter in order and assembles the bundle described by
 * export-schema/v2/manifest.schema.json.
 */
class Export_Job {

	/**
	 * Export arguments.
	 *
	 * @var array
	 */
	private $args;

	/**
	 * Collected warnings.
	 *
	 * @var string[]
	 */
	private $warnings = array();

	/**
	 * @param array $args {
	 *     @type int[]  $post_types Which post types to include (default: page, post).
	 *     @type bool   $copy_media Whether to copy media files into the bundle (default false).
	 * }
	 */
	public function __construct( array $args = array() ) {
		$parsed = wp_parse_args(
			$args,
			array(
				'post_types' => array( 'page', 'post' ),
				'copy_media' => false,
			)
		);
		$parsed['post_types'] = Site_Scanner::sanitize_route_post_types( (array) $parsed['post_types'] );
		$this->args           = $parsed;
	}

	/**
	 * Execute the export.
	 *
	 * @return array{zip:string,url:string,stats:array}
	 */
	public function run() {
		@set_time_limit( 0 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			throw new \RuntimeException( 'Uploads directory is not writable: ' . $uploads['error'] );
		}

		$base = trailingslashit( $uploads['basedir'] ) . 'wp-grape-export';
		if ( ! wp_mkdir_p( $base ) || ! is_writable( $base ) ) {
			throw new \RuntimeException( 'Cannot write export directory: ' . $base );
		}
		$stamp        = gmdate( 'Ymd-His' );
		$staging      = trailingslashit( $base ) . 'staging-' . $stamp;
		$writer       = new Bundle_Writer( $staging );

		$scanner   = new Site_Scanner( $this->args );
		$site      = $scanner->site();
		$routes    = $scanner->routes();

		// Layout: header, footer, menus.
		$layout_exporter = new Layout_Exporter( $writer, $site['pageBuilder'] );
		$layout          = $layout_exporter->export();

		$menu_exporter    = new Menu_Exporter();
		$layout['menus']  = $menu_exporter->export();

		// Templates library (elementor_library / elementskit_template).
		$templates = $layout_exporter->templates();

		// Pages.
		$page_exporter = new Page_Exporter( $writer, $site['pageBuilder'] );
		$route_records = array();
		foreach ( $routes as $route ) {
			$result = $page_exporter->export_route( $route );
			if ( $result ) {
				$route_records[] = $result['route'];
			}
		}
		$audit = $page_exporter->audit();

		$post_ids = array();
		foreach ( $route_records as $route ) {
			if ( isset( $route['id'] ) ) {
				$post_ids[] = (int) $route['id'];
			}
		}
		if ( ! empty( $layout['header']['postId'] ) ) {
			$post_ids[] = (int) $layout['header']['postId'];
		}
		if ( ! empty( $layout['footer']['postId'] ) ) {
			$post_ids[] = (int) $layout['footer']['postId'];
		}
		foreach ( $templates as $tpl ) {
			if ( isset( $tpl['id'] ) ) {
				$post_ids[] = (int) $tpl['id'];
			}
		}
		$post_ids = array_values( array_unique( array_filter( $post_ids ) ) );

		$widget_assets = new Widget_Assets();
		$inventory     = $widget_assets->site_inventory( $post_ids );
		$missing       = $widget_assets->missing_assets( $inventory );
		if ( ! empty( $missing ) ) {
			$this->warnings[] = sprintf(
				'%d required asset file(s) missing on disk (see audit/coverage.json).',
				count( $missing )
			);
		}

		// Assets: enqueue order captured after simulating front-end renders (builder-aware).
		$builder          = isset( $site['pageBuilder'] ) ? (string) $site['pageBuilder'] : 'classic';
		$assets_collector = new Assets_Collector();
		$assets           = $assets_collector->collect( $scanner->front_page_id(), $post_ids, $builder );

		// Copy CSS/JS files (+ inline blocks) into the bundle.
		$assets_copier = new Assets_Copier( $writer );
		$copy_result   = $assets_copier->copy( $assets, $post_ids, $builder );
		$assets        = $copy_result['manifest'];
		$this->warnings = array_merge( $this->warnings, $copy_result['warnings'] );
		if ( 0 === $copy_result['copied'] ) {
			$this->warnings[] = 'No CSS/JS files were copied. Check that wp-content is readable inside the container.';
		}

		// Duotone SVG filters + CSS vars (site logos). Prefer front HTML capture;
		// Converter also regenerates from theme.json when these are missing.
		$front_html = Front_Html::fetch( home_url( '/' ) );
		if ( $front_html ) {
			$duotone_svgs = Front_Html::extract_duotone_svgs( $front_html );
			if ( $duotone_svgs ) {
				$writer->write( 'assets/inline/duotone-filters.html', $duotone_svgs . "\n" );
			}
			$duotone_css = Front_Html::extract_duotone_css_vars( $front_html );
			if ( $duotone_css ) {
				$writer->write( 'assets/inline/styles/theme-duotone.css', $duotone_css . "\n" );
			}
		}

		// Media map (+ optional full library copy).
		$media_mapper = new Media_Mapper( $writer, (bool) $this->args['copy_media'] );
		$media        = $media_mapper->export();

		// Always copy uploads referenced by exported HTML (logos, footer images…),
		// even when copy_media is unchecked — otherwise Converter rewrites src to
		// /assets/... and the file 404s.
		$referenced_media = $media_mapper->copy_referenced_uploads( $writer->root() );
		if ( $referenced_media > 0 ) {
			// Surface in stats via counts after we build the manifest.
		}

		// Full theme tree (theme.json, templates, parts, patterns, assets…).
		$theme_exporter = new Theme_Exporter( $writer );
		$theme_result   = $theme_exporter->export();
		$this->warnings = array_merge( $this->warnings, $theme_exporter->warnings() );

		// SEO package (Yoast / Rank Math / core + head scrape).
		$seo_exporter = new Seo_Exporter( $writer );
		$seo_result   = $seo_exporter->export( $route_records );
		$this->warnings = array_merge( $this->warnings, $seo_exporter->warnings() );

		// Write section files.
		$writer->write_json( 'site.json', $site );
		$writer->write_json( 'layout.json', $layout );
		$writer->write_json( 'routes.json', $route_records );
		$writer->write_json( 'templates/index.json', $templates );
		$writer->write_json( 'assets/manifest.json', $assets );
		$writer->write_json( 'media/map.json', $media );
		$writer->write_json(
			'audit/coverage.json',
			array(
				'inventory'      => $inventory,
				'missingAssets'  => $missing,
				'activePlugins'  => $site['activePlugins'] ?? array(),
				'builderPlugins' => $site['builderPlugins'] ?? array(),
			)
		);
		$writer->write_json(
			'audit/report.json',
			array(
				'unresolvedShortcodes' => $audit['unresolvedShortcodes'],
				'warnings'             => array_merge( $this->warnings, $audit['warnings'] ),
				'missingAssets'        => $missing,
				'widgetCount'          => count( $inventory['widgets'] ),
				'animationCount'       => count( $inventory['animations'] ),
				'pluginPackages'       => $inventory['plugins'],
			)
		);

		// Top-level manifest.
		$manifest = array(
			'version'    => WPGE_SCHEMA_VERSION,
			'generator'  => array(
				'name'       => 'wp-grape-export',
				'version'    => WPGE_VERSION,
				'wpVersion'  => get_bloginfo( 'version' ),
				'phpVersion' => PHP_VERSION,
			),
			'exportedAt' => gmdate( 'c' ),
			'site'       => $site,
			'counts'     => array(
				'routes'               => count( $route_records ),
				'pages'                => count( $route_records ),
				'templates'            => count( $templates ),
				'menus'                => count( $layout['menus'] ),
				'media'                => count( $media ),
				'assetsCopied'         => $copy_result['copied'],
				'themeFilesCopied'     => $theme_result['copied'],
				'mediaFilesCopied'     => $referenced_media + ( (bool) $this->args['copy_media'] ? count( $media ) : 0 ),
				'seoPages'             => $seo_result['pages'],
				'seoRedirects'         => $seo_result['redirects'],
				'unresolvedShortcodes' => count( $audit['unresolvedShortcodes'] ),
			),
			'files'      => array(
				'site'   => 'site.json',
				'layout' => 'layout.json',
				'routes' => 'routes.json',
				'assets' => 'assets/manifest.json',
				'media'  => 'media/map.json',
				'theme'  => 'theme/index.json',
				'seo'    => 'seo/site.json',
				'audit'  => 'audit/report.json',
			),
			'seo'        => array(
				'provider' => $seo_result['provider'],
			),
			'theme'      => $theme_result['index'],
		);
		$writer->write_json( 'manifest.json', $manifest );

		// Zip it.
		$slug     = sanitize_title( $site['name'] ? $site['name'] : 'site' );
		$zip_name = 'wp-grape-export-' . $slug . '-' . $stamp . '.zip';
		$zip_path = trailingslashit( $base ) . $zip_name;

		$zip_builder = new Zip_Builder();
		$zip_builder->build( $staging, $zip_path );

		// Clean staging (best-effort).
		$this->rrmdir( $staging );

		$zip_url = trailingslashit( $uploads['baseurl'] ) . 'wp-grape-export/' . $zip_name;

		return array(
			'zip'   => $zip_path,
			'url'   => $zip_url,
			'stats' => $manifest['counts'],
		);
	}

	/**
	 * Recursively remove a directory.
	 *
	 * @param string $dir Directory path.
	 */
	private function rrmdir( $dir ) {
		if ( ! is_dir( $dir ) ) {
			return;
		}
		$items = scandir( $dir );
		foreach ( $items as $item ) {
			if ( '.' === $item || '..' === $item ) {
				continue;
			}
			$path = $dir . '/' . $item;
			if ( is_dir( $path ) ) {
				$this->rrmdir( $path );
			} else {
				unlink( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			}
		}
		rmdir( $dir ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	}
}

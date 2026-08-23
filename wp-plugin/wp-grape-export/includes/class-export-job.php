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
		$templates_index = $layout_exporter->templates_index();

		// Pages (stamp header/footer template IDs from layout onto each page meta).
		$page_exporter = new Page_Exporter( $writer, $site['pageBuilder'], $layout );
		$route_records = array();
		foreach ( $routes as $route ) {
			$result = $page_exporter->export_route( $route );
			if ( $result ) {
				$route_records[] = $result['route'];
			}
		}
		$audit = $page_exporter->audit();

		// Persist any CTA / nested documents resolved from postmeta that were
		// not already in the template library index.
		$known_tpl_ids = array();
		foreach ( $templates as $tpl ) {
			if ( isset( $tpl['id'] ) ) {
				$known_tpl_ids[ (int) $tpl['id'] ] = true;
			}
		}
		foreach ( $audit['resolvedDocumentIds'] as $doc_id ) {
			$doc_id = (int) $doc_id;
			if ( $doc_id <= 0 || isset( $known_tpl_ids[ $doc_id ] ) ) {
				continue;
			}
			$extra = $this->export_orphan_document( $writer, $doc_id );
			if ( $extra ) {
				$templates[]              = $extra;
				$index_row                = $extra;
				unset( $index_row['html'] );
				$templates_index[]        = $index_row;
				$known_tpl_ids[ $doc_id ] = true;
			}
		}
		$writer->write_json( 'templates/index.json', $templates_index );

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
		foreach ( $audit['resolvedDocumentIds'] as $rid ) {
			$post_ids[] = (int) $rid;
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

		// Assets: enqueue order captured after simulating front-end renders.
		$assets_collector = new Assets_Collector();
		$assets           = $assets_collector->collect( $scanner->front_page_id(), $post_ids );

		// Copy CSS/JS files (+ inline blocks) into the bundle.
		$assets_copier = new Assets_Copier( $writer );
		$copy_result   = $assets_copier->copy( $assets, $post_ids );
		$assets        = $copy_result['manifest'];
		$this->warnings = array_merge( $this->warnings, $copy_result['warnings'] );
		if ( 0 === $copy_result['copied'] ) {
			$this->warnings[] = 'No CSS/JS files were copied. Check that wp-content is readable inside the container.';
		}

		// Media map.
		$media_mapper = new Media_Mapper( $writer, (bool) $this->args['copy_media'] );
		$media        = $media_mapper->export();

		// Write section files.
		$writer->write_json( 'site.json', $site );
		$writer->write_json( 'layout.json', $layout );
		$writer->write_json( 'routes.json', $route_records );
		$writer->write_json( 'templates/index.json', $templates_index );
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
				'unresolvedShortcodes' => count( $audit['unresolvedShortcodes'] ),
			),
			'files'      => array(
				'site'   => 'site.json',
				'layout' => 'layout.json',
				'routes' => 'routes.json',
				'assets' => 'assets/manifest.json',
				'media'  => 'media/map.json',
				'audit'  => 'audit/report.json',
			),
		);
		$writer->write_json( 'manifest.json', $manifest );

		// Zip it.
		$slug     = sanitize_title( $site['name'] ? $site['name'] : 'site' );
		$zip_name = 'wp-grape-export-' . $slug . '-' . $stamp . '.zip';
		$zip_path = trailingslashit( $base ) . $zip_name;

		$zip_builder = new Zip_Builder();
		$zip_builder->build( $staging, $zip_path );

		// Stable paths for the local inner loop (no re-upload): latest/ + latest.zip
		// sit next to the timestamped archive on the bind-mounted uploads volume.
		$latest_dir = trailingslashit( $base ) . 'latest';
		$latest_zip = trailingslashit( $base ) . 'latest.zip';
		if ( is_file( $zip_path ) ) {
			copy( $zip_path, $latest_zip ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		}
		$this->rrmdir( $latest_dir );
		if ( ! @rename( $staging, $latest_dir ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			$this->rrmdir( $staging );
			$latest_dir = '';
		}

		$zip_url = trailingslashit( $uploads['baseurl'] ) . 'wp-grape-export/' . $zip_name;

		return array(
			'zip'       => $zip_path,
			'url'       => $zip_url,
			'latestDir' => $latest_dir,
			'latestZip' => $latest_zip,
			'stats'     => $manifest['counts'],
		);
	}

	/**
	 * Export a nested CTA / section document that was only referenced by shortcode ID.
	 *
	 * @param Bundle_Writer $writer  Bundle writer.
	 * @param int           $post_id Document post ID.
	 * @return array|null Template record.
	 */
	private function export_orphan_document( Bundle_Writer $writer, $post_id ) {
		$post_id = (int) $post_id;
		$post    = get_post( $post_id );
		if ( ! $post || ! Elementor_Bridge::has_elementor_data( $post_id ) ) {
			return null;
		}

		$bridge = new Elementor_Bridge();
		$bridge->ensure_post_css( $post_id );
		foreach ( $bridge->nested_template_ids( $post_id ) as $nested_id ) {
			$bridge->ensure_post_css( $nested_id );
		}

		$type = $bridge->document_type( $post_id );
		$type = $type ? sanitize_title( $type ) : 'section';
		$resolver = new Shortcode_Resolver( $bridge );
		$html     = $bridge->render( $post_id );
		$html     = $resolver->resolve(
			$html,
			array(
				'postId' => $post_id,
				'path'   => 'template:' . $post->post_name,
			)
		);
		$data = $bridge->data( $post_id );

		$html_file = 'templates/' . $post_id . '-' . $type . '.html';
		$writer->write( $html_file, $html );

		$data_file = null;
		if ( $data ) {
			$data_file = 'templates/' . $post_id . '-' . $type . '.json';
			$writer->write_json( $data_file, $data );
		}

		return array(
			'id'         => $post_id,
			'slug'       => $post->post_name,
			'title'      => get_the_title( $post ),
			'type'       => $type,
			'location'   => $bridge->location( $post_id ),
			'source'     => $post->post_type,
			'htmlFile'   => $html_file,
			'html'       => $html,
			'dataFile'   => $data_file,
			'conditions' => array(),
			'shortcodes' => $resolver->collect_from_elementor_data( $data ),
			'orphan'     => true,
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

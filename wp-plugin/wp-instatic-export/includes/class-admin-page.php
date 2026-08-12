<?php
/**
 * Admin UI under Tools → Instatic Export.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Admin page.
 */
class Admin_Page {

	const SLUG   = 'wp-instatic-export';
	const ACTION = 'wpie_run_export';
	const NONCE  = 'wpie_export_nonce';

	/**
	 * Register hooks.
	 */
	public function register() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle_export' ) );
	}

	/**
	 * Add Tools submenu.
	 */
	public function add_menu() {
		add_management_page(
			__( 'Instatic Export', 'wp-instatic-export' ),
			__( 'Instatic Export', 'wp-instatic-export' ),
			'manage_options',
			self::SLUG,
			array( $this, 'render' )
		);
	}

	/**
	 * Render screen.
	 */
	public function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$detector = new Builder_Detector();
		$detected = $detector->detect_site();
		$scanner  = new Site_Scanner();
		$routes   = $scanner->routes();
		$last     = get_option( 'wpie_last_export' );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'WP Instatic Export', 'wp-instatic-export' ); ?></h1>
			<p>
				<?php esc_html_e( 'Export this site as a static HTML/CSS/JS ZIP with relative asset paths, ready for Instatic Super Import.', 'wp-instatic-export' ); ?>
			</p>

			<div class="card" style="max-width:720px;padding:12px 16px;margin:16px 0;">
				<h2 style="margin-top:0;"><?php esc_html_e( 'Detected builder', 'wp-instatic-export' ); ?></h2>
				<p>
					<strong><?php echo esc_html( strtoupper( $detected['builder'] ) ); ?></strong>
					— <?php echo esc_html( sprintf( /* translators: %s confidence */ __( 'confidence: %s', 'wp-instatic-export' ), $detected['confidence'] ) ); ?>
				</p>
				<?php if ( ! empty( $detected['notes'] ) ) : ?>
					<ul style="list-style:disc;margin-left:1.2em;">
						<?php foreach ( $detected['notes'] as $note ) : ?>
							<li><?php echo esc_html( $note ); ?></li>
						<?php endforeach; ?>
					</ul>
				<?php endif; ?>
				<p class="description">
					<?php echo esc_html( sprintf( /* translators: %d route count */ _n( '%d published route will be fetched.', '%d published routes will be fetched.', count( $routes ), 'wp-instatic-export' ), count( $routes ) ) ); ?>
				</p>
			</div>

			<?php if ( isset( $_GET['exported'] ) && is_array( $last ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<div class="notice notice-success">
					<p>
						<?php esc_html_e( 'Export complete.', 'wp-instatic-export' ); ?>
						<a href="<?php echo esc_url( $last['url'] ); ?>"><?php esc_html_e( 'Download ZIP', 'wp-instatic-export' ); ?></a>
					</p>
					<?php if ( ! empty( $last['stats'] ) ) : ?>
						<p><code><?php echo esc_html( wp_json_encode( $last['stats'] ) ); ?></code></p>
					<?php endif; ?>
				</div>
			<?php endif; ?>

			<?php if ( isset( $_GET['export_error'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<?php
				$err = get_transient( 'wpie_export_error_' . get_current_user_id() );
				delete_transient( 'wpie_export_error_' . get_current_user_id() );
				?>
				<div class="notice notice-error">
					<p>
						<strong><?php esc_html_e( 'Export failed.', 'wp-instatic-export' ); ?></strong>
						<?php echo esc_html( $err ? $err : __( 'Unknown error.', 'wp-instatic-export' ) ); ?>
					</p>
				</div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION ); ?>" />
				<?php wp_nonce_field( self::ACTION, self::NONCE ); ?>

				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Include posts', 'wp-instatic-export' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="include_posts" value="1" checked="checked" />
								<?php esc_html_e( 'Export published blog posts as well as pages.', 'wp-instatic-export' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Output', 'wp-instatic-export' ); ?></th>
						<td>
							<p class="description">
								<?php esc_html_e( 'Each page is fetched as a visitor would see it. Local CSS, JS, fonts, and media are copied under assets/ with relative links. Zip layout: index.html, about/index.html, assets/…', 'wp-instatic-export' ); ?>
							</p>
						</td>
					</tr>
				</table>

				<?php submit_button( __( 'Run Instatic export', 'wp-instatic-export' ) ); ?>
			</form>

			<?php if ( $routes ) : ?>
				<h2><?php esc_html_e( 'Routes preview', 'wp-instatic-export' ); ?></h2>
				<table class="widefat striped" style="max-width:900px;">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Title', 'wp-instatic-export' ); ?></th>
							<th><?php esc_html_e( 'Path', 'wp-instatic-export' ); ?></th>
							<th><?php esc_html_e( 'Type', 'wp-instatic-export' ); ?></th>
							<th><?php esc_html_e( 'Builder', 'wp-instatic-export' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( array_slice( $routes, 0, 50 ) as $route ) : ?>
							<tr>
								<td><?php echo esc_html( $route['title'] ); ?></td>
								<td><code><?php echo esc_html( $route['path'] ); ?></code></td>
								<td><?php echo esc_html( $route['type'] ); ?></td>
								<td><?php echo esc_html( $route['builder'] ); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
				<?php if ( count( $routes ) > 50 ) : ?>
					<p class="description"><?php echo esc_html( sprintf( __( 'Showing 50 of %d routes.', 'wp-instatic-export' ), count( $routes ) ) ); ?></p>
				<?php endif; ?>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Handle form POST.
	 */
	public function handle_export() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'wp-instatic-export' ) );
		}
		check_admin_referer( self::ACTION, self::NONCE );

		$include_posts = ! empty( $_POST['include_posts'] );

		try {
			$job = new Export_Job(
				array(
					'include_posts' => $include_posts,
				)
			);
			$job->run();
		} catch ( \Throwable $e ) {
			set_transient( 'wpie_export_error_' . get_current_user_id(), $e->getMessage(), 60 );
			wp_safe_redirect( admin_url( 'tools.php?page=' . self::SLUG . '&export_error=1' ) );
			exit;
		}

		wp_safe_redirect( admin_url( 'tools.php?page=' . self::SLUG . '&exported=1' ) );
		exit;
	}
}

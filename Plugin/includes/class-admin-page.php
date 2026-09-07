<?php
/**
 * Admin UI under Tools -> Grape Export.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renders the export screen and handles the export form submission.
 */
class Admin_Page {

	const SLUG   = 'wp-grape-export';
	const ACTION = 'wpge_run_export';
	const NONCE  = 'wpge_export_nonce';

	/**
	 * Register admin hooks.
	 */
	public function register() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle_export' ) );
	}

	/**
	 * Add the Tools submenu entry.
	 */
	public function add_menu() {
		add_management_page(
			__( 'Grape Export', 'wp-grape-export' ),
			__( 'Grape Export', 'wp-grape-export' ),
			'manage_options',
			self::SLUG,
			array( $this, 'render' )
		);
	}

	/**
	 * Render the admin screen.
	 */
	public function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$last = get_option( 'wpge_last_export' );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'WP Grape Export', 'wp-grape-export' ); ?></h1>
			<p><?php esc_html_e( 'Export a structured snapshot of this site (routes, layout, menus, rendered pages, templates, assets, media) for conversion into a React + GrapeJS project.', 'wp-grape-export' ); ?></p>

			<?php if ( isset( $_GET['exported'] ) && $last ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<div class="notice notice-success">
					<p>
						<?php esc_html_e( 'Export complete.', 'wp-grape-export' ); ?>
						<a href="<?php echo esc_url( $last['url'] ); ?>"><?php esc_html_e( 'Download ZIP', 'wp-grape-export' ); ?></a>
					</p>
					<p><code><?php echo esc_html( wp_json_encode( $last['stats'] ) ); ?></code></p>
				</div>
			<?php endif; ?>

			<?php if ( isset( $_GET['export_error'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<?php
				$err = get_transient( 'wpge_export_error_' . get_current_user_id() );
				delete_transient( 'wpge_export_error_' . get_current_user_id() );
				?>
				<div class="notice notice-error">
					<p>
						<strong><?php esc_html_e( 'Export failed.', 'wp-grape-export' ); ?></strong>
						<?php echo esc_html( $err ? $err : __( 'Unknown error.', 'wp-grape-export' ) ); ?>
					</p>
				</div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION ); ?>" />
				<?php wp_nonce_field( self::ACTION, self::NONCE ); ?>

				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Post types', 'wp-grape-export' ); ?></th>
						<td>
							<?php
							$public_types = get_post_types( array( 'public' => true ), 'objects' );
							$excluded     = \WpGrapeExport\Site_Scanner::EXCLUDED_ROUTE_POST_TYPES;
							foreach ( $public_types as $type ) {
								if ( in_array( $type->name, $excluded, true ) ) {
									continue;
								}
								$checked = in_array( $type->name, array( 'page', 'post' ), true );
								?>
								<label style="display:inline-block;margin-right:12px;">
									<input type="checkbox" name="post_types[]" value="<?php echo esc_attr( $type->name ); ?>" <?php checked( $checked ); ?> />
									<?php echo esc_html( $type->labels->name ); ?>
								</label>
								<?php
							}
							?>
							<p class="description">
								<?php esc_html_e( 'Only real site pages/posts become routes. Elementor / ElementsKit headers, footers, kits and sections are exported under templates/layout (not as duplicate Home routes).', 'wp-grape-export' ); ?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Include media files', 'wp-grape-export' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="copy_media" value="1" checked="checked" />
								<?php esc_html_e( 'Copy uploaded images/media into the ZIP. CSS and JavaScript from the asset manifest are always bundled.', 'wp-grape-export' ); ?>
							</label>
						</td>
					</tr>
				</table>

				<?php submit_button( __( 'Run export', 'wp-grape-export' ) ); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * Handle the export form submission.
	 */
	public function handle_export() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'wp-grape-export' ) );
		}
		check_admin_referer( self::ACTION, self::NONCE );

		$post_types = isset( $_POST['post_types'] ) ? array_map( 'sanitize_key', (array) wp_unslash( $_POST['post_types'] ) ) : array( 'page', 'post' );
		$post_types = Site_Scanner::sanitize_route_post_types( $post_types );
		$copy_media = ! empty( $_POST['copy_media'] );

		try {
			$result = Plugin::instance()->run_export(
				array(
					'post_types' => $post_types,
					'copy_media' => $copy_media,
				)
			);
		} catch ( \Throwable $e ) {
			set_transient( 'wpge_export_error_' . get_current_user_id(), $e->getMessage(), 60 );
			wp_safe_redirect( admin_url( 'tools.php?page=' . self::SLUG . '&export_error=1' ) );
			exit;
		}

		update_option(
			'wpge_last_export',
			array(
				'url'   => $result['url'],
				'zip'   => $result['zip'],
				'stats' => $result['stats'],
				'at'    => time(),
			),
			false
		);

		// menu_page_url() is unavailable on admin-post.php (admin menu not loaded).
		wp_safe_redirect( admin_url( 'tools.php?page=' . self::SLUG . '&exported=1' ) );
		exit;
	}
}

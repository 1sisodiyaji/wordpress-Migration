<?php
/**
 * Fetch fully rendered front-end HTML for a public URL.
 *
 * @package WpInstaticExport
 */

namespace WpInstaticExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Page HTML fetcher.
 */
class Page_Fetcher {

	/**
	 * Fetch a URL as an anonymous visitor.
	 *
	 * @param string $url Absolute URL.
	 * @return string HTML body.
	 * @throws \RuntimeException On failure.
	 */
	public function fetch( $url ) {
		$args = array(
			'timeout'     => 90,
			'redirection' => 5,
			'sslverify'   => apply_filters( 'wpie_sslverify', false ),
			'headers'     => array(
				'Accept'     => 'text/html,application/xhtml+xml',
				'User-Agent' => 'WP-Instatic-Export/' . WPIE_VERSION,
			),
			'cookies'     => array(),
		);

		/**
		 * Filter remote GET args used when rendering pages for export.
		 *
		 * @param array  $args Request args.
		 * @param string $url  Target URL.
		 */
		$args = apply_filters( 'wpie_fetch_args', $args, $url );

		$response = wp_remote_get( $url, $args );
		if ( is_wp_error( $response ) ) {
			throw new \RuntimeException( 'Fetch failed for ' . $url . ': ' . $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 400 ) {
			throw new \RuntimeException( 'HTTP ' . $code . ' fetching ' . $url );
		}

		$body = (string) wp_remote_retrieve_body( $response );
		if ( '' === trim( $body ) ) {
			throw new \RuntimeException( 'Empty HTML for ' . $url );
		}

		return $body;
	}
}

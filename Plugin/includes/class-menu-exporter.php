<?php
/**
 * Exports navigation menus with hierarchy and theme locations.
 *
 * @package WpGrapeExport
 */

namespace WpGrapeExport;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads registered nav menus and their items into a portable structure.
 */
class Menu_Exporter {

	/**
	 * Export all non-empty nav menus.
	 *
	 * @return array[]
	 */
	public function export() {
		$out       = array();
		$locations = get_nav_menu_locations();
		$menus     = wp_get_nav_menus();

		// menu term_id => location slug.
		$menu_to_location = array();
		foreach ( $locations as $location => $menu_id ) {
			$menu_to_location[ (int) $menu_id ] = $location;
		}

		foreach ( $menus as $menu ) {
			$items = wp_get_nav_menu_items( $menu->term_id );
			if ( empty( $items ) ) {
				continue;
			}

			$exported_items = array();
			foreach ( $items as $item ) {
				$exported_items[] = array(
					'id'         => (int) $item->ID,
					'title'      => $item->title,
					'url'        => $this->relativize( $item->url ),
					'parentId'   => (int) $item->menu_item_parent,
					'order'      => (int) $item->menu_order,
					'target'     => $item->target,
					'classes'    => array_values( array_filter( (array) $item->classes ) ),
					'objectType' => $item->object,
					'objectId'   => $item->object_id ? (int) $item->object_id : null,
				);
			}

			$out[] = array(
				'id'       => (int) $menu->term_id,
				'slug'     => $menu->slug,
				'name'     => $menu->name,
				'location' => isset( $menu_to_location[ $menu->term_id ] ) ? $menu_to_location[ $menu->term_id ] : null,
				'items'    => $exported_items,
			);
		}

		return $out;
	}

	/**
	 * Convert an absolute internal URL to a site-relative path.
	 *
	 * @param string $url Menu item URL.
	 * @return string
	 */
	private function relativize( $url ) {
		$home = home_url();
		if ( 0 === strpos( $url, $home ) ) {
			$path = substr( $url, strlen( $home ) );
			return '' === $path ? '/' : $path;
		}
		return $url;
	}
}

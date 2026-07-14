<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'orbit_central_bank' );

/** Database username */
define( 'DB_USER', 'root' );

/** Database password */
define( 'DB_PASSWORD', '' );

/** Database hostname */
define( 'DB_HOST', 'orbit_db' );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8mb4' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         '+QH=9e.|AFyzH.iDq n2.{2=Z?G#W17PWtoti}a^@g^_;JpG`!#ChAzMa)Q/Q>;X' );
define( 'SECURE_AUTH_KEY',  'vE uvl(RR`cTH{P]zL`F^Z/&2KSXJf?`.#/;^XoAXPj+n~/Af}9n)fcMvOdMA`9F' );
define( 'LOGGED_IN_KEY',    'cicxt:csc$kIoz2W1@@C }]b>%`=M]IB}n6kGSL/!o>M#AiP{;slA.VVx:%EC)x}' );
define( 'NONCE_KEY',        '*%^dm:i[ge&hzslvEiXh(xdT354.yiH[h9k:62/})O7E+MS-HL/ho1--/&ko)~sB' );
define( 'AUTH_SALT',        '~#YhT?B.C,=WjJSq1>>d)YdEH!36%b_qvVE `Gx-e3O :G~<^k?r#[ Oa$e-%&j?' );
define( 'SECURE_AUTH_SALT', 'ZV`Fn.T*25n6p~YaGY44#{*,iI+;!s<NvIiKEqCBP Qq~^gT)U-o8{s@pcDJW4e+' );
define( 'LOGGED_IN_SALT',   'IL^><=,4#a%eIe:v]y~TO(?c{>f dUtC_B<vN7u_2^quc1?@LE|%xZR.s1^6{/1a' );
define( 'NONCE_SALT',       'FCLT{v8U[6nzN;d*UPh~i9&H1GrT:^^c&=%G=io}:9y}gd.auGlxz(PS-y}^kh20' );

/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 *
 * At the installation time, database tables are created with the specified prefix.
 * Changing this value after WordPress is installed will make your site think
 * it has not been installed.
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/#table-prefix
 */
$table_prefix = 'wp_';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://developer.wordpress.org/advanced-administration/debug/debug-wordpress/
 */
define( 'WP_DEBUG', false );

/* Add any custom values between this line and the "stop editing" line. */

define( 'WP_HOME', 'http://localhost:8083' );
define( 'WP_SITEURL', 'http://localhost:8083' );

/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';

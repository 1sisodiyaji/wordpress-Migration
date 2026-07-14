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
define( 'DB_NAME', 'smartco' );

/** Database username */
define( 'DB_USER', 'root' );

/** Database password */
define( 'DB_PASSWORD', '' );

/** Database hostname */
define( 'DB_HOST', 'db' );

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
define( 'AUTH_KEY',         '[b[Q.&;^uaG=t<Z;+pV9t]LY.p#5qnpK$&U`JG<Aqfoa!JGl$n n.fiui82c(lc`' );
define( 'SECURE_AUTH_KEY',  'Xqn0g#bL,r1uC{2R9`2au/%*/!|<9=$$pSUyDeAuKg6Y[FU$eRGw_N&ulB1?Rx@=' );
define( 'LOGGED_IN_KEY',    '*-E$dK7lG!6)KDWPy~fJ:%WuE,TZZ*SYO,!2[H{e)+_<,`tC6lqx/>T=}gCdJjCz' );
define( 'NONCE_KEY',        'P=RD*]]%06[7@h^Y[O%r)q(@l~,[/8rkR^N]cnUi*WKnf+BHXFmzZn$@,`VBQ7Zr' );
define( 'AUTH_SALT',        'A?i;=Ye+6P*ws4[qIm(v{sSE<:KPGB0Npgl%JAm:Rvti!|6w1Kh>a9/mu1Vu36!y' );
define( 'SECURE_AUTH_SALT', 'gXS0uAR+CkWu3kZ6zhtp5$.Mfbrwf(qrlx7g9z/v? %|+.W~?5o_1&0rbZ~IJse1' );
define( 'LOGGED_IN_SALT',   'sCDqzq3 c0y5fo7V^`N=leF=XQVt;86n[AJwls]cEO$Y<GU[%m7^,[x`4xG~` bc' );
define( 'NONCE_SALT',       '|9hbWolM5*in%K[[1NRUfgr+9;sx~^eSbwm?oXyf+)Ky!}nM7LQ5j*u-5^odb1Q}' );

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

/**
 * The exported site was served from http://localhost/smartco; the Docker
 * setup serves it from the container root, so the URLs are overridden here
 * instead of touching the imported database rows.
 */
define( 'WP_HOME', 'http://localhost:8082' );
define( 'WP_SITEURL', 'http://localhost:8082' );

/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';

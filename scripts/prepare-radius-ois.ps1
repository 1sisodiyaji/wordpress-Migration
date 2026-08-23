# Prepare try-data/radius-ois/www for the Docker WordPress container.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$data = Join-Path "try-data" "radius-ois"
$www = Join-Path $data "www"
New-Item -ItemType Directory -Force -Path $www | Out-Null

if (-not (Test-Path (Join-Path $www "index.php"))) {
  Write-Host "Downloading WordPress core..."
  $tmp = Join-Path $env:TEMP ("wp-core-" + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $tar = Join-Path $tmp "wordpress.tar.gz"
  Invoke-WebRequest -Uri "https://wordpress.org/latest.tar.gz" -OutFile $tar
  tar -xzf $tar -C $tmp
  Copy-Item -Path (Join-Path $tmp "wordpress\*") -Destination $www -Recurse -Force
  Remove-Item -Recurse -Force $tmp
  Write-Host "WordPress core -> $www"
} else {
  Write-Host "WordPress core already present"
}

if (-not (Test-Path (Join-Path $www "wp-content\plugins\elementor"))) {
  Write-Host "Extracting wp-content.zip (large - may take several minutes)..."
  tar -xf (Join-Path $data "wp-content.zip") -C $www
  Write-Host "wp-content extracted"
} else {
  Write-Host "wp-content already present"
}

$htaccessSrc = Join-Path $data "htaccess"
$htaccessDst = Join-Path $www ".htaccess"
if ((Test-Path $htaccessSrc) -and -not (Test-Path $htaccessDst)) {
  Copy-Item $htaccessSrc $htaccessDst
  Write-Host ".htaccess copied"
}

$wpConfigPath = Join-Path $www "wp-config.php"
$wpConfigBody = @'
<?php
define('WP_CACHE', true);
define( 'DB_NAME', 'radius_ois' );
define( 'DB_USER', 'root' );
define( 'DB_PASSWORD', '' );
define( 'DB_HOST', 'radius_db' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );
define( 'AUTH_KEY',         ' _n>5?|@o7i;JMO1~{M3JBkSB*/M44[PZ:!9-<n5%k]kqP3m7_O0AP{ZC58s`6_^' );
define( 'SECURE_AUTH_KEY',  's3BngrSa`onz>0#$4w.#UaYsR#6^3UcXp3~m}zjKv<{jGa4R.6B9%/9c(&Tag@,L' );
define( 'LOGGED_IN_KEY',    'P&ksuYTh 7TVt qTAPU%}b4NDoCsLBq$Sf}&!wF:J4HF!~YYyB|.wL[h dI?EQ|R' );
define( 'NONCE_KEY',        'FgilfLTs`IlR0SWSs]GIJ`6@rRu&lz ns(!I8_Rkb>#&#A84~1*yn=:jbmt?cCMB' );
define( 'AUTH_SALT',        '+T9>qQ=WeV)G6FHZ9Zq?P3H|,im=Rev)ga69TQht&3<1^q6xZX DFG`3o$/.`*fr' );
define( 'SECURE_AUTH_SALT', 'P=p:<hbmHb+}_sOFrR=p(eJ[qk$7C)@k5l*+,kc NWm}<t a 0oq=%Os1<:h!ui^' );
define( 'LOGGED_IN_SALT',   'EW`<qMjW_{M8!0)3Y#b6=E4_vi7B}7|Xu.jlawI[!,|^nhw=IO}{ziq#-z;y;E[l' );
define( 'NONCE_SALT',       '%[n7{n%eH+*~Fz*ZklwwQ~fB,GToOZShGN*MRJ:|]wQ9DBDB1-?f5?DGsb8>@)@-' );
$table_prefix = 'wp_';
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );
define( 'WP_MEMORY_LIMIT', '512M' );
define( 'WP_MAX_MEMORY_LIMIT', '512M' );
define( 'DISABLE_WP_CRON', true );
define( 'FS_METHOD', 'direct' );
define( 'WP_HOME', 'http://localhost:8084' );
define( 'WP_SITEURL', 'http://localhost:8084' );
@ini_set( 'max_input_vars', 80000 );
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
'@
[System.IO.File]::WriteAllText($wpConfigPath, $wpConfigBody, (New-Object System.Text.UTF8Encoding $false))

Write-Host "wp-config.php (Docker)"
Write-Host ""
Write-Host "Ready: $www"

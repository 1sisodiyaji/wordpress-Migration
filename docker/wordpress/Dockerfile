FROM php:8.0-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
        libfreetype6-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libwebp-dev \
        libzip-dev \
        libicu-dev \
        unzip \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" \
        gd \
        mysqli \
        zip \
        exif \
        intl \
        bcmath \
        opcache \
    && a2enmod rewrite

# Match www-data to the host user that owns the bind-mounted WordPress files,
# so Apache/PHP can write uploads, Elementor CSS cache, etc.
ARG WWW_UID=1000
ARG WWW_GID=1000
RUN usermod -u ${WWW_UID} www-data && groupmod -g ${WWW_GID} www-data \
    && chown -R www-data:www-data /var/www

COPY uploads.ini /usr/local/etc/php/conf.d/uploads.ini

<?php
/**
 * Plugin Name: WP Theme Kit HTTP stub
 * Description: Replays recorded HTTP fixtures for harness runs.
 * Version: 1
 * WP-Theme-Kit-Helper: http
 */

if (!defined('ABSPATH')) {
    return;
}

if (!function_exists('wp_theme_kit_harness_enabled')) {
    function wp_theme_kit_harness_enabled() {
        $enabled = true;
        if (function_exists('wp_get_environment_type') && 'production' === wp_get_environment_type()) {
            $enabled = false;
        }
        return (bool) apply_filters('wp_theme_kit_harness_enabled', $enabled);
    }
}

if (!function_exists('wp_theme_kit_harness_config')) {
    function wp_theme_kit_harness_config() {
        $defaults = array(
            'enabled' => array('mail' => true, 'http' => true),
            'mailDir' => 'mail',
            'httpDir' => 'http',
            'http' => array('strict' => false, 'hosts' => array()),
        );
        $file = WP_CONTENT_DIR . '/wp-theme-kit-harness/wp-theme-kit-harness.json';
        if (!is_readable($file)) {
            return $defaults;
        }
        $parsed = json_decode(file_get_contents($file), true);
        if (!is_array($parsed)) {
            return $defaults;
        }
        $config = $defaults;
        foreach (array('enabled', 'http') as $key) {
            if (isset($parsed[$key]) && is_array($parsed[$key])) {
                $config[$key] = array_merge($config[$key], $parsed[$key]);
            }
        }
        foreach (array('mailDir', 'httpDir') as $key) {
            if (isset($parsed[$key]) && is_string($parsed[$key])) {
                $config[$key] = $parsed[$key];
            }
        }
        return $config;
    }
}

if (!function_exists('wp_theme_kit_harness_dir')) {
    function wp_theme_kit_harness_dir($config, $key) {
        $base = WP_CONTENT_DIR . '/wp-theme-kit-harness';
        $relative = isset($config[$key]) ? (string) $config[$key] : '';
        $relative = str_replace('\\', '/', $relative);
        if ('' !== $relative && ('/' === substr($relative, 0, 1) || false !== strpos($relative, '..'))) {
            return false;
        }
        return '' === $relative ? $base : $base . '/' . ltrim($relative, '/');
    }
}

if (!function_exists('wp_theme_kit_http_host_allowed')) {
    function wp_theme_kit_http_host_allowed($hosts, $host) {
        if (!is_array($hosts) || !$hosts) {
            return true;
        }
        foreach ($hosts as $allowed) {
            if (strtolower((string) $allowed) === strtolower((string) $host)) {
                return true;
            }
        }
        return false;
    }
}

if (!function_exists('wp_theme_kit_http_fixtures')) {
    function wp_theme_kit_http_fixtures($dir) {
        $fixtures = array();
        if (!is_dir($dir)) {
            return $fixtures;
        }
        $files = glob(rtrim($dir, '/\\') . '/*.json');
        if (!is_array($files)) {
            return $fixtures;
        }
        sort($files);
        foreach ($files as $file) {
            $raw = json_decode((string) file_get_contents($file), true);
            if (!is_array($raw) || !isset($raw['match']) || !is_array($raw['match'])) {
                continue;
            }
            $method = isset($raw['match']['method']) ? $raw['match']['method'] : 'GET';
            $pattern = isset($raw['match']['url']) ? $raw['match']['url'] : '';
            if (!is_string($method) || !preg_match('/^(?:[A-Z]+|\*)$/', $method)) {
                continue;
            }
            if (!is_string($pattern) || false === @preg_match('#' . str_replace('#', '\\#', $pattern) . '#', '')) {
                continue;
            }
            $status = isset($raw['status']) ? $raw['status'] : 200;
            if (!is_int($status) || $status < 100 || $status > 599) {
                continue;
            }
            $delay = isset($raw['delayMs']) ? $raw['delayMs'] : 0;
            if (!is_int($delay) || $delay < 0) {
                continue;
            }
            $forms = 0;
            foreach (array('body', 'json', 'bodyFile', 'base64') as $key) {
                if (isset($raw[$key])) {
                    $forms++;
                }
            }
            if (1 !== $forms) {
                continue;
            }
            if (isset($raw['bodyFile'])) {
                $relative = is_string($raw['bodyFile']) ? str_replace('\\', '/', $raw['bodyFile']) : '';
                $path = rtrim($dir, '/\\') . '/' . $relative;
                if ('' === $relative || false !== strpos($relative, '..') || '/' === substr($relative, 0, 1)
                    || !is_file($path) || !is_readable($path) || filesize($path) > 5 * 1024 * 1024) {
                    continue;
                }
            } elseif (isset($raw['body'])) {
                if (!is_string($raw['body']) || strlen($raw['body']) > 5 * 1024 * 1024) {
                    continue;
                }
            } elseif (isset($raw['json'])) {
                if (strlen((string) json_encode($raw['json'])) > 5 * 1024 * 1024) {
                    continue;
                }
            } elseif (isset($raw['base64'])) {
                $decoded = is_string($raw['base64']) ? base64_decode($raw['base64'], true) : false;
                if (false === $decoded || strlen($decoded) > 5 * 1024 * 1024) {
                    continue;
                }
            }
            $headers = isset($raw['headers']) && is_array($raw['headers']) ? $raw['headers'] : array();
            $fixtures[] = array(
                'method' => $method,
                'pattern' => $pattern,
                'regex' => '#' . str_replace('#', '\\#', $pattern) . '#',
                'status' => $status,
                'delayMs' => $delay,
                'headers' => $headers,
                'raw' => $raw,
                'file' => $file,
            );
        }
        return $fixtures;
    }
}

if (!function_exists('wp_theme_kit_http_body')) {
    function wp_theme_kit_http_body($fixture, $dir) {
        $raw = $fixture['raw'];
        if (isset($raw['json'])) {
            return wp_json_encode($raw['json']);
        }
        if (isset($raw['bodyFile']) && is_string($raw['bodyFile']) && '' !== $raw['bodyFile']) {
            $relative = str_replace('\\', '/', $raw['bodyFile']);
            if (false !== strpos($relative, '..') || '/' === substr($relative, 0, 1)) {
                return '';
            }
            $path = rtrim($dir, '/\\') . '/' . $relative;
            return is_readable($path) ? (string) file_get_contents($path) : '';
        }
        if (isset($raw['base64']) && is_string($raw['base64'])) {
            return (string) base64_decode($raw['base64'], true);
        }
        return isset($raw['body']) ? (string) $raw['body'] : '';
    }
}

if (!function_exists('wp_theme_kit_http_stub')) {
    function wp_theme_kit_http_stub($pre, $args, $url) {
        if (false !== $pre) {
            return $pre;
        }
        if (!wp_theme_kit_harness_enabled()) {
            return $pre;
        }
        $config = wp_theme_kit_harness_config();
        if (empty($config['enabled']['http'])) {
            return $pre;
        }
        $host = parse_url($url, PHP_URL_HOST);
        $hosts = isset($config['http']['hosts']) ? $config['http']['hosts'] : array();
        if (!wp_theme_kit_http_host_allowed($hosts, $host)) {
            return $pre;
        }

        $args = is_array($args) ? $args : array();
        $method = isset($args['method']) ? strtoupper((string) $args['method']) : 'GET';
        $dir = wp_theme_kit_harness_dir($config, 'httpDir');
        if (false === $dir) {
            return $pre;
        }
        foreach (wp_theme_kit_http_fixtures($dir) as $fixture) {
            if ('*' !== $fixture['method'] && $fixture['method'] !== $method) {
                continue;
            }
            if (1 !== preg_match($fixture['regex'], (string) $url)) {
                continue;
            }
            if ($fixture['delayMs'] > 0) {
                usleep(min($fixture['delayMs'], 10000) * 1000);
            }
            $headers = array();
            foreach ($fixture['headers'] as $name => $value) {
                $headers[(string) $name] = (string) $value;
            }
            return array(
                'headers' => $headers,
                'body' => wp_theme_kit_http_body($fixture, $dir),
                'response' => array('code' => $fixture['status'], 'message' => 'WP Theme Kit fixture'),
                'cookies' => array(),
                'filename' => null,
            );
        }

        if (!empty($config['http']['strict'])) {
            return new WP_Error(
                'wptk_no_fixture',
                sprintf('No WP Theme Kit HTTP fixture matched %s %s.', $method, $url)
            );
        }
        return $pre;
    }
}

if (function_exists('add_filter')) {
    add_filter('pre_http_request', 'wp_theme_kit_http_stub', 10, 3);
}

<?php
/**
 * Plugin Name: WP Theme Kit mail capture
 * Description: Captures wp_mail() messages into the WP Theme Kit harness directory.
 * Version: 1
 * WP-Theme-Kit-Helper: mail
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

function wp_theme_kit_mail_header($value) {
    return str_replace(array("\r", "\n"), ' ', (string) $value);
}

function wp_theme_kit_mail_addresses($value) {
    $list = is_array($value) ? $value : preg_split('/\s*,\s*/', (string) $value);
    $addresses = array();
    foreach ((array) $list as $item) {
        $item = trim((string) $item);
        if ('' !== $item) {
            $addresses[] = $item;
        }
    }
    return $addresses;
}

function wp_theme_kit_mail_part_header($name, $value) {
    return $name . ': ' . wp_theme_kit_mail_header($value) . "\r\n";
}

function wp_theme_kit_mail_capture($pre, $atts) {
    if (null !== $pre) {
        return $pre;
    }
    if (!wp_theme_kit_harness_enabled()) {
        return $pre;
    }
    $config = wp_theme_kit_harness_config();
    if (empty($config['enabled']['mail'])) {
        return $pre;
    }
    $dir = wp_theme_kit_harness_dir($config, 'mailDir');
    if (false === $dir || !wp_mkdir_p($dir)) {
        return $pre;
    }

    $atts = is_array($atts) ? $atts : array();
    $to = wp_theme_kit_mail_addresses(isset($atts['to']) ? $atts['to'] : '');
    $subject = isset($atts['subject']) ? wp_theme_kit_mail_header($atts['subject']) : '';
    $message = isset($atts['message']) ? (string) $atts['message'] : '';

    $cc = array();
    $bcc = array();
    $headers = isset($atts['headers']) ? $atts['headers'] : array();
    foreach ((array) $headers as $header) {
        if (preg_match('/^\s*cc:\s*(.+)$/i', (string) $header, $match)) {
            $cc = array_merge($cc, wp_theme_kit_mail_addresses($match[1]));
        } elseif (preg_match('/^\s*bcc:\s*(.+)$/i', (string) $header, $match)) {
            $bcc = array_merge($bcc, wp_theme_kit_mail_addresses($match[1]));
        }
    }

    $saved = array();
    $attachments = array();
    $paths = isset($atts['attachments']) ? (array) $atts['attachments'] : array();
    foreach ($paths as $path) {
        $path = (string) $path;
        if ('' === $path || !is_readable($path)) {
            continue;
        }
        $name = sanitize_file_name(basename($path));
        $stored = substr(sha1($path . count($saved)), 0, 8) . '-' . $name;
        if (!@copy($path, $dir . '/' . $stored)) {
            continue;
        }
        $saved[] = $stored;
        $attachments[] = array('path' => $path, 'stored' => $stored, 'name' => $name);
    }

    $html = false;
    foreach ((array) $headers as $header) {
        if (preg_match('/^\s*content-type:\s*text\/html/i', (string) $header)) {
            $html = true;
            break;
        }
    }
    $contentType = $html ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8';

    $mime = 'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000' . "\r\n"
        . 'From: WordPress <wordpress@localhost>' . "\r\n"
        . wp_theme_kit_mail_part_header('To', implode(', ', $to));
    if ($cc) {
        $mime .= wp_theme_kit_mail_part_header('Cc', implode(', ', $cc));
    }
    $mime .= wp_theme_kit_mail_part_header('Subject', $subject)
        . 'MIME-Version: 1.0' . "\r\n"
        . 'Content-Type: ' . $contentType . "\r\n"
        . "\r\n"
        . $message;

    $suffix = substr(sha1(implode(',', $to)), 0, 8);
    $eml = gmdate('Ymd-His') . '-' . $suffix . '.eml';
    $attempt = 0;
    while (file_exists($dir . '/' . $eml)) {
        $attempt++;
        $eml = gmdate('Ymd-His') . '-' . substr(sha1(implode(',', $to) . $attempt), 0, 8) . '.eml';
    }
    if (false === file_put_contents($dir . '/' . $eml, $mime)) {
        return $pre;
    }

    $entry = array(
        'time' => gmdate('c'),
        'to' => $to,
        'cc' => $cc,
        'bcc' => $bcc,
        'subject' => $subject,
        'eml' => $eml,
        'attachments' => $saved,
    );
    file_put_contents($dir . '/index.jsonl', wp_json_encode($entry) . "\n", FILE_APPEND | LOCK_EX);

    return true;
}

if (function_exists('add_filter')) {
    add_filter('pre_wp_mail', 'wp_theme_kit_mail_capture', 10, 2);
}

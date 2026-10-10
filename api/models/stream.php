<?php
// KickCraft 3D Model Streamer Endpoint
// Safely streams 3D models without edge proxy challenge

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$rawPath = sanitizeString($_GET['path'] ?? $_GET['file'] ?? '');
if (empty($rawPath)) {
    jsonError('Path is required', 400);
}

// Normalize path and prevent directory traversal
$clean = ltrim(str_replace('\\', '/', $rawPath), '/');
$clean = preg_replace('/(\.\.[\/\\\\])+/', '', $clean);

if (!preg_match('/^(models|images)\/.*\.(glb|gltf|bin|png|jpg|jpeg|webp)$/i', $clean)) {
    jsonError('Invalid file type or path', 403);
}

// Support both development (with public/models, public/images) and production (with models, images directly in docRoot)
$docRoot = dirname(__DIR__, 2);
$allowedBases = array_filter([
    realpath($docRoot . '/public/models'),
    realpath($docRoot . '/models'),
    realpath($docRoot . '/public/images'),
    realpath($docRoot . '/images'),
]);

$publicFile = realpath($docRoot . '/public/' . $clean);
$rootFile = realpath($docRoot . '/' . $clean);

$fullPath = false;
foreach ([$publicFile, $rootFile] as $candidate) {
    if ($candidate && is_file($candidate)) {
        foreach ($allowedBases as $base) {
            if ($base && str_starts_with($candidate, $base)) {
                $fullPath = $candidate;
                break 2;
            }
        }
    }
}

if (!$fullPath) {
    jsonError('Asset file not found', 404);
}

$extension = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
$contentTypes = [
    'glb' => 'model/gltf-binary',
    'gltf' => 'model/gltf+json',
    'bin' => 'application/octet-stream',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp'
];

$contentType = $contentTypes[$extension] ?? 'application/octet-stream';

// Set CORS and streaming headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: ' . $contentType);
header('Content-Length: ' . filesize($fullPath));
header('Cache-Control: public, max-age=604800, immutable');
header('X-Content-Type-Options: nosniff');

readfile($fullPath);
exit;

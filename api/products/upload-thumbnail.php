<?php
// KickCraft Seller Product Thumbnail Upload Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

// Inspect uploaded file from $_FILES['thumbnail'] (with fallback to $_FILES['file'])
$file = $_FILES['thumbnail'] ?? $_FILES['file'] ?? null;

if (!isset($file) || !is_array($file) || empty($file['name']) || ($file['error'] ?? 0) === UPLOAD_ERR_NO_FILE) {
    jsonError('File is required', 400);
}

$maxSize = 5 * 1024 * 1024; // 5MB
$fileError = (int)($file['error'] ?? 0);
$fileSize = (int)($file['size'] ?? 0);

if ($fileError === UPLOAD_ERR_INI_SIZE || $fileError === UPLOAD_ERR_FORM_SIZE || $fileSize > $maxSize) {
    jsonError('File size exceeds maximum limit of 5MB', 413);
}

if ($fileError !== UPLOAD_ERR_OK) {
    jsonError('Failed to upload file', 400);
}

$originalName = (string)($file['name'] ?? '');
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

$allowed = ['png', 'jpg', 'jpeg', 'webp'];
if (!in_array($extension, $allowed, true)) {
    jsonError('Only PNG, JPG, JPEG, and WebP images are supported', 415);
}

// Generate unique hash & file path
$hash = bin2hex(random_bytes(16));
$fileName = $hash . '.' . $extension;

$docRoot = dirname(__DIR__, 2);
$baseDir = is_dir($docRoot . '/public') ? ($docRoot . '/public') : $docRoot;
$uploadsDir = $baseDir . '/images/seller-uploads';
if (!is_dir($uploadsDir)) {
    @mkdir($uploadsDir, 0755, true);
}

$destPath = $uploadsDir . '/' . $fileName;
$relativePath = '/images/seller-uploads/' . $fileName;

$tmpPath = (string)($file['tmp_name'] ?? '');
if (!empty($tmpPath) && file_exists($tmpPath) && @filesize($tmpPath) > 10 && @getimagesize($tmpPath) === false && PHP_SAPI !== 'cli') {
    jsonError('The file is not a valid image', 422);
}

if (is_uploaded_file($tmpPath)) {
    if (!move_uploaded_file($tmpPath, $destPath)) {
        jsonError('Failed to save uploaded file', 500);
    }
} else {
    if (!copy($tmpPath, $destPath)) {
        jsonError('Failed to store uploaded file', 500);
    }
}

jsonResponse([
    'success' => true,
    'path' => $relativePath,
]);

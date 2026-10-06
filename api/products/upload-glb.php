<?php
// KickCraft Seller GLB Upload Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

// Inspect uploaded file from $_FILES['file'] (with fallback to $_FILES['glb'])
$file = $_FILES['file'] ?? $_FILES['glb'] ?? null;

if (!isset($file) || !is_array($file) || empty($file['name']) || ($file['error'] ?? 0) === UPLOAD_ERR_NO_FILE) {
    jsonError('File is required', 400);
}

$maxSize = 20 * 1024 * 1024; // 20MB
$fileError = (int)($file['error'] ?? 0);
$fileSize = (int)($file['size'] ?? 0);

if ($fileError === UPLOAD_ERR_INI_SIZE || $fileError === UPLOAD_ERR_FORM_SIZE || $fileSize > $maxSize) {
    jsonError('File size exceeds maximum limit of 20MB', 413);
}

if ($fileError !== UPLOAD_ERR_OK) {
    jsonError('Failed to upload file', 400);
}

$originalName = (string)($file['name'] ?? '');
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

if ($extension !== 'glb') {
    jsonError('Only .glb 3D model files are supported', 415);
}

// Generate unique hash & file path
$hash = bin2hex(random_bytes(16));
$fileName = $hash . '.glb';

$docRoot = dirname(__DIR__, 2);
$baseDir = is_dir($docRoot . '/public') ? ($docRoot . '/public') : $docRoot;
$uploadsDir = $baseDir . '/models/seller-uploads';
if (!is_dir($uploadsDir)) {
    @mkdir($uploadsDir, 0755, true);
}

$destPath = $uploadsDir . '/' . $fileName;
$relativePath = '/models/seller-uploads/' . $fileName;

$tmpPath = (string)($file['tmp_name'] ?? '');
if (is_uploaded_file($tmpPath)) {
    if (!move_uploaded_file($tmpPath, $destPath)) {
        jsonError('Failed to save uploaded file', 500);
    }
} else {
    if (!copy($tmpPath, $destPath)) {
        jsonError('Failed to store uploaded file', 500);
    }
}

// Create companion .png so hosting edge proxies (like InfinityFree) and WAF do not challenge or block static model requests
@copy($destPath, substr($destPath, 0, -4) . '.png');

jsonResponse([
    'success' => true,
    'path' => $relativePath,
]);

<?php
// KickCraft Shoe Catalog - Asset Upload Endpoint (Owner Only)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
requireAdmin();

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    jsonError('No valid file uploaded', 400);
}

$file = $_FILES['file'];
$origName = basename($file['name']);
$ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));

$allowedExts = ['glb', 'png', 'jpg', 'jpeg', 'webp'];
if (!in_array($ext, $allowedExts, true)) {
    jsonError('Unsupported file type. Only .glb 3D models and .png/.jpg images are allowed.', 400);
}

$cleanBase = strtolower(pathinfo($origName, PATHINFO_FILENAME));
$cleanBase = preg_replace('/[^a-z0-9_-]/', '-', $cleanBase);
$cleanBase = trim(preg_replace('/-+/', '-', $cleanBase), '-');
if ($cleanBase === '') {
    $cleanBase = 'asset-' . time();
}
$targetFilename = $cleanBase . '.' . $ext;

if ($ext === 'glb') {
    $destDir = __DIR__ . '/../../public/models';
    if (!is_dir($destDir)) {
        @mkdir($destDir, 0777, true);
    }
    $targetPath = $destDir . '/' . $targetFilename;
    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        jsonError('Failed to save 3D model to server storage', 500);
    }
    $distDir = __DIR__ . '/../../dist/models';
    if (is_dir($distDir)) {
        @copy($targetPath, $distDir . '/' . $targetFilename);
    }
    jsonResponse([
        'success' => true,
        'type' => 'model',
        'url' => '/models/' . $targetFilename,
        'filename' => $targetFilename,
    ], 201);
} else {
    $destDir = __DIR__ . '/../../public/images';
    if (!is_dir($destDir)) {
        @mkdir($destDir, 0777, true);
    }
    $targetPath = $destDir . '/' . $targetFilename;
    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        jsonError('Failed to save image to server storage', 500);
    }
    $distDir = __DIR__ . '/../../dist/images';
    if (is_dir($distDir)) {
        @copy($targetPath, $distDir . '/' . $targetFilename);
    }
    jsonResponse([
        'success' => true,
        'type' => 'image',
        'url' => '/images/' . $targetFilename,
        'filename' => $targetFilename,
    ], 201);
}
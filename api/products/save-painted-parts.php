<?php
// KickCraft Save Painted Parts Endpoint (Seller)
// Saves seller-painted GLBs, backs up original models, and updates product draft attributes.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);
$sellerId = (int)($user['id'] ?? $_SESSION['user_id'] ?? 0);

$data = getJsonBody();
$productId = sanitizeString($data['productId'] ?? $data['product_id'] ?? $_POST['productId'] ?? $_POST['product_id'] ?? '');

if ($productId === '') {
    jsonError('Product ID is required', 400);
}

// Check product exists and belongs to this seller
$stmt = $db->prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
$stmt->execute([$productId]);
$existing = $stmt->fetch();

if (!$existing) {
    jsonError('Product not found', 404);
}

if ((int)$existing['seller_id'] !== $sellerId) {
    jsonError('Product not found or access denied', 403);
}

// Parse meshMap
$meshMapRaw = $data['meshMap'] ?? $data['mesh_map'] ?? $_POST['meshMap'] ?? $_POST['mesh_map'] ?? null;
$meshMap = null;
if (is_array($meshMapRaw)) {
    $meshMap = $meshMapRaw;
} elseif (is_string($meshMapRaw) && trim($meshMapRaw) !== '') {
    $decoded = json_decode($meshMapRaw, true);
    if (is_array($decoded)) {
        $meshMap = $decoded;
    }
}

// Validate that at least 2 distinct customizable parts exist in meshMap
$distinctParts = [];
if (is_array($meshMap)) {
    $isList = array_is_list($meshMap);
    if ($isList) {
        foreach ($meshMap as $item) {
            $name = trim((string)$item);
            if ($name !== '') {
                $distinctParts[$name] = true;
            }
        }
    } else {
        foreach ($meshMap as $partName => $mat) {
            $name = trim((string)$partName);
            if ($name !== '') {
                $distinctParts[$name] = true;
            }
        }
    }
}

if (count($distinctParts) < 2) {
    jsonError('At least 2 customizable parts must be defined', 422);
}

// Parse partColors
$partColorsRaw = $data['partColors'] ?? $data['part_colors'] ?? $_POST['partColors'] ?? $_POST['part_colors'] ?? null;
$partColors = [];
if (is_array($partColorsRaw)) {
    $partColors = $partColorsRaw;
} elseif (is_string($partColorsRaw) && trim($partColorsRaw) !== '') {
    $decodedColors = json_decode($partColorsRaw, true);
    if (is_array($decodedColors)) {
        $partColors = $decodedColors;
    }
}

// Extract GLB data or uploaded file
$file = $_FILES['glbFile'] ?? $_FILES['glb'] ?? $_FILES['file'] ?? null;
$glbData = $data['glbData'] ?? $data['glb_data'] ?? $_POST['glbData'] ?? $_POST['glb_data'] ?? null;

$hasFile = isset($file) && is_array($file) && !empty($file['name']) && ($file['error'] ?? 0) !== UPLOAD_ERR_NO_FILE;
$hasBase64 = !empty($glbData) && is_string($glbData);

if (!$hasFile && !$hasBase64) {
    jsonError('GLB model file or data is required', 400);
}

$maxSize = 25 * 1024 * 1024; // 25MB
$binaryContent = null;

if ($hasFile) {
    $fileError = (int)($file['error'] ?? 0);
    $fileSize = (int)($file['size'] ?? 0);

    if ($fileError === UPLOAD_ERR_INI_SIZE || $fileError === UPLOAD_ERR_FORM_SIZE || $fileSize > $maxSize) {
        jsonError('File size exceeds maximum limit of 25MB', 413);
    }
    if ($fileError !== UPLOAD_ERR_OK) {
        jsonError('Failed to upload GLB file', 400);
    }

    $originalName = (string)($file['name'] ?? '');
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if ($ext !== '' && $ext !== 'glb') {
        jsonError('Only .glb 3D model files are supported', 415);
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    $binaryContent = @file_get_contents($tmpPath);
} else {
    // Base64 decoded data
    $clean = preg_replace('/^data:[^;]+;base64,/', '', trim((string)$glbData));
    $binaryContent = base64_decode($clean, true);
}

if ($binaryContent === false || strlen($binaryContent) === 0) {
    jsonError('Invalid or empty GLB content', 400);
}

if (strlen($binaryContent) > $maxSize) {
    jsonError('File size exceeds maximum limit of 25MB', 413);
}

$docRoot = dirname(__DIR__, 2);
$baseDir = is_dir($docRoot . '/public') ? ($docRoot . '/public') : $docRoot;

// Backup original model if exists and no _original.glb backup exists yet
$existingGlb = (string)($existing['glb_path'] ?? '');
$originalGlbPath = null;
if ($existingGlb !== '') {
    $normalizedExistingRel = '/' . ltrim($existingGlb, '/');
    $existingDiskPath = $baseDir . $normalizedExistingRel;

    $backupDiskPath = preg_replace('/(_original)?\.glb$/i', '_original.glb', $existingDiskPath);
    $backupRelPath = preg_replace('/(_original)?\.glb$/i', '_original.glb', $normalizedExistingRel);

    if (file_exists($existingDiskPath)) {
        if (!file_exists($backupDiskPath)) {
            $backupDir = dirname($backupDiskPath);
            if (!is_dir($backupDir)) {
                @mkdir($backupDir, 0755, true);
            }
            @copy($existingDiskPath, $backupDiskPath);
            @copy($backupDiskPath, substr($backupDiskPath, 0, -4) . '.png');
        }
        $originalGlbPath = $backupRelPath;
    } else {
        $originalGlbPath = $backupRelPath;
    }
}

// Generate unique hash & store new GLB file
$hash = bin2hex(random_bytes(16));
$fileName = $hash . '_painted.glb';

$uploadsDir = $baseDir . '/models/seller-uploads';
if (!is_dir($uploadsDir)) {
    @mkdir($uploadsDir, 0755, true);
}

$destPath = $uploadsDir . '/' . $fileName;
$savedRelPath = '/models/seller-uploads/' . $fileName;

if (file_put_contents($destPath, $binaryContent) === false) {
    jsonError('Failed to save painted GLB file', 500);
}

// Create companion .png so hosting edge proxies (like InfinityFree / WAF) do not block static requests
@copy($destPath, substr($destPath, 0, -4) . '.png');

// Update products table while preserving draft status
$meshMapJson = json_encode($meshMap, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
$partColorsJson = json_encode($partColors, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$updateStmt = $db->prepare(
    "UPDATE products SET
        glb_path = ?,
        mesh_map = ?,
        part_colors = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND seller_id = ?"
);
$updateStmt->execute([
    $savedRelPath,
    $meshMapJson,
    $partColorsJson,
    $productId,
    $sellerId,
]);

jsonResponse([
    'success' => true,
    'glbPath' => $savedRelPath,
    'meshMap' => $meshMap,
    'partColors' => $partColors,
    'originalGlbPath' => $originalGlbPath,
]);

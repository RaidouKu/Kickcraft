<?php
// KickCraft AI 2D to 3D Generation Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/trellis-client.php';

requireMethod('POST');

if (function_exists('set_time_limit')) {
    @set_time_limit(300);
}

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);
$sellerId = (int)($user['id'] ?? $_SESSION['user_id'] ?? 0);

// Helper to validate and save an uploaded file slot
function kcSaveUploadedImageSlot(array $fileSlot, string $targetDir): ?string {
    if (!isset($fileSlot['name']) || empty($fileSlot['name']) || ($fileSlot['error'] ?? 0) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    $maxSize = 10 * 1024 * 1024;
    $fileError = (int)($fileSlot['error'] ?? 0);
    $fileSize = (int)($fileSlot['size'] ?? 0);
    if ($fileError === UPLOAD_ERR_INI_SIZE || $fileError === UPLOAD_ERR_FORM_SIZE || $fileSize > $maxSize) {
        jsonError('Image file size exceeds maximum limit of 10MB', 413);
    }
    if ($fileError !== UPLOAD_ERR_OK) {
        jsonError('Failed to upload image', 400);
    }
    $ext = strtolower(pathinfo((string)$fileSlot['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
        jsonError('Invalid image format. Only JPG and PNG are supported', 415);
    }
    $mime = strtolower((string)($fileSlot['type'] ?? ''));
    $allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/x-png', 'image/pjpeg'];
    if ($mime !== '' && !in_array($mime, $allowedMimes, true)) {
        jsonError('Invalid image format. Only JPG and PNG are supported', 415);
    }

    $hash = bin2hex(random_bytes(16));
    $fileName = $hash . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
    $destPath = $targetDir . '/' . $fileName;

    $tmp = (string)($fileSlot['tmp_name'] ?? '');
    if (is_uploaded_file($tmp)) {
        if (!move_uploaded_file($tmp, $destPath)) {
            jsonError('Failed to save uploaded image', 500);
        }
    } else {
        if (!copy($tmp, $destPath)) {
            jsonError('Failed to store source image', 500);
        }
    }
    return $destPath;
}

$imageDir = dirname(__DIR__, 2) . '/public/images/ai-source';
if (!is_dir($imageDir)) {
    mkdir($imageDir, 0755, true);
}

// Validate primary uploaded image (side profile or legacy 'image' key)
$primarySlot = $_FILES['image_side'] ?? $_FILES['image'] ?? null;
if (!is_array($primarySlot) || empty($primarySlot['name']) || ($primarySlot['error'] ?? 0) === UPLOAD_ERR_NO_FILE) {
    jsonError('Image file is required', 400);
}

$destImagePath = kcSaveUploadedImageSlot($primarySlot, $imageDir);
if (!$destImagePath) {
    jsonError('Image file is required', 400);
}
$relativeImagePath = '/images/ai-source/' . basename($destImagePath);

// Optional multi-angle slots: front view and back view
$imagePaths = [$destImagePath];
if (isset($_FILES['image_front']) && is_array($_FILES['image_front'])) {
    $frontPath = kcSaveUploadedImageSlot($_FILES['image_front'], $imageDir);
    if ($frontPath) {
        $imagePaths[] = $frontPath;
    }
}
if (isset($_FILES['image_back']) && is_array($_FILES['image_back'])) {
    $backPath = kcSaveUploadedImageSlot($_FILES['image_back'], $imageDir);
    if ($backPath) {
        $imagePaths[] = $backPath;
    }
}

// Generate unique generation ID KCAI-YYYY-XXXX
$year = date('Y');
$id = '';
for ($attempt = 0; $attempt < 10; $attempt++) {
    $candidate = sprintf('KCAI-%s-%04d', $year, random_int(1000, 9999));
    $stmtCheck = $db->prepare('SELECT COUNT(*) FROM ai_generations WHERE id = ?');
    $stmtCheck->execute([$candidate]);
    if ((int)$stmtCheck->fetchColumn() === 0) {
        $id = $candidate;
        break;
    }
}

if ($id === '') {
    $id = sprintf('KCAI-%s-%04d', $year, random_int(1000, 9999));
}

// Prepare target GLB destination in public/models/seller-ai/
$modelsDir = dirname(__DIR__, 2) . '/public/models/seller-ai';
if (!is_dir($modelsDir)) {
    mkdir($modelsDir, 0755, true);
}

$hash = bin2hex(random_bytes(16));
$glbFileName = $hash . '.glb';
$destGlbPath = $modelsDir . '/' . $glbFileName;
$relativeGlbPath = '/models/seller-ai/' . $glbFileName;

// Insert initial record with status = processing
$stmt = $db->prepare(
    "INSERT INTO ai_generations (id, seller_id, source_image_path, status, provider, started_at) "
    . "VALUES (?, ?, ?, 'processing', ?, CURRENT_TIMESTAMP)"
);
$stmt->execute([
    $id,
    $sellerId,
    $relativeImagePath,
    KC_AI_PROVIDER,
]);

// Execute 2D -> 3D generation via TRELLIS (or test generator override)
$generator = $GLOBALS['__TEST_AI_GENERATOR__'] ?? null;
if ($generator !== null && is_callable($generator)) {
    $genResult = $generator($destImagePath, $destGlbPath);
} else {
    $genResult = trellisGenerateGlb($imagePaths, $destGlbPath);
}

if (!is_array($genResult) || empty($genResult['ok'])) {
    $errMsg = is_array($genResult) && !empty($genResult['error'])
        ? (string)$genResult['error']
        : 'AI 3D generation failed to produce a valid model.';

    if (file_exists($destGlbPath)) {
        @unlink($destGlbPath);
    }

    $stmtUpdate = $db->prepare('UPDATE ai_generations SET status = \'failed\', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?');
    $stmtUpdate->execute([$errMsg, $id]);

    jsonError($errMsg, 502, [
        'generationId' => $id,
        'sourceImagePath' => $relativeImagePath,
    ]);
}

// Validate generated GLB header and existence
if (!file_exists($destGlbPath) || filesize($destGlbPath) < 20) {
    if (file_exists($destGlbPath)) {
        @unlink($destGlbPath);
    }
    $errMsg = 'Generated 3D asset is invalid or empty.';
    $stmtUpdate = $db->prepare('UPDATE ai_generations SET status = \'failed\', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?');
    $stmtUpdate->execute([$errMsg, $id]);
    jsonError($errMsg, 502, ['generationId' => $id]);
}

// Mark completed and store GLB path
$stmtUpdate = $db->prepare('UPDATE ai_generations SET status = \'completed\', result_glb_path = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?');
$stmtUpdate->execute([$relativeGlbPath, $id]);

// Fetch created record
$stmtSelect = $db->prepare('SELECT * FROM ai_generations WHERE id = ?');
$stmtSelect->execute([$id]);
$row = $stmtSelect->fetch();

$generation = $row ? formatAiGenerationRow($row) : [
    'id' => $id,
    'sellerId' => $sellerId,
    'seller_id' => $sellerId,
    'sourceImagePath' => $relativeImagePath,
    'source_image_path' => $relativeImagePath,
    'status' => 'completed',
    'resultGlbPath' => $relativeGlbPath,
    'result_glb_path' => $relativeGlbPath,
    'provider' => KC_AI_PROVIDER,
    'errorMessage' => null,
    'error_message' => null,
    'startedAt' => date('Y-m-d H:i:s'),
    'started_at' => date('Y-m-d H:i:s'),
    'completedAt' => date('Y-m-d H:i:s'),
    'completed_at' => date('Y-m-d H:i:s'),
    'createdAt' => date('Y-m-d H:i:s'),
    'created_at' => date('Y-m-d H:i:s'),
];

jsonResponse([
    'success' => true,
    'generation' => $generation,
]);

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

// Validate uploaded image
if (!isset($_FILES['image']) || !is_array($_FILES['image']) || empty($_FILES['image']['name']) || ($_FILES['image']['error'] ?? 0) === UPLOAD_ERR_NO_FILE) {
    jsonError('Image file is required', 400);
}

$maxSize = 10 * 1024 * 1024; // 10MB
$fileError = (int)($_FILES['image']['error'] ?? 0);
$fileSize = (int)($_FILES['image']['size'] ?? 0);

if ($fileError === UPLOAD_ERR_INI_SIZE || $fileError === UPLOAD_ERR_FORM_SIZE || $fileSize > $maxSize) {
    jsonError('Image file size exceeds maximum limit of 10MB', 413);
}

if ($fileError !== UPLOAD_ERR_OK) {
    jsonError('Failed to upload image', 400);
}

$originalName = (string)($_FILES['image']['name'] ?? '');
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$allowedExtensions = ['jpg', 'jpeg', 'png'];

if (!in_array($extension, $allowedExtensions, true)) {
    jsonError('Invalid image format. Only JPG and PNG are supported', 415);
}

$mimeType = strtolower((string)($_FILES['image']['type'] ?? ''));
$allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/x-png', 'image/pjpeg'];
if ($mimeType !== '' && !in_array($mimeType, $allowedMimes, true)) {
    jsonError('Invalid image format. Only JPG and PNG are supported', 415);
}

// Generate unique hash & file names
$hash = bin2hex(random_bytes(16));
$imageFileName = $hash . '.' . ($extension === 'jpeg' ? 'jpg' : $extension);

$imageDir = dirname(__DIR__, 2) . '/public/images/ai-source';
if (!is_dir($imageDir)) {
    mkdir($imageDir, 0755, true);
}

$destImagePath = $imageDir . '/' . $imageFileName;
$relativeImagePath = '/images/ai-source/' . $imageFileName;

$tmpPath = (string)($_FILES['image']['tmp_name'] ?? '');
if (is_uploaded_file($tmpPath)) {
    if (!move_uploaded_file($tmpPath, $destImagePath)) {
        jsonError('Failed to save uploaded image', 500);
    }
} else {
    if (!copy($tmpPath, $destImagePath)) {
        jsonError('Failed to store source image', 500);
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
    $genResult = trellisGenerateGlb($destImagePath, $destGlbPath);
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

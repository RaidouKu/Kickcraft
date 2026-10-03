<?php
// KickCraft AI Generation Status Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);
$sellerId = (int)($user['id'] ?? $_SESSION['user_id'] ?? 0);

$id = sanitizeString($_GET['id'] ?? '');
if ($id === '') {
    jsonError('Job ID is required', 400);
}

$stmt = $db->prepare('SELECT * FROM ai_generations WHERE id = ? AND seller_id = ?');
$stmt->execute([$id, $sellerId]);
$row = $stmt->fetch();

if (!$row) {
    jsonError('AI generation not found', 404);
}

jsonResponse([
    'success' => true,
    'generation' => formatAiGenerationRow($row),
]);

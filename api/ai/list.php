<?php
// KickCraft AI Generations List Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);
$sellerId = (int)($user['id'] ?? $_SESSION['user_id'] ?? 0);

$stmt = $db->prepare('SELECT * FROM ai_generations WHERE seller_id = ? ORDER BY created_at DESC');
$stmt->execute([$sellerId]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$generations = array_map('formatAiGenerationRow', $rows ?: []);

jsonResponse([
    'success' => true,
    'generations' => $generations,
]);

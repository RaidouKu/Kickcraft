<?php
// KickCraft Tutorial Progress Retrieval Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();
$userId = (int)($_SESSION['user_id'] ?? 0);

$stmt = $db->prepare(
    'SELECT current_step, completed_steps, tutorial_completed, started_at, completed_at, updated_at '
    . 'FROM tutorial_progress '
    . 'WHERE user_id = ?'
);
$stmt->execute([$userId]);
$row = $stmt->fetch();

if ($row) {
    $completedSteps = $row['completed_steps'] ?? [];
    if (is_string($completedSteps)) {
        $completedSteps = json_decode($completedSteps, true) ?: [];
    } elseif (!is_array($completedSteps)) {
        $completedSteps = [];
    }

    $progress = [
        'current_step' => (string)($row['current_step'] ?? 'welcome'),
        'completed_steps' => array_values($completedSteps),
        'tutorial_completed' => (int)($row['tutorial_completed'] ?? 0),
        'started_at' => $row['started_at'] ?? null,
        'completed_at' => $row['completed_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
    ];
} else {
    $progress = [
        'current_step' => 'welcome',
        'completed_steps' => [],
        'tutorial_completed' => 0,
        'started_at' => null,
        'completed_at' => null,
        'updated_at' => null,
    ];
}

jsonResponse([
    'success' => true,
    'progress' => $progress,
]);

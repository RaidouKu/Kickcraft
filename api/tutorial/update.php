<?php
// KickCraft Tutorial Progress Update Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();
$userId = (int)($_SESSION['user_id'] ?? 0);

$body = getJsonBody();

$currentStep = sanitizeString($body['currentStep'] ?? $body['current_step'] ?? 'welcome');
if ($currentStep === '') {
    $currentStep = 'welcome';
}

$completedSteps = $body['completedSteps'] ?? $body['completed_steps'] ?? [];
if (!is_array($completedSteps)) {
    $completedSteps = [];
}

$isCompleted = in_array('manage_orders', $completedSteps, true);
$tutorialCompleted = $isCompleted ? 1 : 0;
$completedAt = $isCompleted ? date('Y-m-d H:i:s') : null;

$completedStepsJson = json_encode(array_values($completedSteps), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$stmt = $db->prepare(
    'INSERT INTO tutorial_progress (user_id, completed_steps, current_step, tutorial_completed, completed_at) '
    . 'VALUES (?, ?, ?, ?, ?) '
    . 'ON DUPLICATE KEY UPDATE '
    . 'completed_steps = VALUES(completed_steps), '
    . 'current_step = VALUES(current_step), '
    . 'tutorial_completed = VALUES(tutorial_completed), '
    . 'completed_at = VALUES(completed_at)'
);
$stmt->execute([
    $userId,
    $completedStepsJson,
    $currentStep,
    $tutorialCompleted,
    $completedAt,
]);

jsonResponse([
    'success' => true,
]);

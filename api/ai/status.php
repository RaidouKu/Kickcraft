<?php
// KickCraft AI Generation Status Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

function kcEnsureAiGenerationsTable(PDO $db): void {
    static $ensured = false;
    if ($ensured) return;
    if (isset($GLOBALS['__TEST_PDO__']) || get_class($db) !== 'PDO') {
        $ensured = true;
        return;
    }
    try {
        @$db->exec("CREATE TABLE IF NOT EXISTS ai_generations (
          id VARCHAR(64) PRIMARY KEY,
          seller_id INT NOT NULL,
          source_image_path VARCHAR(500) NOT NULL,
          status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
          result_glb_path VARCHAR(500) DEFAULT NULL,
          provider VARCHAR(50) NOT NULL DEFAULT 'huggingface_trellis',
          error_message TEXT DEFAULT NULL,
          started_at TIMESTAMP NULL DEFAULT NULL,
          completed_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ai_seller (seller_id),
          INDEX idx_ai_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
    $ensured = true;
}

try {
    $pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
    requireSeller($pdo);

    $db = $pdo ?? getDb();
    kcEnsureAiGenerationsTable($db);

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
} catch (Throwable $e) {
    error_log('KickCraft AI status error: ' . $e->getMessage());
    jsonError('Failed to fetch AI status: ' . $e->getMessage(), 500);
}

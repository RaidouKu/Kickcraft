<?php
// KickCraft Seller Review Endpoint (Owner/Admin)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireAdmin($pdo);

$body = getJsonBody();

$rawUserId = $body['userId'] ?? $body['user_id'] ?? null;
if ($rawUserId === null || !filter_var($rawUserId, FILTER_VALIDATE_INT) || (int)$rawUserId <= 0) {
    jsonError('Valid user ID is required', 400);
}
$userId = (int)$rawUserId;

$status = strtolower(trim((string)($body['status'] ?? '')));
$allowedStatuses = ['approved', 'rejected', 'suspended'];
if (!in_array($status, $allowedStatuses, true)) {
    jsonError("Invalid status: must be one of 'approved', 'rejected', 'suspended'", 400);
}

$notes = null;
if (array_key_exists('notes', $body)) {
    $notes = $body['notes'] !== null ? trim((string)$body['notes']) : null;
} elseif (array_key_exists('adminNotes', $body)) {
    $notes = $body['adminNotes'] !== null ? trim((string)$body['adminNotes']) : null;
}

if ($notes !== null && strlen($notes) > 1000) {
    jsonError('Notes must not exceed 1000 characters', 400);
}

$db = $pdo ?? getDb();

$stmtUpdate = $db->prepare(
    'UPDATE seller_profiles '
    . 'SET status = ?, admin_notes = ?, approved_at = (CASE WHEN ? = \'approved\' THEN CURRENT_TIMESTAMP ELSE approved_at END) '
    . 'WHERE user_id = ? AND deleted_at IS NULL AND permanently_deleted = 0'
);
$stmtUpdate->execute([$status, $notes, $status, $userId]);

if ($stmtUpdate->rowCount() === 0) {
    $stmtCheck = $db->prepare(
        'SELECT sp.id FROM seller_profiles sp '
        . 'JOIN users u ON sp.user_id = u.id '
        . 'WHERE sp.user_id = ? '
        . 'AND sp.deleted_at IS NULL AND sp.permanently_deleted = 0 '
        . 'AND u.deleted_at IS NULL AND u.permanently_deleted = 0'
    );
    $stmtCheck->execute([$userId]);
    if (!$stmtCheck->fetch()) {
        jsonError('Seller not found', 404);
    }
}

jsonResponse([
    'success' => true,
    'message' => 'Seller status updated successfully',
]);

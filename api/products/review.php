<?php
// KickCraft Product Review Endpoint (Owner/Admin)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireAdmin($pdo);

$body = getJsonBody();

$id = sanitizeString($body['productId'] ?? $body['id'] ?? '');
if ($id === '') {
    jsonError('Product ID required', 400);
}

$status = strtolower(trim((string)($body['status'] ?? '')));
$allowedStatuses = ['approved', 'rejected', 'suspended'];
if (!in_array($status, $allowedStatuses, true)) {
    jsonError('Invalid status', 400);
}

$notes = null;
if (array_key_exists('notes', $body)) {
    $notes = $body['notes'] !== null ? sanitizeString($body['notes']) : null;
} elseif (array_key_exists('adminNotes', $body)) {
    $notes = $body['adminNotes'] !== null ? sanitizeString($body['adminNotes']) : null;
}

$approvedAt = $status === 'approved' ? date('Y-m-d H:i:s') : null;

$db = $pdo ?? getDb();
$stmt = $db->prepare(
    "UPDATE products SET status = ?, admin_notes = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0"
);
$stmt->execute([$status, $notes, $approvedAt, $id]);

if ($stmt->rowCount() === 0) {
    // If status and notes were unchanged, check if product exists
    $check = $db->prepare("SELECT id FROM products WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0");
    $check->execute([$id]);
    if (!$check->fetch()) {
        jsonError('Product not found', 404);
    }
}

jsonResponse(['success' => true]);

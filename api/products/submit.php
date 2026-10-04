<?php
// KickCraft Product Submission Endpoint (Seller)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);
$sellerId = (int)($user['id'] ?? $_SESSION['user_id'] ?? 0);

$body = getJsonBody();
$id = sanitizeString($body['productId'] ?? $body['id'] ?? '');
if ($id === '') {
    jsonError('Product ID required', 400);
}

$stmt = $db->prepare(
    "UPDATE products SET status = 'pending', approved_at = NULL WHERE id = ? AND seller_id = ? AND status IN ('draft', 'rejected', 'approved', 'suspended') AND deleted_at IS NULL AND permanently_deleted = 0"
);
$stmt->execute([$id, $sellerId]);

if ($stmt->rowCount() === 0) {
    jsonError('Invalid operation or product not eligible for submission', 400);
}

jsonResponse(['success' => true]);

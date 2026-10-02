<?php
// KickCraft Seller Profile Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();

$userId = (int)($_SESSION['user_id'] ?? 0);

$stmt = $db->prepare(
    'SELECT sp.id, sp.user_id, u.name, u.email, sp.store_name, sp.store_description, sp.status, sp.admin_notes, sp.approved_at, sp.created_at '
    . 'FROM seller_profiles sp '
    . 'JOIN users u ON sp.user_id = u.id '
    . 'WHERE sp.user_id = ? '
    . 'AND sp.deleted_at IS NULL AND sp.permanently_deleted = 0 '
    . 'AND u.deleted_at IS NULL AND u.permanently_deleted = 0'
);
$stmt->execute([$userId]);
$row = $stmt->fetch();

if (!$row) {
    jsonError('Seller profile not found', 404);
}

jsonResponse([
    'success' => true,
    'seller' => formatSellerRow($row),
]);

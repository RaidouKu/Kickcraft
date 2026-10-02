<?php
// KickCraft Sellers List Endpoint (Owner/Admin)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireAdmin($pdo);

$db = $pdo ?? getDb();

$where = [
    'u.deleted_at IS NULL AND u.permanently_deleted = 0',
    'sp.deleted_at IS NULL AND sp.permanently_deleted = 0',
];
$params = [];

// Optional filter by status
$status = trim((string)($_GET['status'] ?? ''));
if ($status !== '' && $status !== 'all') {
    $where[] = 'sp.status = ?';
    $params[] = $status;
}

$sql = 'SELECT sp.id, sp.user_id, u.name, u.email, sp.store_name, sp.store_description, sp.status, sp.admin_notes, sp.approved_at, sp.created_at '
     . 'FROM seller_profiles sp '
     . 'JOIN users u ON sp.user_id = u.id '
     . 'WHERE ' . implode(' AND ', $where) . ' '
     . 'ORDER BY sp.created_at DESC';

$stmt = $db->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$sellers = array_map('formatSellerRow', $rows);

jsonResponse([
    'success' => true,
    'sellers' => $sellers,
]);

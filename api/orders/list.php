<?php
// KickCraft Orders - List Orders Endpoint (Seller / Admin)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);

if (!$user || !in_array($user['role'] ?? '', ['seller', 'owner'], true)) {
    jsonError('Seller or admin privileges required', 403);
}

$statusFilter = strtolower(sanitizeString($_GET['status'] ?? ''));
$validStatuses = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'];

$sql = "SELECT * FROM orders WHERE deleted_at IS NULL AND permanently_deleted = 0";
$params = [];

if ($user['role'] === 'seller') {
    $sql .= " AND seller_id = ?";
    $params[] = (int)$user['id'];
}

if ($statusFilter !== '' && in_array($statusFilter, $validStatuses, true)) {
    $sql .= " AND status = ?";
    $params[] = $statusFilter;
}

$sql .= " ORDER BY created_at DESC";

$stmt = $db->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$orders = array_map('formatOrderRow', $rows);

jsonResponse([
    'success' => true,
    'orders' => $orders,
]);

<?php
// KickCraft Product Catalog - List Products Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);

if ($user && $user['role'] === 'seller') {
    $stmt = $db->prepare(
        "SELECT p.*, s.store_name "
        . "FROM products p "
        . "LEFT JOIN seller_profiles s ON p.seller_id = s.user_id "
        . "WHERE p.seller_id = ? AND p.deleted_at IS NULL AND p.permanently_deleted = 0 "
        . "ORDER BY p.created_at DESC"
    );
    $stmt->execute([$user['id']]);
} elseif ($user && $user['role'] === 'owner') {
    $stmt = $db->prepare(
        "SELECT p.*, s.store_name "
        . "FROM products p "
        . "LEFT JOIN seller_profiles s ON p.seller_id = s.user_id "
        . "WHERE p.deleted_at IS NULL AND p.permanently_deleted = 0 "
        . "ORDER BY p.created_at DESC"
    );
    $stmt->execute();
} else {
    $stmt = $db->prepare(
        "SELECT p.*, s.store_name "
        . "FROM products p "
        . "LEFT JOIN seller_profiles s ON p.seller_id = s.user_id "
        . "WHERE p.status = 'approved' AND p.deleted_at IS NULL AND p.permanently_deleted = 0 "
        . "ORDER BY p.created_at DESC"
    );
    $stmt->execute();
}

$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
$products = array_map('formatProductRow', $rows);

jsonResponse([
    'success' => true,
    'products' => $products,
]);

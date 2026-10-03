<?php
// KickCraft Product Catalog - Product Detail Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$id = sanitizeString($_GET['id'] ?? '');
if ($id === '') {
    jsonError('Product ID required', 400);
}

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
$db = $pdo ?? getDb();

$stmt = $db->prepare(
    "SELECT p.*, s.store_name "
    . "FROM products p "
    . "LEFT JOIN seller_profiles s ON p.seller_id = s.user_id "
    . "WHERE p.id = ? AND p.deleted_at IS NULL AND p.permanently_deleted = 0"
);
$stmt->execute([$id]);
$product = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$product) {
    jsonError('Product not found', 404);
}

$user = currentSessionUser($pdo);
if ($product['status'] !== 'approved') {
    if (!$user || ($user['role'] !== 'owner' && (int)$user['id'] !== (int)$product['seller_id'])) {
        jsonError('Product not found', 404);
    }
}

jsonResponse([
    'success' => true,
    'product' => formatProductRow($product),
]);

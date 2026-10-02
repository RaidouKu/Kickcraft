<?php
// KickCraft Seller Profile Update Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? '');
if ($method !== 'PUT' && $method !== 'POST') {
    jsonError('Method not allowed', 405);
}

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireApprovedSeller($pdo);

$db = $pdo ?? getDb();

$body = getJsonBody();

$storeName = trim((string)($body['storeName'] ?? $body['store_name'] ?? ''));
$storeNameLen = strlen($storeName);
if ($storeName === '' || $storeNameLen < 2 || $storeNameLen > 255) {
    jsonError('Store name must be between 2 and 255 characters', 400);
}

$storeDescription = null;
if (array_key_exists('storeDescription', $body)) {
    $storeDescription = $body['storeDescription'] !== null ? trim((string)$body['storeDescription']) : null;
} elseif (array_key_exists('store_description', $body)) {
    $storeDescription = $body['store_description'] !== null ? trim((string)$body['store_description']) : null;
}

if ($storeDescription !== null && strlen($storeDescription) > 1000) {
    jsonError('Store description must not exceed 1000 characters', 400);
}

if ($storeDescription === '') {
    $storeDescription = null;
}

$userId = (int)($_SESSION['user_id'] ?? 0);

$stmtUpdate = $db->prepare(
    'UPDATE seller_profiles '
    . 'SET store_name = ?, store_description = ? '
    . 'WHERE user_id = ? AND deleted_at IS NULL AND permanently_deleted = 0'
);
$stmtUpdate->execute([$storeName, $storeDescription, $userId]);

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

$_SESSION['seller_store_name'] = $storeName;
$_SESSION['seller_store_description'] = $storeDescription;

jsonResponse([
    'success' => true,
    'message' => 'Store profile updated successfully',
    'seller' => formatSellerRow($row),
]);

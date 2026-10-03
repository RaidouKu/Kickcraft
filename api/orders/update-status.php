<?php
// KickCraft Orders - Update Status Endpoint (Seller / Admin)
// Updates order status and restores product stock if transitioning to 'cancelled'

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);

if (!$user || !in_array($user['role'] ?? '', ['seller', 'owner'], true)) {
    jsonError('Seller or admin privileges required', 403);
}

$body = getJsonBody();
$orderId = sanitizeString($body['orderId'] ?? $body['id'] ?? '');
$status = strtolower(sanitizeString($body['status'] ?? ''));
$notes = isset($body['notes']) ? sanitizeString($body['notes']) : null;

if (empty($orderId)) {
    jsonError('Order ID required', 400);
}

$validStatuses = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'];
if (!in_array($status, $validStatuses, true)) {
    jsonError('Invalid status', 400);
}

if ($user['role'] === 'seller') {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? AND seller_id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
    $stmt->execute([$orderId, (int)$user['id']]);
} else {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
    $stmt->execute([$orderId]);
}
$order = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$order) {
    jsonError('Order not found or access denied', 404);
}

// If transitioning to 'cancelled' from another status, restore product stock
if ($status === 'cancelled' && ($order['status'] ?? '') !== 'cancelled') {
    $stmtStock = $db->prepare('UPDATE products SET stock = stock + 1 WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
    $stmtStock->execute([$order['product_id']]);
}

$stmtUpdate = $db->prepare("UPDATE orders SET status = ?, notes = COALESCE(NULLIF(?, ''), notes) WHERE id = ?");
$stmtUpdate->execute([$status, $notes, $orderId]);

$stmtFetch = $db->prepare('SELECT * FROM orders WHERE id = ?');
$stmtFetch->execute([$orderId]);
$updatedOrder = $stmtFetch->fetch(PDO::FETCH_ASSOC);

jsonResponse([
    'success' => true,
    'order' => formatOrderRow($updatedOrder ?: $order),
]);

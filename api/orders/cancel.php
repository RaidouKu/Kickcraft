<?php
// KickCraft Orders - Cancel Order Endpoint (Guest / Seller / Admin)
// Cancels an order, restores product stock, and updates order status to 'cancelled'

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);

$body = getJsonBody();
$orderId = sanitizeString($body['orderId'] ?? $body['id'] ?? '');
$email = sanitizeEmail($body['email'] ?? $body['buyerEmail'] ?? $body['buyer_email'] ?? '');
$notes = isset($body['notes']) ? sanitizeString($body['notes']) : null;

if (empty($orderId)) {
    jsonError('Order ID required', 400);
}

if ($user && $user['role'] === 'seller') {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? AND seller_id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
    $stmt->execute([$orderId, (int)$user['id']]);
} elseif ($user && $user['role'] === 'owner') {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
    $stmt->execute([$orderId]);
} else {
    if (empty($email)) {
        jsonError('Order not found or authorization failed', 404);
    }
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? AND LOWER(TRIM(buyer_email)) = LOWER(TRIM(?)) AND deleted_at IS NULL AND permanently_deleted = 0');
    $stmt->execute([$orderId, $email]);
}
$order = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$order) {
    jsonError('Order not found or authorization failed', 404);
}

// If already cancelled, return success without double-restoring stock
if (($order['status'] ?? '') === 'cancelled') {
    jsonResponse([
        'success' => true,
        'message' => 'Order is already cancelled',
        'order' => formatOrderRow($order),
    ]);
}

// Cannot cancel if already ready for pickup or completed
if (in_array($order['status'] ?? '', ['ready', 'completed'], true)) {
    jsonError('Orders that are ready for pickup or completed cannot be cancelled', 400);
}

// Restore product stock
$stmtStock = $db->prepare('UPDATE products SET stock = stock + 1 WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
$stmtStock->execute([$order['product_id']]);

// Update order status to 'cancelled'
$stmtUpdate = $db->prepare("UPDATE orders SET status = 'cancelled', notes = COALESCE(NULLIF(?, ''), notes) WHERE id = ?");
$stmtUpdate->execute([$notes, $orderId]);

$stmtFetch = $db->prepare('SELECT * FROM orders WHERE id = ?');
$stmtFetch->execute([$orderId]);
$updatedOrder = $stmtFetch->fetch(PDO::FETCH_ASSOC);

jsonResponse([
    'success' => true,
    'message' => 'Order has been cancelled successfully',
    'order' => formatOrderRow($updatedOrder ?: $order),
]);

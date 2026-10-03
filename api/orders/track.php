<?php
// KickCraft Public Order Tracking API
// Allows buyers to track their order status using order ID and buyer email

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$orderId = sanitizeString($_GET['orderId'] ?? $_GET['id'] ?? '');
$email = sanitizeEmail($_GET['email'] ?? '');

if (empty($orderId)) {
    jsonError('Order ID is required', 400);
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonError('Valid email is required', 400);
}

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
$db = $pdo ?? getDb();

$stmt = $db->prepare(
    'SELECT * FROM orders WHERE id = ? AND LOWER(TRIM(buyer_email)) = LOWER(TRIM(?)) AND deleted_at IS NULL AND permanently_deleted = 0 LIMIT 1'
);
$stmt->execute([$orderId, $email]);
$order = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$order) {
    jsonError('Order not found or details do not match', 404);
}

jsonResponse([
    'success' => true,
    'order' => formatOrderRow($order),
]);

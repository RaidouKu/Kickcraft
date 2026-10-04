<?php
// KickCraft Marketplace Guest Order Creation Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$body = getJsonBody();

// 1. Sanitize & extract inputs
$productId = sanitizeString($body['productId'] ?? $body['product_id'] ?? '');
$buyerName = sanitizeString($body['buyerName'] ?? $body['buyer_name'] ?? '');
$buyerEmail = sanitizeEmail($body['buyerEmail'] ?? $body['buyer_email'] ?? '');
$pickupDate = sanitizeString($body['pickupDate'] ?? $body['pickup_date'] ?? '');
$notes = isset($body['notes']) && trim((string)$body['notes']) !== '' ? sanitizeString($body['notes']) : null;

// 2. Validate input fields
if ($productId === '') {
    jsonError('Product ID is required', 400);
}

$nameLen = function_exists('mb_strlen') ? mb_strlen($buyerName) : strlen($buyerName);
if ($nameLen < 2) {
    jsonError('Buyer name must be at least 2 characters', 400);
}

if ($buyerEmail === '' || !filter_var($buyerEmail, FILTER_VALIDATE_EMAIL)) {
    jsonError('Valid email is required', 400);
}

if ($pickupDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $pickupDate)) {
    jsonError('Valid pickup date (YYYY-MM-DD) is required', 400);
}

$dateParts = explode('-', $pickupDate);
if (!checkdate((int)$dateParts[1], (int)$dateParts[2], (int)$dateParts[0])) {
    jsonError('Valid pickup date (YYYY-MM-DD) is required', 400);
}

if ($pickupDate < date('Y-m-d')) {
    jsonError('Pickup date cannot be in the past', 400);
}

// 3. Database connection
$db = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
if (!$db) {
    $db = getDb();
}

// 4. Product lookup with seller store name
$stmt = $db->prepare("SELECT p.*, s.store_name FROM products p LEFT JOIN seller_profiles s ON p.seller_id = s.user_id WHERE p.id = ? AND p.status = 'approved' AND p.deleted_at IS NULL AND p.permanently_deleted = 0");
$stmt->execute([$productId]);
$product = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$product) {
    jsonError('Product not found or not available for ordering', 404);
}

if ((int)$product['stock'] <= 0) {
    jsonError('Product is currently out of stock', 400);
}

// 5. Atomic stock decrement
$decStmt = $db->prepare("UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0 AND deleted_at IS NULL AND permanently_deleted = 0");
$decStmt->execute([$productId]);

if ($decStmt->rowCount() === 0) {
    jsonError('Product is currently out of stock', 400);
}

// 6. Capture static snapshots
$unitPrice = (float)$product['price'];
$totalPrice = $unitPrice;
$productName = (string)$product['name'];
$productThumbnail = !empty($product['thumbnail_path']) ? (string)$product['thumbnail_path'] : (!empty($product['glb_path']) ? (string)$product['glb_path'] : '');
$sellerStoreName = !empty($product['store_name']) ? (string)$product['store_name'] : 'KickCraft Seller';
$sellerId = (int)$product['seller_id'];

// Per-part colors are only supported on products that have separate addressable meshes.
// AI 2D->3D models and unmapped single-mesh shoes store an empty colorway snapshot.
$creationMethod = $product['creation_method'] ?? '';
$isPartCustomizable = ($creationMethod !== 'ai_generate');

if ($isPartCustomizable && isset($product['mesh_map'])) {
    $meshMapDecoded = is_array($product['mesh_map']) ? $product['mesh_map'] : json_decode($product['mesh_map'], true);
    if (is_array($meshMapDecoded) && empty($meshMapDecoded) && empty($product['part_colors'])) {
        $isPartCustomizable = false;
    }
}

if (!$isPartCustomizable) {
    $customColors = json_encode([]);
} else {
    $rawCustomColors = $body['customColors'] ?? $body['custom_colors'] ?? $body['partColors'] ?? $body['part_colors'] ?? null;
    if ($rawCustomColors === null) {
        $customColors = is_string($product['part_colors']) ? $product['part_colors'] : json_encode($product['part_colors'] ?? []);
    } elseif (is_array($rawCustomColors)) {
        $customColors = json_encode($rawCustomColors, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    } else {
        $customColors = (string)$rawCustomColors;
    }
}

$customCharm = sanitizeString($body['customCharm'] ?? $body['custom_charm'] ?? $body['charmId'] ?? $body['charm_id'] ?? $product['charm_id'] ?? 'none');
if ($customCharm === '') {
    $customCharm = 'none';
}

// 7. Generate order ID and insert order
$orderId = generateOrderId($db);

$ins = $db->prepare("INSERT INTO orders (id, seller_id, product_id, buyer_name, buyer_email, custom_colors, custom_charm, unit_price, total_price, product_name, product_thumbnail, seller_store_name, status, pickup_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)");
$ins->execute([
    $orderId,
    $sellerId,
    $productId,
    $buyerName,
    $buyerEmail,
    $customColors,
    $customCharm,
    $unitPrice,
    $totalPrice,
    $productName,
    $productThumbnail,
    $sellerStoreName,
    $pickupDate,
    $notes
]);

// 8. Fetch inserted order record
$stmtOrder = $db->prepare("SELECT * FROM orders WHERE id = ?");
$stmtOrder->execute([$orderId]);
$orderRow = $stmtOrder->fetch(PDO::FETCH_ASSOC);

if (!$orderRow) {
    $orderRow = [
        'id' => $orderId,
        'seller_id' => $sellerId,
        'product_id' => $productId,
        'buyer_name' => $buyerName,
        'buyer_email' => $buyerEmail,
        'custom_colors' => $customColors,
        'custom_charm' => $customCharm,
        'unit_price' => $unitPrice,
        'total_price' => $totalPrice,
        'product_name' => $productName,
        'product_thumbnail' => $productThumbnail,
        'seller_store_name' => $sellerStoreName,
        'status' => 'pending',
        'pickup_date' => $pickupDate,
        'notes' => $notes,
        'created_at' => date('Y-m-d H:i:s'),
        'updated_at' => date('Y-m-d H:i:s'),
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ];
}

jsonResponse([
    'success' => true,
    'orderId' => $orderId,
    'order' => formatOrderRow($orderRow)
], 201);

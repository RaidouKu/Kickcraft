<?php
// KickCraft Product Update Endpoint (Seller)
// Updates existing product details and marks status as 'pending' for owner approval.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$pdo = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : (PHP_SAPI !== 'cli' ? getDb() : null));
requireSeller($pdo);

$db = $pdo ?? getDb();
$user = currentSessionUser($pdo);
$sellerId = (int)($user['id'] ?? $_SESSION['user_id'] ?? 0);

$data = getJsonBody();
$id = sanitizeString($data['id'] ?? $data['productId'] ?? '');
if ($id === '') {
    jsonError('Product ID is required', 400);
}

// Check product exists and belongs to this seller
$stmt = $db->prepare('SELECT * FROM products WHERE id = ? AND seller_id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
$stmt->execute([$id, $sellerId]);
$existing = $stmt->fetch();
if (!$existing) {
    jsonError('Product not found or access denied', 404);
}

// Validate product name (min 2 chars) if provided
$name = isset($data['name']) ? sanitizeString($data['name']) : (string)$existing['name'];
if (strlen($name) < 2) {
    jsonError('Product name is required (minimum 2 characters)', 400);
}

// Validate price if provided
if (isset($data['price'])) {
    if (!is_numeric($data['price']) || (float)$data['price'] < 0) {
        jsonError('Valid non-negative price is required', 400);
    }
    $price = round((float)$data['price'], 2);
} else {
    $price = (float)$existing['price'];
}

// Description & category handling
$description = isset($data['description']) ? sanitizeString($data['description']) : (string)$existing['description'];
$category = isset($data['category']) && trim((string)$data['category']) !== '' ? sanitizeString($data['category']) : null;
if ($category && $category !== 'all') {
    // Strip old tag if present
    $description = trim(preg_replace('/\s*\[tag:\s*[^\]]+\]/i', '', $description));
    $description .= "\n[tag: " . $category . "]";
}

// Stock
$stock = isset($data['stock']) && is_numeric($data['stock']) ? max(0, (int)$data['stock']) : (int)$existing['stock'];

// GLB and thumbnail paths
$glbPath = isset($data['glbPath']) || isset($data['glb_path'])
    ? sanitizeString($data['glbPath'] ?? $data['glb_path'])
    : (string)$existing['glb_path'];

$thumbnailPath = isset($data['thumbnailPath']) || isset($data['thumbnail_path'])
    ? sanitizeString($data['thumbnailPath'] ?? $data['thumbnail_path'])
    : ($existing['thumbnail_path'] ? (string)$existing['thumbnail_path'] : null);

$baseShoeId = isset($data['baseShoeId']) || isset($data['base_shoe_id'])
    ? sanitizeString($data['baseShoeId'] ?? $data['base_shoe_id'])
    : ($existing['base_shoe_id'] ? (string)$existing['base_shoe_id'] : null);

$charmId = isset($data['charmId']) || isset($data['charm_id'])
    ? sanitizeString($data['charmId'] ?? $data['charm_id'])
    : ((string)($existing['charm_id'] ?? 'none'));

// JSON columns: mesh_map, part_colors, sizes_available
$meshMapRaw = $data['meshMap'] ?? $data['mesh_map'] ?? null;
if ($meshMapRaw !== null) {
    $meshMap = is_array($meshMapRaw) ? json_encode($meshMapRaw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : (string)$meshMapRaw;
} else {
    $meshMap = $existing['mesh_map'] ? (string)$existing['mesh_map'] : null;
}

$partColorsRaw = $data['partColors'] ?? $data['part_colors'] ?? null;
if ($partColorsRaw !== null) {
    $partColors = is_array($partColorsRaw) ? json_encode($partColorsRaw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : (string)$partColorsRaw;
} else {
    $partColors = $existing['part_colors'] ? (string)$existing['part_colors'] : null;
}

$sizesAvailableRaw = $data['sizesAvailable'] ?? $data['sizes_available'] ?? null;
if ($sizesAvailableRaw !== null) {
    $sizesAvailable = is_array($sizesAvailableRaw) ? json_encode($sizesAvailableRaw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : (string)$sizesAvailableRaw;
} else {
    $sizesAvailable = $existing['sizes_available'] ? (string)$existing['sizes_available'] : '[]';
}

// When edited by seller, status transitions to 'pending' for owner review!
$newStatus = 'pending';

$updateStmt = $db->prepare(
    "UPDATE products SET
        name = ?,
        description = ?,
        price = ?,
        stock = ?,
        glb_path = ?,
        thumbnail_path = ?,
        base_shoe_id = ?,
        charm_id = ?,
        mesh_map = ?,
        part_colors = ?,
        sizes_available = ?,
        status = ?,
        approved_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND seller_id = ?"
);
$updateStmt->execute([
    $name,
    $description,
    $price,
    $stock,
    $glbPath,
    $thumbnailPath,
    $baseShoeId,
    $charmId,
    $meshMap,
    $partColors,
    $sizesAvailable,
    $newStatus,
    $id,
    $sellerId,
]);

// Fetch updated record
$stmtSelect = $db->prepare('SELECT * FROM products WHERE id = ?');
$stmtSelect->execute([$id]);
$updatedRow = $stmtSelect->fetch();

jsonResponse([
    'success' => true,
    'message' => 'Product updated successfully and submitted for owner review',
    'product' => $updatedRow ? formatProductRow($updatedRow) : null,
]);

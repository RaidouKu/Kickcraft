<?php
// KickCraft Product Draft Creation Endpoint

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

// Validate product name (min 2 chars)
$name = sanitizeString($data['name'] ?? '');
if (strlen($name) < 2) {
    jsonError('Product name is required (minimum 2 characters)', 400);
}

// Validate price (non-negative numeric)
if (!isset($data['price']) || !is_numeric($data['price']) || (float)$data['price'] < 0) {
    jsonError('Valid non-negative price is required', 400);
}
$price = round((float)$data['price'], 2);

// Validate creation method
$creationMethod = (string)($data['creationMethod'] ?? $data['creation_method'] ?? '');
$allowedMethods = ['upload', 'ai_generate', 'template'];
if (!in_array($creationMethod, $allowedMethods, true)) {
    jsonError('Invalid creation method. Must be upload, ai_generate, or template', 400);
}

// Optional and additional fields
$description = isset($data['description']) && trim((string)$data['description']) !== '' ? sanitizeString($data['description']) : null;
$category = isset($data['category']) && trim((string)$data['category']) !== '' ? sanitizeString($data['category']) : null;
if ($category && $category !== 'all') {
    if ($description && stripos($description, '[tag:') === false) {
        $description .= "\n[tag: " . $category . "]";
    } elseif (!$description) {
        $description = "[tag: " . $category . "]";
    }
}
$stock = isset($data['stock']) && is_numeric($data['stock']) ? max(0, (int)$data['stock']) : 0;
$glbPath = isset($data['glbPath']) || isset($data['glb_path']) ? sanitizeString($data['glbPath'] ?? $data['glb_path']) : null;
$thumbnailPath = isset($data['thumbnailPath']) || isset($data['thumbnail_path']) ? sanitizeString($data['thumbnailPath'] ?? $data['thumbnail_path']) : null;
$baseShoeId = isset($data['baseShoeId']) || isset($data['base_shoe_id']) ? sanitizeString($data['baseShoeId'] ?? $data['base_shoe_id']) : null;
$charmId = isset($data['charmId']) || isset($data['charm_id']) ? sanitizeString($data['charmId'] ?? $data['charm_id']) : 'none';

// JSON columns: mesh_map, part_colors, sizes_available
$meshMapRaw = $data['meshMap'] ?? $data['mesh_map'] ?? null;
$meshMap = null;
if (is_array($meshMapRaw)) {
    $meshMap = json_encode($meshMapRaw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} elseif (is_string($meshMapRaw) && trim($meshMapRaw) !== '') {
    $meshMap = $meshMapRaw;
}

$partColorsRaw = $data['partColors'] ?? $data['part_colors'] ?? null;
$partColors = null;
if (is_array($partColorsRaw)) {
    $partColors = json_encode($partColorsRaw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} elseif (is_string($partColorsRaw) && trim($partColorsRaw) !== '') {
    $partColors = $partColorsRaw;
}

// AI 2D->3D shoes have single baked textures and cannot have parts independently recolored.
if ($creationMethod === 'ai_generate') {
    $meshMap = null;
    $partColors = null;
}

$sizesAvailableRaw = $data['sizesAvailable'] ?? $data['sizes_available'] ?? null;
$sizesAvailable = '[]';
if (is_array($sizesAvailableRaw)) {
    $sizesAvailable = json_encode($sizesAvailableRaw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} elseif (is_string($sizesAvailableRaw) && trim($sizesAvailableRaw) !== '') {
    $sizesAvailable = $sizesAvailableRaw;
}

// Generate unique product ID format KCP-YYYY-XXXX
$year = date('Y');
$id = '';
for ($attempt = 0; $attempt < 10; $attempt++) {
    $candidate = sprintf('KCP-%s-%04d', $year, random_int(1000, 9999));
    $stmtCheck = $db->prepare('SELECT COUNT(*) FROM products WHERE id = ?');
    $stmtCheck->execute([$candidate]);
    if ((int)$stmtCheck->fetchColumn() === 0) {
        $id = $candidate;
        break;
    }
}

if ($id === '') {
    $id = sprintf('KCP-%s-%04d', $year, random_int(1000, 9999));
}

// Insert record with status 'draft'
$stmt = $db->prepare(
    "INSERT INTO products (
        id, seller_id, name, description, price, stock,
        creation_method, glb_path, thumbnail_path, base_shoe_id,
        part_colors, charm_id, mesh_map, sizes_available, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')"
);
$stmt->execute([
    $id,
    $sellerId,
    $name,
    $description,
    $price,
    $stock,
    $creationMethod,
    $glbPath,
    $thumbnailPath,
    $baseShoeId,
    $partColors,
    $charmId,
    $meshMap,
    $sizesAvailable,
]);

// Fetch created record
$stmtSelect = $db->prepare('SELECT * FROM products WHERE id = ?');
$stmtSelect->execute([$id]);
$row = $stmtSelect->fetch();

$product = $row ? formatProductRow($row) : [
    'id' => $id,
    'sellerId' => $sellerId,
    'name' => $name,
    'description' => $description,
    'category' => $category ?: 'sneakers',
    'categories' => array_values(array_unique(array_filter([$category ?: 'sneakers', 'sneakers']))),
    'price' => $price,
    'stock' => $stock,
    'creationMethod' => $creationMethod,
    'glbPath' => $glbPath,
    'thumbnailPath' => $thumbnailPath,
    'baseShoeId' => $baseShoeId,
    'partColors' => is_array($partColorsRaw) ? $partColorsRaw : json_decode((string)$partColors, true),
    'charmId' => $charmId,
    'meshMap' => is_array($meshMapRaw) ? $meshMapRaw : json_decode((string)$meshMap, true),
    'sizesAvailable' => is_array($sizesAvailableRaw) ? $sizesAvailableRaw : json_decode((string)$sizesAvailable, true),
    'status' => 'draft',
];

jsonResponse([
    'success' => true,
    'productId' => $id,
    'product' => $product,
]);

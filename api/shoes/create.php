<?php
// KickCraft Shoe Catalog - Create Shoe Endpoint (Owner Only)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
requireAdmin();

$body = getJsonBody();

$name = trim((string)($body['name'] ?? ''));
if ($name === '') {
    jsonError('Shoe name is required', 400);
}

$description = trim((string)($body['description'] ?? ''));

if (!isset($body['price']) || !is_numeric($body['price']) || (float)$body['price'] < 0) {
    jsonError('Valid price is required', 400);
}
$price = (float)$body['price'];

if (!isset($body['stock']) || !is_numeric($body['stock']) || (int)$body['stock'] < 0) {
    jsonError('Valid stock count is required', 400);
}
$stock = (int)$body['stock'];

$status = trim((string)($body['status'] ?? ''));
if ($status === '') {
    $status = $stock > 0 ? 'available' : 'out_of_stock';
}
if (!in_array($status, ['available', 'coming_soon', 'out_of_stock'], true)) {
    $status = 'available';
}

$glbPath = trim((string)($body['glbPath'] ?? ($body['glb_path'] ?? '')));
$thumbnailPath = trim((string)($body['thumbnailPath'] ?? ($body['thumbnail_path'] ?? '/images/kickcraft-one-card.png')));
if (!isLocalAssetPath($glbPath, 'models', ['glb'])) {
    jsonError('A valid local GLB model path is required', 400);
}
if ($thumbnailPath === '') {
    $thumbnailPath = '/images/kickcraft-one-card.png';
} elseif (!isLocalAssetPath($thumbnailPath, 'images', ['png', 'jpg', 'jpeg', 'webp'])) {
    jsonError('A valid local thumbnail path is required', 400);
}

$charmsEnabled = isset($body['charmsEnabled']) ? ($body['charmsEnabled'] ? 1 : 0) : (isset($body['charms_enabled']) ? ($body['charms_enabled'] ? 1 : 0) : 1);
$charmOffset = $body['charmOffset'] ?? ($body['charm_offset'] ?? null);
$charmScale = $body['charmScale'] ?? ($body['charm_scale'] ?? '1 1 1');
$charmDir = $body['charmDir'] ?? ($body['charm_dir'] ?? null);

$rawCategories = $body['categories'] ?? ['kickcraft'];
if (is_string($rawCategories)) {
    $categories = json_decode($rawCategories, true) ?: ['kickcraft'];
} elseif (is_array($rawCategories)) {
    $categories = !empty($rawCategories) ? $rawCategories : ['kickcraft'];
} else {
    $categories = ['kickcraft'];
}

$rawParts = $body['parts'] ?? [];
if (is_string($rawParts)) {
    $parts = json_decode($rawParts, true) ?: [];
} elseif (is_array($rawParts)) {
    $parts = $rawParts;
} else {
    $parts = [];
}

$rawColors = $body['colors'] ?? [];
if (is_string($rawColors)) {
    $colors = json_decode($rawColors, true) ?: [];
} elseif (is_array($rawColors)) {
    $colors = $rawColors;
} else {
    $colors = [];
}

$db = getDb();

$id = trim((string)($body['id'] ?? ''));
if ($id === '') {
    $baseSlug = strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $name), '-'));
    if ($baseSlug === '') {
        $baseSlug = 'shoe-' . time();
    }
    $id = $baseSlug;
    $counter = 1;
    $check = $db->prepare('SELECT id FROM shoes WHERE id = ?');
    while (true) {
        $check->execute([$id]);
        if (!$check->fetch()) {
            break;
        }
        $id = $baseSlug . '-' . $counter;
        $counter++;
    }
} else {
    $check = $db->prepare('SELECT id FROM shoes WHERE id = ?');
    $check->execute([$id]);
    if ($check->fetch()) {
        jsonError('Shoe with this ID already exists', 409);
    }
}

// Normalize glbPath if a temporary blob URL or filename was provided
if (str_starts_with($glbPath, 'blob:') || $glbPath === '') {
    $modelFileName = trim((string)($body['modelFileName'] ?? ''));
    if ($modelFileName !== '' && file_exists(__DIR__ . '/../../public/models/' . $modelFileName)) {
        $glbPath = '/models/' . $modelFileName;
    } elseif (file_exists(__DIR__ . '/../../public/models/' . $id . '.glb')) {
        $glbPath = '/models/' . $id . '.glb';
    } elseif (file_exists(__DIR__ . '/../../public/models/orange-sneaker.glb') && (stripos($name, 'orange') !== false || stripos($name, 'runner') !== false || stripos($id, 'orange') !== false || stripos($id, 'runner') !== false)) {
        $glbPath = '/models/orange-sneaker.glb';
    }
}

// Decode base64 thumbnail if uploaded via client FileReader
if (str_starts_with($thumbnailPath, 'data:image/')) {
    if (preg_match('/^data:image\/(\w+);base64,(.+)$/', $thumbnailPath, $matches)) {
        $ext = strtolower($matches[1]);
        if ($ext === 'jpeg') $ext = 'jpg';
        $imgBytes = base64_decode($matches[2]);
        if ($imgBytes !== false) {
            $imgDir = __DIR__ . '/../../public/images';
            if (!is_dir($imgDir)) {
                @mkdir($imgDir, 0777, true);
            }
            $imgFile = $id . '-card.' . $ext;
            @file_put_contents($imgDir . '/' . $imgFile, $imgBytes);
            $thumbnailPath = '/images/' . $imgFile;
        }
    }
}

$stmt = $db->prepare('INSERT INTO shoes (id, name, description, price, stock, status, glb_path, thumbnail_path, charms_enabled, charm_offset, charm_scale, charm_dir, categories, parts, colors) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$stmt->execute([
    $id,
    $name,
    $description,
    $price,
    $stock,
    $status,
    $glbPath,
    $thumbnailPath,
    $charmsEnabled,
    $charmOffset,
    $charmScale,
    $charmDir,
    json_encode($categories, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    json_encode($parts, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    json_encode($colors, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
]);

$fetch = $db->prepare('SELECT * FROM shoes WHERE id = ?');
$fetch->execute([$id]);
$shoe = $fetch->fetch();

jsonResponse([
    'success' => true,
    'shoe' => formatShoeRow($shoe),
], 201);

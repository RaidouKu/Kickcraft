<?php
// KickCraft Shared API Helpers

function jsonResponse($data, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError(string $message, int $statusCode = 400, $details = null): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    $payload = ['error' => $message];
    if ($details !== null) {
        $payload['details'] = $details;
    }
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function requireMethod(string $method): void {
    $currentMethod = $_SERVER['REQUEST_METHOD'] ?? '';
    if (strcasecmp($currentMethod, $method) !== 0) {
        jsonError('Method not allowed', 405);
    }
}

function requireAuth(): void {
    if (currentSessionUser() === null) {
        jsonError('Authentication required', 401);
    }
}

function requireAdmin(?PDO $pdo = null): void {
    $user = currentSessionUser($pdo);
    if ($user === null) {
        jsonError('Authentication required', 401);
    }
    if (($user['role'] ?? '') !== 'owner') {
        jsonError('Owner privileges required', 403);
    }
}

function requireSeller(?PDO $pdo = null): void {
    $user = currentSessionUser($pdo);
    if ($user === null || ($user['role'] ?? '') !== 'seller') {
        jsonError('Seller privileges required', 403);
    }
}

function requireApprovedSeller(?PDO $pdo = null): void {
    $user = currentSessionUser($pdo);
    if ($user === null || ($user['role'] ?? '') !== 'seller') {
        jsonError('Seller privileges required', 403);
    }
    if (empty($_SESSION['seller_status']) || $_SESSION['seller_status'] !== 'approved') {
        jsonError('Approved seller privileges required', 403);
    }
}

/** Return the current active user, refreshing role/email from the database. */
function currentSessionUser(?PDO $pdo = null): ?array {
    if (!isset($_SESSION['user_id'])) {
        return null;
    }

    // CLI endpoint checks inject a session and intentionally run without MySQL.
    if (PHP_SAPI === 'cli' && isset($_SESSION['user_role']) && $pdo === null) {
        $user = [
            'id' => (int)$_SESSION['user_id'],
            'name' => (string)($_SESSION['user_name'] ?? ''),
            'email' => (string)($_SESSION['user_email'] ?? ''),
            'role' => (string)$_SESSION['user_role'],
        ];
        if (isset($_SESSION['seller_status'])) {
            $user['seller_status'] = (string)$_SESSION['seller_status'];
        }
        return $user;
    }

    try {
        $db = $pdo ?? getDb();
        $stmt = $db->prepare(
            "SELECT id, name, email, role FROM users WHERE id = ? AND role IN ('owner', 'seller') AND deleted_at IS NULL AND permanently_deleted = 0"
        );
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        if (!$user) {
            session_unset();
            session_destroy();
            return null;
        }
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['user_role'] = (string)$user['role'];
        $_SESSION['user_email'] = (string)$user['email'];
        $_SESSION['user_name'] = (string)$user['name'];

        if ($user['role'] === 'seller') {
            $stmtSeller = $db->prepare(
                "SELECT status FROM seller_profiles WHERE user_id = ? AND deleted_at IS NULL AND permanently_deleted = 0"
            );
            $stmtSeller->execute([$user['id']]);
            $sellerProfile = $stmtSeller->fetch();
            $sellerStatus = $sellerProfile ? (string)$sellerProfile['status'] : null;
            $_SESSION['seller_status'] = $sellerStatus;
            $user['seller_status'] = $sellerStatus;
        } else {
            unset($_SESSION['seller_status']);
        }

        return $user;
    } catch (Throwable $e) {
        error_log('KickCraft auth lookup failed: ' . $e->getMessage());
        jsonError('Authentication service unavailable', 503);
    }
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw && php_sapi_name() === 'cli' && isset($GLOBALS['__JSON_BODY__'])) {
        $raw = is_string($GLOBALS['__JSON_BODY__']) ? $GLOBALS['__JSON_BODY__'] : json_encode($GLOBALS['__JSON_BODY__']);
    }
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function sanitizeString(?string $val): string {
    return trim(htmlspecialchars((string)($val ?? ''), ENT_QUOTES, 'UTF-8'));
}

function sanitizeEmail(?string $val): string {
    return trim(filter_var((string)($val ?? ''), FILTER_SANITIZE_EMAIL));
}

function validateEmail(?string $val) {
    $email = trim((string)($val ?? ''));
    return filter_var($email, FILTER_VALIDATE_EMAIL);
}

function isLocalAssetPath(string $path, string $directory, array $extensions): bool {
    if (!str_starts_with($path, "/{$directory}/")) {
        return false;
    }
    $extension = strtolower(pathinfo((string)(parse_url($path, PHP_URL_PATH) ?: ''), PATHINFO_EXTENSION));
    return in_array($extension, $extensions, true) && !str_contains($path, '..');
}

function formatShoeRow(array $row): array {
    $price = (float)($row['price'] ?? 0);
    $formattedPrice = '₱' . number_format($price, floor($price) == $price ? 0 : 2);

    $decodeJson = function($val) {
        if (is_array($val)) return $val;
        if (is_string($val) && trim($val) !== '') {
            $decoded = json_decode($val, true);
            if (is_array($decoded)) return $decoded;
        }
        return [];
    };

    return [
        'id' => (string)($row['id'] ?? ''),
        'name' => (string)($row['name'] ?? ''),
        'description' => (string)($row['description'] ?? ''),
        'price' => $price,
        'formattedPrice' => $formattedPrice,
        'stock' => (int)($row['stock'] ?? 0),
        'status' => (string)($row['status'] ?? 'available'),
        'glbPath' => (string)($row['glb_path'] ?? ''),
        'thumbnailPath' => (string)($row['thumbnail_path'] ?? '/images/kickcraft-one-card.png'),
        'charmsEnabled' => (bool)($row['charms_enabled'] ?? true),
        'charmOffset' => $row['charm_offset'] ?? null,
        'charmScale' => $row['charm_scale'] ?? '1 1 1',
        'charmDir' => $row['charm_dir'] ?? null,
        'categories' => $decodeJson($row['categories'] ?? null),
        'parts' => $decodeJson($row['parts'] ?? null),
        'colors' => $decodeJson($row['colors'] ?? null),
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
        'deletedAt' => $row['deleted_at'] ?? null,
        'permanentlyDeleted' => (int)($row['permanently_deleted'] ?? 0),
    ];
}

function generateReceiptId(?PDO $db = null): string {
    $year = date('Y');
    $candidate = "KC-{$year}-" . random_int(1000, 9999);
    if ($db) {
        for ($i = 0; $i < 10; $i++) {
            $stmt = $db->prepare('SELECT COUNT(*) FROM reservations WHERE id = ?');
            $stmt->execute([$candidate]);
            if ((int)$stmt->fetchColumn() === 0) {
                return $candidate;
            }
            $candidate = "KC-{$year}-" . random_int(1000, 9999);
        }
    }
    return $candidate;
}

function generateOrderId(?PDO $db = null): string {
    $year = date('Y');
    $candidate = "KCO-{$year}-" . random_int(1000, 9999);
    if ($db) {
        for ($i = 0; $i < 10; $i++) {
            $stmt = $db->prepare('SELECT COUNT(*) FROM orders WHERE id = ?');
            $stmt->execute([$candidate]);
            if ((int)$stmt->fetchColumn() === 0) {
                return $candidate;
            }
            $candidate = "KCO-{$year}-" . random_int(1000, 9999);
        }
    }
    return $candidate;
}

function formatReservationRow(array $row): array {
    $price = (float)($row['price'] ?? 0);
    $formattedPrice = '₱' . number_format($price, floor($price) == $price ? 0 : 2);

    $decodeJson = function($val) {
        if (is_array($val)) return $val;
        if (is_string($val) && trim($val) !== '') {
            $decoded = json_decode($val, true);
            if (is_array($decoded)) return $decoded;
        }
        return [];
    };

    $email = (string)($row['email'] ?? '');

    $rawStatus = (string)($row['status'] ?? 'pending');
    $statusMap = [
        'paid' => 'pending',
        'arrived' => 'ready',
    ];
    $status = $statusMap[$rawStatus] ?? $rawStatus;

    return [
        'id' => (string)($row['id'] ?? ''),
        'customerName' => (string)($row['customer_name'] ?? ''),
        'email' => $email,
        'customerEmail' => $email,
        'pickupDate' => (string)($row['pickup_date'] ?? ''),
        'shoeId' => (string)($row['shoe_id'] ?? ''),
        'shoeName' => (string)($row['shoe_name'] ?? ''),
        'size' => (int)($row['size'] ?? 0),
        'price' => $price,
        'formattedPrice' => $formattedPrice,
        'partColors' => $decodeJson($row['part_colors'] ?? null),
        'charmId' => (string)($row['charm_id'] ?? 'none'),
        'charmLabel' => (string)($row['charm_label'] ?? 'None'),
        'status' => $status,
        'notes' => (string)($row['notes'] ?? ''),
        'date' => $row['created_at'] ?? null,
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
    ];
}

function formatSellerRow(array $row): array {
    return [
        'id' => (int)($row['id'] ?? 0),
        'userId' => (int)($row['user_id'] ?? 0),
        'name' => (string)($row['name'] ?? ''),
        'email' => (string)($row['email'] ?? ''),
        'storeName' => (string)($row['store_name'] ?? ''),
        'storeDescription' => isset($row['store_description']) && $row['store_description'] !== null ? (string)$row['store_description'] : null,
        'status' => (string)($row['status'] ?? 'pending'),
        'adminNotes' => isset($row['admin_notes']) && $row['admin_notes'] !== null ? (string)$row['admin_notes'] : null,
        'approvedAt' => $row['approved_at'] ?? null,
        'createdAt' => $row['created_at'] ?? null,
    ];
}

function formatAiGenerationRow(array $row): array {
    return [
        'id' => (string)($row['id'] ?? ''),
        'sellerId' => (int)($row['seller_id'] ?? 0),
        'seller_id' => (int)($row['seller_id'] ?? 0),
        'sourceImagePath' => (string)($row['source_image_path'] ?? ''),
        'source_image_path' => (string)($row['source_image_path'] ?? ''),
        'status' => (string)($row['status'] ?? 'completed'),
        'resultGlbPath' => (string)($row['result_glb_path'] ?? ''),
        'result_glb_path' => (string)($row['result_glb_path'] ?? ''),
        'provider' => (string)($row['provider'] ?? 'huggingface_triposr'),
        'errorMessage' => isset($row['error_message']) && $row['error_message'] !== null ? (string)$row['error_message'] : null,
        'error_message' => isset($row['error_message']) && $row['error_message'] !== null ? (string)$row['error_message'] : null,
        'startedAt' => $row['started_at'] ?? null,
        'started_at' => $row['started_at'] ?? null,
        'completedAt' => $row['completed_at'] ?? null,
        'completed_at' => $row['completed_at'] ?? null,
        'createdAt' => $row['created_at'] ?? null,
        'created_at' => $row['created_at'] ?? null,
    ];
}

function formatProductRow(array $row): array {
    $price = (float)($row['price'] ?? 0);
    $formattedPrice = '₱' . number_format($price, floor($price) == $price ? 0 : 2);

    $decodeJson = function($val) {
        if (is_array($val)) return $val;
        if (is_string($val) && trim($val) !== '') {
            $decoded = json_decode($val, true);
            if (is_array($decoded)) return $decoded;
        }
        return [];
    };

    $desc = isset($row['description']) && $row['description'] !== null ? (string)$row['description'] : null;
    $extractedCategory = null;
    if ($desc !== null && preg_match('/\[tag:\s*([a-zA-Z0-9_\-]+)\]/i', $desc, $m)) {
        $extractedCategory = strtolower(trim($m[1]));
        $desc = trim(preg_replace('/\[tag:\s*[a-zA-Z0-9_\-]+\]/i', '', $desc));
        if ($desc === '') $desc = null;
    }

    $categories = [];
    $rawCategory = trim((string)($row['category'] ?? ''));
    if ($rawCategory !== '') {
        $categories[] = strtolower($rawCategory);
    }
    if ($extractedCategory !== null && $extractedCategory !== '') {
        $categories[] = $extractedCategory;
    }
    $base = strtolower((string)($row['base_shoe_id'] ?? ''));
    if ($base === 'kickcraft-one') {
        $categories[] = 'kickcraft';
        $categories[] = 'sneakers';
    } elseif ($base === 'nike-air-max') {
        $categories[] = 'sneakers';
        $categories[] = 'running';
        $categories[] = 'fashion';
    } elseif ($base === 'nike-dunk') {
        $categories[] = 'sneakers';
        $categories[] = 'basketball';
        $categories[] = 'fashion';
    }
    $combined = strtolower(($row['name'] ?? '') . ' ' . ($row['description'] ?? ''));
    if (strpos($combined, 'basketball') !== false || strpos($combined, 'court') !== false || strpos($combined, 'hoop') !== false) {
        $categories[] = 'basketball';
    }
    if (strpos($combined, 'running') !== false || strpos($combined, 'runner') !== false || strpos($combined, 'stride') !== false || strpos($combined, 'pace') !== false) {
        $categories[] = 'running';
    }
    if (strpos($combined, 'fashion') !== false || strpos($combined, 'luxe') !== false || strpos($combined, 'lifestyle') !== false) {
        $categories[] = 'fashion';
    }
    if (strpos($combined, 'kickcraft') !== false) {
        $categories[] = 'kickcraft';
    }
    $categories[] = 'sneakers';
    $categories = array_values(array_unique(array_filter($categories)));
    $primaryCategory = $categories[0] ?? 'sneakers';

    return [
        'id' => (string)($row['id'] ?? ''),
        'sellerId' => (int)($row['seller_id'] ?? 0),
        'seller_id' => (int)($row['seller_id'] ?? 0),
        'storeName' => isset($row['store_name']) && $row['store_name'] !== null ? (string)$row['store_name'] : null,
        'store_name' => isset($row['store_name']) && $row['store_name'] !== null ? (string)$row['store_name'] : null,
        'name' => (string)($row['name'] ?? ''),
        'description' => $desc,
        'category' => $primaryCategory,
        'categories' => $categories,
        'price' => $price,
        'formattedPrice' => $formattedPrice,
        'stock' => (int)($row['stock'] ?? 0),
        'creationMethod' => (string)($row['creation_method'] ?? 'upload'),
        'creation_method' => (string)($row['creation_method'] ?? 'upload'),
        'glbPath' => isset($row['glb_path']) && $row['glb_path'] !== null ? (string)$row['glb_path'] : null,
        'glb_path' => isset($row['glb_path']) && $row['glb_path'] !== null ? (string)$row['glb_path'] : null,
        'thumbnailPath' => isset($row['thumbnail_path']) && $row['thumbnail_path'] !== null ? (string)$row['thumbnail_path'] : null,
        'thumbnail_path' => isset($row['thumbnail_path']) && $row['thumbnail_path'] !== null ? (string)$row['thumbnail_path'] : null,
        'baseShoeId' => isset($row['base_shoe_id']) && $row['base_shoe_id'] !== null ? (string)$row['base_shoe_id'] : null,
        'base_shoe_id' => isset($row['base_shoe_id']) && $row['base_shoe_id'] !== null ? (string)$row['base_shoe_id'] : null,
        'partColors' => $decodeJson($row['part_colors'] ?? null),
        'part_colors' => $decodeJson($row['part_colors'] ?? null),
        'charmId' => (string)($row['charm_id'] ?? 'none'),
        'charm_id' => (string)($row['charm_id'] ?? 'none'),
        'meshMap' => $decodeJson($row['mesh_map'] ?? null),
        'mesh_map' => $decodeJson($row['mesh_map'] ?? null),
        'sizesAvailable' => $decodeJson($row['sizes_available'] ?? null),
        'sizes_available' => $decodeJson($row['sizes_available'] ?? null),
        'status' => (string)($row['status'] ?? 'draft'),
        'adminNotes' => isset($row['admin_notes']) && $row['admin_notes'] !== null ? (string)$row['admin_notes'] : null,
        'approvedAt' => $row['approved_at'] ?? null,
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
    ];
}

function formatOrderRow(array $row): array {
    $unitPrice = (float)($row['unit_price'] ?? 0);
    $totalPrice = (float)($row['total_price'] ?? 0);
    $formattedUnitPrice = '₱' . number_format($unitPrice, floor($unitPrice) == $unitPrice ? 0 : 2);
    $formattedTotalPrice = '₱' . number_format($totalPrice, floor($totalPrice) == $totalPrice ? 0 : 2);

    $decodeJson = function($val) {
        if (is_array($val)) return $val;
        if (is_string($val) && trim($val) !== '') {
            $decoded = json_decode($val, true);
            if (is_array($decoded)) return $decoded;
        }
        return [];
    };

    return [
        'id' => (string)($row['id'] ?? ''),
        'sellerId' => (int)($row['seller_id'] ?? 0),
        'seller_id' => (int)($row['seller_id'] ?? 0),
        'productId' => (string)($row['product_id'] ?? ''),
        'product_id' => (string)($row['product_id'] ?? ''),
        'buyerName' => (string)($row['buyer_name'] ?? ''),
        'buyer_name' => (string)($row['buyer_name'] ?? ''),
        'buyerEmail' => (string)($row['buyer_email'] ?? ''),
        'buyer_email' => (string)($row['buyer_email'] ?? ''),
        'customColors' => $decodeJson($row['custom_colors'] ?? null),
        'custom_colors' => $decodeJson($row['custom_colors'] ?? null),
        'customCharm' => (string)($row['custom_charm'] ?? 'none'),
        'custom_charm' => (string)($row['custom_charm'] ?? 'none'),
        'unitPrice' => $unitPrice,
        'unit_price' => $unitPrice,
        'formattedUnitPrice' => $formattedUnitPrice,
        'totalPrice' => $totalPrice,
        'total_price' => $totalPrice,
        'formattedTotalPrice' => $formattedTotalPrice,
        'productName' => (string)($row['product_name'] ?? ''),
        'product_name' => (string)($row['product_name'] ?? ''),
        'productThumbnail' => (string)($row['product_thumbnail'] ?? ''),
        'product_thumbnail' => (string)($row['product_thumbnail'] ?? ''),
        'sellerStoreName' => (string)($row['seller_store_name'] ?? ''),
        'seller_store_name' => (string)($row['seller_store_name'] ?? ''),
        'status' => (string)($row['status'] ?? 'pending'),
        'pickupDate' => (string)($row['pickup_date'] ?? ''),
        'pickup_date' => (string)($row['pickup_date'] ?? ''),
        'notes' => isset($row['notes']) && $row['notes'] !== null ? (string)$row['notes'] : null,
        'createdAt' => $row['created_at'] ?? null,
        'created_at' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
        'deletedAt' => $row['deleted_at'] ?? null,
        'deleted_at' => $row['deleted_at'] ?? null,
        'permanentlyDeleted' => (int)($row['permanently_deleted'] ?? 0),
        'permanently_deleted' => (int)($row['permanently_deleted'] ?? 0),
    ];
}




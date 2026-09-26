<?php
// KickCraft Pickup Reservation Creation Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$body = getJsonBody();

// 1. Server-side input validations
$customerName = sanitizeString($body['customerName'] ?? '');
if (strlen($customerName) < 2) {
    jsonError('Customer name must be at least 2 characters', 400);
}

$email = validateEmail($body['email'] ?? '');
if (!$email) {
    jsonError('Valid email address is required', 400);
}

$pickupDate = trim((string)($body['pickupDate'] ?? ''));
$dateObject = DateTime::createFromFormat('!Y-m-d', $pickupDate);
$dateErrors = DateTime::getLastErrors();
$hasDateErrors = is_array($dateErrors) && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0);
if (!$dateObject || $hasDateErrors || $dateObject->format('Y-m-d') !== $pickupDate) {
    jsonError('Valid pickup date (YYYY-MM-DD) is required', 400);
}

$today = new DateTimeImmutable('today');
$pickup = new DateTimeImmutable($pickupDate);
if ($pickup < $today->modify('+7 days') || $pickup > $today->modify('+365 days')) {
    jsonError('Pickup date must be between 1 week and 1 year from today', 400);
}

$shoeId = trim((string)($body['shoeId'] ?? ''));
if ($shoeId === '') {
    jsonError('Shoe ID is required', 400);
}

$rawSize = $body['size'] ?? null;
$parsedSize = filter_var($rawSize, FILTER_VALIDATE_INT, FILTER_NULL_ON_FAILURE);
if ($parsedSize === null || $parsedSize < 5 || $parsedSize > 15) {
    jsonError('Valid shoe size between 5 and 15 is required', 400);
}
$size = $parsedSize;

$charmId = strtolower(trim((string)($body['charmId'] ?? 'none'))) ?: 'none';
$charmLabels = ['none' => 'None', 'star' => 'Star', 'lightning' => 'Lightning', 'k-tag' => 'K tag'];
if (!array_key_exists($charmId, $charmLabels)) {
    jsonError('Unsupported charm selection', 400);
}
$partColors = $body['partColors'] ?? [];
if (!is_array($partColors) || count($partColors) > 16) {
    jsonError('Invalid customized part colors', 400);
}

// 4. Database Transaction & Stock / Price Integrity
$db = getDb();
$db->beginTransaction();

try {
    // Select shoe price & stock directly from database with row lock
    $stmtShoe = $db->prepare('SELECT id, name, price, stock, status, parts, colors, charms_enabled FROM shoes WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0 FOR UPDATE');
    $stmtShoe->execute([$shoeId]);
    $shoe = $stmtShoe->fetch();

    if (!$shoe || (int)$shoe['stock'] <= 0 || !in_array($shoe['status'], ['available', 'in_stock'], true)) {
        $db->rollBack();
        jsonError('Shoe is out of stock or unavailable', 400);
    }

    $price = (float)$shoe['price'];
    $shoeName = (string)$shoe['name'];

    if (!(bool)$shoe['charms_enabled'] && $charmId !== 'none') {
        $db->rollBack();
        jsonError('This shoe does not support charms', 400);
    }

    $shoeParts = json_decode((string)$shoe['parts'], true) ?: [];
    $shoeColors = json_decode((string)$shoe['colors'], true) ?: [];
    $allowedParts = array_fill_keys(array_filter(array_column($shoeParts, 'id'), 'is_string'), true);
    $allowedColors = [];
    foreach ($shoeColors as $color) {
        $value = strtolower((string)($color['value'] ?? ''));
        if (preg_match('/^#[0-9a-f]{6}$/', $value)) {
            $allowedColors[$value] = (string)($color['name'] ?? $value);
        }
    }

    $validatedColors = [];
    foreach ($partColors as $partId => $color) {
        if (!is_string($partId) || !isset($allowedParts[$partId]) || !is_array($color)) {
            $db->rollBack();
            jsonError('Customization contains an unknown shoe part', 400);
        }
        $value = strtolower(trim((string)($color['value'] ?? '')));
        if (!isset($allowedColors[$value])) {
            $db->rollBack();
            jsonError('Customization contains an unsupported color', 400);
        }
        $validatedColors[$partId] = ['name' => $allowedColors[$value], 'value' => $value];
    }
    $partColorsJson = json_encode($validatedColors, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($partColorsJson === false || strlen($partColorsJson) > 8192) {
        $db->rollBack();
        jsonError('Customized part colors are too large', 400);
    }

    // Generate unique receipt ID (KC-YYYY-XXXX)
    $reservationId = generateReceiptId($db);

    // Insert reservation record with prepared statement
    $stmtInsert = $db->prepare('INSERT INTO reservations (id, customer_name, email, pickup_date, shoe_id, shoe_name, size, price, part_colors, charm_id, charm_label, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmtInsert->execute([
        $reservationId,
        $customerName,
        $email,
        $pickupDate,
        $shoeId,
        $shoeName,
        $size,
        $price,
        $partColorsJson,
        $charmId,
        $charmLabels[$charmId],
        'pending',
        '',
    ]);

    // Decrement stock; mark out_of_stock if stock <= 0
    $stmtStock = $db->prepare("UPDATE shoes SET stock = stock - 1, status = CASE WHEN stock - 1 <= 0 THEN 'out_of_stock' ELSE status END WHERE id = ?");
    $stmtStock->execute([$shoeId]);

    $db->commit();

    $now = date('Y-m-d H:i:s');
    $reservationRow = [
        'id' => $reservationId,
        'customer_name' => $customerName,
        'email' => $email,
        'pickup_date' => $pickupDate,
        'shoe_id' => $shoeId,
        'shoe_name' => $shoeName,
        'size' => $size,
        'price' => $price,
        'part_colors' => $partColorsJson,
        'charm_id' => $charmId,
        'charm_label' => $charmLabels[$charmId],
        'status' => 'pending',
        'notes' => '',
        'created_at' => $now,
        'updated_at' => $now,
    ];

    jsonResponse([
        'success' => true,
        'reservation' => formatReservationRow($reservationRow),
    ], 201);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    error_log('KickCraft reservation create failed: ' . $e->getMessage());
    jsonError('Failed to create reservation. Please try again.', 500);
}

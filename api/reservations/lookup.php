<?php
// Public lookup using both receipt reference and reservation email.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$body = getJsonBody();
$id = strtoupper(trim((string)($body['id'] ?? '')));
$email = validateEmail($body['email'] ?? '');

if (!preg_match('/^KC-\d{4}-\d{4}$/', $id) || !$email) {
    jsonError('Enter a valid receipt reference and email address', 400);
}

$db = getDb();
$stmt = $db->prepare(
    'SELECT * FROM reservations WHERE id = ? AND LOWER(email) = LOWER(?) AND deleted_at IS NULL AND permanently_deleted = 0 LIMIT 1'
);
$stmt->execute([$id, $email]);
$reservation = $stmt->fetch();

if (!$reservation) {
    jsonError('No reservation matched those details', 404);
}

jsonResponse(['reservation' => formatReservationRow($reservation)]);

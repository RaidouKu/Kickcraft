<?php
// Guest cancellation verified by receipt reference and reservation email.

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
$db->beginTransaction();

try {
    $stmt = $db->prepare(
        'SELECT id, shoe_id, status FROM reservations WHERE id = ? AND LOWER(email) = LOWER(?) AND deleted_at IS NULL AND permanently_deleted = 0 FOR UPDATE'
    );
    $stmt->execute([$id, $email]);
    $reservation = $stmt->fetch();

    if (!$reservation) {
        $db->rollBack();
        jsonError('No reservation matched those details', 404);
    }
    if ($reservation['status'] !== 'pending') {
        $db->rollBack();
        jsonError('Only pending reservations can be cancelled', 409);
    }

    $update = $db->prepare("UPDATE reservations SET status = 'cancelled', updated_at = NOW() WHERE id = ? AND status = 'pending'");
    $update->execute([$id]);
    $stock = $db->prepare("UPDATE shoes SET stock = stock + 1, status = CASE WHEN status = 'out_of_stock' THEN 'available' ELSE status END WHERE id = ?");
    $stock->execute([$reservation['shoe_id']]);
    $db->commit();

    jsonResponse(['success' => true, 'reservation' => ['id' => $id, 'status' => 'cancelled']]);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    error_log('KickCraft guest cancellation failed: ' . $e->getMessage());
    jsonError('Failed to cancel reservation. Please try again.', 500);
}

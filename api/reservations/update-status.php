<?php
// KickCraft Reservation Status Update Endpoint (Owner/Admin)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
requireAdmin();

$body = getJsonBody();
$id = trim((string)($body['id'] ?? ''));
$status = strtolower(trim((string)($body['status'] ?? '')));
$allowedStatuses = ['pending', 'approved', 'ready', 'completed', 'cancelled'];

if ($id === '') {
    jsonError('Reservation ID is required', 400);
}
if (!in_array($status, $allowedStatuses, true)) {
    jsonError("Invalid status: must be one of 'pending', 'approved', 'ready', 'completed', 'cancelled'", 400);
}

$notes = sanitizeString($body['notes'] ?? '');
$db = getDb();

// Keep transitions explicit. A cancelled or completed record cannot be silently reopened.
$transitions = [
    'pending' => ['pending', 'approved', 'cancelled'],
    'approved' => ['approved', 'ready', 'cancelled'],
    'ready' => ['ready', 'completed', 'cancelled'],
    'completed' => ['completed'],
    'cancelled' => ['cancelled'],
];

try {
    $db->beginTransaction();

    $stmtCheck = $db->prepare(
        'SELECT id, email, status, shoe_id, notes FROM reservations WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0 FOR UPDATE'
    );
    $stmtCheck->execute([$id]);
    $reservation = $stmtCheck->fetch();
    if (!$reservation) {
        $db->rollBack();
        jsonError('Reservation not found', 404);
    }

    $previousStatus = (string)$reservation['status'];
    if (!in_array($status, $transitions[$previousStatus] ?? [], true)) {
        $db->rollBack();
        jsonError("Cannot change reservation from {$previousStatus} to {$status}", 409);
    }

    $updatedNotes = array_key_exists('notes', $body) ? $notes : (string)($reservation['notes'] ?? '');
    $stmtUpdate = $db->prepare('UPDATE reservations SET status = ?, notes = ?, updated_at = NOW() WHERE id = ?');
    $stmtUpdate->execute([$status, $updatedNotes, $id]);

    // One cancellation restores one reserved unit; the guarded transition prevents double-restocking.
    if ($previousStatus !== 'cancelled' && $status === 'cancelled') {
        $shoeId = (string)($reservation['shoe_id'] ?? '');
        if ($shoeId !== '') {
            $stmtStock = $db->prepare("UPDATE shoes SET stock = stock + 1, status = CASE WHEN stock + 1 > 0 AND status = 'out_of_stock' THEN 'available' ELSE status END WHERE id = ?");
            $stmtStock->execute([$shoeId]);
        }
    }

    $db->commit();
    jsonResponse([
        'success' => true,
        'id' => $id,
        'status' => $status,
        'notes' => $updatedNotes,
        'reservation' => ['id' => $id, 'status' => $status, 'notes' => $updatedNotes],
    ]);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    error_log('KickCraft reservation status update failed: ' . $e->getMessage());
    jsonError('Failed to update reservation. Please try again.', 500);
}

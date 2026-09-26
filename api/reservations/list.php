<?php
// KickCraft Reservations List Endpoint (Owner/Admin)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');
requireAdmin();

$db = getDb();

$where = ['1=1'];
$where[] = '(deleted_at IS NULL AND permanently_deleted = 0)';
$params = [];

// Optional filter by status
$status = trim((string)($_GET['status'] ?? ''));
if ($status !== '' && $status !== 'all') {
    $where[] = 'status = ?';
    $params[] = $status;
}

// Optional keyword search matching id, customer_name, email, or shoe_name
$search = trim((string)($_GET['search'] ?? ''));
if ($search !== '') {
    $where[] = '(id LIKE ? OR customer_name LIKE ? OR email LIKE ? OR shoe_name LIKE ?)';
    $term = "%{$search}%";
    $params[] = $term;
    $params[] = $term;
    $params[] = $term;
    $params[] = $term;
}

$sql = 'SELECT * FROM reservations WHERE ' . implode(' AND ', $where) . ' ORDER BY created_at DESC';
$stmt = $db->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$reservations = array_map('formatReservationRow', $rows);

jsonResponse(['reservations' => $reservations]);

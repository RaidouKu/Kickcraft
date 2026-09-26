<?php
// KickCraft User Management - List Users Endpoint (Admin Only)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');
requireAdmin();

$includeArchived = isset($_GET['include_archived']) && (string)$_GET['include_archived'] === '1';

$db = getDb();

if ($includeArchived) {
    $stmt = $db->prepare("SELECT id, name, email, role, created_at, deleted_at, permanently_deleted FROM users WHERE role = 'owner' AND permanently_deleted = 0 ORDER BY id ASC");
} else {
    $stmt = $db->prepare("SELECT id, name, email, role, created_at, deleted_at, permanently_deleted FROM users WHERE role = 'owner' AND deleted_at IS NULL AND permanently_deleted = 0 ORDER BY id ASC");
}

$stmt->execute();
$users = $stmt->fetchAll();

$formatted = array_map(function ($u) {
    return [
        'id' => (int)$u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'role' => $u['role'],
        'created_at' => $u['created_at'],
        'deleted_at' => $u['deleted_at'],
        'permanently_deleted' => (int)$u['permanently_deleted'],
    ];
}, $users);

jsonResponse(['users' => $formatted]);

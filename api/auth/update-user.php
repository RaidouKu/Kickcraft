<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
requireAdmin();

$body = getJsonBody();
$id = isset($body['id']) ? (int)$body['id'] : 0;
$name = sanitizeString($body['name'] ?? '');
$email = validateEmail($body['email'] ?? '');
$password = isset($body['password']) ? trim((string)$body['password']) : '';

if ($id <= 0) {
    jsonError('A valid user ID is required', 400);
}

if (mb_strlen($name) < 2) {
    jsonError('Name must be at least 2 characters long', 400);
}

if (!$email) {
    jsonError('A valid email address is required', 400);
}

if ($password !== '' && strlen($password) < 6) {
    jsonError('Password must be at least 6 characters long if changed', 400);
}

$db = getDb();

// Verify user exists and is not permanently deleted
$userStmt = $db->prepare('SELECT id, role FROM users WHERE id = ? AND permanently_deleted = 0');
$userStmt->execute([$id]);
$existingUser = $userStmt->fetch();
if (!$existingUser) {
    jsonError('User not found or has been permanently deleted', 404);
}

// Ensure email uniqueness against other users
$checkStmt = $db->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
$checkStmt->execute([$email, $id]);
if ($checkStmt->fetch()) {
    jsonError('Another account with this email address already exists', 409);
}

if ($password !== '') {
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $updateStmt = $db->prepare("UPDATE users SET name = ?, email = ?, role = 'owner', password_hash = ? WHERE id = ? AND permanently_deleted = 0");
    $updateStmt->execute([$name, $email, $passwordHash, $id]);
} else {
    $updateStmt = $db->prepare("UPDATE users SET name = ?, email = ?, role = 'owner' WHERE id = ? AND permanently_deleted = 0");
    $updateStmt->execute([$name, $email, $id]);
}

// Synchronize session if the updated user is the currently logged in owner
if (isset($_SESSION['user_id']) && (int)$_SESSION['user_id'] === $id) {
    $_SESSION['user_name'] = $name;
    $_SESSION['user_email'] = $email;
    $_SESSION['user_role'] = 'owner';
}

jsonResponse([
    'success' => true,
    'message' => 'User account updated successfully',
    'user' => [
        'id' => $id,
        'name' => $name,
        'email' => $email,
        'role' => 'owner',
    ],
]);

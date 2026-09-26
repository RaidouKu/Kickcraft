<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
requireAdmin();

$body = getJsonBody();
$name = sanitizeString($body['name'] ?? '');
$email = validateEmail($body['email'] ?? '');
$password = $body['password'] ?? '';

if (mb_strlen($name) < 2) {
    jsonError('Name must be at least 2 characters long', 400);
}

if (!$email) {
    jsonError('A valid email address is required', 400);
}

if (strlen($password) < 6) {
    jsonError('Password must be at least 6 characters long', 400);
}

$db = getDb();

// Ensure email uniqueness
$checkStmt = $db->prepare('SELECT id FROM users WHERE email = ?');
$checkStmt->execute([$email]);
if ($checkStmt->fetch()) {
    jsonError('An account with this email address already exists', 409);
}

$passwordHash = password_hash($password, PASSWORD_BCRYPT);

$insertStmt = $db->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
$insertStmt->execute([$name, $email, $passwordHash, 'owner']);

$newId = (int)$db->lastInsertId();

jsonResponse([
    'success' => true,
    'message' => 'User account created successfully',
    'user' => [
        'id' => $newId,
        'name' => $name,
        'email' => $email,
        'role' => 'owner',
    ],
], 201);

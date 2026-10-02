<?php
// KickCraft Authentication - Seller Registration Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$body = getJsonBody();
$name = trim((string)($body['name'] ?? ''));
$email = trim((string)($body['email'] ?? ''));
$password = (string)($body['password'] ?? '');
$confirmPassword = (string)($body['confirmPassword'] ?? '');
$storeName = trim((string)($body['storeName'] ?? ''));
$storeDescription = isset($body['storeDescription']) ? trim((string)$body['storeDescription']) : null;

// Validate name (required, 2-255 chars, trimmed)
$nameLen = strlen($name);
if ($name === '' || $nameLen < 2 || $nameLen > 255) {
    jsonError('Name must be between 2 and 255 characters', 400);
}

// Validate email (required, valid format)
if ($email === '' || !validateEmail($email)) {
    jsonError('Valid email address is required', 400);
}

// Validate password (required, min 8 chars)
if ($password === '' || strlen($password) < 8) {
    jsonError('Password must be at least 8 characters', 400);
}

// Validate confirmPassword (must match password)
if ($password !== $confirmPassword) {
    jsonError('Passwords do not match', 400);
}

// Validate storeName (required, 2-255 chars, trimmed)
$storeNameLen = strlen($storeName);
if ($storeName === '' || $storeNameLen < 2 || $storeNameLen > 255) {
    jsonError('Store name must be between 2 and 255 characters', 400);
}

// Validate storeDescription (optional, max 1000 chars)
if ($storeDescription !== null && strlen($storeDescription) > 1000) {
    jsonError('Store description must not exceed 1000 characters', 400);
}

$db = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : getDb());

// Check email uniqueness (case-insensitive, active users only)
$stmt = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL AND permanently_deleted = 0');
$stmt->execute([$email]);
if ($stmt->fetch()) {
    jsonError('Email already registered', 409);
}

// Hash password
$passwordHash = password_hash($password, PASSWORD_DEFAULT);

try {
    $db->beginTransaction();

    $userStmt = $db->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    $userStmt->execute([$name, $email, $passwordHash, 'seller']);
    $userId = (int)$db->lastInsertId();

    $descValue = ($storeDescription !== null && $storeDescription !== '') ? $storeDescription : null;
    $profileStmt = $db->prepare('INSERT INTO seller_profiles (user_id, store_name, store_description, status) VALUES (?, ?, ?, ?)');
    $profileStmt->execute([$userId, $storeName, $descValue, 'pending']);

    $db->commit();
} catch (Throwable $e) {
    try {
        $db->rollBack();
    } catch (Throwable) {
        // Ignored
    }
    error_log('Seller registration error: ' . $e->getMessage());
    jsonError('Registration failed. Please try again later.', 500);
}

jsonResponse([
    'success' => true,
    'message' => 'Seller application submitted. Your account is under review.',
], 201);

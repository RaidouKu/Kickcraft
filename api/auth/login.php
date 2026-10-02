<?php
// KickCraft Authentication - Login Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');

$body = getJsonBody();
$email = trim($body['email'] ?? '');
$password = (string)($body['password'] ?? '');

if ($email === '' || $password === '') {
    jsonError('Email and password are required', 400);
}

$db = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : getDb());
$stmt = $db->prepare("SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND role IN ('owner', 'seller') AND deleted_at IS NULL AND permanently_deleted = 0");
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    jsonError('Invalid email or password', 401);
}

session_regenerate_id(true);
$_SESSION['user_id'] = (int)$user['id'];
$_SESSION['user_name'] = $user['name'];
$_SESSION['user_email'] = $user['email'];
$_SESSION['user_role'] = $user['role'];

$response = [
    'success' => true,
    'user' => [
        'id' => (int)$user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
    ],
];

if ($user['role'] === 'seller') {
    $stmtProfile = $db->prepare("SELECT store_name, status, store_description FROM seller_profiles WHERE user_id = ? AND deleted_at IS NULL AND permanently_deleted = 0");
    $stmtProfile->execute([$user['id']]);
    $sellerProfile = $stmtProfile->fetch();

    $sellerStatus = $sellerProfile ? (string)$sellerProfile['status'] : 'pending';
    $storeName = $sellerProfile ? (string)$sellerProfile['store_name'] : '';
    $storeDescription = $sellerProfile ? ($sellerProfile['store_description'] ?? null) : null;

    $_SESSION['seller_status'] = $sellerStatus;
    $_SESSION['seller_store_name'] = $storeName;
    $_SESSION['seller_store_description'] = $storeDescription;

    $response['sellerProfile'] = [
        'storeName' => $storeName,
        'status' => $sellerStatus,
        'storeDescription' => $storeDescription,
    ];
} else {
    unset($_SESSION['seller_status']);
    unset($_SESSION['seller_store_name']);
    unset($_SESSION['seller_store_description']);
}

jsonResponse($response);

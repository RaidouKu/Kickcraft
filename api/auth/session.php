<?php
// KickCraft Authentication - Session Status Endpoint

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');

$db = $GLOBALS['__TEST_PDO__'] ?? (isset($pdo) && $pdo instanceof PDO ? $pdo : null);

// currentSessionUser() uses prepare() with a prepared statement and checks deleted_at IS NULL and permanently_deleted = 0.
if (isset($_SESSION['user_id']) && ($user = currentSessionUser($db))) {
    $response = [
        'authenticated' => true,
        'user' => [
            'id' => (int)$user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
        ],
    ];

    if ($user['role'] === 'seller') {
        $sellerProfile = null;
        if ($db !== null || PHP_SAPI !== 'cli') {
            try {
                $dbConn = $db ?? getDb();
                $stmt = $dbConn->prepare("SELECT store_name, status, store_description FROM seller_profiles WHERE user_id = ? AND deleted_at IS NULL AND permanently_deleted = 0");
                $stmt->execute([$user['id']]);
                $sellerProfile = $stmt->fetch();
            } catch (Throwable $e) {
                error_log('Seller profile lookup failed: ' . $e->getMessage());
            }
        }

        $status = $sellerProfile ? (string)$sellerProfile['status'] : ($user['seller_status'] ?? $_SESSION['seller_status'] ?? 'pending');
        $storeName = $sellerProfile ? (string)$sellerProfile['store_name'] : ($_SESSION['seller_store_name'] ?? '');
        $storeDescription = $sellerProfile ? ($sellerProfile['store_description'] ?? null) : ($_SESSION['seller_store_description'] ?? null);

        $response['sellerProfile'] = [
            'storeName' => $storeName,
            'status' => $status,
            'storeDescription' => $storeDescription,
        ];
    }

    jsonResponse($response);
}

jsonResponse(['authenticated' => false]);

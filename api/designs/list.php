<?php
/**
 * GET api/designs/list.php
 * Public: returns approved + featured designs.
 * Admin (?include_all=1): returns all designs for moderation.
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$pdo = getDbConnection();
$includeAll = isset($_GET['include_all']) && $_GET['include_all'] === '1';

if ($includeAll) {
    // Admin-only: verify owner session
    $user = currentSessionUser($pdo);
    if (!$user || $user['role'] !== 'owner') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required to view all designs.']);
        exit;
    }
    $stmt = $pdo->prepare(
        'SELECT * FROM community_designs WHERE deleted_at IS NULL AND permanently_deleted = 0 ORDER BY created_at DESC'
    );
    $stmt->execute();
} else {
    // Public: approved + featured only
    $stmt = $pdo->prepare(
        "SELECT * FROM community_designs WHERE status IN ('approved', 'featured') AND deleted_at IS NULL AND permanently_deleted = 0 ORDER BY FIELD(status, 'featured', 'approved'), created_at DESC"
    );
    $stmt->execute();
}

$designs = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $row['partColors']    = json_decode($row['part_colors'], true);
    $row['designerName']  = $row['designer_name'];
    $row['designerEmail'] = $row['designer_email'];
    $row['designName']    = $row['design_name'];
    $row['shoeName']      = $row['shoe_name'];
    $row['shoeId']        = $row['shoe_id'];
    $row['charmId']       = $row['charm_id'];
    $row['charmLabel']    = $row['charm_label'];
    $row['adminNotes']    = $row['admin_notes'];
    $row['featuredAt']    = $row['featured_at'];
    $row['createdAt']     = $row['created_at'];
    $row['updatedAt']     = $row['updated_at'];
    $designs[] = $row;
}

echo json_encode(['designs' => $designs]);

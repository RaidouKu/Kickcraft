<?php
/**
 * POST api/designs/review.php
 * Admin-only: approve, reject, or feature a community design.
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$pdo = getDbConnection();
requireAdmin($pdo);

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$designId = trim($input['id'] ?? '');
$newStatus = trim($input['status'] ?? '');

if (!$designId) {
    http_response_code(400);
    echo json_encode(['error' => 'Design ID is required.']);
    exit;
}

$validStatuses = ['approved', 'rejected', 'featured', 'pending'];
if (!in_array($newStatus, $validStatuses, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid status. Must be one of: ' . implode(', ', $validStatuses)]);
    exit;
}

// ── Fetch current design ──
$fetchStmt = $pdo->prepare('SELECT * FROM community_designs WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
$fetchStmt->execute([$designId]);
$design = $fetchStmt->fetch(PDO::FETCH_ASSOC);

if (!$design) {
    http_response_code(404);
    echo json_encode(['error' => 'Design not found.']);
    exit;
}

// ── Determine admin notes (preserve existing if not provided) ──
$notes = array_key_exists('notes', $input) ? (trim((string)$input['notes']) ?: null) : $design['admin_notes'];

// ── Update status ──
$featuredAt = $newStatus === 'featured' ? date('Y-m-d H:i:s') : $design['featured_at'];
if ($newStatus !== 'featured' && $design['status'] === 'featured') {
    $featuredAt = null;
}

$updateStmt = $pdo->prepare(
    'UPDATE community_designs SET status = ?, admin_notes = ?, featured_at = ?, updated_at = NOW() WHERE id = ?'
);
$updateStmt->execute([$newStatus, $notes, $featuredAt, $designId]);

// ── Return updated design ──
$fetchStmt->execute([$designId]);
$updated = $fetchStmt->fetch(PDO::FETCH_ASSOC);

$updated['partColors']    = json_decode($updated['part_colors'], true);
$updated['designerName']  = $updated['designer_name'];
$updated['designerEmail'] = $updated['designer_email'];
$updated['designName']    = $updated['design_name'];
$updated['shoeName']      = $updated['shoe_name'];
$updated['shoeId']        = $updated['shoe_id'];
$updated['charmId']       = $updated['charm_id'];
$updated['charmLabel']    = $updated['charm_label'];
$updated['adminNotes']    = $updated['admin_notes'];
$updated['featuredAt']    = $updated['featured_at'];
$updated['createdAt']     = $updated['created_at'];
$updated['updatedAt']     = $updated['updated_at'];

echo json_encode(['success' => true, 'design' => $updated]);

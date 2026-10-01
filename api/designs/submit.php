<?php
/**
 * POST api/designs/submit.php
 * Accept a community design submission (public, no auth required).
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

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

// ── Validate required fields ──
$designerName  = trim($input['designerName'] ?? '');
$designerEmail = trim($input['designerEmail'] ?? '');
$designName    = trim($input['designName'] ?? '');
$description   = trim($input['description'] ?? '');
$shoeId        = trim($input['shoeId'] ?? '');
$partColors    = $input['partColors'] ?? null;
$charmId       = trim($input['charmId'] ?? 'none');
$charmLabel    = trim($input['charmLabel'] ?? 'None');

$errors = [];
if (strlen($designerName) < 2)  $errors[] = 'Designer name must be at least 2 characters.';
if (!filter_var($designerEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid email address is required.';
if (strlen($designName) < 2)    $errors[] = 'Design name must be at least 2 characters.';
if (strlen($designName) > 100)  $errors[] = 'Design name must not exceed 100 characters.';
if (!$shoeId)                   $errors[] = 'Shoe ID is required.';
if (!is_array($partColors) && !is_object($partColors)) $errors[] = 'Part colors configuration is required.';

if (count($errors) > 0) {
    http_response_code(400);
    echo json_encode(['error' => implode(' ', $errors)]);
    exit;
}

$pdo = getDbConnection();

// ── Verify shoe exists ──
$shoeStmt = $pdo->prepare('SELECT id, name FROM shoes WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
$shoeStmt->execute([$shoeId]);
$shoe = $shoeStmt->fetch(PDO::FETCH_ASSOC);

if (!$shoe) {
    http_response_code(400);
    echo json_encode(['error' => 'The selected shoe model does not exist or is unavailable.']);
    exit;
}

// ── Rate-limit: max 10 designs per email per day ──
$rateStmt = $pdo->prepare(
    'SELECT COUNT(*) FROM community_designs WHERE designer_email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY) AND deleted_at IS NULL'
);
$rateStmt->execute([$designerEmail]);
if ((int) $rateStmt->fetchColumn() >= 10) {
    http_response_code(429);
    echo json_encode(['error' => 'You have reached the daily submission limit (10 designs per day). Please try again tomorrow.']);
    exit;
}

// ── Generate unique design ID: KCD-YYYY-XXXX ──
$year = date('Y');
$designId = '';
for ($i = 0; $i < 10; $i++) {
    $suffix = str_pad(random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
    $candidateId = "KCD-{$year}-{$suffix}";
    $checkStmt = $pdo->prepare('SELECT COUNT(*) FROM community_designs WHERE id = ?');
    $checkStmt->execute([$candidateId]);
    if ((int) $checkStmt->fetchColumn() === 0) {
        $designId = $candidateId;
        break;
    }
}
if (!$designId) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not generate a unique design ID. Please try again.']);
    exit;
}

// ── Insert design ──
$insertStmt = $pdo->prepare(
    'INSERT INTO community_designs (id, designer_name, designer_email, design_name, description, shoe_id, shoe_name, part_colors, charm_id, charm_label, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$insertStmt->execute([
    $designId,
    $designerName,
    $designerEmail,
    $designName,
    $description ?: null,
    $shoeId,
    $shoe['name'],
    json_encode($partColors),
    $charmId,
    $charmLabel,
    'pending'
]);

// ── Fetch inserted design ──
$fetchStmt = $pdo->prepare('SELECT * FROM community_designs WHERE id = ?');
$fetchStmt->execute([$designId]);
$design = $fetchStmt->fetch(PDO::FETCH_ASSOC);

$design['partColors']   = json_decode($design['part_colors'], true);
$design['designerName'] = $design['designer_name'];
$design['designerEmail'] = $design['designer_email'];
$design['designName']   = $design['design_name'];
$design['shoeName']     = $design['shoe_name'];
$design['shoeId']       = $design['shoe_id'];
$design['charmId']      = $design['charm_id'];
$design['charmLabel']   = $design['charm_label'];
$design['adminNotes']   = $design['admin_notes'];
$design['featuredAt']   = $design['featured_at'];
$design['createdAt']    = $design['created_at'];
$design['updatedAt']    = $design['updated_at'];

http_response_code(201);
echo json_encode(['success' => true, 'design' => $design]);

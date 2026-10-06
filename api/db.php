<?php
// KickCraft Database PDO Singleton

require_once __DIR__ . '/config.php';

function getEnvVar(string $key, string $default = ''): string {
    if (!empty($_ENV[$key])) return (string)$_ENV[$key];
    if (!empty($_SERVER[$key])) return (string)$_SERVER[$key];
    $val = getenv($key);
    return ($val !== false && $val !== '') ? (string)$val : $default;
}

function getFreshDb(): PDO {
    $host = getEnvVar('DB_HOST', 'localhost');
    $port = getEnvVar('DB_PORT', '3306');
    $db   = getEnvVar('DB_NAME', 'kickcraft_db');
    $user = getEnvVar('DB_USER', 'root');
    $pass = getEnvVar('DB_PASS', '');
    $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";
    try {
        return new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Database connection failed',
            'details' => $e->getMessage(),
            'hint' => 'Check DB_HOST, DB_NAME, DB_USER, and DB_PASS in GitHub Secrets or api/.env'
        ]);
        exit;
    }
}

function getDb(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = getFreshDb();
    }
    return $pdo;
}

function getDbConnection(): PDO {
    return getDb();
}

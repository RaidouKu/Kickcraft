<?php

declare(strict_types=1);

$env = [];
foreach (@file(__DIR__ . '/../api/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
    if (!str_starts_with(trim($line), '#') && str_contains($line, '=')) {
        [$key, $entry] = explode('=', $line, 2);
        $env[trim($key)] = trim($entry, " \t\n\r\0\x0B\"");
    }
}
$value = static fn(string $key, string $default = ''): string => (string)(getenv($key) ?: ($env[$key] ?? $default));
$database = 'kickcraft_test_' . bin2hex(random_bytes(4));

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$pdo = new PDO(
    sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $value('DB_HOST', '127.0.0.1'), $value('DB_PORT', '3306')),
    $value('DB_USER', 'root'),
    $value('DB_PASS'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

try {
    $pdo->exec("CREATE DATABASE `$database` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `$database`");
    $pdo->exec("CREATE TABLE shoes (id VARCHAR(100) PRIMARY KEY, stock INT NOT NULL, status ENUM('available','out_of_stock') NOT NULL) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE reservations (id VARCHAR(64) PRIMARY KEY, shoe_id VARCHAR(100) NOT NULL, status ENUM('pending','approved','ready','completed','cancelled') NOT NULL, FOREIGN KEY (shoe_id) REFERENCES shoes(id)) ENGINE=InnoDB");
    $pdo->exec("INSERT INTO shoes VALUES ('kickcraft-one', 2, 'available')");

    $pdo->beginTransaction();
    $pdo->exec("INSERT INTO reservations VALUES ('KC-TEST-0001', 'kickcraft-one', 'pending')");
    $pdo->exec("UPDATE shoes SET stock = stock - 1 WHERE id = 'kickcraft-one'");
    $pdo->commit();

    foreach (['approved', 'ready', 'completed'] as $status) {
        $stmt = $pdo->prepare('UPDATE reservations SET status = ? WHERE id = ?');
        $stmt->execute([$status, 'KC-TEST-0001']);
    }
    check($pdo->query("SELECT status FROM reservations WHERE id = 'KC-TEST-0001'")->fetchColumn() === 'completed', 'status workflow failed');
    check((int)$pdo->query("SELECT stock FROM shoes WHERE id = 'kickcraft-one'")->fetchColumn() === 1, 'reservation stock decrement failed');

    $pdo->beginTransaction();
    $pdo->exec("INSERT INTO reservations VALUES ('KC-TEST-0002', 'kickcraft-one', 'pending')");
    $pdo->exec("UPDATE shoes SET stock = stock - 1 WHERE id = 'kickcraft-one'");
    $pdo->exec("UPDATE reservations SET status = 'cancelled' WHERE id = 'KC-TEST-0002'");
    $pdo->exec("UPDATE shoes SET stock = stock + 1 WHERE id = 'kickcraft-one'");
    $pdo->commit();
    check((int)$pdo->query("SELECT stock FROM shoes WHERE id = 'kickcraft-one'")->fetchColumn() === 1, 'cancellation stock restoration failed');

    echo "MySQL reservation workflow passed.\n";
} finally {
    if (preg_match('/^kickcraft_test_[0-9a-f]{8}$/', $database)) {
        $pdo->exec("DROP DATABASE IF EXISTS `$database`");
    }
}

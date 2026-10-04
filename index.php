<?php
/**
 * KickCraft Development & Apache Bridge
 * When accessed through XAMPP Apache (http://localhost/kickcraft/):
 * 1. Checks if the Vite dev server is running on port 5173.
 * 2. If running, redirects immediately to http://localhost:5173/.
 * 3. If not running, displays the KickCraft developer launcher status screen.
 */

$viteHost = 'localhost';
$vitePort = 5173;
$viteRunning = false;

$socket = @fsockopen($viteHost, $vitePort, $errCode, $errStr, 0.2);
if ($socket) {
    fclose($socket);
    $viteRunning = true;
}

if ($viteRunning) {
    header('Location: http://localhost:5173/');
    exit;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KickCraft - 3D Shoe Studio &amp; Marketplace</title>
  <link rel="icon" type="image/svg+xml" href="public/favicon.svg" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #f5f6f4;
      color: #202220;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: #fcfdfb;
      border: 3px solid #202220;
      box-shadow: 8px 8px 0px #202220;
      max-width: 620px;
      width: 100%;
      padding: 2.5rem;
    }
    .tag {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      background: #f0f2ee;
      border: 2px solid #202220;
      padding: 0.25rem 0.6rem;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 900;
      letter-spacing: -0.03em;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }
    p {
      font-size: 0.95rem;
      color: #555855;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .status-box {
      border: 2px solid #202220;
      background: #fff;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.35rem 0;
      font-size: 0.85rem;
    }
    .status-row:not(:last-child) {
      border-bottom: 1px dashed #cfd2ce;
    }
    .badge-ok {
      background: #e8f5e9;
      color: #2e7d32;
      border: 1px solid #2e7d32;
      padding: 0.15rem 0.4rem;
      font-weight: 700;
    }
    .badge-pending {
      background: #fff8e1;
      color: #b78103;
      border: 1px solid #b78103;
      padding: 0.15rem 0.4rem;
      font-weight: 700;
    }
    .command-box {
      background: #202220;
      color: #fcfdfb;
      padding: 1rem 1.25rem;
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      border: 2px solid #202220;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn {
      display: inline-block;
      width: 100%;
      text-align: center;
      background: #b94d27;
      color: #fff;
      text-decoration: none;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.85rem 1.25rem;
      border: 2px solid #202220;
      box-shadow: 4px 4px 0px #202220;
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .btn:hover {
      background: #9d3e1d;
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0px #202220;
    }
    .btn:active {
      transform: translate(2px, 2px);
      box-shadow: 2px 2px 0px #202220;
    }
  </style>
  <script>
    // Auto-detect when Vite dev server starts and redirect
    setInterval(async () => {
      try {
        const res = await fetch('http://localhost:5173/', { mode: 'no-cors' });
        window.location.href = 'http://localhost:5173/';
      } catch (_) {}
    }, 2000);
  </script>
</head>
<body>
  <div class="card">
    <div class="tag">[ KickCraft Architecture Bridge ]</div>
    <h1>KickCraft 3D Studio</h1>
    <p>You have accessed KickCraft through the XAMPP Apache root. The interactive 3D Vue interface runs through the Vite dev server with Hot Module Replacement.</p>

    <div class="status-box">
      <div class="status-row">
        <span>XAMPP Apache (PHP API):</span>
        <span class="badge-ok">[ ONLINE: PORT 80 ]</span>
      </div>
      <div class="status-row">
        <span>MySQL Database:</span>
        <span class="badge-ok">[ ONLINE: PORT 3306 ]</span>
      </div>
      <div class="status-row">
        <span>Vite 3D Frontend Server:</span>
        <span class="badge-pending">[ WAITING: PORT 5173 ]</span>
      </div>
    </div>

    <p style="margin-bottom: 0.5rem; font-size: 0.85rem; font-weight: 700;">Start the 3D frontend server in your terminal:</p>
    <div class="command-box">
      <span>npm run dev</span>
    </div>

    <a href="http://localhost:5173/" class="btn">Open http://localhost:5173/ &rarr;</a>
  </div>
</body>
</html>

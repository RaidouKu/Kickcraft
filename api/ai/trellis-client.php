<?php
// KickCraft AI 2D -> 3D client for the free TRELLIS Hugging Face Space (Gradio REST API).
// The Space removes the image background, builds a textured mesh, and returns a GLB file.

const KC_AI_DEFAULT_SPACE_URL = 'https://trellis-community-trellis.hf.space';
const KC_AI_PROVIDER = 'huggingface_trellis';
const KC_AI_MAX_GLB_BYTES = 30 * 1024 * 1024;

/** Perform an HTTP request with cURL. Returns ['status' => int, 'body' => string, 'error' => string]. */
function kcAiHttp(string $method, string $url, array $options = []): array {
    $ch = curl_init($url);
    $headers = $options['headers'] ?? [];
    $token = $options['token'] ?? '';
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => (int)($options['timeout'] ?? 60),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_USERAGENT => 'KickCraft/1.0 (+local seller studio)',
    ]);

    if (array_key_exists('json', $options)) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($options['json'], JSON_UNESCAPED_SLASHES));
    } elseif (array_key_exists('multipart', $options)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $options['multipart']);
    }

    $body = curl_exec($ch);
    $error = $body === false ? curl_error($ch) : '';
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    return ['status' => $status, 'body' => $body === false ? '' : (string)$body, 'error' => $error];
}

/** Translate raw Space / network errors into a message a seller can act on. */
function kcAiFriendlyError(string $raw): string {
    $lower = strtolower($raw);
    if (str_contains($lower, 'quota') || str_contains($lower, 'zerogpu') || str_contains($lower, 'gpu task')) {
        return 'The free AI GPU quota is used up for now. Add a free Hugging Face token (HF_TOKEN) in api/.env or try again in a few minutes.';
    }
    if (str_contains($lower, 'timed out') || str_contains($lower, 'timeout')) {
        return 'The AI service took too long to respond. It may be busy, so please try again in a few minutes.';
    }
    if (str_contains($lower, 'could not resolve') || str_contains($lower, 'failed to connect') || str_contains($lower, 'network')) {
        return 'Cannot reach the AI service. Check your internet connection and try again.';
    }
    if (str_contains($lower, 'sleeping') || str_contains($lower, '503') || str_contains($lower, 'building')) {
        return 'The AI service is starting up. Please try again in a minute.';
    }
    return 'AI 3D generation failed: ' . mb_substr(trim($raw) !== '' ? trim($raw) : 'unknown error', 0, 300);
}

/**
 * Parse one Gradio queue SSE message for a specific event.
 * Returns null while the job is still running, or a final ['ok' => bool, ...] result.
 */
function kcAiHandleQueueMessage(array $msg, string $eventId): ?array {
    $type = (string)($msg['msg'] ?? '');
    if (isset($msg['event_id']) && $msg['event_id'] !== $eventId && $type !== 'unexpected_error') {
        return null;
    }
    if ($type === 'process_completed') {
        if (!empty($msg['success'])) {
            return ['ok' => true, 'data' => (array)($msg['output']['data'] ?? [])];
        }
        $err = $msg['output']['error'] ?? $msg['output']['title'] ?? null;
        return ['ok' => false, 'error' => is_string($err) && $err !== '' ? $err : 'AI service reported an error while building the model'];
    }
    if ($type === 'unexpected_error') {
        return ['ok' => false, 'error' => (string)($msg['message'] ?? 'Unexpected AI service error')];
    }
    if ($type === 'close_stream') {
        return ['ok' => false, 'error' => 'AI service closed the connection before finishing'];
    }
    return null;
}

/**
 * Join a Gradio queue job and stream results until it completes.
 * Returns ['ok' => true, 'data' => array] or ['ok' => false, 'error' => string].
 */
function kcAiRunQueueJob(string $baseUrl, int $fnIndex, array $data, ?int $triggerId, string $sessionHash, string $token, int $timeout): array {
    $join = kcAiHttp('POST', $baseUrl . '/gradio_api/queue/join', [
        'json' => [
            'data' => $data,
            'event_data' => null,
            'fn_index' => $fnIndex,
            'trigger_id' => $triggerId,
            'session_hash' => $sessionHash,
        ],
        'token' => $token,
        'timeout' => 60,
    ]);
    if ($join['error'] !== '' || $join['status'] >= 400) {
        return ['ok' => false, 'error' => $join['error'] ?: ('HTTP ' . $join['status'] . ' ' . mb_substr($join['body'], 0, 300))];
    }
    $eventId = (string)(json_decode($join['body'], true)['event_id'] ?? '');
    if ($eventId === '') {
        return ['ok' => false, 'error' => 'AI service did not accept the job'];
    }

    // Stream queue messages and stop as soon as this job finishes.
    $buffer = '';
    $result = null;
    $ch = curl_init($baseUrl . '/gradio_api/queue/data?session_hash=' . rawurlencode($sessionHash));
    $headers = ['Accept: text/event-stream'];
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => 'KickCraft/1.0 (+local seller studio)',
        CURLOPT_WRITEFUNCTION => function ($curl, string $chunk) use (&$buffer, &$result, $eventId): int {
            $buffer .= $chunk;
            while (($pos = strpos($buffer, "\n\n")) !== false) {
                $block = substr($buffer, 0, $pos);
                $buffer = substr($buffer, $pos + 2);
                foreach (preg_split('/\r?\n/', $block) as $line) {
                    if (!str_starts_with($line, 'data:')) {
                        continue;
                    }
                    $msg = json_decode(trim(substr($line, 5)), true);
                    if (is_array($msg) && ($final = kcAiHandleQueueMessage($msg, $eventId)) !== null) {
                        $result = $final;
                        return -1; // abort transfer: job finished
                    }
                }
            }
            return strlen($chunk);
        },
    ]);
    curl_exec($ch);
    $curlError = curl_errno($ch) === CURLE_WRITE_ERROR ? '' : curl_error($ch);
    curl_close($ch);

    if ($result !== null) {
        return $result;
    }
    return ['ok' => false, 'error' => $curlError !== '' ? $curlError : 'AI service ended without returning a model'];
}

/** Load the Space config and index dependencies by api_name. */
function kcAiLoadSpaceConfig(string $baseUrl, string $token): array {
    $res = kcAiHttp('GET', $baseUrl . '/config', ['token' => $token, 'timeout' => 30]);
    $config = json_decode($res['body'], true);
    if ($res['error'] !== '' || $res['status'] >= 400 || !is_array($config) || empty($config['dependencies'])) {
        return ['ok' => false, 'error' => $res['error'] ?: ('AI service is unavailable (HTTP ' . $res['status'] . ')')];
    }
    $componentTypes = [];
    foreach ($config['components'] ?? [] as $component) {
        $componentTypes[(int)$component['id']] = (string)($component['type'] ?? '');
    }
    $deps = [];
    foreach ($config['dependencies'] as $index => $dep) {
        if (!empty($dep['api_name'])) {
            $deps[$dep['api_name']] = [
                'fn_index' => (int)($dep['id'] ?? $index),
                'inputs' => array_map('intval', $dep['inputs'] ?? []),
                'trigger_id' => $dep['targets'][0][0] ?? null,
            ];
        }
    }
    return ['ok' => true, 'deps' => $deps, 'types' => $componentTypes];
}

/** Place API values into the dependency input slots, filling hidden State inputs with null. */
function kcAiBuildInputData(array $inputIds, array $componentTypes, array $apiValues): array {
    $data = [];
    foreach ($inputIds as $componentId) {
        $data[] = ($componentTypes[$componentId] ?? '') === 'state' ? null : array_shift($apiValues);
    }
    return $data;
}

/** Find the GLB file reference inside the TRELLIS output list. */
function kcAiFindGlbUrl(array $outputs, string $baseUrl): string {
    foreach ($outputs as $item) {
        if (!is_array($item)) {
            continue;
        }
        $url = (string)($item['url'] ?? '');
        $path = (string)($item['path'] ?? '');
        $candidate = $url !== '' ? $url : ($path !== '' ? $baseUrl . '/gradio_api/file=' . $path : '');
        if ($candidate !== '' && preg_match('/\.glb(\?|$)/i', $path !== '' ? $path : $candidate)) {
            return $candidate;
        }
    }
    return '';
}

/**
 * Generate a GLB from a shoe photo and save it to $destGlbPath.
 * Returns ['ok' => true] or ['ok' => false, 'error' => friendly message].
 */
function trellisGenerateGlb(string $imagePath, string $destGlbPath, array $config = []): array {
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'PHP cURL extension is not enabled in XAMPP, so the AI service cannot be reached.'];
    }

    $baseUrl = rtrim((string)($config['baseUrl'] ?? (getenv('KICKCRAFT_AI_SPACE_URL') ?: KC_AI_DEFAULT_SPACE_URL)), '/');
    $token = trim((string)($config['token'] ?? (getenv('HF_TOKEN') ?: '')));
    $timeout = (int)($config['timeout'] ?? 280);
    $sessionHash = bin2hex(random_bytes(6));

    $space = kcAiLoadSpaceConfig($baseUrl, $token);
    if (!$space['ok']) {
        return ['ok' => false, 'error' => kcAiFriendlyError($space['error'])];
    }
    $startDep = $space['deps']['start_session'] ?? null;
    $genDep = $space['deps']['generate_and_extract_glb'] ?? null;
    if ($genDep === null) {
        return ['ok' => false, 'error' => 'The AI service changed and no longer offers GLB generation.'];
    }

    // 1. TRELLIS keeps a per-session work folder that start_session creates.
    if ($startDep !== null) {
        $session = kcAiRunQueueJob($baseUrl, $startDep['fn_index'], [], $startDep['trigger_id'], $sessionHash, $token, 60);
        if (!$session['ok']) {
            return ['ok' => false, 'error' => kcAiFriendlyError($session['error'])];
        }
    }

    // 2. Upload the seller's photo to the Space.
    $mime = mime_content_type($imagePath) ?: 'image/png';
    $upload = kcAiHttp('POST', $baseUrl . '/gradio_api/upload', [
        'multipart' => ['files' => new CURLFile($imagePath, $mime, basename($imagePath))],
        'token' => $token,
        'timeout' => 60,
    ]);
    $uploaded = json_decode($upload['body'], true);
    if ($upload['error'] !== '' || $upload['status'] >= 400 || !is_array($uploaded) || empty($uploaded[0])) {
        return ['ok' => false, 'error' => kcAiFriendlyError($upload['error'] ?: ('Image upload failed (HTTP ' . $upload['status'] . ')'))];
    }

    // 3. Build the 3D model and extract a browser-friendly GLB.
    $imageInput = [
        'path' => (string)$uploaded[0],
        'orig_name' => basename($imagePath),
        'mime_type' => $mime,
        'meta' => ['_type' => 'gradio.FileData'],
    ];
    $data = kcAiBuildInputData($genDep['inputs'], $space['types'], [
        $imageInput, // image
        [],          // multiimages
        0,           // seed
        7.5,         // sparse structure guidance strength
        12,          // sparse structure sampling steps
        3.0,         // structured latent guidance strength
        12,          // structured latent sampling steps
        'stochastic',
        0.95,        // mesh simplify: keeps the GLB light for ordinary laptops
        1024,        // texture size
    ]);
    $job = kcAiRunQueueJob($baseUrl, $genDep['fn_index'], $data, $genDep['trigger_id'], $sessionHash, $token, $timeout);
    if (!$job['ok']) {
        return ['ok' => false, 'error' => kcAiFriendlyError($job['error'])];
    }

    $glbUrl = kcAiFindGlbUrl($job['data'], $baseUrl);
    if ($glbUrl === '') {
        return ['ok' => false, 'error' => 'The AI service finished but did not return a GLB model.'];
    }

    // 4. Download the GLB so the studio keeps working offline afterwards.
    $download = kcAiHttp('GET', $glbUrl, ['token' => $token, 'timeout' => 120]);
    if ($download['error'] !== '' || $download['status'] >= 400) {
        return ['ok' => false, 'error' => kcAiFriendlyError($download['error'] ?: ('Model download failed (HTTP ' . $download['status'] . ')'))];
    }

    return kcAiSaveGlb($download['body'], $destGlbPath);
}

/** Validate GLB bytes (magic header + size) and write them to disk. */
function kcAiSaveGlb(string $bytes, string $destGlbPath): array {
    if (strlen($bytes) < 20 || substr($bytes, 0, 4) !== 'glTF') {
        return ['ok' => false, 'error' => 'The AI service returned a file that is not a valid GLB model.'];
    }
    if (strlen($bytes) > KC_AI_MAX_GLB_BYTES) {
        return ['ok' => false, 'error' => 'The generated model is too large for the browser (over 30MB).'];
    }
    if (file_put_contents($destGlbPath, $bytes) === false) {
        return ['ok' => false, 'error' => 'Failed to save the generated 3D model.'];
    }
    return ['ok' => true];
}

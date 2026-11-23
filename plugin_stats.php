<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$confFile = __DIR__ . '/download_box.conf';
$repoDir  = __DIR__;

$sessionName = (string)ini_get('session.name');
if ($sessionName === '') {
    $sessionName = 'PHPSESSID';
}
$hasSessionCookie = isset($_COOKIE[$sessionName]) && is_string($_COOKIE[$sessionName]) && $_COOKIE[$sessionName] !== '';

$csrfToken = null;
$sessionHasCsrf = false;

if ($hasSessionCookie) {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
    }
    if (session_status() === PHP_SESSION_ACTIVE && session_id() !== '') {
        $sessionHasCsrf = isset($_SESSION['kh_dl_csrf']) && is_string($_SESSION['kh_dl_csrf']) && $_SESSION['kh_dl_csrf'] !== '';
        if (!$sessionHasCsrf) {
            $_SESSION['kh_dl_csrf'] = bin2hex(random_bytes(32));
        }
        $csrfToken = $_SESSION['kh_dl_csrf'];
    }
}

function isSameOriginRequest(): bool {
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        return false;
    }
    $origin  = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    $checkUrl = $origin !== '' ? $origin : $referer;
    if ($checkUrl === '') {
        return false;
    }
    $parsedHost = strtolower((string)(parse_url($checkUrl, PHP_URL_HOST) ?? ''));
    $parsedPort = parse_url($checkUrl, PHP_URL_PORT);
    $candidate  = $parsedHost . ($parsedPort ? ':' . $parsedPort : '');
    return hash_equals($host, $candidate) || hash_equals($host, $parsedHost);
}

function requireValidCsrfAndOrigin(bool $hasSessionCookie, bool $sessionHasCsrf): bool {
    if (!$hasSessionCookie || !$sessionHasCsrf || session_status() !== PHP_SESSION_ACTIVE) {
        return false;
    }
    if (!isSameOriginRequest()) {
        return false;
    }
    $headerToken = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $postToken   = (string)($_POST['csrf_token'] ?? '');
    $token       = $headerToken !== '' ? $headerToken : $postToken;
    $expected    = (string)($_SESSION['kh_dl_csrf'] ?? '');
    return $token !== '' && $expected !== '' && hash_equals($expected, $token);
}

function findGitBinary(): ?string {
    $candidates = ['/usr/bin/git', '/usr/local/bin/git', '/bin/git'];
    foreach ($candidates as $bin) {
        if (is_file($bin) && is_executable($bin)) {
            return $bin;
        }
    }
    return null;
}

function runGitCommand(string $gitBin, string $repoDir, array $args): array {
    $cmdParts = [
        escapeshellarg($gitBin),
        '-c',
        escapeshellarg('safe.directory=' . $repoDir),
        '-C',
        escapeshellarg($repoDir),
    ];
    foreach ($args as $arg) {
        $cmdParts[] = escapeshellarg($arg);
    }
    $cmd = implode(' ', $cmdParts) . ' 2>&1';
    $output = [];
    $code   = 1;
    @exec($cmd, $output, $code);
    return [
        'code'   => $code,
        'output' => trim(implode("\n", $output)),
    ];
}

function getGitStatusInfo(string $repoDir, bool $forceFetch = false): ?array {
    if (!is_dir($repoDir . '/.git') || !function_exists('exec')) {
        return null;
    }

    $gitBin = findGitBinary();
    if ($gitBin === null) {
        return null;
    }

    $headRes = runGitCommand($gitBin, $repoDir, ['rev-parse', '--short', 'HEAD']);
    if ($headRes['code'] !== 0 || $headRes['output'] === '') {
        return null;
    }
    $localCommit = $headRes['output'];

    $tagRes = runGitCommand($gitBin, $repoDir, ['describe', '--tags', '--abbrev=0']);
    $currentVersion = ($tagRes['code'] === 0 && $tagRes['output'] !== '')
        ? $tagRes['output']
        : $localCommit;

    $fetchCacheFile = sys_get_temp_dir() . '/kh_plugin_stats_git_fetch_' . md5($repoDir) . '.json';
    $fetchTtl = 600;
    $remoteInfo = null;

    if (!$forceFetch && file_exists($fetchCacheFile) && (time() - filemtime($fetchCacheFile)) < $fetchTtl) {
        $cached = @json_decode((string)@file_get_contents($fetchCacheFile), true);
        if (is_array($cached)) {
            $remoteInfo = $cached;
        }
    }

    if ($remoteInfo === null) {
        $fetchRes = runGitCommand($gitBin, $repoDir, ['fetch', 'origin', '--tags', '--prune', '--quiet']);
        $behindCount = 0;
        $latestTag = $currentVersion;

        if ($fetchRes['code'] === 0) {
            $countRes = runGitCommand($gitBin, $repoDir, ['rev-list', '--count', 'HEAD..origin/main']);
            if ($countRes['code'] === 0 && is_numeric($countRes['output'])) {
                $behindCount = (int)$countRes['output'];
            }

            $tagsRes = runGitCommand($gitBin, $repoDir, ['tag', '--sort=-v:refname']);
            if ($tagsRes['code'] === 0 && $tagsRes['output'] !== '') {
                $tagsList = preg_split('/\R+/', trim($tagsRes['output'])) ?: [];
                if (!empty($tagsList[0])) {
                    $latestTag = $tagsList[0];
                }
            }
        }

        $remoteInfo = [
            'behind'     => $behindCount,
            'latest_tag' => $latestTag,
        ];
        @file_put_contents($fetchCacheFile, json_encode($remoteInfo));
    }

    $behindCount = (int)($remoteInfo['behind'] ?? 0);
    $latestTag   = (string)($remoteInfo['latest_tag'] ?? $currentVersion);
    $hasUpdate   = $behindCount > 0;

    return [
        'current_version' => $currentVersion,
        'latest_version'  => $hasUpdate ? $latestTag : $currentVersion,
        'commits_behind'  => $behindCount,
        'has_update'      => $hasUpdate,
    ];
}

// POST ?action=update -> geschützt durch bestehende Session, CSRF & Same-Origin-Check + Cooldown
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && ($_GET['action'] ?? '') === 'update') {
    if (!requireValidCsrfAndOrigin($hasSessionCookie, $sessionHasCsrf)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid session, CSRF token, or origin.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $cooldownFile = sys_get_temp_dir() . '/kh_plugin_stats_update_lock_' . md5($repoDir) . '.txt';
    $cooldownSec  = 20;
    if (file_exists($cooldownFile) && (time() - filemtime($cooldownFile)) < $cooldownSec) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'Update cooldown active. Please wait a moment.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    @touch($cooldownFile);

    if (!is_dir($repoDir . '/.git') || !function_exists('exec')) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Git repository not available.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $gitBin = findGitBinary();
    if ($gitBin === null) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Git binary not found.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $pullRes = runGitCommand($gitBin, $repoDir, ['pull', '--ff-only', 'origin', 'main']);
    if ($pullRes['code'] !== 0) {
        http_response_code(500);
        echo json_encode([
            'ok'    => false,
            'error' => $pullRes['output'] !== '' ? $pullRes['output'] : 'git pull failed.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    foreach (glob(sys_get_temp_dir() . '/kh_plugin_stats_*') ?: [] as $tmpFile) {
        @unlink($tmpFile);
    }
    getGitStatusInfo($repoDir, true);

    echo json_encode([
        'ok'     => true,
        'output' => $pullRes['output'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function parseConfig(string $confPath): array {
    $result = [
        'repos'        => [],
        'github_token' => '',
    ];
    if (!is_readable($confPath)) {
        return $result;
    }

    $lines = file($confPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return $result;
    }

    $seen = [];

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#') || str_starts_with($trimmed, ';') || str_starts_with($trimmed, '//')) {
            continue;
        }

        if (preg_match('/^GITHUB_TOKEN\s*=\s*(.+)$/i', $trimmed, $tm)) {
            $result['github_token'] = trim($tm[1], " \t\n\r\0\x0B\"'");
            continue;
        }

        $candidate = $trimmed;
        if (str_contains($candidate, '=')) {
            [, $candidate] = explode('=', $candidate, 2);
            $candidate = trim($candidate, " \t\n\r\0\x0B\"'");
        }
        if ($candidate === '') {
            continue;
        }

        $normalizedUrl = rtrim($candidate, "/ \t\n\r\0\x0B");
        if (preg_match('#^(https?)://([A-Za-z0-9.-]+(?::\d+)?)/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?$#i', $normalizedUrl, $m)) {
            $scheme    = strtolower($m[1]);
            $host      = strtolower($m[2]);
            $ownerRepo = $m[3] . '/' . $m[4];
            $isGitHub  = ($host === 'github.com' || $host === 'www.github.com');
            if ($isGitHub) {
                $host = 'github.com';
            }
            $key = $host . '/' . strtolower($ownerRepo);
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $result['repos'][] = [
                    'repo'  => $ownerRepo,
                    'forge' => $isGitHub ? 'github' : 'gitea',
                    'url'   => $isGitHub
                        ? 'https://github.com/' . $ownerRepo
                        : $scheme . '://' . $host . '/' . $ownerRepo,
                    'api'   => $isGitHub
                        ? 'https://api.github.com/repos/' . $ownerRepo . '/releases'
                        : $scheme . '://' . $host . '/api/v1/repos/' . $ownerRepo . '/releases',
                    'repo_api' => $isGitHub
                        ? 'https://api.github.com/repos/' . $ownerRepo
                        : $scheme . '://' . $host . '/api/v1/repos/' . $ownerRepo,
                ];
            }
        }
    }

    return $result;
}

$cfg         = parseConfig($confFile);
$repos       = $cfg['repos'];
$githubToken = $cfg['github_token'];

$forceRefresh = (($_GET['refresh'] ?? '') === '1');
if ($forceRefresh) {
    $origin  = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    $hasOriginOrReferer = ($origin !== '' || $referer !== '');

    if ($hasOriginOrReferer && !isSameOriginRequest()) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid origin for refresh.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!$hasOriginOrReferer && !$hasSessionCookie) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Session or origin required for refresh.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $refreshCooldownFile = sys_get_temp_dir() . '/kh_plugin_stats_refresh_lock_' . md5($confFile) . '.txt';
    $refreshCooldownSec  = 5;
    if (file_exists($refreshCooldownFile) && (time() - filemtime($refreshCooldownFile)) < $refreshCooldownSec) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'Refresh cooldown active. Please wait a few seconds.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    @touch($refreshCooldownFile);
}

$confHash   = is_readable($confFile) ? md5_file($confFile) : 'empty';
$cacheFile  = sys_get_temp_dir() . '/kh_plugin_stats_gh_' . $confHash . '.json';
$staleFile  = sys_get_temp_dir() . '/kh_plugin_stats_stale_' . $confHash . '.json';
$cacheTtl   = 600;

if (!$forceRefresh && file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
    $cachedJson = @file_get_contents($cacheFile);
    $cachedArr  = is_string($cachedJson) ? json_decode($cachedJson, true) : null;
    if (is_array($cachedArr) && isset($cachedArr['token_status'])) {
        $cachedArr['git']        = getGitStatusInfo($repoDir);
        $cachedArr['csrf_token'] = $csrfToken;
        echo json_encode($cachedArr, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}

$rateLimitInfo = [
    'limit'      => null,
    'remaining'  => null,
    'auth_fail'  => false,
    'expires_at' => null,
];

function fetchJson(string $url, string $forge, string $githubToken = ''): array {
    global $rateLimitInfo;

    $headers = [
        'User-Agent: KeyHelp-Dashboard-Stats',
        'Accept: application/vnd.github+json',
    ];
    if ($forge === 'github' && $githubToken !== '') {
        $headers[] = 'Authorization: Bearer ' . $githubToken;
    }

    $totalCount = null;
    $rlLimit    = null;
    $rlRem      = null;
    $tokExp     = null;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_TCP_KEEPALIVE  => 1,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_HEADERFUNCTION => function ($ch, $headerLine) use (&$totalCount, &$rlLimit, &$rlRem, &$tokExp) {
            $len = strlen($headerLine);
            if (stripos($headerLine, 'X-Total-Count:') === 0) {
                $totalCount = (int)trim(substr($headerLine, strlen('X-Total-Count:')));
            } elseif (stripos($headerLine, 'X-RateLimit-Limit:') === 0) {
                $rlLimit = (int)trim(substr($headerLine, strlen('X-RateLimit-Limit:')));
            } elseif (stripos($headerLine, 'X-RateLimit-Remaining:') === 0) {
                $rlRem = (int)trim(substr($headerLine, strlen('X-RateLimit-Remaining:')));
            } elseif (stripos($headerLine, 'github-authentication-token-expiration:') === 0) {
                $val = trim(substr($headerLine, strlen('github-authentication-token-expiration:')));
                if ($val !== '') {
                    $tokExp = $val;
                }
            }
            return $len;
        },
    ]);
    $raw      = curl_exec($ch);
    $err      = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($forge === 'github') {
        if ($httpCode === 401) {
            $rateLimitInfo['auth_fail'] = true;
        }
        if ($rlLimit !== null) {
            $rateLimitInfo['limit'] = $rlLimit;
        }
        if ($rlRem !== null) {
            $rateLimitInfo['remaining'] = $rlRem;
        }
        if ($tokExp !== null) {
            $rateLimitInfo['expires_at'] = $tokExp;
        }
    }

    if ($raw === false || !is_string($raw)) {
        return ['_error' => $err !== '' ? $err : 'Request fehlgeschlagen'];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['_error' => 'Ungültiges JSON'];
    }
    if ($httpCode >= 400) {
        $msg = (string)($decoded['message'] ?? ('HTTP ' . $httpCode));
        return ['_error' => $msg];
    }

    return ['data' => $decoded, 'totalCount' => $totalCount];
}

function fetchRepoMeta(string $repoApiUrl, string $forge, string $githubToken = ''): array {
    $res = fetchJson($repoApiUrl, $forge, $githubToken);
    if (isset($res['_error']) || !is_array($res['data'] ?? null)) {
        return ['stars' => null, 'open_issues' => null];
    }
    $d = $res['data'];
    return [
        'stars'       => isset($d['stargazers_count']) ? (int)$d['stargazers_count'] : (isset($d['stars_count']) ? (int)$d['stars_count'] : null),
        'open_issues' => isset($d['open_issues_count']) ? (int)$d['open_issues_count'] : null,
    ];
}

function fetchAllReleases(string $apiUrl, string $forge, string $githubToken = ''): array {
    $pageSize  = $forge === 'github' ? 100 : 50;
    $sizeParam = $forge === 'github' ? 'per_page' : 'limit';
    $all       = [];

    for ($page = 1; $page <= 20; $page++) {
        $res = fetchJson("{$apiUrl}?{$sizeParam}={$pageSize}&page={$page}", $forge, $githubToken);
        if (!isset($res['_error']) && !array_is_list($res['data'])) {
            $res = ['_error' => (string)($res['data']['message'] ?? 'Unerwartete API-Antwort')];
        }
        if (isset($res['_error'])) {
            if ($all) {
                break;
            }
            return $res;
        }
        $rels = $res['data'];
        if (!$rels) {
            break;
        }
        array_push($all, ...$rels);

        if ($res['totalCount'] !== null) {
            if (count($all) >= $res['totalCount']) {
                break;
            }
        } elseif ($forge === 'github' && count($rels) < $pageSize) {
            break;
        }
    }

    return ['data' => $all];
}

function loadReleases(string $apiUrl, string $forge, string $githubToken = ''): array {
    $res = fetchAllReleases($apiUrl, $forge, $githubToken);
    if (isset($res['_error'])) {
        return ['latest' => '-', 'latest_date' => null, 'total' => 0, 'releases' => [], 'error' => $res['_error']];
    }
    $rels = $res['data'];

    $total      = 0;
    $latest     = '-';
    $latestDate = null;
    $parsed     = [];

    foreach ($rels as $idx => $rel) {
        $tag         = (string)($rel['tag_name'] ?? '-');
        $publishedAt = (string)($rel['published_at'] ?? ($rel['created_at'] ?? ''));
        if ($idx === 0) {
            $latest     = $tag;
            $latestDate = $publishedAt !== '' ? $publishedAt : null;
        }
        $assets = [];
        $relSum = 0;
        foreach (($rel['assets'] ?? []) as $a) {
            $cnt     = (int)($a['download_count'] ?? 0);
            $relSum += $cnt;
            $total  += $cnt;
            $assets[] = [
                'name'  => (string)($a['name'] ?? ''),
                'count' => $cnt,
            ];
        }
        $parsed[] = [
            'tag'          => $tag,
            'published_at' => $publishedAt !== '' ? $publishedAt : null,
            'sum'          => $relSum,
            'assets'       => $assets,
        ];
    }

    return [
        'latest'      => $latest,
        'latest_date' => $latestDate,
        'total'       => $total,
        'releases'    => $parsed,
        'error'       => null,
    ];
}

$items      = [];
$anyError   = false;
$anySuccess = false;

foreach ($repos as $entry) {
    $stats = loadReleases($entry['api'], $entry['forge'], $githubToken);
    $meta  = fetchRepoMeta($entry['repo_api'], $entry['forge'], $githubToken);
    if ($stats['error'] !== null) {
        $anyError = true;
    } else {
        $anySuccess = true;
    }
    $items[] = [
        'repo'        => $entry['repo'],
        'forge'       => $entry['forge'],
        'url'         => $entry['url'],
        'latest'      => $stats['latest'],
        'latest_date' => $stats['latest_date'],
        'total'       => $stats['total'],
        'stars'       => $meta['stars'],
        'open_issues' => $meta['open_issues'],
        'releases'    => $stats['releases'],
        'error'       => $stats['error'],
    ];
}

$tokenConfigured = ($githubToken !== '');
$tokenValid      = null;
$expiresIso      = null;
$daysLeft        = null;

if ($rateLimitInfo['expires_at'] !== null) {
    $expTs = strtotime($rateLimitInfo['expires_at']);
    if ($expTs !== false) {
        $expiresIso = gmdate('c', $expTs);
        $daysLeft   = (int)ceil(($expTs - time()) / 86400);
    }
}

if ($tokenConfigured) {
    if ($rateLimitInfo['auth_fail'] || ($daysLeft !== null && $daysLeft <= 0)) {
        $tokenValid = false;
    } elseif ($rateLimitInfo['limit'] !== null) {
        $tokenValid = ($rateLimitInfo['limit'] > 60);
    }
}

$tokenStatus = [
    'configured' => $tokenConfigured,
    'valid'      => $tokenValid,
    'limit'      => $rateLimitInfo['limit'],
    'remaining'  => $rateLimitInfo['remaining'],
    'expires_at' => $expiresIso,
    'days_left'  => $daysLeft,
];

if (!$anySuccess && $anyError && file_exists($staleFile)) {
    $staleJson = @file_get_contents($staleFile);
    $staleArr  = is_string($staleJson) ? json_decode($staleJson, true) : null;
    if (is_array($staleArr) && !empty($staleArr['items'])) {
        $staleArr['stale']        = true;
        $staleArr['stale_from']   = $staleArr['updated'] ?? null;
        $staleArr['token_status'] = $tokenStatus;
        $staleArr['git']          = getGitStatusInfo($repoDir);
        $staleArr['csrf_token']   = $csrfToken;
        echo json_encode($staleArr, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}

$nowStr = date('H:i:s');
$result = [
    'updated'      => $nowStr,
    'stale'        => false,
    'stale_from'   => null,
    'token_status' => $tokenStatus,
    'items'        => $items,
    'git'          => getGitStatusInfo($repoDir),
    'csrf_token'   => $csrfToken,
];

$json = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($anySuccess) {
    @file_put_contents($staleFile, $json);
}
@file_put_contents($cacheFile, $json);
echo $json;
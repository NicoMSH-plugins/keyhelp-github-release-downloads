<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$confFile = __DIR__ . '/download_box.conf';
$repoDir  = __DIR__;

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

    // Remote-Check mit 10-Minuten-Cache, damit nicht jeder Dashboard-Aufruf auf GitHub wartet
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

// POST ?action=update -> führt einen sauberen Fast-Forward-Pull auf origin/main aus
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && ($_GET['action'] ?? '') === 'update') {
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

function parseReposFromConf(string $confPath): array {
    if (!is_readable($confPath)) {
        return [];
    }

    $lines = file($confPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return [];
    }

    $repos = [];
    $seen  = [];

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#') || str_starts_with($trimmed, ';') || str_starts_with($trimmed, '//')) {
            continue;
        }
        if (str_contains($trimmed, '=')) {
            [, $trimmed] = explode('=', $trimmed, 2);
            $trimmed = trim($trimmed, " \t\n\r\0\x0B\"'");
        }
        if ($trimmed === '') {
            continue;
        }

        $normalizedUrl = rtrim($trimmed, "/ \t\n\r\0\x0B");
        // https://github.com/owner/repo  -> GitHub
        // https://<any-other-host>/owner/repo -> Gitea / Forgejo (API under /api/v1)
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
                $repos[] = [
                    'repo'  => $ownerRepo,
                    'forge' => $isGitHub ? 'github' : 'gitea',
                    'url'   => $isGitHub
                        ? 'https://github.com/' . $ownerRepo
                        : $scheme . '://' . $host . '/' . $ownerRepo,
                    'api'   => $isGitHub
                        ? 'https://api.github.com/repos/' . $ownerRepo . '/releases'
                        : $scheme . '://' . $host . '/api/v1/repos/' . $ownerRepo . '/releases',
                ];
            }
        }
    }

    return $repos;
}

$repos     = parseReposFromConf($confFile);
$confHash  = is_readable($confFile) ? md5_file($confFile) : 'empty';
$cacheFile = sys_get_temp_dir() . '/kh_plugin_stats_gh_' . $confHash . '.json';
$cacheTtl  = 60; // Sekunden Schutz vor Doppel-Reloads

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
    $cachedJson = @file_get_contents($cacheFile);
    $cachedArr  = is_string($cachedJson) ? json_decode($cachedJson, true) : null;
    if (is_array($cachedArr)) {
        $cachedArr['git'] = getGitStatusInfo($repoDir);
        echo json_encode($cachedArr, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}

function fetchJson(string $url): array {
    $ctx = stream_context_create([
        'http' => [
            'method'  => 'GET',
            'timeout' => 8,
            'header'  => "User-Agent: KeyHelp-Dashboard-Stats\r\nAccept: application/vnd.github+json\r\n",
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) {
        return ['_error' => 'Request fehlgeschlagen'];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['_error' => 'Ungültiges JSON'];
    }

    // Gitea liefert die Gesamtzahl im Header X-Total-Count (fürs Paging)
    // PHP 8.4+: http_get_last_response_headers(); $http_response_header ist ab 8.5 deprecated
    $headers = function_exists('http_get_last_response_headers')
        ? (http_get_last_response_headers() ?? [])
        : ($http_response_header ?? []);
    $totalCount = null;
    foreach ($headers as $h) {
        if (stripos($h, 'X-Total-Count:') === 0) {
            $totalCount = (int)trim(substr($h, strlen('X-Total-Count:')));
        }
    }
    return ['data' => $decoded, 'totalCount' => $totalCount];
}

// Holt alle Releases seitenweise (GitHub: per_page max. 100, Gitea: limit, Server-Maximum meist 50)
function fetchAllReleases(string $apiUrl, string $forge): array {
    $pageSize = $forge === 'github' ? 100 : 50;
    $sizeParam = $forge === 'github' ? 'per_page' : 'limit';
    $all = [];

    for ($page = 1; $page <= 20; $page++) {
        $res = fetchJson("{$apiUrl}?{$sizeParam}={$pageSize}&page={$page}");
        if (!isset($res['_error']) && !array_is_list($res['data'])) {
            $res = ['_error' => (string)($res['data']['message'] ?? 'Unerwartete API-Antwort')];
        }
        if (isset($res['_error'])) {
            // Fehler auf einer Folgeseite: bereits geladene Releases behalten
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
            // Gitea ohne X-Total-Count: weiter bis zur leeren Seite (Server-Maximum kann < limit sein)
            break;
        }
    }

    return ['data' => $all];
}

function loadReleases(string $apiUrl, string $forge): array {
    $res = fetchAllReleases($apiUrl, $forge);
    if (isset($res['_error'])) {
        return ['latest' => '-', 'total' => 0, 'releases' => [], 'error' => $res['_error']];
    }
    $rels = $res['data'];

    $total  = 0;
    $latest = '-';
    $parsed = [];

    foreach ($rels as $idx => $rel) {
        $tag = (string)($rel['tag_name'] ?? '-');
        if ($idx === 0) {
            $latest = $tag;
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
            'tag'    => $tag,
            'sum'    => $relSum,
            'assets' => $assets,
        ];
    }

    return [
        'latest'   => $latest,
        'total'    => $total,
        'releases' => $parsed,
        'error'    => null,
    ];
}

$items = [];
foreach ($repos as $entry) {
    $stats = loadReleases($entry['api'], $entry['forge']);
    $items[] = [
        'repo'     => $entry['repo'],
        'forge'    => $entry['forge'],
        'url'      => $entry['url'],
        'latest'   => $stats['latest'],
        'total'    => $stats['total'],
        'releases' => $stats['releases'],
        'error'    => $stats['error'],
    ];
}

$result = [
    'updated' => date('H:i:s'),
    'items'   => $items,
    'git'     => getGitStatusInfo($repoDir),
];

$json = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
@file_put_contents($cacheFile, $json);
echo $json;
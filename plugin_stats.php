<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$confFile = __DIR__ . '/download_box.conf';

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
    readfile($cacheFile);
    exit;
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
];

$json = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
@file_put_contents($cacheFile, $json);
echo $json;
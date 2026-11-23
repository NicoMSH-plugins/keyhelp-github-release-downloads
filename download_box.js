// ====================================================
// PLUGIN & RELEASE DOWNLOADS BOX (3-SPALTEN-LAYOUT, DARK & LIGHT MODE)
// ====================================================
if ('admin_dashboard' === getUrlQueryParameterValue('page')) {
    $(function() {
        if ($('#plugin-stats-card').length) return;

        // 1. Ziel-Position finden: zuerst AbuseIPDB, sonst Dashboard-Container / bestehende Karte
        function findDashboardAnchor() {
            let $abuseCard = $('#abuseipdb-status-card');
            if (!$abuseCard.length) {
                $abuseCard = $('.card, .box').filter(function() {
                    return $(this).text().includes('AbuseIPDB');
                }).first();
            }
            if ($abuseCard.length) {
                return { $el: $abuseCard, mode: 'before' };
            }

            const containerSelectors = [
                '#content .container-fluid',
                '#content .container',
                '.page-content .container-fluid',
                '.page-content .container',
                'main .container-fluid',
                'main .container',
                '#content',
                'main'
            ];

            for (const sel of containerSelectors) {
                const $container = $(sel).first();
                if ($container.length) {
                    return { $el: $container, mode: 'prepend' };
                }
            }

            const $anyCard = $('.card, .box').first();
            if ($anyCard.length) {
                return { $el: $anyCard, mode: 'before' };
            }

            return null;
        }

        const anchor = findDashboardAnchor();
        if (!anchor) {
            $(document).trigger('pluginStatsBoxReady');
            return;
        }

        let htmlLang = $('html').attr('lang') || '';
        let isGerman = htmlLang.toLowerCase().startsWith('de');

        const olderPayloads = new Map();

        function isLightThemeActive() {
            const targets = [document.body, document.documentElement];
            for (const el of targets) {
                if (!el) continue;
                const bg = window.getComputedStyle(el).backgroundColor;
                const match = bg && bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
                if (match) {
                    const r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);
                    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                    if (luminance > 0.62) return true;
                    if (luminance <= 0.62 && (r + g + b) > 0) return false;
                }
            }
            return false;
        }

        function syncThemeMode() {
            const cardEl = document.getElementById('plugin-stats-card');
            if (!cardEl) return;
            cardEl.setAttribute('data-kh-theme', isLightThemeActive() ? 'light' : 'dark');
        }

        const styleId = 'kh-plugin-stats-columns-styles';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        styleEl.textContent = `
            #plugin-stats-card {
                --kh-dl-col-bg: rgba(255, 255, 255, 0.02);
                --kh-dl-col-border: rgba(148, 163, 184, 0.14);
                --kh-dl-divider: rgba(148, 163, 184, 0.16);
                --kh-dl-title: #f8fafc;
                --kh-dl-text: #e2e8f0;
                --kh-dl-count: #cbd5e1;
                --kh-dl-muted: #94a3b8;
                --kh-dl-badge-bg: rgba(148, 163, 184, 0.12);
                --kh-dl-badge-border: rgba(148, 163, 184, 0.22);
                --kh-dl-badge-text: #e2e8f0;
                --kh-dl-rel-badge-bg: rgba(99, 102, 241, 0.15);
                --kh-dl-rel-badge-border: rgba(99, 102, 241, 0.35);
                --kh-dl-rel-badge-text: #a5b4fc;
                --kh-dl-total: #4ade80;
                --kh-dl-btn-bg: rgba(59, 130, 246, 0.12);
                --kh-dl-btn-border: rgba(59, 130, 246, 0.35);
                --kh-dl-btn-text: #93c5fd;
                --kh-dl-btn-hover: rgba(59, 130, 246, 0.22);
            }
            #plugin-stats-card[data-kh-theme="light"] {
                --kh-dl-col-bg: #f8fafc;
                --kh-dl-col-border: #cbd5e1;
                --kh-dl-divider: #cbd5e1;
                --kh-dl-title: #0f172a;
                --kh-dl-text: #1e293b;
                --kh-dl-count: #334155;
                --kh-dl-muted: #475569;
                --kh-dl-badge-bg: #e2e8f0;
                --kh-dl-badge-border: #cbd5e1;
                --kh-dl-badge-text: #1e293b;
                --kh-dl-rel-badge-bg: rgba(79, 70, 229, 0.11);
                --kh-dl-rel-badge-border: rgba(79, 70, 229, 0.3);
                --kh-dl-rel-badge-text: #4338ca;
                --kh-dl-total: #15803d;
                --kh-dl-btn-bg: rgba(37, 99, 235, 0.09);
                --kh-dl-btn-border: rgba(37, 99, 235, 0.3);
                --kh-dl-btn-text: #1d4ed8;
                --kh-dl-btn-hover: rgba(37, 99, 235, 0.16);
            }
            .kh-dl-columns-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 0.9rem;
                align-items: stretch;
            }
            @media (max-width: 960px) {
                .kh-dl-columns-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }
            @media (max-width: 640px) {
                .kh-dl-columns-grid {
                    grid-template-columns: 1fr;
                }
            }
            .kh-dl-col {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-width: 0;
                padding: 0.7rem 0.8rem;
                border-radius: 8px;
                background: var(--kh-dl-col-bg);
                border: 1px solid var(--kh-dl-col-border);
                box-sizing: border-box;
            }
            .kh-dl-col-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.5rem;
                padding-bottom: 0.5rem;
                margin-bottom: 0.55rem;
                border-bottom: 1px solid var(--kh-dl-divider);
            }
            .kh-dl-col-title {
                margin: 0;
                font-size: 0.8rem;
                font-weight: 700;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                color: var(--kh-dl-title);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .kh-dl-col-title a {
                color: inherit;
                text-decoration: none;
            }
            .kh-dl-col-title a:hover {
                text-decoration: underline;
            }
            .kh-dl-col-total {
                font-size: 0.82rem;
                font-weight: 700;
                color: var(--kh-dl-total);
                white-space: nowrap;
                flex-shrink: 0;
            }
            .kh-dl-latest-section {
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                padding-bottom: 0.65rem;
            }
            .kh-dl-version-bar {
                display: flex;
                align-items: center;
                margin-bottom: 0.4rem;
            }
            .kh-dl-version-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.3rem;
                padding: 0.12rem 0.55rem;
                border-radius: 999px;
                font-size: 0.72rem;
                font-weight: 600;
                line-height: 1.25;
                color: var(--kh-dl-badge-text);
                background: var(--kh-dl-badge-bg);
                border: 1px solid var(--kh-dl-badge-border);
                white-space: nowrap;
            }
            .kh-dl-file-list {
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
            }
            .kh-dl-file-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.6rem;
                padding: 0.26rem 0.15rem;
            }
            .kh-dl-file-name {
                font-size: 0.82rem;
                font-weight: 500;
                line-height: 1.25;
                color: var(--kh-dl-text);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .kh-dl-count-plain {
                font-size: 0.82rem;
                font-weight: 600;
                color: var(--kh-dl-count);
                line-height: 1.25;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .kh-dl-older-wrap {
                margin-top: auto;
                padding-top: 0.6rem;
                border-top: 1px solid var(--kh-dl-divider);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.5rem;
                min-height: 36px;
            }
            .kh-dl-popup-btn {
                display: inline-flex;
                align-items: center;
                gap: 0.4rem;
                padding: 0.28rem 0.65rem;
                border-radius: 6px;
                font-size: 0.75rem;
                font-weight: 600;
                color: var(--kh-dl-btn-text);
                background: var(--kh-dl-btn-bg);
                border: 1px solid var(--kh-dl-btn-border);
                cursor: pointer;
                transition: background 0.15s ease;
            }
            .kh-dl-popup-btn:hover {
                background: var(--kh-dl-btn-hover);
            }
            .kh-dl-empty {
                opacity: 0.85;
                font-size: 0.8rem;
                padding: 0.26rem 0.15rem;
                color: var(--kh-dl-muted);
            }
            #kh-dl-releases-popup {
                position: fixed;
                z-index: 99999;
                width: 340px;
                max-width: calc(100vw - 24px);
                max-height: 70vh;
                display: flex;
                flex-direction: column;
                border-radius: 10px;
                padding: 12px 14px;
                box-shadow: 0 18px 42px rgba(0, 0, 0, 0.55);
                background: #141b29;
                border: 1px solid rgba(148, 163, 184, 0.28);
                color: #e2e8f0;
                box-sizing: border-box;
                --kh-dl-badge-bg: rgba(148, 163, 184, 0.12);
                --kh-dl-badge-border: rgba(148, 163, 184, 0.22);
                --kh-dl-badge-text: #e2e8f0;
                --kh-dl-rel-badge-bg: rgba(99, 102, 241, 0.15);
                --kh-dl-rel-badge-border: rgba(99, 102, 241, 0.35);
                --kh-dl-rel-badge-text: #a5b4fc;
                --kh-dl-text: #e2e8f0;
                --kh-dl-count: #cbd5e1;
                --kh-dl-muted: #94a3b8;
            }
            #kh-dl-releases-popup[data-kh-theme="light"] {
                background: #ffffff;
                border: 1px solid #cbd5e1;
                color: #1e293b;
                box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
                --kh-dl-badge-bg: #e2e8f0;
                --kh-dl-badge-border: #cbd5e1;
                --kh-dl-badge-text: #1e293b;
                --kh-dl-rel-badge-bg: rgba(79, 70, 229, 0.11);
                --kh-dl-rel-badge-border: rgba(79, 70, 229, 0.3);
                --kh-dl-rel-badge-text: #4338ca;
                --kh-dl-text: #1e293b;
                --kh-dl-count: #334155;
                --kh-dl-muted: #475569;
            }
            .kh-dl-popup-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
                padding-bottom: 8px;
                margin-bottom: 8px;
                border-bottom: 1px solid rgba(148, 163, 184, 0.2);
                font-size: 0.82rem;
                font-weight: 700;
            }
            .kh-dl-popup-title-wrap {
                display: flex;
                flex-direction: column;
                gap: 2px;
                line-height: 1.3;
                word-break: break-word;
            }
            .kh-dl-popup-sub {
                font-size: 0.74rem;
                font-weight: 600;
                opacity: 0.78;
            }
            .kh-dl-popup-close {
                border: none;
                background: transparent;
                color: inherit;
                opacity: 0.7;
                font-size: 16px;
                line-height: 1;
                cursor: pointer;
                padding: 2px 6px;
                flex-shrink: 0;
            }
            .kh-dl-popup-close:hover {
                opacity: 1;
            }
            .kh-dl-popup-body {
                overflow-y: auto;
                display: flex;
                flex-direction: column;
            }
            .kh-dl-popup-rel-item {
                padding-top: 8px;
                margin-top: 8px;
                border-top: 1px solid rgba(148, 163, 184, 0.18);
            }
            .kh-dl-popup-rel-item:first-child {
                padding-top: 0;
                margin-top: 0;
                border-top: none;
            }
            .kh-dl-popup-rel-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.3rem;
                padding: 0.12rem 0.55rem;
                border-radius: 999px;
                font-size: 0.72rem;
                font-weight: 600;
                line-height: 1.25;
                margin-bottom: 5px;
                color: var(--kh-dl-rel-badge-text);
                background: var(--kh-dl-rel-badge-bg);
                border: 1px solid var(--kh-dl-rel-badge-border);
                white-space: nowrap;
            }
        `;

        let $statsBox = $(`
            <div class="card" id="plugin-stats-card" style="margin-top: 0 !important; margin-bottom: 1.5rem !important;">
                <header class="card-header">
                    <span class="card-header-icon">
                        <i class="fas fa-download" style="color: var(--kh-dl-muted);"></i>
                    </span>
                    <p class="card-header-title" style="font-size: 15px;">Release Downloads</p>
                    <span class="card-header-icon" id="plugin-stats-updated" style="font-size: 12px; color: var(--kh-dl-muted); padding-right: 1rem;">
                        ${isGerman ? 'Lade...' : 'Loading...'}
                    </span>
                </header>
                <div class="card-content" style="padding: 0.9rem 1.1rem;">
                    <div id="plugin-stats-content" style="color: var(--kh-dl-muted); font-size: 12px;">
                        ${isGerman ? 'Lade Statistik-Daten...' : 'Loading statistics...'}
                    </div>
                </div>
            </div>
        `);

        if (anchor.mode === 'before') {
            anchor.$el.before($statsBox);
        } else {
            anchor.$el.prepend($statsBox);
        }
        syncThemeMode();

        function closeReleasesPopup() {
            $('#kh-dl-releases-popup').remove();
            $(document).off('click.khDlPopup keydown.khDlPopup');
        }

        function openReleasesPopup(btnEl, repoKey) {
            const payload = olderPayloads.get(repoKey);
            if (!payload || !Array.isArray(payload.releases) || !payload.releases.length) return;

            closeReleasesPopup();

            const light = isLightThemeActive();
            const sectionsHtml = payload.releases.map(function(rel) {
                const safeTag = $('<div>').text(rel.tag || '').html();
                const rowsHtml = renderFileRows(rel.assets);
                return `
                    <div class="kh-dl-popup-rel-item">
                        <div class="kh-dl-popup-rel-badge">Release: ${safeTag}</div>
                        ${rowsHtml}
                    </div>
                `;
            }).join('');

            const safeRepoTitle = $('<div>').text(payload.title || 'Releases').html();
            const olderTitle = isGerman ? 'Ältere Releases' : 'Older Releases';
            const $popup = $(`
                <div id="kh-dl-releases-popup" data-kh-theme="${light ? 'light' : 'dark'}">
                    <div class="kh-dl-popup-header">
                        <div class="kh-dl-popup-title-wrap">
                            <span>${safeRepoTitle}</span>
                            <span class="kh-dl-popup-sub">${olderTitle}</span>
                        </div>
                        <button type="button" class="kh-dl-popup-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="kh-dl-popup-body">${sectionsHtml}</div>
                </div>
            `);

            $('body').append($popup);

            const rect = btnEl.getBoundingClientRect();
            const popupW = $popup.outerWidth() || 340;
            const popupH = $popup.outerHeight() || 220;

            let left = rect.left;
            if (left + popupW > window.innerWidth - 12) {
                left = window.innerWidth - popupW - 12;
            }
            if (left < 12) left = 12;

            let top = rect.bottom + 6;
            if (top + popupH > window.innerHeight - 12) {
                top = Math.max(12, rect.top - popupH - 6);
            }

            $popup.css({ top: top + 'px', left: left + 'px' });

            $popup.on('click', function(e) {
                e.stopPropagation();
            });

            $popup.find('.kh-dl-popup-close').on('click', closeReleasesPopup);

            setTimeout(function() {
                $(document).on('click.khDlPopup', closeReleasesPopup);
                $(document).on('keydown.khDlPopup', function(e) {
                    if (e.key === 'Escape') closeReleasesPopup();
                });
            }, 0);
        }

        function formatRepoTitle(repo) {
            const parts = String(repo || '').split('/');
            return parts.length > 1 ? parts[1] : parts[0];
        }

        function forgeIconClass(forge) {
            return forge === 'gitea' ? 'fab fa-git-alt' : 'fab fa-github';
        }

        function renderFileRows(assets) {
            if (!Array.isArray(assets) || !assets.length) {
                return `<div class="kh-dl-empty">-</div>`;
            }

            const rows = assets.map(function(a) {
                const safeName = $('<div>').text(a.name || '').html();
                const safeCount = $('<div>').text(String(a.count ?? 0)).html();
                return `
                    <div class="kh-dl-file-row" title="${safeName}">
                        <span class="kh-dl-file-name">${safeName}</span>
                        <span class="kh-dl-count-plain">${safeCount}</span>
                    </div>
                `;
            }).join('');

            return `<div class="kh-dl-file-list">${rows}</div>`;
        }

        function renderOlderTrigger(repoKey, titleText, releases) {
            const olderReleases = Array.isArray(releases) && releases.length > 1 ? releases.slice(1) : [];

            if (!olderReleases.length) {
                return `
                    <div class="kh-dl-older-wrap">
                        <span class="kh-dl-empty" style="padding: 0;">${isGerman ? 'Keine weiteren Releases' : 'No older releases'}</span>
                    </div>
                `;
            }

            olderPayloads.set(repoKey, {
                title: titleText,
                releases: olderReleases
            });

            const btnLabel = isGerman
                ? `Ältere Releases (${olderReleases.length})`
                : `Older Releases (${olderReleases.length})`;

            return `
                <div class="kh-dl-older-wrap">
                    <button type="button" class="kh-dl-popup-btn" data-repo-key="${$('<div>').text(repoKey).html()}">
                        <i class="fas fa-history"></i>
                        <span>${btnLabel}</span>
                    </button>
                </div>
            `;
        }

        function renderGhColumn(ghData, idx) {
            const total = (ghData && typeof ghData.total !== 'undefined') ? ghData.total : 0;
            const latestTag = (ghData && ghData.latest) ? ghData.latest : '-';
            const releases = (ghData && Array.isArray(ghData.releases)) ? ghData.releases : [];
            const titleText = formatRepoTitle(ghData.repo);
            const repoKey = String(ghData.url || ghData.repo || ('repo-' + idx));
            const repoUrl = ghData.url || (ghData.repo ? `https://github.com/${ghData.repo}` : '');
            const iconClass = forgeIconClass(ghData.forge);

            const safeTitleText = $('<div>').text(titleText).html();
            const safeLatestTag = $('<div>').text(latestTag).html();
            const safeTotal = $('<div>').text(String(total)).html();
            const safeUrl = $('<div>').text(repoUrl).html();

            const titleHtml = safeUrl
                ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitleText}</a>`
                : safeTitleText;

            const latestRowsHtml = ghData.error
                ? `<div class="kh-dl-empty" style="color: #dc2626;">${$('<div>').text(String(ghData.error)).html()}</div>`
                : releases.length
                    ? renderFileRows(releases[0].assets)
                    : `<div class="kh-dl-empty">-</div>`;

            const olderTriggerHtml = renderOlderTrigger(repoKey, titleText, releases);

            return `
                <div class="kh-dl-col">
                    <div class="kh-dl-col-header">
                        <h4 class="kh-dl-col-title">
                            <i class="${iconClass}" style="margin-right: 6px; color: var(--kh-dl-muted);"></i>${titleHtml}
                        </h4>
                        <span class="kh-dl-col-total">${safeTotal}</span>
                    </div>

                    <div class="kh-dl-latest-section">
                        <div class="kh-dl-version-bar">
                            <span class="kh-dl-version-badge">Latest: ${safeLatestTag}</span>
                        </div>
                        ${latestRowsHtml}
                    </div>

                    ${olderTriggerHtml}
                </div>
            `;
        }

        $('#plugin-stats-content').on('click', '.kh-dl-popup-btn', function(e) {
            e.stopPropagation();
            const repoKey = $(this).attr('data-repo-key');
            openReleasesPopup(this, repoKey);
        });

        // 2. Einmaliger Abruf beim Öffnen des Dashboards (kein setInterval)
        $.getJSON('dashboard-layout/plugin_stats.php?_=' + Date.now(), function(data) {
            let updatedTime = data.updated || '-';
            $('#plugin-stats-updated').text((isGerman ? 'Stand: ' : 'Updated: ') + updatedTime);

            let items = Array.isArray(data.items) ? data.items : [];
            if (!items.length) {
                let emptyMsg = isGerman
                    ? 'Keine Repository-URLs (GitHub/Gitea) in <code>download_box.conf</code> eingetragen. Falls die Datei fehlt, <code>download_box.conf.example</code> nach <code>download_box.conf</code> kopieren und mindestens eine Repository-URL eintragen.'
                    : 'No repository URLs (GitHub/Gitea) found in <code>download_box.conf</code>. If the file is missing, copy <code>download_box.conf.example</code> to <code>download_box.conf</code> and add at least one repository URL.';
                $('#plugin-stats-content').html(`<div class="kh-dl-empty">${emptyMsg}</div>`);
                syncThemeMode();
                $(document).trigger('pluginStatsBoxReady');
                return;
            }

            olderPayloads.clear();
            const colsHtml = items.map(renderGhColumn).join('');
            $('#plugin-stats-content').html(`<div class="kh-dl-columns-grid">${colsHtml}</div>`);
            syncThemeMode();
            $(document).trigger('pluginStatsBoxReady');
        }).fail(function(jqXHR) {
            let errMsg = isGerman
                ? `Konnte plugin_stats.php nicht laden (Status ${jqXHR.status || 'Fehler'}).`
                : `Failed to load plugin_stats.php (Status ${jqXHR.status || 'Error'}).`;
            $('#plugin-stats-updated').text(isGerman ? 'Fehler' : 'Error');
            $('#plugin-stats-content').html(`<div style="color: #dc2626; font-size: 12px;">${errMsg}</div>`);
            syncThemeMode();
            $(document).trigger('pluginStatsBoxReady');
        });
    });
}
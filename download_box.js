// ====================================================
// PLUGIN & RELEASE DOWNLOADS BOX (3 SPALTEN IN SPALTE / 6 SPALTEN IN VOLLBREITE)
// ====================================================
if ('admin_dashboard' === getUrlQueryParameterValue('page')) {
    $(function() {
        if ($('#plugin-stats-card').length) return;

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
        let currentCsrfToken = '';

        const SORT_STORAGE_KEY = 'kh_dl_sort_mode';
        const VALID_SORTS = ['manual', 'downloads', 'latest', 'name'];
        let lastRawItems = [];
        let lastFooterHtml = '';

        const olderPayloads = new Map();

        function getSavedSortMode() {
            try {
                const v = window.localStorage.getItem(SORT_STORAGE_KEY);
                return VALID_SORTS.includes(v) ? v : '';
            } catch (e) {
                return '';
            }
        }

        function setSavedSortMode(mode) {
            try {
                if (VALID_SORTS.includes(mode)) {
                    window.localStorage.setItem(SORT_STORAGE_KEY, mode);
                }
            } catch (e) {
                // ignore storage errors
            }
        }

        function escapeHtml(val) {
            return $('<div>').text(String(val ?? '')).html();
        }

        function isFullWidthPlacement() {
            const cardEl = document.getElementById('plugin-stats-card');
            if (!cardEl) return false;
            if (cardEl.closest('#kh-fullwidth-top-zone, #kh-fullwidth-bottom-zone')) {
                return true;
            }
            if (cardEl.closest('.column')) {
                return false;
            }
            return (cardEl.getBoundingClientRect().width || 0) >= 900;
        }

        function syncBoxPlacementMode() {
            const cardEl = document.getElementById('plugin-stats-card');
            if (!cardEl) return;
            cardEl.setAttribute('data-kh-dl-mode', isFullWidthPlacement() ? 'fullwidth' : 'column');
        }

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
            syncBoxPlacementMode();
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
                --kh-dl-select-bg: #1e293b;
                --kh-dl-new-bg: rgba(56, 189, 248, 0.15);
                --kh-dl-new-border: rgba(56, 189, 248, 0.38);
                --kh-dl-new-text: #7dd3fc;
                --kh-dl-rel-badge-bg: rgba(99, 102, 241, 0.15);
                --kh-dl-rel-badge-border: rgba(99, 102, 241, 0.35);
                --kh-dl-rel-badge-text: #a5b4fc;
                --kh-dl-total: #4ade80;
                --kh-dl-btn-bg: rgba(59, 130, 246, 0.12);
                --kh-dl-btn-border: rgba(59, 130, 246, 0.35);
                --kh-dl-btn-text: #93c5fd;
                --kh-dl-btn-hover: rgba(59, 130, 246, 0.22);
                --kh-dl-upd-bg: rgba(34, 197, 94, 0.14);
                --kh-dl-upd-border: rgba(34, 197, 94, 0.38);
                --kh-dl-upd-text: #86efac;
                --kh-dl-upd-hover: rgba(34, 197, 94, 0.24);
                --kh-dl-tok-warn-bg: rgba(245, 158, 11, 0.16);
                --kh-dl-tok-warn-border: rgba(245, 158, 11, 0.42);
                --kh-dl-tok-warn-text: #fcd34d;
                --kh-dl-tok-err-bg: rgba(239, 68, 68, 0.15);
                --kh-dl-tok-err-border: rgba(239, 68, 68, 0.42);
                --kh-dl-tok-err-text: #fca5a5;
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
                --kh-dl-select-bg: #ffffff;
                --kh-dl-new-bg: rgba(2, 132, 199, 0.11);
                --kh-dl-new-border: rgba(2, 132, 199, 0.32);
                --kh-dl-new-text: #0369a1;
                --kh-dl-rel-badge-bg: rgba(79, 70, 229, 0.11);
                --kh-dl-rel-badge-border: rgba(79, 70, 229, 0.3);
                --kh-dl-rel-badge-text: #4338ca;
                --kh-dl-total: #15803d;
                --kh-dl-btn-bg: rgba(37, 99, 235, 0.09);
                --kh-dl-btn-border: rgba(37, 99, 235, 0.3);
                --kh-dl-btn-text: #1d4ed8;
                --kh-dl-btn-hover: rgba(37, 99, 235, 0.16);
                --kh-dl-upd-bg: rgba(21, 128, 61, 0.1);
                --kh-dl-upd-border: rgba(21, 128, 61, 0.32);
                --kh-dl-upd-text: #15803d;
                --kh-dl-upd-hover: rgba(21, 128, 61, 0.18);
                --kh-dl-tok-warn-bg: rgba(217, 119, 6, 0.12);
                --kh-dl-tok-warn-border: rgba(217, 119, 6, 0.38);
                --kh-dl-tok-warn-text: #b45309;
                --kh-dl-tok-err-bg: rgba(220, 38, 38, 0.11);
                --kh-dl-tok-err-border: rgba(220, 38, 38, 0.35);
                --kh-dl-tok-err-text: #b91c1c;
            }
            .kh-dl-token-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.3rem;
                padding: 0.1rem 0.5rem;
                border-radius: 999px;
                font-size: 0.7rem;
                font-weight: 600;
                line-height: 1.2;
                white-space: nowrap;
            }
            .kh-dl-token-badge--ok {
                color: var(--kh-dl-upd-text);
                background: var(--kh-dl-upd-bg);
                border: 1px solid var(--kh-dl-upd-border);
            }
            .kh-dl-token-badge--warn {
                color: var(--kh-dl-tok-warn-text);
                background: var(--kh-dl-tok-warn-bg);
                border: 1px solid var(--kh-dl-tok-warn-border);
            }
            .kh-dl-token-badge--err {
                color: var(--kh-dl-tok-err-text);
                background: var(--kh-dl-tok-err-bg);
                border: 1px solid var(--kh-dl-tok-err-border);
            }
            .kh-dl-token-badge--none {
                color: var(--kh-dl-muted);
                background: var(--kh-dl-badge-bg);
                border: 1px solid var(--kh-dl-badge-border);
            }
            .kh-dl-header-meta {
                display: inline-flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 0.65rem;
                margin-left: auto;
                padding-right: 1rem;
                font-size: 12px;
                color: var(--kh-dl-muted);
            }
            .kh-dl-sort-select {
                height: 24px;
                padding: 0 0.45rem;
                border-radius: 5px;
                border: 1px solid var(--kh-dl-badge-border);
                background: var(--kh-dl-select-bg);
                color: var(--kh-dl-badge-text);
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                outline: none;
            }
            .kh-dl-sort-select:hover,
            .kh-dl-sort-select:focus {
                border-color: var(--kh-dl-btn-border);
            }
            .kh-dl-header-sum {
                font-weight: 700;
                color: var(--kh-dl-total);
                white-space: nowrap;
            }
            .kh-dl-refresh-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                border-radius: 5px;
                border: 1px solid var(--kh-dl-badge-border);
                background: var(--kh-dl-badge-bg);
                color: var(--kh-dl-muted);
                cursor: pointer;
                padding: 0;
            }
            .kh-dl-refresh-btn:hover:not(:disabled) {
                color: var(--kh-dl-title);
            }
            .kh-dl-columns-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 0.9rem;
                align-items: stretch;
            }
            #plugin-stats-card[data-kh-dl-mode="fullwidth"] .kh-dl-columns-grid {
                grid-template-columns: repeat(6, minmax(0, 1fr));
            }
            @media (max-width: 1400px) {
                #plugin-stats-card[data-kh-dl-mode="fullwidth"] .kh-dl-columns-grid {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                }
            }
            @media (max-width: 960px) {
                .kh-dl-columns-grid,
                #plugin-stats-card[data-kh-dl-mode="fullwidth"] .kh-dl-columns-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }
            @media (max-width: 640px) {
                .kh-dl-columns-grid,
                #plugin-stats-card[data-kh-dl-mode="fullwidth"] .kh-dl-columns-grid {
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
            .kh-dl-meta-row {
                display: flex;
                align-items: center;
                gap: 0.55rem;
                margin-bottom: 0.45rem;
                font-size: 0.72rem;
                color: var(--kh-dl-muted);
            }
            .kh-dl-meta-item {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
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
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 0.35rem;
                margin-bottom: 0.4rem;
            }
            .kh-dl-version-left {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                flex-wrap: wrap;
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
            .kh-dl-new-badge {
                display: inline-flex;
                align-items: center;
                padding: 0.1rem 0.45rem;
                border-radius: 999px;
                font-size: 0.68rem;
                font-weight: 700;
                line-height: 1.2;
                color: var(--kh-dl-new-text);
                background: var(--kh-dl-new-bg);
                border: 1px solid var(--kh-dl-new-border);
                white-space: nowrap;
            }
            .kh-dl-rel-date {
                font-size: 0.7rem;
                color: var(--kh-dl-muted);
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
            .kh-dl-status-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 0.5rem;
                margin-top: 0.75rem;
                padding-top: 0.55rem;
                border-top: 1px solid var(--kh-dl-divider);
                font-size: 0.75rem;
                color: var(--kh-dl-muted);
            }
            .kh-dl-status-left,
            .kh-dl-status-right {
                display: inline-flex;
                align-items: center;
                gap: 0.45rem;
                flex-wrap: wrap;
            }
            .kh-dl-update-btn {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                padding: 0.2rem 0.55rem;
                border-radius: 5px;
                font-size: 0.72rem;
                font-weight: 600;
                color: var(--kh-dl-upd-text);
                background: var(--kh-dl-upd-bg);
                border: 1px solid var(--kh-dl-upd-border);
                cursor: pointer;
                text-decoration: none;
                transition: background 0.15s ease;
            }
            .kh-dl-update-btn:hover:not(:disabled) {
                background: var(--kh-dl-upd-hover);
            }
            .kh-dl-update-btn:disabled {
                opacity: 0.65;
                cursor: wait;
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

        const sortOptionsHtml = isGerman
            ? `
                <option value="manual">Reihenfolge: Standard</option>
                <option value="downloads">Sortierung: Downloads</option>
                <option value="latest">Sortierung: Neuestes</option>
                <option value="name">Sortierung: Name (A–Z)</option>
              `
            : `
                <option value="manual">Order: Default</option>
                <option value="downloads">Sort: Downloads</option>
                <option value="latest">Sort: Latest</option>
                <option value="name">Sort: Name (A–Z)</option>
              `;

        let $statsBox = $(`
            <div class="card" id="plugin-stats-card" style="margin-top: 0 !important; margin-bottom: 1.5rem !important;">
                <header class="card-header">
                    <span class="card-header-icon">
                        <i class="fas fa-download" style="color: var(--kh-dl-muted);"></i>
                    </span>
                    <p class="card-header-title" style="font-size: 15px;">Release Downloads</p>
                    <div class="kh-dl-header-meta">
                        <select class="kh-dl-sort-select" id="kh-dl-sort-select" title="${isGerman ? 'Sortierung wählen' : 'Choose sort order'}" aria-label="Sort order">
                            ${sortOptionsHtml}
                        </select>
                        <span class="kh-dl-header-sum" id="plugin-stats-total-sum"></span>
                        <span id="plugin-stats-updated">${isGerman ? 'Lade...' : 'Loading...'}</span>
                        <button type="button" class="kh-dl-refresh-btn" id="kh-dl-refresh-btn" title="${isGerman ? 'Jetzt aktualisieren' : 'Refresh now'}" aria-label="Refresh">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
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

        const initialSavedSort = getSavedSortMode();
        if (initialSavedSort) {
            $('#kh-dl-sort-select').val(initialSavedSort);
        }

        function sortClientItems(items, sortMode) {
            const list = items.slice();
            if (sortMode === 'downloads') {
                list.sort(function(a, b) {
                    return (Number(b && b.total) || 0) - (Number(a && a.total) || 0);
                });
            } else if (sortMode === 'latest') {
                list.sort(function(a, b) {
                    const tsA = (a && a.latest_date) ? Date.parse(a.latest_date) || 0 : 0;
                    const tsB = (b && b.latest_date) ? Date.parse(b.latest_date) || 0 : 0;
                    return tsB - tsA;
                });
            } else if (sortMode === 'name') {
                list.sort(function(a, b) {
                    const nameA = formatRepoTitle(a && a.repo).toLowerCase();
                    const nameB = formatRepoTitle(b && b.repo).toLowerCase();
                    return nameA.localeCompare(nameB);
                });
            }
            return list;
        }

        function renderColumnsFromCache() {
            if (!lastRawItems.length) return;
            syncBoxPlacementMode();
            const activeSort = String($('#kh-dl-sort-select').val() || 'manual');
            const sortedItems = sortClientItems(lastRawItems, activeSort);
            olderPayloads.clear();
            const colsHtml = sortedItems.map(renderGhColumn).join('');
            $('#plugin-stats-content').html(`<div class="kh-dl-columns-grid">${colsHtml}</div>${lastFooterHtml}`);
            syncThemeMode();
        }

        function buildUpdateTooltip(gitInfo, latestVer) {
            const commits = Array.isArray(gitInfo && gitInfo.commits) ? gitInfo.commits : [];
            const header = isGerman
                ? `Update auf ${latestVer} per git pull`
                : `Update to ${latestVer} via git pull`;

            if (!commits.length) {
                return header;
            }

            const listTitle = isGerman ? 'Änderungen:' : 'Changes:';
            const lines = commits.map(function(c) {
                return '• ' + String(c || '').trim();
            }).filter(Boolean);

            return [header, '', listTitle, ...lines].join('\n');
        }

        function formatShortDate(isoStr) {
            if (!isoStr) return '';
            const d = new Date(isoStr);
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleDateString(isGerman ? 'de-DE' : 'en-US', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }

        function isNewRelease(isoStr) {
            if (!isoStr) return false;
            const d = new Date(isoStr);
            if (Number.isNaN(d.getTime())) return false;
            const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
            return ageDays >= 0 && ageDays <= 7;
        }

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
                const safeTag = escapeHtml(rel.tag || '');
                const dateStr = formatShortDate(rel.published_at);
                const rowsHtml = renderFileRows(rel.assets);
                return `
                    <div class="kh-dl-popup-rel-item">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:5px;">
                            <div class="kh-dl-popup-rel-badge" style="margin-bottom:0;">Release: ${safeTag}</div>
                            ${dateStr ? `<span class="kh-dl-rel-date">${escapeHtml(dateStr)}</span>` : ''}
                        </div>
                        ${rowsHtml}
                    </div>
                `;
            }).join('');

            const safeRepoTitle = escapeHtml(payload.title || 'Releases');
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

        function renderFileRows(assets, extraRows = []) {
            const list = [];
            if (Array.isArray(assets)) {
                assets.forEach(function(a) {
                    list.push({
                        name: a.name || '',
                        count: a.count ?? 0,
                        muted: false
                    });
                });
            }
            if (Array.isArray(extraRows)) {
                extraRows.forEach(function(r) {
                    list.push({
                        name: r.name || '',
                        count: r.count ?? 0,
                        muted: Boolean(r.muted)
                    });
                });
            }

            if (!list.length) {
                return `<div class="kh-dl-empty">-</div>`;
            }

            const rows = list.map(function(item) {
                const safeName = escapeHtml(item.name);
                const safeCount = escapeHtml(item.count);
                const extraStyle = item.muted ? ' style="color: var(--kh-dl-muted); font-size: 0.76rem;"' : '';
                return `
                    <div class="kh-dl-file-row" title="${safeName}"${extraStyle}>
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
                    <button type="button" class="kh-dl-popup-btn" data-repo-key="${escapeHtml(repoKey)}">
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

            const safeTitleText = escapeHtml(titleText);
            const safeTotal = escapeHtml(total);
            const safeUrl = escapeHtml(repoUrl);

            const titleHtml = safeUrl
                ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitleText}</a>`
                : safeTitleText;

            const hasStars = typeof ghData.stars === 'number';
            const hasIssues = typeof ghData.open_issues === 'number';
            const metaHtml = (hasStars || hasIssues)
                ? `
                    <div class="kh-dl-meta-row">
                        ${hasStars ? `<span class="kh-dl-meta-item" title="Stars"><i class="far fa-star"></i><span>${escapeHtml(ghData.stars)}</span></span>` : ''}
                        ${hasIssues ? `<span class="kh-dl-meta-item" title="${isGerman ? 'Offene Issues' : 'Open issues'}"><i class="far fa-dot-circle"></i><span>${escapeHtml(ghData.open_issues)}</span></span>` : ''}
                    </div>
                  `
                : '';

            const latestDateStr = formatShortDate(ghData.latest_date);
            const isNew = isNewRelease(ghData.latest_date);
            const newBadgeHtml = isNew
                ? `<span class="kh-dl-new-badge">${isGerman ? 'NEU' : 'NEW'}</span>`
                : '';

            const gitClones = Number(ghData && ghData.git_clones) || 0;
            const extraCloneRows = (ghData && ghData.forge === 'github' && gitClones > 0)
                ? [{
                    name: isGerman ? 'Git Clones (gesammelt)' : 'Git Clones (accumulated)',
                    count: gitClones,
                    muted: true
                }]
                : [];

            const badgeText = (!releases.length && ghData && ghData.version_label)
                ? ghData.version_label
                : `Latest: ${latestTag}`;
            const safeBadgeText = escapeHtml(badgeText);

            const latestRowsHtml = ghData.error
                ? `<div class="kh-dl-empty" style="color: #dc2626;">${escapeHtml(ghData.error)}</div>`
                : releases.length
                    ? renderFileRows(releases[0].assets, extraCloneRows)
                    : (extraCloneRows.length ? renderFileRows([], extraCloneRows) : `<div class="kh-dl-empty">-</div>`);

            const olderTriggerHtml = renderOlderTrigger(repoKey, titleText, releases);

            return `
                <div class="kh-dl-col">
                    <div class="kh-dl-col-header">
                        <h4 class="kh-dl-col-title">
                            <i class="${iconClass}" style="margin-right: 6px; color: var(--kh-dl-muted);"></i>${titleHtml}
                        </h4>
                        <span class="kh-dl-col-total">${safeTotal}</span>
                    </div>
                    ${metaHtml}
                    <div class="kh-dl-latest-section">
                        <div class="kh-dl-version-bar">
                            <div class="kh-dl-version-left">
                                <span class="kh-dl-version-badge">${safeBadgeText}</span>
                                ${newBadgeHtml}
                            </div>
                            ${latestDateStr ? `<span class="kh-dl-rel-date">${escapeHtml(latestDateStr)}</span>` : ''}
                        </div>
                        ${latestRowsHtml}
                    </div>

                    ${olderTriggerHtml}
                </div>
            `;
        }

        function renderTokenBadge(tokenStatus) {
            if (!tokenStatus || typeof tokenStatus !== 'object') {
                return '';
            }
            const configured = Boolean(tokenStatus.configured);
            const valid = tokenStatus.valid;
            const rem = (typeof tokenStatus.remaining === 'number') ? tokenStatus.remaining : null;
            const lim = (typeof tokenStatus.limit === 'number') ? tokenStatus.limit : null;
            const daysLeft = (typeof tokenStatus.days_left === 'number') ? tokenStatus.days_left : null;
            const expDateStr = formatShortDate(tokenStatus.expires_at);

            const quotaStr = (rem !== null && lim !== null) ? `${rem}/${lim}` : '';
            const expTooltip = expDateStr
                ? (isGerman ? `Ablaufdatum: ${expDateStr}` : `Expires: ${expDateStr}`)
                : '';

            if (!configured) {
                const label = isGerman ? 'Kein Token (60/h)' : 'No token (60/h)';
                const title = isGerman ? 'Kein GITHUB_TOKEN in download_box.conf gesetzt' : 'No GITHUB_TOKEN set in download_box.conf';
                return `<span class="kh-dl-token-badge kh-dl-token-badge--none" title="${escapeHtml(title)}"><i class="fas fa-key"></i><span>${escapeHtml(label)}</span></span>`;
            }

            if (valid === false) {
                const isExpired = (daysLeft !== null && daysLeft <= 0);
                const label = isExpired
                    ? (isGerman ? 'Token abgelaufen' : 'Token expired')
                    : (isGerman ? 'Token ungültig' : 'Token invalid');
                const titleParts = [
                    isExpired
                        ? (isGerman ? 'GITHUB_TOKEN ist abgelaufen' : 'GITHUB_TOKEN has expired')
                        : (isGerman ? 'GITHUB_TOKEN ist ungültig oder abgelaufen' : 'GITHUB_TOKEN is invalid or expired'),
                    expTooltip
                ].filter(Boolean);
                return `<span class="kh-dl-token-badge kh-dl-token-badge--err" title="${escapeHtml(titleParts.join(' • '))}"><i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(label)}</span></span>`;
            }

            if (valid === true) {
                let daysText = '';
                let badgeClass = 'kh-dl-token-badge--ok';
                if (daysLeft !== null) {
                    const dayWord = isGerman
                        ? (daysLeft === 1 ? 'Tag' : 'Tage')
                        : (daysLeft === 1 ? 'day' : 'days');
                    daysText = isGerman ? `noch ${daysLeft} ${dayWord}` : `${daysLeft} ${dayWord} left`;
                    if (daysLeft <= 14) {
                        badgeClass = 'kh-dl-token-badge--warn';
                    }
                }
                const label = daysText
                    ? (isGerman
                        ? `${daysLeft <= 14 ? 'Token läuft ab' : 'Token gültig'} (${daysText})`
                        : `${daysLeft <= 14 ? 'Token expiring' : 'Token valid'} (${daysText})`)
                    : (isGerman ? 'Token gültig' : 'Token valid');

                const titleParts = [
                    isGerman ? 'GITHUB_TOKEN aktiv' : 'GITHUB_TOKEN active',
                    expTooltip,
                    quotaStr ? `API: ${quotaStr}` : ''
                ].filter(Boolean);

                return `<span class="kh-dl-token-badge ${badgeClass}" title="${escapeHtml(titleParts.join(' • '))}"><i class="fas fa-key"></i><span>${escapeHtml(label)}</span></span>`;
            }

            const label = isGerman ? 'Token gesetzt' : 'Token set';
            const titleParts = [
                isGerman ? 'GITHUB_TOKEN konfiguriert' : 'GITHUB_TOKEN configured',
                expTooltip,
                quotaStr ? `API: ${quotaStr}` : ''
            ].filter(Boolean);
            return `<span class="kh-dl-token-badge kh-dl-token-badge--none" title="${escapeHtml(titleParts.join(' • '))}"><i class="fas fa-key"></i><span>${escapeHtml(label)}</span></span>`;
        }

        function renderStatusFooter(gitInfo, tokenStatus) {
            const tokenHtml = renderTokenBadge(tokenStatus);
            if (!gitInfo || typeof gitInfo !== 'object') {
                return tokenHtml
                    ? `<div class="kh-dl-status-footer" id="kh-dl-status-footer"><div class="kh-dl-status-left"></div><div class="kh-dl-status-right">${tokenHtml}</div></div>`
                    : '';
            }

            const mode = gitInfo.mode || 'git';
            const currentVer = escapeHtml(gitInfo.current_version || '-');
            const latestVer = escapeHtml(gitInfo.latest_version || currentVer);
            const hasUpdate = Boolean(gitInfo.has_update);

            const verLabel = isGerman
                ? `Installierte Version: <strong>${currentVer}</strong>`
                : `Installed version: <strong>${currentVer}</strong>`;

            let updateHtml = '';
            if (mode === 'wget') {
                if (hasUpdate) {
                    const safeRelUrl = escapeHtml(gitInfo.release_url || 'https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases');
                    const labelText = isGerman
                        ? `Neue Version verfügbar (${latestVer})`
                        : `New version available (${latestVer})`;
                    const hintText = isGerman ? 'Release öffnen' : 'Open release';
                    updateHtml = `
                        <span style="color: var(--kh-dl-upd-text); font-weight: 600;">${labelText}</span>
                        <a href="${safeRelUrl}" target="_blank" rel="noopener noreferrer" class="kh-dl-update-btn">
                            <i class="fas fa-external-link-alt"></i>
                            <span>${hintText}</span>
                        </a>
                    `;
                } else {
                    updateHtml = `<span style="opacity: 0.85;">• ${isGerman ? 'Aktuelle Version' : 'Up to date'}</span>`;
                }
            } else {
                if (hasUpdate) {
                    const commits = Array.isArray(gitInfo.commits) ? gitInfo.commits : [];
                    const tooltipText = buildUpdateTooltip(gitInfo, latestVer);
                    const hasCommits = commits.length > 0;
                    updateHtml = `
                        <span style="color: var(--kh-dl-upd-text); font-weight: 600;">
                            ${isGerman ? `Neue Version verfügbar (${latestVer})` : `New version available (${latestVer})`}
                        </span>
                        <button type="button" class="kh-dl-update-btn" id="kh-dl-git-update-btn" title="${escapeHtml(tooltipText)}">
                            <i class="fas fa-sync-alt"></i>
                            <span>Update</span>
                            ${hasCommits ? `<i class="fas fa-list-ul" style="opacity: 0.8;"></i>` : ''}
                        </button>
                    `;
                } else {
                    updateHtml = `<span style="opacity: 0.85;">• ${isGerman ? 'Aktuelle Version' : 'Up to date'}</span>`;
                }
            }

            const leftIcon = mode === 'wget' ? 'fas fa-download' : 'fab fa-git-alt';

            return `
                <div class="kh-dl-status-footer" id="kh-dl-status-footer">
                    <div class="kh-dl-status-left" id="kh-dl-status-left">
                        <i class="${leftIcon}"></i>
                        <span>${verLabel}</span>
                        ${updateHtml}
                    </div>
                    <div class="kh-dl-status-right" id="kh-dl-status-right">
                        ${tokenHtml}
                    </div>
                </div>
            `;
        }

        $('#kh-dl-sort-select').on('change', function() {
            const selected = String($(this).val() || 'manual');
            setSavedSortMode(selected);
            renderColumnsFromCache();
        });

        $('#plugin-stats-content').on('click', '.kh-dl-popup-btn', function(e) {
            e.stopPropagation();
            const repoKey = $(this).attr('data-repo-key');
            openReleasesPopup(this, repoKey);
        });

        $('#plugin-stats-content').on('click', '#kh-dl-git-update-btn', function(e) {
            e.preventDefault();
            const $btn = $(this);
            if ($btn.prop('disabled')) return;

            $btn.prop('disabled', true);
            $btn.find('i').first().addClass('fa-spin');
            $btn.find('span').text(isGerman ? 'Aktualisiere...' : 'Updating...');

            if (!currentCsrfToken) {
                $btn.prop('disabled', false);
                $btn.find('i').first().removeClass('fa-spin');
                $btn.find('span').text('Update');
                loadStats(false);
                return;
            }

            $.ajax({
                url: 'dashboard-layout/plugin_stats.php?action=update',
                method: 'POST',
                headers: { 'X-CSRF-Token': currentCsrfToken },
                dataType: 'json'
            }).done(function(res) {
                if (res && res.ok) {
                    window.location.reload();
                    return;
                }
                const msg = (res && res.error) ? res.error : (isGerman ? 'Update fehlgeschlagen.' : 'Update failed.');
                $btn.prop('disabled', false);
                $btn.find('i').first().removeClass('fa-spin');
                $btn.find('span').text('Update');
                $('#kh-dl-status-right').append(`<span style="color: #dc2626;">${escapeHtml(msg)}</span>`);
            }).fail(function(jqXHR) {
                let errDetail = isGerman ? 'Update fehlgeschlagen.' : 'Update failed.';
                if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                    errDetail = jqXHR.responseJSON.error;
                }
                $btn.prop('disabled', false);
                $btn.find('i').first().removeClass('fa-spin');
                $btn.find('span').text('Update');
                $('#kh-dl-status-right').append(`<span style="color: #dc2626;">${escapeHtml(errDetail)}</span>`);
            });
        });

        function loadStats(forceRefresh) {
            const $refreshBtn = $('#kh-dl-refresh-btn');
            $refreshBtn.prop('disabled', true);
            $refreshBtn.find('i').addClass('fa-spin');

            const ajaxOpts = {
                url: 'dashboard-layout/plugin_stats.php' + (forceRefresh ? '?refresh=1&_=' + Date.now() : '?_=' + Date.now()),
                method: 'GET',
                dataType: 'json'
            };
            if (forceRefresh && currentCsrfToken) {
                ajaxOpts.headers = { 'X-CSRF-Token': currentCsrfToken };
            }

            $.ajax(ajaxOpts).done(function(data) {
                if (data && data.csrf_token) {
                    currentCsrfToken = String(data.csrf_token);
                }

                let updatedTime = data.updated || '-';
                let staleSuffix = (data && data.stale)
                    ? (isGerman ? ` (Cache: ${data.stale_from || updatedTime})` : ` (Cached: ${data.stale_from || updatedTime})`)
                    : '';
                $('#plugin-stats-updated').text((isGerman ? 'Stand: ' : 'Updated: ') + updatedTime + staleSuffix);

                const savedSort = getSavedSortMode();
                const backendSort = (data && VALID_SORTS.includes(data.sort)) ? data.sort : 'manual';
                const activeSort = savedSort || backendSort;
                $('#kh-dl-sort-select').val(activeSort);

                const footerHtml = renderStatusFooter(data.git, data.token_status);
                let items = Array.isArray(data.items) ? data.items : [];

                lastRawItems = items.slice();
                lastFooterHtml = footerHtml;

                const grandTotal = items.reduce(function(acc, it) {
                    return acc + (Number(it && it.total) || 0);
                }, 0);
                $('#plugin-stats-total-sum').text(
                    items.length
                        ? (isGerman ? `Gesamt: ${grandTotal}` : `Total: ${grandTotal}`)
                        : ''
                );

                if (!items.length) {
                    let emptyMsg = isGerman
                        ? 'Keine Repository-URLs (GitHub/Gitea) in <code>download_box.conf</code> eingetragen. Falls die Datei fehlt, <code>download_box.conf.example</code> nach <code>download_box.conf</code> kopieren und mindestens eine Repository-URL eintragen.'
                        : 'No repository URLs (GitHub/Gitea) found in <code>download_box.conf</code>. If the file is missing, copy <code>download_box.conf.example</code> to <code>download_box.conf</code> and add at least one repository URL.';
                    $('#plugin-stats-content').html(`<div class="kh-dl-empty">${emptyMsg}</div>${footerHtml}`);
                    syncThemeMode();
                    $(document).trigger('pluginStatsBoxReady');
                    return;
                }

                renderColumnsFromCache();
                $(document).trigger('pluginStatsBoxReady');
            }).fail(function(jqXHR) {
                let errMsg = isGerman
                    ? `Konnte plugin_stats.php nicht laden (Status ${jqXHR.status || 'Fehler'}).`
                    : `Failed to load plugin_stats.php (Status ${jqXHR.status || 'Error'}).`;
                $('#plugin-stats-updated').text(isGerman ? 'Fehler' : 'Error');
                $('#plugin-stats-content').html(`<div style="color: #dc2626; font-size: 12px;">${errMsg}</div>`);
                syncThemeMode();
                $(document).trigger('pluginStatsBoxReady');
            }).always(function() {
                $refreshBtn.prop('disabled', false);
                $refreshBtn.find('i').removeClass('fa-spin');
            });
        }

        $('#kh-dl-refresh-btn').on('click', function(e) {
            e.preventDefault();
            loadStats(true);
        });

        const modeObserver = new MutationObserver(function() {
            syncBoxPlacementMode();
        });
        modeObserver.observe(document.body, { childList: true, subtree: true });

        // Einmaliger Abruf beim Öffnen des Dashboards
        loadStats(false);
    });
}
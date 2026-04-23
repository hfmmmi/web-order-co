/**
 * 管理画面共通の線画SVGアイコン（サイドバー・ページ見出し・ダッシュボードカード）
 */
(function () {
    const base =
        'xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

    function svg(inner) {
        return "<svg " + base + ">" + inner + "</svg>";
    }

    window.ADMIN_ICONS = {
        dashboard: svg(
            '<rect width="7" height="7" x="3" y="3"/><rect width="7" height="7" x="14" y="3"/><rect width="7" height="7" x="14" y="14"/><rect width="7" height="7" x="3" y="14"/>'
        ),
        orders: svg(
            '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>'
        ),
        kaitori: svg('<circle cx="12" cy="12" r="9"/><line x1="12" x2="12" y1="3" y2="9"/>'),
        products: svg(
            '<path d="m7.5 4.27 9 5.15"/><path d="M21 8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="m3.3 7 8.7 5 8.7-5"/><line x1="12" x2="12" y1="22" y2="12"/>'
        ),
        estimates: svg(
            '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>'
        ),
        customers: svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
        prices: svg(
            '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'
        ),
        support: svg(
            '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
        ),
        /** 歯車の複雑なパスではなく、中心＋放射線のシンプルな設定アイコン */
        settings: svg(
            '<circle cx="12" cy="12" r="3"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>'
        ),
        /** システム設定タブ・ボタン用（admin-settings.html のみ想定） */
        settingsTabMail: svg(
            '<rect width="18" height="14" x="3" y="5" rx="1"/><path d="m3 7 9 6 9-6"/>'
        ),
        settingsTabUser: svg('<circle cx="12" cy="8" r="3"/><path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/>'),
        settingsTabLock: svg('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>'),
        settingsTabToggle: svg(
            '<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/>'
        ),
        settingsTabTag: svg('<path d="M3 6h12l6 6-9 9-9-9V6z"/><circle cx="8" cy="9" r="1.25"/>'),
        settingsTabShipping: svg(
            '<path d="M1 4h13v10H1z"/><path d="M14 8h6l3 3v3h-9"/><circle cx="5" cy="17" r="2"/><circle cx="18" cy="17" r="2"/>'
        ),
        settingsTabAnnounce: svg(
            '<path d="M3 10v4h3l6 2V8L6 10H3z"/><path d="M17 8a3 3 0 0 1 0 8"/>'
        ),
        settingsTabData: svg(
            '<line x1="3" x2="21" y1="8" y2="8"/><line x1="3" x2="21" y1="16" y2="16"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>'
        ),
        settingsBtnPlus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
        settingsBtnSave: svg(
            '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v12a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><line x1="7" y1="3" x2="7" y2="8"/><line x1="15" y1="3" x2="15" y2="8"/>'
        ),
        logout: svg(
            '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>'
        ),
        /** ダッシュボード見出し用（絵文字の代わり） */
        analyticsChart: svg(
            '<path d="M3 21h18"/><line x1="7" x2="7" y1="12" y2="21"/><line x1="12" x2="12" y1="8" y2="21"/><line x1="17" x2="17" y1="14" y2="21"/>'
        )
    };
})();

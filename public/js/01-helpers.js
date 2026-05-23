// ═══════════════════════════════════════════════════════════════════
// 01-helpers.js — UI-Helper (Toast & Confirm-Dialoge)
// 
// Stellt globale Funktionen bereit:
//   - showToast(message, type, duration)
//   - showConfirm(title, message, confirmText, onConfirm, danger)
//
// Beide Funktionen nutzen TRANSLATIONS_TR aus 02-i18n.js wenn 
// currentLanguage === 'tr'. Da 02-i18n.js NACH dieser Datei geladen 
// wird, prüfen wir defensiv mit `typeof !== 'undefined'`.
// ═══════════════════════════════════════════════════════════════════

function showToast(message, type = 'info', duration = 3000) {
    // v1.18.0: Auto-Übersetzung wenn TR aktiv
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'tr' && typeof TRANSLATIONS_TR !== 'undefined') {
        const tx = TRANSLATIONS_TR[String(message).trim()];
        if (tx) message = tx;
    }
    const container = document.getElementById('toastContainer');
    const icons = {
        success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]||''}</span><span class="toast-text">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showConfirm(title, message, confirmText, onConfirm, danger = true) {
    // v1.18.0: Auto-Übersetzung
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'tr' && typeof TRANSLATIONS_TR !== 'undefined') {
        const tt = TRANSLATIONS_TR[String(title).trim()]; if (tt) title = tt;
        const tm = TRANSLATIONS_TR[String(message).trim()]; if (tm) message = tm;
        const tc = TRANSLATIONS_TR[String(confirmText).trim()]; if (tc) confirmText = tc;
    }
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-box">
        <div class="confirm-icon">''</div>
        <div class="confirm-title">${title}</div>
        <div class="confirm-msg">${message}</div>
        <div class="confirm-actions">
            <button class="confirm-btn confirm-cancel" id="confirmCancel">Abbrechen</button>
            <button class="confirm-btn ${danger ? 'confirm-danger' : 'confirm-primary'}" id="confirmOk">${confirmText}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmCancel').onclick = () => overlay.remove();
    overlay.querySelector('#confirmOk').onclick = () => { overlay.remove(); onConfirm(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ═══ I18N (v1.18.0) ═══

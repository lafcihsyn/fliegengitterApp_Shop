// ═══════════════════════════════════════════════════════════════════
// 10-search.js — Suche-Overlay (v1.18.15)
//
// Ersetzt die alte Board-Filterung bei Suche (war verwirrend, weil
// Karten aus anderen Tabs im aktiven Tab sichtbar wurden).
//
// Neues Konzept:
//   - Tippen ins Suchfeld → Overlay öffnet sich automatisch
//   - Overlay zeigt kompakte Liste aller Treffer mit Status-Badge
//   - Klick auf Treffer → öffnet Bestellung (Modal), Overlay schließt
//   - Esc / Klick außerhalb / ✕-Button schließt Overlay
//   - Pfeil-Tasten ↑↓ navigieren, Enter öffnet selektierten Treffer
//
// API:
//   - openSearchOverlay()  — öffnet leer (oder mit aktuellem Suchtext)
//   - closeSearchOverlay() — schließt und leert Suche
//   - renderSearchResults(term) — interne Funktion
//
// Lädt NACH dem inline-Script und allen anderen Modulen.
// ═══════════════════════════════════════════════════════════════════

let _searchSelectedIndex = -1;  // für Tastatur-Navigation
let _searchCurrentResults = []; // aktuelle Treffer-Liste

/**
 * Öffnet das Suche-Overlay. Wird automatisch aufgerufen wenn der User
 * ins Suchfeld tippt.
 */
function openSearchOverlay() {
    const overlay = document.getElementById('searchOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';  // Hintergrund-Scroll sperren
    // Fokus aufs Overlay-Suchfeld (statt das Board-Suchfeld)
    const overlayInput = document.getElementById('searchOverlayInput');
    const boardInput = document.getElementById('boardSearch');
    if (overlayInput && boardInput) {
        overlayInput.value = boardInput.value;
        setTimeout(() => {
            overlayInput.focus();
            // Cursor ans Ende
            overlayInput.setSelectionRange(overlayInput.value.length, overlayInput.value.length);
        }, 50);
        renderSearchResults(overlayInput.value);
    }
}

/**
 * Schließt das Overlay und leert die Suche.
 */
function closeSearchOverlay() {
    const overlay = document.getElementById('searchOverlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    // Suchfeld leeren (sowohl Board als auch Overlay)
    const boardInput = document.getElementById('boardSearch');
    const overlayInput = document.getElementById('searchOverlayInput');
    if (boardInput) boardInput.value = '';
    if (overlayInput) overlayInput.value = '';
    const clearBtn = document.getElementById('searchClear');
    if (clearBtn) clearBtn.style.display = 'none';
    _searchSelectedIndex = -1;
    _searchCurrentResults = [];
}

/**
 * Rendert die Suchergebnisse basierend auf dem Suchterm.
 */
function renderSearchResults(term) {
    const listEl = document.getElementById('searchOverlayResults');
    const countEl = document.getElementById('searchOverlayCount');
    if (!listEl || !countEl) return;

    const t = (term || '').trim().toLowerCase();

    if (!t) {
        listEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);font-size:13px">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;margin-bottom:10px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div>Tippe um Bestellungen zu suchen</div>
            <div style="font-size:11px;margin-top:6px;opacity:0.7">Name, Telefon, Bestellnummer, Maße, Farbe, Bemerkung</div>
        </div>`;
        countEl.textContent = '';
        _searchCurrentResults = [];
        _searchSelectedIndex = -1;
        return;
    }

    // Such-Logik — analog zur alten Board-Suche aber erweitert:
    // - Bestellnummer (v1.18.15 neu)
    // - Bemerkung pro Maß (v1.18.15 neu)
    // - Plus alle bisherigen Felder
    const allOrders = (typeof orders !== 'undefined' && Array.isArray(orders)) ? orders : [];
    // v1.18.15-fix: canSeeAllFilialen war eine lokale Variable in 07-board.js — hier neu berechnen
    const _canSeeAll = (typeof isSuperAdmin === 'function' && isSuperAdmin())
        || (typeof isAdmin === 'function' && isAdmin())
        || (typeof hasPerm === 'function' && hasPerm('view_all_filialen'));
    const filiale_filter_visible = !_canSeeAll && (typeof currentUserFilialeId !== 'undefined') && currentUserFilialeId;

    const results = allOrders.filter(o => {
        // Filiale-Berechtigung respektieren
        if (filiale_filter_visible && o.filialeId && o.filialeId !== currentUserFilialeId) return false;
        // Such-Felder zusammenbauen
        const measureStr = (o.measures || []).map(m => {
            const dims = m.breite + '×' + m.hoehe;
            const bem = m.bemerkung || '';
            return dims + ' ' + bem;
        }).join(' ');
        const haystack = [
            o.vorname, o.nachname, o.telefon, o.farbe, o.bemerkung,
            o.orderNumber, o.email, measureStr
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(t);
    });

    // Sortierung: neueste zuerst (createdAt desc)
    results.sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
    });

    _searchCurrentResults = results;
    _searchSelectedIndex = -1;

    countEl.textContent = results.length === 0 ? 'Keine Ergebnisse' : `${results.length} Ergebnis${results.length === 1 ? '' : 'se'}`;

    if (!results.length) {
        listEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);font-size:13px">
            <div style="font-size:48px;opacity:0.3;margin-bottom:6px">?</div>
            <div>Keine Bestellungen gefunden für "${escHtml(term)}"</div>
        </div>`;
        return;
    }

    // Spalten-Farben (gleich wie auf Board)
    const colColors = {
        'Bestellung':    {bg:'#ede9fe', color:'#6d28d9'},
        'In Produktion': {bg:'#fef3c7', color:'#b45309'},
        'Abholbereit':   {bg:'#d1fae5', color:'#047857'},
        'Abgeholt':      {bg:'#dbeafe', color:'#1e40af'},
        'Reparatur':     {bg:'#dbeafe', color:'#1e40af'},
        'Warteliste':    {bg:'#fef3c7', color:'#92400e'},
        'B-Ware':        {bg:'#fed7aa', color:'#9a3412'},
        'Gelöscht':      {bg:'#fee2e2', color:'#991b1b'},
        'Archiviert':    {bg:'#f3f4f6', color:'#374151'}
    };

    listEl.innerHTML = results.map((o, idx) => {
        const cc = colColors[o.column] || {bg:'#e5e7eb', color:'#374151'};
        const name = ((o.vorname || '') + ' ' + (o.nachname || '')).trim() || '(ohne Name)';
        const date = (typeof formatDate === 'function') ? formatDate(o.createdAt) : '';
        const phone = o.telefon || '';
        const measures = (o.measures || []).map(m => {
            const stk = (m.stueck && m.stueck > 1) ? ' ×' + m.stueck : '';
            return m.breite + '×' + m.hoehe + stk;
        }).join(', ');
        const colors = [...new Set((o.measures || []).map(m => m.farbe).filter(Boolean))].join(', ') || o.farbe || '';
        const orderNr = o.orderNumber ? `<span style="font-size:11px;color:var(--text-muted);font-weight:600;margin-right:4px">${escHtml(o.orderNumber)}</span>` : '';
        const repIcon = o.isReparatur ? '<span title="Reparatur" style="margin-right:4px">🔧</span>' : '';
        const onlineIcon = o.source === 'online' ? '<span title="Online-Bestellung" style="margin-right:4px">📦</span>' : '';
        const filiale = o.filialeName ? `<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:var(--primary-bg);color:var(--primary);font-weight:600;margin-left:4px">${escHtml(o.filialeName)}</span>` : '';

        return `<div class="search-result-item" data-idx="${idx}" data-id="${esc(o.id)}" onclick="openSearchResult('${esc(o.id)}')" style="padding:12px 14px;border-bottom:1px solid var(--border-light);cursor:pointer;transition:background 0.15s">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:4px">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${orderNr}${onlineIcon}${repIcon}${escHtml(name)}</div>
                    ${phone ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escHtml(phone)}</div>` : ''}
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:11px;color:var(--text-muted)">${date}</div>
                    <div style="margin-top:3px"><span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${cc.bg};color:${cc.color};font-weight:700">${escHtml(o.column || '?')}</span>${filiale}</div>
                </div>
            </div>
            ${measures ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${escHtml(measures)} cm${colors ? ' · ' + escHtml(colors) : ''}</div>` : ''}
        </div>`;
    }).join('');
}

/**
 * Klick auf einen Treffer — öffnet Bestellung und schließt Overlay.
 */
function openSearchResult(id) {
    closeSearchOverlay();
    setTimeout(() => {
        if (typeof openOrderDetail === 'function') openOrderDetail(id);
    }, 100);
}

/**
 * Tastatur-Navigation: Pfeile ↑↓, Enter, Esc
 */
function handleSearchKeydown(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchOverlay();
        return;
    }
    if (!_searchCurrentResults.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _searchSelectedIndex = Math.min(_searchSelectedIndex + 1, _searchCurrentResults.length - 1);
        updateSearchSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _searchSelectedIndex = Math.max(_searchSelectedIndex - 1, 0);
        updateSearchSelection();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (_searchSelectedIndex >= 0 && _searchSelectedIndex < _searchCurrentResults.length) {
            openSearchResult(_searchCurrentResults[_searchSelectedIndex].id);
        } else if (_searchCurrentResults.length === 1) {
            // Falls nur 1 Ergebnis und nichts selektiert: direkt öffnen
            openSearchResult(_searchCurrentResults[0].id);
        }
    }
}

/**
 * Visuelle Markierung des selektierten Treffers (für Tastatur-Nav)
 */
function updateSearchSelection() {
    const items = document.querySelectorAll('.search-result-item');
    items.forEach((el, idx) => {
        if (idx === _searchSelectedIndex) {
            el.style.background = 'var(--primary-bg)';
            el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
        } else {
            el.style.background = '';
        }
    });
}

// ═══════════════════════════════════════════════════════════════════
// 07-board.js — Board (Bestelltabelle) + Sortierung + Auto-Warenausgang
//
// Enthält:
//   - BOARD: renderBoardColumns, renderBoardCards, formatDate
//   - SORTIERUNG: Karten-Sortierung, Drag&Drop von Bestellungen zwischen
//     Spalten, Spalten-Umordnung, Quick-Move-Buttons
//   - AUTOMATISCHER WARENAUSGANG: deductInventory, computeMatVerbrauch
//     (berechnet Material-Verbrauch wenn Bestellung in Produktion geht)
//
// Wird wie 03-06 NACH dem inline-Script geladen. Alle Funktionen
// werden durch User-Aktion oder vom Auth-Listener aufgerufen.
//
// Globale Abhängigkeiten:
//   - db, auth (Firebase)
//   - showToast, showConfirm (01-helpers.js)
//   - t, applyTranslationsToElement (02-i18n.js)
//   - hasPerm, isAdmin, currentUser, currentUserPerms (03-auth.js)
//   - orders, drafts, materials, boardColumns, escHtml, ... (inline-Script)
//   - openOrderDetail, renderDraftsList, updateDraftsBadge (08-order.js)
// ═══════════════════════════════════════════════════════════════════

// ═══ BOARD ═══
function subscribeOrders() {
    if (unsubOrders) unsubOrders();
    unsubOrders = db.collection('orders').orderBy('createdAt', 'asc').onSnapshot(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Drafts separat halten, Bestellungen aus Board ausschließen (v1.15.0)
        drafts = all.filter(o => o.isDraft === true);
        orders = all.filter(o => o.isDraft !== true);
        // v1.18.9-phase5c: checkNewOrders (Push-Notification) ist jetzt direkt
        // integriert (war früher als Monkey-Patch im inline-Script).
        if (typeof checkNewOrders === 'function') checkNewOrders();
        renderBoardCards();
        if (typeof updateDraftsBadge === 'function') updateDraftsBadge();
        // Wenn Entwürfe-Tab offen ist, neu rendern
        if (document.getElementById('tab-drafts')?.classList.contains('active')) {
            if (typeof renderDraftsList === 'function') renderDraftsList();
        }
    }, console.error);
}

function renderBoardColumns() {
    const el = document.getElementById('boardColumns');
    // Filter: Reparatur-Spalte nur für Berechtigte sichtbar
    const visibleCols = boardColumns.filter(col => col !== 'Reparatur' || hasPerm('reparatur_handle'));
    // Falls aktive Spalte versteckt wurde, auf erste sichtbare wechseln
    if (!visibleCols.includes(activeColumn)) {
        activeColumn = visibleCols.includes('Bestellung') ? 'Bestellung' : visibleCols[0];
    }
    el.innerHTML = visibleCols.map(col => {
        const colOrders = orders.filter(o => o.column === col);
        const count = colOrders.length;
        const totalStk = colOrders.reduce((s,o) => s + (o.measures||[]).reduce((ss,m) => ss + (m.stueck||1), 0), 0);
        let badge = '';
        if (col === 'Abholbereit') {
            const unnotified = colOrders.filter(o => { const n = o.notified||{}; return !n.whatsapp && !n.sms && !n.anruf; }).length;
            if (unnotified > 0) badge = `<span style="position:absolute;top:-6px;right:-6px;background:#dc2626;color:white;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px">${unnotified}</span>`;
        }
        if (col === 'Reparatur' && count > 0) {
            badge = `<span style="position:absolute;top:-6px;right:-6px;background:#2563eb;color:white;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px">${count}</span>`;
        }
        return `<button class="col-tab${col===activeColumn?' active':''}" onclick="selectColumn('${esc(col)}')" style="position:relative">${t(col)}<span class="col-count">${totalStk > count ? count + '/' + totalStk : count}</span>${badge}</button>`;
    }).join('') + `<button class="add-col-btn" onclick="switchTab('settings');manageColumns()">＋</button>`;
}

function selectColumn(col) {
    activeColumn = col;
    // Show/hide B-Ware quick add form
    const bwareForm = document.getElementById('bwareQuickAdd');
    if (bwareForm) bwareForm.style.display = 'none';
    renderBoardColumns();
    renderBoardCards();
}

// ═══ SORTIERUNG (v1.13.1) ═══

const SORT_OPTIONS = [
    { id: 'date_old',  label: 'Bestelldatum: älteste zuerst' },
    { id: 'date_new',  label: 'Bestelldatum: neueste zuerst' },
    { id: 'frist',     label: 'Frist: früheste zuerst' },
    { id: 'moved',     label: 'Zuletzt verschoben: neueste oben' },
    { id: 'name',      label: 'Nachname A-Z' },
    { id: 'filiale',   label: 'Filiale alphabetisch' },
    { id: 'number',    label: 'Bestellnummer chronologisch' }
];

function getSortKey(col) { return 'sort_' + col; }

function getColumnSort(col) {
    try { return localStorage.getItem(getSortKey(col)) || 'date_old'; }
    catch(_) { return 'date_old'; }
}

function setColumnSort(col, sortId) {
    try { localStorage.setItem(getSortKey(col), sortId); }
    catch(_) {}
    renderBoardCards();
}

function sortOrdersBy(arr, sortId) {
    const sorted = [...arr];
    const getCreated = o => {
        if (!o.createdAt) return 0;
        return o.createdAt.toMillis ? o.createdAt.toMillis() : (o.createdAt.seconds * 1000 || 0);
    };
    // Online-Bestellungen haben bestelldatum=null bis Anzahlung eingegangen ist.
    // Damit sie nicht als "01.01.1970" ganz oben landen, fällt getDate auf
    // createdAt zurück. So bleibt die chronologische Reihenfolge erhalten.
    const getDate = o => {
        if (o.bestelldatum) return new Date(o.bestelldatum).getTime() || getCreated(o);
        return getCreated(o);
    };
    const getFrist = o => {
        if (!o.frist) return Number.MAX_SAFE_INTEGER;
        const d = o.frist.toDate ? o.frist.toDate() : new Date(o.frist);
        return d.getTime();
    };
    const getMoved = o => {
        // Letzter Log-Eintrag mit "verschoben" oder createdAt als Fallback
        const log = o.log || [];
        for (let i = log.length - 1; i >= 0; i--) {
            const t = log[i].time;
            if (!t) continue;
            return t.toMillis ? t.toMillis() : (t.seconds * 1000 || 0);
        }
        return getCreated(o);
    };
    const getName = o => ((o.nachname || '') + ' ' + (o.vorname || '')).trim().toLowerCase();
    const getFiliale = o => (o.filialeName || 'zzz').toLowerCase();
    const getNumber = o => o.orderNumber || 'zzz';

    switch (sortId) {
        case 'date_new':  sorted.sort((a,b) => getDate(b) - getDate(a) || getCreated(b) - getCreated(a)); break;
        case 'frist':     sorted.sort((a,b) => getFrist(a) - getFrist(b)); break;
        case 'moved':     sorted.sort((a,b) => getMoved(b) - getMoved(a)); break;
        case 'name':      sorted.sort((a,b) => getName(a).localeCompare(getName(b))); break;
        case 'filiale':   sorted.sort((a,b) => getFiliale(a).localeCompare(getFiliale(b)) || getDate(a) - getDate(b)); break;
        case 'number':    sorted.sort((a,b) => getNumber(a).localeCompare(getNumber(b))); break;
        case 'date_old':
        default:          sorted.sort((a,b) => getDate(a) - getDate(b) || getCreated(a) - getCreated(b)); break;
    }
    return sorted;
}

function openSortMenu(col) {
    const currentSort = getColumnSort(col);
    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
        <div class="edit-modal" style="max-width:380px">
            <div class="edit-header">
                <span>Sortieren: ${escHtml(col)}</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body" style="padding:8px 12px">
                ${SORT_OPTIONS.map(opt => `
                    <button onclick="setColumnSort('${esc(col)}','${opt.id}');document.querySelector('.edit-overlay').remove()"
                        style="display:flex;align-items:center;gap:10px;width:100%;padding:12px;background:${opt.id===currentSort?'var(--primary-bg)':'transparent'};color:${opt.id===currentSort?'var(--primary)':'var(--text)'};border:none;border-radius:8px;font-size:14px;font-weight:${opt.id===currentSort?'700':'500'};cursor:pointer;font-family:inherit;text-align:left;margin-bottom:2px">
                        <span style="width:18px;display:inline-flex;justify-content:center">${opt.id===currentSort?'✓':''}</span>
                        <span>${opt.label}</span>
                    </button>
                `).join('')}
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

function showBwareForm() {
    const el = document.getElementById('bwareQuickAdd');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function calcBwarePreview() {
    const b = parseFloat(document.getElementById('bwareBreite').value) || 0;
    const h = parseFloat(document.getElementById('bwareHoehe').value) || 0;
    const el = document.getElementById('bwarePreview');
    if (!el || !b || !h) { if(el) el.style.display='none'; return; }
    const enIdx = abzuege.findIndex(a => a.name === 'Profil En');
    const tuelIdx = abzuege.findIndex(a => a.name === 'Tül');
    const enMass = b - abzuege[enIdx].abzug;
    const tuelAdet = enMass / 2;
    const tuelLen = h - abzuege[tuelIdx].abzug;
    el.style.display = 'block';
    el.innerHTML = `<div style="font-weight:600;margin-bottom:4px">Berechnete Werte:</div>
        <span>Tül Länge: <b>${tuelLen.toFixed(1)} cm</b></span> · 
        <span>Tül Adet: <b>${tuelAdet.toFixed(1)}</b></span>`;
}

async function saveBWare() {
    const breite = parseFloat(document.getElementById('bwareBreite').value);
    const hoehe = parseFloat(document.getElementById('bwareHoehe').value);
    const farbe = document.getElementById('bwareFarbe').value;
    const bemerkung = document.getElementById('bwareBemerkung').value.trim();

    if (!breite || !hoehe) { showToast('Bitte Maße eingeben.', 'warning'); return; }

    const enIdx = abzuege.findIndex(a => a.name === 'Profil En');
    const tuelIdx = abzuege.findIndex(a => a.name === 'Tül');
    const enMass = breite - abzuege[enIdx].abzug;
    const tuelAdet = enMass / 2;
    const tuelLen = hoehe - abzuege[tuelIdx].abzug;

    try {
        const newDocRef = await db.collection('orders').add({
            vorname: 'B-Ware', nachname: '',
            telefon: '', farbe: farbe,
            measures: [{ breite, hoehe, stueck: 1, farbe, sqmPrice: 0, tuelLen, tuelAdet }],
            totalSqm: (breite/100)*(hoehe/100),
            totalPrice: 0, anzahlung: 0, payments: [],
            bestelldatum: new Date().toISOString().split('T')[0],
            frist: null,
            bemerkung: bemerkung || 'Manuell eingetragene B-Ware',
            column: 'B-Ware', paid: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser ? currentUser.email : 'unknown',
            log: [{ time: firebase.firestore.Timestamp.now(), text: getUserName() + ' hat B-Ware eingetragen' }]
        });
        document.getElementById('bwareBreite').value = '';
        document.getElementById('bwareHoehe').value = '';
        document.getElementById('bwareBemerkung').value = '';
        const bwPrev = document.getElementById('bwarePreview');
        if (bwPrev) bwPrev.style.display = 'none';
        document.getElementById('bwareQuickAdd').style.display = 'none';
        showToast('B-Ware eingetragen!', 'success');
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

function renderBoardCards() {
    renderBoardColumns();
    // v1.18.12: Produktion-Statistik Banner aktualisieren
    if (typeof renderProductionBanner === 'function') renderProductionBanner();
    const el = document.getElementById('boardCards');
    // Show B-Ware add button when on B-Ware column
    const bwareAddBtn = document.getElementById('bwareQuickAdd');
    if (bwareAddBtn && activeColumn !== 'B-Ware') bwareAddBtn.style.display = 'none';

    // v1.18.15: Board-Suchfeld nur noch Trigger fürs Overlay (kein Filter mehr).
    // Die echte Suche findet im Overlay (10-search.js) statt — dadurch werden Karten
    // aus anderen Spalten nicht mehr im aktiven Tab gezeigt (war verwirrend).
    const searchTerm = '';
    const clearBtn = document.getElementById('searchClear');
    if (clearBtn) clearBtn.style.display = 'none';

    let filtered = orders.filter(o => o.column === activeColumn);

    // Filiale filter (v1.18.1: view_all_filialen erlaubt auch Mitarbeitern alle Filialen)
    const filialeFilterEl = document.getElementById('filialeSelect');
    const selectedFiliale = filialeFilterEl ? filialeFilterEl.value : '';
    const canSeeAllFilialen = isSuperAdmin() || isAdmin() || hasPerm('view_all_filialen');
    if (selectedFiliale) {
        filtered = filtered.filter(o => o.filialeId === selectedFiliale);
    } else if (!canSeeAllFilialen && currentUserFilialeId) {
        filtered = filtered.filter(o => o.filialeId === currentUserFilialeId || !o.filialeId);
    }

    // Sortierung anwenden (v1.13.1)
    const currentSort = getColumnSort(activeColumn);
    filtered = sortOrdersBy(filtered, currentSort);
    const currentSortLabel = (SORT_OPTIONS.find(o => o.id === currentSort) || SORT_OPTIONS[0]).label;

    if (!filtered.length) {
        const bwareBtn = activeColumn === 'B-Ware' ? `<button class="action-btn primary" onclick="showBwareForm()" style="margin-top:12px">＋ B-Ware eintragen</button>` : '';
        const emptyMsg = searchTerm
            ? `<div class="empty-state"><div class="empty-state-icon">🔍</div>Keine Ergebnisse für "${searchTerm}"</div>`
            : `<div class="empty-state"><div class="empty-state-icon">'—'</div>Keine Bestellungen in "${activeColumn}"${bwareBtn}</div>`;
        // Sortier-Knopf trotzdem zeigen, damit der Mitarbeiter sehen kann was eingestellt ist
        const currentSort = getColumnSort(activeColumn);
        const currentSortLabel = (SORT_OPTIONS.find(o => o.id === currentSort) || SORT_OPTIONS[0]).label;
        const sortBtnEmpty = `<div style="display:flex;align-items:center;justify-content:flex-end;padding:6px 4px 8px;font-size:11px;color:var(--text-muted)">
            <button onclick="openSortMenu('${esc(activeColumn)}')" style="display:inline-flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--border-light);padding:4px 10px;border-radius:14px;font-size:11px;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
                ${escHtml(currentSortLabel)}
            </button>
        </div>`;
        el.innerHTML = sortBtnEmpty + emptyMsg;
        return;
    }

    // B-Ware column: show add button at top
    let bwareTopBtn = '';
    if (activeColumn === 'B-Ware') {
        bwareTopBtn = `<button onclick="showBwareForm()" style="width:100%;padding:12px;background:#8B4513;color:white;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px">＋ <span style="display:inline-flex;vertical-align:middle;margin-right:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 4.875 7.97l3.418-3.421"/><path d="M17 3.414 13.582 7 17 10.586"/><path d="m9.5 4.39 3.918-1.247 1.247 3.918"/></svg></span> B-Ware eintragen</button>`;
    }
    // Sortier-Knopf oben anzeigen (v1.13.1) - kompakter Header mit Sortier-Info
    const sortBtn = `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px 8px;font-size:11px;color:var(--text-muted)">
        <span>${filtered.length} ${filtered.length === 1 ? t('Eintrag') : t('Einträge')}</span>
        <button onclick="openSortMenu('${esc(activeColumn)}')" style="display:inline-flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--border-light);padding:4px 10px;border-radius:14px;font-size:11px;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
            ${escHtml(t(currentSortLabel))}
        </button>
    </div>`;
    const colIdx = boardColumns.indexOf(activeColumn);
    let prevCol = colIdx > 0 ? boardColumns[colIdx - 1] : null;
    let nextCol = colIdx < boardColumns.length - 1 ? boardColumns[colIdx + 1] : null;
        // Don't show B-Ware, Gelöscht oder Reparatur als regular next step
        if (nextCol === 'Gelöscht' || nextCol === 'B-Ware' || nextCol === 'Reparatur') nextCol = null;
        // prevCol auch nicht Reparatur (kein Rückwärts-Verschieben in Reparatur)
        if (prevCol === 'Reparatur') prevCol = null;
        // Reparatur-Spalte: nextCol = "In Produktion"
        if (activeColumn === 'Reparatur') { nextCol = 'In Produktion'; prevCol = null; }

    el.innerHTML = filtered.map(o => {
      try {
        // Calculate total: use saved totalPrice if admin manually changed it,
        // otherwise calculate live with min 1m² logic
        let calcTotal = 0;
        (o.measures||[]).forEach(m => {
            const b = parseFloat(m.breite)||0, h = parseFloat(m.hoehe)||0, s = m.stueck||1;
            const p = m.sqmPrice || sqmPrice;
            const rawSqm = (b/100)*(h/100)*s;
            const billSqm = Math.max(rawSqm, 1*s);
            calcTotal += billSqm * p;
        });
        // If saved totalPrice differs from calculated (admin override), use saved
        const savedTotal = o.totalPrice||0;
        const total = (savedTotal && Math.abs(savedTotal - calcTotal) > 0.02) ? savedTotal : (calcTotal || savedTotal);
        const totalPaid = (o.payments||[]).reduce((s,p) => s + (p.amount||0), 0);
        const rest = total - totalPaid;
        const fristStr = o.frist ? formatFrist(o.frist) : '';
        const filialeColors = {'Bella Home':{bg:'#e0f7f4',color:'#0d9488'},'Mega Home':{bg:'#fee2e2',color:'#dc2626'}};
        const fc = filialeColors[o.filialeName] || {bg:'var(--primary-bg)',color:'var(--primary)'};
        const filialeBadge = o.filialeName ? `<span style="font-size:10px;padding:2px 6px;border-radius:6px;background:${fc.bg};color:${fc.color};font-weight:600">${o.filialeName}</span>` : '';
        // v1.18.20: Online-Badge für Bestellungen aus dem Webshop
        const onlineBadge = o.source === 'online' ? '<span style="font-size:10px;padding:2px 6px;border-radius:6px;background:#dcfce7;color:#15803d;font-weight:700;margin-left:4px">📦 Online</span>' : '';
        // Notify indicator
        const notified = o.notified || {};
        const isNotified = notified.whatsapp || notified.sms || notified.anruf;
        const notifyBadge = isNotified ? '<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:var(--green);background:var(--green-bg);padding:2px 8px;border-radius:12px;margin-left:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Benachrichtigt</span>' : '';
        const allColors = [...new Set((o.measures||[]).map(m => m.farbe).filter(Boolean))];
        if (!allColors.length && o.farbe) allColors.push(o.farbe);
        const hasMixedColors = allColors.length > 1;
        const isBWare = o.column === 'B-Ware';
        // Spalten-Pille bei aktiver Suche (v1.16.1) - zeigt in welcher Spalte das Suchergebnis liegt
        const colColors = {
            'Bestellung':    {bg:'#ede9fe', color:'#6d28d9'},
            'In Produktion': {bg:'#fef3c7', color:'#b45309'},
            'Abholbereit':   {bg:'#d1fae5', color:'#047857'},
            'Abgeholt':      {bg:'#dbeafe', color:'#1e40af'},
            'Reparatur':     {bg:'#dbeafe', color:'#1e40af'},
            'Warteliste':    {bg:'#fef3c7', color:'#92400e'},
            'B-Ware':        {bg:'#fed7aa', color:'#9a3412'},
            'Gelöscht':      {bg:'#fee2e2', color:'#991b1b'}
        };
        const cc = colColors[o.column] || {bg:'#e5e7eb', color:'#374151'};
        // v1.18.13: Bei aktiver Suche IMMER Status-Badge zeigen — auch wenn Karte aus
        // derselben Spalte wie aktiver Tab kommt. Damit ist auf einen Blick klar in
        // welcher Spalte die gefundene Bestellung steckt.
        const columnBadge = (searchTerm && o.column)
            ? `<span style="font-size:10px;padding:2px 8px;border-radius:6px;background:${cc.bg};color:${cc.color};font-weight:700;margin-left:4px">${escHtml(t(o.column))}</span>`
            : '';
        const measures = (o.measures||[]).map(m => {
            // Variant-Marker bauen (v1.16.8-p1, p3) — nur Non-Default-Optionen
            const variantMarkers = [];
            const mv = m.variants || {};
            Object.keys(mv).forEach(vid => {
                if (vid === 'tuerart') return; // wird schon durch DT-Symbol gezeigt
                if (vid === 'plisseeFarbe') return; // wird mit Plissee-Variante zusammen gezeigt
                const variant = (typeof getVariant === 'function') ? getVariant(vid) : null;
                if (!variant) return;
                const opt = (variant.options || []).find(o => o.id === mv[vid]);
                if (!opt) return;
                if (variant.defaultOption && variant.defaultOption === opt.id) return;
                // v1.17.3: Bei Ja/Yes-Optionen → Variant-Namen verwenden
                let label = opt.label;
                const isYesLike = /^(ja|yes)$/i.test(opt.label || '');
                if (isYesLike) label = variant.name;
                if (opt.plisseeFollowup && mv.plisseeFarbe) {
                    const pc = (typeof getPlisseeColor === 'function') ? getPlisseeColor(mv.plisseeFarbe) : null;
                    if (pc) label = (isYesLike ? variant.name : opt.label) + ' - ' + pc.name;
                }
                variantMarkers.push(`<span style="font-size:9px;font-weight:700;color:white;background:#dc2626;padding:1px 5px;border-radius:6px;margin-left:3px;vertical-align:middle" title="${escHtml(variant.name)}: ${escHtml(opt.label)}">${escHtml(label)}</span>`);
            });
            return `<span class="measure-chip">${m.doppeltuer?'<span style="display:inline-flex;vertical-align:middle;margin-right:2px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/><path d="M12 2v20"/><circle cx="15.5" cy="12" r="0.7" fill="currentColor"/><circle cx="8.5" cy="12" r="0.7" fill="currentColor"/></svg></span>':''}${m.breite}×${m.hoehe} cm${m.stueck>1?' ×'+m.stueck:''}${hasMixedColors && m.farbe ? ' <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+farbeColor(m.farbe)+';vertical-align:middle;margin-left:3px"></span>':''}${variantMarkers.join('')}</span>`;
        }).join('');
        const colorBadges = allColors.map(f => `<span class="order-color-badge" style="background:${farbeColor(f)}">${f}</span>`).join(' ');
        // Check if order is locked by another monteur
        const isLocked = o.column === 'In Produktion' && o.produzentEmail && currentUser && o.produzentEmail !== currentUser.email && !isSuperAdmin();

        // Move buttons
        let moveHtml = '';
        if (isLocked) {
            moveHtml = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:6px 0">' + t('Gesperrt – wird von') + ' ' + escHtml(o.produzentName||t('jemand')) + ' ' + t('bearbeitet') + '</div>';
        } else if (prevCol || nextCol || activeColumn === 'Abholbereit' || activeColumn === 'Abgeholt') {
            moveHtml = '<div class="order-move-row">';
            const movePMap = {'In Produktion':'move_to_produktion','Abholbereit':'move_to_abholbereit','Abgeholt':'move_to_abgeholt'};
            if (prevCol && (!movePMap[prevCol] || hasPerm(movePMap[prevCol]))) moveHtml += `<button class="order-move-btn move-left" onclick="event.stopPropagation();quickMove('${o.id}','${esc(prevCol)}')">← ${t(prevCol)}</button>`;
            if (nextCol && (!movePMap[nextCol] || hasPerm(movePMap[nextCol]))) moveHtml += `<button class="order-move-btn move-right" onclick="event.stopPropagation();quickMove('${o.id}','${esc(nextCol)}')">${t(nextCol)} →</button>`;
            // B-Ware button on Abholbereit and Abgeholt
            if ((activeColumn === 'Abholbereit' || activeColumn === 'Abgeholt') && hasPerm('bware_move')) {
                moveHtml += `<button class="order-move-btn" onclick="event.stopPropagation();quickMove('${o.id}','B-Ware')" style="background:#8B4513;color:white;border-color:#8B4513;flex:1"><span style="display:inline-flex;margin-right:3px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 4.875 7.97l3.418-3.421"/><path d="M17 3.414 13.582 7 17 10.586"/><path d="m9.5 4.39 3.918-1.247 1.247 3.918"/></svg></span> B-Ware</button>`;
            }
            moveHtml += '</div>';
        }
        return `<div class="order-card${Math.abs(rest)<0.01?' paid':''}" onclick="openOrderDetail('${o.id}')">
            <div class="order-card-header"><div><div class="order-name">${o.orderNumber ? '<span style="font-size:11px;color:var(--text-muted);font-weight:600;margin-right:4px">'+o.orderNumber+'</span>' : ''}${o.isReparatur ? '<span title="Reparatur" style="margin-right:4px">🔧</span>' : ''}${escHtml(o.vorname||'')} ${escHtml(o.nachname||'')}</div>${notifyBadge}${o.telefon?`<div class="order-phone">📞 ${escHtml(o.telefon)}</div>`:''}</div><div style="text-align:right"><div class="order-date">${formatDate(o.createdAt)}</div>${filialeBadge}${onlineBadge}${columnBadge}${fristStr}</div></div>
            <div class="order-measures">${measures}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${colorBadges}</div>
            ${o.produzentName && o.column === 'In Produktion' ? '<div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding:6px 10px;background:#fef3c7;border-radius:8px;border:1px solid #fde68a"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span style="font-size:12px;font-weight:700;color:#92400e">' + escHtml(o.produzentName) + '</span><span style="font-size:11px;color:#b45309">' + t('bearbeitet') + '</span></div>' : ''}
            ${isBWare ? (o.measures||[]).map(m => {
                const tIdx = abzuege.findIndex(a => a.name === 'Tül');
                const eIdx = abzuege.findIndex(a => a.name === 'Profil En');
                const tLen = m.tuelLen || ((parseFloat(m.hoehe)||0) - abzuege[tIdx].abzug);
                const tAdet = m.tuelAdet || (((parseFloat(m.breite)||0) - abzuege[eIdx].abzug) / 2);
                return '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Tül: '+tLen.toFixed(1)+' cm · Adet: '+tAdet.toFixed(1)+'</div>';
            }).join('') : ''}
            ${o.bemerkung?`<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic">${escHtml(truncate(o.bemerkung,60))}</div>`:''}
            ${!isBWare ? `<div class="order-price-row"><span class="order-price">€ ${total.toFixed(2)}</span><span class="order-remaining${Math.abs(rest)<0.01?' zero':''}">${t('Rest:')} € ${Math.abs(rest) < 0.01 ? '0.00' : rest.toFixed(2)}</span></div>` : ''}
            ${moveHtml}
        </div>`;
      } catch(err) { console.error('Card render error:', o.id, err); return '<div style="color:red;padding:10px">Fehler: '+err.message+'</div>'; }
    }).join('');
    el.innerHTML = sortBtn + bwareTopBtn + el.innerHTML;
}

async function quickMove(id, toCol) {
    // Check step-wise move permissions
    const movePerms = {'Reparatur':'reparatur_handle','Warteliste':'move_to_warteliste','In Produktion':'move_to_produktion','Abholbereit':'move_to_abholbereit','Abgeholt':'move_to_abgeholt','B-Ware':'bware_move'};
    const neededPerm = movePerms[toCol];
    if (neededPerm && !hasPerm(neededPerm)) { showToast('Keine Berechtigung für diese Verschiebung.','warning'); return; }
    // Reparaturen nur über "Reparatur erfassen"-Knopf, nicht direktes Verschieben
    if (toCol === 'Reparatur') {
        showToast('Reparaturen über den "🔧 Reparatur erfassen"-Knopf in der abgeholten Bestellung erstellen.', 'warning', 4500);
        return;
    }
    const o = orders.find(x => x.id === id);
    if (!o || o.column === toCol) return;

    // Check if order is locked by another monteur
    if (o.produzentEmail && o.column === 'In Produktion' && toCol !== 'Abholbereit') {
        const isOwnOrder = currentUser && o.produzentEmail === currentUser.email;
        if (!isOwnOrder && !isSuperAdmin()) {
            showToast('Dieser Auftrag wird von ' + (o.produzentName||'jemand anderem') + ' bearbeitet.', 'warning', 4000);
            return;
        }
    }

    // Check if user already has an order in production (when moving TO Produktion)
    if (toCol === 'In Produktion') {
        const myProdOrder = orders.find(x => x.column === 'In Produktion' && x.produzentEmail === (currentUser?currentUser.email:''));
        if (myProdOrder && !isSuperAdmin()) {
            const name = (myProdOrder.vorname||'') + ' ' + (myProdOrder.nachname||'');
            showToast('Du bearbeitest bereits: ' + name.trim() + '. Bitte zuerst fertigstellen.', 'warning', 5000);
            return;
        }
    }

    // Warn if moving to Abgeholt with open balance
    if (toCol === 'Abgeholt') {
        const totalPaid = (o.payments||[]).reduce((s,p) => s + (p.amount||0), 0);
        const rest = (o.totalPrice||0) - totalPaid;
        if (rest > 0.01) {
            showConfirm('⚠️ Offener Betrag!',
                '<div style="font-size:14px;margin-bottom:14px">Diese Bestellung hat noch <strong>nicht den vollen Betrag bezahlt:</strong></div>' +
                '<div style="font-size:32px;font-weight:800;color:#dc2626;background:#fef2f2;padding:14px 18px;border-radius:12px;border:2px solid #fecaca;margin-bottom:14px;text-align:center">€ ' + rest.toFixed(2) + '<div style="font-size:12px;font-weight:600;color:#991b1b;margin-top:4px;letter-spacing:0.05em">OFFEN</div></div>' +
                '<div style="font-size:14px;color:var(--text-secondary)">Trotzdem nach <strong>Abgeholt</strong> verschieben?</div>',
                'Trotzdem verschieben', async () => {
                await doQuickMove(id, toCol, o);
            }, true);
            return;
        }
    }

    // Confirmation dialog for all moves
    const kundenName = ((o.vorname||'') + ' ' + (o.nachname||'')).trim() || 'Unbekannt';
    showConfirm('Verschieben?', '"' + escHtml(kundenName) + '" wird nach "' + toCol + '" verschoben.', 'Verschieben', async () => {
        await doQuickMove(id, toCol, o);
    }, false);
}

async function doQuickMove(id, toCol, o) {
    // Auto-deduct inventory when moving to Abholbereit
    if (toCol === 'Abholbereit' && o.column !== 'Abholbereit') {
        try { await deductInventory(o); } catch(e) { console.error('Inventory deduction error:', e); }
    }

    const updateData = {
        column: toCol,
        log: firebase.firestore.FieldValue.arrayUnion({
            time: firebase.firestore.Timestamp.now(),
            text: `${getUserName()} hat Bestellung von ${o.column} nach ${toCol} verschoben`
        })
    };

    // Set produzent when moving to In Produktion
    if (toCol === 'In Produktion') {
        updateData.produzentEmail = currentUser ? currentUser.email : '';
        updateData.produzentName = getUserName();
        updateData.produktionStart = firebase.firestore.Timestamp.now();
    }
    // Clear produzent when leaving In Produktion
    if (o.column === 'In Produktion' && toCol !== 'In Produktion') {
        updateData.produzentEmail = firebase.firestore.FieldValue.delete();
        updateData.produzentName = firebase.firestore.FieldValue.delete();
        updateData.produktionStart = firebase.firestore.FieldValue.delete();
    }

    await db.collection('orders').doc(id).update(updateData);
}

// ═══ AUTOMATISCHER WARENAUSGANG (v1.17.0 — Modell-basiert mit Cut-Conditions+Overrides) ═══
async function deductInventory(order) {
    // Load materials from Firestore
    const matSnap = await db.collection('materials').get();
    const materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!materials.length) return;

    const measures = order.measures || [];
    const batch = db.batch();

    for (const measure of measures) {
        const breite = parseFloat(measure.breite) || 0;
        const hoehe = parseFloat(measure.hoehe) || 0;
        const stueck = measure.stueck || 1;
        const farbe = measure.farbe || order.farbe || 'Antrazit';
        const isDT = measure.doppeltuer || false;
        const sqm = (breite / 100) * (hoehe / 100) * stueck;

        // v1.17.0: measureVariants für Cut-Conditions/Overrides aufbauen
        const measureVariants = Object.assign({}, measure.variants || {});
        if (!measureVariants.tuerart) {
            measureVariants.tuerart = isDT ? 'doppel' : 'einzel';
        }

        // v1.17.0: Wenn Maß ein Modell hat → Modell-basiert rechnen
        const modelId = measure.modelId;
        const model = modelId ? (cachedModels.find(m => m.id === modelId) || null) : null;
        const modelMaterials = (model && model.sections && model.sections[0] && model.sections[0].materials) || null;

        // Sammelt Verbrauch je Material aus Modell-Cuts
        // matVerbrauch: { [materialId]: { totalCm, tuelAdet, tuelLen } }
        const matVerbrauch = {};

        if (modelMaterials && modelMaterials.length) {
            // === MODELL-BASIERT ===
            modelMaterials.forEach(mm => {
                const matId = mm.materialId;
                const matInfo = materials.find(x => x.id === matId);
                if (!matInfo || !matInfo.active) return;
                if (matInfo.nurDoppeltuer && !isDT) return;
                if (matInfo.nurEinzeltuer && isDT) return;

                const cuts = mm.cuts || [];
                if (!cuts.length) return;

                if (matInfo.type === 'netz') {
                    // Tül-Adet: enAbzug aus erstem stange-Material des Modells holen (oder global Fallback)
                    let enAbzug = 4.0;
                    for (const otherMm of modelMaterials) {
                        const otherMat = materials.find(x => x.id === otherMm.materialId);
                        if (otherMat && otherMat.type === 'stange') {
                            const breiteCut = (otherMm.cuts || []).find(c => c.basis === 'breite');
                            if (breiteCut) {
                                const eff = getEffectiveCutValues(breiteCut, measureVariants);
                                enAbzug = eff.abzug;
                                break;
                            }
                        }
                    }
                    const enMass = breite - enAbzug;
                    const tuelAdetPerFlügel = Math.ceil(isDT ? (enMass / 2 / 2) : (enMass / 2));
                    const tuelFlügelStk = isDT ? 2 : 1;
                    const tuelAdet = tuelAdetPerFlügel * tuelFlügelStk * stueck;
                    const tuelCut = cuts.find(c => c.basis === 'hoehe');
                    const tuelLen = tuelCut ? (hoehe - (getEffectiveCutValues(tuelCut, measureVariants).abzug || 0)) : hoehe;
                    matVerbrauch[matId] = { type: 'netz', tuelAdet, tuelLen, stueck };
                } else {
                    // Stange/Rolle: Cuts aufsummieren
                    let totalCm = 0;
                    cuts.forEach(cut => {
                        if (cut.basis === 'tuel_adet') return;
                        // Cut-Condition prüfen (v1.16.7)
                        if (cut.condition && !cutConditionMatches(cut.condition, measureVariants)) return;
                        // Effektive Werte mit Overrides (v1.16.8)
                        const eff = getEffectiveCutValues(cut, measureVariants);
                        const basis = cut.basis === 'breite' ? breite : hoehe;
                        const mass = basis - eff.abzug;
                        let stk = eff.stueck * stueck;
                        if (isDT && eff.doppeltuerFaktor > 1) stk *= eff.doppeltuerFaktor;
                        totalCm += mass * stk;
                    });
                    if (totalCm > 0) {
                        matVerbrauch[matId] = { type: matInfo.type, totalCm, totalMeter: totalCm / 100 };
                    }
                }
            });

            // Pro-Bestellung Materialien (perOrder): unabhängig vom Modell
            for (const mat of materials) {
                if (!mat.active) continue;
                if (mat.nurDoppeltuer && !isDT) continue;
                if (mat.nurEinzeltuer && isDT) continue;
                if (mat.perOrder && !matVerbrauch[mat.id]) {
                    matVerbrauch[mat.id] = { type: 'perOrder', verbrauch: mat.perOrder * stueck };
                }
                // Flaeche-Materialien (perSqm) auch im Modell-Mode mitnehmen
                if (mat.type === 'flaeche' && !matVerbrauch[mat.id]) {
                    const perSqm = (isDT && mat.dtPerSqm) ? mat.dtPerSqm : (mat.perSqm || 0);
                    if (perSqm > 0) {
                        matVerbrauch[mat.id] = { type: 'flaeche', sqm, perSqm, totalMeter: sqm * perSqm };
                    }
                }
            }
        } else {
            // === FALLBACK: Material-basiert (für alte Bestellungen ohne modelId) ===
            for (const mat of materials) {
                if (!mat.active) continue;
                if (mat.nurDoppeltuer && !isDT) continue;
                if (mat.nurEinzeltuer && isDT) continue;

                const matCuts = (mat.cuts && mat.cuts.length)
                    ? mat.cuts
                    : (mat.rechnerFields || []).map(fn => {
                        const ab = abzuege.find(a => a.name === fn);
                        return ab ? { label: ab.name, abzug: ab.abzug, stueck: ab.stueck, basis: ab.basis, doppeltuerFaktor: 1 } : null;
                    }).filter(Boolean);

                if (mat.showInRechner || matCuts.length || mat.perSqm) {
                    if (mat.type === 'stange' && matCuts.length) {
                        let totalCm = 0;
                        matCuts.forEach(cut => {
                            if (cut.basis === 'tuel_adet') return;
                            const basis = cut.basis === 'breite' ? breite : hoehe;
                            const mass = basis - (cut.abzug || 0);
                            let stk = (cut.stueck || 1) * stueck;
                            if (isDT && (cut.doppeltuerFaktor || 1) > 1) stk *= cut.doppeltuerFaktor;
                            totalCm += mass * stk;
                        });
                        if (totalCm > 0) matVerbrauch[mat.id] = { type: 'stange', totalCm, totalMeter: totalCm / 100 };
                    } else if (mat.type === 'netz' && matCuts.length) {
                        let enAbzug = 4.0;
                        for (const rm of materials) {
                            if (rm.type === 'stange' && rm.active && rm.cuts?.length) {
                                const breiteCut = rm.cuts.find(c => c.basis === 'breite');
                                if (breiteCut) { enAbzug = breiteCut.abzug || 0; break; }
                            }
                        }
                        const enMass = breite - enAbzug;
                        const tuelAdetPerFlügel = Math.ceil(isDT ? (enMass / 2 / 2) : (enMass / 2));
                        const tuelFlügelStk = isDT ? 2 : 1;
                        const tuelAdet = tuelAdetPerFlügel * tuelFlügelStk * stueck;
                        const tuelCut = matCuts.find(c => c.basis === 'hoehe');
                        const tuelLen = tuelCut ? hoehe - (tuelCut.abzug || 0) : hoehe;
                        matVerbrauch[mat.id] = { type: 'netz', tuelAdet, tuelLen, stueck };
                    } else if (mat.type === 'rolle' && matCuts.length) {
                        let totalCm = 0;
                        matCuts.forEach(cut => {
                            if (cut.basis === 'tuel_adet') return;
                            const basis = cut.basis === 'breite' ? breite : hoehe;
                            const mass = basis - (cut.abzug || 0);
                            let stk = (cut.stueck || 1) * stueck;
                            if (isDT && (cut.doppeltuerFaktor || 1) > 1) stk *= cut.doppeltuerFaktor;
                            totalCm += mass * stk;
                        });
                        if (totalCm > 0) matVerbrauch[mat.id] = { type: 'rolle', totalCm, totalMeter: totalCm / 100 };
                    } else if (mat.type === 'flaeche') {
                        const perSqm = (isDT && mat.dtPerSqm) ? mat.dtPerSqm : (mat.perSqm || 0);
                        if (perSqm > 0) matVerbrauch[mat.id] = { type: 'flaeche', sqm, perSqm, totalMeter: sqm * perSqm };
                    }
                } else if (mat.perOrder) {
                    matVerbrauch[mat.id] = { type: 'perOrder', verbrauch: mat.perOrder * stueck };
                }
            }
        }

        // Verbrauch in inventory_out schreiben
        Object.keys(matVerbrauch).forEach(matId => {
            const mat = materials.find(x => x.id === matId);
            if (!mat) return;
            const v = matVerbrauch[matId];
            let verbrauch = 0;
            let einheit = mat.unit || '';
            let details = {};

            if (v.type === 'stange' || v.type === 'rolle') {
                verbrauch = v.totalMeter;
                einheit = 'Meter';
                details = { totalCm: v.totalCm, totalMeter: v.totalMeter };
            } else if (v.type === 'netz') {
                verbrauch = v.tuelAdet;
                einheit = 'Falten';
                details = { tuelAdet: v.tuelAdet, tuelLen: v.tuelLen, stueck: v.stueck };
            } else if (v.type === 'flaeche') {
                verbrauch = v.totalMeter;
                einheit = 'Meter';
                details = { sqm: v.sqm, perSqm: v.perSqm, totalMeter: v.totalMeter };
            } else if (v.type === 'perOrder') {
                verbrauch = v.verbrauch;
                einheit = mat.unit || 'Stück';
                details = { perOrder: mat.perOrder, stueck };
            }

            if (verbrauch > 0) {
                let matFarbe = farbe;
                if (mat.byColor && mat.colorMapping && mat.colorMapping[farbe]) {
                    matFarbe = mat.colorMapping[farbe];
                }
                const outRef = db.collection('inventory_out').doc();
                batch.set(outRef, {
                    materialId: mat.id,
                    materialName: mat.name,
                    materialType: mat.type,
                    farbe: mat.byColor ? matFarbe : '',
                    verbrauch,
                    einheit,
                    details,
                    orderId: order.id,
                    orderName: (order.vorname || '') + ' ' + (order.nachname || ''),
                    isDoppeltuer: isDT,
                    datum: new Date().toISOString().split('T')[0],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: currentUser ? currentUser.email : 'unknown'
                });
            }
        });
    }

    await batch.commit();
}

function formatDate(ts) { if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit'}); }
function formatFrist(frist) {
    const diff = Math.ceil((new Date(frist)-new Date())/(864e5));
    return `<div class="order-frist${diff<0?' overdue':''}">\u23f0 ${diff<0?Math.abs(diff)+'T überfällig':diff===0?'Heute':diff+'T'}</div>`;
}
function truncate(s,n) { return s.length>n ? s.substring(0,n)+'…' : s; }

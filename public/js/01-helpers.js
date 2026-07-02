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

// v1.20.2: Hinweis-Dialog mit NUR einem OK-Button — erzwingt eine Bestätigung.
// Kein Klick-außerhalb-schließt (Mitarbeiter MUSS „OK" drücken). messageHtml darf
// HTML enthalten (Aufrufer escapen ihre Inhalte selbst).
function showAcknowledge(title, messageHtml, okText, onOk) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-box">
        <div class="confirm-icon">⚠️</div>
        <div class="confirm-title">${escHtml(title || '')}</div>
        <div class="confirm-msg" style="text-align:left;white-space:pre-wrap;max-height:50vh;overflow:auto">${messageHtml}</div>
        <div class="confirm-actions">
            <button class="confirm-btn confirm-primary" id="ackOk" style="width:100%">${escHtml(okText || 'OK, gelesen')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#ackOk').onclick = () => { overlay.remove(); if (typeof onOk === 'function') onOk(); };
}

// v1.20.3: Dialog mit mehreren gestapelten Wahl-Buttons.
// choices = [{ label, cls, onClick }] — cls z.B. 'confirm-primary' | 'confirm-danger' | 'confirm-cancel'.
// Klick außerhalb schließt NICHT (bewusste Auswahl erzwingen).
function showChoice(title, message, choices) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const btns = (choices || []).map((c, i) =>
        `<button class="confirm-btn ${c.cls || ''}" data-choice="${i}" style="width:100%;margin-top:8px">${escHtml(c.label || '')}</button>`
    ).join('');
    overlay.innerHTML = `<div class="confirm-box">
        <div class="confirm-icon">⚠️</div>
        <div class="confirm-title">${escHtml(title || '')}</div>
        <div class="confirm-msg">${escHtml(message || '')}</div>
        <div class="confirm-actions" style="flex-direction:column;gap:0">${btns}</div>
    </div>`;
    document.body.appendChild(overlay);
    (choices || []).forEach((c, i) => {
        const b = overlay.querySelector(`[data-choice="${i}"]`);
        if (b) b.onclick = () => { overlay.remove(); if (typeof c.onClick === 'function') c.onClick(); };
    });
}

// ═══ FARB-DROPDOWN HELPER (v1.19.49) ═══
// Eine einzige Quelle für alle Farb-Dropdowns in der App.
// Verhindert dass beim Speichern Farben verloren gehen weil eine Stelle nur
// 3 hardcoded Werte kennt und alles andere als Default auf 'Antrazit' fällt.
//
// - Quelle: cachedColors (Stammdaten-Collection 'colors')
// - Sortierung: nach sortOrder, dann nach Name
// - Filter: nur aktive Farben
// - Defensiv: wenn cachedColors noch nicht geladen ist, liefert ein einzelnes
//   Placeholder-Option das die aktuelle Farbe (selectedName) behält. So geht
//   beim allerersten Render-Tick nichts verloren.
function getColorOptionsHtml(selectedName) {
    const list = (typeof cachedColors !== 'undefined' && Array.isArray(cachedColors))
        ? cachedColors.filter(c => c && c.active !== false)
        : [];
    if (!list.length) {
        // cachedColors noch nicht geladen — aktuelle Farbe erhalten als einzige Option,
        // damit beim Speichern nichts überschrieben wird.
        const name = selectedName || '';
        return name
            ? `<option value="${escHtml(name)}" selected>${escHtml(name)}</option>`
            : '';
    }
    list.sort((a, b) => {
        const sa = a.sortOrder != null ? a.sortOrder : 999;
        const sb = b.sortOrder != null ? b.sortOrder : 999;
        if (sa !== sb) return sa - sb;
        return (a.name || '').localeCompare(b.name || '');
    });
    // Falls die aktuelle Farbe nicht (mehr) in den aktiven Stammdaten ist
    // (z.B. deaktiviert worden) → trotzdem als Option hinzufügen, damit der
    // Wert beim Anzeigen und Speichern erhalten bleibt.
    const hasSelected = selectedName && list.some(c => c.name === selectedName);
    const extra = (selectedName && !hasSelected)
        ? `<option value="${escHtml(selectedName)}" selected>${escHtml(selectedName)} (inaktiv)</option>`
        : '';
    return extra + list.map(c =>
        `<option value="${escHtml(c.name)}"${c.name === selectedName ? ' selected' : ''}>${escHtml(c.name)}</option>`
    ).join('');
}

// ═══ BESTELL-ÜBERSICHT — buildMeasureSummaryParts (v1.19.59) ═══
// Liefert die Teile einer Maß-Zeile in fester, lesbarer Reihenfolge:
//   [Modell] · [B×H cm] · [Stk] · [Profilfarbe] · [Türart/Varianten] · Netz: X · Plissee: Y
// Verwendet von calcEditPrice + calcNewPrice (eine Quelle → konsistent, behebt
// den Kombi-Bug bei dem nur EINE Folgefarbe gezeigt wurde).
// Namen: gespeichertes Feld zuerst (modelName/netzFarbeName/plisseeFarbeName),
// dann Stammdaten-Lookup, sonst nichts — so bleiben Namen auch nach Hard-Delete.
// Gibt PLAIN-TEXT zurück; Aufrufer escapen selbst (escHtml).
// netz_plissee wird NICHT generisch behandelt (eigener Block unten, gegen doppeltes "Netz")
const _SUMMARY_VARIANT_ORDER = ['tuerart', 'schwellenlos', 'bodenprofil'];
function buildMeasureSummaryParts(m) {
    if (!m) return [];
    const vars = m.variants || {};
    const parts = [];
    // Modell
    const modelName = m.modelName
        || (m.modelId && typeof getModel === 'function' ? (getModel(m.modelId)?.name || '') : '');
    if (modelName) parts.push(modelName);
    // Maße
    const b = parseFloat(m.breite) || 0, h = parseFloat(m.hoehe) || 0;
    if (b && h) parts.push(b + '×' + h + ' cm');
    // Stück
    parts.push((m.stueck || 1) + ' Stk');
    // Profilfarbe
    if (m.farbe) parts.push(m.farbe);
    // Varianten (außer Farben + netz_plissee) in fester Reihenfolge, dann evtl. weitere
    const seen = { netz_plissee: true, plisseeFarbe: true, netzFarbe: true };
    const addVariant = (vid) => {
        if (!vid || seen[vid] || !vars[vid]) return;
        seen[vid] = true;
        const variant = (typeof getVariant === 'function') ? getVariant(vid) : null;
        if (!variant) return;
        const opt = (variant.options || []).find(o => o.id === vars[vid]);
        if (!opt) return;
        if (/^(nein|no)$/i.test(opt.label || '')) return;            // "Bodenprofil: Nein" weglassen
        let label = opt.label;
        if (/^(ja|yes)$/i.test(opt.label || '')) label = variant.name; // "Ja" → Variantenname
        parts.push(label);
    };
    _SUMMARY_VARIANT_ORDER.forEach(addVariant);
    Object.keys(vars).forEach(addVariant);
    // ── Netz/Plissee + Folgefarben (kein doppeltes "Netz") ──
    const netzName = m.netzFarbeName
        || (vars.netzFarbe && typeof getNetzColor === 'function' ? (getNetzColor(vars.netzFarbe)?.name || '') : '');
    const plisseeName = m.plisseeFarbeName
        || (vars.plisseeFarbe && typeof getPlisseeColor === 'function' ? (getPlisseeColor(vars.plisseeFarbe)?.name || '') : '');
    const np = vars.netz_plissee;
    if (np === 'kombi') {
        const npVar = (typeof getVariant === 'function') ? getVariant('netz_plissee') : null;
        const npOpt = npVar ? (npVar.options || []).find(o => o.id === np) : null;
        parts.push(npOpt?.label || 'Kombi');           // z.B. "Netz Plissee Kombi"
        if (netzName) parts.push('Netz: ' + netzName);
        if (plisseeName) parts.push('Plissee: ' + plisseeName);
    } else if (np === 'netz') {
        parts.push(netzName ? 'Netz: ' + netzName : 'Netz');
    } else if (np === 'plissee' || np === 'plisee') {
        parts.push(plisseeName ? 'Plissee: ' + plisseeName : 'Plissee');
    } else {
        // unbekannter/kein Modus: Farben falls vorhanden trotzdem zeigen
        if (netzName) parts.push('Netz: ' + netzName);
        if (plisseeName) parts.push('Plissee: ' + plisseeName);
    }
    return parts;
}
// Bequemer HTML-String (escaped, · getrennt) für die Preisübersicht-Zeile.
function buildMeasureSummaryHtml(m) {
    return buildMeasureSummaryParts(m).map(p => escHtml(String(p))).join(' · ');
}

// v1.19.59 (Phase B): Anzeige-Namen an ein measure-Objekt hängen bevor es nach
// Firestore geschrieben wird. So zeigen Übersicht/Email/PDF die Namen auch dann
// noch, wenn das Stammdaten-Item später komplett gelöscht wird (Hard-Delete).
// Liest die aktuellen IDs (measureObj.modelId / .variants) → frische Namen.
function attachMeasureNames(measureObj) {
    if (!measureObj) return measureObj;
    const v = measureObj.variants || {};
    if (measureObj.modelId && typeof getModel === 'function') {
        const n = getModel(measureObj.modelId)?.name; if (n) measureObj.modelName = n;
    }
    if (v.netzFarbe && typeof getNetzColor === 'function') {
        const n = getNetzColor(v.netzFarbe)?.name; if (n) measureObj.netzFarbeName = n;
    }
    if (v.plisseeFarbe && typeof getPlisseeColor === 'function') {
        const n = getPlisseeColor(v.plisseeFarbe)?.name; if (n) measureObj.plisseeFarbeName = n;
    }
    return measureObj;
}

// ═══ DEFENSIVES DEAKTIVIEREN — withSavedItem (v1.19.58) ═══
// Verhindert dass eine Auswahl (Modell, Variant-Option, Netz-/Plissee-Farbe)
// aus alten Bestellungen "verschwindet", wenn das Stammdaten-Item deaktiviert
// (active:false) oder ganz gelöscht wurde.
//
// Gibt die aktive Liste zurück — aber wenn `savedVal` gesetzt ist und NICHT in
// der aktiven Liste vorkommt, wird der gespeicherte Wert vorangestellt:
//   • existiert noch (in fullList) aber inaktiv → Flag `_inactive: true`
//   • existiert gar nicht mehr (hart gelöscht)  → Flag `_missing: true`
// So bleibt der Wert sichtbar + auswählbar, geht beim Speichern nie verloren.
//
// matchKey: Eigenschaft über die `savedVal` matched ('id' bei Modell/Optionen/
//           Netz-/Plissee-Farben, 'name' bei Profilfarben).
// fallbackName: Anzeigename für den "ganz gelöscht"-Fall (z.B. ein auf der
//           Bestellung mitgespeicherter Name; sonst wird savedVal/'(alt)' genutzt).
function withSavedItem(activeList, fullList, savedVal, matchKey, fallbackName) {
    const list = Array.isArray(activeList) ? activeList.slice() : [];
    if (!savedVal) return list;
    if (list.some(x => x && x[matchKey] === savedVal)) return list;
    const found = (Array.isArray(fullList) ? fullList : []).find(x => x && x[matchKey] === savedVal);
    if (found) {
        return [Object.assign({}, found, { _inactive: true }), ...list];
    }
    // existiert gar nicht mehr → synthetischen Eintrag bauen, nie leer rendern
    const synth = { _missing: true };
    synth[matchKey] = savedVal;
    if (!synth.name) synth.name = fallbackName || (matchKey === 'name' ? savedVal : (fallbackName || 'Unbekannt'));
    synth.label = synth.name;
    return [synth, ...list];
}

// Suffix-Text für (inaktiv)/(alt)-Markierung in Auswahl-UIs (NICHT auf
// Kundendokumenten verwenden — siehe Prinzip 2 im Deaktivierungs-Plan).
function inactiveSuffix(item) {
    if (!item) return '';
    if (item._missing) return ' (alt)';
    if (item._inactive) return ' (inaktiv)';
    return '';
}

// Zählt wie viele geladene Bestellungen ein Stammdaten-Item referenzieren.
// type: 'model' | 'color' | 'plisseeColor' | 'netzColor' | 'variant'
//   - 'color' matched über den NAMEN (m.farbe), alle anderen über die ID.
//   - 'variant' zählt jede Bestellung die irgendeine Option dieser Variante nutzt.
// Hinweis: Die App lädt ALLE Bestellungen (kein limit/where) → die Zählung ist exakt.
function countReferences(type, id, name) {
    const base = (typeof orders !== 'undefined' && Array.isArray(orders)) ? orders : [];
    const dr = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : [];
    const all = base.concat(dr);
    const archivedCols = ['Gelöscht', 'Archiviert', 'Abgeholt'];
    let total = 0, active = 0, archived = 0;
    for (const o of all) {
        let hit = false;
        for (const m of (o.measures || [])) {
            const v = m.variants || {};
            if (type === 'model' && m.modelId === id) hit = true;
            else if (type === 'color' && m.farbe === name) hit = true;
            else if (type === 'plisseeColor' && v.plisseeFarbe === id) hit = true;
            else if (type === 'netzColor' && v.netzFarbe === id) hit = true;
            else if (type === 'variant' && v[id]) hit = true;
            if (hit) break;
        }
        if (hit) {
            total++;
            if (archivedCols.includes(o.column)) archived++;
            else active++;
        }
    }
    return { total, active, archived };
}

// Bestätigung VOR dem Deaktivieren eines genutzten Stammdaten-Items.
// Nutzt den App-eigenen showConfirm-Dialog (statt nativem confirm()).
//
// Ablauf (showConfirm ist callback-basiert, kein Promise):
//   • 0 Referenzen        → gibt true zurück, kein Dialog (gefahrlos)
//   • Referenzen vorhanden → zeigt Dialog, gibt false zurück (aktueller Save stoppt).
//     Bei „Deaktivieren" wird retry() aufgerufen → die Save-Funktion läuft erneut,
//     diesmal ist der Merker gesetzt → gibt true zurück → Save geht durch.
//   • Bei „Abbrechen" passiert nichts (Save bleibt gestoppt).
function confirmDeactivation(label, type, id, name, retry) {
    const refs = countReferences(type, id, name);
    if (refs.total === 0) return true;
    const token = type + ':' + id;
    if (window.__deactivationConfirmed === token) {
        window.__deactivationConfirmed = null; // Merker verbrauchen → durchlassen
        return true;
    }
    const disp = name || label;
    const msg = `„${disp}" wird von <b>${refs.total} Bestellung(en)</b> verwendet `
        + `(${refs.active} aktiv, ${refs.archived} abgeschlossen/archiviert).<br><br>`
        + `<b>Nach dem Deaktivieren:</b><br>`
        + `• Alte Bestellungen bleiben sichtbar und funktionsfähig.<br>`
        + `• Neue Bestellungen können „${disp}" nicht mehr wählen.`;
    if (typeof showConfirm === 'function') {
        showConfirm('Wirklich deaktivieren?', msg, 'Deaktivieren', () => {
            window.__deactivationConfirmed = token;
            if (typeof retry === 'function') retry();
        }, false);
    }
    return false;
}

// ═══ NAME-SANITIZER (v1.19.56) ═══
// Lässt nur lateinisches Alphabet + deutsche Umlaute zu. Türkische / andere
// latein-ähnliche Akzente werden auf Standard-Latein transliteriert
// (ş→s, ç→c, ğ→g, ı→i). Sonstige Schriften (kyrillisch, arabisch, asiatisch …)
// werden entfernt. Whitespace/Bindestrich/Apostroph bleiben für gängige Namen.
// Identisch zur Webshop-Implementierung (consistency).
const NAME_TRANSLITERATE = {
    'ş':'s','Ş':'S','ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I',
    'â':'a','Â':'A','î':'i','Î':'I','û':'u','Û':'U','ô':'o','Ô':'O',
    'á':'a','Á':'A','à':'a','À':'A','é':'e','É':'E','è':'e','È':'E',
    'í':'i','Í':'I','ì':'i','Ì':'I','ó':'o','Ó':'O','ò':'o','Ò':'O',
    'ú':'u','Ú':'U','ù':'u','Ù':'U','ñ':'n','Ñ':'N','ý':'y','Ý':'Y',
    'ć':'c','Ć':'C','č':'c','Č':'C','ď':'d','Ď':'D','ě':'e','Ě':'E',
    'ł':'l','Ł':'L','ń':'n','Ń':'N','ř':'r','Ř':'R','ś':'s','Ś':'S',
    'š':'s','Š':'S','ť':'t','Ť':'T','ů':'u','Ů':'U','ź':'z','Ź':'Z',
    'ż':'z','Ż':'Z','ž':'z','Ž':'Z'
};
function sanitizeName(raw) {
    let s = String(raw || '');
    s = s.replace(/[şŞçÇğĞıİâÂîÎûÛôÔáÁàÀéÉèÈíÍìÌóÓòÒúÚùÙñÑýÝćĆčČďĎěĚłŁńŃřŘśŚšŠťŤůŮźŹżŻžŽ]/g,
        c => NAME_TRANSLITERATE[c] || c);
    s = s.replace(/[^a-zA-ZäöüÄÖÜß\s\-'.]/g, '');
    return s;
}
// Inline-Handler: korrigiert das Input-Feld direkt während des Tippens/Einfügens.
// Cursor-Position bleibt erhalten.
function sanitizeNameInput(el) {
    if (!el) return;
    const raw = el.value;
    const clean = sanitizeName(raw);
    if (clean !== raw) {
        const pos = (typeof el.selectionStart === 'number') ? el.selectionStart : null;
        el.value = clean;
        if (pos !== null) {
            const newPos = Math.min(pos, clean.length);
            try { el.setSelectionRange(newPos, newPos); } catch(_) {}
        }
    }
}

// ═══ I18N (v1.18.0) ═══

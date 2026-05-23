// ═══════════════════════════════════════════════════════════════════
// 08-order.js — Bestellungs-bezogene UI-Module
//
// Enthält folgende thematisch verwandte Bereiche:
//   - ORDER DETAIL: openOrderDetail, closeModal, addPayment, edit/save,
//     useOrderInRechner, sendNotification, deleteOrder, etc.
//   - ENTWÜRFE: renderDraftsList, saveDraft, loadDraft, deleteDraft, ...
//   - REPARATUR-FEATURE: createReparatur, ...
//   - NEW ORDER: renderNewForm, addMeasure, saveOrder, ...
//   - MAßE-VISUALISIERUNG (SVG): drawMassSVG für Maße-Skizzen
//   - DIGITALE UNTERSCHRIFT: openSignaturePad, saveSignature, ...
//
// Wird wie 03-07 NACH dem inline-Script geladen.
//
// Globale Abhängigkeiten:
//   - db, auth, firebase (Firebase)
//   - showToast, showConfirm (01-helpers.js)
//   - t, applyTranslationsToElement, translateMaterial (02-i18n.js)
//   - hasPerm, isAdmin, currentUser, currentUserPerms (03-auth.js)
//   - cachedMaterials, cachedColors, ..., orders, drafts, etc. (inline)
//   - exportOrderPDF, generateEtikett (05-output.js)
//   - renderBoardColumns, renderBoardCards, formatDate (07-board.js)
// ═══════════════════════════════════════════════════════════════════

// ═══ ORDER DETAIL ═══

function openOrderDetail(id) {
    const o = orders.find(x=>x.id===id); if(!o) return;

    // B-Ware: simplified detail view
    if (o.column === 'B-Ware') {
        openBWareDetail(id, o);
        return;
    }

    const total=o.totalPrice||0, rest=total-(o.anzahlung||0);
    editMeasures = (o.measures||[]).map(m=>({
        breite:m.breite, hoehe:m.hoehe, stueck:m.stueck||1,
        farbe:m.farbe||o.farbe||'Antrazit',
        preis:m.sqmPrice||sqmPrice, doppeltuer:!!m.doppeltuer,
        // v1.18.14: Alle Felder bewahren damit beim Speichern nichts verloren geht
        variants: m.variants ? Object.assign({}, m.variants) : {},
        modelId: m.modelId || '',
        bemerkung: m.bemerkung || '',
        materialColors: m.materialColors ? Object.assign({}, m.materialColors) : {}
    }));
    const logs = (o.log||[]).map(l=>`<div class="activity-item"><span class="activity-time">${formatLogTime(l.time)}</span><span class="activity-text">${escHtml(l.text)}</span></div>`).join('') || '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Keine Aktivitäten</div>';

    // Notify checkboxes (only for Abholbereit)
    const notified = o.notified || {};
    let notifySection = '';
    if (o.column==='Abholbereit' && hasPerm('customer_notify')) {
        const phone = (o.telefon||'').replace(/[\s\-()]/g, '');
        const kundenName = (o.vorname||'') + ' ' + (o.nachname||'');
        const defaultMsg = 'Hallo {name}, Ihre Fliegengitter-Bestellung ist fertig und kann abgeholt werden. Bei Fragen melden Sie sich gerne bei uns!';
        const settingsText = document.getElementById('settingsNotifyText');
        const templateMsg = (settingsText && settingsText.value) ? settingsText.value : defaultMsg;
        const totalPaid = (o.payments||[]).reduce((s,p) => s + (p.amount||0), 0);
        const restBetrag = Math.max(0, (o.totalPrice||0) - totalPaid).toFixed(2);
        const waMsg = encodeURIComponent(templateMsg.replace(/{name}/g, kundenName.trim()).replace(/{rest}/g, restBetrag));
        const waLink = phone ? 'https://wa.me/' + phone.replace(/^\+/,'').replace(/^0043/,'43').replace(/^0/,'43') + '?text=' + waMsg : '';
        const telLink = phone ? 'tel:' + phone : '';

        notifySection = `<div class="card"><div class="card-label">Kunde benachrichtigen</div>
            ${phone ? `<div style="display:flex;gap:8px;margin-bottom:12px">
                <a href="${waLink}" target="_blank" onclick="markNotified('${id}','whatsapp')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:#25D366;color:white;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;font-family:inherit"><span style="display:inline-flex;margin-right:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> WhatsApp</a>
                <a href="${telLink}" onclick="markNotified('${id}','anruf')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:#374151;color:white;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;font-family:inherit"><span style="display:inline-flex;margin-right:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span> Anrufen</a>
            </div>` : '<div style="font-size:13px;color:var(--amber);padding:8px 0;margin-bottom:8px">⚠️ Keine Telefonnummer hinterlegt</div>'}
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:6px">Status</div>
            <div class="notify-checks">
                <label class="notify-check${notified.whatsapp?' checked':''}">
                    <input type="checkbox" ${notified.whatsapp?'checked':''} onchange="toggleNotify('${id}','whatsapp',this.checked)">
                    <span class="notify-check-label">WhatsApp</span>
                    ${notified.whatsapp_time?`<span class="notify-check-time">${formatLogTime(notified.whatsapp_time)}</span>`:''}
                </label>
                <label class="notify-check${notified.sms?' checked':''}">
                    <input type="checkbox" ${notified.sms?'checked':''} onchange="toggleNotify('${id}','sms',this.checked)">
                    <span class="notify-check-label">SMS</span>
                    ${notified.sms_time?`<span class="notify-check-time">${formatLogTime(notified.sms_time)}</span>`:''}
                </label>
                <label class="notify-check${notified.anruf?' checked':''}">
                    <input type="checkbox" ${notified.anruf?'checked':''} onchange="toggleNotify('${id}','anruf',this.checked)">
                    <span class="notify-check-label">Anruf</span>
                    ${notified.anruf_time?`<span class="notify-check-time">${formatLogTime(notified.anruf_time)}</span>`:''}
                </label>
            </div>
        </div>`;
    }

    // Color select
    const colorOpts = ['Antrazit','Weiß','Braun'].map(c=>`<option value="${c}"${o.farbe===c?' selected':''}>${c}</option>`).join('');

    // v1.18.22: Status-Dropdown — Spalten der App in fester Reihenfolge
    // v1.18.23: Nach Berechtigungen filtern. Reparatur ist KEIN Dropdown-Eintrag
    //   (eigener Workflow über "🔧 Reparatur erfassen"-Knopf bei abgeholten Bestellungen).
    //   Aktueller Status wird IMMER angezeigt (auch wenn keine Berechtigung), damit
    //   der Mitarbeiter sieht in welcher Spalte die Bestellung gerade ist.
    const statusColors = {
        'Bestellung':    {bg:'#ede9fe', color:'#6d28d9', border:'#c4b5fd'},
        'Warteliste':    {bg:'#fef3c7', color:'#92400e', border:'#fcd34d'},
        'In Produktion': {bg:'#fef3c7', color:'#b45309', border:'#fbbf24'},
        'Reparatur':     {bg:'#dbeafe', color:'#1e40af', border:'#93c5fd'},
        'Abholbereit':   {bg:'#d1fae5', color:'#047857', border:'#6ee7b7'},
        'Abgeholt':      {bg:'#e5e7eb', color:'#374151', border:'#9ca3af'},
        'B-Ware':        {bg:'#fee2e2', color:'#991b1b', border:'#fca5a5'},
        'Gelöscht':      {bg:'#f3f4f6', color:'#6b7280', border:'#d1d5db'}
    };
    // Permission-Mapping: welche Berechtigung braucht's um in die jeweilige Spalte zu verschieben.
    // 'Bestellung' = Standard-Status, keine spezielle Berechtigung nötig (jeder kann zurücksetzen).
    // 'Reparatur' = NICHT im Dropdown — separater Workflow.
    const statusPermMap = {
        'Bestellung':    null,
        'Warteliste':    'move_to_warteliste',
        'In Produktion': 'move_to_produktion',
        'Abholbereit':   'move_to_abholbereit',
        'Abgeholt':      'move_to_abgeholt',
        'B-Ware':        'bware_move',
        'Gelöscht':      'orders_delete'
    };
    const currentCol = o.column || 'Bestellung';
    // Filter: nur Status anzeigen für die der User Berechtigung hat — plus aktuellen Status.
    const allowedStatus = Object.keys(statusPermMap).filter(col => {
        if (col === currentCol) return true; // aktueller Status immer anzeigen
        const perm = statusPermMap[col];
        if (!perm) return true; // keine Berechtigung nötig (Bestellung)
        return hasPerm(perm);
    });
    const sc = statusColors[currentCol] || statusColors['Bestellung'];
    // Wenn der User nur den aktuellen Status sehen würde (keine Verschiebungs-Berechtigung),
    // dann Dropdown gar nicht anzeigen — wäre sinnlos und verwirrend.
    const statusSelect = allowedStatus.length > 1
        ? `<select id="orderStatusSelect_${id}" onchange="onOrderStatusChange('${id}', this)" style="width:100%;padding:11px 14px;background:${sc.bg};color:${sc.color};border:2px solid ${sc.border};border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;-webkit-appearance:none;-moz-appearance:none;appearance:none;background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2218%22 height=%2218%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22${encodeURIComponent(sc.color)}%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>');background-repeat:no-repeat;background-position:right 12px center;padding-right:38px">${allowedStatus.map(col => '<option value="'+col+'"'+(col===currentCol?' selected':'')+'>Status: '+col+'</option>').join('')}</select>`
        : '';

    document.getElementById('modalStickyHeader').innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="modal-title" style="margin-bottom:0">${o.orderNumber ? '<span style="color:var(--text-muted);font-weight:600;margin-right:6px">'+o.orderNumber+'</span>' : ''}Bestellung</div>
            <button onclick="closeModal()" style="background:var(--border-light);color:var(--text-secondary);border:none;border-radius:10px;width:36px;height:36px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <button onclick="saveOrderEdit('${id}')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 12px;background:var(--primary);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;min-width:0" style="display:flex;align-items:center;gap:5px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Speichern</button>
            <button onclick="exportOrderPDF('${id}')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 12px;background:#dc2626;color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;min-width:0" style="display:flex;align-items:center;gap:5px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF</button>
            ${hasPerm('orders_rechner')?'<button onclick="useOrderInRechner(\''+id+'\')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 12px;background:#d97706;color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;min-width:0" style="display:flex;align-items:center;gap:5px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16"/><path d="M10 4v16"/></svg> Schnittliste</button>':''}
        </div>
        ${statusSelect}`;
    document.getElementById('modalContent').innerHTML = `
        ${o.isReparatur ? `<div style="margin-bottom:12px;padding:12px 14px;background:#dbeafe;border-left:4px solid #2563eb;border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:18px">🔧</span>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:#1e40af">Reparatur-Bestellung</div>
                ${o.originalOrderId ? `<div style="font-size:12px;color:#1e3a8a;margin-top:2px">Original: <a onclick="event.preventDefault();closeModal();setTimeout(()=>openOrderDetail('${o.originalOrderId}'),300)" href="#" style="color:#1e40af;text-decoration:underline;font-weight:600;cursor:pointer">${escHtml(o.originalOrderNumber || 'Bestellung öffnen')}</a></div>` : ''}
            </div>
        </div>` : ''}
        ${o.source === 'online' ? `<div style="margin-bottom:12px;padding:12px 14px;background:#dcfce7;border-left:4px solid #16a34a;border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:18px">📦</span>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:#14532d">Online-Bestellung</div>
                <div style="font-size:12px;color:#166534;margin-top:2px">Über Webshop eingegangen. Kunde wurde per Email benachrichtigt.</div>
            </div>
        </div>` : ''}
        <div style="color:var(--text-muted);font-size:12px;margin-bottom:12px">${o.orderNumber ? '<span style="font-weight:700;color:var(--primary)">'+o.orderNumber+'</span> · ' : ''}${o.bestelldatum?'Bestellt: '+o.bestelldatum.split('-').reverse().join('.'):'Erstellt: '+formatDate(o.createdAt)}${o.frist?' · Frist: '+o.frist.split('-').reverse().join('.'):''}</div>

        <div class="card">
            <div class="card-label">Kundendaten</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="edit-field"><label>Vorname</label><input type="text" id="editVorname" value="${escHtml(o.vorname||'')}"></div>
                <div class="edit-field"><label>Nachname</label><input type="text" id="editNachname" value="${escHtml(o.nachname||'')}"></div>
            </div>
            <div class="edit-field"><label>Telefon</label>
                <div class="tel-row">
                    <select id="editVorwahl" class="tel-vorwahl">
                        <option value="+43">+43</option>
                        <option value="+49">+49</option>
                        <option value="+41">+41</option>
                        <option value="+90">+90</option>
                        <option value="+387">+387</option>
                        <option value="+381">+381</option>
                        <option value="+385">+385</option>
                        <option value="+48">+48</option>
                        <option value="+40">+40</option>
                        <option value="+36">+36</option>
                        <option value="+421">+421</option>
                        <option value="+420">+420</option>
                        <option value="+39">+39</option>
                        <option value="+44">+44</option>
                    </select>
                    <input type="tel" id="editTelNummer" class="tel-nummer" value="">
                </div>
            </div>
            <div class="edit-field"><label>Farbe</label><select id="editFarbe">${colorOpts}</select></div>
        </div>

        <div class="card">
            <div class="card-label">Maße</div>
            <div class="edit-measures" id="editMeasuresContainer"></div>
            <button class="edit-add-measure" onclick="addEditMeasure('${id}')">＋ Maß hinzufügen</button>
        </div>

        <div class="card">
            <div class="card-label">Preisübersicht</div>
            <div id="editPriceLines"></div>
            <div id="editPriceSummary"></div>
            <div id="editPaymentSection"></div>
        </div>

        <div class="card">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="edit-field"><label>Bestelldatum</label><input type="date" id="editBestelldatum" value="${o.bestelldatum||''}"></div>
                <div class="edit-field"><label>Fristdatum</label><input type="date" id="editFrist" value="${o.frist||''}"></div>
            </div>
            <div class="edit-field"><label>Bemerkung</label><textarea id="editBemerkung">${escHtml(o.bemerkung||'')}</textarea></div>
        </div>

        ${notifySection}

        <div class="card">
            ${o.signature ?
                '<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span style="font-size:14px;font-weight:700;color:#16a34a">Kunde hat unterschrieben</span></div><div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">' + (o.signedAt ? formatLogTime(o.signedAt) : '') + '</div><button onclick="showSignatureImage(\'' + id + '\')" style="padding:8px 14px;background:var(--primary-bg);color:var(--primary);border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Unterschrift anzeigen</button>'
            :
                '<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Noch keine Unterschrift</div><button onclick="closeModal();setTimeout(()=>openSignatureModal(\'' + id + '\'),300)" style="padding:10px 16px;background:#d97706;color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Jetzt unterschreiben lassen</button>'
            }
        </div>

        <div class="card"><div class="card-label">Aktivitäten</div><div class="activity-log">${logs}</div></div>

        <div class="modal-actions">
        ${(o.column==='Abgeholt' && hasPerm('reparatur_handle') && !o.isReparatur)?
            '<button class="action-btn" onclick="openReparaturForm(\''+id+'\')" style="margin-top:8px;background:#2563eb;color:white"><span style="display:inline-flex;margin-right:3px">🔧</span> Reparatur erfassen</button>' : ''}
        ${(o.column==='Gelöscht')?
            '<button class="action-btn danger" onclick="permanentDeleteOrder(\''+id+'\')" style="margin-top:8px"><span style="display:inline-flex;margin-right:3px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span> Endgültig löschen</button>' :
            '<button class="action-btn danger" onclick="deleteOrder(\''+id+'\')" style="margin-top:8px"><span style="display:inline-flex;margin-right:3px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span> Löschen</button>'}
        </div>`;
    document.getElementById('orderModal').classList.add('active');
    // Split telefon into vorwahl + nummer
    const telRaw = o.telefon || '';
    const vorwahlList = ['+421','+420','+387','+385','+381','+90','+49','+48','+44','+43','+41','+40','+39','+36'];
    let matchedVorwahl = '+43', matchedNummer = telRaw;
    for (const vw of vorwahlList) {
        if (telRaw.startsWith(vw)) { matchedVorwahl = vw; matchedNummer = telRaw.slice(vw.length); break; }
    }
    const editVwEl = document.getElementById('editVorwahl');
    const editNrEl = document.getElementById('editTelNummer');
    if (editVwEl) editVwEl.value = matchedVorwahl;
    if (editNrEl) editNrEl.value = matchedNummer;
    renderEditMeasures(id);
}

function renderEditMeasures(orderId) {
    const el = document.getElementById('editMeasuresContainer');
    if (!el) return;
    // v1.18.14: Lock-Logik — Modell und Varianten sind gesperrt wenn Bestellung
    // schon "In Produktion" oder weiter (außer bei Reparatur)
    const o = orders.find(x => x.id === orderId);
    const lockedColumns = ['In Produktion', 'Abholbereit', 'Abgeholt', 'Archiviert'];
    const isLocked = o && lockedColumns.includes(o.column) && !o.isReparatur;
    const lockHint = isLocked
        ? `<div style="margin-bottom:8px;padding:8px 10px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:11px;color:#78350f">⚠ Bestellung ist in "${o.column}" — Modell und Varianten können nur nach Verschieben zurück nach "Bestellung" geändert werden.</div>`
        : '';

    el.innerHTML = lockHint + editMeasures.map((m,i) => {
        // Modell-Dropdown — alle aktiven Modelle.
        // Wenn die Bestellung ein inaktives Modell referenziert (z.B. via Webshop bestellt
        // bevor `active` umgestellt wurde), trotzdem im Dropdown anzeigen mit "(inaktiv)"-Markierung,
        // damit die Bestellung nicht als "Modell fehlt" erscheint.
        const activeModels = (cachedModels || []).filter(mm => mm.active !== false);
        const dropdownModels = [...activeModels];
        if (m.modelId && !activeModels.some(am => am.id === m.modelId)) {
            const inactive = (cachedModels || []).find(mm => mm.id === m.modelId);
            if (inactive) dropdownModels.push({ ...inactive, _inactive: true });
        }
        const modelOpts = ['<option value="">— bitte wählen —</option>'].concat(
            dropdownModels.map(mm => `<option value="${esc(mm.id)}"${mm.id===m.modelId?' selected':''}>${escHtml(mm.name)}${mm._inactive ? ' (inaktiv)' : ''}</option>`)
        ).join('');
        const modelMissing = !m.modelId;
        const modelBorder = modelMissing
            ? 'border:2px solid var(--amber);background:#fffbeb'
            : 'border:1px solid var(--border);background:var(--card)';
        const modelDropdown = activeModels.length > 0
            ? `<div class="field"><label>Modell</label>
                <select onchange="updateEditMeasureModel(${i}, this.value, '${orderId}')" ${isLocked?'disabled':''} style="font-size:13px;padding:9px 8px;width:100%;${modelBorder};border-radius:8px;font-family:inherit;${isLocked?'opacity:0.5':''}">${modelOpts}</select></div>`
            : '';

        // Varianten als Dropdowns mit "— bitte wählen —" (v1.18.17 Phase 5)
        let variantsHtml = '';
        const currentModel = m.modelId ? getModel(m.modelId) : null;
        const modelVariantIds = (currentModel && currentModel.variantIds) || [];
        modelVariantIds.forEach(vid => {
            const variant = getVariant(vid);
            if (!variant || variant.active === false) return;
            const opts = (variant.options || []).filter(opt => opt && !(opt.nurDoppeltuer && !m.doppeltuer));
            if (!opts.length) return;

            const currentOpt = m.variants && m.variants[vid];
            const optMissing = !currentOpt;
            const optBorder = optMissing
                ? 'border:2px solid var(--amber);background:#fffbeb'
                : 'border:1px solid var(--border);background:var(--card)';
            const placeholder = `<option value=""${!currentOpt?' selected':''} disabled>— bitte wählen —</option>`;
            const dropdownOpts = placeholder + opts.map(opt => `<option value="${esc(opt.id)}"${currentOpt===opt.id?' selected':''}>${escHtml(opt.label)}</option>`).join('');
            variantsHtml += `<div class="field"><label>${escHtml(variant.name)}</label>
                <select onchange="updateEditMeasureVariant(${i},'${esc(vid)}',this.value,'${orderId}')" ${isLocked?'disabled':''} style="font-size:13px;padding:9px 8px;width:100%;${optBorder};border-radius:8px;font-family:inherit;${isLocked?'opacity:0.5':''}">${dropdownOpts}</select></div>`;

            // Plissee-Folgeauswahl
            const currentOptObj = opts.find(opt => opt.id === currentOpt);
            if (currentOptObj && currentOptObj.plisseeFollowup) {
                const activePlisseeColors = (cachedPlisseeColors || []).filter(c => c.active !== false);
                if (activePlisseeColors.length) {
                    const currentPC = m.variants && m.variants.plisseeFarbe;
                    const pcMissing = !currentPC;
                    const pcBorder = pcMissing
                        ? 'border:2px solid var(--amber);background:#fffbeb'
                        : 'border:1px solid var(--border);background:var(--card)';
                    const plisseePlaceholder = `<option value=""${!currentPC?' selected':''} disabled>— bitte wählen —</option>`;
                    const plisseeOpts = plisseePlaceholder + activePlisseeColors.map(c => `<option value="${esc(c.id)}"${currentPC===c.id?' selected':''}>${escHtml(c.name)}</option>`).join('');
                    variantsHtml += `<div class="field"><label>Plissee-Farbe</label>
                        <select onchange="updateEditMeasureVariant(${i},'plisseeFarbe',this.value,'${orderId}')" ${isLocked?'disabled':''} style="font-size:13px;padding:9px 8px;width:100%;${pcBorder};border-radius:8px;font-family:inherit;${isLocked?'opacity:0.5':''}">${plisseeOpts}</select></div>`;
                }
            }
        });

        const hasBP = m.variants && (m.variants.schwellenlos === 'ja' || m.variants.bodenprofil === 'ja');

        return `<div class="edit-measure-row" style="display:block;border:1px solid var(--border-light);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--bg-light)">
            ${editMeasures.length>1?`<button onclick="editMeasures.splice(${i},1);renderEditMeasures('${orderId}');calcEditPrice('${orderId}')" style="position:absolute;right:8px;top:8px;background:var(--red);color:white;border:none;width:24px;height:24px;border-radius:50%;cursor:pointer;font-family:inherit">×</button>`:''}

            <!-- v1.18.17 Phase 6: Maße + Skizze responsiv (Handy=untereinander, Desktop=nebeneinander) -->
            <div class="masse-layout">
                <div class="masse-layout-inputs">
                    <!-- Maße + Stk -->
                    <div style="display:flex;gap:8px;align-items:flex-end">
                        <div class="field" style="flex:1"><label>Breite (cm)</label><input type="number" min="1" max="${MAX_MASS_CM}" step="0.1" value="${m.breite}" oninput="editMeasures[${i}].breite=parseFloat(this.value)||0;calcEditPrice('${orderId}');updateEditMassePreview('${orderId}',${i})" placeholder="100"></div>
                        <div class="field" style="flex:1"><label>Höhe (cm)</label><input type="number" min="1" max="${MAX_MASS_CM}" step="0.1" value="${m.hoehe}" oninput="editMeasures[${i}].hoehe=parseFloat(this.value)||0;calcEditPrice('${orderId}');updateEditMassePreview('${orderId}',${i})" placeholder="200"></div>
                        <div class="field" style="width:55px;flex-shrink:0"><label>Stk</label><input type="number" value="${m.stueck}" min="1" oninput="editMeasures[${i}].stueck=parseInt(this.value)||1;calcEditPrice('${orderId}')"></div>
                    </div>
                    <!-- Farbe + €/m² -->
                    <div style="display:flex;gap:8px;align-items:flex-end">
                        <div class="field" style="flex:1"><label>Farbe</label>
                            <select onchange="editMeasures[${i}].farbe=this.value;calcEditPrice('${orderId}')" style="font-size:13px;padding:9px 8px;width:100%">
                                <option value="Antrazit"${m.farbe==='Antrazit'?' selected':''}>Antrazit</option>
                                <option value="Weiß"${m.farbe==='Weiß'?' selected':''}>Weiß</option>
                                <option value="Braun"${m.farbe==='Braun'?' selected':''}>Braun</option>
                            </select>
                        </div>
                        <div class="field" style="width:75px;flex-shrink:0"><label>€/m²</label><input type="number" value="${m.preis||sqmPrice}" step="0.5" oninput="editMeasures[${i}].preis=parseFloat(this.value)||0;calcEditPrice('${orderId}')"></div>
                    </div>
                    <!-- Modell -->
                    ${modelDropdown}
                </div>
                <!-- Skizze rechts (auf Handy unten) -->
                <div id="editMassePreview_${orderId}_${i}" class="masse-layout-preview">${renderMasseSvg(m.breite, m.hoehe, !!m.doppeltuer, true, false, hasBP)}${renderMeasureVariantPills(m, {compact:true})}</div>
            </div>

            <!-- Varianten als Grid -->
            ${variantsHtml ? `<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px;margin-top:8px">${variantsHtml}</div>` : ''}

            <!-- Bemerkung -->
            <div class="field" style="margin-top:8px"><label>Bemerkung (Maß)</label>
                <input type="text" value="${escHtml(m.bemerkung||'')}" oninput="editMeasures[${i}].bemerkung=this.value" placeholder="z.B. links anschlagend" style="font-size:13px;padding:9px 8px;width:100%">
            </div>
        </div>`;
    }).join('');
    calcEditPrice(orderId);
}

// v1.18.17 Phase 5: Live-Skizze beim Edit-Formular
function updateEditMassePreview(orderId, i) {
    const m = editMeasures[i];
    if (!m) return;
    const el = document.getElementById('editMassePreview_' + orderId + '_' + i);
    if (!el) return;
    if (m.breite && m.hoehe) {
        const hasBP = m.variants && (m.variants.schwellenlos === 'ja' || m.variants.bodenprofil === 'ja');
        el.innerHTML = renderMasseSvg(m.breite, m.hoehe, !!m.doppeltuer, true, false, hasBP) + renderMeasureVariantPills(m, {compact:true});
    } else {
        el.innerHTML = '';
    }
}

function addEditMeasure(orderId) {
    // v1.18.14-fix: variants und modelId initialisieren damit neue Maße konsistent
    // mit bestehenden gespeichert werden.
    editMeasures.push({breite:'',hoehe:'',stueck:1,farbe:'Antrazit',preis:sqmPrice,doppeltuer:false,variants:{},modelId:'',bemerkung:'',materialColors:{}});
    renderEditMeasures(orderId);
}

// v1.18.14: Variante in einem Edit-Maß ändern
function updateEditMeasureVariant(i, variantId, optionId, orderId) {
    if (!editMeasures[i]) return;
    if (!editMeasures[i].variants) editMeasures[i].variants = {};
    editMeasures[i].variants[variantId] = optionId;
    // Spezialfall: Türart synchronisiert mit doppeltuer-Flag
    if (variantId === 'tuerart') {
        const isDt = optionId === 'doppel';
        editMeasures[i].doppeltuer = isDt;
        // Preis-Vorschlag aus Modell anpassen
        const mdl = (cachedModels || []).find(mm => mm.id === editMeasures[i].modelId);
        if (mdl && mdl.pricing) {
            const newPrice = isDt ? mdl.pricing.defaultSqmPriceDoppeltuer : mdl.pricing.defaultSqmPriceEinzeltuer;
            if (newPrice) editMeasures[i].preis = newPrice;
        }
    }
    renderEditMeasures(orderId);
}

// v1.18.14: Modell in einem Edit-Maß ändern
async function updateEditMeasureModel(i, newModelId, orderId) {
    if (!editMeasures[i]) return;
    const oldModelId = editMeasures[i].modelId;
    if (newModelId === oldModelId) return;

    const newModel = newModelId ? getModel(newModelId) : null;
    const newPrice = newModel && newModel.pricing
        ? (editMeasures[i].doppeltuer ? newModel.pricing.defaultSqmPriceDoppeltuer : newModel.pricing.defaultSqmPriceEinzeltuer)
        : null;
    const oldPrice = editMeasures[i].preis || 0;

    // Wenn neuer Preis vorhanden und unterschiedlich → Bestätigung
    if (newPrice && Math.abs(newPrice - oldPrice) > 0.01) {
        const confirmed = await new Promise(resolve => {
            // showConfirm hat nur onConfirm — falls Cancel, wird die Promise nie aufgelöst.
            // Wir geben dem User Auto-Resolve-Timeout = "nicht übernehmen" wenn er Cancel klickt.
            let resolved = false;
            showConfirm(
                'Modell-Wechsel: Preis anpassen?',
                `Das neue Modell "${escHtml(newModel.name)}" hat einen anderen Preis (€${newPrice}/m² statt €${oldPrice}/m²). Soll der Preis automatisch übernommen werden?`,
                'Preis übernehmen',
                () => { resolved = true; resolve(true); },
                false  // not dangerous
            );
            // Cancel-Fallback: prüfe nach 500ms ob das overlay weg ist und nichts aufgelöst wurde
            const checkInterval = setInterval(() => {
                if (!document.querySelector('.confirm-overlay')) {
                    clearInterval(checkInterval);
                    if (!resolved) resolve(false);
                }
            }, 100);
        });
        if (confirmed) {
            editMeasures[i].preis = newPrice;
        }
    }

    editMeasures[i].modelId = newModelId;
    // Alte Varianten zurücksetzen, weil sie zum alten Modell gehörten
    editMeasures[i].variants = {};
    // Defaults aus neuem Modell setzen
    if (newModel && Array.isArray(newModel.variantIds)) {
        newModel.variantIds.forEach(vid => {
            const variant = getVariant(vid);
            if (!variant || variant.active === false) return;
            const def = variant.defaultOption;
            if (def) editMeasures[i].variants[vid] = def;
        });
    }
    // tuerart aus doppeltuer-Flag synchronisieren
    editMeasures[i].variants.tuerart = editMeasures[i].doppeltuer ? 'doppel' : 'einzel';
    renderEditMeasures(orderId);
}

function calcEditPrice(orderId) {
    let total=0;
    const linesEl=document.getElementById('editPriceLines');
    const summaryEl=document.getElementById('editPriceSummary');
    const paySection=document.getElementById('editPaymentSection');
    if(!linesEl||!summaryEl) return;
    let linesHtml='';
    editMeasures.forEach((m,i) => {
        const b=parseFloat(m.breite)||0, h=parseFloat(m.hoehe)||0, s=m.stueck||1, p=m.preis||sqmPrice;
        const rawSqm=(b/100)*(h/100)*s;
        const billableSqm=Math.max(rawSqm, 1*s);
        const lineTotal=billableSqm*p;
        total+=lineTotal;
        if(b&&h) {
            const minHint = rawSqm < 1*s ? ' <span style="color:var(--amber);font-size:11px;font-weight:600">(Mind. '+s+' m²)</span>' : '';
            // Variant-Hinweise (v1.16.8-p1, p3, v1.17.3)
            const variantHints = [];
            const mv = m.variants || {};
            Object.keys(mv).forEach(vid => {
                if (vid === 'tuerart') return;
                if (vid === 'plisseeFarbe') return;
                const variant = (typeof getVariant === 'function') ? getVariant(vid) : null;
                if (!variant) return;
                const opt = (variant.options || []).find(o => o.id === mv[vid]);
                if (!opt) return;
                if (variant.defaultOption && variant.defaultOption === opt.id) return;
                let label = opt.label;
                const isYesLike = /^(ja|yes)$/i.test(opt.label || '');
                if (isYesLike) label = variant.name;
                if (opt.plisseeFollowup && mv.plisseeFarbe) {
                    const pc = (typeof getPlisseeColor === 'function') ? getPlisseeColor(mv.plisseeFarbe) : null;
                    if (pc) label = (isYesLike ? variant.name : opt.label) + ' - ' + pc.name;
                }
                variantHints.push(label);
            });
            const variantStr = variantHints.length ? ' <span style="color:var(--primary);font-size:11px;font-weight:700;background:var(--primary-bg);padding:1px 6px;border-radius:6px;margin-left:4px">' + variantHints.map(escHtml).join(', ') + '</span>' : '';
            linesHtml+=`<div class="price-line"><div class="price-line-desc">${b}×${h} cm ${m.farbe||'Antrazit'} ${s} Stück${variantStr}${minHint}</div><div class="price-line-calc"><span class="price-line-sqm">${billableSqm.toFixed(2)} m² × <input class="price-sqm-input" type="number" value="${p}" step="0.5" oninput="editMeasures[${i}].preis=parseFloat(this.value)||0;calcEditPrice('${orderId}')"> €/m²</span><span class="price-line-amount">€ ${lineTotal.toFixed(2)}</span></div></div>`;
        }
    });
    linesEl.innerHTML=linesHtml||'<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Keine Artikel</div>';

    const o=orders.find(x=>x.id===orderId);
    // If saved totalPrice differs from calculated (admin manual override), use saved
    const savedTotal = o ? (o.totalPrice||0) : 0;
    if (savedTotal && Math.abs(savedTotal - total) > 0.02) total = savedTotal;
    const payments=o?(o.payments||[]):[];
    const totalPaid=payments.reduce((s,p)=>s+(p.amount||0),0);
    const offen=total-totalPaid;
    const isPaid = o && o.paid;

    // Combined summary with visual bar
    const paidPercent = total > 0 ? Math.min(100, Math.round((totalPaid / total) * 100)) : 0;
    const barColor = offen <= 0 ? 'var(--green)' : totalPaid > 0 ? 'var(--amber)' : 'var(--red)';

    let html = '';

    // Total line - editable for admin
    if (isAdmin()) {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 8px;border-top:2px solid var(--border)">
            <span style="font-size:16px;font-weight:700">Gesamt</span>
            <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:16px;font-weight:700">€</span>
                <input type="number" id="editTotalOverride" value="${total.toFixed(2)}" step="0.01" min="0" style="width:100px;padding:6px 10px;font-size:18px;font-weight:700;text-align:right;border:2px solid var(--primary-light);border-radius:8px;font-family:inherit;color:var(--primary);background:var(--primary-bg)" oninput="onTotalOverride('${orderId}')">
            </div>
        </div>`;
    } else {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 8px;border-top:2px solid var(--border)">
            <span style="font-size:16px;font-weight:700">Gesamt</span>
            <span style="font-size:20px;font-weight:700">€ ${total.toFixed(2)}</span>
        </div>`;
    }

    // Progress bar
    html += `<div style="background:var(--border-light);border-radius:6px;height:8px;margin-bottom:12px;overflow:hidden">
        <div style="background:${barColor};height:100%;width:${paidPercent}%;border-radius:6px;transition:width 0.3s"></div>
    </div>`;

    // Payment rows
    if (payments.length) {
        html += `<div style="margin-bottom:8px">`;
        payments.forEach(p => {
            const ds = p.date ? formatPayDate(p.date) : '';
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-light)">
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:14px">💰</span>
                    <div>
                        <div style="font-size:13px;font-weight:600">${escHtml(p.label||'Zahlung')}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${ds}</div>
                    </div>
                </div>
                <span style="font-size:14px;font-weight:700;color:var(--green)">- € ${(p.amount||0).toFixed(2)}</span>
            </div>`;
        });
        html += `</div>`;
    }

    // Open amount
    html += `<div id="editOffenDisplay" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-radius:10px;background:${offen<=0?'var(--green-bg)':'var(--red-bg)'}">
        <span style="font-size:15px;font-weight:700;color:${offen<=0?'var(--green)':'var(--red)'}">${offen<=0?'<span style="display:inline-flex;vertical-align:middle;margin-right:3px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Vollständig bezahlt':'Offener Betrag'}</span>
        <span style="font-size:18px;font-weight:700;color:${offen<=0?'var(--green)':'var(--red)'}">€ ${offen.toFixed(2)}</span>
    </div>`;

    summaryEl.innerHTML = html;

    // Payment actions (show if there's an open amount, regardless of paid flag)
    if (paySection) {
        if (offen > 0.01) {
            paySection.innerHTML = `
                <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
                    <input type="number" id="addPaymentAmount" placeholder="Betrag €" step="0.01" style="flex:1;padding:11px 14px;border:2px solid var(--border);border-radius:10px;font-size:15px;font-family:inherit;text-align:center">
                    <button onclick="addPayment('${orderId}')" style="padding:11px 18px;background:var(--primary);color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">＋ Zahlung</button>
                </div>
            `;
        } else {
            paySection.innerHTML = '';
        }
    }
}

function formatPayDate(ts){ const d=ts.toDate?ts.toDate():new Date(ts); return d.toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'}); }

async function addPayment(id){
    if (!hasPerm('orders_payment')) { showToast('Keine Berechtigung.','warning'); return; }
    const amtEl=document.getElementById('addPaymentAmount');
    const amount=parseFloat(amtEl.value);
    if(!amount||amount<=0){showToast('Bitte Betrag eingeben.','warning');return;}
    await db.collection('orders').doc(id).update({
        payments:firebase.firestore.FieldValue.arrayUnion({amount,date:firebase.firestore.Timestamp.now(),label:'Anzahlung'}),
        anzahlung:firebase.firestore.FieldValue.increment(amount),
        log:firebase.firestore.FieldValue.arrayUnion({time:firebase.firestore.Timestamp.now(),text:`${getUserName()} hat Zahlung von € ${amount.toFixed(2)} eingetragen`})
    });
    setTimeout(()=>openOrderDetail(id),300);
}

async function markPaidRest(id){
    if (!hasPerm('orders_payment')) { showToast('Keine Berechtigung.','warning'); return; }
    const o=orders.find(x=>x.id===id); if(!o) return;
    const payments=o.payments||[];
    const totalPaid=payments.reduce((s,p)=>s+(p.amount||0),0);
    const rest=(o.totalPrice||0)-totalPaid;
    if(rest<0.01){showToast('Bereits vollständig bezahlt.','info');return;}
    await db.collection('orders').doc(id).update({
        payments:firebase.firestore.FieldValue.arrayUnion({amount:rest,date:firebase.firestore.Timestamp.now(),label:'Bezahlt'}),
        anzahlung:o.totalPrice||0, paid:true,
        log:firebase.firestore.FieldValue.arrayUnion({time:firebase.firestore.Timestamp.now(),text:`${getUserName()} hat Restbetrag € ${rest.toFixed(2)} als bezahlt markiert`})
    });
    setTimeout(()=>openOrderDetail(id),300);
}

async function saveOrderEdit(id) {
    if (!hasPerm('orders_edit')) { showToast('Keine Berechtigung.','warning'); return; }
    showConfirm('Änderungen speichern', 'Möchtest du die Änderungen an dieser Bestellung speichern?', 'Speichern', async () => { await doSaveOrderEdit(id); }, false);
}

async function doSaveOrderEdit(id) {
    const o = orders.find(x=>x.id===id); if(!o) return;
    const vorname = document.getElementById('editVorname').value.trim();
    const nachname = document.getElementById('editNachname').value.trim();
    const editVw = document.getElementById('editVorwahl').value;
    const editNr = document.getElementById('editTelNummer').value||'';
    const telefon = normalizePhone(editVw, editNr);
    const farbe = document.getElementById('editFarbe').value;
    const frist = document.getElementById('editFrist').value;
    const bestelldatum = document.getElementById('editBestelldatum').value;
    const bemerkung = document.getElementById('editBemerkung').value.trim();
    const payments = o.payments || [];
    const anzahlung = payments.reduce((s,p)=>s+(p.amount||0), 0);
    const validMeasures = editMeasures.filter(m=>m.breite&&m.hoehe);

    if(!vorname&&!nachname){ showToast('Bitte Name eingeben.','warning'); return; }
    if(!telefon){ showToast('Bitte Telefonnummer eingeben.','warning'); return; }
    if(!validMeasures.length){ showToast('Bitte Maß eingeben.','warning'); return; }

    // Maß-Plausibilitätsprüfung (Schutz vor Tippfehlern)
    const measureError = validateMeasures(validMeasures);
    if (measureError) {
        alert('⚠ Maß ungültig\n\n' + measureError);
        return;
    }

    // v1.18.14: Granulares Change-Tracking — jede Änderung einzeln im Log,
    // damit nachverfolgbar ist wer was wann geändert hat (User-Wunsch: "alles detailliert").
    const changes = [];

    // Kundendaten
    if(o.vorname!==vorname||o.nachname!==nachname) changes.push(`Name: "${o.vorname||''} ${o.nachname||''}" → "${vorname} ${nachname}"`);
    if(o.telefon!==telefon) changes.push(`Telefon: ${o.telefon||'(leer)'} → ${telefon}`);
    if(o.farbe!==farbe) changes.push(`Hauptfarbe: ${o.farbe||'(leer)'} → ${farbe}`);
    if((o.frist||'')!==(frist||'')) changes.push(`Frist: ${o.frist||'(leer)'} → ${frist||'(leer)'}`);
    if((o.bestelldatum||'')!==(bestelldatum||'')) changes.push(`Bestelldatum: ${o.bestelldatum||'(leer)'} → ${bestelldatum||'(leer)'}`);
    if((o.bemerkung||'')!==(bemerkung||'')) changes.push(`Bemerkung geändert`);

    // Maße — pro Maß-Index vergleichen
    const oldMeasures = o.measures || [];
    const newCount = validMeasures.length;
    const oldCount = oldMeasures.length;
    if (newCount !== oldCount) {
        if (newCount > oldCount) changes.push(`Maß hinzugefügt (${oldCount} → ${newCount})`);
        else changes.push(`Maß entfernt (${oldCount} → ${newCount})`);
    }
    // Pro existierendes Maß: Detail-Vergleich
    const compareCount = Math.min(newCount, oldCount);
    for (let i = 0; i < compareCount; i++) {
        const oldM = oldMeasures[i] || {};
        const newM = validMeasures[i] || {};
        const oldB = parseFloat(oldM.breite)||0, oldH = parseFloat(oldM.hoehe)||0;
        const newB = parseFloat(newM.breite)||0, newH = parseFloat(newM.hoehe)||0;
        const oldS = oldM.stueck||1, newS = newM.stueck||1;
        const oldP = oldM.sqmPrice||0, newP = parseFloat(newM.preis)||0;
        const oldFa = oldM.farbe||'', newFa = newM.farbe||'';
        const oldDt = !!oldM.doppeltuer, newDt = !!newM.doppeltuer;
        const oldMid = oldM.modelId||'', newMid = newM.modelId||'';
        const prefix = `Maß ${i+1}:`;

        if (oldB !== newB || oldH !== newH) changes.push(`${prefix} ${oldB}×${oldH} → ${newB}×${newH} cm`);
        if (oldS !== newS) changes.push(`${prefix} Stk ${oldS} → ${newS}`);
        if (oldFa !== newFa) changes.push(`${prefix} Farbe ${oldFa||'(leer)'} → ${newFa||'(leer)'}`);
        if (Math.abs(oldP - newP) > 0.01) changes.push(`${prefix} Preis €${oldP.toFixed(2)}/m² → €${newP.toFixed(2)}/m²`);
        if (oldDt !== newDt) changes.push(`${prefix} Türart ${oldDt?'Doppeltür':'Einzeltür'} → ${newDt?'Doppeltür':'Einzeltür'}`);

        // Modell-Wechsel
        if (oldMid !== newMid) {
            const oldName = oldMid ? (getModel(oldMid)?.name || oldMid) : '(keines)';
            const newName = newMid ? (getModel(newMid)?.name || newMid) : '(keines)';
            changes.push(`${prefix} Modell ${oldName} → ${newName}`);
        }

        // Varianten-Vergleich (außer tuerart, das wird oben durch Türart abgedeckt)
        const oldVars = oldM.variants || {};
        const newVars = newM.variants || {};
        const allVarIds = new Set([...Object.keys(oldVars), ...Object.keys(newVars)]);
        allVarIds.forEach(vid => {
            if (vid === 'tuerart') return;
            const ov = oldVars[vid] || '';
            const nv = newVars[vid] || '';
            if (ov !== nv) {
                const variant = (typeof getVariant === 'function') ? getVariant(vid) : null;
                const vName = variant ? variant.name : vid;
                let oLabel = ov;
                let nLabel = nv;
                if (vid === 'plisseeFarbe' && typeof getPlisseeColor === 'function') {
                    oLabel = ov ? (getPlisseeColor(ov)?.name || ov) : '(keine)';
                    nLabel = nv ? (getPlisseeColor(nv)?.name || nv) : '(keine)';
                } else if (variant) {
                    const oOpt = (variant.options||[]).find(o => o.id === ov);
                    const nOpt = (variant.options||[]).find(o => o.id === nv);
                    oLabel = oOpt ? oOpt.label : (ov || '(keine)');
                    nLabel = nOpt ? nOpt.label : (nv || '(keine)');
                }
                changes.push(`${prefix} ${vName}: ${oLabel} → ${nLabel}`);
            }
        });

        // Maß-Bemerkung
        const oldBem = oldM.bemerkung || '';
        const newBem = newM.bemerkung || '';
        if (oldBem !== newBem) changes.push(`${prefix} Bemerkung: "${oldBem}" → "${newBem}"`);
    }

    let totalSqm=0, totalPrice=0;
    const measures = validMeasures.map(m=>{
        const b=parseFloat(m.breite),h=parseFloat(m.hoehe),s=m.stueck||1,p=m.preis||sqmPrice;
        const sq=(b/100)*(h/100)*s; const billSq=Math.max(sq, 1*s); totalSqm+=sq; totalPrice+=billSq*p;
        // v1.18.14: variants und modelId IMMER speichern wenn vorhanden — auch wenn modelId leer ist.
        // Vorher: if (m.modelId) {...} hat variants verloren wenn modelId fehlte (Bug bei alten Bestellungen).
        const measureObj = {breite:b,hoehe:h,stueck:s,farbe:m.farbe||'Antrazit',sqmPrice:p,doppeltuer:!!m.doppeltuer};
        if (m.modelId) measureObj.modelId = m.modelId;
        // Variants: kopieren + tuerart aus doppeltuer-Checkbox synchronisieren
        const variants = Object.assign({}, m.variants || {});
        variants.tuerart = m.doppeltuer ? 'doppel' : 'einzel';
        // Nur speichern wenn es echte Varianten gibt (nicht nur tuerart, das ergibt sich aus doppeltuer)
        const hasRealVariants = Object.keys(variants).filter(k => k !== 'tuerart').length > 0;
        if (m.modelId || hasRealVariants) {
            measureObj.variants = variants;
        }
        if (m.bemerkung) measureObj.bemerkung = m.bemerkung;
        if (m.materialColors) measureObj.materialColors = m.materialColors;
        return measureObj;
    });

    // Check if admin overrode the total price
    if (isAdmin() && totalOverrideValue !== null && Math.abs(totalOverrideValue - totalPrice) > 0.01) {
        totalPrice = totalOverrideValue;
        changes.push('Preis manuell auf € ' + totalPrice.toFixed(2) + ' geändert');
    }
    totalOverrideValue = null;

    const updateData = {
        vorname, nachname, telefon, farbe,
        measures,
        totalSqm: parseFloat(totalSqm.toFixed(4)),
        totalPrice: parseFloat(totalPrice.toFixed(2)),
        anzahlung,
        frist: frist||null,
        bestelldatum: bestelldatum||null,
        bemerkung: bemerkung||null
    };

    // v1.18.14: Pro Change einen eigenen Log-Eintrag (granular wie User wollte)
    if (changes.length) {
        const userName = getUserName();
        const baseTime = Date.now();
        const logEntries = changes.map((ch, idx) => ({
            // Mini-Offset damit Reihenfolge stabil bleibt (1ms pro Change)
            time: firebase.firestore.Timestamp.fromMillis(baseTime + idx),
            text: `${userName}: ${ch}`
        }));
        updateData.log = firebase.firestore.FieldValue.arrayUnion(...logEntries);
    }

    try {
        await db.collection('orders').doc(id).update(updateData);
        // Wait briefly for snapshot to update, then reopen
        setTimeout(()=>openOrderDetail(id), 300);
        showToast('Änderungen gespeichert!','success');
    } catch(e) { showToast('Fehler: '+e.message,'error'); }
}

async function toggleNotify(id, type, checked) {
    if (!hasPerm('customer_notify')) { showToast('Keine Berechtigung.','warning'); return; }
    const labels = {whatsapp:'WhatsApp', sms:'SMS', anruf:'Anruf'};
    const update = {};
    update[`notified.${type}`] = checked;
    if (checked) {
        update[`notified.${type}_time`] = firebase.firestore.Timestamp.now();
    } else {
        update[`notified.${type}_time`] = firebase.firestore.FieldValue.delete();
    }
    const logText = checked
        ? `${getUserName()} hat ${labels[type]}-Benachrichtigung als erledigt markiert`
        : `${getUserName()} hat ${labels[type]}-Benachrichtigung zurückgesetzt`;
    update.log = firebase.firestore.FieldValue.arrayUnion({time:firebase.firestore.Timestamp.now(), text:logText});

    await db.collection('orders').doc(id).update(update);
    setTimeout(()=>openOrderDetail(id), 300);
}

// Auto-mark as notified when WhatsApp/Anruf button is clicked
async function markNotified(id, type) {
    const labels = {whatsapp:'WhatsApp', sms:'SMS', anruf:'Anruf'};
    const update = {};
    update[`notified.${type}`] = true;
    update[`notified.${type}_time`] = firebase.firestore.Timestamp.now();
    update.log = firebase.firestore.FieldValue.arrayUnion({
        time: firebase.firestore.Timestamp.now(),
        text: `${getUserName()} hat Kunde per ${labels[type]} benachrichtigt`
    });
    await db.collection('orders').doc(id).update(update);
    showToast(`${labels[type]}-Benachrichtigung gesendet`, 'success');
    setTimeout(()=>openOrderDetail(id), 500);
}
function closeModal() { document.getElementById('orderModal').classList.remove('active'); }
function formatLogTime(ts) { if(!ts) return ''; const d=ts.toDate?ts.toDate():new Date(ts); return d.toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'}); }

async function markPaid(id) { await markPaidRest(id); }
async function deleteOrder(id) {
    if (!hasPerm('orders_delete')) { showToast('Keine Berechtigung.','warning'); return; }
    showConfirm('Bestellung löschen', 'Die Bestellung wird in den Papierkorb verschoben.', 'Löschen', async () => {
        await db.collection('orders').doc(id).update({
            column: 'Gelöscht',
            log: firebase.firestore.FieldValue.arrayUnion({
                time: firebase.firestore.Timestamp.now(),
                text: getUserName() + ' hat Bestellung gelöscht'
            })
        });
        closeModal();
        showToast('Bestellung in Papierkorb verschoben.','success');
    });
}

async function permanentDeleteOrder(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    const fullName = ((o.vorname||'') + ' ' + (o.nachname||'')).trim();
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-box">
        <div class="confirm-icon" style="color:var(--red)"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>
        <div class="confirm-title">Endgültig löschen</div>
        <div class="confirm-msg">Diese Bestellung wird unwiderruflich gelöscht. Tippe <b>"${escHtml(fullName)}"</b> ein um zu bestätigen:</div>
        <input type="text" id="deleteConfirmInput" placeholder="Name eingeben..." style="width:100%;padding:12px;font-size:15px;border:2px solid var(--red);border-radius:10px;font-family:inherit;text-align:center;margin:12px 0">
        <div class="confirm-actions">
            <button class="confirm-btn confirm-cancel" onclick="this.closest('.confirm-overlay').remove()">Abbrechen</button>
            <button class="confirm-btn confirm-danger" id="permDeleteBtn" disabled onclick="execPermDelete('${id}',this.closest('.confirm-overlay'))">Endgültig löschen</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#deleteConfirmInput');
    const btn = overlay.querySelector('#permDeleteBtn');
    inp.oninput = () => { btn.disabled = inp.value.trim().toLowerCase() !== fullName.toLowerCase(); btn.style.opacity = btn.disabled ? '0.4' : '1'; };
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
async function execPermDelete(id, overlay) {
    await db.collection('orders').doc(id).delete();
    overlay.remove(); closeModal();
    showToast('Bestellung endgültig gelöscht.','success');
}


// ═══ ENTWÜRFE (v1.15.0) ═══

let editingDraftId = null; // Wenn ein Entwurf zum Bearbeiten geöffnet ist

// Helfer: aktuelle Filiale-Auswahl aus dem Filter-Dropdown lesen
function getCurrentFilialeFilter() {
    const el = document.getElementById('filialeSelect');
    return el ? el.value : '';
}

// Generiert nächste Entwurfsnummer EW-YYYY-XXX
function generateDraftNumber() {
    const year = new Date().getFullYear();
    let maxNum = 0;
    drafts.forEach(d => {
        if (!d.draftNumber) return;
        const match = d.draftNumber.match(/^EW-(\d{4})-(\d+)$/);
        if (match && parseInt(match[1]) === year) {
            maxNum = Math.max(maxNum, parseInt(match[2]));
        }
    });
    return 'EW-' + year + '-' + String(maxNum + 1).padStart(3, '0');
}

// Beim Tab-Öffnen: abgelaufene Entwürfe löschen (Auto-Delete bei Frist überschritten)
async function cleanupExpiredDrafts() {
    const today = new Date().toISOString().split('T')[0];
    const expired = drafts.filter(d => d.frist && d.frist < today);
    if (!expired.length) return;
    for (const d of expired) {
        try {
            await db.collection('orders').doc(d.id).delete();
        } catch(e) { console.error('cleanup expired draft:', e); }
    }
    if (expired.length > 0) {
        showToast(`${expired.length} abgelaufene Entwürfe gelöscht.`, 'success', 3000);
    }
}

// Badge-Counter im Tab aktualisieren
function updateDraftsBadge() {
    const badge = document.getElementById('draftsBadge');
    if (!badge) return;
    // Filiale-Filter wie bei Bestellungen
    let visible = drafts;
    const selectedFiliale = getCurrentFilialeFilter();
    if (selectedFiliale) {
        visible = visible.filter(d => d.filialeId === selectedFiliale);
    } else if (!isSuperAdmin() && !isAdmin() && currentUserFilialeId) {
        visible = visible.filter(d => d.filialeId === currentUserFilialeId || !d.filialeId);
    }
    if (visible.length > 0) {
        badge.textContent = visible.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Liste der Entwürfe rendern
function renderDraftsList() {
    const el = document.getElementById('draftsList');
    if (!el) return;

    // Filiale-Filter wie bei Bestellungen
    let visible = drafts;
    const selectedFiliale = getCurrentFilialeFilter();
    if (selectedFiliale) {
        visible = visible.filter(d => d.filialeId === selectedFiliale);
    } else if (!isSuperAdmin() && !isAdmin() && currentUserFilialeId) {
        visible = visible.filter(d => d.filialeId === currentUserFilialeId || !d.filialeId);
    }

    // Sortierung: neueste zuerst
    visible = [...visible].sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
    });

    if (!visible.length) {
        el.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:20px;text-align:center;line-height:1.6">
            Noch keine Entwürfe.<br>
            <span style="font-size:11px">Im "Neue Bestellung"-Tab kannst du eine Bestellung als Entwurf speichern.</span>
        </div>`;
        return;
    }

    el.innerHTML = visible.map(d => {
        const fullName = ((d.vorname || '') + ' ' + (d.nachname || '')).trim() || '(ohne Name)';
        const measures = d.measures || [];
        const totalSqm = measures.reduce((s, m) => s + (m.breite/100) * (m.hoehe/100) * (m.stueck||1), 0);
        const totalPrice = d.totalPrice || 0;
        const today = new Date().toISOString().split('T')[0];
        const fristExpired = d.frist && d.frist < today;
        const fristNear = d.frist && d.frist >= today && new Date(d.frist) - new Date(today) < 3 * 86400 * 1000;

        // Modell-Namen sammeln (eindeutig)
        const modelNames = [...new Set(measures.map(m => {
            if (!m.modelId) return null;
            const mdl = getModel(m.modelId);
            return mdl ? mdl.name : null;
        }).filter(Boolean))];

        return `<div onclick="openDraftDetail('${d.id}')" style="padding:12px;border:1px solid var(--border-light);border-radius:10px;margin-bottom:8px;cursor:pointer;background:var(--card)${fristExpired ? ';border-color:var(--red);background:#fef2f2' : ''}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:6px">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="font-size:11px;font-weight:700;color:#d97706;background:#fef3c7;padding:2px 8px;border-radius:6px">${escHtml(d.draftNumber || 'EW')}</span>
                    <span style="font-weight:700;font-size:14px">${escHtml(fullName)}</span>
                </div>
                <button onclick="event.stopPropagation();confirmDeleteDraft('${d.id}')" title="Entwurf löschen" style="padding:4px 8px;background:var(--border-light);color:var(--text-secondary);border:none;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11px">×</button>
            </div>
            ${d.telefon ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">📞 ${escHtml(d.telefon)}</div>` : ''}
            ${modelNames.length ? `<div style="font-size:11px;color:var(--primary);font-weight:600;margin-bottom:4px">${modelNames.map(n => escHtml(n)).join(' · ')}</div>` : ''}
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">
                ${measures.map(m => `<span style="display:inline-block;padding:1px 6px;background:var(--bg-light);border-radius:4px;margin-right:3px;margin-bottom:2px">${m.breite}×${m.hoehe}${m.stueck > 1 ? '×' + m.stueck : ''}${m.doppeltuer ? ' DT' : ''}</span>`).join('')}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px">
                <div style="color:var(--text-muted)">
                    ${formatDate(d.createdAt)}${d.frist ? ' · Frist: <span style="color:' + (fristExpired ? 'var(--red);font-weight:700' : fristNear ? 'var(--amber)' : 'var(--text-muted)') + '">' + d.frist.split('-').reverse().join('.') + '</span>' : ''}
                </div>
                <div style="font-weight:700;color:var(--primary);font-size:13px">€ ${totalPrice.toFixed(2)}</div>
            </div>
        </div>`;
    }).join('');
}

// Entwurf öffnen → in "Neue Bestellung" laden zum Bearbeiten
function openDraftDetail(draftId) {
    const d = drafts.find(x => x.id === draftId);
    if (!d) { showToast('Entwurf nicht gefunden.', 'error'); return; }

    // Daten in das "Neue Bestellung"-Formular laden
    editingDraftId = draftId;

    // Felder befüllen — mit kleiner Verzögerung damit Tab-Switch fertig ist
    switchTab('neu');
    setTimeout(() => {
        document.getElementById('newVorname').value = d.vorname || '';
        document.getElementById('newNachname').value = d.nachname || '';
        // Telefon: wenn vorhanden, auseinanderbauen — falls nicht möglich, einfach in newTelNummer schreiben
        if (d.telefon) {
            const telParts = parsePhoneToVorwahlNummer(d.telefon);
            if (telParts) {
                const vw = document.getElementById('newVorwahl');
                if (vw) vw.value = telParts.vorwahl;
                document.getElementById('newTelNummer').value = telParts.nummer;
            } else {
                document.getElementById('newTelNummer').value = d.telefon;
            }
        }
        document.getElementById('newBemerkung').value = d.bemerkung || '';
        document.getElementById('newAnzahlung').value = d.anzahlung || 0;
        document.getElementById('newBestelldatum').value = d.bestelldatum || new Date().toISOString().split('T')[0];
        if (d.frist) document.getElementById('newFrist').value = d.frist;

        // Maße in measureFields übernehmen (mit Varianten v1.15.1)
        measureFields = (d.measures || []).map(m => ({
            breite: m.breite, hoehe: m.hoehe, stueck: m.stueck || 1,
            farbe: m.farbe || 'Antrazit', preis: m.sqmPrice || sqmPrice,
            doppeltuer: !!m.doppeltuer, modelId: m.modelId || '',
            variants: Object.assign({}, m.variants || {})
        }));
        if (!measureFields.length) {
            measureFields = [{ breite: '', hoehe: '', stueck: 1, farbe: '', preis: sqmPrice, doppeltuer: false, modelId: '', variants: {} }];
        }
        renderNewForm();
        updateNewFormHeader();
        showToast('Entwurf geladen — du kannst ihn bearbeiten.', 'success', 2500);
    }, 100);
}

// Hilfsfunktion: Telefon zurück in Vorwahl + Nummer
function parsePhoneToVorwahlNummer(tel) {
    if (!tel) return null;
    // Versuche bekannte Vorwahlen +43, +49, +90 abzutrennen
    const match = tel.match(/^(\+\d{1,3})\s*(.+)$/);
    if (match) return { vorwahl: match[1], nummer: match[2].replace(/\s/g, '') };
    return null;
}

// Header der "Neue Bestellung" anpassen — zeigt Entwurfs-Modus
function updateNewFormHeader() {
    const headerLabel = document.querySelector('#tab-neu .card-label');
    if (!headerLabel) return;
    if (editingDraftId) {
        const d = drafts.find(x => x.id === editingDraftId);
        const num = d ? d.draftNumber || 'EW' : 'EW';
        headerLabel.innerHTML = `<span style="color:#d97706">📝 Entwurf bearbeiten: ${escHtml(num)}</span>`;
    } else {
        headerLabel.textContent = 'Neue Bestellung';
    }
    // Entwurfs-Aktionsleiste oben sichtbar machen falls vorhanden
    const draftActions = document.getElementById('draftActionsBar');
    if (draftActions) draftActions.style.display = editingDraftId ? '' : 'none';
    // Untere Knöpfe verstecken im Entwurfs-Modus (sonst doppelte Anzeige)
    const bottomBar = document.getElementById('bottomActionsBar');
    if (bottomBar) bottomBar.style.display = editingDraftId ? 'none' : 'flex';
}

// Entwurf-Modus verlassen — zurück zum normalen "Neue Bestellung"-Modus
function exitDraftEdit() {
    editingDraftId = null;
    resetNewForm();
}

// v1.18.19: Neue Bestellung-Felder leeren (Pull-out aus exitDraftEdit für Wiederverwendung)
function resetNewForm() {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('newVorname', '');
    setVal('newNachname', '');
    setVal('newTelNummer', '');
    setVal('newBemerkung', '');
    setVal('newAnzahlung', '');
    setVal('newFrist', '');
    setVal('newBestelldatum', new Date().toISOString().split('T')[0]);
    measureFields = [{ breite: '', hoehe: '', stueck: 1, farbe: '', preis: sqmPrice, doppeltuer: false, modelId: '', variants: {} }];
    if (typeof renderNewForm === 'function') renderNewForm();
    if (typeof updateNewFormHeader === 'function') updateNewFormHeader();
}

// v1.18.19: Prüft ob im "Neue Bestellung"-Formular bereits Daten eingegeben wurden.
// Wird beim Tab-Wechsel zu "neu" geprüft, damit der Mitarbeiter nicht ungewollt
// Daten verliert.
function hasNewFormData() {
    const get = id => (document.getElementById(id)?.value || '').trim();
    if (get('newVorname') || get('newNachname') || get('newTelNummer')
        || get('newBemerkung') || get('newAnzahlung') || get('newFrist')) {
        return true;
    }
    // Maße: gibt es mindestens ein Feld mit Breite oder Höhe?
    if (typeof measureFields !== 'undefined') {
        for (const m of measureFields) {
            if (m.breite || m.hoehe || (m.stueck && m.stueck > 1)) return true;
        }
    }
    return false;
}

// Entwurf speichern (neu oder Update)
async function saveAsDraft() {
    if (!hasPerm('orders_create')) { showToast('Keine Berechtigung.', 'warning'); return; }
    const vorname = document.getElementById('newVorname').value.trim();
    const nachname = document.getElementById('newNachname').value.trim();
    // Pflicht: Name (egal ob Vor- oder Nachname)
    if (!vorname && !nachname) { showToast('Bitte Name eingeben (Vor- oder Nachname).', 'warning'); return; }
    // Pflicht: mind. 1 gültiges Maß
    const valid = measureFields.filter(m => m.breite && m.hoehe);
    if (!valid.length) { showToast('Bitte mindestens ein Maß eingeben.', 'warning'); return; }

    const vorwahl = document.getElementById('newVorwahl').value;
    const telNummer = document.getElementById('newTelNummer').value || '';
    const telefon = telNummer ? normalizePhone(vorwahl, telNummer) : '';
    const frist = document.getElementById('newFrist').value || null;
    const bestelldatum = document.getElementById('newBestelldatum').value;
    const bemerkung = document.getElementById('newBemerkung').value.trim();

    // Maße aufbereiten — wie bei normaler Bestellung
    let totalPrice = 0, totalSqm = 0;
    const measures = valid.map(m => {
        const b = parseFloat(m.breite), h = parseFloat(m.hoehe), s = m.stueck || 1, p = m.preis || sqmPrice;
        const sqm = (b/100) * (h/100) * s;
        const billSqm = Math.max(sqm, 1*s);
        totalSqm += sqm;
        totalPrice += billSqm * p;
        const measureObj = {
            breite: b, hoehe: h, stueck: s, farbe: m.farbe || 'Antrazit',
            sqmPrice: p, doppeltuer: !!m.doppeltuer
        };
        if (m.modelId) {
            measureObj.modelId = m.modelId;
            const variants = Object.assign({}, m.variants || {});
            variants.tuerart = m.doppeltuer ? 'doppel' : 'einzel';
            measureObj.variants = variants;
            measureObj.bemerkung = '';
            measureObj.materialColors = {};
        }
        return measureObj;
    });

    // Filiale: aktuelle des Mitarbeiters
    const filialeId = currentUserFilialeId || '';
    const filialeName = filialeId ? ((filialen.find(f => f.id === filialeId) || {}).name || '') : '';

    try {
        if (editingDraftId) {
            // Update existing draft
            await db.collection('orders').doc(editingDraftId).update({
                vorname, nachname, telefon,
                farbe: measures[0].farbe,
                measures,
                totalSqm: parseFloat(totalSqm.toFixed(4)),
                totalPrice: parseFloat(totalPrice.toFixed(2)),
                bestelldatum: bestelldatum || new Date().toISOString().split('T')[0],
                frist,
                bemerkung: bemerkung || null,
                filialeId, filialeName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: currentUser ? currentUser.email : 'unknown'
            });
            showToast('Entwurf aktualisiert.', 'success');
        } else {
            // Create new draft
            const draftNumber = generateDraftNumber();
            await db.collection('orders').add({
                isDraft: true,
                draftNumber,
                vorname, nachname, telefon,
                farbe: measures[0].farbe,
                measures,
                totalSqm: parseFloat(totalSqm.toFixed(4)),
                totalPrice: parseFloat(totalPrice.toFixed(2)),
                anzahlung: 0,
                payments: [],
                paid: false,
                bestelldatum: bestelldatum || new Date().toISOString().split('T')[0],
                frist,
                bemerkung: bemerkung || null,
                column: '', // nicht im Board
                filialeId, filialeName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser ? currentUser.email : 'unknown',
                log: [{ time: firebase.firestore.Timestamp.now(), text: getUserName() + ' hat Entwurf ' + draftNumber + ' erstellt' }]
            });
            showToast('Entwurf gespeichert: ' + draftNumber, 'success', 3500);
        }

        // Nach Speichern: zurück zur Entwürfe-Liste
        exitDraftEdit();
        switchTab('drafts');
    } catch(e) {
        showToast('Fehler: ' + e.message, 'error');
    }
}

// Entwurf in echte Bestellung umwandeln
async function convertDraftToOrder() {
    if (!editingDraftId) { showToast('Kein Entwurf geladen.', 'warning'); return; }
    if (!hasPerm('orders_create')) { showToast('Keine Berechtigung.', 'warning'); return; }

    const draftId = editingDraftId;
    const d = drafts.find(x => x.id === draftId);
    if (!d) { showToast('Entwurf nicht gefunden.', 'error'); return; }

    // Pflichtfelder echte Bestellung: Name + Telefon + mind. 1 Maß
    const vorname = document.getElementById('newVorname').value.trim();
    const nachname = document.getElementById('newNachname').value.trim();
    if (!vorname && !nachname) { showToast('Bitte Name eingeben.', 'warning'); return; }
    const vorwahl = document.getElementById('newVorwahl').value;
    const telNummer = document.getElementById('newTelNummer').value || '';
    if (!telNummer) { showToast('Telefon ist bei einer Bestellung Pflicht. Bitte eintragen.', 'warning'); return; }

    // Bestätigung
    showConfirm(
        'Entwurf bestellen?',
        `Aus Entwurf ${d.draftNumber || ''} wird eine echte Bestellung. Eine neue Bestellnummer wird vergeben. Der Entwurf wird gelöscht.\n\nFortfahren?`,
        'Ja, bestellen',
        async () => {
            // Wir entfernen den Entwurf-Marker und nutzen saveNewOrder()
            // Aber: saveNewOrder erstellt einen neuen Datensatz. Also: erst neuen erstellen, dann den Entwurf löschen.
            const tempEditingDraftId = editingDraftId;
            editingDraftId = null;  // damit saveNewOrder nicht denkt es sei ein Entwurf
            try {
                // saveNewOrder hat seine eigene Logik — wir rufen sie auf
                await saveNewOrder();
                // Nach erfolgreichem Speichern: Entwurf löschen
                await db.collection('orders').doc(tempEditingDraftId).delete();
            } catch(e) {
                editingDraftId = tempEditingDraftId; // restore on error
                showToast('Fehler bei Umwandlung: ' + e.message, 'error');
            }
        }
    );
}

// Aktuell geöffneten Entwurf löschen (mit Bestätigung)
function deleteCurrentDraft() {
    if (!editingDraftId) { showToast('Kein Entwurf geladen.', 'warning'); return; }
    confirmDeleteDraft(editingDraftId);
}

// Entwurf löschen mit Bestätigung
function confirmDeleteDraft(draftId) {
    const d = drafts.find(x => x.id === draftId);
    if (!d) return;
    const name = ((d.vorname || '') + ' ' + (d.nachname || '')).trim() || '(ohne Name)';
    const wasEditing = editingDraftId === draftId;
    showConfirm(
        'Entwurf löschen?',
        `Entwurf ${d.draftNumber || ''} (${name}) wirklich löschen?`,
        'Löschen',
        async () => {
            try {
                await db.collection('orders').doc(draftId).delete();
                showToast('Entwurf gelöscht.', 'success');
                if (wasEditing) {
                    exitDraftEdit();
                    switchTab('drafts');
                }
            } catch(e) {
                showToast('Fehler: ' + e.message, 'error');
            }
        }
    );
}

// ═══ REPARATUR-FEATURE (v1.13.1) ═══

// Öffnet Reparatur-Erfassungs-Dialog für eine bestehende (abgeholte) Bestellung
function openReparaturForm(originalId) {
    if (!hasPerm('reparatur_handle')) { showToast('Keine Berechtigung.', 'warning'); return; }
    const orig = orders.find(x => x.id === originalId);
    if (!orig) { showToast('Bestellung nicht gefunden.', 'error'); return; }

    // Maße der Original-Bestellung als Vorlage übernehmen
    window._reparaturMeasures = (orig.measures || []).map(m => ({
        breite: m.breite, hoehe: m.hoehe, stueck: m.stueck || 1,
        farbe: m.farbe || orig.farbe || 'Antrazit',
        doppeltuer: !!m.doppeltuer,
        sqmPrice: 0  // Reparatur hat eigenen Preis, sqmPrice nicht relevant
    }));

    // Filiale-Optionen (für Auswahl bei Reparatur)
    const filialeOpts = [
        '<option value="">— keine Filiale —</option>',
        ...filialen.map(f => `<option value="${f.id}" ${f.id === (currentUserFilialeId || orig.filialeId || '') ? 'selected' : ''}>${escHtml(f.name)}</option>`)
    ].join('');

    // Heutiges Datum als Default für Bestelldatum der Reparatur
    const today = new Date().toISOString().split('T')[0];
    const fullName = ((orig.vorname || '') + ' ' + (orig.nachname || '')).trim();

    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal" style="max-width:560px">
            <div class="edit-header">
                <span>🔧 Reparatur erfassen</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body">
                <div style="margin-bottom:14px;padding:10px 12px;background:var(--bg-light);border-radius:8px;font-size:13px;line-height:1.5">
                    <div><strong>Original-Bestellung:</strong></div>
                    <div style="color:var(--text-muted);margin-top:2px">${escHtml(orig.orderNumber || '—')} · ${escHtml(fullName)} · ${orig.bestelldatum ? orig.bestelldatum.split('-').reverse().join('.') : ''}</div>
                </div>

                <div class="edit-field"><label>Bemerkung zur Reparatur</label>
                    <textarea class="em-input" id="repBemerkung" rows="2" placeholder="z.B. Kunde hatte falsch gemessen, kürzen auf 95×195"></textarea>
                </div>

                <div class="edit-field"><label>Neue Maße</label>
                    <div id="repMeasuresList"></div>
                    <button type="button" onclick="addReparaturMeasure()" style="margin-top:6px;padding:8px 12px;font-size:12px;background:var(--primary-bg);color:var(--primary);border:1px solid var(--primary);border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit">+ Maß hinzufügen</button>
                </div>

                <div class="edit-field"><label>Reparatur-Preis (€)</label>
                    <input type="number" class="em-input" id="repPrice" inputmode="decimal" step="0.01" min="0" value="0" placeholder="z.B. 30">
                </div>

                <div class="edit-field"><label>Anzahlung (€) — optional</label>
                    <input type="number" class="em-input" id="repAnzahlung" inputmode="decimal" step="0.01" min="0" value="0" placeholder="0 = Bezahlung erst bei Abholung">
                </div>

                <div class="edit-field"><label>Filiale</label>
                    <select class="em-input" id="repFiliale">${filialeOpts}</select>
                </div>

                <div class="edit-field"><label>Bestelldatum Reparatur</label>
                    <input type="date" class="em-input" id="repDatum" value="${today}">
                </div>

                <div class="edit-field"><label>Frist (optional)</label>
                    <input type="date" class="em-input" id="repFrist" value="">
                </div>

                <div style="margin-top:12px;padding:10px;background:#fef3c7;border-left:3px solid #d97706;border-radius:8px;font-size:12px;color:#78350f;line-height:1.5">
                    <strong>Hinweis:</strong> Nach dem Speichern wird die Reparatur in der Spalte <strong>"Reparatur"</strong> erscheinen. Eine Unterschrift kann anschließend dort erfasst werden.
                </div>
            </div>
            <div class="edit-footer">
                <button class="action-btn primary" onclick="saveReparatur('${originalId}')">Reparatur erstellen</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    renderReparaturMeasuresList();
}

function renderReparaturMeasuresList() {
    const el = document.getElementById('repMeasuresList');
    if (!el) return;
    const colors = (cachedColors || []).filter(c => c.active !== false).map(c => c.name);
    const colorList = colors.length ? colors : ['Antrazit', 'Weiß', 'Braun'];
    el.innerHTML = window._reparaturMeasures.map((m, i) => {
        const colorOpts = colorList.map(c => `<option value="${c}" ${m.farbe === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
        return `
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;padding:8px;border:1px solid var(--border-light);border-radius:8px;background:var(--card)">
                <input type="number" inputmode="decimal" placeholder="Breite" value="${m.breite || ''}"
                    oninput="window._reparaturMeasures[${i}].breite=parseFloat(this.value)||0"
                    style="width:75px;padding:8px 6px;font-size:13px;text-align:center;border:2px solid var(--border);border-radius:6px;font-family:inherit;background:var(--card);box-sizing:border-box">
                <span style="color:var(--text-muted);font-size:13px">×</span>
                <input type="number" inputmode="decimal" placeholder="Höhe" value="${m.hoehe || ''}"
                    oninput="window._reparaturMeasures[${i}].hoehe=parseFloat(this.value)||0"
                    style="width:75px;padding:8px 6px;font-size:13px;text-align:center;border:2px solid var(--border);border-radius:6px;font-family:inherit;background:var(--card);box-sizing:border-box">
                <input type="number" inputmode="numeric" placeholder="Stk" value="${m.stueck || 1}" min="1"
                    oninput="window._reparaturMeasures[${i}].stueck=parseInt(this.value)||1"
                    style="width:50px;padding:8px 6px;font-size:13px;text-align:center;border:2px solid var(--border);border-radius:6px;font-family:inherit;background:var(--card);box-sizing:border-box" title="Stück">
                <select onchange="window._reparaturMeasures[${i}].farbe=this.value" style="flex:1 1 auto;min-width:0;padding:8px 6px;font-size:13px;border:2px solid var(--border);border-radius:6px;font-family:inherit;background:var(--card);box-sizing:border-box">${colorOpts}</select>
                <label style="display:flex;align-items:center;gap:3px;font-size:11px;flex-shrink:0;cursor:pointer" title="Doppeltür">
                    <input type="checkbox" ${m.doppeltuer ? 'checked' : ''} onchange="window._reparaturMeasures[${i}].doppeltuer=this.checked" style="width:16px;height:16px"> DT
                </label>
                <button onclick="window._reparaturMeasures.splice(${i},1);renderReparaturMeasuresList()" style="flex-shrink:0;padding:6px 10px;background:var(--red);color:white;border:none;border-radius:6px;cursor:pointer;font-family:inherit">×</button>
            </div>`;
    }).join('');
}

function addReparaturMeasure() {
    window._reparaturMeasures.push({ breite: 0, hoehe: 0, stueck: 1, farbe: 'Antrazit', doppeltuer: false, sqmPrice: 0 });
    renderReparaturMeasuresList();
}

async function saveReparatur(originalId) {
    if (!hasPerm('reparatur_handle')) { showToast('Keine Berechtigung.', 'warning'); return; }
    const orig = orders.find(x => x.id === originalId);
    if (!orig) { showToast('Original-Bestellung nicht gefunden.', 'error'); return; }

    const measures = (window._reparaturMeasures || []).filter(m => m.breite > 0 && m.hoehe > 0);
    if (!measures.length) { showToast('Mindestens ein gültiges Maß nötig.', 'warning'); return; }

    const repPrice = parseFloat(document.getElementById('repPrice').value) || 0;
    const repAnzahlung = parseFloat(document.getElementById('repAnzahlung').value) || 0;
    const bemerkung = document.getElementById('repBemerkung').value.trim();
    const filialeId = document.getElementById('repFiliale').value;
    const filialeName = filialeId ? ((filialen.find(f => f.id === filialeId) || {}).name || '') : '';
    const bestelldatum = document.getElementById('repDatum').value;
    const frist = document.getElementById('repFrist').value || null;

    if (repAnzahlung > repPrice) {
        showToast('Anzahlung darf nicht höher sein als Reparatur-Preis.', 'warning');
        return;
    }

    // Reparatur-Nummer generieren: Original-Nr + "-R1", "-R2", ...
    const baseNum = orig.orderNumber || '#R';
    const existingReparaturen = orders.filter(o => o.originalOrderId === originalId);
    const repIndex = existingReparaturen.length + 1;
    const reparaturNumber = baseNum + '-R' + repIndex;

    // measures aufbereiten — Modell-Info aus Original übernehmen wenn vorhanden
    const newMeasures = measures.map(m => {
        const orig0 = (orig.measures || [])[0] || {};
        const measureObj = {
            breite: m.breite, hoehe: m.hoehe, stueck: m.stueck || 1,
            farbe: m.farbe || 'Antrazit',
            sqmPrice: 0,  // Reparatur-Preis ist pauschal, nicht m²-basiert
            doppeltuer: !!m.doppeltuer
        };
        // Modell-Felder aus Original übernehmen falls vorhanden (R1-Migration, R2 erweitert)
        if (orig0.modelId) {
            measureObj.modelId = orig0.modelId;
            // Varianten vom Original übernehmen (Reparatur = hart vom Original gem. v1.13.1)
            const variants = Object.assign({}, orig0.variants || {});
            variants.tuerart = m.doppeltuer ? 'doppel' : 'einzel';
            measureObj.variants = variants;
            measureObj.bemerkung = '';
            measureObj.materialColors = orig0.materialColors || {};
        }
        return measureObj;
    });

    // Total m² (für Statistik)
    const totalSqm = newMeasures.reduce((s, m) => s + (m.breite / 100) * (m.hoehe / 100) * (m.stueck || 1), 0);

    try {
        const newDocRef = await db.collection('orders').add({
            // Identifikation
            isReparatur: true,
            originalOrderId: originalId,
            originalOrderNumber: orig.orderNumber || '',
            orderNumber: reparaturNumber,
            // Kundendaten von Original
            vorname: orig.vorname || '',
            nachname: orig.nachname || '',
            telefon: orig.telefon || '',
            farbe: measures[0].farbe || 'Antrazit',
            // Reparatur-spezifisch
            measures: newMeasures,
            totalSqm: parseFloat(totalSqm.toFixed(4)),
            totalPrice: repPrice,
            anzahlung: repAnzahlung,
            payments: repAnzahlung > 0 ? [{ amount: repAnzahlung, date: firebase.firestore.Timestamp.now(), label: 'Anzahlung Reparatur' }] : [],
            paid: repAnzahlung >= repPrice && repPrice > 0,
            bestelldatum: bestelldatum || new Date().toISOString().split('T')[0],
            frist: frist || null,
            bemerkung: bemerkung || null,
            // Workflow
            column: 'Reparatur',
            // Filiale
            filialeId: filialeId || '',
            filialeName: filialeName || '',
            // Meta
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser ? currentUser.email : 'unknown',
            log: [
                { time: firebase.firestore.Timestamp.now(), text: getUserName() + ' hat Reparatur erfasst (Original: ' + (orig.orderNumber || originalId.slice(0,6)) + ')' }
            ]
        });

        // Original-Bestellung um Verweis ergänzen + Log-Eintrag
        await db.collection('orders').doc(originalId).update({
            log: firebase.firestore.FieldValue.arrayUnion({
                time: firebase.firestore.Timestamp.now(),
                text: getUserName() + ' hat Reparatur ' + reparaturNumber + ' erfasst'
            })
        });

        // Modal schließen
        document.querySelector('.edit-overlay')?.remove();
        closeModal();
        showToast('Reparatur ' + reparaturNumber + ' erfasst.', 'success');

        // Zur Reparatur-Spalte wechseln und neue Reparatur öffnen
        setTimeout(() => {
            activeColumn = 'Reparatur';
            renderBoardColumns();
            renderBoardCards();
            setTimeout(() => openOrderDetail(newDocRef.id), 200);
        }, 300);
    } catch(e) {
        console.error('Reparatur speichern Fehler:', e);
        showToast('Fehler: ' + e.message, 'error');
    }
}


function useOrderInRechner(id) {
    if (!hasPerm('orders_rechner')) { showToast('Keine Berechtigung.','warning'); return; }
    const o=orders.find(x=>x.id===id); if(!o) return; closeModal();
    const m=o.measures&&o.measures[0];
    // kunde/telefon Inputs gibt's seit v1.15.0-p7 nicht mehr — nur setzen falls vorhanden
    const kEl = document.getElementById('kunde');
    if (kEl) kEl.value = (o.vorname||'')+' '+(o.nachname||'');
    const tEl = document.getElementById('telefon');
    if (tEl) tEl.value = o.telefon || '';
    if(m){ document.getElementById('breite').value=m.breite||100; document.getElementById('hoehe').value=m.hoehe||200; document.getElementById('stueckzahl').value=m.stueck||1; }
    // Sync Doppeltür checkbox from first measure
    const dtCb = document.getElementById('rechnerDoppeltuer');
    if (dtCb) dtCb.checked = !!(m && m.doppeltuer);
    const farbeName = m ? (m.farbe || o.farbe) : o.farbe;
    const idx={Antrazit:0,'Weiß':1,Braun:2}[farbeName];
    if(idx!==undefined){ document.querySelectorAll('#tab-rechner .color-btn').forEach((b,i)=>b.classList.toggle('active',i===idx)); const bg=['#4a4a4a','#e0e0e0','#8B4513'],cl=['#ccc','#444','#fac775']; farbe={name:farbeName,bg:bg[idx],color:cl[idx]}; selectedColor=farbeName; }
    // Show bemerkung in rechner
    const bemerkEl = document.getElementById('rechnerBemerkung');
    const bemerkText = document.getElementById('rechnerBemerkungText');
    if (bemerkEl && bemerkText) {
        if (o.bemerkung) {
            bemerkText.textContent = o.bemerkung;
            bemerkEl.style.display = 'block';
        } else {
            bemerkEl.style.display = 'none';
        }
    }
    // Set filiale and orderId from order BEFORE renderAll
    rechnerFiliale = o.filialeName || currentUserFiliale || '';
    rechnerOrderId = id;
    switchTab('rechner'); renderAll();
    // Show all measures as slides
    renderSummaryFromOrder(o);
    generateEtikett();
    updateRechnerAbholbereitBtn();
    // Quick-Input verstecken wenn Bestellung geladen (v1.15.0-p7)
    const quickInput = document.getElementById('rechnerQuickInput');
    if (quickInput) quickInput.style.display = 'none';
}

async function addLog(id,text) { if(!id) return; await db.collection('orders').doc(id).update({log:firebase.firestore.FieldValue.arrayUnion({time:firebase.firestore.Timestamp.now(),text})}).catch(console.error); }

// ═══ NEW ORDER ═══
function renderNewForm() {
    // Modell-Liste der aktiven Modelle
    const activeModels = (cachedModels || []).filter(mm => mm.active !== false);
    const showModelDropdown = activeModels.length > 0; // immer wenn mind. 1 Modell existiert (R2: Frage 1 = A)

    // Default-Modell setzen falls leer
    const defModel = activeModels.find(mm => mm.default) || activeModels[0] || null;
    measureFields.forEach(m => {
        if (showModelDropdown && !m.modelId && defModel) m.modelId = defModel.id;
    });

    document.getElementById('newMeasures').innerHTML = measureFields.map((m,i) => {
        // Aktuelles Modell für dieses Maß
        const currentModel = m.modelId ? activeModels.find(mm => mm.id === m.modelId) : defModel;

        // Farb-Optionen — aus Modell oder global
        let allowedColorNames;
        if (currentModel && currentModel.colors && currentModel.colors.length) {
            allowedColorNames = currentModel.colors.map(cid => {
                const c = getColor(cid);
                return c ? c.name : null;
            }).filter(Boolean);
        } else {
            const activeColors = (cachedColors || []).filter(c => c.active !== false);
            allowedColorNames = activeColors.length ? activeColors.map(c => c.name) : ['Antrazit', 'Weiß', 'Braun'];
        }
        // v1.16.8-p3: Profilfarbe ist Pflichtfeld — keine Vorauswahl mehr
        // Wenn aktuelle Farbe nicht erlaubt → leer setzen
        if (m.farbe && !allowedColorNames.includes(m.farbe)) {
            m.farbe = '';
        }
        const colorOptionsHtml = '<option value="" disabled' + (!m.farbe ? ' selected' : '') + '>— Farbe wählen —</option>' +
            allowedColorNames.map(name =>
                `<option value="${escHtml(name)}"${m.farbe === name ? ' selected' : ''}>${escHtml(name)}</option>`
            ).join('');

        // Maß-Grenzen aus Modell oder Defaults
        const limits = (currentModel && currentModel.measureLimits) || { minBreite: 1, maxBreite: MAX_MASS_CM, minHoehe: 1, maxHoehe: MAX_MASS_CM };
        // Warnung wenn aktuelle Werte außerhalb
        const breiteVal = parseFloat(m.breite) || 0;
        const hoeheVal = parseFloat(m.hoehe) || 0;
        const breiteOob = breiteVal > 0 && (breiteVal < limits.minBreite || breiteVal > limits.maxBreite);
        const hoeheOob = hoeheVal > 0 && (hoeheVal < limits.minHoehe || hoeheVal > limits.maxHoehe);

        // Preis-Vorschlag aus Modell
        let suggestedPrice;
        if (currentModel && currentModel.pricing) {
            suggestedPrice = m.doppeltuer ? (currentModel.pricing.defaultSqmPriceDoppeltuer || doppeltuerPrice) : (currentModel.pricing.defaultSqmPriceEinzeltuer || sqmPrice);
        } else {
            suggestedPrice = m.doppeltuer ? doppeltuerPrice : sqmPrice;
        }
        const minPrice = currentModel && currentModel.pricing ? (m.doppeltuer ? (currentModel.pricing.minSqmPriceDoppeltuer || 0) : (currentModel.pricing.minSqmPriceEinzeltuer || 0)) : 0;
        const currentPrice = m.preis || suggestedPrice;
        const priceTooLow = minPrice > 0 && currentPrice > 0 && currentPrice < minPrice;

        // ═══ Varianten-Auswahl (v1.15.1) ═══
        // Modell hat eine Liste von Varianten zugewiesen, jede mit Optionen.
        // Türart-Variante wird mit m.doppeltuer synchron gehalten für Code-Stabilität.
        if (!m.variants) m.variants = {};
        // Türart-Erzwingung
        const forceDt = currentModel ? currentModel.forcedDoppeltuer : null; // null/true/false
        if (forceDt === true)  { m.doppeltuer = true;  m.variants.tuerart = 'doppel'; }
        if (forceDt === false) { m.doppeltuer = false; m.variants.tuerart = 'einzel'; }

        // Variants-HTML aufbauen
        const modelVariantIds = (currentModel && currentModel.variantIds) || [];
        let variantsHtml = '';
        modelVariantIds.forEach(vid => {
            const variant = getVariant(vid);
            if (!variant || variant.active === false) return;
            // v1.17.1: Optionen mit nurDoppeltuer ausfiltern wenn Einzeltür
            const allOpts = (variant.options || []).filter(o => o);
            const opts = allOpts.filter(o => !(o.nurDoppeltuer && !m.doppeltuer));
            if (!opts.length) return;

            // Aktuell gewählte Option
            let currentOpt = m.variants[vid];
            // v1.18.16: tuerart wird NICHT mehr automatisch gesetzt — Mitarbeiter muss wählen.
            // Vorher: aus m.doppeltuer abgeleitet. Jetzt: leer lassen wenn nicht explizit gewählt.

            // v1.17.1: Wenn aktuelle Option durch Filter weggefallen ist, leeren — User muss neu wählen
            if (currentOpt && !opts.find(o => o.id === currentOpt)) {
                currentOpt = '';
                m.variants[vid] = '';
            }
            // v1.18.16: KEIN automatischer Default mehr! Wenn nicht gesetzt → leer lassen.
            // Mitarbeiter MUSS aktiv auswählen (Pflichtfeld wie Farbe).

            // Bei Türart-forcedDoppeltuer: locked, nicht änderbar
            const isTuerartLocked = vid === 'tuerart' && forceDt !== null;

            // v1.18.16: ALLES als Dropdown mit "— bitte wählen —" Default.
            // Vorher: Toggle-Buttons bei ≤3 Optionen, aber das war zu schnell-klick-anfällig.
            // Jetzt: Mitarbeiter MUSS aktiv aus Dropdown wählen.
            const placeholderOpt = `<option value=""${!currentOpt?' selected':''} disabled>— bitte wählen —</option>`;
            const dropdownOpts = placeholderOpt + opts.map(o =>
                `<option value="${esc(o.id)}"${currentOpt===o.id?' selected':''}>${escHtml(o.label)}</option>`
            ).join('');
            const borderStyle = !currentOpt
                ? 'border:2px solid var(--amber);background:#fffbeb'  // Warn-Style wenn leer
                : 'border:1px solid var(--border);background:var(--card)';
            variantsHtml += `<div class="field" style="margin-top:8px"><label style="display:flex;align-items:center;gap:6px"><span>${escHtml(variant.name)}</span>${isTuerartLocked ? '<span style="font-size:10px;color:var(--text-muted);text-transform:none;letter-spacing:normal;font-weight:400">(durch Modell vorgegeben)</span>' : ''}</label>
                <select onchange="updateMeasureVariant(${i},'${esc(vid)}',this.value)" ${isTuerartLocked?'disabled':''} style="font-size:13px;padding:9px 8px;width:100%;${borderStyle};border-radius:8px;font-family:inherit;${isTuerartLocked?'opacity:0.6':''}">${dropdownOpts}</select></div>`;

            // Plissee-Folgeauswahl (v1.16.6): wenn aktuelle Option plisseeFollowup hat
            const currentOptObj = opts.find(o => o.id === currentOpt);
            if (currentOptObj && currentOptObj.plisseeFollowup) {
                const activePlisseeColors = (cachedPlisseeColors || []).filter(c => c.active !== false);
                if (!activePlisseeColors.length) {
                    variantsHtml += `<div class="field" style="margin-top:6px;padding:8px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:11px;color:#78350f">
                        ⚠ Plissee-Farben sind noch nicht angelegt. Settings → Plissee-Farben → "+ Neue Plissee-Farbe".
                    </div>`;
                } else {
                    // v1.18.16: KEIN Default mehr — User muss aktiv wählen
                    let currentPlisseeColor = m.variants.plisseeFarbe || '';
                    if (currentPlisseeColor && !activePlisseeColors.find(c => c.id === currentPlisseeColor)) {
                        currentPlisseeColor = '';
                        m.variants.plisseeFarbe = '';
                    }
                    const plisseePlaceholder = `<option value=""${!currentPlisseeColor?' selected':''} disabled>— bitte wählen —</option>`;
                    const plisseeOpts = plisseePlaceholder + activePlisseeColors.map(c =>
                        `<option value="${esc(c.id)}"${currentPlisseeColor===c.id?' selected':''}>${escHtml(c.name)}</option>`
                    ).join('');
                    const plisseeBorderStyle = !currentPlisseeColor
                        ? 'border:2px solid var(--amber);background:#fffbeb'
                        : 'border:1px solid var(--border);background:var(--card)';
                    variantsHtml += `<div class="field" style="margin-top:6px"><label style="display:flex;align-items:center;gap:6px"><span>Plissee-Farbe</span></label>
                        <select onchange="updateMeasureVariant(${i},'plisseeFarbe',this.value)" style="font-size:13px;padding:9px 8px;width:100%;${plisseeBorderStyle};border-radius:8px;font-family:inherit">${plisseeOpts}</select></div>`;
                }
            }
        });

        // Falls Modell KEINE Türart-Variante hat (Spezialfall), aber Doppeltür-Auswahl trotzdem nötig (Legacy-Modelle)
        // → fallback Doppeltür-Checkbox unten
        const hasTuerartVariant = modelVariantIds.includes('tuerart');
        const fallbackDtCheckbox = (!hasTuerartVariant && forceDt === null)
            ? `<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;font-weight:600;cursor:pointer;color:var(--text-secondary)">
                  <input type="checkbox" ${m.doppeltuer?'checked':''} onchange="updateMeasure(${i},'doppeltuer',this.checked);updateMassePreview(${i})" style="width:18px;height:18px;accent-color:var(--primary)"> Doppeltür (${suggestedPrice} €/m²)
               </label>`
            : '';

        // Modell-Dropdown
        const modelDropdown = showModelDropdown ? `
            <div class="field" style="margin-bottom:8px"><label>Modell</label>
                <select onchange="updateMeasure(${i},'modelId',this.value)" style="font-size:13px;padding:9px 8px;width:100%">
                    ${activeModels.map(mm => `<option value="${mm.id}"${m.modelId === mm.id ? ' selected' : ''}>${escHtml(mm.name)}${mm.default ? ' ★' : ''}</option>`).join('')}
                </select>
            </div>` : '';

        const breiteStyle = breiteOob ? 'border-color:var(--red);background:#fef2f2' : '';
        const hoeheStyle = hoeheOob ? 'border-color:var(--red);background:#fef2f2' : '';
        const oobHint = (breiteOob || hoeheOob) ? `<div style="margin-top:4px;font-size:11px;color:var(--red);font-weight:600">⚠ Außerhalb der Modell-Grenzen (${limits.minBreite}–${limits.maxBreite} × ${limits.minHoehe}–${limits.maxHoehe} cm)</div>` : '';
        const priceHint = priceTooLow ? `<div style="margin-top:4px;font-size:11px;color:var(--amber-border, var(--amber));font-weight:600">⚠ Preis unter Minimum (${minPrice} €/m²)</div>` : '';

        return `
        <div class="measure-entry">
            ${measureFields.length>1?`<button class="remove-measure" onclick="removeMeasureField(${i})">×</button>`:''}

            <!-- v1.18.17 Phase 6: Maße + Skizze responsiv (Handy=untereinander, Desktop=nebeneinander) -->
            <div class="masse-layout">
                <!-- Linke Spalte: Maße + Stk + Farbe + Preis + Modell -->
                <div class="masse-layout-inputs">
                    <!-- Zeile 1: Breite × Höhe + Stk -->
                    <div style="display:flex;gap:8px;align-items:flex-end">
                        <div class="field" style="flex:1"><label>Breite (cm)</label><input type="number" id="breiteInput_${i}" min="1" max="${MAX_MASS_CM}" step="0.1" value="${m.breite}" oninput="updateMeasure(${i},'breite',this.value)" placeholder="${currentModel ? limits.minBreite + ' – ' + limits.maxBreite : '100'}" style="${breiteStyle}"></div>
                        <div class="field" style="flex:1"><label>Höhe (cm)</label><input type="number" id="hoeheInput_${i}" min="1" max="${MAX_MASS_CM}" step="0.1" value="${m.hoehe}" oninput="updateMeasure(${i},'hoehe',this.value)" placeholder="${currentModel ? limits.minHoehe + ' – ' + limits.maxHoehe : '200'}" style="${hoeheStyle}"></div>
                        <div class="field" style="width:55px;flex-shrink:0"><label>Stk</label><input type="number" value="${m.stueck}" min="1" oninput="updateMeasure(${i},'stueck',this.value)"></div>
                    </div>
                    <div id="oobHint_${i}">${oobHint}</div>
                    <!-- Zeile 2: Farbe + €/m² -->
                    <div style="display:flex;gap:8px;align-items:flex-end">
                        <div class="field" style="flex:1"><label>Farbe</label>
                            <select onchange="updateMeasure(${i},'farbe',this.value)" style="font-size:13px;padding:9px 8px;width:100%">${colorOptionsHtml}</select>
                        </div>
                        <div class="field" style="width:75px;flex-shrink:0"><label>€/m²</label><input type="number" value="${currentPrice}" step="0.5" oninput="updateMeasure(${i},'preis',this.value)"></div>
                    </div>
                    ${priceHint}
                    <!-- Zeile 3: Modell-Dropdown -->
                    ${modelDropdown}
                </div>
                <!-- Rechte Spalte: Skizze live -->
                <div id="massePreview${i}" class="masse-layout-preview"></div>
            </div>

            <!-- v1.18.17 Phase 3: Varianten als Grid (Doppeltür + Bodenprofil + Netz/Plissee nebeneinander) -->
            ${variantsHtml ? `<div class="variants-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px;margin-top:8px">${variantsHtml}</div>` : ''}
            ${fallbackDtCheckbox}

            <!-- v1.18.17 Phase 3: Bemerkung pro Maß -->
            <div class="field" style="margin-top:8px"><label>Bemerkung (Maß)</label>
                <input type="text" value="${escHtml(m.bemerkung||'')}" oninput="measureFields[${i}].bemerkung=this.value" placeholder="z.B. links anschlagend" style="font-size:13px;padding:9px 8px;width:100%">
            </div>
        </div>`;
    }).join('');
    // Set Bestelldatum to today if empty
    const bdEl = document.getElementById('newBestelldatum');
    if (bdEl && !bdEl.value) bdEl.value = new Date().toISOString().split('T')[0];
    calcNewPrice();
    // v1.18.12: Frist-Vorschlag aktualisieren
    if (typeof renderFristVorschlag === 'function') renderFristVorschlag();
    // Update SVG previews
    setTimeout(() => { measureFields.forEach((m,i) => updateMassePreview(i)); }, 50);
}
function addMeasureField() {
    const def = (typeof getDefaultModel === 'function') ? getDefaultModel() : null;
    measureFields.push({
        breite: '', hoehe: '', stueck: 1,
        farbe: '', // v1.16.8-p3: Pflichtfeld — keine Vorauswahl
        preis: sqmPrice,
        modelId: def ? def.id : '',
        variants: {}
    });
    renderNewForm();
}
function removeMeasureField(i) { measureFields.splice(i,1); renderNewForm(); }
function updateMeasure(i,k,v) {
    if(k==='stueck') measureFields[i][k]=parseInt(v)||1;
    else if(k==='preis') measureFields[i][k]=parseFloat(v)||0;
    else if(k==='farbe') measureFields[i][k]=v;
    else if(k==='modelId') {
        // Modell-Wechsel: Preis-Vorschlag, Farbe, Varianten ggf. anpassen
        measureFields[i].modelId = v;
        const mdl = (cachedModels || []).find(mm => mm.id === v);
        if (mdl) {
            // Türart-Erzwingung
            if (mdl.forcedDoppeltuer === true) measureFields[i].doppeltuer = true;
            else if (mdl.forcedDoppeltuer === false) measureFields[i].doppeltuer = false;
            // Preis-Vorschlag aus Modell setzen (überschreibt manuell gesetzten — Frage 5: A+B+C, Vorschlag setzen, Mitarbeiter kann ändern)
            const isDT = !!measureFields[i].doppeltuer;
            const newPrice = mdl.pricing ? (isDT ? mdl.pricing.defaultSqmPriceDoppeltuer : mdl.pricing.defaultSqmPriceEinzeltuer) : (isDT ? doppeltuerPrice : sqmPrice);
            if (newPrice) measureFields[i].preis = newPrice;
            // Farbe prüfen — v1.16.8-p3: Pflichtfeld, kein Default mehr
            if (mdl.colors && mdl.colors.length) {
                const allowedNames = mdl.colors.map(cid => getColor(cid)?.name).filter(Boolean);
                if (!allowedNames.includes(measureFields[i].farbe)) {
                    measureFields[i].farbe = ''; // Mitarbeiter muss neu wählen
                }
            }
            // v1.18.16: Varianten beim Modell-Wechsel NICHT mehr mit Defaults füllen.
            // Mitarbeiter MUSS aktiv auswählen (verhindert versehentliches Default-Speichern).
            // Ausnahme: tuerart wird automatisch über doppeltuer-Flag gesetzt.
            const newVariantIds = mdl.variantIds || [];
            const oldVariants = measureFields[i].variants || {};
            const newVariants = {};
            newVariantIds.forEach(vid => {
                const variant = getVariant(vid);
                if (!variant) return;
                if (vid === 'tuerart') return; // wird unten aus doppeltuer abgeleitet
                if (oldVariants[vid] && (variant.options || []).some(o => o.id === oldVariants[vid])) {
                    // Alte Auswahl ist im neuen Modell auch gültig → übernehmen
                    newVariants[vid] = oldVariants[vid];
                }
                // Sonst: leer lassen, Mitarbeiter muss wählen
            });
            // Türart synchron mit doppeltuer (Code-Stabilität)
            newVariants.tuerart = measureFields[i].doppeltuer ? 'doppel' : 'einzel';
            measureFields[i].variants = newVariants;
        }
        renderNewForm();
        setTimeout(()=>updateMassePreview(i),50);
        return;
    }
    else if(k==='doppeltuer') {
        measureFields[i].doppeltuer = v;
        // Preis-Vorschlag aus Modell oder Settings
        const mdl = (cachedModels || []).find(mm => mm.id === measureFields[i].modelId);
        const newPrice = mdl && mdl.pricing
            ? (v ? mdl.pricing.defaultSqmPriceDoppeltuer : mdl.pricing.defaultSqmPriceEinzeltuer)
            : (v ? doppeltuerPrice : sqmPrice);
        if (newPrice) measureFields[i].preis = newPrice;
        renderNewForm();
        setTimeout(()=>updateMassePreview(i),50);
        return;
    }
    else measureFields[i][k]=v;
    calcNewPrice();
    updateMassePreview(i);
    // v1.18.12: Frist-Vorschlag aktualisieren wenn Stk geändert
    if (k === 'stueck' && typeof renderFristVorschlag === 'function') renderFristVorschlag();
    // v1.18.18: Bei Maß-Änderung Out-of-Bounds Hinweis live aktualisieren (ohne Re-Render)
    if (k === 'breite' || k === 'hoehe') updateMeasureBoundsHint(i);
}

// v1.18.18: Maß-Grenzen-Warnung gezielt aktualisieren ohne kompletten Re-Render.
// (renderNewForm würde den Cursor im Input-Feld verlieren — daher nur die Hint-Box updaten.)
function updateMeasureBoundsHint(i) {
    const m = measureFields[i];
    if (!m) return;
    const hintEl = document.getElementById('oobHint_' + i);
    const breiteEl = document.getElementById('breiteInput_' + i);
    const hoeheEl = document.getElementById('hoeheInput_' + i);
    if (!hintEl) return;

    // Modell-Grenzen ermitteln
    const currentModel = m.modelId && typeof getModel === 'function' ? getModel(m.modelId) : null;
    const limits = (currentModel && currentModel.measureLimits)
        || { minBreite: 1, maxBreite: MAX_MASS_CM, minHoehe: 1, maxHoehe: MAX_MASS_CM };

    const breiteVal = parseFloat(m.breite) || 0;
    const hoeheVal = parseFloat(m.hoehe) || 0;
    const breiteOob = breiteVal > 0 && (breiteVal < limits.minBreite || breiteVal > limits.maxBreite);
    const hoeheOob = hoeheVal > 0 && (hoeheVal < limits.minHoehe || hoeheVal > limits.maxHoehe);

    // Border-Style live setzen
    if (breiteEl) {
        breiteEl.style.borderColor = breiteOob ? 'var(--red)' : '';
        breiteEl.style.background = breiteOob ? '#fef2f2' : '';
    }
    if (hoeheEl) {
        hoeheEl.style.borderColor = hoeheOob ? 'var(--red)' : '';
        hoeheEl.style.background = hoeheOob ? '#fef2f2' : '';
    }

    // Hint-Box-Text aktualisieren
    if (breiteOob || hoeheOob) {
        hintEl.innerHTML = `<div style="margin-top:4px;font-size:11px;color:var(--red);font-weight:600">⚠ Außerhalb der Modell-Grenzen (${limits.minBreite}–${limits.maxBreite} × ${limits.minHoehe}–${limits.maxHoehe} cm)</div>`;
    } else {
        hintEl.innerHTML = '';
    }
}

// Variant-Wert eines Maßes ändern (v1.15.1)
function updateMeasureVariant(i, variantId, optionId) {
    if (!measureFields[i].variants) measureFields[i].variants = {};
    measureFields[i].variants[variantId] = optionId;
    // Spezialfall: Türart synchronisiert mit m.doppeltuer (Code-Stabilität)
    if (variantId === 'tuerart') {
        const isDt = optionId === 'doppel';
        measureFields[i].doppeltuer = isDt;
        // Preis-Vorschlag entsprechend anpassen
        const mdl = (cachedModels || []).find(mm => mm.id === measureFields[i].modelId);
        const newPrice = mdl && mdl.pricing
            ? (isDt ? mdl.pricing.defaultSqmPriceDoppeltuer : mdl.pricing.defaultSqmPriceEinzeltuer)
            : (isDt ? doppeltuerPrice : sqmPrice);
        if (newPrice) measureFields[i].preis = newPrice;
    }
    renderNewForm();
    setTimeout(()=>updateMassePreview(i),50);
}
function selectNewColor(btn,name) { document.querySelectorAll('#newColorRow .color-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); newOrderColor=name; }

function calcNewPrice() {
    let total=0;
    const linesEl=document.getElementById('newPriceLines');
    const summaryEl=document.getElementById('newPriceSummary');
    if(!linesEl||!summaryEl) return;

    let linesHtml='';
    measureFields.forEach((m,i) => {
        const b=parseFloat(m.breite)||0, h=parseFloat(m.hoehe)||0, s=m.stueck||1;
        const p=m.preis||sqmPrice;
        const rawSqm=(b/100)*(h/100)*s;
        const sqm=rawSqm;
        const billableSqm=Math.max(rawSqm, 1*s);
        const lineTotal=billableSqm*p;
        total+=lineTotal;
        if(b&&h) {
            const minHint = rawSqm < 1*s ? ' <span style="color:var(--amber);font-size:11px;font-weight:600">(Mind. '+s+' m²)</span>' : '';
            linesHtml+=`<div class="price-line">
                <div class="price-line-desc">${b}×${h} cm ${m.farbe||'Antrazit'} ${s} Stück${minHint}</div>
                <div class="price-line-calc">
                    <span class="price-line-sqm">${billableSqm.toFixed(2)} m² × <input class="price-sqm-input" type="number" value="${p}" step="0.5" oninput="updateMeasure(${i},'preis',this.value)"> €/m²</span>
                    <span class="price-line-amount">€ ${lineTotal.toFixed(2)}</span>
                </div>
            </div>`;
        }
    });
    linesEl.innerHTML=linesHtml||'<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Artikel hinzufügen um Preis zu berechnen</div>';

    const anz=parseFloat(document.getElementById('newAnzahlung').value)||0;
    const rest=total-anz;
    document.getElementById('newRestbetrag').value=(rest).toFixed(2);

    summaryEl.innerHTML=`
        <div class="price-summary-row total"><span>Gesamt</span><span>€ ${total.toFixed(2)}</span></div>
        <div class="price-summary-row"><span>Anzahlung</span><span>€ ${anz.toFixed(2)}</span></div>
        <div class="price-summary-row offen${Math.abs(rest)<0.01?' zero':''}"><span>Offen</span><span>€ ${rest.toFixed(2)}</span></div>
    `;
}

function calcNewPriceFromRest() {
    // User typed a custom rest amount — recalculate Anzahlung
    let total=0;
    measureFields.forEach(m=>{
        const b=parseFloat(m.breite)||0, h=parseFloat(m.hoehe)||0, s=m.stueck||1, p=m.preis||sqmPrice;
        const rawSqm2=(b/100)*(h/100)*s; total+=Math.max(rawSqm2, 1*s)*p;
    });
    const rest=parseFloat(document.getElementById('newRestbetrag').value)||0;
    document.getElementById('newAnzahlung').value=(total-rest).toFixed(2);
    calcNewPrice();
}


function updateRechnerMassePreview() {
    const el = document.getElementById('rechnerMassePreview');
    if (!el) return;
    const b = document.getElementById('breite')?.value;
    const h = document.getElementById('hoehe')?.value;
    const dt = document.getElementById('doppeltuer')?.checked;
    if (b && h) {
        el.innerHTML = renderMasseSvg(b, h, !!dt, false);
    } else {
        el.innerHTML = '';
    }
}

function updateMassePreview(idx) {
    const m = measureFields[idx];
    if (!m) return;
    const el = document.getElementById('massePreview' + idx);
    if (!el) return;
    if (m.breite && m.hoehe) {
        // v1.18.17 Phase 4: Bodenprofil-Variante (schwellenlos) → "ja" zeichnet untere Linie dünner
        // v1.18.17 Phase 6: Pills unter der Skizze für Doppeltür/Bodenprofil/etc.
        const bodenprofil = m.variants && (m.variants.schwellenlos === 'ja' || m.variants.bodenprofil === 'ja');
        el.innerHTML = renderMasseSvg(m.breite, m.hoehe, !!m.doppeltuer, true, false, bodenprofil)
            + renderMeasureVariantPills(m, {compact:true});
    } else {
        el.innerHTML = '';
    }
}

// ═══ MASSE-VISUALISIERUNG (SVG) ═══
// v1.16.8-p1: Variant-Pillen unter Skizzen (Bestellungs-Übersicht etc.)
// Zeigt alle Varianten eines Maßes außer "tuerart" (das ist schon im SVG-Titel)
function renderMeasureVariantPills(measure, opts) {
    if (!measure) return '';
    const compact = opts && opts.compact;
    const darkBg = opts && opts.darkBg;
    const pills = [];
    const mv = measure.variants || {};

    // v1.18.17 Phase 6: Doppeltür als Pill (vorher war's im SVG-Titel)
    if (measure.doppeltuer || mv.tuerart === 'doppel') {
        pills.push({
            label: 'Doppeltür',
            bg: darkBg ? 'rgba(220,38,38,0.25)' : '#fee2e2',
            fg: darkBg ? '#fca5a5' : '#dc2626'
        });
    }

    Object.keys(mv).forEach(vid => {
        if (vid === 'tuerart') return; // schon oben als Pill behandelt
        if (vid === 'plisseeFarbe') return;
        const variant = (typeof getVariant === 'function') ? getVariant(vid) : null;
        if (!variant) return;
        const opt = (variant.options || []).find(o => o.id === mv[vid]);
        if (!opt) return;
        if (variant.defaultOption && variant.defaultOption === opt.id) return;
        // v1.17.3: Bei Ja/Yes-Optionen den Variant-Namen statt Option-Label zeigen
        let label = opt.label;
        const isYesLike = /^(ja|yes)$/i.test(opt.label || '');
        if (isYesLike) label = variant.name;
        // Wenn Plissee-Followup: Plissee-Farbe direkt anhängen
        if (opt.plisseeFollowup && mv.plisseeFarbe) {
            const pc = (typeof getPlisseeColor === 'function') ? getPlisseeColor(mv.plisseeFarbe) : null;
            if (pc) label = (isYesLike ? variant.name : opt.label) + ' - ' + pc.name;
        }
        pills.push({
            label: label,
            bg: darkBg ? 'rgba(255,255,255,0.18)' : '#e5e7eb',
            fg: darkBg ? '#fff' : '#374151'
        });
    });
    if (!pills.length) return '';
    const fontSize = compact ? '11' : '12';
    const padding = compact ? '3px 8px' : '4px 10px';
    return '<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:6px">' +
        pills.map(p => `<span style="font-size:${fontSize}px;font-weight:600;padding:${padding};border-radius:8px;background:${p.bg};color:${p.fg};white-space:nowrap">${escHtml(p.label)}</span>`).join('') +
        '</div>';
}

function renderMasseSvg(breite, hoehe, isDoppeltuer, compact, darkBg, hasBodenprofil) {
    const b = parseFloat(breite) || 0;
    const h = parseFloat(hoehe) || 0;
    if (!b || !h) return '';
    
    const w = compact ? 200 : 260;
    const maxH = compact ? 130 : 180;
    const drawW = w - 70;
    const ratio = Math.min(drawW / Math.max(b,1), (maxH-40) / Math.max(h,1));
    const rw = Math.max(b * ratio, 30);
    const rh = Math.max(h * ratio, 30);
    const x = 10;
    // v1.18.17 Phase 6: kein Titel mehr — Pills unter der Skizze sagen alles
    const y = 8;
    // Schriften vergrößert für bessere Lesbarkeit (v1.15.0-p7)
    const fs = compact ? '14' : '15';
    const fsL = compact ? '18' : '22';
    const totalW = rw + 70;
    const labelColor = darkBg ? '#ddd' : '#666';
    const valueColor = darkBg ? '#fff' : '#333';
    
    let svg = `<svg viewBox="0 0 ${totalW} ${rh+58}" width="${totalW}" style="display:block;margin:0 auto">`;
    // v1.18.17 Phase 6: KEIN Titel mehr — Info ergibt sich aus Skizze (Mittelstrich=Doppeltür,
    // dünne Unterlinie=Bodenprofil) und Pills unter der Skizze.

    // v1.18.17 Phase 4: Eckige Ecken (rx=0 statt 3/1), Rahmen oben/links/rechts dick, unten dünn wenn Bodenprofil
    if (hasBodenprofil) {
        // Rahmen oben + links + rechts (3 dicke Linien)
        svg += `<line x1="${x}" y1="${y}" x2="${x+rw}" y2="${y}" stroke="#333" stroke-width="2"/>`;             // oben
        svg += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+rh}" stroke="#333" stroke-width="2"/>`;             // links
        svg += `<line x1="${x+rw}" y1="${y}" x2="${x+rw}" y2="${y+rh}" stroke="#333" stroke-width="2"/>`;       // rechts
        // Unten: nur DÜNNE Linie (= Bodenprofil)
        svg += `<line x1="${x}" y1="${y+rh}" x2="${x+rw}" y2="${y+rh}" stroke="#999" stroke-width="0.8"/>`;
    } else {
        // Standard: kompletter Rahmen
        svg += `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="0" fill="none" stroke="#333" stroke-width="2"/>`;
    }
    
    if (isDoppeltuer) {
        const half = rw / 2 - 4;
        // Left panel
        svg += `<rect x="${x+3}" y="${y+3}" width="${half}" height="${rh-6}" rx="0" fill="#d4d4d4" stroke="#999" stroke-width="1"/>`;
        // Right panel
        svg += `<rect x="${x+rw/2+1}" y="${y+3}" width="${half}" height="${rh-6}" rx="0" fill="#d4d4d4" stroke="#999" stroke-width="1"/>`;
        // Middle bar
        svg += `<rect x="${x+rw/2-3}" y="${y+2}" width="6" height="${rh-4}" fill="#fff" stroke="#999" stroke-width="1"/>`;
    } else {
        // Single panel
        svg += `<rect x="${x+3}" y="${y+3}" width="${rw-6}" height="${rh-6}" rx="0" fill="#d4d4d4" stroke="#999" stroke-width="1"/>`;
    }
    
    // Höhe label (right)
    svg += `<text x="${x+rw+12}" y="${y+rh/2-10}" font-size="${fs}" fill="${labelColor}" font-weight="600">Höhe</text>`;
    svg += `<text x="${x+rw+12}" y="${y+rh/2+12}" font-size="${fsL}" fill="${valueColor}" font-weight="800">${h}</text>`;
    // Arrow right
    svg += `<line x1="${x+rw+6}" y1="${y+4}" x2="${x+rw+6}" y2="${y+rh-4}" stroke="${labelColor}" stroke-width="1.5"/>`;
    svg += `<polygon points="${x+rw+6},${y+4} ${x+rw+4},${y+12} ${x+rw+8},${y+12}" fill="${labelColor}"/>`;
    svg += `<polygon points="${x+rw+6},${y+rh-4} ${x+rw+4},${y+rh-12} ${x+rw+8},${y+rh-12}" fill="${labelColor}"/>`;
    
    // Breite label (bottom)
    svg += `<text x="${x+rw/2}" y="${y+rh+22}" text-anchor="middle" font-size="${fs}" fill="${labelColor}" font-weight="600">Breite</text>`;
    svg += `<text x="${x+rw/2}" y="${y+rh+42}" text-anchor="middle" font-size="${fsL}" fill="${valueColor}" font-weight="800">${b}</text>`;
    
    svg += '</svg>';
    return svg;
}

// ═══ DIGITALE UNTERSCHRIFT ═══
let sigCanvas = null, sigCtx = null, sigDrawing = false, sigHasDrawn = false;

function openSignatureModal(orderId, orderData) {
    const o = orderData || orders.find(x => x.id === orderId) || {};
    const name = escHtml((o.vorname||'') + ' ' + (o.nachname||''));
    const nr = escHtml(o.orderNumber || '');
    const measures = o.measures || [];
    const total = o.totalPrice || 0;
    const anz = o.anzahlung || 0;
    const rest = total - anz;
    const fmt = v => v.toFixed(2).replace('.', ',');

    let masseHtml = measures.map(m => {
        const stk = (m.stueck||1) > 1 ? ' (×' + m.stueck + ')' : '';
        const hasBP = m.variants && (m.variants.schwellenlos === 'ja' || m.variants.bodenprofil === 'ja');
        const svg = renderMasseSvg(m.breite, m.hoehe, !!m.doppeltuer, true, false, hasBP);
        const pills = renderMeasureVariantPills(m, {compact:true});
        return '<div style="padding:8px 0;border-bottom:1px solid var(--border-light)">' + svg + pills +
            '<div style="text-align:center;font-size:14px;font-weight:700;margin-top:4px">' + escHtml(m.farbe||'Antrazit') + stk + '</div></div>';
    }).join('');

    const fristStr = o.frist ? '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">Frist: ' + o.frist.split('-').reverse().join('.') + '</div>' : '';
    const bemerkStr = o.bemerkung ? '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;font-style:italic">' + escHtml(o.bemerkung) + '</div>' : '';

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.id = 'signatureOverlay';
    overlay.innerHTML = `<div class="confirm-box" style="max-width:440px;max-height:90vh;overflow-y:auto;padding:20px">
        <div style="font-size:19px;font-weight:700;margin-bottom:14px">Bestellung bestätigen</div>
        <div style="background:var(--bg);border-radius:10px;padding:12px;margin-bottom:14px">
            ${nr ? '<div style="font-size:12px;color:var(--primary);font-weight:700;margin-bottom:4px">' + nr + '</div>' : ''}
            <div style="font-size:16px;font-weight:700;margin-bottom:8px">${name}</div>
            ${masseHtml}
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light)">
                <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700"><span>Gesamt:</span><span>€ ${fmt(total)}</span></div>
                ${anz > 0 ? '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary)"><span>Anzahlung:</span><span>€ ' + fmt(anz) + '</span></div>' : ''}
                <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:var(--red)"><span>Rest:</span><span>€ ${fmt(rest)}</span></div>
            </div>
            ${fristStr}${bemerkStr}
        </div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.5;margin-bottom:12px;padding:8px;background:#fef3c7;border-radius:8px;border:1px solid #fde68a">
            Mit Ihrer Unterschrift bestätigen Sie die Richtigkeit der oben angegebenen Maße, Farben und Preise. Änderungswünsche sind nur bis zum Produktionsbeginn möglich. Bei Stornierung nach Produktionsbeginn kann die Anzahlung einbehalten werden.
        </div>
        <div style="font-size:13px;font-weight:700;margin-bottom:6px">Unterschrift:</div>
        <canvas id="sigCanvas" style="width:100%;height:200px;border:2px solid var(--border);border-radius:10px;background:white;touch-action:none;cursor:crosshair"></canvas>
        <div style="display:flex;gap:8px;margin-top:12px">
            <button onclick="clearSignature()" style="padding:10px;background:var(--border-light);color:var(--text-secondary);border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">🗑️ Löschen</button>
            <button onclick="document.getElementById('signatureOverlay').remove()" style="flex:1;padding:12px;background:var(--border-light);color:var(--text);border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Abbrechen</button>
            <button id="sigSaveBtn" onclick="saveSignature('${orderId}')" disabled style="flex:1;padding:12px;background:#16a34a;color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;opacity:0.4">✓ Bestätigen</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    // Init canvas
    sigCanvas = document.getElementById('sigCanvas');
    sigCtx = sigCanvas.getContext('2d');
    sigHasDrawn = false;
    const dpr = window.devicePixelRatio || 1;
    const rect = sigCanvas.getBoundingClientRect();
    sigCanvas.width = rect.width * dpr;
    sigCanvas.height = rect.height * dpr;
    sigCtx.scale(dpr, dpr);
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';
    sigCtx.lineWidth = 2.5;
    sigCtx.strokeStyle = '#000';

    // Hint text
    sigCtx.fillStyle = '#ccc';
    sigCtx.font = '16px sans-serif';
    sigCtx.textAlign = 'center';
    sigCtx.fillText('Hier unterschreiben', rect.width/2, rect.height/2);

    // Touch events
    sigCanvas.addEventListener('touchstart', sigStart, {passive:false});
    sigCanvas.addEventListener('touchmove', sigMove, {passive:false});
    sigCanvas.addEventListener('touchend', sigEnd);
    sigCanvas.addEventListener('mousedown', sigMouseStart);
    sigCanvas.addEventListener('mousemove', sigMouseMove);
    sigCanvas.addEventListener('mouseup', sigEnd);
}

function sigGetPos(e) {
    const r = sigCanvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
}

function sigStart(e) {
    e.preventDefault();
    if (!sigHasDrawn) { sigCtx.clearRect(0,0,sigCanvas.width,sigCanvas.height); sigHasDrawn = true; document.getElementById('sigSaveBtn').disabled=false; document.getElementById('sigSaveBtn').style.opacity='1'; }
    sigDrawing = true;
    const p = sigGetPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
}
function sigMove(e) {
    e.preventDefault();
    if (!sigDrawing) return;
    const p = sigGetPos(e);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
}
function sigEnd() { sigDrawing = false; }
function sigMouseStart(e) { const te = {preventDefault:()=>{}, touches:[e]}; sigStart(te); }
function sigMouseMove(e) { if(!sigDrawing) return; const te = {preventDefault:()=>{}, touches:[e]}; sigMove(te); }

function clearSignature() {
    if (!sigCanvas || !sigCtx) return;
    const r = sigCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    sigCtx.clearRect(0,0,sigCanvas.width,sigCanvas.height);
    sigHasDrawn = false;
    sigCtx.fillStyle = '#ccc';
    sigCtx.font = '16px sans-serif';
    sigCtx.textAlign = 'center';
    sigCtx.fillText('Hier unterschreiben', r.width/2, r.height/2);
    document.getElementById('sigSaveBtn').disabled = true;
    document.getElementById('sigSaveBtn').style.opacity = '0.4';
}

async function saveSignature(orderId) {
    if (!sigCanvas || !sigHasDrawn) return;
    try {
        const dataUrl = sigCanvas.toDataURL('image/png');
        await db.collection('orders').doc(orderId).update({
            signature: dataUrl,
            signedAt: firebase.firestore.Timestamp.now(),
            signedByStaff: currentUser ? currentUser.email : 'unknown',
            log: firebase.firestore.FieldValue.arrayUnion({
                time: firebase.firestore.Timestamp.now(),
                text: getUserName() + ' \u2013 Unterschrift eingeholt'
            })
        });
        showToast('Unterschrift gespeichert!', 'success');
        const overlay = document.getElementById('signatureOverlay');
        if (overlay) overlay.remove();
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

function showSignatureImage(orderId) {
    const o = orders.find(x => x.id === orderId);
    if (!o || !o.signature) { showToast('Keine Unterschrift vorhanden.', 'warning'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = '<div class="confirm-box" style="max-width:420px;text-align:center">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:12px">Unterschrift</div>' +
        '<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">' + escHtml((o.vorname||'') + ' ' + (o.nachname||'')) + (o.signedAt ? ' · ' + formatLogTime(o.signedAt) : '') + '</div>' +
        '<img src="' + o.signature + '" style="max-width:100%;border:1px solid var(--border);border-radius:8px;background:white">' +
        '<button onclick="this.closest(\'.confirm-overlay\').remove()" style="margin-top:14px;padding:12px 24px;background:var(--border-light);color:var(--text);border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Schließen</button>' +
        '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}


async function saveNewOrder() {
    if (!hasPerm('orders_create')) { showToast('Keine Berechtigung.','warning'); return; }
    const vorname=document.getElementById('newVorname').value.trim(), nachname=document.getElementById('newNachname').value.trim();
    const vorwahl=document.getElementById('newVorwahl').value;
    const telNummer=document.getElementById('newTelNummer').value||'';
    const telefon=normalizePhone(vorwahl, telNummer);
    const frist=document.getElementById('newFrist').value;
    const bestelldatum=document.getElementById('newBestelldatum').value;
    const bemerkung=document.getElementById('newBemerkung').value.trim(), anzahlung=parseFloat(document.getElementById('newAnzahlung').value)||0;
    if(!vorname&&!nachname){ showToast('Bitte Name eingeben.','warning'); return; }
    if(!telefon){ showToast('Bitte Telefonnummer eingeben.','warning'); return; }
    const valid=measureFields.filter(m=>m.breite&&m.hoehe);
    if(!valid.length){ showToast('Bitte Maß eingeben.','warning'); return; }

    // v1.16.8-p3: Profilfarbe ist Pflichtfeld
    const ohneFarbe = valid.findIndex(m => !m.farbe || m.farbe.trim() === '');
    if (ohneFarbe >= 0) {
        showToast('Bitte für Maß ' + (ohneFarbe + 1) + ' eine Farbe auswählen.', 'warning');
        return;
    }

    // v1.18.16: Modell-Auswahl ist Pflichtfeld
    const ohneModell = valid.findIndex(m => !m.modelId);
    if (ohneModell >= 0) {
        showToast('Bitte für Maß ' + (ohneModell + 1) + ' ein Modell auswählen.', 'warning');
        return;
    }

    // v1.18.16: Alle Varianten des Modells sind Pflichtfelder
    for (let mi = 0; mi < valid.length; mi++) {
        const m = valid[mi];
        const mdl = getModel(m.modelId);
        if (!mdl) continue;
        const varIds = mdl.variantIds || [];
        for (const vid of varIds) {
            if (vid === 'tuerart') continue; // wird über doppeltuer gesetzt — separate Validation unten
            const variant = getVariant(vid);
            if (!variant || variant.active === false) continue;
            const chosen = m.variants && m.variants[vid];
            if (!chosen) {
                showToast('Bitte für Maß ' + (mi + 1) + ': ' + variant.name + ' auswählen.', 'warning');
                return;
            }
            // Wenn Plissee-Folgeauswahl benötigt
            const optObj = (variant.options || []).find(o => o.id === chosen);
            if (optObj && optObj.plisseeFollowup) {
                if (!m.variants.plisseeFarbe) {
                    showToast('Bitte für Maß ' + (mi + 1) + ': Plissee-Farbe auswählen.', 'warning');
                    return;
                }
            }
        }
        // Türart: muss explizit gewählt sein (außer Modell hat forcedDoppeltuer)
        if (varIds.includes('tuerart') && mdl.forcedDoppeltuer === undefined && (!m.variants || !m.variants.tuerart)) {
            showToast('Bitte für Maß ' + (mi + 1) + ': Türart (Einzeltür/Doppeltür) auswählen.', 'warning');
            return;
        }
    }

    // Maß-Plausibilitätsprüfung (Schutz vor Tippfehlern wie 3775 statt 375)
    const measureError = validateMeasures(valid);
    if (measureError) {
        alert('⚠ Maß ungültig\n\n' + measureError);
        return;
    }    let totalPrice=0, totalSqm=0;
    const measures=valid.map(m=>{
        const b=parseFloat(m.breite),h=parseFloat(m.hoehe),s=m.stueck||1,p=m.preis||sqmPrice;
        const sqm=(b/100)*(h/100)*s;
        const billSqm=Math.max(sqm, 1*s);
        totalSqm+=sqm; totalPrice+=billSqm*p;
        // Modell-Felder mitspeichern (v1.14.1, erweitert v1.15.1)
        const measureObj = {breite:b,hoehe:h,stueck:s,farbe:m.farbe||'Antrazit',sqmPrice:p,doppeltuer:!!m.doppeltuer};
        if (m.modelId) {
            measureObj.modelId = m.modelId;
            // Varianten: alle vom Mitarbeiter gewählten übernehmen, Türart synchron mit doppeltuer halten
            const variants = Object.assign({}, m.variants || {});
            variants.tuerart = m.doppeltuer ? 'doppel' : 'einzel';
            measureObj.variants = variants;
            measureObj.bemerkung = '';
            measureObj.materialColors = {};
        }
        return measureObj;
    });
    try {
        // Generate order number - find highest existing number for this year
        const year = new Date().getFullYear();
        let maxNum = year === 2026 ? 149 : 0;
        orders.forEach(o => {
            if (!o.orderNumber) return;
            const match = o.orderNumber.match(/#(\d{4})-(\d+)/);
            if (match && parseInt(match[1]) === year) {
                maxNum = Math.max(maxNum, parseInt(match[2]));
            }
        });
        const orderNumber = '#' + year + '-' + String(maxNum + 1).padStart(5, '0');

        const newDocRef = await db.collection('orders').add({
            vorname,nachname,telefon,farbe:measures[0].farbe, orderNumber,
            measures, totalSqm:parseFloat(totalSqm.toFixed(4)), totalPrice:parseFloat(totalPrice.toFixed(2)), anzahlung,
            payments: anzahlung > 0 ? [{amount:anzahlung, date:firebase.firestore.Timestamp.now(), label:'Anzahlung'}] : [],
            bestelldatum:bestelldatum||null, frist:frist||null, bemerkung:bemerkung||null, column:'Bestellung', paid:false,
            createdAt:firebase.firestore.FieldValue.serverTimestamp(),
            createdBy:currentUser?currentUser.email:'unknown',
            filialeId: currentUserFilialeId || (document.getElementById('newFilialeSelect')?.value || ''),
            filialeName: currentUserFiliale || ((filialen.find(f => f.id === document.getElementById('newFilialeSelect')?.value) || {}).name || ''),
            log:[{time:firebase.firestore.Timestamp.now(),text:`${getUserName()} hat Bestellung aufgenommen`}]
        });
        document.getElementById('newVorname').value=''; document.getElementById('newNachname').value='';
        document.getElementById('newTelNummer').value=''; document.getElementById('newFrist').value='';
        document.getElementById('newBestelldatum').value='';
        document.getElementById('newBemerkung').value=''; document.getElementById('newAnzahlung').value='0';
        measureFields=[{breite:'',hoehe:'',stueck:1,farbe:'Antrazit',preis:sqmPrice,modelId:'',variants:{}}]; renderNewForm();
        showToast('Bestellung gespeichert!','success', 4000); activeColumn='Bestellung'; switchTab('board'); setTimeout(() => { const cards = document.querySelectorAll('.order-card'); if(cards.length) cards[cards.length-1].scrollIntoView({behavior:'smooth',block:'center'}); cards[cards.length-1].style.animation='cardHighlight 1.5s ease'; }, 500);

        // Signature modal
        openSignatureModal(newDocRef.id, {orderNumber, vorname, nachname, measures, totalPrice:parseFloat(totalPrice.toFixed(2)), anzahlung, frist, bemerkung});

        // Auto-backup nach neuer Bestellung — DEAKTIVIERT seit v1.13.2
        // Firestore-Limit: 1MB pro Dokument; bei 220+ Bestellungen mit Unterschriften überschritten.
        // Manuelles Backup über Settings → Datensicherung weiterhin möglich.
        // autoBackupAfterOrder();
    } catch(e) { showToast('Fehler: '+e.message,'error'); }
}

// v1.18.22: Status-Dropdown-Handler im Bestelldetail-Modal
// Nutzt die bewährte quickMove-Logik (Lock-Checks, Confirm-Dialog, Log-Eintrag).
// Bei Abbruch oder Berechtigungs-Fehler wird der Dropdown auf den ursprünglichen Wert zurückgesetzt.
async function onOrderStatusChange(orderId, selectEl) {
    const newCol = selectEl.value;
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    const oldCol = o.column;
    if (newCol === oldCol) return;

    // Dropdown sofort zurücksetzen — quickMove zeigt eigenes Confirm,
    // und falls Benutzer abbricht, soll der Dropdown nicht den neuen Wert behalten.
    // Bei Erfolg ändert sich orders[].column und der nächste openOrderDetail rendert
    // automatisch den richtigen Wert.
    selectEl.value = oldCol;

    // quickMove zeigt selbst Bestätigung/Toast und macht das DB-Update
    if (typeof quickMove === 'function') {
        await quickMove(orderId, newCol);
        // Bei Erfolg: Modal schließen, damit der User die Karte in der neuen Spalte sieht.
        // Wir prüfen erst nach kurzer Verzögerung ob der Move geklappt hat
        // (quickMove zeigt ggf. einen Confirm-Dialog, der erst später bestätigt wird).
        setTimeout(() => {
            const updated = orders.find(x => x.id === orderId);
            if (updated && updated.column === newCol) {
                if (typeof closeModal === 'function') closeModal();
                activeColumn = newCol;
                if (typeof renderBoardColumns === 'function') renderBoardColumns();
                if (typeof renderBoardCards === 'function') renderBoardCards();
            }
        }, 600);
    }
}

// ═══════════════════════════════════════════════════════════════════
// 04-stock.js — Lager-Modul
//
// Stellt bereit:
//   - WARENEINGANG: initWareneingang, saveWareneingang, loadWareneingaenge,
//                    editWareneingang, saveWareneingangEdit, deleteWareneingang,
//                    onWeMaterialChange
//   - BESTANDSÜBERSICHT: exportBestellliste, loadBestandsuebersicht
//   - INVENTUR: initInventur, saveInventur, loadInventurHistory
//   - B-WARE: checkBWare
//
// Wird wie 03-auth.js NACH dem inline-Script geladen, weil diese Funktionen
// viele Helfer aus dem inline-Script nutzen (showToast, t(), db, hasPerm,
// renderTable, cachedMaterials, ...).
//
// Globale Abhängigkeiten:
//   - db (Firebase)
//   - showToast, showConfirm (01-helpers.js)
//   - t() (02-i18n.js)
//   - hasPerm, currentUserPerms, currentUser (03-auth.js + inline)
//   - cachedMaterials, cachedColors, currentUserFiliale, etc. (inline)
// ═══════════════════════════════════════════════════════════════════

// ═══ WARENEINGANG ═══
let weMaterials = [];

async function initWareneingang() {
    // Load materials for dropdown
    try {
        const snap = await db.collection('materials').orderBy('sortOrder').get();
        weMaterials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { weMaterials = []; }

    const sel = document.getElementById('weMatId');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Material wählen —</option>' +
        weMaterials.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

    // Set today's date
    const datumEl = document.getElementById('weDatum');
    if (datumEl && !datumEl.value) datumEl.value = new Date().toISOString().split('T')[0];

    loadWareneingaenge();
}

function onWeMaterialChange() {
    const matId = document.getElementById('weMatId').value;
    const m = weMaterials.find(x => x.id === matId);

    // Hide all type fields
    ['weFieldsStange','weFieldsNetz','weFieldsRolle','weFieldsFlaeche','weFieldsStueck','weColorField'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (!m) return;

    // Show color field with material-specific colors
    if (m.byColor) {
        document.getElementById('weColorField').style.display = 'block';
        const colorSel = document.getElementById('weColor');
        const matColors = m.colors && m.colors.length ? m.colors : ['Antrazit', 'Weiß', 'Braun'];
        colorSel.innerHTML = matColors.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Show type-specific fields
    if (m.type === 'stange') {
        document.getElementById('weFieldsStange').style.display = 'block';
        document.getElementById('weLaenge').value = m.purchaseLength || 6;
        document.getElementById('weLengthLabel').textContent = 'Stangenlänge (m)';
    } else if (m.type === 'netz') {
        document.getElementById('weFieldsNetz').style.display = 'block';
        const hoehenSel = document.getElementById('weNetzHoehe');
        const hoehen = m.netzHoehen || [225, 250, 300, 325];
        hoehenSel.innerHTML = hoehen.map(h => `<option value="${h}">${h} cm</option>`).join('');
    } else if (m.type === 'rolle') {
        document.getElementById('weFieldsRolle').style.display = 'block';
    } else if (m.type === 'flaeche') {
        document.getElementById('weFieldsFlaeche').style.display = 'block';
        document.getElementById('weFlaecheMeter').value = m.purchaseLength || 500;
    } else if (m.type === 'stueck') {
        document.getElementById('weFieldsStueck').style.display = 'block';
    }
}

async function saveWareneingang() {
    const matId = document.getElementById('weMatId').value;
    if (!matId) { showToast('Bitte Material wählen.', 'warning'); return; }

    const m = weMaterials.find(x => x.id === matId);
    if (!m) return;

    const datum = document.getElementById('weDatum').value || new Date().toISOString().split('T')[0];
    const preis = parseFloat(document.getElementById('wePreis').value) || 0;
    const lieferant = document.getElementById('weLieferant').value.trim();
    const bemerkung = document.getElementById('weBemerkung').value.trim();
    const farbe = m.byColor ? document.getElementById('weColor').value : '';

    let menge = 0, einheit = '', details = {};

    if (m.type === 'stange') {
        const anzahl = parseInt(document.getElementById('weAnzahl').value) || 0;
        const laenge = parseFloat(document.getElementById('weLaenge').value) || 0;
        if (!anzahl || !laenge) { showToast('Bitte Anzahl und Länge eingeben.', 'warning'); return; }
        menge = anzahl;
        einheit = 'Stangen';
        details = { anzahl, laenge, totalMeter: anzahl * laenge };
    } else if (m.type === 'netz') {
        const anzahl = parseInt(document.getElementById('weNetzAnzahl').value) || 0;
        const falten = parseInt(document.getElementById('weNetzFalten').value) || 0;
        const hoehe = parseFloat(document.getElementById('weNetzHoeheCustom').value) || parseFloat(document.getElementById('weNetzHoehe').value) || 0;
        if (!anzahl || !falten) { showToast('Bitte Anzahl und Falten eingeben.', 'warning'); return; }
        menge = anzahl;
        einheit = 'Rollen';
        details = { anzahl, faltenProRolle: falten, totalFalten: anzahl * falten, hoehe };
    } else if (m.type === 'rolle') {
        const anzahl = parseInt(document.getElementById('weRolleAnzahl').value) || 0;
        const meter = parseFloat(document.getElementById('weRolleMeter').value) || 0;
        if (!anzahl || !meter) { showToast('Bitte Anzahl und Meter eingeben.', 'warning'); return; }
        menge = anzahl;
        einheit = 'Rollen';
        details = { anzahl, meterProRolle: meter, totalMeter: anzahl * meter };
    } else if (m.type === 'flaeche') {
        const anzahl = parseInt(document.getElementById('weFlaecheAnzahl').value) || 0;
        const meter = parseFloat(document.getElementById('weFlaecheMeter').value) || 0;
        if (!anzahl || !meter) { showToast('Bitte Anzahl und Meter eingeben.', 'warning'); return; }
        menge = anzahl;
        einheit = 'Rollen';
        details = { anzahl, meterProRolle: meter, totalMeter: anzahl * meter };
    } else if (m.type === 'stueck') {
        const anzahl = parseInt(document.getElementById('weStueckAnzahl').value) || 0;
        if (!anzahl) { showToast('Bitte Anzahl eingeben.', 'warning'); return; }
        menge = anzahl;
        einheit = m.unit || 'Stück';
        details = { anzahl };
    }

    try {
        await db.collection('inventory_in').add({
            materialId: matId,
            materialName: m.name,
            materialType: m.type,
            farbe,
            menge, einheit, details,
            datum, preis, lieferant, bemerkung,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser ? currentUser.email : 'unknown'
        });

        showToast(`${m.name}: ${menge} ${einheit} eingebucht!`, 'success');

        // Reset form
        document.getElementById('weMatId').value = '';
        document.getElementById('wePreis').value = '';
        document.getElementById('weLieferant').value = '';
        document.getElementById('weBemerkung').value = '';
        onWeMaterialChange();
        loadWareneingaenge();
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function editWareneingang(id) {
    if (!isSuperAdmin()) { showToast('Nur Superadmin.', 'warning'); return; }
    try {
        const doc = await db.collection('inventory_in').doc(id).get();
        if (!doc.exists) { showToast('Eintrag nicht gefunden.', 'error'); return; }
        const e = doc.data();
        const d = e.details || {};

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `<div class="confirm-box" style="max-width:420px;max-height:85vh;overflow-y:auto">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <div style="font-size:17px;font-weight:700">${escHtml(e.materialName || '?')} bearbeiten</div>
                <button onclick="this.closest('.confirm-overlay').remove()" style="background:var(--border-light);border:none;border-radius:8px;width:32px;height:32px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div class="edit-field"><label>Menge</label><input type="number" id="weEditMenge" value="${e.menge || 0}" step="0.1"></div>
            ${e.farbe ? `<div class="edit-field"><label>Farbe</label>
                <select id="weEditFarbe" style="width:100%;padding:10px;font-size:14px;border:2px solid var(--border);border-radius:var(--radius-sm);font-family:inherit">
                    <option value="Antrazit"${e.farbe==='Antrazit'?' selected':''}>Antrazit</option>
                    <option value="Weiß"${e.farbe==='Weiß'?' selected':''}>Weiß</option>
                    <option value="Braun"${e.farbe==='Braun'?' selected':''}>Braun</option>
                </select>
            </div>` : ''}
            ${d.totalMeter !== undefined ? `<div class="edit-field"><label>Gesamt Meter</label><input type="number" id="weEditMeter" value="${d.totalMeter || 0}" step="0.1"></div>` : ''}
            ${d.totalFalten !== undefined ? `<div class="edit-field"><label>Gesamt Falten</label><input type="number" id="weEditFalten" value="${d.totalFalten || 0}"></div>` : ''}
            ${d.hoehe !== undefined ? `<div class="edit-field"><label>Höhe (cm)</label><input type="number" id="weEditHoehe" value="${d.hoehe || 0}" step="0.5"></div>` : ''}
            <div class="edit-field"><label>Datum</label><input type="date" id="weEditDatum" value="${e.datum || ''}"></div>
            <div class="edit-field"><label>Preis € (optional)</label><input type="number" id="weEditPreis" value="${e.preis || ''}" step="0.01"></div>
            <div class="edit-field"><label>Lieferant</label><input type="text" id="weEditLieferant" value="${escHtml(e.lieferant || '')}"></div>
            <button onclick="saveWareneingangEdit('${id}', this.closest('.confirm-overlay'))" style="width:100%;padding:13px;background:var(--primary);color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:12px">Speichern</button>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });
    } catch(err) { showToast('Fehler: ' + err.message, 'error'); }
}

async function saveWareneingangEdit(id, overlay) {
    const menge = parseFloat(document.getElementById('weEditMenge')?.value) || 0;
    const farbe = document.getElementById('weEditFarbe')?.value || '';
    const datum = document.getElementById('weEditDatum')?.value || '';
    const preis = parseFloat(document.getElementById('weEditPreis')?.value) || 0;
    const lieferant = document.getElementById('weEditLieferant')?.value?.trim() || '';

    const update = { menge, datum, preis, lieferant };
    if (farbe) update.farbe = farbe;

    // Update details if fields exist
    const details = {};
    const meterEl = document.getElementById('weEditMeter');
    const faltenEl = document.getElementById('weEditFalten');
    const hoeheEl = document.getElementById('weEditHoehe');
    if (meterEl) details.totalMeter = parseFloat(meterEl.value) || 0;
    if (faltenEl) details.totalFalten = parseInt(faltenEl.value) || 0;
    if (hoeheEl) details.hoehe = parseFloat(hoeheEl.value) || 0;
    if (Object.keys(details).length) update['details'] = firebase.firestore.FieldValue.delete();

    try {
        // Merge details
        const doc = await db.collection('inventory_in').doc(id).get();
        const existingDetails = doc.data()?.details || {};
        update.details = { ...existingDetails, ...details };

        await db.collection('inventory_in').doc(id).update(update);
        showToast('Eintrag aktualisiert!', 'success');
        overlay.remove();
        loadWareneingaenge();
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deleteWareneingang(id) {
    showConfirm('Eintrag löschen', 'Wareneingang wirklich löschen?', 'Löschen', async () => {
        try {
            await db.collection('inventory_in').doc(id).delete();
            showToast('Eintrag gelöscht.', 'success');
            loadWareneingaenge();
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

async function loadWareneingaenge() {
    const el = document.getElementById('weList');
    if (!el) return;

    try {
        const snap = await db.collection('inventory_in').orderBy('createdAt', 'desc').limit(20).get();
        // BUGFIX v1.14.0: hier wurde fälschlich cachedMaterials = inventory_in gesetzt (Copy-Paste-Fehler).
        if (snap.empty) {
            el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px;text-align:center">Noch keine Eingänge.</div>';
            return;
        }

        el.innerHTML = snap.docs.map(d => {
            const e = d.data();
            const dt = e.datum || '';
            const datumStr = dt ? dt.split('-').reverse().join('.') : '';
            let infoStr = '';
            if (e.details) {
                if (e.details.totalMeter) infoStr = `${e.details.totalMeter.toFixed(1)}m`;
                else if (e.details.totalFalten) infoStr = `${e.details.totalFalten} Falten · ${e.details.hoehe || '?'}cm`;
                else if (e.details.anzahl) infoStr = `${e.details.anzahl} ${e.einheit}`;
            }
            const farbeStr = e.farbe ? ` · ${e.farbe}` : '';
            const editBtn = isSuperAdmin() ? `<button onclick="event.stopPropagation();editWareneingang('${d.id}')" style="background:none;border:none;color:var(--primary);cursor:pointer;padding:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>` : '';
            const delBtn = isSuperAdmin() ? `<button onclick="event.stopPropagation();deleteWareneingang('${d.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;padding:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : '';
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light)">
                <div>
                    <div style="font-size:14px;font-weight:600">${escHtml(e.materialName || '?')}</div>
                    <div style="font-size:12px;color:var(--text-muted)">${e.menge} ${e.einheit}${farbeStr} · ${infoStr}</div>
                </div>
                <div style="display:flex;align-items:center;gap:4px">
                    <div style="text-align:right">
                        <div style="font-size:12px;color:var(--text-muted)">${datumStr}</div>
                        ${e.preis ? `<div style="font-size:12px;font-weight:600;color:var(--green)">€ ${e.preis.toFixed(2)}</div>` : ''}
                    </div>
                    ${editBtn}${delBtn}
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        el.innerHTML = `<div style="font-size:13px;color:var(--red);padding:8px">Fehler: ${e.message}</div>`;
    }
}

// ═══ BESTANDSÜBERSICHT ═══
async function exportBestellliste(format) {
    try {
        const [matSnap, inSnap, outSnap] = await Promise.all([
            db.collection('materials').orderBy('sortOrder').get(),
            db.collection('inventory_in').get(),
            db.collection('inventory_out').get()
        ]);

        const materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const eingang = {}, ausgang = {};
        inSnap.docs.forEach(d => { const e = d.data(); const k = e.materialId + (e.farbe?'_'+e.farbe:''); if(!eingang[k]) eingang[k]={meter:0,falten:0,stueck:0}; if(e.details?.totalMeter) eingang[k].meter+=e.details.totalMeter; if(e.details?.totalFalten) eingang[k].falten+=e.details.totalFalten; eingang[k].stueck+=e.menge||0; });
        outSnap.docs.forEach(d => { const e = d.data(); const k = e.materialId + (e.farbe?'_'+e.farbe:''); if(!ausgang[k]) ausgang[k]=0; ausgang[k]+=e.verbrauch||0; });

        let lowItems = [];
        materials.forEach(mat => {
            if (!mat.active || (!mat.minStock && !mat.minStockFalten)) return;
            const farben = mat.byColor ? (mat.colors && mat.colors.length ? mat.colors : ['Antrazit', 'Weiß', 'Braun']) : [''];
            farben.forEach(farbe => {
                const k = mat.id + (farbe?'_'+farbe:'');
                const ein = eingang[k] || {};
                const aus = ausgang[k]?.verbrauch || ausgang[k] || 0;
                let bestand = 0;
                if (mat.type === 'stange') bestand = (ein.meter||0) - aus;
                else if (mat.type === 'netz') bestand = (ein.falten||0) - aus;
                else if (mat.type === 'rolle' || mat.type === 'flaeche') bestand = (ein.meter||0) - aus;
                else bestand = (ein.stueck||0) - aus;

                const minVal = mat.type === 'netz' ? (mat.minStockFalten||0) : (mat.minStock||0);
                if (bestand < minVal) {
                    lowItems.push({ name: mat.name, farbe, bestand: bestand.toFixed(1), min: minVal, fehlt: (minVal - bestand).toFixed(1), unit: mat.type==='stange'?'m':(mat.type==='netz'?'Falten':(mat.type==='stueck'?(mat.unit||'Stk'):'m')) });
                }
            });
        });

        if (!lowItems.length) { showToast('Alle Bestände über Mindestbestand!', 'success'); return; }

        const datum = new Date().toLocaleDateString('de-AT');
        const datumFile = new Date().toISOString().split('T')[0];

        if (format === 'csv') {
            let csv = 'Material;Farbe;Bestand;Einheit;Mindestbestand;Fehlmenge\n';
            lowItems.forEach(item => {
                csv += `${item.name};${item.farbe||'-'};${item.bestand};${item.unit};${item.min};${item.fehlt}\n`;
            });
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `bestellliste_${datumFile}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast(`CSV exportiert: ${lowItems.length} Materialien`, 'success');
        } else {
            const rows = lowItems.map(item =>
                `<tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600">${item.name}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:center">${item.farbe||'—'}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:right;color:#dc2626;font-weight:600">${item.bestand} ${item.unit}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:right">${item.min} ${item.unit}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700;color:#dc2626">${item.fehlt} ${item.unit}</td>
                </tr>`
            ).join('');

            const printWin = window.open('', '_blank', 'width=800,height=600');
            if (!printWin) { showToast('Popup-Blocker deaktivieren.', 'warning'); return; }
            printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bestellliste</title>
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding:32px; color:#1a1a1a; }
                .header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:24px; padding-bottom:16px; border-bottom:3px solid #534AB7; }
                .title { font-size:22px; font-weight:700; color:#534AB7; }
                .date { font-size:13px; color:#888; }
                .summary { background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px 16px; margin-bottom:20px; font-size:14px; color:#991b1b; font-weight:600; }
                table { width:100%; border-collapse:collapse; font-size:13px; }
                th { padding:10px 8px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#888; border-bottom:2px solid #e5e5e5; }
                th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align:right; }
                .footer { margin-top:24px; font-size:11px; color:#aaa; text-align:center; }
                @media print { body { padding:20px; } .no-print { display:none; } }
                .btn { margin-top:16px; padding:12px 24px; background:#534AB7; color:white; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; }
            </style></head><body>
            <div class="header">
                <div><div class="title">Bestellliste</div><div style="font-size:14px;font-weight:600;margin-top:4px">Fliegengitter</div></div>
                <div class="date">${datum}</div>
            </div>
            <div class="summary">${lowItems.length} Material(ien) unter Mindestbestand</div>
            <table>
                <thead><tr><th>Material</th><th style="text-align:center">Farbe</th><th style="text-align:right">Bestand</th><th style="text-align:right">Minimum</th><th style="text-align:right">Fehlmenge</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="footer">Erstellt am ${datum}</div>
            <div class="no-print" style="text-align:center"><button class="btn" onclick="window.print()">Drucken / Als PDF speichern</button></div>
            </body></html>`);
            printWin.document.close();
        }
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function loadBestandsuebersicht() {
    const el = document.getElementById('lagerContent');
    if (!el) return;
    el.innerHTML = '<div class="loading" style="padding:12px">Bestand wird berechnet...</div>';

    try {
        const [matSnap, inSnap, outSnap, checkSnap] = await Promise.all([
            db.collection('materials').orderBy('sortOrder').get(),
            db.collection('inventory_in').get(),
            db.collection('inventory_out').get(),
            db.collection('inventory_check').orderBy('createdAt', 'desc').limit(1).get()
        ]);

        const materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const lastCheck = checkSnap.empty ? null : checkSnap.docs[0].data();
        const lastCheckDate = lastCheck ? lastCheck.datum : null;

        // Calculate Eingang totals per material+farbe
        const eingang = {};
        inSnap.docs.forEach(d => {
            const e = d.data();
            const key = e.materialId + (e.farbe ? '_' + e.farbe : '');
            if (!eingang[key]) eingang[key] = { meter: 0, stangen: 0, falten: 0, stueck: 0, rollen: 0 };
            if (e.details?.totalMeter) eingang[key].meter += e.details.totalMeter;
            if (e.details?.totalFalten) eingang[key].falten += e.details.totalFalten;
            if (e.details?.anzahl) eingang[key].stangen += e.details.anzahl;
            eingang[key].stueck += e.menge || 0;
        });

        // Calculate Ausgang totals per material+farbe
        const ausgang = {};
        outSnap.docs.forEach(d => {
            const e = d.data();
            const key = e.materialId + (e.farbe ? '_' + e.farbe : '');
            if (!ausgang[key]) ausgang[key] = { verbrauch: 0 };
            ausgang[key].verbrauch += e.verbrauch || 0;
        });

        // Get last inventory values
        const lastInv = {};
        if (lastCheck && lastCheck.items) {
            lastCheck.items.forEach(item => {
                lastInv[item.key] = item.istBestand || 0;
            });
        }

        let html = '';
        materials.forEach(mat => {
            if (!mat.active) return;
            const farben = mat.byColor ? (mat.colors && mat.colors.length ? mat.colors : ['Antrazit', 'Weiß', 'Braun']) : [''];

            let matHtml = '';
            let hasData = false;

            farben.forEach(farbe => {
                const key = mat.id + (farbe ? '_' + farbe : '');
                const ein = eingang[key] || {};
                const aus = ausgang[key] || {};

                let bestandValue = 0;
                let einheitStr = '';
                let totalEin = 0;
                let totalAus = aus.verbrauch || 0;

                if (mat.type === 'stange') {
                    totalEin = (ein.meter || 0);
                    bestandValue = totalEin - totalAus;
                    const stangen = mat.purchaseLength ? bestandValue / mat.purchaseLength : 0;
                    einheitStr = `${bestandValue.toFixed(1)}m (≈${stangen.toFixed(1)} Stg)`;
                } else if (mat.type === 'netz') {
                    totalEin = ein.falten || 0;
                    bestandValue = totalEin - totalAus;
                    einheitStr = `${bestandValue.toFixed(0)} Falten`;
                } else if (mat.type === 'rolle' || mat.type === 'flaeche') {
                    totalEin = ein.meter || 0;
                    bestandValue = totalEin - totalAus;
                    einheitStr = `${bestandValue.toFixed(1)}m`;
                } else if (mat.type === 'stueck') {
                    totalEin = ein.stueck || 0;
                    bestandValue = totalEin - totalAus;
                    einheitStr = `${bestandValue.toFixed(0)} ${mat.unit || 'Stk'}`;
                }

                // Use last inventory as base if available
                if (lastInv[key] !== undefined) {
                    bestandValue = lastInv[key] - totalAus; // simplified: last inv - ausgang since then
                }

                if (totalEin > 0 || totalAus > 0 || lastInv[key] !== undefined) hasData = true;

                const isLow = mat.minStock && bestandValue < mat.minStock;
                const isLowFalten = mat.minStockFalten && bestandValue < mat.minStockFalten;
                const warn = isLow || isLowFalten;

                const farbeColor = {'Antrazit':'#4a4a4a','Weiß':'#d4d4d4','Braun':'#8B4513'}[farbe] || 'var(--primary)';

                matHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 8px ${farbe?'12px':'0'};${farbe?'border-bottom:1px solid var(--border-light)':''}">
                    <div style="display:flex;align-items:center;gap:6px">
                        ${farbe ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${farbeColor}"></span><span style="font-size:13px;font-weight:500">${farbe}</span>` : ''}
                    </div>
                    <div style="text-align:right">
                        <span style="font-size:14px;font-weight:700;${warn?'color:var(--red)':''}">${einheitStr}</span>
                        ${warn ? ' <span style="font-size:11px;color:var(--red);font-weight:600">Nachbestellen!</span>' : ''}
                    </div>
                </div>`;
            });

            if (!hasData && !mat.byColor) {
                matHtml = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Noch kein Bestand eingetragen</div>';
            }

            html += `<div class="card" style="margin-bottom:8px">
                <div style="font-size:15px;font-weight:700;margin-bottom:6px">${mat.name}</div>
                ${matHtml}
            </div>`;
        });

        if (lastCheckDate) {
            html += `<div style="text-align:center;font-size:12px;color:var(--text-muted);padding:8px">Letzte Inventur: ${lastCheckDate.split('-').reverse().join('.')}</div>`;
        }

        el.innerHTML = html || '<div style="text-align:center;color:var(--text-muted);padding:20px">Noch kein Bestand. Buche zuerst einen Wareneingang.</div>';
    } catch(e) {
        el.innerHTML = `<div style="font-size:13px;color:var(--red);padding:8px">Fehler: ${e.message}</div>`;
    }
}

// ═══ INVENTUR ═══
let inventurMaterials = [];

async function initInventur() {
    const el = document.getElementById('inventurForm');
    if (!el) return;
    el.innerHTML = '<div class="loading" style="padding:12px">Materialien werden geladen...</div>';

    try {
        const [matSnap, inSnap, outSnap, checkSnap] = await Promise.all([
            db.collection('materials').orderBy('sortOrder').get(),
            db.collection('inventory_in').get(),
            db.collection('inventory_out').get(),
            db.collection('inventory_check').orderBy('createdAt', 'desc').limit(1).get()
        ]);

        inventurMaterials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const lastCheck = checkSnap.empty ? null : checkSnap.docs[0].data();

        // Calculate Soll-Bestand
        const eingang = {}, ausgang = {}, lastInv = {};
        inSnap.docs.forEach(d => {
            const e = d.data();
            const key = e.materialId + (e.farbe ? '_' + e.farbe : '');
            if (!eingang[key]) eingang[key] = { meter: 0, falten: 0, stueck: 0 };
            if (e.details?.totalMeter) eingang[key].meter += e.details.totalMeter;
            if (e.details?.totalFalten) eingang[key].falten += e.details.totalFalten;
            eingang[key].stueck += e.menge || 0;
        });
        outSnap.docs.forEach(d => {
            const e = d.data();
            const key = e.materialId + (e.farbe ? '_' + e.farbe : '');
            if (!ausgang[key]) ausgang[key] = 0;
            ausgang[key] += e.verbrauch || 0;
        });
        if (lastCheck?.items) lastCheck.items.forEach(item => { lastInv[item.key] = item.istBestand || 0; });

        let html = '';
        inventurMaterials.forEach(mat => {
            if (!mat.active) return;
            const farben = mat.byColor ? (mat.colors && mat.colors.length ? mat.colors : ['Antrazit', 'Weiß', 'Braun']) : [''];

            html += `<div style="font-size:15px;font-weight:700;margin-top:16px;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid var(--primary)">${mat.name}</div>`;

            farben.forEach(farbe => {
                const key = mat.id + (farbe ? '_' + farbe : '');
                const ein = eingang[key] || {};
                const aus = ausgang[key] || 0;

                let sollBestand = 0;
                let einheitStr = '';
                if (mat.type === 'stange') {
                    sollBestand = (ein.meter || 0) - aus;
                    const stg = mat.purchaseLength ? sollBestand / mat.purchaseLength : 0;
                    einheitStr = `Soll: ${sollBestand.toFixed(1)}m (≈${stg.toFixed(1)} Stg)`;
                } else if (mat.type === 'netz') {
                    sollBestand = (ein.falten || 0) - aus;
                    einheitStr = `Soll: ${sollBestand.toFixed(0)} Falten`;
                } else if (mat.type === 'rolle' || mat.type === 'flaeche') {
                    sollBestand = (ein.meter || 0) - aus;
                    einheitStr = `Soll: ${sollBestand.toFixed(1)}m`;
                } else if (mat.type === 'stueck') {
                    sollBestand = (ein.stueck || 0) - aus;
                    einheitStr = `Soll: ${sollBestand.toFixed(0)} ${mat.unit || 'Stk'}`;
                }

                const farbeLabel = farbe ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${{Antrazit:'#4a4a4a',Weiß:'#d4d4d4',Braun:'#8B4513'}[farbe]||'#999'}"></span> ${farbe}` : '';
                const inputUnit = mat.type === 'stange' ? 'Meter' : (mat.type === 'netz' ? 'Falten' : (mat.type === 'stueck' ? (mat.unit||'Stk') : 'Meter'));

                html += `<div style="padding:8px 0;border-bottom:1px solid var(--border-light)">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                        ${farbeLabel}
                        <span style="font-size:12px;color:var(--text-muted);margin-left:auto">${einheitStr}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <label style="font-size:12px;color:var(--text-secondary);min-width:25px">Ist:</label>
                        <input type="number" data-inv-key="${key}" data-inv-soll="${sollBestand}" step="0.1" placeholder="Gezählt..." style="flex:1;padding:8px 10px;font-size:14px;border:2px solid var(--border);border-radius:8px;font-family:inherit">
                        <span style="font-size:12px;color:var(--text-muted);min-width:40px">${inputUnit}</span>
                    </div>
                </div>`;
            });
        });

        el.innerHTML = html || '<div style="text-align:center;color:var(--text-muted)">Keine Materialien angelegt.</div>';

        // Load last inventories
        loadInventurHistory();
    } catch(e) {
        el.innerHTML = `<div style="font-size:13px;color:var(--red);padding:8px">Fehler: ${e.message}</div>`;
    }
}

async function saveInventur() {
    const inputs = document.querySelectorAll('[data-inv-key]');
    const items = [];
    let hasData = false;

    inputs.forEach(inp => {
        const key = inp.dataset.invKey;
        const soll = parseFloat(inp.dataset.invSoll) || 0;
        const ist = inp.value.trim();
        if (ist === '') return;
        hasData = true;
        const istVal = parseFloat(ist) || 0;
        const diff = soll - istVal;
        const verbrauchGesamt = soll; // simplified
        const verschnittPct = verbrauchGesamt > 0 ? ((diff / verbrauchGesamt) * 100) : 0;

        items.push({ key, sollBestand: soll, istBestand: istVal, differenz: diff, verschnittPct: verschnittPct.toFixed(1) });
    });

    if (!hasData) { showToast('Bitte mindestens einen Ist-Bestand eingeben.', 'warning'); return; }

    try {
        await db.collection('inventory_check').add({
            datum: new Date().toISOString().split('T')[0],
            items,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser ? currentUser.email : 'unknown'
        });
        showToast('Inventur gespeichert!', 'success');
        loadInventurHistory();
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function loadInventurHistory() {
    const el = document.getElementById('inventurHistory');
    if (!el) return;

    try {
        const snap = await db.collection('inventory_check').orderBy('createdAt', 'desc').limit(5).get();
        // BUGFIX v1.14.0: hier wurde fälschlich cachedMaterials = inventory_check gesetzt (Copy-Paste-Fehler).
        if (snap.empty) {
            el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px;text-align:center">Noch keine Inventur durchgeführt.</div>';
            return;
        }

        el.innerHTML = snap.docs.map(d => {
            const inv = d.data();
            const datumStr = inv.datum ? inv.datum.split('-').reverse().join('.') : '?';
            const itemCount = (inv.items || []).length;
            const totalDiff = (inv.items || []).reduce((s, i) => s + Math.abs(i.differenz || 0), 0);
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light)">
                <div>
                    <div style="font-size:14px;font-weight:600">${datumStr}</div>
                    <div style="font-size:12px;color:var(--text-muted)">${itemCount} Materialien geprüft</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:13px;font-weight:600;color:${totalDiff > 0 ? 'var(--red)' : 'var(--green)'}">Diff: ${totalDiff.toFixed(1)}</div>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        el.innerHTML = `<div style="font-size:13px;color:var(--red);padding:8px">Fehler: ${e.message}</div>`;
    }
}

// ═══ B-WARE CHECK ═══
function checkBWare(breite, hoehe, farbe) {
    if (!hasPerm('bware_check')) return;
    // Don't check if no real values entered
    if (!breite || !hoehe || breite <= 0 || hoehe <= 0) {
        ['bwareAlert', 'rechnerBwareAlert'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        return;
    }
    const bwareOrders = orders.filter(o => o.column === 'B-Ware');
    if (!bwareOrders.length) return;

    const matches = [];
    bwareOrders.forEach(bw => {
        (bw.measures || []).forEach(m => {
            const bwBreite = parseFloat(m.breite) || 0;
            const bwHoehe = parseFloat(m.hoehe) || 0;
            const bwFarbe = m.farbe || bw.farbe || '';
            if (!bwBreite || !bwHoehe) return;

            // Farbe muss übereinstimmen
            if (farbe && bwFarbe && farbe !== bwFarbe) return;

            // B-Ware muss GRÖSSER sein als die Bestellung (zum Zuschneiden)
            // aber maximal 25% größer (kein Verschnitt)
            // B-Ware Breite/Höhe >= Bestellung Breite/Höhe
            if (bwBreite < breite || bwHoehe < hoehe) return; // B-Ware zu klein
            const breiteGroesser = (bwBreite - breite) / breite; // wie viel % größer
            const hoeheGroesser = (bwHoehe - hoehe) / hoehe;
            if (breiteGroesser > 0.25) return; // zu viel größer
            if (hoeheGroesser > 0.25) return;  // zu viel größer

            // B-Ware Tül Adet muss >= Bestellung Tül Adet
            const enIdx = abzuege.findIndex(a => a.name === 'Profil En');
            const bwEnMass = bwBreite - abzuege[enIdx].abzug;
            const bwTuelAdet = bwEnMass / 2;
            const newEnMass = breite - abzuege[enIdx].abzug;
            const newTuelAdet = newEnMass / 2;

            if (bwTuelAdet < newTuelAdet) return;

            const tuelIdx = abzuege.findIndex(a => a.name === 'Tül');
            const bwTuelLen = bwHoehe - abzuege[tuelIdx].abzug;
            matches.push({
                orderId: bw.id,
                kunde: (bw.vorname||'') + ' ' + (bw.nachname||''),
                breite: bwBreite, hoehe: bwHoehe, farbe: m.farbe || bw.farbe,
                tuelLen: bwTuelLen.toFixed(1),
                bwTuelAdet: bwTuelAdet.toFixed(1),
                newTuelAdet: newTuelAdet.toFixed(1)
            });
        });
    });

    const matchHtml = matches.length ? `<div style="font-weight:700;margin-bottom:6px"><span style="display:inline-flex;vertical-align:middle;margin-right:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 4.875 7.97l3.418-3.421"/><path d="M17 3.414 13.582 7 17 10.586"/><path d="m9.5 4.39 3.918-1.247 1.247 3.918"/></svg></span> Passende B-Ware gefunden!</div>` +
        matches.map(m => `<div onclick="openOrderDetail('${m.orderId}')" style="padding:10px;background:white;border-radius:8px;margin-top:6px;cursor:pointer;border:1px solid var(--amber-border);transition:background 0.15s" ontouchstart="this.style.background='var(--amber-bg)'" ontouchend="this.style.background='white'">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:700;color:#78350f">${m.farbe}</span>
                <span style="font-size:12px;color:var(--text-muted)">antippen für Details →</span>
            </div>
            <div style="font-size:15px;font-weight:600;margin-top:4px">${m.breite} × ${m.hoehe} cm</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Tül: ${m.tuelLen} cm · Tül Adet: ${m.bwTuelAdet} (Bedarf: ${m.newTuelAdet})</div>
        </div>`).join('') : '';

    // Update both alert elements (Neu form + Rechner)
    const alertEl = document.getElementById('rechnerBwareAlert');
    if (alertEl) {
        if (matches.length) {
            alertEl.style.display = 'block';
            alertEl.innerHTML = matchHtml;
        } else {
            alertEl.style.display = 'none';
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// 06-stammdaten.js — Stammdaten-Verwaltung
//
// Enthält alle Verwaltungsfunktionen für die Settings/Stammdaten:
//   - FILIALEN (loadFilialen, openFilialeForm, saveFiliale, deleteFiliale, assignAllOrders)
//   - FARB-KATALOG (renderColorsList, openColorForm, saveColor, deleteColor)
//   - PLISSEE-FARBEN UI (renderPlisseeColorsList, openPlisseeColorForm, savePlisseeColor, deletePlisseeColor)
//   - VARIANTEN (renderVariantsList, openVariantForm, saveVariant, ...)
//   - MODELLE (renderModelsList, openModelForm, saveModel, deleteModel, ...)
//   - MODELL-SCHNITTLISTE-EDITOR (renderModelCutsList, addCutToModelMaterial, ...)
//   - CUT-OVERRIDES (toggleCutOverrides, addCutOverride, ...)
//   - MIGRATION (checkMigrationStatus, runMigration, migrateColors, ...)
//   - CUTS EDITOR (renderMatCutsList, addMatCut, moveMatCut)
//   - MATERIALVERWALTUNG (loadMaterials, loadRechnerMaterials, openMaterialForm, ...)
//   - Material Drag & Drop (reorderMaterials, onMatDrag*, onMatTouch*)
//
// Lädt NACH dem inline-Script. Alle Funktionen werden durch User-Aktion
// oder vom Auth-Listener aufgerufen — keine Top-Level-Aufrufe.
//
// Globale Abhängigkeiten (im inline-Script + andere JS-Dateien):
//   - db, auth (Firebase)
//   - showToast, showConfirm (01-helpers.js)
//   - t, translateMaterial, applyTranslationsToElement (02-i18n.js)
//   - hasPerm, currentUser, currentUserPerms (03-auth.js + inline)
//   - cachedMaterials, cachedColors, cachedPlisseeColors, cachedVariants,
//     cachedModels, cachedFilialen, abzuege, escHtml und vieles mehr (inline)
// ═══════════════════════════════════════════════════════════════════

// ═══ FILIALEN ═══
async function loadFilialen() {
    try {
        const snap = await db.collection('filialen').orderBy('name').get();
        filialen = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { filialen = []; }

    // Update filiale filter dropdown
    const filterEl = document.getElementById('filialeSelect');
    if (filterEl) {
        // v1.19.41: zusätzliche "Online"-Option für Webshop-Bestellungen (source === 'online')
        filterEl.innerHTML = '<option value="">Alle Filialen</option>' +
            '<option value="__online__">📦 Online (Webshop)</option>' +
            filialen.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    }

    // Show/hide filter (v1.18.1: auch für Mitarbeiter mit view_all_filialen)
    const filterDiv = document.getElementById('filialeFilter');
    if (filterDiv) {
        const canSeeAll = isSuperAdmin() || (isAdmin() && !currentUserFilialeId) || hasPerm('view_all_filialen');
        filterDiv.style.display = filialen.length > 0 && canSeeAll ? 'block' : 'none';
    }

    // Update invite filiale dropdown
    const inviteEl = document.getElementById('inviteFiliale');
    if (inviteEl) {
        inviteEl.innerHTML = '<option value="">— Filiale wählen —</option>' +
            filialen.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    }

    // Update new order filiale dropdown (only for users without filiale)
    const newFilialeField = document.getElementById('newFilialeField');
    const newFilialeSel = document.getElementById('newFilialeSelect');
    if (newFilialeField && newFilialeSel) {
        if (!currentUserFilialeId && filialen.length > 0) {
            newFilialeField.style.display = 'block';
            newFilialeSel.innerHTML = '<option value="">— Filiale wählen —</option>' +
                filialen.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
        } else {
            newFilialeField.style.display = 'none';
        }
    }

    // Render filialen list in settings
    const listEl = document.getElementById('filialenList');
    if (listEl) {
        if (!filialen.length) {
            listEl.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px;text-align:center">Keine Filialen angelegt.</div>';
        } else {
            // v1.19.52: Klick auf ganze Zeile → Produktions-Drill-Down. Bearbeiten via Stift-Icon.
            const canDrill = (typeof hasPerm === 'function') && hasPerm('mitarbeiter_leistung_view');
            const rowAttrs = canDrill
                ? `style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--border-light);cursor:pointer;border-radius:6px" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''" title="Produktion der Filiale anzeigen"`
                : `style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--border-light)"`;
            const clickHandler = canDrill ? `onclick="openFilialeDrillDown('${f => f.id}')"` : '';
            const filialenRows = filialen.map(f => `<div ${canDrill?`onclick="openFilialeDrillDown('${f.id}')"`:''} ${rowAttrs}>
                <div>
                    <div style="font-size:14px;font-weight:700">${f.name}</div>
                    ${f.adresse ? `<div style="font-size:12px;color:var(--text-muted)">${f.adresse}</div>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    <button onclick="event.stopPropagation();openFilialeForm('${f.id}')" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text-secondary);font-weight:600;cursor:pointer;font-family:inherit" title="Bearbeiten">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Bearbeiten
                    </button>
                    ${canDrill ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' : ''}
                </div>
            </div>`).join('');
            // v1.19.52: Virtuelle Zeile "Ohne Filiale" — Bestellungen die von Mitarbeitern ohne Filiale-Zuordnung produziert wurden
            const noneRow = canDrill ? `<div onclick="openFilialeDrillDown('__none__')" ${rowAttrs.replace(/cursor:pointer/, 'cursor:pointer;opacity:0.85')}>
                <div>
                    <div style="font-size:14px;font-weight:700;color:var(--text-muted)">Ohne Filiale</div>
                    <div style="font-size:12px;color:var(--text-muted)">Produktion durch Mitarbeiter ohne Filiale-Zuordnung (z.B. Admin)</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>` : '';
            listEl.innerHTML = filialenRows + noneRow;
        }
    }

    // Assign section
    const assignSection = document.getElementById('filialeAssignSection');
    const assignSelect = document.getElementById('assignFilialeSelect');
    if (assignSection && assignSelect && filialen.length && isSuperAdmin()) {
        assignSection.style.display = 'block';
        assignSelect.innerHTML = filialen.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    }
}

function openFilialeForm(id) {
    const f = id ? filialen.find(x => x.id === id) : { name: '', adresse: '' };
    if (!f) return;

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-box" style="max-width:380px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div style="font-size:17px;font-weight:700">${id ? 'Filiale bearbeiten' : 'Neue Filiale'}</div>
            <button onclick="this.closest('.confirm-overlay').remove()" style="background:var(--border-light);border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="edit-field"><label>Name</label><input type="text" id="filialeName" value="${f.name || ''}" placeholder="z.B. Filiale Wien"></div>
        <div class="edit-field"><label>Adresse (optional)</label><input type="text" id="filialeAdresse" value="${f.adresse || ''}" placeholder="Straße, PLZ Ort"></div>
        <div style="display:flex;gap:8px;margin-top:16px">
            <button onclick="saveFiliale('${id||''}', this.closest('.confirm-overlay'))" style="flex:1;padding:13px;background:var(--primary);color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Speichern</button>
            ${id ? `<button onclick="deleteFiliale('${id}', this.closest('.confirm-overlay'))" style="padding:13px 16px;background:var(--red);color:white;border:none;border-radius:12px;cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function saveFiliale(id, overlay) {
    const name = document.getElementById('filialeName').value.trim();
    const adresse = document.getElementById('filialeAdresse').value.trim();
    if (!name) { showToast('Bitte Name eingeben.', 'warning'); return; }

    try {
        if (id) {
            await db.collection('filialen').doc(id).update({ name, adresse });
            // Update filialeName in all members with this filialeId
            const membersSnap = await db.collection('members').where('filialeId', '==', id).get();
            const batch = db.batch();
            membersSnap.docs.forEach(d => batch.update(d.ref, { filialeName: name }));
            await batch.commit();
        } else {
            await db.collection('filialen').add({ name, adresse, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
        showToast('Filiale gespeichert!', 'success');
        overlay.remove();
        loadFilialen();
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deleteFiliale(id, overlay) {
    showConfirm('Filiale löschen', 'Diese Filiale wirklich löschen?', 'Löschen', async () => {
        try {
            await db.collection('filialen').doc(id).delete();
            showToast('Filiale gelöscht.', 'success');
            overlay.remove();
            loadFilialen();
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// ═══ FARB-KATALOG (R1.5) ═══

function renderColorsList() {
    const el = document.getElementById('colorsList');
    if (!el) return;
    if (!cachedColors.length) {
        el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:12px;text-align:center">Noch keine Farben angelegt. Klicke "+ Neue Farbe".</div>';
        return;
    }
    el.innerHTML = cachedColors.map(c => `
        <div onclick="openColorForm('${c.id}')" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer">
            <div style="width:32px;height:32px;border-radius:8px;background:${c.bg};color:${c.text};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">A</div>
            <div style="flex:1;font-weight:600">${escHtml(c.name)}</div>
            <span style="font-size:11px;color:var(--text-muted)">${c.bg}</span>
            ${c.active === false ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white">INAKTIV</span>' : ''}
        </div>
    `).join('');
}

function openColorForm(id) {
    const c = id ? getColor(id) : { name: '', bg: '#4a4a4a', text: '#ffffff', active: true };
    if (id && !c) return;

    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal">
            <div class="edit-header">
                <span>${id ? 'Farbe bearbeiten' : 'Neue Farbe'}</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body">
                <div class="edit-field"><label>Name</label><input type="text" class="em-input" id="colorName" value="${escHtml(c.name)}" placeholder="z.B. Schwarz matt"></div>
                <div class="edit-field"><label>Hintergrundfarbe (Hex)</label><input type="color" class="em-input" id="colorBg" value="${c.bg || '#4a4a4a'}"></div>
                <div class="edit-field"><label>Schriftfarbe (Hex)</label><input type="color" class="em-input" id="colorText" value="${c.text || '#ffffff'}"></div>
                <div class="edit-field"><label class="checkbox-label"><input type="checkbox" id="colorActive" ${c.active !== false ? 'checked' : ''}> Aktiv</label></div>
                <div style="margin-top:12px;padding:10px;background:var(--bg-light);border-radius:8px;text-align:center">
                    <span id="colorPreview" style="display:inline-flex;padding:8px 18px;border-radius:8px;background:${c.bg};color:${c.text};font-weight:700;font-size:14px">${escHtml(c.name) || 'Vorschau'}</span>
                </div>
            </div>
            <div class="edit-footer">
                ${id ? `<button class="action-btn" style="background:var(--red);color:white" onclick="deleteColor('${id}')">Löschen</button>` : ''}
                <button class="action-btn primary" onclick="saveColor('${id || ''}')">Speichern</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const update = () => {
        const p = document.getElementById('colorPreview');
        const n = document.getElementById('colorName').value || 'Vorschau';
        const b = document.getElementById('colorBg').value;
        const t = document.getElementById('colorText').value;
        p.style.background = b; p.style.color = t; p.textContent = n;
    };
    ['colorName','colorBg','colorText'].forEach(fid => document.getElementById(fid).addEventListener('input', update));
}

async function saveColor(id) {
    const name = document.getElementById('colorName').value.trim();
    if (!name) { showToast('Bitte Name eingeben.', 'warning'); return; }
    const bg = document.getElementById('colorBg').value;
    const text = document.getElementById('colorText').value;
    const active = document.getElementById('colorActive').checked;

    // v1.19.58: Warnung wenn eine genutzte Farbe deaktiviert wird
    if (id && active === false) {
        const prev = (typeof getColor === 'function') ? getColor(id) : null;
        if (prev && prev.active !== false && !confirmDeactivation('Farbe', 'color', id, name, () => saveColor(id))) return;
    }

    try {
        if (id) {
            await db.collection('colors').doc(id).update({ name, bg, text, active });
        } else {
            const newId = slugifyId(name);
            const exists = await db.collection('colors').doc(newId).get();
            if (exists.exists) { showToast('Eine Farbe mit ähnlichem Namen existiert bereits.', 'warning'); return; }
            await db.collection('colors').doc(newId).set({
                name, bg, text, active,
                sortOrder: cachedColors.length
            });
        }
        await loadColors();
        renderColorsList();
        document.querySelector('.edit-overlay')?.remove();
        showToast('Farbe gespeichert.', 'success');
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deleteColor(id) {
    showConfirm('Farbe löschen?', 'Diese Farbe wird aus dem Katalog entfernt. Modelle und Materialien, die sie verwenden, müssen manuell angepasst werden.', 'Löschen', async () => {
        try {
            await db.collection('colors').doc(id).delete();
            await loadColors();
            renderColorsList();
            document.querySelector('.edit-overlay')?.remove();
            showToast('Farbe gelöscht.', 'success');
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// ═══ PLISSEE-FARBEN UI (v1.16.5) ═══
function renderPlisseeColorsList() {
    const el = document.getElementById('plisseeColorsList');
    if (!el) return;
    if (!cachedPlisseeColors.length) {
        el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:12px;text-align:center">Noch keine Plissee-Farben angelegt.<br><span style="font-size:11px">Klicke "+ Neue Plissee-Farbe" um z.B. Grün, Lila, Beige anzulegen.</span></div>';
        return;
    }
    el.innerHTML = cachedPlisseeColors.map(c => `
        <div onclick="openPlisseeColorForm('${c.id}')" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer">
            <div style="width:32px;height:32px;border-radius:8px;background:${c.bg};color:${c.text};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:1px solid var(--border-light)">P</div>
            <div style="flex:1;font-weight:600">${escHtml(c.name)}</div>
            <span style="font-size:11px;color:var(--text-muted)">${c.bg}</span>
            ${c.active === false ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white">INAKTIV</span>' : ''}
        </div>
    `).join('');
}

function openPlisseeColorForm(id) {
    const c = id ? getPlisseeColor(id) : { name: '', bg: '#86efac', text: '#14532d', active: true };
    if (id && !c) return;

    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal">
            <div class="edit-header">
                <span>${id ? 'Plissee-Farbe bearbeiten' : 'Neue Plissee-Farbe'}</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body">
                <div class="edit-field"><label>Name</label><input type="text" class="em-input" id="plisseeColorName" value="${escHtml(c.name)}" placeholder="z.B. Grün, Lila, Beige"></div>
                <div class="edit-field"><label>Hintergrundfarbe (Vorschau)</label><input type="color" class="em-input" id="plisseeColorBg" value="${c.bg || '#86efac'}"></div>
                <div class="edit-field"><label>Schriftfarbe (Vorschau)</label><input type="color" class="em-input" id="plisseeColorText" value="${c.text || '#14532d'}"></div>
                <div class="edit-field"><label class="checkbox-label"><input type="checkbox" id="plisseeColorActive" ${c.active !== false ? 'checked' : ''}> Aktiv (kann ausgewählt werden)</label></div>
                <div style="margin-top:12px;padding:10px;background:var(--bg-light);border-radius:8px;text-align:center">
                    <span id="plisseeColorPreview" style="display:inline-flex;padding:8px 18px;border-radius:8px;background:${c.bg};color:${c.text};font-weight:700;font-size:14px">${escHtml(c.name) || 'Vorschau'}</span>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5">
                    Die Farbe wird verwendet wenn die Variante "Plissee" oder "Kombi" gewählt ist. Lager und Schnittliste sind unabhängig — nur die Plissee-Stoff-Farbe.
                </div>
            </div>
            <div class="edit-footer">
                ${id ? `<button class="action-btn" style="background:var(--red);color:white" onclick="deletePlisseeColor('${id}')">Löschen</button>` : ''}
                <button class="action-btn primary" onclick="savePlisseeColor('${id || ''}')">Speichern</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const update = () => {
        const p = document.getElementById('plisseeColorPreview');
        const n = document.getElementById('plisseeColorName').value || 'Vorschau';
        const b = document.getElementById('plisseeColorBg').value;
        const t = document.getElementById('plisseeColorText').value;
        p.style.background = b; p.style.color = t; p.textContent = n;
    };
    ['plisseeColorName','plisseeColorBg','plisseeColorText'].forEach(fid => document.getElementById(fid).addEventListener('input', update));
}

async function savePlisseeColor(id) {
    const name = document.getElementById('plisseeColorName').value.trim();
    if (!name) { showToast('Bitte Name eingeben.', 'warning'); return; }
    const bg = document.getElementById('plisseeColorBg').value;
    const text = document.getElementById('plisseeColorText').value;
    const active = document.getElementById('plisseeColorActive').checked;

    // v1.19.58: Warnung wenn eine genutzte Plissee-Farbe deaktiviert wird
    if (id && active === false) {
        const prev = (typeof getPlisseeColor === 'function') ? getPlisseeColor(id) : null;
        if (prev && prev.active !== false && !confirmDeactivation('Plissee-Farbe', 'plisseeColor', id, name, () => savePlisseeColor(id))) return;
    }

    try {
        if (id) {
            await db.collection('plissee_colors').doc(id).update({ name, bg, text, active });
        } else {
            const newId = slugifyId(name);
            const exists = await db.collection('plissee_colors').doc(newId).get();
            if (exists.exists) { showToast('Eine Plissee-Farbe mit ähnlichem Namen existiert bereits.', 'warning'); return; }
            await db.collection('plissee_colors').doc(newId).set({
                name, bg, text, active,
                sortOrder: cachedPlisseeColors.length
            });
        }
        await loadPlisseeColors();
        renderPlisseeColorsList();
        document.querySelector('.edit-overlay')?.remove();
        showToast('Plissee-Farbe gespeichert.', 'success');
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deletePlisseeColor(id) {
    showConfirm('Plissee-Farbe löschen?', 'Die Plissee-Farbe wird aus dem Katalog entfernt. Bestellungen die diese Farbe nutzen behalten den Namen aber haben dann keinen Stammdaten-Eintrag mehr.', 'Löschen', async () => {
        try {
            await db.collection('plissee_colors').doc(id).delete();
            await loadPlisseeColors();
            renderPlisseeColorsList();
            document.querySelector('.edit-overlay')?.remove();
            showToast('Plissee-Farbe gelöscht.', 'success');
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// ═══ NETZ-FARBEN UI (v1.19.25) ═══
function renderNetzColorsList() {
    const el = document.getElementById('netzColorsList');
    if (!el) return;
    if (!cachedNetzColors.length) {
        el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:12px;text-align:center">Noch keine Netz-Farben angelegt.<br><span style="font-size:11px">Klicke "+ Neue Netz-Farbe" um z.B. Schwarz, Grau anzulegen.</span></div>';
        return;
    }
    el.innerHTML = cachedNetzColors.map(c => `
        <div onclick="openNetzColorForm('${c.id}')" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer">
            <div style="width:32px;height:32px;border-radius:8px;background:${c.bg};color:${c.text};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:1px solid var(--border-light)">N</div>
            <div style="flex:1;font-weight:600">${escHtml(c.name)}</div>
            <span style="font-size:11px;color:var(--text-muted)">${c.bg}</span>
            ${c.active === false ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white">INAKTIV</span>' : ''}
        </div>
    `).join('');
}

function openNetzColorForm(id) {
    const c = id ? getNetzColor(id) : { name: '', bg: '#1a1a1a', text: '#ffffff', active: true };
    if (id && !c) return;

    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal">
            <div class="edit-header">
                <span>${id ? 'Netz-Farbe bearbeiten' : 'Neue Netz-Farbe'}</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body">
                <div class="edit-field"><label>Name</label><input type="text" class="em-input" id="netzColorName" value="${escHtml(c.name)}" placeholder="z.B. Schwarz, Grau"></div>
                <div class="edit-field"><label>Hintergrundfarbe (Vorschau)</label><input type="color" class="em-input" id="netzColorBg" value="${c.bg || '#1a1a1a'}"></div>
                <div class="edit-field"><label>Schriftfarbe (Vorschau)</label><input type="color" class="em-input" id="netzColorText" value="${c.text || '#ffffff'}"></div>
                <div class="edit-field"><label class="checkbox-label"><input type="checkbox" id="netzColorActive" ${c.active !== false ? 'checked' : ''}> Aktiv (kann ausgewählt werden)</label></div>
                <div style="margin-top:12px;padding:10px;background:var(--bg-light);border-radius:8px;text-align:center">
                    <span id="netzColorPreview" style="display:inline-flex;padding:8px 18px;border-radius:8px;background:${c.bg};color:${c.text};font-weight:700;font-size:14px">${escHtml(c.name) || 'Vorschau'}</span>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5">
                    Die Farbe wird verwendet wenn die Variante "Netz" oder "Kombi" gewählt ist. Lager und Schnittliste sind unabhängig — nur die Netz-Stoff-Farbe.
                </div>
            </div>
            <div class="edit-footer">
                ${id ? `<button class="action-btn" style="background:var(--red);color:white" onclick="deleteNetzColor('${id}')">Löschen</button>` : ''}
                <button class="action-btn primary" onclick="saveNetzColor('${id || ''}')">Speichern</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const update = () => {
        const p = document.getElementById('netzColorPreview');
        const n = document.getElementById('netzColorName').value || 'Vorschau';
        const b = document.getElementById('netzColorBg').value;
        const t = document.getElementById('netzColorText').value;
        p.style.background = b; p.style.color = t; p.textContent = n;
    };
    ['netzColorName','netzColorBg','netzColorText'].forEach(fid => document.getElementById(fid).addEventListener('input', update));
}

async function saveNetzColor(id) {
    const name = document.getElementById('netzColorName').value.trim();
    if (!name) { showToast('Bitte Name eingeben.', 'warning'); return; }
    const bg = document.getElementById('netzColorBg').value;
    const text = document.getElementById('netzColorText').value;
    const active = document.getElementById('netzColorActive').checked;

    // v1.19.58: Warnung wenn eine genutzte Netz-Farbe deaktiviert wird
    if (id && active === false) {
        const prev = (typeof getNetzColor === 'function') ? getNetzColor(id) : null;
        if (prev && prev.active !== false && !confirmDeactivation('Netz-Farbe', 'netzColor', id, name, () => saveNetzColor(id))) return;
    }

    try {
        if (id) {
            await db.collection('netz_colors').doc(id).update({ name, bg, text, active });
        } else {
            const newId = slugifyId(name);
            const exists = await db.collection('netz_colors').doc(newId).get();
            if (exists.exists) { showToast('Eine Netz-Farbe mit ähnlichem Namen existiert bereits.', 'warning'); return; }
            await db.collection('netz_colors').doc(newId).set({
                name, bg, text, active,
                sortOrder: cachedNetzColors.length
            });
        }
        await loadNetzColors();
        renderNetzColorsList();
        document.querySelector('.edit-overlay')?.remove();
        showToast('Netz-Farbe gespeichert.', 'success');
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deleteNetzColor(id) {
    showConfirm('Netz-Farbe löschen?', 'Die Netz-Farbe wird aus dem Katalog entfernt. Bestellungen die diese Farbe nutzen behalten den Namen aber haben dann keinen Stammdaten-Eintrag mehr.', 'Löschen', async () => {
        try {
            await db.collection('netz_colors').doc(id).delete();
            await loadNetzColors();
            renderNetzColorsList();
            document.querySelector('.edit-overlay')?.remove();
            showToast('Netz-Farbe gelöscht.', 'success');
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// ═══ NETZ-BREITEN (v1.19.12) ═══
function renderNetzBreitenList() {
    const el = document.getElementById('netzBreitenList');
    if (!el) return;
    if (!cachedNetzBreiten.length) {
        el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:12px;text-align:center">Noch keine Netz-Breiten angelegt.<br><span style="font-size:11px">Klicke "+ Neue Breite" um z.B. 240, 300 cm anzulegen.</span></div>';
        return;
    }
    el.innerHTML = cachedNetzBreiten.map(b => `
        <div onclick="openNetzBreiteForm('${b.id}')" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer">
            <div style="width:42px;height:32px;border-radius:8px;background:var(--primary-bg);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:1px solid var(--primary)">${b.cm || '?'}</div>
            <div style="flex:1;font-weight:600">${escHtml(b.name || (b.cm + ' cm'))}</div>
            ${b.active === false ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white">INAKTIV</span>' : ''}
        </div>
    `).join('');
}

function openNetzBreiteForm(id) {
    const b = id ? getNetzBreite(id) : { name: '', cm: 240, active: true };
    if (id && !b) return;
    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal">
            <div class="edit-header">
                <span>${id ? 'Netz-Breite bearbeiten' : 'Neue Netz-Breite'}</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body">
                <div class="edit-field"><label>Breite (cm)</label><input type="number" class="em-input" id="netzBreiteCm" value="${b.cm || ''}" min="1" step="1" placeholder="z.B. 240"></div>
                <div class="edit-field"><label>Label (optional)</label><input type="text" class="em-input" id="netzBreiteName" value="${escHtml(b.name || '')}" placeholder="z.B. 240 cm Standard"></div>
                <div class="edit-field"><label class="checkbox-label"><input type="checkbox" id="netzBreiteActive" ${b.active !== false ? 'checked' : ''}> Aktiv (kann ausgewählt werden)</label></div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5">
                    Die Breite wird im Material-Editor zur Auswahl angeboten (bei Netz-/Plissee-Materialien). Beim Wareneingang berechnet sich m² aus Breite × Paket-Länge.
                </div>
            </div>
            <div class="edit-footer">
                ${id ? `<button class="action-btn" style="background:var(--red);color:white" onclick="deleteNetzBreite('${id}')">Löschen</button>` : ''}
                <button class="action-btn primary" onclick="saveNetzBreite('${id || ''}')">Speichern</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

async function saveNetzBreite(id) {
    const cm = parseInt(document.getElementById('netzBreiteCm').value) || 0;
    if (!cm || cm < 1) { showToast('Bitte Breite in cm eingeben.', 'warning'); return; }
    const name = (document.getElementById('netzBreiteName').value.trim()) || (cm + ' cm');
    const active = document.getElementById('netzBreiteActive').checked;
    try {
        if (id) {
            await db.collection('netz_breiten').doc(id).update({ cm, name, active });
        } else {
            const newId = slugifyId(name + '_' + cm);
            const exists = await db.collection('netz_breiten').doc(newId).get();
            if (exists.exists) { showToast('Eine Netz-Breite mit ähnlichem Namen existiert bereits.', 'warning'); return; }
            await db.collection('netz_breiten').doc(newId).set({
                cm, name, active,
                sortOrder: cachedNetzBreiten.length
            });
        }
        await loadNetzBreiten();
        renderNetzBreitenList();
        document.querySelector('.edit-overlay')?.remove();
        showToast('Netz-Breite gespeichert.', 'success');
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deleteNetzBreite(id) {
    showConfirm('Netz-Breite löschen?', 'Die Netz-Breite wird aus dem Katalog entfernt. Materialien die diese Breite nutzen verlieren die Zuordnung.', 'Löschen', async () => {
        try {
            await db.collection('netz_breiten').doc(id).delete();
            await loadNetzBreiten();
            renderNetzBreitenList();
            document.querySelector('.edit-overlay')?.remove();
            showToast('Netz-Breite gelöscht.', 'success');
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// v1.19.13: Migration — Netz-Breiten in Material-Dimensionen umziehen
async function migrateNetzBreitenToDimensions() {
    if (!isAdmin() && !isSuperAdmin()) { showToast('Nur Admin.', 'warning'); return; }
    if (!Array.isArray(cachedNetzBreiten) || !cachedNetzBreiten.length) {
        showToast('Keine Netz-Breiten zum Migrieren vorhanden.', 'info'); return;
    }

    showConfirm(
        'Netz-Breiten migrieren?',
        `${cachedNetzBreiten.length} Netz-Breite(n) werden nach Material-Dimensionen kopiert (Duplikate per Label übersprungen). Alle Materialien mit netzBreiten[] bekommen die entsprechenden Dimensionen ebenfalls verknüpft. Alte Daten bleiben als Backup erhalten — kannst Du danach manuell löschen.`,
        'Migrieren',
        async () => {
            try {
                // Mapping: alte netz_breiten-ID → neue material_dimensions-ID
                const idMap = {};
                // Aktuelle Material-Dimensions laden (frisch, damit User-Anlagen einbezogen werden)
                await loadMaterialDimensions();
                const existingLabels = new Map((cachedMaterialDimensions || []).map(d => [d.label, d.id]));

                let createdDims = 0;
                for (const nb of cachedNetzBreiten) {
                    const label = (nb.cm + ' cm');
                    if (existingLabels.has(label)) {
                        idMap[nb.id] = existingLabels.get(label);
                        continue;
                    }
                    // Neu anlegen
                    const newId = slugifyId(label);
                    const exists = await db.collection('material_dimensions').doc(newId).get();
                    let finalId = newId;
                    if (exists.exists) {
                        // ID-Kollision — Suffix anhängen
                        finalId = newId + '_' + Date.now();
                    }
                    await db.collection('material_dimensions').doc(finalId).set({
                        label,
                        scope: 'netz',
                        active: nb.active !== false,
                        sortOrder: (cachedMaterialDimensions.length + createdDims)
                    });
                    idMap[nb.id] = finalId;
                    existingLabels.set(label, finalId);
                    createdDims++;
                }

                // Materialien aktualisieren: netzBreiten[] → dimensions[] (UNION mit bestehenden)
                const matsSnap = await db.collection('materials').get();
                let updatedMats = 0;
                const batch = db.batch();
                matsSnap.docs.forEach(doc => {
                    const m = doc.data();
                    const nb = Array.isArray(m.netzBreiten) ? m.netzBreiten : [];
                    if (!nb.length) return;
                    const mapped = nb.map(id => idMap[id]).filter(Boolean);
                    if (!mapped.length) return;
                    const existingDims = Array.isArray(m.dimensions) ? m.dimensions : [];
                    const merged = [...new Set([...existingDims, ...mapped])];
                    if (merged.length === existingDims.length) return; // nichts Neues
                    batch.update(doc.ref, { dimensions: merged });
                    updatedMats++;
                });
                if (updatedMats) await batch.commit();

                await loadMaterialDimensions();
                renderMaterialDimensionsList();
                showToast(`Migration fertig: ${createdDims} Dimension(en) neu, ${updatedMats} Material(ien) verknüpft.`, 'success', 4000);
            } catch(e) {
                console.error('migrateNetzBreitenToDimensions:', e);
                showToast('Migration fehlgeschlagen: ' + e.message, 'error');
            }
        }
    );
}

// ═══ MATERIAL-DIMENSIONEN (v1.19.13) ═══
// Generische Größen-/Maß-Stammdaten — anwendbar auf ALLE Material-Typen
// (rolle, stange, stueck, netz, flaeche). Im Material-Editor wählt der
// Mitarbeiter beliebig viele Dimensionen aus; Lager+Wareneingang werden
// dann pro Material+Dimension getrennt geführt.
function renderMaterialDimensionsList() {
    const el = document.getElementById('materialDimensionsList');
    if (!el) return;
    if (!cachedMaterialDimensions.length) {
        el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:12px;text-align:center">Noch keine Material-Dimensionen angelegt.<br><span style="font-size:11px">Klicke "+ Neue Dimension" um z.B. 67×700, 14 mm, 350 cm anzulegen.</span></div>';
        return;
    }
    el.innerHTML = cachedMaterialDimensions.map(d => `
        <div onclick="openMaterialDimensionForm('${d.id}')" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer">
            <div style="min-width:60px;height:32px;border-radius:8px;background:var(--primary-bg);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:1px solid var(--primary);padding:0 10px">${escHtml(d.label || '?')}</div>
            <div style="flex:1">
                <div style="font-weight:600">${escHtml(d.label || '')}</div>
                ${d.scope && d.scope !== 'any' ? `<div style="font-size:10px;color:var(--text-muted)">${escHtml(d.scope)}</div>` : ''}
            </div>
            ${d.active === false ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white">INAKTIV</span>' : ''}
        </div>
    `).join('');
}

function openMaterialDimensionForm(id) {
    const d = id ? getMaterialDimension(id) : { label: '', scope: 'any', active: true };
    if (id && !d) return;
    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal">
            <div class="edit-header">
                <span>${id ? 'Dimension bearbeiten' : 'Neue Material-Dimension'}</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body">
                <div class="edit-field"><label>Label (Anzeigetext)</label><input type="text" class="em-input" id="matDimLabel" value="${escHtml(d.label || '')}" placeholder="z.B. 67×700, 14 mm, 350 cm"></div>
                <div class="edit-field"><label>Anwendungs-Hint (optional)</label>
                    <select id="matDimScope" class="em-input">
                        <option value="any" ${(!d.scope || d.scope === 'any') ? 'selected' : ''}>Alle Material-Typen</option>
                        <option value="netz" ${d.scope === 'netz' ? 'selected' : ''}>Nur Netz</option>
                        <option value="rolle" ${d.scope === 'rolle' ? 'selected' : ''}>Nur Rolle</option>
                        <option value="stange" ${d.scope === 'stange' ? 'selected' : ''}>Nur Stange</option>
                        <option value="stueck" ${d.scope === 'stueck' ? 'selected' : ''}>Nur Stück</option>
                    </select>
                </div>
                <div class="edit-field"><label class="checkbox-label"><input type="checkbox" id="matDimActive" ${d.active !== false ? 'checked' : ''}> Aktiv (kann ausgewählt werden)</label></div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5">
                    Erscheint im Material-Editor als Checkbox-Auswahl. Lager + Wareneingang werden pro angehakter Dimension getrennt geführt.
                </div>
            </div>
            <div class="edit-footer">
                ${id ? `<button class="action-btn" style="background:var(--red);color:white" onclick="deleteMaterialDimension('${id}')">Löschen</button>` : ''}
                <button class="action-btn primary" onclick="saveMaterialDimension('${id || ''}')">Speichern</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

async function saveMaterialDimension(id) {
    const label = (document.getElementById('matDimLabel').value || '').trim();
    if (!label) { showToast('Bitte Label eingeben.', 'warning'); return; }
    const scope = document.getElementById('matDimScope').value || 'any';
    const active = document.getElementById('matDimActive').checked;
    try {
        if (id) {
            await db.collection('material_dimensions').doc(id).update({ label, scope, active });
        } else {
            const newId = slugifyId(label);
            const exists = await db.collection('material_dimensions').doc(newId).get();
            if (exists.exists) { showToast('Eine Dimension mit ähnlichem Label existiert bereits.', 'warning'); return; }
            await db.collection('material_dimensions').doc(newId).set({
                label, scope, active,
                sortOrder: cachedMaterialDimensions.length
            });
        }
        await loadMaterialDimensions();
        renderMaterialDimensionsList();
        document.querySelector('.edit-overlay')?.remove();
        showToast('Dimension gespeichert.', 'success');
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deleteMaterialDimension(id) {
    showConfirm('Dimension löschen?', 'Die Dimension wird aus dem Katalog entfernt. Materialien die diese Dimension nutzen verlieren die Zuordnung.', 'Löschen', async () => {
        try {
            await db.collection('material_dimensions').doc(id).delete();
            await loadMaterialDimensions();
            renderMaterialDimensionsList();
            document.querySelector('.edit-overlay')?.remove();
            showToast('Dimension gelöscht.', 'success');
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// ═══ VARIANTEN (R1.6) ═══

function renderVariantsList() {
    const el = document.getElementById('variantsList');
    if (!el) return;
    if (!cachedVariants.length) {
        el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:12px;text-align:center">Noch keine Varianten angelegt.</div>';
        return;
    }
    el.innerHTML = cachedVariants.map(v => `
        <div onclick="openVariantForm('${v.id}')" style="padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer">
            <div style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:700;font-size:14px">${escHtml(v.name)}</span>
                ${v.active === false ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white">INAKTIV</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
                ${(v.options || []).map(o => escHtml(o.label) + (o.id === v.defaultOption ? ' ★' : '')).join(' · ')}
            </div>
        </div>
    `).join('');
}

function openVariantForm(id) {
    const v = id ? getVariant(id) : { name: '', options: [{ id: '', label: '', arrow: '' }], defaultOption: '', active: true };
    if (id && !v) return;
    window._editVariantOptions = JSON.parse(JSON.stringify(v.options || []));

    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal" style="max-width:520px">
            <div class="edit-header">
                <span>${id ? 'Variante bearbeiten' : 'Neue Variante'}</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body">
                <div class="edit-field"><label>Name</label><input type="text" class="em-input" id="variantName" value="${escHtml(v.name)}" placeholder="z.B. Türart, Plissee, Öffnungsrichtung"></div>
                <div class="edit-field"><label class="checkbox-label"><input type="checkbox" id="variantActive" ${v.active !== false ? 'checked' : ''}> Aktiv</label></div>
                <div class="edit-field">
                    <label>Optionen</label>
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Auswahlmöglichkeiten dieser Variante. ★ = Default.</div>
                    <div id="variantOptionsList"></div>
                    <button type="button" onclick="addVariantOption()" style="margin-top:6px;padding:8px 12px;font-size:12px;background:var(--primary-bg);color:var(--primary);border:1px solid var(--primary);border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit">+ Option hinzufügen</button>
                </div>
            </div>
            <div class="edit-footer">
                ${id ? `<button class="action-btn" style="background:var(--red);color:white" onclick="deleteVariant('${id}')">Löschen</button>` : ''}
                <button class="action-btn primary" onclick="saveVariant('${id || ''}')">Speichern</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    renderVariantOptionsList(v.defaultOption);
}

function renderVariantOptionsList(defaultOptionId) {
    const el = document.getElementById('variantOptionsList');
    if (!el) return;
    const last = window._editVariantOptions.length - 1;
    el.innerHTML = window._editVariantOptions.map((o, i) => `
        <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;padding:6px;border:1px solid var(--border-light);border-radius:8px">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap">
                <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
                    <button type="button" onclick="moveVariantOption(${i}, -1)" ${i===0?'disabled':''} style="padding:1px 5px;background:var(--border-light);border:none;border-radius:4px;font-size:10px;cursor:pointer;${i===0?'opacity:0.3':''}">▲</button>
                    <button type="button" onclick="moveVariantOption(${i}, 1)" ${i===last?'disabled':''} style="padding:1px 5px;background:var(--border-light);border:none;border-radius:4px;font-size:10px;cursor:pointer;${i===last?'opacity:0.3':''}">▼</button>
                </div>
                <input type="radio" name="defaultOpt" ${o.id && o.id === defaultOptionId ? 'checked' : ''} onchange="window._editVariantDefault='${o.id}'" title="Default-Option" style="flex-shrink:0;width:18px;height:18px">
                <input type="text" value="${escHtml(o.label || '')}" placeholder="Label (z.B. Einzeltür)"
                    oninput="window._editVariantOptions[${i}].label=this.value; if(!window._editVariantOptions[${i}].id||window._editVariantOptions[${i}]._autoId) { window._editVariantOptions[${i}].id=slugifyId(this.value); window._editVariantOptions[${i}]._autoId=true; }"
                    style="flex:1 1 auto;min-width:0;width:100%;padding:8px 10px;font-size:13px;border:2px solid var(--border);border-radius:6px;font-family:inherit;background:var(--card);box-sizing:border-box">
                <input type="text" value="${escHtml(o.arrow || '')}" placeholder="→"
                    oninput="window._editVariantOptions[${i}].arrow=this.value"
                    title="Pfeilsymbol für Grafik (z.B. → ← ↓ ↑ →←)"
                    style="flex-shrink:0;width:48px;padding:8px 6px;font-size:13px;text-align:center;border:2px solid var(--border);border-radius:6px;font-family:inherit;background:var(--card);box-sizing:border-box">
                <button type="button" onclick="window._editVariantOptions.splice(${i},1);renderVariantOptionsList(window._editVariantDefault)" style="flex-shrink:0;padding:6px 10px;background:var(--red);color:white;border:none;border-radius:6px;cursor:pointer;font-family:inherit">×</button>
            </div>
            <label class="checkbox-label" style="font-size:11px;color:var(--text-muted);padding-left:30px">
                <input type="checkbox" ${o.netzFollowup ? 'checked' : ''}
                    onchange="window._editVariantOptions[${i}].netzFollowup=this.checked">
                <span>Bei dieser Option Netz-Farb-Auswahl abfragen</span>
            </label>
            <label class="checkbox-label" style="font-size:11px;color:var(--text-muted);padding-left:30px">
                <input type="checkbox" ${o.plisseeFollowup ? 'checked' : ''}
                    onchange="window._editVariantOptions[${i}].plisseeFollowup=this.checked">
                <span>Bei dieser Option Plissee-Farb-Auswahl abfragen</span>
            </label>
            <label class="checkbox-label" style="font-size:11px;color:var(--text-muted);padding-left:30px">
                <input type="checkbox" ${o.nurDoppeltuer ? 'checked' : ''}
                    onchange="window._editVariantOptions[${i}].nurDoppeltuer=this.checked">
                <span>Nur bei Doppeltür anzeigen (z.B. für Kombi)</span>
            </label>
        </div>
    `).join('');
    window._editVariantDefault = defaultOptionId || (window._editVariantOptions[0]?.id || '');
}

function addVariantOption() {
    window._editVariantOptions.push({ id: '', label: '', arrow: '' });
    renderVariantOptionsList(window._editVariantDefault);
}

function moveVariantOption(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= window._editVariantOptions.length) return;
    [window._editVariantOptions[i], window._editVariantOptions[j]] = [window._editVariantOptions[j], window._editVariantOptions[i]];
    renderVariantOptionsList(window._editVariantDefault);
}

async function saveVariant(id) {
    const name = document.getElementById('variantName').value.trim();
    if (!name) { showToast('Bitte Name eingeben.', 'warning'); return; }

    const options = (window._editVariantOptions || [])
        .map(o => ({
            id: (o.id || '').trim() || slugifyId(o.label),
            label: (o.label || '').trim(),
            arrow: o.arrow || '',
            netzFollowup: !!o.netzFollowup,
            plisseeFollowup: !!o.plisseeFollowup,
            nurDoppeltuer: !!o.nurDoppeltuer
        }))
        .filter(o => o.label);
    if (!options.length) { showToast('Mindestens eine Option erforderlich.', 'warning'); return; }

    const seen = new Set();
    for (const o of options) {
        if (seen.has(o.id)) { showToast(`Option-ID "${o.id}" ist doppelt.`, 'warning'); return; }
        seen.add(o.id);
    }

    const defaultOption = options.find(o => o.id === window._editVariantDefault) ? window._editVariantDefault : options[0].id;
    const active = document.getElementById('variantActive').checked;

    // v1.19.58: Warnung wenn eine genutzte Variante deaktiviert wird
    if (id && active === false) {
        const prev = (typeof getVariant === 'function') ? getVariant(id) : null;
        if (prev && prev.active !== false && !confirmDeactivation('Variante', 'variant', id, name, () => saveVariant(id))) return;
    }

    const data = { name, options, defaultOption, active };

    try {
        if (id) {
            await db.collection('variants').doc(id).update(data);
        } else {
            const newId = slugifyId(name);
            const exists = await db.collection('variants').doc(newId).get();
            if (exists.exists) { showToast('Eine Variante mit ähnlichem Namen existiert bereits.', 'warning'); return; }
            data.sortOrder = cachedVariants.length;
            await db.collection('variants').doc(newId).set(data);
        }
        await loadVariants();
        renderVariantsList();
        document.querySelector('.edit-overlay')?.remove();
        showToast('Variante gespeichert.', 'success');
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deleteVariant(id) {
    const usingModels = cachedModels.filter(m => (m.variantIds || []).includes(id));
    if (usingModels.length) {
        showToast(`Variante wird in ${usingModels.length} Modell(en) verwendet. Erst dort entfernen.`, 'warning');
        return;
    }
    showConfirm('Variante löschen?', 'Diese Variante wird aus dem Katalog entfernt.', 'Löschen', async () => {
        try {
            await db.collection('variants').doc(id).delete();
            await loadVariants();
            renderVariantsList();
            document.querySelector('.edit-overlay')?.remove();
            showToast('Variante gelöscht.', 'success');
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// ═══ MODELLE (R1.7) ═══

function renderModelsList() {
    const el = document.getElementById('modelsList');
    if (!el) return;
    if (!cachedModels.length) {
        el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:12px;text-align:center">Noch keine Modelle angelegt.</div>';
        return;
    }
    el.innerHTML = cachedModels.map(m => `
        <div onclick="openModelForm('${m.id}')" style="padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer">
            <div style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:700;font-size:14px">${escHtml(m.name)}</span>
                ${m.default ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--primary);color:white">DEFAULT</span>' : ''}
                ${m.active === false ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white">INAKTIV</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escHtml(m.description || '')}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
                ${(m.variantIds || []).map(vid => { const v = getVariant(vid); return v ? escHtml(v.name) : '?'; }).join(' · ') || 'Keine Varianten'}
            </div>
        </div>
    `).join('');
}

function openModelForm(id) {
    const m = id ? getModel(id) : {
        name: '', description: '', active: true, default: false,
        forcedDoppeltuer: null, variantIds: [],
        sections: [{ id: 'default', name: '', materials: [] }],
        conditionalMaterials: [],
        pricing: { minSqmPriceEinzeltuer: 0, minSqmPriceDoppeltuer: 0, defaultSqmPriceEinzeltuer: 25, defaultSqmPriceDoppeltuer: 60 },
        colors: [], defaultColor: '',
        measureLimits: { minBreite: 30, maxBreite: 250, minHoehe: 50, maxHoehe: 280 },
        graphic: { type: 'rectangle_with_arrows', arrowsFromVariant: '' }
    };
    if (id && !m) return;

    const variantsHtml = cachedVariants.filter(v => v.active !== false).map(v => `
        <label class="checkbox-label" style="padding:6px 0;margin-bottom:0">
            <input type="checkbox" class="model-variant-cb" value="${v.id}" ${(m.variantIds||[]).includes(v.id)?'checked':''} onchange="onModelVariantToggle('${v.id}',this.checked)">
            ${escHtml(v.name)} <span class="hint">(${(v.options||[]).map(o=>escHtml(o.label)).join(' / ')})</span>
        </label>
    `).join('') || '<div style="font-size:12px;color:var(--text-muted);padding:8px">Erst Varianten anlegen.</div>';

    const colorsHtml = cachedColors.filter(c => c.active !== false).map(c => `
        <label class="checkbox-label" style="padding:4px 0;margin-bottom:0">
            <input type="checkbox" class="model-color-cb" value="${c.id}" ${(m.colors||[]).includes(c.id)?'checked':''}>
            <span style="display:inline-flex;padding:2px 10px;border-radius:6px;background:${c.bg};color:${c.text};font-size:12px;font-weight:600">${escHtml(c.name)}</span>
        </label>
    `).join('') || '<div style="font-size:12px;color:var(--text-muted);padding:8px">Erst Farben anlegen.</div>';

    const defaultColorOptions = cachedColors.filter(c => c.active !== false).map(c =>
        `<option value="${c.id}" ${m.defaultColor===c.id?'selected':''}>${escHtml(c.name)}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal" style="max-width:600px">
            <div class="edit-header">
                <span>${id ? 'Modell bearbeiten' : 'Neues Modell'}</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body">
                <div class="edit-field"><label>Name</label><input type="text" class="em-input" id="modelName" value="${escHtml(m.name)}" placeholder="z.B. Klassik, Schwellenlos, Kombi"></div>
                <div class="edit-field"><label>Beschreibung</label><input type="text" class="em-input" id="modelDesc" value="${escHtml(m.description||'')}" placeholder="kurze Beschreibung"></div>
                <div class="edit-field">
                    <label>Modell-Farbe <span class="hint">(Header in Schnittliste/PDF — hilft bei mehreren Modellen)</span></label>
                    <div style="display:flex;align-items:center;gap:10px">
                        <input type="color" class="em-input" id="modelColor" value="${(m.color || '#534AB7')}" style="width:60px;height:38px;padding:2px;cursor:pointer">
                        <span id="modelColorPreview" style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:8px;background:${m.color || '#534AB7'};color:#fff;font-weight:700;font-size:13px">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                            ${t('Modell:')} ${escHtml(m.name || 'Vorschau')}
                        </span>
                        <button type="button" onclick="document.getElementById('modelColor').value='';document.getElementById('modelColor').dispatchEvent(new Event('input'))" style="padding:6px 10px;font-size:11px;background:var(--border-light);color:var(--text-secondary);border:none;border-radius:6px;cursor:pointer;font-family:inherit">Default</button>
                    </div>
                </div>
                <div class="edit-field"><label class="checkbox-label"><input type="checkbox" id="modelActive" ${m.active!==false?'checked':''}> Aktiv</label></div>
                <div class="edit-field"><label class="checkbox-label"><input type="checkbox" id="modelDefault" ${m.default?'checked':''}> Default-Modell <span class="hint">(bei neuer Bestellung vorausgewählt – nur eines)</span></label></div>

                <div class="edit-field">
                    <label>Türart-Vorgabe</label>
                    <select class="em-input" id="modelForcedDt">
                        <option value="null" ${m.forcedDoppeltuer===null||m.forcedDoppeltuer===undefined?'selected':''}>Mitarbeiter wählt (per Variante)</option>
                        <option value="false" ${m.forcedDoppeltuer===false?'selected':''}>Immer Einzeltür</option>
                        <option value="true" ${m.forcedDoppeltuer===true?'selected':''}>Immer Doppeltür</option>
                    </select>
                </div>

                <div class="edit-field">
                    <label>Varianten bei Erfassung abfragen</label>
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Welche Varianten soll der Mitarbeiter pro Maß auswählen?</div>
                    <div id="modelVariantsBlock">${variantsHtml}</div>
                </div>

                <div class="edit-field"><label>Preise (€/m²) — Vorschlag pro Türart</label>
                    <div style="display:flex;gap:8px;margin-top:4px">
                        <div style="flex:1"><div style="font-size:11px;color:var(--text-muted)">Vorschlag Einzeltür</div><input type="number" class="em-input" id="priceDefaultE" value="${m.pricing?.defaultSqmPriceEinzeltuer||0}" step="0.01"></div>
                        <div style="flex:1"><div style="font-size:11px;color:var(--text-muted)">Vorschlag Doppeltür</div><input type="number" class="em-input" id="priceDefaultD" value="${m.pricing?.defaultSqmPriceDoppeltuer||0}" step="0.01"></div>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:6px">
                        <div style="flex:1"><div style="font-size:11px;color:var(--text-muted)">Min Einzeltür</div><input type="number" class="em-input" id="priceMinE" value="${m.pricing?.minSqmPriceEinzeltuer||0}" step="0.01"></div>
                        <div style="flex:1"><div style="font-size:11px;color:var(--text-muted)">Min Doppeltür</div><input type="number" class="em-input" id="priceMinD" value="${m.pricing?.minSqmPriceDoppeltuer||0}" step="0.01"></div>
                    </div>
                </div>

                <!-- v1.19.27: Preis-Matrix nach Türart × Netz/Plissee. Überschreibt die Vorschläge oben wenn gesetzt. -->
                <div class="edit-field"><label>Preise je Variante (Türart × Netz/Plissee) — überschreibt Vorschlag oben</label>
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Bei Auswahl der Variante wird automatisch der passende Preis vorgeschlagen. Leer lassen wenn ein Vorschlag oben genügt.</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                        <div style="background:var(--bg-light);padding:8px;border-radius:8px;border:1px solid var(--border-light)">
                            <div style="font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Einzeltür</div>
                            <div style="display:flex;flex-direction:column;gap:4px">
                                <label style="font-size:11px;display:flex;flex-direction:column;gap:2px"><span>+ Netz</span><input type="number" class="em-input" id="priceMatrixEinzelNetz" value="${m.pricing?.matrix?.einzel?.netz ?? ''}" step="0.5" placeholder="z.B. 48"></label>
                                <label style="font-size:11px;display:flex;flex-direction:column;gap:2px"><span>+ Plisseestoff</span><input type="number" class="em-input" id="priceMatrixEinzelPlisee" value="${m.pricing?.matrix?.einzel?.plisee ?? ''}" step="0.5" placeholder="z.B. 84"></label>
                            </div>
                        </div>
                        <div style="background:var(--bg-light);padding:8px;border-radius:8px;border:1px solid var(--border-light)">
                            <div style="font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Doppeltür</div>
                            <div style="display:flex;flex-direction:column;gap:4px">
                                <label style="font-size:11px;display:flex;flex-direction:column;gap:2px"><span>+ Netz</span><input type="number" class="em-input" id="priceMatrixDoppelNetz" value="${m.pricing?.matrix?.doppel?.netz ?? ''}" step="0.5" placeholder="z.B. 60"></label>
                                <label style="font-size:11px;display:flex;flex-direction:column;gap:2px"><span>+ Plissee/Kombi</span><input type="number" class="em-input" id="priceMatrixDoppelPlisee" value="${m.pricing?.matrix?.doppel?.plisee ?? ''}" step="0.5" placeholder="z.B. 99"></label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="edit-field">
                    <label>Erlaubte Farben</label>
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Welche Farben kann der Mitarbeiter bei diesem Modell wählen?</div>
                    <div id="modelColorsBlock">${colorsHtml}</div>
                    ${defaultColorOptions ? `<label style="display:block;margin-top:8px;font-size:12px">Default-Farbe: <select class="em-input" id="modelDefaultColor"><option value="">— keine —</option>${defaultColorOptions}</select></label>` : ''}
                </div>

                <div class="edit-field"><label>Maß-Grenzen (cm)</label>
                    <div style="display:flex;gap:8px;margin-top:4px">
                        <div style="flex:1"><div style="font-size:11px;color:var(--text-muted)">Min Breite</div><input type="number" class="em-input" id="limMinB" value="${m.measureLimits?.minBreite||30}" step="1"></div>
                        <div style="flex:1"><div style="font-size:11px;color:var(--text-muted)">Max Breite</div><input type="number" class="em-input" id="limMaxB" value="${m.measureLimits?.maxBreite||250}" step="1"></div>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:6px">
                        <div style="flex:1"><div style="font-size:11px;color:var(--text-muted)">Min Höhe</div><input type="number" class="em-input" id="limMinH" value="${m.measureLimits?.minHoehe||50}" step="1"></div>
                        <div style="flex:1"><div style="font-size:11px;color:var(--text-muted)">Max Höhe</div><input type="number" class="em-input" id="limMaxH" value="${m.measureLimits?.maxHoehe||280}" step="1"></div>
                    </div>
                </div>

                <div class="edit-field">
                    <label style="display:flex;align-items:center;justify-content:space-between">
                        <span>Schnittliste</span>
                        <button type="button" onclick="resetModelCutListFromMaterials()" style="padding:5px 10px;font-size:11px;background:var(--border-light);color:var(--text-secondary);border:none;border-radius:6px;cursor:pointer;font-family:inherit" title="Übernimmt aktuelle Cuts aus den Materialien (nur leere Schnittliste)">Aus Materialien übernehmen</button>
                    </label>
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Materialien mit Schnittmaßen für dieses Modell. Reihenfolge per ▲▼.</div>
                    <div id="modelCutsList" style="margin-bottom:6px"></div>
                    <button type="button" onclick="openMaterialPickerForModel()" style="padding:8px 12px;font-size:12px;background:var(--primary-bg);color:var(--primary);border:1px solid var(--primary);border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit">+ Material hinzufügen</button>
                </div>

                <!-- v1.18.20: Webshop-Felder -->
                <div class="edit-field" style="border-top:2px solid var(--border-light);padding-top:14px;margin-top:14px">
                    <label class="checkbox-label" style="font-size:14px;font-weight:700;color:var(--text);text-transform:none;letter-spacing:0">
                        <input type="checkbox" id="modelWebshopActive" ${m.webshopActive ? 'checked' : ''}>
                        🛒 Im Webshop verfügbar
                    </label>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;margin-left:24px">Wenn aktiv, kann dieses Modell im Online-Shop bestellt werden.</div>
                </div>

                <div class="edit-field">
                    <label>Webshop-Beschreibung</label>
                    <textarea class="em-input" id="modelWebshopShortDesc" rows="6" placeholder="Beschreibung für die Modell-Karte im Webshop. Tipp: Punkte mit * am Anfang jeder Zeile für Listen-Bullets." style="resize:vertical;font-family:inherit;line-height:1.5">${escHtml(m.webshopShortDescription || '')}</textarea>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Wird auf der Webshop-Modell-Auswahl unter dem Modellnamen angezeigt. Zeilenumbrüche und <code>*</code>-Bullets werden übernommen.</div>
                </div>

                <div class="edit-field">
                    <label>Webshop-Maßgrenzen (cm)</label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
                        <input type="number" class="em-input" id="modelWebshopMinBreite" value="${m.webshopMinBreite || (m.measureLimits && m.measureLimits.minBreite) || 30}" placeholder="Min Breite" min="1">
                        <input type="number" class="em-input" id="modelWebshopMaxBreite" value="${m.webshopMaxBreite || (m.measureLimits && m.measureLimits.maxBreite) || 250}" placeholder="Max Breite" min="1">
                        <input type="number" class="em-input" id="modelWebshopMinHoehe" value="${m.webshopMinHoehe || (m.measureLimits && m.measureLimits.minHoehe) || 50}" placeholder="Min Höhe" min="1">
                        <input type="number" class="em-input" id="modelWebshopMaxHoehe" value="${m.webshopMaxHoehe || (m.measureLimits && m.measureLimits.maxHoehe) || 280}" placeholder="Max Höhe" min="1">
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Min Breite – Max Breite × Min Höhe – Max Höhe. Standardmäßig aus Modell-Grenzen übernommen.</div>
                </div>

                <!-- v1.19.2: Webshop-Bilder -->
                <div class="edit-field">
                    <label>📸 Webshop-Bilder</label>
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">
                        Erstes Bild = Hauptbild. Mit ▲▼ sortieren. Bilder werden automatisch komprimiert (max. 1600 px).
                        ${!id ? '<br><strong>Hinweis:</strong> Bitte zuerst das Modell speichern, dann Bilder hochladen.' : ''}
                    </div>
                    <div id="modelImagesList" style="margin-bottom:8px"></div>
                    <input type="file" id="modelImageUpload" accept="image/*" multiple style="display:none" onchange="onModelImageUpload(event)">
                    <button type="button" onclick="document.getElementById('modelImageUpload').click()" ${!id ? 'disabled' : ''} style="padding:8px 12px;font-size:12px;background:var(--primary-bg);color:var(--primary);border:1px solid var(--primary);border-radius:8px;font-weight:600;cursor:${id ? 'pointer' : 'not-allowed'};font-family:inherit;opacity:${id ? '1' : '0.5'}">+ Bilder hochladen</button>
                </div>
            </div>
            <div class="edit-footer">
                ${id ? `<button class="action-btn" style="background:var(--red);color:white" onclick="deleteModel('${id}')">Löschen</button>` : ''}
                <button class="action-btn primary" onclick="saveModel('${id || ''}')">Speichern</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    // v1.19.22: Live-Preview vom Modell-Farb-Picker
    const _mc = document.getElementById('modelColor');
    const _mp = document.getElementById('modelColorPreview');
    const _mn = document.getElementById('modelName');
    const _updatePrev = () => {
        const c = (_mc.value || '#534AB7');
        _mp.style.background = c;
        const name = (_mn.value || 'Vorschau').trim();
        _mp.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg> Modell: ${name.replace(/[<>&"]/g,s=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[s]))}`;
    };
    if (_mc) _mc.addEventListener('input', _updatePrev);
    if (_mn) _mn.addEventListener('input', _updatePrev);
    // Schnittliste in window-Variable und rendern (v1.14.0)
    window._editModelMaterials = JSON.parse(JSON.stringify((m.sections && m.sections[0] && m.sections[0].materials) || []));
    // Variant-IDs des Modells für Cut-Bedingungen verfügbar machen (v1.16.7)
    window._editModelVariantIds = JSON.parse(JSON.stringify(m.variantIds || []));
    // Webshop-Bilder verwalten (v1.19.2): { url, path, sortOrder }
    window._editModelImages = JSON.parse(JSON.stringify(Array.isArray(m.images) ? m.images : []));
    window._editModelId = id || null;
    setTimeout(renderModelImagesList, 50);
    // Materialien laden falls Cache leer (z.B. wenn man direkt nach Login in Settings geht)
    if (!cachedMaterials || cachedMaterials.length === 0) {
        loadRechnerMaterials().then(() => renderModelCutsList()).catch(() => renderModelCutsList());
    } else {
        renderModelCutsList();
    }
}


// ═══ MODELL-SCHNITTLISTE-EDITOR (v1.14.0) ═══

const CUT_BASIS_OPTIONS = [
    { value: 'breite',     label: 'Breite' },
    { value: 'hoehe',      label: 'Höhe' },
    { value: 'tuel_adet',  label: 'Tül-Adet (für Netz)' }
];

// v1.19.46: Multi-Select Chips für Material- und Cut-Bedingungen.
// Eine Bedingung bindet an EINE Variante (variantId) und beliebig viele Optionen
// (optionIds[]) — OR-verknüpft. Wechsel der Variante = bisherige Auswahl wird
// ersetzt (das Modell unterstützt nur eine Variante pro Bedingung).
function _currentCondOptionIds(condition) {
    if (!condition) return [];
    if (Array.isArray(condition.optionIds)) return condition.optionIds.slice();
    if (condition.optionId) return [condition.optionId];
    return [];
}
function _toggleCondition(existing, variantId, optionId) {
    // existing: undefined | {variantId, optionId} | {variantId, optionIds[]}
    // Klick auf eine Option:
    //  - andere Variante → ersetzen, Liste startet mit dieser einen Option
    //  - gleiche Variante, neue Option → hinzufügen
    //  - gleiche Variante, bestehende Option → entfernen
    //  - leere Liste → Bedingung löschen (= "immer anzeigen")
    if (!existing || existing.variantId !== variantId) {
        return { variantId, optionIds: [optionId] };
    }
    let ids = _currentCondOptionIds(existing);
    if (ids.includes(optionId)) ids = ids.filter(x => x !== optionId);
    else ids.push(optionId);
    if (!ids.length) return null;
    return { variantId, optionIds: ids };
}
function _renderCondChips(condition, conditionOptions, handlerCall) {
    // condition: undefined | {variantId, optionId | optionIds[]}
    // conditionOptions: [{variantId, variantName, optionId, optionLabel, ...}]
    // handlerCall: z.B. "toggleMatCondChip(3," — wird ergänzt um "'vid','oid')"
    const curVid = condition?.variantId || '';
    const curIds = _currentCondOptionIds(condition);
    const groups = new Map();
    conditionOptions.forEach(co => {
        if (!groups.has(co.variantId)) groups.set(co.variantId, { name: co.variantName, opts: [] });
        groups.get(co.variantId).opts.push(co);
    });
    let html = curVid
        ? ''
        : '<span style="font-size:10px;color:var(--text-muted);font-style:italic;align-self:center">— immer anzeigen —</span>';
    groups.forEach((info, vid) => {
        const isActive = curVid === vid;
        const groupOpacity = (!curVid || isActive) ? '1' : '0.45';
        html += `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;opacity:${groupOpacity}">
            <span style="font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.04em">${escHtml(info.name)}:</span>`;
        info.opts.forEach(co => {
            const sel = isActive && curIds.includes(co.optionId);
            const bg = sel ? 'var(--primary)' : 'white';
            const color = sel ? 'white' : 'var(--text)';
            const border = sel ? 'var(--primary)' : 'var(--border)';
            html += `<button type="button" onclick="${handlerCall}'${esc(co.variantId)}','${esc(co.optionId)}')"
                title="${escHtml(info.name)} = ${escHtml(co.optionLabel)}"
                style="padding:3px 10px;font-size:11px;background:${bg};color:${color};border:1px solid ${border};border-radius:14px;cursor:pointer;font-family:inherit;font-weight:${sel?'700':'500'}">${escHtml(co.optionLabel)}</button>`;
        });
        html += '</div>';
    });
    return html;
}

function renderModelCutsList() {
    const el = document.getElementById('modelCutsList');
    if (!el) return;
    const mats = window._editModelMaterials || [];

    // Verfügbare Bedingungen aus Modell-Varianten (v1.16.7)
    // v1.19.46: zusätzlich variantId/variantName/optionId/optionLabel separat —
    // damit Chip-Multi-Select gruppiert pro Variante rendern kann.
    const modelVariantIds = window._editModelVariantIds || [];
    const conditionOptions = [];
    modelVariantIds.forEach(vid => {
        const variant = getVariant(vid);
        if (!variant) return;
        (variant.options || []).forEach(opt => {
            conditionOptions.push({
                value: vid + '::' + opt.id,
                label: variant.name + ' = ' + opt.label,
                variantId: vid,
                variantName: variant.name,
                optionId: opt.id,
                optionLabel: opt.label
            });
        });
    });

    if (!mats.length) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:10px;text-align:center;background:var(--bg-light);border-radius:8px">Keine Materialien in der Schnittliste. Klicke "+ Material hinzufügen".</div>';
        return;
    }
    const last = mats.length - 1;
    el.innerHTML = mats.map((mm, mi) => {
        const matInfo = cachedMaterials.find(cm => cm.id === mm.materialId);
        const matName = matInfo ? matInfo.name : `(unbekannt: ${mm.materialId})`;
        const matType = matInfo ? matInfo.type : '';

        const cutsHtml = (mm.cuts || []).map((cut, ci) => {
            // v1.19.46: Chip-Liste statt Dropdown
            const cutCondChipsHtml = _renderCondChips(cut.condition, conditionOptions, `toggleCutCondChip(${mi},${ci},`);

            // Overrides (v1.16.8)
            const overrides = cut.overrides || [];
            const overridesExpanded = !!cut._expanded;
            const overridesHtml = overrides.map((ov, oi) => {
                const ovValue = ov.when ? (ov.when.variantId + '::' + ov.when.optionId) : '';
                const ovDropdownOpts = '<option value="">— wann? —</option>' +
                    conditionOptions.map(co => `<option value="${esc(co.value)}" ${ovValue === co.value ? 'selected' : ''}>${escHtml(co.label)}</option>`).join('');
                const v = ov.values || {};
                return `<div style="display:flex;gap:4px;align-items:center;margin-top:4px;padding:5px;background:#fef3c7;border:1px solid #f59e0b;border-radius:5px">
                    <select onchange="updateOverrideWhen(${mi},${ci},${oi},this.value)"
                        style="flex:1;min-width:0;padding:5px 4px;font-size:11px;border:1px solid var(--border);border-radius:4px;font-family:inherit;background:white">
                        ${ovDropdownOpts}
                    </select>
                    <input type="number" inputmode="decimal" step="0.1" value="${v.abzug !== undefined ? v.abzug : ''}" placeholder="Abzug"
                        oninput="updateOverrideValue(${mi},${ci},${oi},'abzug',this.value)"
                        style="flex-shrink:0;width:55px;padding:5px 4px;font-size:11px;text-align:center;border:1px solid var(--border);border-radius:4px;font-family:inherit;background:white;box-sizing:border-box" title="Abzug überschreiben (leer = wie Standard)">
                    <input type="number" inputmode="numeric" step="1" min="1" value="${v.stueck !== undefined ? v.stueck : ''}" placeholder="Stk"
                        oninput="updateOverrideValue(${mi},${ci},${oi},'stueck',this.value)"
                        style="flex-shrink:0;width:38px;padding:5px 4px;font-size:11px;text-align:center;border:1px solid var(--border);border-radius:4px;font-family:inherit;background:white;box-sizing:border-box" title="Stk überschreiben">
                    <input type="number" inputmode="numeric" step="1" min="1" value="${v.doppeltuerFaktor !== undefined ? v.doppeltuerFaktor : ''}" placeholder="DT"
                        oninput="updateOverrideValue(${mi},${ci},${oi},'doppeltuerFaktor',this.value)"
                        style="flex-shrink:0;width:38px;padding:5px 4px;font-size:11px;text-align:center;border:1px solid var(--border);border-radius:4px;font-family:inherit;background:white;box-sizing:border-box" title="DT-Faktor überschreiben">
                    <button type="button" onclick="window._editModelMaterials[${mi}].cuts[${ci}].overrides.splice(${oi},1);renderModelCutsList()" style="flex-shrink:0;padding:4px 6px;background:var(--red);color:white;border:none;border-radius:4px;cursor:pointer;font-size:10px;font-family:inherit">×</button>
                </div>`;
            }).join('');

            return `
            <div style="margin-bottom:4px;padding:6px;background:var(--card);border:1px solid var(--border-light);border-radius:6px">
                <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
                    <input type="text" value="${escHtml(cut.label || '')}" placeholder="Label"
                        oninput="window._editModelMaterials[${mi}].cuts[${ci}].label=this.value"
                        style="flex:1 1 auto;min-width:0;padding:6px 8px;font-size:12px;border:1px solid var(--border);border-radius:5px;font-family:inherit;background:var(--card);box-sizing:border-box">
                    <select onchange="window._editModelMaterials[${mi}].cuts[${ci}].basis=this.value"
                        style="flex-shrink:0;width:75px;padding:6px 4px;font-size:11px;border:1px solid var(--border);border-radius:5px;font-family:inherit;background:var(--card)">
                        ${CUT_BASIS_OPTIONS.map(o => `<option value="${o.value}" ${cut.basis===o.value?'selected':''}>${o.label}</option>`).join('')}
                    </select>
                    <input type="number" inputmode="decimal" step="0.1" value="${cut.abzug || 0}" placeholder="Abzug"
                        oninput="window._editModelMaterials[${mi}].cuts[${ci}].abzug=parseFloat(this.value)||0"
                        style="flex-shrink:0;width:60px;padding:6px 4px;font-size:12px;text-align:center;border:1px solid var(--border);border-radius:5px;font-family:inherit;background:var(--card);box-sizing:border-box" title="Abzug">
                    <input type="number" inputmode="numeric" step="1" min="1" value="${cut.stueck || 1}" placeholder="Stk"
                        oninput="window._editModelMaterials[${mi}].cuts[${ci}].stueck=parseInt(this.value)||1"
                        style="flex-shrink:0;width:42px;padding:6px 4px;font-size:12px;text-align:center;border:1px solid var(--border);border-radius:5px;font-family:inherit;background:var(--card);box-sizing:border-box" title="Stück">
                    <input type="number" inputmode="numeric" step="1" min="1" value="${cut.doppeltuerFaktor || 1}" placeholder="DT"
                        oninput="window._editModelMaterials[${mi}].cuts[${ci}].doppeltuerFaktor=parseInt(this.value)||1"
                        style="flex-shrink:0;width:42px;padding:6px 4px;font-size:12px;text-align:center;border:1px solid var(--border);border-radius:5px;font-family:inherit;background:var(--card);box-sizing:border-box" title="Doppeltür-Faktor">
                    <button type="button" onclick="window._editModelMaterials[${mi}].cuts.splice(${ci},1);renderModelCutsList()" style="flex-shrink:0;padding:5px 8px;background:var(--red);color:white;border:none;border-radius:5px;cursor:pointer;font-family:inherit;font-size:12px">×</button>
                </div>
                ${conditionOptions.length ? `
                <div style="display:flex;gap:6px;align-items:flex-start;font-size:10px;color:var(--text-muted);flex-wrap:wrap;margin-top:4px">
                    <span style="font-weight:700;flex-shrink:0;text-transform:uppercase;letter-spacing:0.04em;padding-top:5px">Bedingung:</span>
                    <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:200px">${cutCondChipsHtml}</div>
                </div>
                <div style="margin-top:4px">
                    <button type="button" onclick="toggleCutOverrides(${mi},${ci})"
                        style="font-size:10px;padding:3px 8px;background:transparent;color:var(--primary);border:1px dashed var(--primary);border-radius:5px;cursor:pointer;font-family:inherit">
                        ${overridesExpanded ? '▼' : '▶'} Overrides (${overrides.length})
                    </button>
                    ${overridesExpanded ? `
                        <div style="margin-top:4px;padding:6px;background:var(--bg-light);border-radius:5px">
                            <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;line-height:1.4">
                                Overrides ändern Werte je nach Variant-Auswahl. Leeres Feld = Standard-Wert. Mehrere Overrides werden nacheinander angewandt (letzter gewinnt).
                            </div>
                            ${overridesHtml}
                            <button type="button" onclick="addCutOverride(${mi},${ci})"
                                style="margin-top:4px;padding:4px 8px;font-size:10px;background:var(--card);color:var(--primary);border:1px dashed var(--primary);border-radius:5px;cursor:pointer;font-family:inherit">+ Override</button>
                        </div>
                    ` : ''}
                </div>
                ` : ''}
            </div>`;
        }).join('');

        // v1.19.19: Material-Level Bedingung (Material nur wenn Variant=Wert)
        // v1.19.46: Chip-Multi-Select statt Dropdown
        const matCondChipsHtml = _renderCondChips(mm.condition, conditionOptions, `toggleMatCondChip(${mi},`);

        return `<div style="margin-bottom:10px;padding:10px;background:var(--bg-light);border-radius:8px;border-left:3px solid var(--primary)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
                    <button type="button" onclick="moveModelMaterial(${mi},-1)" ${mi===0?'disabled':''} style="padding:1px 5px;background:var(--border-light);border:none;border-radius:4px;font-size:10px;cursor:pointer;${mi===0?'opacity:0.3':''}">▲</button>
                    <button type="button" onclick="moveModelMaterial(${mi},1)" ${mi===last?'disabled':''} style="padding:1px 5px;background:var(--border-light);border:none;border-radius:4px;font-size:10px;cursor:pointer;${mi===last?'opacity:0.3':''}">▼</button>
                </div>
                <div style="flex:1;font-weight:700;font-size:13px">${escHtml(matName)}</div>
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">${escHtml(matType)}</span>
                <button type="button" onclick="window._editModelMaterials.splice(${mi},1);renderModelCutsList()" style="padding:4px 10px;background:var(--red);color:white;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">Material entfernen</button>
            </div>
            ${conditionOptions.length ? `
            <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;padding:6px 8px;background:#fef3c7;border:1px solid #f59e0b;border-radius:5px;flex-wrap:wrap">
                <span style="font-size:10px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;flex-shrink:0;padding-top:5px">Material-Bedingung:</span>
                <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:200px">${matCondChipsHtml}</div>
            </div>
            ` : ''}
            ${(mm.cuts && mm.cuts.length) ? `
                <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;padding:0 6px;font-size:9px;color:var(--text-muted);font-weight:700;text-transform:uppercase">
                    <span style="flex:1 1 auto">Label</span>
                    <span style="flex-shrink:0;width:75px;text-align:center">Basis</span>
                    <span style="flex-shrink:0;width:60px;text-align:center">Abzug</span>
                    <span style="flex-shrink:0;width:42px;text-align:center">Stk</span>
                    <span style="flex-shrink:0;width:42px;text-align:center">DT×</span>
                    <span style="flex-shrink:0;width:28px"></span>
                </div>
                ${cutsHtml}
            ` : '<div style="font-size:11px;color:var(--text-muted);padding:6px;text-align:center">Keine Cuts. Klicke "+ Cut".</div>'}
            <button type="button" onclick="addCutToModelMaterial(${mi})" style="margin-top:4px;padding:5px 10px;font-size:11px;background:var(--card);color:var(--primary);border:1px dashed var(--primary);border-radius:6px;cursor:pointer;font-family:inherit">+ Cut</button>
        </div>`;
    }).join('');
}

// Cut-Bedingung setzen (v1.16.7)
function updateCutCondition(mi, ci, value) {
    if (!value) {
        delete window._editModelMaterials[mi].cuts[ci].condition;
    } else {
        const [vid, oid] = value.split('::');
        window._editModelMaterials[mi].cuts[ci].condition = { variantId: vid, optionId: oid };
    }
}

// Material-Level-Bedingung setzen (v1.19.19) — z.B. "Bodenprofil nur wenn bodenprofil=ja"
function updateMatCondition(mi, value) {
    if (!value) {
        delete window._editModelMaterials[mi].condition;
    } else {
        const [vid, oid] = value.split('::');
        window._editModelMaterials[mi].condition = { variantId: vid, optionId: oid };
    }
}

// v1.19.46: Chip-Toggle für Material- und Cut-Bedingungen (Multi-Select pro Variante)
function toggleMatCondChip(mi, variantId, optionId) {
    const mat = window._editModelMaterials[mi];
    if (!mat) return;
    const next = _toggleCondition(mat.condition, variantId, optionId);
    if (next) mat.condition = next;
    else delete mat.condition;
    renderModelCutsList();
}
function toggleCutCondChip(mi, ci, variantId, optionId) {
    const cut = window._editModelMaterials[mi]?.cuts?.[ci];
    if (!cut) return;
    const next = _toggleCondition(cut.condition, variantId, optionId);
    if (next) cut.condition = next;
    else delete cut.condition;
    renderModelCutsList();
}

// Modell-Variante-Toggle: Live-Update für _editModelVariantIds (v1.16.7)
function onModelVariantToggle(vid, checked) {
    const arr = window._editModelVariantIds || [];
    if (checked && !arr.includes(vid)) arr.push(vid);
    if (!checked) {
        const idx = arr.indexOf(vid);
        if (idx >= 0) arr.splice(idx, 1);
        // Wenn Variante entfernt wird, alle Cuts mit Bedingung darauf zurücksetzen
        (window._editModelMaterials || []).forEach(mat => {
            // v1.19.19: Auch Material-Level Bedingung aufräumen
            if (mat.condition && mat.condition.variantId === vid) {
                delete mat.condition;
            }
            (mat.cuts || []).forEach(cut => {
                if (cut.condition && cut.condition.variantId === vid) {
                    delete cut.condition;
                }
                // v1.16.8: Auch Overrides aufräumen
                if (Array.isArray(cut.overrides)) {
                    cut.overrides = cut.overrides.filter(ov => !ov.when || ov.when.variantId !== vid);
                }
            });
        });
    }
    window._editModelVariantIds = arr;
    renderModelCutsList();
}

// ═══ CUT-OVERRIDES (v1.16.8) ═══

// Override-Block aufklappen/zuklappen
function toggleCutOverrides(mi, ci) {
    const cut = window._editModelMaterials[mi].cuts[ci];
    cut._expanded = !cut._expanded;
    renderModelCutsList();
}

// Override hinzufügen
function addCutOverride(mi, ci) {
    const cut = window._editModelMaterials[mi].cuts[ci];
    if (!Array.isArray(cut.overrides)) cut.overrides = [];
    cut.overrides.push({ when: null, values: {} });
    cut._expanded = true; // sicherheitshalber offen halten
    renderModelCutsList();
}

// Override-Bedingung ändern
function updateOverrideWhen(mi, ci, oi, value) {
    const ov = window._editModelMaterials[mi].cuts[ci].overrides[oi];
    if (!value) {
        ov.when = null;
    } else {
        const [vid, oid] = value.split('::');
        ov.when = { variantId: vid, optionId: oid };
    }
}

// Override-Wert ändern (abzug, stueck, doppeltuerFaktor)
function updateOverrideValue(mi, ci, oi, key, value) {
    const ov = window._editModelMaterials[mi].cuts[ci].overrides[oi];
    if (!ov.values) ov.values = {};
    if (value === '' || value === null) {
        delete ov.values[key];
    } else {
        ov.values[key] = key === 'abzug' ? (parseFloat(value) || 0) : (parseInt(value) || 1);
    }
}

function moveModelMaterial(i, dir) {
    const arr = window._editModelMaterials;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    renderModelCutsList();
}

function addCutToModelMaterial(mi) {
    const mm = window._editModelMaterials[mi];
    if (!mm.cuts) mm.cuts = [];
    const matInfo = cachedMaterials.find(cm => cm.id === mm.materialId);
    // Sinnvoller Default je nach Material-Typ
    const defaultBasis = matInfo && matInfo.type === 'netz' ? 'hoehe' : 'breite';
    mm.cuts.push({ label: '', basis: defaultBasis, abzug: 0, stueck: 1, doppeltuerFaktor: 1 });
    renderModelCutsList();
}

function openMaterialPickerForModel() {
    const existingIds = new Set((window._editModelMaterials || []).map(m => m.materialId));
    const available = (cachedMaterials || []).filter(m => m.active !== false && !existingIds.has(m.id));

    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.style.zIndex = '10100'; // über dem Modell-Editor
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
        <div class="edit-modal" style="max-width:420px">
            <div class="edit-header">
                <span>Material wählen</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body" style="padding:8px 10px">
                ${available.length ? available.map(m => `
                    <button onclick="addMaterialToModel('${m.id}');this.closest('.edit-overlay').remove()"
                        style="display:flex;align-items:center;gap:10px;width:100%;padding:10px;background:transparent;border:1px solid var(--border-light);border-radius:8px;cursor:pointer;font-family:inherit;text-align:left;margin-bottom:4px">
                        <div style="flex:1">
                            <div style="font-weight:600;font-size:13px">${escHtml(m.name)}</div>
                            <div style="font-size:11px;color:var(--text-muted)">${escHtml(m.type || '')}${m.byColor ? ' · nach Farbe' : ''}</div>
                        </div>
                        <span style="font-size:18px;color:var(--primary);font-weight:700">+</span>
                    </button>
                `).join('') : '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Alle aktiven Materialien sind bereits in der Schnittliste.</div>'}
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

function addMaterialToModel(materialId) {
    const matInfo = cachedMaterials.find(cm => cm.id === materialId);
    if (!matInfo) return;
    if (!window._editModelMaterials) window._editModelMaterials = [];
    // Cuts vom Material als Vorschlag übernehmen (kann der Admin dann anpassen)
    const initialCuts = (matInfo.cuts && matInfo.cuts.length)
        ? JSON.parse(JSON.stringify(matInfo.cuts))
        : [];
    window._editModelMaterials.push({
        materialId,
        sortOrder: window._editModelMaterials.length,
        cuts: initialCuts
    });
    renderModelCutsList();
}

function resetModelCutListFromMaterials() {
    const current = window._editModelMaterials || [];
    if (current.length > 0) {
        if (!confirm('Schnittliste komplett aus Materialien neu aufbauen? Bestehende Cuts in dieser Schnittliste gehen verloren.')) return;
    }
    // Alle aktiven Materialien mit Cuts oder showInRechner einfügen, sortiert nach sortOrder
    const newList = (cachedMaterials || [])
        .filter(m => m.active !== false && (m.cuts?.length || m.showInRechner))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(m => ({
            materialId: m.id,
            sortOrder: 0,
            cuts: (m.cuts && m.cuts.length) ? JSON.parse(JSON.stringify(m.cuts)) : []
        }));
    window._editModelMaterials = newList;
    renderModelCutsList();
    showToast(`${newList.length} Materialien aus der Material-Verwaltung übernommen.`, 'success');
}

async function saveModel(id) {
    const name = document.getElementById('modelName').value.trim();
    if (!name) { showToast('Bitte Name eingeben.', 'warning'); return; }

    const description = document.getElementById('modelDesc').value.trim();
    // v1.19.22: Modell-Farbe (leer = Default lila)
    const colorRaw = document.getElementById('modelColor')?.value || '';
    const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : '';
    const active = document.getElementById('modelActive').checked;
    const isDefault = document.getElementById('modelDefault').checked;

    // v1.19.58: Warnung wenn ein genutztes Modell deaktiviert wird
    if (id && active === false) {
        const prev = (typeof getModel === 'function') ? getModel(id) : null;
        if (prev && prev.active !== false && !confirmDeactivation('Modell', 'model', id, name, () => saveModel(id))) return;
    }

    const forcedRaw = document.getElementById('modelForcedDt').value;
    const forcedDoppeltuer = forcedRaw === 'null' ? null : (forcedRaw === 'true');

    const variantIds = Array.from(document.querySelectorAll('.model-variant-cb:checked')).map(cb => cb.value);
    const colors = Array.from(document.querySelectorAll('.model-color-cb:checked')).map(cb => cb.value);
    const defaultColor = document.getElementById('modelDefaultColor')?.value || '';

    const pricing = {
        defaultSqmPriceEinzeltuer: parseFloat(document.getElementById('priceDefaultE').value) || 0,
        defaultSqmPriceDoppeltuer: parseFloat(document.getElementById('priceDefaultD').value) || 0,
        minSqmPriceEinzeltuer: parseFloat(document.getElementById('priceMinE').value) || 0,
        minSqmPriceDoppeltuer: parseFloat(document.getElementById('priceMinD').value) || 0
    };
    // v1.19.27: Preis-Matrix (Türart × Netz/Plissee) — überschreibt die Vorschläge oben wenn gesetzt
    const _matEN = parseFloat(document.getElementById('priceMatrixEinzelNetz')?.value);
    const _matEP = parseFloat(document.getElementById('priceMatrixEinzelPlisee')?.value);
    const _matDN = parseFloat(document.getElementById('priceMatrixDoppelNetz')?.value);
    const _matDP = parseFloat(document.getElementById('priceMatrixDoppelPlisee')?.value);
    const matrix = { einzel: {}, doppel: {} };
    if (Number.isFinite(_matEN) && _matEN > 0) matrix.einzel.netz = _matEN;
    if (Number.isFinite(_matEP) && _matEP > 0) matrix.einzel.plisee = _matEP;
    if (Number.isFinite(_matDN) && _matDN > 0) matrix.doppel.netz = _matDN;
    if (Number.isFinite(_matDP) && _matDP > 0) matrix.doppel.plisee = _matDP;
    if (Object.keys(matrix.einzel).length || Object.keys(matrix.doppel).length) {
        pricing.matrix = matrix;
    }
    const measureLimits = {
        minBreite: parseInt(document.getElementById('limMinB').value) || 30,
        maxBreite: parseInt(document.getElementById('limMaxB').value) || 250,
        minHoehe: parseInt(document.getElementById('limMinH').value) || 50,
        maxHoehe: parseInt(document.getElementById('limMaxH').value) || 280
    };

    // v1.18.20: Webshop-Felder
    const webshopActive = document.getElementById('modelWebshopActive')?.checked || false;
    const webshopShortDescription = document.getElementById('modelWebshopShortDesc')?.value.trim() || '';
    // v1.19.35: Lange Beschreibung + Vorteile-Liste aus dem Editor entfernt — werden nicht mehr gepflegt.
    // Bestehende Werte bleiben in Firestore unverändert (existing fallback unten).
    const existing0 = id ? getModel(id) : null;
    const webshopLongDescription = existing0?.webshopLongDescription || '';
    const webshopAdvantages = existing0?.webshopAdvantages || [];
    const webshopMinBreite = parseInt(document.getElementById('modelWebshopMinBreite')?.value) || measureLimits.minBreite;
    const webshopMaxBreite = parseInt(document.getElementById('modelWebshopMaxBreite')?.value) || measureLimits.maxBreite;
    const webshopMinHoehe = parseInt(document.getElementById('modelWebshopMinHoehe')?.value) || measureLimits.minHoehe;
    const webshopMaxHoehe = parseInt(document.getElementById('modelWebshopMaxHoehe')?.value) || measureLimits.maxHoehe;

    const existing = id ? getModel(id) : null;
    // Schnittliste aus dem Editor übernehmen (v1.14.0, erweitert v1.16.7+v1.16.8)
    const editedMaterials = (window._editModelMaterials || []).map((m, i) => {
        const matEntry = {
            materialId: m.materialId,
            sortOrder: i,
            cuts: (m.cuts || []).map(c => {
                const cut = {
                    label: (c.label || '').trim(),
                    basis: c.basis || 'breite',
                    abzug: parseFloat(c.abzug) || 0,
                    stueck: parseInt(c.stueck) || 1,
                    doppeltuerFaktor: parseInt(c.doppeltuerFaktor) || 1
                };
                // v1.16.7: Cut-Bedingung mitspeichern. v1.19.25: optionIds-Array (OR) bevorzugt,
                // optionId als Legacy weiter unterstützt.
                if (c.condition && c.condition.variantId) {
                    if (Array.isArray(c.condition.optionIds) && c.condition.optionIds.length) {
                        cut.condition = { variantId: c.condition.variantId, optionIds: c.condition.optionIds.slice() };
                    } else if (c.condition.optionId) {
                        cut.condition = { variantId: c.condition.variantId, optionId: c.condition.optionId };
                    }
                }
                // v1.16.8: Overrides mitspeichern (nur die mit gültiger Bedingung)
                if (Array.isArray(c.overrides) && c.overrides.length) {
                    const validOverrides = c.overrides
                        .filter(ov => ov.when && ov.when.variantId && (ov.when.optionId || (Array.isArray(ov.when.optionIds) && ov.when.optionIds.length)))
                        .map(ov => {
                            const when = { variantId: ov.when.variantId };
                            if (Array.isArray(ov.when.optionIds) && ov.when.optionIds.length) when.optionIds = ov.when.optionIds.slice();
                            else when.optionId = ov.when.optionId;
                            return { when, values: ov.values || {} };
                        });
                    if (validOverrides.length) cut.overrides = validOverrides;
                }
                return cut;
            })
        };
        // v1.19.19: Material-Level Bedingung. v1.19.25: auch hier optionIds-Array.
        if (m.condition && m.condition.variantId) {
            if (Array.isArray(m.condition.optionIds) && m.condition.optionIds.length) {
                matEntry.condition = { variantId: m.condition.variantId, optionIds: m.condition.optionIds.slice() };
            } else if (m.condition.optionId) {
                matEntry.condition = { variantId: m.condition.variantId, optionId: m.condition.optionId };
            }
        }
        return matEntry;
    });
    const sections = [{
        id: 'default',
        name: existing?.sections?.[0]?.name || '',
        materials: editedMaterials
    }];
    const data = {
        name, description, color, active,
        default: isDefault,
        forcedDoppeltuer, variantIds, pricing, colors, defaultColor, measureLimits,
        sections,
        conditionalMaterials: existing?.conditionalMaterials || [],
        graphic: existing?.graphic || { type: 'rectangle_with_arrows', arrowsFromVariant: variantIds[0] || '' },
        // v1.18.20: Webshop-Felder
        webshopActive,
        webshopShortDescription,
        webshopLongDescription,
        webshopAdvantages,
        webshopMinBreite,
        webshopMaxBreite,
        webshopMinHoehe,
        webshopMaxHoehe,
        // v1.19.2: Webshop-Bilder (bereits live über persistModelImages synchronisiert,
        // hier nochmal für den Fall dass sortiert wurde aber persistModelImages noch lief)
        images: window._editModelImages || []
    };

    try {
        if (isDefault) {
            const batch = db.batch();
            cachedModels.forEach(m => {
                if (m.id !== id && m.default) {
                    batch.update(db.collection('models').doc(m.id), { default: false });
                }
            });
            await batch.commit();
        }

        if (id) {
            await db.collection('models').doc(id).update(data);
        } else {
            const newId = slugifyId(name);
            const exists = await db.collection('models').doc(newId).get();
            if (exists.exists) { showToast('Ein Modell mit ähnlichem Namen existiert bereits.', 'warning'); return; }
            data.sortOrder = cachedModels.length;
            await db.collection('models').doc(newId).set(data);
        }
        await loadModels();
        renderModelsList();
        document.querySelector('.edit-overlay')?.remove();
        showToast('Modell gespeichert.', 'success');
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

// ═══ MODELL-KOMBI-MIGRATION (v1.19.25) ═══
// Führt Slide Pro + Kombi-Pro und Slide Slim + Kombi-Slim in jeweils ein Modell
// zusammen. Plisseestoff/Plastikband-Materialien aus Kombi werden mit Bedingung
// "Netz/Plissee = Plisee oder Kombi" in das Haupt-Modell übernommen. Bestehende
// Netz-Materialien bekommen die Bedingung "Netz/Plissee = Netz oder Kombi".
// Kombi-Modelle werden archiviert (active=false), bleiben aber für alte
// Bestellungen referenzierbar.
function _migFind(re, excludeKombi) {
    return cachedModels.find(m => re.test(m.name||'') && (!excludeKombi || !/kombi|sonnenschutz/i.test(m.name||'')));
}
function _migComputeMerge(main, kombi) {
    if (!main) return null;
    const mainMats = (main.sections?.[0]?.materials || []).map(m => JSON.parse(JSON.stringify(m)));
    const changes = [];

    // 1) Existing Netz-Materialien: Bedingung "Netz/Plissee = Netz oder Kombi"
    mainMats.forEach(mm => {
        const matInfo = cachedMaterials.find(c => c.id === mm.materialId);
        if (matInfo && matInfo.type === 'netz') {
            const hadCond = !!mm.condition;
            mm.condition = { variantId: 'netz_plissee', optionIds: ['netz', 'kombi'] };
            changes.push({ action: hadCond ? 'modify' : 'add-condition', mat: matInfo.name, detail: 'Netz/Plissee = Netz oder Kombi' });
        }
    });

    if (kombi) {
        const kombiMats = kombi.sections?.[0]?.materials || [];
        const mainMatIds = new Set(mainMats.map(m => m.materialId));
        kombiMats.forEach(km => {
            if (mainMatIds.has(km.materialId)) return;
            const matInfo = cachedMaterials.find(c => c.id === km.materialId);
            if (!matInfo) return;
            const newMat = JSON.parse(JSON.stringify(km));
            // Wenn es vom Typ "netz" ist (z.B. Plisseestoff) → Bedingung Plisee/Kombi
            newMat.condition = { variantId: 'netz_plissee', optionIds: ['plisee', 'kombi'] };
            mainMats.push(newMat);
            changes.push({ action: 'add', mat: matInfo.name + ' (' + matInfo.type + ')', detail: 'Netz/Plissee = Plissee oder Kombi' });
        });
    }

    return { mainMats, changes };
}

function openModelMigrationPreview() {
    if (typeof isAdmin === 'function' && !isAdmin()) { showToast('Nur Admin.', 'warning'); return; }

    const pro = _migFind(/slide\s*pro/i, true);
    const slim = _migFind(/slide\s*slim/i, true);
    const kombiPro = cachedModels.find(m => /(kombi|sonnenschutz)/i.test(m.name||'') && /26/.test(m.name||''));
    const kombiSlim = cachedModels.find(m => /(kombi|sonnenschutz)/i.test(m.name||'') && /18/.test(m.name||''));

    if (!pro && !slim) {
        showToast('Slide Pro/Slim nicht gefunden — Migration nicht möglich.', 'warning');
        return;
    }

    const proPlan = pro ? _migComputeMerge(pro, kombiPro) : null;
    const slimPlan = slim ? _migComputeMerge(slim, kombiSlim) : null;

    const renderPlan = (label, model, kombiModel, plan) => {
        if (!model) return `<div style="padding:8px;color:var(--text-muted);font-size:12px">${label}: Modell nicht gefunden</div>`;
        const kombiNote = kombiModel
            ? `<span style="font-size:11px;color:var(--text-muted)"> + Kombi-Modell „${escHtml(kombiModel.name)}" → wird archiviert</span>`
            : '<span style="font-size:11px;color:var(--text-muted)"> · kein Kombi-Modell gefunden, nur Bedingungen werden gesetzt</span>';
        const changeRows = (plan?.changes || []).map(c => {
            const icon = c.action === 'add' ? '➕' : c.action === 'add-condition' ? '🔗' : '✏️';
            return `<div style="padding:6px 10px;font-size:12px;display:flex;gap:8px;border-bottom:1px solid var(--border-light)">
                <span style="flex-shrink:0">${icon}</span>
                <span style="flex:1"><strong>${escHtml(c.mat)}</strong> — ${escHtml(c.detail)}</span>
            </div>`;
        }).join('') || '<div style="padding:8px;color:var(--text-muted);font-size:12px;text-align:center">Keine Änderungen nötig</div>';
        return `<div style="margin-bottom:14px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
            <div style="padding:10px 12px;background:var(--bg-light);font-weight:700;font-size:13px">
                ${escHtml(model.name)} ${kombiNote}
            </div>
            ${changeRows}
        </div>`;
    };

    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `
        <div class="edit-modal" style="max-width:680px;width:95vw">
            <div class="edit-header">
                <span>Modell-Migration · Vorschau</span>
                <button class="close-btn" onclick="this.closest('.edit-overlay').remove()">×</button>
            </div>
            <div class="edit-body" style="max-height:70vh;overflow:auto">
                <div style="padding:10px 14px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;font-size:12px;color:#92400e;margin-bottom:14px;line-height:1.5">
                    <strong>Wichtig — vorher Backup machen!</strong><br>
                    Diese Migration ändert die Schnittlisten von Slide Pro/Slim und archiviert die Kombi-Modelle.
                    Eine Sicherung des Vorher-Zustands wird automatisch in <code>migration_backups</code> abgelegt — aber für Sicherheit auch lokales Backup empfehlenswert.
                </div>
                ${renderPlan('Slide Pro', pro, kombiPro, proPlan)}
                ${renderPlan('Slide Slim', slim, kombiSlim, slimPlan)}
                <div style="font-size:11px;color:var(--text-muted);padding:6px;line-height:1.5">
                    Nach der Migration: Kombi-Modelle <strong>active = false</strong> (alte Bestellungen funktionieren weiter).
                    Du kannst sie nach Verifikation manuell in den Stammdaten löschen.
                </div>
            </div>
            <div class="edit-footer">
                <button class="action-btn" onclick="this.closest('.edit-overlay').remove()">Abbrechen</button>
                <button class="action-btn primary" onclick="executeModelMigration('${pro?.id || ''}','${slim?.id || ''}','${kombiPro?.id || ''}','${kombiSlim?.id || ''}')" style="background:#92400e">Migration ausführen</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

async function executeModelMigration(proId, slimId, kombiProId, kombiSlimId) {
    if (typeof isAdmin === 'function' && !isAdmin()) { showToast('Nur Admin.', 'warning'); return; }
    const pro = proId ? cachedModels.find(m => m.id === proId) : null;
    const slim = slimId ? cachedModels.find(m => m.id === slimId) : null;
    const kombiPro = kombiProId ? cachedModels.find(m => m.id === kombiProId) : null;
    const kombiSlim = kombiSlimId ? cachedModels.find(m => m.id === kombiSlimId) : null;

    try {
        // Backup pre-migration state
        const backupPayload = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            triggeredBy: (currentUser?.email || 'unknown'),
            reason: 'Modell-Konsolidierung Pro+Kombi / Slim+Kombi v1.19.25',
            models: [pro, slim, kombiPro, kombiSlim].filter(Boolean)
        };
        await db.collection('migration_backups').add(backupPayload);

        const batch = db.batch();

        if (pro) {
            const plan = _migComputeMerge(pro, kombiPro);
            const newSections = [{
                ...(pro.sections?.[0] || { id: 'default', name: '' }),
                materials: plan.mainMats
            }];
            batch.update(db.collection('models').doc(pro.id), { sections: newSections });
        }
        if (slim) {
            const plan = _migComputeMerge(slim, kombiSlim);
            const newSections = [{
                ...(slim.sections?.[0] || { id: 'default', name: '' }),
                materials: plan.mainMats
            }];
            batch.update(db.collection('models').doc(slim.id), { sections: newSections });
        }
        if (kombiPro) {
            batch.update(db.collection('models').doc(kombiPro.id), {
                active: false,
                archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
                archivedReason: 'Konsolidiert in Slide Pro (Variante Netz/Plissee = Plissee oder Kombi)'
            });
        }
        if (kombiSlim) {
            batch.update(db.collection('models').doc(kombiSlim.id), {
                active: false,
                archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
                archivedReason: 'Konsolidiert in Slide Slim (Variante Netz/Plissee = Plissee oder Kombi)'
            });
        }
        await batch.commit();

        document.querySelector('.edit-overlay')?.remove();
        await loadModels();
        renderModelsList();
        showToast('✅ Migration erfolgreich. Backup gespeichert in migration_backups.', 'success');
    } catch(e) {
        console.error('Migration error:', e);
        showToast('Fehler bei Migration: ' + e.message, 'error');
    }
}

async function deleteModel(id) {
    showConfirm('Modell löschen?', 'Achtung: in Release 1 wird noch nicht geprüft, ob das Modell in Bestellungen verwendet wird. Empfehlung: Modell stattdessen deaktivieren.', 'Trotzdem löschen', async () => {
        try {
            await db.collection('models').doc(id).delete();
            await loadModels();
            renderModelsList();
            document.querySelector('.edit-overlay')?.remove();
            showToast('Modell gelöscht.', 'success');
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// ═══ MIGRATION (R1.8) ═══

async function checkMigrationStatus() {
    const statusEl = document.getElementById('migrationStatus');
    statusEl.innerHTML = '<span style="color:var(--text-muted)">Prüfe…</span>';
    try {
        const [matSnap, ordSnap, colSnap, varSnap, modSnap] = await Promise.all([
            db.collection('materials').get(),
            db.collection('orders').get(),
            db.collection('colors').get(),
            db.collection('variants').get(),
            db.collection('models').get()
        ]);
        const materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const orders = ordSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const knownColors = new Set();
        materials.forEach(m => (m.colors || []).forEach(c => knownColors.add(c)));
        ['Antrazit','Weiß','Braun'].forEach(c => knownColors.add(c));

        const ordersOhneModel = orders.filter(o =>
            (o.measures || []).some(mes => !mes.modelId)
        ).length;

        statusEl.innerHTML = `
            <div><strong>Aktueller Stand:</strong></div>
            <div>Materialien: ${materials.length}</div>
            <div>Bestellungen: ${orders.length}</div>
            <div>Farben im Katalog: ${colSnap.size} (gefunden in Daten: ${knownColors.size})</div>
            <div>Varianten: ${varSnap.size}</div>
            <div>Modelle: ${modSnap.size}</div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light)">
                <strong>Migration nötig:</strong>
            </div>
            <div>Farben anzulegen: ${Math.max(0, knownColors.size - colSnap.size)}</div>
            <div>Standard-Variante "Türart" anzulegen: ${varSnap.docs.find(d => d.id === 'tuerart') ? 'nein' : 'ja'}</div>
            <div>Modell "Klassik" anzulegen: ${modSnap.docs.find(d => d.id === 'klassik') ? 'nein' : 'ja'}</div>
            <div style="color:${ordersOhneModel ? 'var(--amber-border)' : 'var(--text-muted)'}">Bestellungen ohne modelId: ${ordersOhneModel}</div>
        `;
    } catch(e) {
        statusEl.innerHTML = `<span style="color:var(--red)">Fehler: ${e.message}</span>`;
    }
}

async function runMigration() {
    showConfirm('Migration starten?',
        'Stelle sicher, dass du vorher ein Backup gezogen hast (Tab Einstellungen → Backup).\n\nDie Migration legt Farb-Katalog, Standard-Variante "Türart" und Modell "Klassik" an. Bestehende Bestellungen werden mit modelId="klassik" markiert.\n\nFortfahren?',
        'Migration starten', async () => {
            const statusEl = document.getElementById('migrationStatus');
            statusEl.innerHTML = '<span style="color:var(--text-muted)">Migration läuft…</span>';
            try {
                await migrateColors();
                await migrateVariants();
                await migrateKlassikModel();
                await migrateOrders();
                await loadColors();
                await loadVariants();
                await loadModels();
                renderColorsList(); renderVariantsList(); renderModelsList();
                statusEl.innerHTML = '<span style="color:#16a34a"><strong>✓ Migration abgeschlossen.</strong></span>';
                showToast('Migration erfolgreich.', 'success');
            } catch(e) {
                statusEl.innerHTML = `<span style="color:var(--red)">Fehler: ${e.message}</span>`;
                showToast('Migrationsfehler: ' + e.message, 'error');
            }
        });
}

async function migrateColors() {
    const defaults = [
        { id: 'antrazit', name: 'Antrazit', bg: '#4a4a4a', text: '#cccccc', sortOrder: 0, active: true },
        { id: 'weiss', name: 'Weiß', bg: '#e0e0e0', text: '#444444', sortOrder: 1, active: true },
        { id: 'braun', name: 'Braun', bg: '#8b4513', text: '#fac775', sortOrder: 2, active: true }
    ];
    const batch = db.batch();
    let order = 0;
    for (const def of defaults) {
        const ref = db.collection('colors').doc(def.id);
        const doc = await ref.get();
        if (!doc.exists) batch.set(ref, { ...def, sortOrder: order++ });
    }

    const matSnap = await db.collection('materials').get();
    const seen = new Set(defaults.map(d => d.id));
    matSnap.docs.forEach(d => {
        const m = d.data();
        (m.colors || []).forEach(name => {
            const id = slugifyId(name);
            if (!seen.has(id)) {
                seen.add(id);
                batch.set(db.collection('colors').doc(id), {
                    name, bg: '#666666', text: '#ffffff', sortOrder: order++, active: true
                });
            }
        });
    });
    await batch.commit();
}

async function migrateVariants() {
    const ref = db.collection('variants').doc('tuerart');
    const doc = await ref.get();
    if (!doc.exists) {
        await ref.set({
            name: 'Türart',
            options: [
                { id: 'einzel', label: 'Einzeltür', arrow: '→' },
                { id: 'doppel', label: 'Doppeltür', arrow: '→←' }
            ],
            defaultOption: 'einzel',
            sortOrder: 0,
            active: true
        });
    }
}

async function migrateKlassikModel() {
    const ref = db.collection('models').doc('klassik');
    const doc = await ref.get();
    if (doc.exists) return;

    const matSnap = await db.collection('materials').get();
    const materials = matSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m.active !== false && (m.showInRechner || (m.cuts && m.cuts.length)))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const sectionMaterials = materials.map((m, i) => ({
        materialId: m.id,
        sortOrder: i,
        cuts: (m.cuts || []).map(c => ({
            label: c.label || '',
            basis: c.basis || 'breite',
            abzug: c.abzug || 0,
            stueck: c.stueck || 1,
            doppeltuerFaktor: c.doppeltuerFaktor || 1
        }))
    }));

    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const sqmPriceVal = settings.sqmPrice || 25;
    const dtPriceVal = settings.doppeltuerPrice || 60;

    await ref.set({
        name: 'Klassik',
        description: 'Standard-Fliegengitter (vor Modell-System)',
        sortOrder: 0,
        active: true,
        default: true,
        forcedDoppeltuer: null,
        variantIds: ['tuerart'],
        sections: [{ id: 'default', name: '', materials: sectionMaterials }],
        conditionalMaterials: [],
        pricing: {
            defaultSqmPriceEinzeltuer: sqmPriceVal,
            defaultSqmPriceDoppeltuer: dtPriceVal,
            minSqmPriceEinzeltuer: sqmPriceVal,
            minSqmPriceDoppeltuer: dtPriceVal
        },
        colors: ['antrazit', 'weiss', 'braun'],
        defaultColor: 'antrazit',
        measureLimits: { minBreite: 30, maxBreite: 600, minHoehe: 30, maxHoehe: 600 },
        graphic: { type: 'rectangle_with_arrows', arrowsFromVariant: 'tuerart' }
    });
}

// CHUNKED Variant - schreibt Updates in Batches von max. 400 (Firestore-Limit: 500)
async function migrateOrders() {
    const ordSnap = await db.collection('orders').get();
    const toUpdate = [];
    ordSnap.docs.forEach(d => {
        const o = d.data();
        if (!Array.isArray(o.measures)) return;
        if (!o.measures.some(m => !m.modelId)) return;
        const newMeasures = o.measures.map(m => {
            if (m.modelId) return m;
            return {
                ...m,
                modelId: 'klassik',
                variants: m.variants || { tuerart: m.doppeltuer ? 'doppel' : 'einzel' },
                bemerkung: m.bemerkung || '',
                materialColors: m.materialColors || {}
            };
        });
        toUpdate.push({ id: d.id, measures: newMeasures });
    });
    for (let i = 0; i < toUpdate.length; i += 400) {
        const chunk = toUpdate.slice(i, i + 400);
        const batch = db.batch();
        chunk.forEach(u => batch.update(db.collection('orders').doc(u.id), { measures: u.measures }));
        await batch.commit();
    }
}

async function assignAllOrders() {
    const filialeId = document.getElementById('assignFilialeSelect').value;
    if (!filialeId) { showToast('Bitte Filiale wählen.', 'warning'); return; }
    const filiale = filialen.find(f => f.id === filialeId);
    if (!filiale) return;

    showConfirm(
        'Bestellungen zuweisen',
        `Alle Bestellungen ohne Filiale werden "${filiale.name}" zugewiesen. Fortfahren?`,
        'Zuweisen',
        async () => {
            showToast('Bestellungen werden zugewiesen...', 'info');
            try {
                const snap = await db.collection('orders').get();
                let count = 0;
                const batchSize = 450;
                let batch = db.batch();
                let batchCount = 0;

                snap.docs.forEach(d => {
                    const data = d.data();
                    if (!data.filialeId) {
                        batch.update(d.ref, { filialeId: filialeId, filialeName: filiale.name });
                        count++;
                        batchCount++;
                        if (batchCount >= batchSize) {
                            batch.commit();
                            batch = db.batch();
                            batchCount = 0;
                        }
                    }
                });

                if (batchCount > 0) await batch.commit();
                showToast(`${count} Bestellungen wurden "${filiale.name}" zugewiesen!`, 'success', 4000);
            } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
        },
        false
    );
}


// v1.19.10: Material-eigene Schnittlisten-Funktionen (renderMatCutsList,
// addMatCut, moveMatCut) wurden entfernt. Cuts werden ausschließlich im
// Modell-Editor verwaltet — siehe modellbasierte Schnittliste oben.

function onTuerFilterChange(which) {
    const dopp = document.getElementById('matNurDoppeltuer');
    const einz = document.getElementById('matNurEinzeltuer');
    if (which === 'doppel' && dopp?.checked && einz) einz.checked = false;
    if (which === 'einzel' && einz?.checked && dopp) dopp.checked = false;
}

// Load materials for Schnittliste (called at app init)
async function loadRechnerMaterials() {
    try {
        const snap = await db.collection('materials').orderBy('sortOrder').get();
        cachedMaterials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // v1.19.10: Die alte Auto-Migration `rechnerFields` → `cuts` wurde entfernt,
        // weil Material-eigene Schnittlisten nicht mehr existieren. Cuts werden
        // ausschließlich im Modell-Editor gepflegt.
    } catch(e) { console.error('loadRechnerMaterials error:', e); }
}

// ═══ MATERIALVERWALTUNG ═══
const DEFAULT_MATERIALS = [
    { name: 'Profil 1 (En/Boy)', category: 'A', type: 'stange', unit: 'Stangen', purchaseLength: 6, byColor: true, rechnerFields: ['Profil En', 'Profil Boy'] },
    { name: 'Profil 2', category: 'A', type: 'stange', unit: 'Stangen', purchaseLength: 6, byColor: true, rechnerFields: ['Profil 2'] },
    { name: 'Tül (Gitter)', category: 'A', type: 'netz', unit: 'Rollen', byColor: false, rechnerFields: ['Tül', 'Tül Adet'] },
    { name: 'Plastik', category: 'A', type: 'stange', unit: 'Stangen', purchaseLength: 4, byColor: false, rechnerFields: ['Plastik', 'Plastik Kisa'] },
    { name: 'Fitil', category: 'A', type: 'rolle', unit: 'Meter', byColor: false, rechnerFields: ['Fitil'], nurEinzeltuer: true },
    { name: 'Magnet Fitil', category: 'A', type: 'rolle', unit: 'Meter', byColor: false, rechnerFields: ['Fitil'], nurDoppeltuer: true },
    { name: 'Schnur', category: 'A', type: 'flaeche', unit: 'Meter', purchaseLength: 500, byColor: false, perSqm: 8.5, dtPerSqm: 13.1, rechnerFields: [] }
];

// ═══ Material Drag & Drop (ersetzt moveMaterial) ═══
let _matDragSrcId = null;
window._matDragSuppressClick = false;

function onMatDragStart(e, id) {
    if (!(typeof isAdmin === 'function' && (isAdmin() || isSuperAdmin()))) {
        e.preventDefault(); return;
    }
    _matDragSrcId = id;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch(_) {}
}

function onMatDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.mat-row').forEach(r => r.classList.remove('drag-over-top','drag-over-bottom'));
    window._matDragSuppressClick = true;
    setTimeout(() => { window._matDragSuppressClick = false; }, 100);
}

function onMatDragOver(e) {
    e.preventDefault();
    const row = e.currentTarget;
    if (row.dataset.matId === _matDragSrcId) return;
    const rect = row.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    row.classList.toggle('drag-over-top', before);
    row.classList.toggle('drag-over-bottom', !before);
    e.dataTransfer.dropEffect = 'move';
}

function onMatDragLeave(e) {
    e.currentTarget.classList.remove('drag-over-top','drag-over-bottom');
}

async function onMatDrop(e, targetId) {
    e.preventDefault();
    const row = e.currentTarget;
    const rect = row.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    row.classList.remove('drag-over-top','drag-over-bottom');
    if (!_matDragSrcId || _matDragSrcId === targetId) { _matDragSrcId = null; return; }
    await reorderMaterials(_matDragSrcId, targetId, before);
    _matDragSrcId = null;
}

// Touch-Fallback (nur am Drag-Handle)
let _matTouchSrcId = null, _matTouchActive = false, _matTouchEl = null;

function onMatTouchStart(e, id) {
    if (!(typeof isAdmin === 'function' && (isAdmin() || isSuperAdmin()))) return;
    if (!e.target.closest('.mat-drag-handle')) return;
    _matTouchSrcId = id;
    _matTouchEl = e.currentTarget;
    _matTouchActive = true;
    _matTouchEl.classList.add('dragging');
    if (navigator.vibrate) navigator.vibrate(15);
    e.preventDefault();
}

function onMatTouchMove(e) {
    if (!_matTouchActive) return;
    e.preventDefault();
    const t = e.touches[0];
    document.querySelectorAll('.mat-row').forEach(r => r.classList.remove('drag-over-top','drag-over-bottom'));
    const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('.mat-row');
    if (!el || el.dataset.matId === _matTouchSrcId) return;
    const rect = el.getBoundingClientRect();
    const before = (t.clientY - rect.top) < rect.height / 2;
    el.classList.toggle('drag-over-top', before);
    el.classList.toggle('drag-over-bottom', !before);
}

async function onMatTouchEnd() {
    if (!_matTouchActive) return;
    _matTouchActive = false;
    _matTouchEl?.classList.remove('dragging');
    const overTop = document.querySelector('.mat-row.drag-over-top');
    const overBottom = document.querySelector('.mat-row.drag-over-bottom');
    const target = overTop || overBottom;
    if (target && _matTouchSrcId) {
        await reorderMaterials(_matTouchSrcId, target.dataset.matId, !!overTop);
    }
    document.querySelectorAll('.mat-row').forEach(r => r.classList.remove('drag-over-top','drag-over-bottom'));
    _matTouchSrcId = null; _matTouchEl = null;
    window._matDragSuppressClick = true;
    setTimeout(() => { window._matDragSuppressClick = false; }, 100);
}

async function reorderMaterials(srcId, targetId, insertBefore) {
    try {
        const snap = await db.collection('materials').orderBy('sortOrder').get();
        let list = snap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }));
        const srcIdx = list.findIndex(m => m.id === srcId);
        if (srcIdx < 0) return;
        const [src] = list.splice(srcIdx, 1);
        let targetIdx = list.findIndex(m => m.id === targetId);
        if (targetIdx < 0) targetIdx = list.length;
        if (!insertBefore) targetIdx += 1;
        list.splice(targetIdx, 0, src);

        const batch = db.batch();
        list.forEach((m, i) => {
            if (m.data.sortOrder !== i) batch.update(m.ref, { sortOrder: i });
        });
        await batch.commit();
        await loadMaterials();
        await loadRechnerMaterials();
    } catch (e) {
        showToast('Fehler beim Sortieren: ' + e.message, 'error');
    }
}

async function loadMaterials() {
    const el = document.getElementById('materialList');
    if (!el) return;
    el.innerHTML = '<div class="loading" style="padding:12px">Wird geladen...</div>';

    try {
        const snap = await db.collection('materials').orderBy('sortOrder').get();
        let materials = [];

        // Migration: rechnerFields → cuts (einmalig pro Material)
        if (!snap.empty) {
            const tempMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const needsMigration = tempMats.filter(m =>
                Array.isArray(m.rechnerFields) && m.rechnerFields.length
                && (!Array.isArray(m.cuts) || m.cuts.length === 0)
            );
            if (needsMigration.length) {
                let legacyAbzuege = abzuege;
                try {
                    const sd = await db.collection('settings').doc('global').get();
                    if (sd.exists && Array.isArray(sd.data().abzuege) && sd.data().abzuege.length) {
                        legacyAbzuege = sd.data().abzuege;
                    }
                } catch(_) {}
                const migBatch = db.batch();
                needsMigration.forEach(m => {
                    const cuts = m.rechnerFields.map(fn => {
                        const ab = legacyAbzuege.find(a => a.name === fn);
                        if (!ab) return null;
                        let dtF = 1;
                        if (fn === 'Profil 2') dtF = 2;
                        else if (m.dtFaktor && m.dtFaktor > 1) dtF = m.dtFaktor;
                        return {
                            label: ab.name,
                            abzug: ab.abzug || 0,
                            stueck: ab.stueck || 1,
                            basis: ab.basis || 'breite',
                            doppeltuerFaktor: dtF
                        };
                    }).filter(Boolean);
                    const updateData = { cuts, showInRechner: true };
                    if (m.dtFaktor === 0) updateData.nurEinzeltuer = true;
                    migBatch.update(db.collection('materials').doc(m.id), updateData);
                });
                try {
                    await migBatch.commit();
                    console.log('Migration: ' + needsMigration.length + ' Materialien auf cuts[] migriert');
                } catch(e) { console.error('Migration fehlgeschlagen:', e); }
            }
        }

        if (!snap.empty) {
            materials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            cachedMaterials = materials;
        }
        if (snap.empty) {
            // Initialize with defaults
            for (let i = 0; i < DEFAULT_MATERIALS.length; i++) {
                const m = { ...DEFAULT_MATERIALS[i], sortOrder: i, minStock: 0, price: 0, perOrder: 0, active: true };
                const ref = await db.collection('materials').add(m);
                materials.push({ id: ref.id, ...m });
            }
        } else {
            materials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        if (!materials.length) {
            el.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px;text-align:center">Keine Materialien angelegt.</div>';
            return;
        }

        const typeLabels = { stange: 'Stangenmaterial', netz: 'Netz/Gitter', rolle: 'Rollenmaterial', stueck: 'Stückmaterial' };
        const catColors = { A: 'var(--primary)', B: '#d97706' };

        const canSort = isAdmin() || isSuperAdmin();
        el.innerHTML = materials.map(m => {
            const catBadge = (m.showInRechner || m.rechnerFields?.length) ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--primary);color:white">SCHNITTLISTE</span>' : '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white">LAGER</span>';
            const inaktivBadge = m.active === false ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--text-muted);color:white;opacity:0.7">INAKTIV</span>' : '';
            const dtBadge = m.nurDoppeltuer ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:#dc2626;color:white">NUR DT</span>' : (m.nurEinzeltuer ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:#16a34a;color:white">NUR ET</span>' : '');
            const typeBadge = `<span style="font-size:10px;color:var(--text-muted)">${typeLabels[m.type] || m.type}</span>`;
            
            let details = '';
            if (m.type === 'stange') details = `${m.purchaseLength || 6}m Stangen${m.byColor ? ' · nach Farbe' : ''}`;
            else if (m.type === 'netz') details = `Falten + Höhe${m.netzHoehen?.length ? ' · ' + m.netzHoehen.join('/') + ' cm' : ''}`;
            else if (m.type === 'rolle') details = 'Laufmeter';
            else if (m.type === 'flaeche') details = `${m.perSqm || 0}m pro m²${m.dtPerSqm ? ' (DT: '+m.dtPerSqm+'m)' : ''} · ${m.purchaseLength || 500}m Rollen`;
            else if (m.type === 'stueck') details = `${m.perOrder || 0} ${m.unit || 'Stk'}/Bestellung`;
            
            if (m.type === 'netz' && m.minStockFalten) details += ` · Min: ${m.minStockFalten} Falten`;
            else if (m.type === 'stange' && m.minStock) details += ` · Min: ${m.minStock} Stangen`;
            else if (m.type === 'rolle' && m.minStock) details += ` · Min: ${m.minStock} m`;
            else if (m.minStock) details += ` · Min: ${m.minStock}`;
            if (m.price) details += ` · € ${m.price}`;

            return `<div class="mat-row" draggable="${canSort ? 'true' : 'false'}"
                data-mat-id="${m.id}"
                ondragstart="onMatDragStart(event, '${m.id}')"
                ondragend="onMatDragEnd(event)"
                ondragover="onMatDragOver(event)"
                ondragleave="onMatDragLeave(event)"
                ondrop="onMatDrop(event, '${m.id}')"
                ontouchstart="onMatTouchStart(event, '${m.id}')"
                ontouchmove="onMatTouchMove(event)"
                ontouchend="onMatTouchEnd(event)"
                style="display:flex;align-items:center;gap:4px;padding:14px 0;border-bottom:1px solid var(--border-light)${m.active === false ? ';opacity:0.55' : ''}">
                ${canSort ? `
                    <div class="mat-drag-handle" onclick="event.stopPropagation()" ontouchstart="event.stopPropagation()">
                        <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
                            <circle cx="4" cy="4" r="1.5"/><circle cx="10" cy="4" r="1.5"/>
                            <circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/>
                            <circle cx="4" cy="16" r="1.5"/><circle cx="10" cy="16" r="1.5"/>
                        </svg>
                    </div>
                ` : ''}
                <div onclick="if(!window._matDragSuppressClick) openMaterialForm('${m.id}')" style="display:flex;align-items:center;gap:12px;flex:1;cursor:pointer;min-width:0">
                    <div style="width:40px;height:40px;border-radius:10px;background:${m.showInRechner || m.rechnerFields?.length ? 'var(--primary-bg)' : 'var(--amber-bg)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${m.showInRechner || m.rechnerFields?.length ? 'var(--primary)' : '#d97706'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                            <span style="font-size:14px;font-weight:700">${m.name}</span>
                            ${catBadge}
                            ${inaktivBadge}
                            ${dtBadge}
                        </div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${details}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        el.innerHTML = `<div style="font-size:13px;color:var(--red);padding:8px">Fehler: ${e.message}</div>`;
    }
}

function openMaterialForm(id) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    if (id) {
        // Edit existing material
        db.collection('materials').doc(id).get().then(doc => {
            if (!doc.exists) { showToast('Material nicht gefunden', 'error'); return; }
            const m = doc.data();
            renderMaterialForm(overlay, id, m);
        });
    } else {
        // New material
        renderMaterialForm(overlay, null, { name: '', category: 'B', type: 'stueck', unit: 'Stück', purchaseLength: 0, colorSource: 'none', byColor: false, colors: [], perOrder: 0, minStock: 0, price: 0, active: true });
    }
}

function renderMaterialForm(overlay, id, m) {
    const isNew = !id;
    const isKatA = !!(m.showInRechner || m.rechnerFields?.length);

    overlay.innerHTML = `<div class="confirm-box" style="max-width:440px;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div style="font-size:17px;font-weight:700">${isNew ? 'Neues Material' : m.name}</div>
            <button onclick="this.closest('.confirm-overlay').remove()" style="background:var(--border-light);border:none;border-radius:8px;width:32px;height:32px;font-size:16px;cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div class="edit-field"><label>Name</label><input type="text" id="matName" value="${m.name}" placeholder="z.B. Eckverbinder"></div>

        <input type="hidden" id="matCategory" value="${m.category||'A'}">

        <div class="edit-field"><label>Materialtyp</label>
            <select id="matType" onchange="toggleMatFields()">
                <option value="stange" ${m.type==='stange'?'selected':''}>Stangenmaterial</option>
                <option value="netz" ${m.type==='netz'?'selected':''}>Netz/Gitter (Tül)</option>
                <option value="rolle" ${m.type==='rolle'?'selected':''}>Rollenmaterial</option>
                <option value="flaeche" ${m.type==='flaeche'?'selected':''}>Flächenmaterial (pro m²)</option>
                <option value="stueck" ${m.type==='stueck'?'selected':''}>Stückmaterial</option>
            </select>
        </div>

        <div class="edit-field">
            <label style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" id="matActive" ${m.active !== false ? 'checked' : ''} style="width:18px;height:18px">
                Aktiv
            </label>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;margin-left:26px">Inaktive Materialien werden nicht vom Lager abgezogen. Bestehende Buchungen bleiben erhalten.</div>
        </div>

        <div class="edit-field">
            <label style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" id="matNurDoppeltuer" ${m.nurDoppeltuer ? 'checked' : ''} onchange="onTuerFilterChange('doppel')" style="width:18px;height:18px">
                Nur bei Doppeltür verwenden
            </label>
        </div>
        <div class="edit-field">
            <label style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" id="matNurEinzeltuer" ${m.nurEinzeltuer ? 'checked' : ''} onchange="onTuerFilterChange('einzel')" style="width:18px;height:18px">
                Nur bei Einzeltür verwenden
            </label>
        </div>

        <div id="matFieldsStange" style="display:none">
            <div class="edit-field"><label>Stangenlänge (m)</label><input type="number" id="matPurchaseLength" value="${m.purchaseLength || 6}" step="0.5"></div>
        </div>

        <!-- Farben-Verwaltung (v1.19.10) -->
        <div class="edit-field">
            <label>Farben-Verwaltung</label>
            <select id="matColorSource" onchange="renderMatColorPicker()">
                <option value="none">Keine — Material ist farbunabhängig</option>
                <option value="profile">Profile-Farben</option>
                <option value="plissee">Plissee-Farben</option>
            </select>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Bestimmt welche Farb-Stammdaten dem Material zugewiesen werden können.</div>
        </div>
        <div id="matFieldsColors" style="display:none">
            <div class="edit-field">
                <label>Verfügbare Farben für dieses Material</label>
                <div id="matColorCheckboxes" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px"></div>
            </div>
        </div>

        <!-- v1.19.13: Generische Dimensionen (gilt für ALLE Material-Typen) -->
        <div class="edit-field">
            <label>Größen / Dimensionen (optional)</label>
            <div id="matDimensionsCheckboxes" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px"></div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
                Wenn das Material in mehreren Größen geliefert wird (z.B. Bürstendichtung 67×700 + 67×1200), hier anhaken. Lager wird pro Größe getrennt geführt. Stammdaten unter Einstellungen → Material-Dimensionen pflegen.
            </div>
        </div>

        <div id="matFieldsFlaeche" style="display:none">
            <div class="edit-field"><label>Verbrauch pro m² – Einzeltür (Meter)</label><input type="number" id="matPerSqm" value="${m.perSqm || 0}" step="0.1" placeholder="z.B. 8.5"></div>
            <div class="edit-field">
                <label>Verbrauch pro m² – Doppeltür (Meter, optional)</label>
                <input type="number" id="matDtPerSqm" value="${m.dtPerSqm || ''}" step="0.1" placeholder="z.B. 13.1 – leer = wie Einzeltür">
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Wenn leer: bei Doppeltür wird derselbe Wert wie bei Einzeltür verwendet.</div>
            </div>
            <div class="edit-field"><label>Rollenlänge (m)</label><input type="number" id="matRolleLength" value="${m.purchaseLength || 500}" step="1"></div>
        </div>

        <div id="matFieldsStueck" style="display:none">
            <div class="edit-field"><label>Verbrauch pro Bestellung</label><input type="number" id="matPerOrder" value="${m.perOrder || 0}" step="0.1" placeholder="z.B. 4"></div>
            <div class="edit-field"><label>Einheit</label><input type="text" id="matUnit" value="${m.unit || 'Stück'}" placeholder="z.B. Stück, Meter, Rollen"></div>
        </div>

        <div id="matFieldsNetz" style="display:none">
            <!-- v1.19.12: Multi-Select Breiten aus Stammdaten (analog Farben-Picker).
                 Legacy: matNetzHoehen wird zusätzlich als hidden Komma-Wert mitgespeichert
                 für Backward-Compat (alte Wareneingang-Logik). -->
            <div class="edit-field">
                <label>Verfügbare Breiten</label>
                <div id="matNetzBreitenCheckboxes" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px"></div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
                    Mehrere Breiten möglich. Stammdaten unter Einstellungen → Netz-Breiten pflegen.
                </div>
            </div>
            <!-- Legacy Höhen-Feld (versteckt) für Übergangs-Kompatibilität -->
            <input type="hidden" id="matNetzHoehen" value="${(m.netzHoehen||[]).join(', ')}">
        </div>

        <div id="matFieldsMinStock">
            <div class="edit-field"><label id="matMinStockLabel">Mindestbestand</label>
                <div style="display:flex;gap:6px;align-items:center">
                    <input type="number" id="matMinStock" value="${m.minStock || 0}" placeholder="0 = keine Warnung" style="flex:1">
                    <span id="matMinStockUnit" style="font-size:13px;color:var(--text-muted);min-width:50px"></span>
                </div>
            </div>
        </div>
        <div id="matFieldsMinStockNetz" style="display:none">
            <div class="edit-field"><label>Mindestbestand Falten</label><input type="number" id="matMinStockFalten" value="${m.minStockFalten || 0}" placeholder="0 = keine Warnung"></div>
        </div>

        <div class="edit-field price-protected"><label>Einkaufspreis € (optional)</label><input type="number" id="matPrice" value="${m.price || ''}" step="0.01" placeholder="Pro Einheit"></div>

        <div style="display:flex;gap:8px;margin-top:16px">
            <button onclick="saveMaterial('${id||''}', this.closest('.confirm-overlay'))" style="flex:1;padding:13px;background:var(--primary);color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Speichern</button>
            ${!isNew ? `<button onclick="deleteMaterial('${id}', this.closest('.confirm-overlay'))" style="padding:13px 16px;background:var(--red);color:white;border:none;border-radius:12px;font-size:15px;cursor:pointer;font-family:inherit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
        </div>
    </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Farben-Source detektieren (Migration alte Materialien)
    let colorSource = m.colorSource;
    if (!colorSource) {
        // Legacy: byColor=false → keine Farb-Verwaltung
        // byColor=true + Farben matchen Plissee → plissee, sonst → profile
        if (m.byColor === false) {
            colorSource = 'none';
        } else if (Array.isArray(m.colors) && m.colors.length) {
            const matchesPlissee = m.colors.some(name =>
                (cachedPlisseeColors || []).find(c => c.name === name || c.id === name)
            );
            const matchesProfile = m.colors.some(name =>
                (cachedColors || []).find(c => c.name === name || c.id === name)
            );
            colorSource = (matchesPlissee && !matchesProfile) ? 'plissee' : 'profile';
        } else {
            colorSource = m.byColor ? 'profile' : 'none';
        }
    }
    document.getElementById('matColorSource').value = colorSource;
    // Material-Farben merken (als Namen — kompatibel zur Lager-Logik in 04-stock.js)
    window._editMatColors = Array.isArray(m.colors) ? [...m.colors] : [];
    // v1.19.12: Netz-Breiten-Auswahl initialisieren (als IDs aus den Stammdaten)
    window._editMatNetzBreiten = Array.isArray(m.netzBreiten) ? [...m.netzBreiten] : [];
    // v1.19.13: Generische Material-Dimensionen (gilt für alle Material-Typen)
    window._editMatDimensions = Array.isArray(m.dimensions) ? [...m.dimensions] : [];
    renderMatColorPicker();
    renderMatNetzBreitenPicker();
    renderMatDimensionsPicker();
    toggleMatFields();
}

// v1.19.13: Generischer Dimensionen-Picker (Multi-Select aus material_dimensions-Stammdaten)
// Wird für JEDES Material angezeigt, unabhängig vom Typ.
function renderMatDimensionsPicker() {
    const cbs = document.getElementById('matDimensionsCheckboxes');
    if (!cbs) return;
    const matType = document.getElementById('matType')?.value || 'any';
    const pool = (cachedMaterialDimensions || [])
        .filter(d => d.active !== false)
        .filter(d => !d.scope || d.scope === 'any' || d.scope === matType);
    // Orphan-Dimensionen aus Auswahl entfernen
    window._editMatDimensions = (window._editMatDimensions || []).filter(id =>
        pool.some(d => d.id === id)
    );
    const selected = window._editMatDimensions;
    if (!pool.length) {
        cbs.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px;background:#fef3c7;border-radius:6px">
            Noch keine passenden Dimensionen angelegt. Lege welche unter Einstellungen → Material-Dimensionen an.
        </div>`;
        return;
    }
    cbs.innerHTML = pool.map(d => {
        const isChecked = selected.includes(d.id);
        return `<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:var(--card);border:1px solid var(--border);border-radius:6px;cursor:pointer">
            <input type="checkbox" value="${esc(d.id)}" ${isChecked ? 'checked' : ''} onchange="toggleMatDimension('${esc(d.id)}', this.checked)" style="margin:0;width:14px;height:14px">
            <span style="font-size:12px;font-weight:600">${escHtml(d.label || d.id)}</span>
        </label>`;
    }).join('');
}

function toggleMatDimension(dimId, checked) {
    if (!window._editMatDimensions) window._editMatDimensions = [];
    const idx = window._editMatDimensions.indexOf(dimId);
    if (checked && idx < 0) window._editMatDimensions.push(dimId);
    if (!checked && idx >= 0) window._editMatDimensions.splice(idx, 1);
}

// v1.19.12: Multi-Select Picker für Netz-Breiten aus den Stammdaten
// v1.19.13: Picker komplett ausblenden wenn neuer Material-Dimensionen-Picker greift
// (also wenn cachedMaterialDimensions Daten enthält ODER wenn Material bereits dimensions[] hat).
function renderMatNetzBreitenPicker() {
    const cbs = document.getElementById('matNetzBreitenCheckboxes');
    if (!cbs) return;
    const netzWrap = document.getElementById('matFieldsNetz');
    // Wenn neue Dimensionen-Auswahl bereits gefüllt ist ODER Stammdaten-Pool existiert,
    // wird der alte Netz-Breiten-Picker komplett versteckt.
    const hasNewDimensions = (Array.isArray(window._editMatDimensions) && window._editMatDimensions.length)
        || ((cachedMaterialDimensions || []).filter(d => d.active !== false).length > 0);
    if (hasNewDimensions) {
        if (netzWrap) netzWrap.style.display = 'none';
        cbs.innerHTML = '';
        return;
    }
    const pool = (cachedNetzBreiten || []).filter(b => b.active !== false);
    // Orphan-Breiten aus Auswahl entfernen (wenn z.B. eine Breite gelöscht wurde)
    window._editMatNetzBreiten = (window._editMatNetzBreiten || []).filter(id =>
        pool.some(b => b.id === id)
    );
    const selected = window._editMatNetzBreiten;
    if (!pool.length) {
        cbs.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px;background:#fef3c7;border-radius:6px">
            Noch keine Netz-Breiten angelegt. Lege welche unter Einstellungen → Netz-Breiten an.
        </div>`;
        return;
    }
    cbs.innerHTML = pool.map(b => {
        const isChecked = selected.includes(b.id);
        const label = (b.name && b.name !== (b.cm + ' cm')) ? `${b.name} (${b.cm} cm)` : `${b.cm} cm`;
        return `<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:var(--card);border:1px solid var(--border);border-radius:6px;cursor:pointer">
            <input type="checkbox" value="${esc(b.id)}" ${isChecked ? 'checked' : ''} onchange="toggleMatNetzBreite('${esc(b.id)}', this.checked)" style="margin:0;width:14px;height:14px">
            <span style="font-size:12px;font-weight:600">${escHtml(label)}</span>
        </label>`;
    }).join('');
}

function toggleMatNetzBreite(breiteId, checked) {
    if (!window._editMatNetzBreiten) window._editMatNetzBreiten = [];
    const idx = window._editMatNetzBreiten.indexOf(breiteId);
    if (checked && idx < 0) window._editMatNetzBreiten.push(breiteId);
    if (!checked && idx >= 0) window._editMatNetzBreiten.splice(idx, 1);
}

function toggleMatFields() {
    const type = document.getElementById('matType')?.value;
    const stangeEl = document.getElementById('matFieldsStange');
    const stueckEl = document.getElementById('matFieldsStueck');
    const netzEl = document.getElementById('matFieldsNetz');
    const flaecheEl = document.getElementById('matFieldsFlaeche');
    const minStockNetzEl = document.getElementById('matFieldsMinStockNetz');
    const unitLabel = document.getElementById('matMinStockUnit');

    // Type-spezifische Felder ein-/ausblenden — keine Schnittliste-Verbrauchsart-Logik mehr.
    if (stangeEl) stangeEl.style.display = (type === 'stange' || type === 'rolle') ? 'block' : 'none';
    if (flaecheEl) flaecheEl.style.display = (type === 'flaeche') ? 'block' : 'none';
    if (stueckEl) stueckEl.style.display = (type === 'stueck') ? 'block' : 'none';
    // v1.19.13: Netz-Breiten-Picker nur zeigen wenn der neue Dimensionen-Picker NICHT existiert
    // (kein Pool in Stammdaten). Sonst übernehmen Material-Dimensionen die Aufgabe.
    const hasNewDimensions = (cachedMaterialDimensions || []).filter(d => d.active !== false).length > 0;
    if (netzEl) netzEl.style.display = (type === 'netz' && !hasNewDimensions) ? 'block' : 'none';
    if (minStockNetzEl) minStockNetzEl.style.display = (type === 'netz') ? 'block' : 'none';

    if (unitLabel) {
        const units = { stange: 'Stangen', netz: 'Falten', rolle: 'Meter', flaeche: 'Meter', stueck: document.getElementById('matUnit')?.value || 'Stück' };
        unitLabel.textContent = units[type] || 'Stück';
    }
    // v1.19.13: bei Typ-Wechsel den Dimensionen-Picker neu rendern (scope-Filter ändert sich)
    if (typeof renderMatDimensionsPicker === 'function') renderMatDimensionsPicker();
}

// v1.19.10: Farben-Picker — abhängig von der gewählten Quelle (Profile/Plissee/Keine)
function renderMatColorPicker() {
    const source = document.getElementById('matColorSource')?.value || 'none';
    const colorsDiv = document.getElementById('matFieldsColors');
    const cbs = document.getElementById('matColorCheckboxes');
    if (!colorsDiv || !cbs) return;
    if (source === 'none') { colorsDiv.style.display = 'none'; cbs.innerHTML = ''; return; }
    colorsDiv.style.display = 'block';

    const pool = source === 'plissee' ? (cachedPlisseeColors || []) : (cachedColors || []);

    // Orphan-Farben aus dem _editMatColors-State entfernen: Farben die im aktuellen
    // Pool (Profile bzw. Plissee) nicht mehr existieren, sollen beim nächsten Save
    // mit aus Firestore verschwinden. So räumen wir Altlasten aus der alten
    // Komma-Eingabe automatisch auf.
    window._editMatColors = (window._editMatColors || []).filter(name =>
        pool.some(c => c.name === name || c.id === name)
    );
    const selected = window._editMatColors;

    if (!pool.length) {
        cbs.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px;background:#fef3c7;border-radius:6px">
            Noch keine Farben in dieser Verwaltung angelegt. Lege Farben unter Einstellungen → Farben (bzw. Plissee-Farben) an.
        </div>`;
        return;
    }
    cbs.innerHTML = pool.map(c => {
        const isChecked = selected.includes(c.name) || selected.includes(c.id);
        const bg = c.bg || c.hex || '#888';
        const isLight = bg && /^#?(?:fff|fefefe|f5f5f5|eee|e0e0e0)/i.test(bg);
        return `<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:var(--card);border:1px solid var(--border);border-radius:6px;cursor:pointer">
            <input type="checkbox" value="${esc(c.name)}" ${isChecked ? 'checked' : ''} onchange="toggleMatColor('${esc(c.name)}', this.checked)" style="margin:0;width:14px;height:14px">
            <span style="display:inline-block;width:14px;height:14px;background:${bg};border-radius:3px;border:1px solid ${isLight ? '#999' : 'rgba(0,0,0,0.1)'}"></span>
            <span style="font-size:12px;font-weight:600">${escHtml(c.name)}</span>
        </label>`;
    }).join('');
}

function toggleMatColor(colorName, checked) {
    if (!window._editMatColors) window._editMatColors = [];
    const idx = window._editMatColors.indexOf(colorName);
    if (checked && idx < 0) window._editMatColors.push(colorName);
    if (!checked && idx >= 0) window._editMatColors.splice(idx, 1);
}

async function saveMaterial(id, overlay) {
    const name = document.getElementById('matName').value.trim();
    const type = document.getElementById('matType').value;
    const purchaseLength = parseFloat(document.getElementById('matPurchaseLength')?.value) || parseFloat(document.getElementById('matRolleLength')?.value) || 0;
    const perOrder = parseFloat(document.getElementById('matPerOrder')?.value) || 0;
    const perSqm = parseFloat(document.getElementById('matPerSqm')?.value) || 0;
    const dtPerSqmRaw = parseFloat(document.getElementById('matDtPerSqm')?.value);
    const dtPerSqm = (!isNaN(dtPerSqmRaw) && dtPerSqmRaw > 0) ? dtPerSqmRaw : null;
    const unit = document.getElementById('matUnit')?.value || 'Stück';
    const minStock = parseFloat(document.getElementById('matMinStock')?.value) || 0;
    const minStockFalten = parseFloat(document.getElementById('matMinStockFalten')?.value) || 0;
    const price = parseFloat(document.getElementById('matPrice')?.value) || 0;
    const netzHoehenStr = document.getElementById('matNetzHoehen')?.value || '';
    const netzHoehen = netzHoehenStr.split(',').map(s => parseFloat(s.trim())).filter(n => n > 0);
    // v1.19.12: Multi-Select Breiten aus Stammdaten (IDs)
    const netzBreiten = Array.isArray(window._editMatNetzBreiten) ? [...window._editMatNetzBreiten] : [];
    // v1.19.13: Generische Dimensionen — gilt für alle Material-Typen, IDs aus material_dimensions
    const dimensions = Array.isArray(window._editMatDimensions) ? [...window._editMatDimensions] : [];

    // Aktiv-Flag und Tür-Filter
    const active = document.getElementById('matActive')?.checked !== false;
    const nurDoppeltuer = document.getElementById('matNurDoppeltuer')?.checked || false;
    const nurEinzeltuer = document.getElementById('matNurEinzeltuer')?.checked || false;

    if (!name) { showToast('Bitte Name eingeben.', 'warning'); return; }

    // Farben-Verwaltung (v1.19.10):
    // colorSource → 'none' | 'profile' | 'plissee'
    // colors[]    → Array von Farb-NAMEN (kompatibel zu 04-stock.js)
    // byColor     → wird aus colorSource abgeleitet (Legacy-Feld für 04-stock.js)
    const colorSource = document.getElementById('matColorSource')?.value || 'none';
    const colors = (colorSource === 'none') ? [] : [...(window._editMatColors || [])];
    const byColor = colorSource !== 'none';

    // Schnittliste-Funktion in Materialien wurde entfernt (v1.19.10) — Cuts werden ausschließlich
    // im Modell-Editor verwaltet. Hier wird kategorie auf 'B' gesetzt (keine Schnittliste-Anzeige).
    const data = {
        name, category: 'B', type, purchaseLength,
        colorSource, byColor, colors,
        perOrder, perSqm, dtPerSqm, unit,
        minStock, minStockFalten, price, netzHoehen, netzBreiten, dimensions,
        active, nurDoppeltuer, nurEinzeltuer,
        // Felder die im Editor entfernt wurden — wir clearen sie aktiv damit alte Daten weg sind.
        cuts: firebase.firestore.FieldValue.delete(),
        rechnerFields: firebase.firestore.FieldValue.delete(),
        showInRechner: firebase.firestore.FieldValue.delete(),
        colorMapping: firebase.firestore.FieldValue.delete()
    };

    try {
        if (id) {
            await db.collection('materials').doc(id).update(data);
        } else {
            // Bei NEUEN Materialien können wir nicht .delete() in set() nutzen — Felder weglassen.
            const newData = { ...data };
            delete newData.cuts; delete newData.rechnerFields; delete newData.showInRechner; delete newData.colorMapping;
            const snap = await db.collection('materials').get();
            newData.sortOrder = snap.size;
            await db.collection('materials').add(newData);
        }
        showToast('Material gespeichert!', 'success');
        overlay.remove();
        loadMaterials();
        loadRechnerMaterials();
    } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
}

async function deleteMaterial(id, overlay) {
    showConfirm('Material löschen', 'Dieses Material wirklich löschen?', 'Löschen', async () => {
        try {
            await db.collection('materials').doc(id).delete();
            showToast('Material gelöscht.', 'success');
            overlay.remove();
            loadMaterials();
        } catch(e) { showToast('Fehler: ' + e.message, 'error'); }
    });
}

// ═══ MODELL-BILDER (v1.19.2) ═══════════════════════════════════
// State: window._editModelImages = [{ url, path, sortOrder }]
//        window._editModelId = string | null

function renderModelImagesList() {
    const el = document.getElementById('modelImagesList');
    if (!el) return;
    const imgs = window._editModelImages || [];
    if (!imgs.length) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:14px;text-align:center;background:var(--bg-secondary,#f9fafb);border-radius:8px;border:1px dashed var(--border)">Noch keine Bilder. Klicke auf „+ Bilder hochladen".</div>';
        return;
    }
    el.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
            ${imgs.map((img, i) => `
                <div style="position:relative;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff">
                    <img src="${escHtml(img.url)}" style="width:100%;height:90px;object-fit:cover;display:block">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;font-size:10px;background:var(--bg-secondary,#f9fafb)">
                        <span style="font-weight:700;color:var(--text-muted)">#${i + 1}</span>
                        <div style="display:flex;gap:2px">
                            <button type="button" title="Nach oben" onclick="moveModelImage(${i}, -1)" ${i === 0 ? 'disabled' : ''} style="padding:2px 5px;background:var(--card);border:1px solid var(--border);border-radius:4px;cursor:${i === 0 ? 'not-allowed' : 'pointer'};font-family:inherit;font-size:10px;opacity:${i === 0 ? '0.3' : '1'}">▲</button>
                            <button type="button" title="Nach unten" onclick="moveModelImage(${i}, 1)" ${i === imgs.length - 1 ? 'disabled' : ''} style="padding:2px 5px;background:var(--card);border:1px solid var(--border);border-radius:4px;cursor:${i === imgs.length - 1 ? 'not-allowed' : 'pointer'};font-family:inherit;font-size:10px;opacity:${i === imgs.length - 1 ? '0.3' : '1'}">▼</button>
                            <button type="button" title="Löschen" onclick="deleteModelImage(${i})" style="padding:2px 5px;background:var(--red);color:white;border:none;border-radius:4px;cursor:pointer;font-family:inherit;font-size:10px">×</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function moveModelImage(idx, dir) {
    const imgs = window._editModelImages || [];
    const target = idx + dir;
    if (target < 0 || target >= imgs.length) return;
    [imgs[idx], imgs[target]] = [imgs[target], imgs[idx]];
    // sortOrder synchronisieren
    imgs.forEach((img, i) => { img.sortOrder = i; });
    persistModelImages();
    renderModelImagesList();
}

async function deleteModelImage(idx) {
    const imgs = window._editModelImages || [];
    const img = imgs[idx];
    if (!img) return;
    showConfirm('Bild löschen?', 'Das Bild wird sofort aus Storage und Modell entfernt. Nicht rückgängig.', 'Löschen', async () => {
        try {
            // Aus Cloud Storage löschen
            if (img.path) {
                try { await firebase.storage().ref(img.path).delete(); } catch(e) { console.warn('Storage delete:', e); }
            }
            imgs.splice(idx, 1);
            imgs.forEach((im, i) => { im.sortOrder = i; });
            await persistModelImages();
            renderModelImagesList();
            showToast('Bild gelöscht.', 'success');
        } catch (e) {
            showToast('Fehler beim Löschen: ' + e.message, 'error');
        }
    });
}

async function onModelImageUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const modelId = window._editModelId;
    if (!modelId) {
        showToast('Bitte zuerst das Modell speichern.', 'warning');
        event.target.value = '';
        return;
    }
    const btn = event.target.previousElementSibling;
    if (btn) { btn.disabled = true; btn.textContent = `↑ Lade ${files.length} Bild(er)…`; }

    try {
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            const resizedBlob = await resizeImageBlob(file, 1600, 0.85);
            const filename = `${Date.now()}-${randomSuffix()}.jpg`;
            const path = `models/${modelId}/${filename}`;
            const ref = firebase.storage().ref(path);
            const snapshot = await ref.put(resizedBlob, { contentType: 'image/jpeg' });
            const url = await snapshot.ref.getDownloadURL();
            const imgs = window._editModelImages || [];
            imgs.push({ url, path, sortOrder: imgs.length });
            window._editModelImages = imgs;
        }
        await persistModelImages();
        renderModelImagesList();
        showToast(`${files.length} Bild(er) hochgeladen.`, 'success');
    } catch (e) {
        console.error('Upload error:', e);
        showToast('Upload fehlgeschlagen: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '+ Bilder hochladen'; }
        event.target.value = '';
    }
}

// Resize-Helper: lädt File, skaliert auf maxBreite (Höhe proportional), gibt JPEG-Blob zurück.
function resizeImageBlob(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
        reader.onload = e => {
            const img = new Image();
            img.onerror = () => reject(new Error('Bild konnte nicht dekodiert werden'));
            img.onload = () => {
                const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
                const w = Math.round(img.width * ratio);
                const h = Math.round(img.height * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Encoding fehlgeschlagen')), 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function randomSuffix() {
    return Math.random().toString(36).slice(2, 8);
}

// Speichert die aktuelle Bilder-Liste sofort in Firestore (damit Sortierung
// nicht verloren geht falls der User die Modal-Form ohne Speichern schließt).
async function persistModelImages() {
    const modelId = window._editModelId;
    if (!modelId) return;
    await db.collection('models').doc(modelId).update({
        images: window._editModelImages || []
    });
}

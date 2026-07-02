// ═══════════════════════════════════════════════════════════════════
// 12-mat-forecast.js — Materialbedarf für offene Bestellungen (v1.19.48)
//
// Aggregiert den Material-Verbrauch ALLER offenen Bestellungen (Spalten
// Bestellung + In Produktion + Warteliste, ohne Reparatur und B-Ware) via
// computeOrderMatVerbrauch() aus 07-board.js. Damit teilen Forecast und
// realer Warenausgang (deductInventory) die exakt gleiche Logik.
//
// Globale Abhängigkeiten:
//   - computeOrderMatVerbrauch (07-board.js)
//   - orders, cachedModels, cachedColors, filialen (index.html inline)
//   - db (Firebase)
//   - t, escHtml, showToast, formatNum
// ═══════════════════════════════════════════════════════════════════

const FORECAST_OPEN_COLUMNS = ['Bestellung', 'In Produktion', 'Warteliste'];

let _forecastMaterials = null;

async function _loadForecastMaterials(force) {
    if (_forecastMaterials && !force) return _forecastMaterials;
    const snap = await db.collection('materials').get();
    _forecastMaterials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return _forecastMaterials;
}

function _formatForecastValue(verbrauch, einheit) {
    if (einheit === 'Meter') return verbrauch.toFixed(2) + ' m';
    if (einheit === 'Falten') return Math.ceil(verbrauch) + ' Falten';
    if (einheit === 'Stück') return Math.ceil(verbrauch) + ' Stück';
    return verbrauch.toFixed(2) + ' ' + (einheit || '');
}

// v1.19.48: Für stange-Materialien zusätzlich Anzahl benötigter Stangen anzeigen
// (Math.ceil(meter / purchaseLength)) — purchaseLength steht im Material (z.B. 6 m).
function _formatStangenSuffix(verbrauch, type, purchaseLength) {
    if (type !== 'stange') return '';
    const len = parseFloat(purchaseLength);
    if (!len || len <= 0) return '';
    const stk = Math.ceil(verbrauch / len);
    return ` <span style="color:var(--text-muted);font-weight:600;font-size:11px">· ${stk} Stangen à ${len} m</span>`;
}

async function computeMaterialForecast(filialeId) {
    const materials = await _loadForecastMaterials();

    const open = (orders || []).filter(o =>
        FORECAST_OPEN_COLUMNS.includes(o.column) &&
        !o.isReparatur &&
        (!filialeId || o.filialeId === filialeId)
    );

    const agg = {};
    // v1.19.48: Modelle die in den offenen Bestellungen vorkommen
    const usedModelIds = new Set();
    for (const order of open) {
        const rows = computeOrderMatVerbrauch(order, materials, cachedModels);
        (order.measures || []).forEach(m => { if (m.modelId) usedModelIds.add(m.modelId); });
        for (const r of rows) {
            if (!agg[r.materialId]) {
                const mat = materials.find(m => m.id === r.materialId);
                agg[r.materialId] = {
                    materialId: r.materialId,
                    name: r.materialName,
                    type: r.materialType,
                    einheit: r.einheit,
                    sortOrder: (mat && mat.sortOrder) || 0,
                    purchaseLength: (mat && mat.purchaseLength) || 0,
                    byColor: !!r.farbe,
                    totalAll: 0,
                    byFarbe: {}
                };
            }
            agg[r.materialId].totalAll += r.verbrauch;
            const farbe = r.farbe || '—';
            agg[r.materialId].byFarbe[farbe] = (agg[r.materialId].byFarbe[farbe] || 0) + r.verbrauch;
        }
    }

    // Diagnose: aktive Materialien die in den verwendeten Modellen NICHT cuts haben
    // (= taucht im Forecast nicht auf, weil das Modell sie nicht referenziert)
    const usedModels = (cachedModels || []).filter(md => usedModelIds.has(md.id));
    const referencedMatIds = new Set();
    const modelDetails = []; // pro Modell: was hat es als Cut?
    usedModels.forEach(md => {
        const mats = md.sections && md.sections[0] && md.sections[0].materials || [];
        const matList = [];
        const orphans = []; // referenziert, aber Material gelöscht oder ohne cuts
        mats.forEach(mm => {
            const matInfo = materials.find(x => x.id === mm.materialId);
            const cutsCount = (mm.cuts || []).length;
            if (mm.materialId && cutsCount) referencedMatIds.add(mm.materialId);
            if (!matInfo) {
                orphans.push({ name: '(unbekannt: ' + mm.materialId + ')', cutsCount });
            } else if (cutsCount === 0) {
                orphans.push({ name: matInfo.name, cutsCount: 0 });
            } else {
                matList.push({ name: matInfo.name, type: matInfo.type, cuts: cutsCount });
            }
        });
        modelDetails.push({ id: md.id, name: md.name, materials: matList, orphans });
    });
    const missingMaterials = materials
        .filter(m => m.active !== false && m.category === 'A' && !referencedMatIds.has(m.id) && !m.perOrder && !(m.type === 'flaeche' && m.perSqm))
        .map(m => ({ id: m.id, name: m.name, type: m.type }));

    // v1.19.48d: Auch Bestellungen ohne modelId zählen — wichtig wenn der Forecast
    // unerwartet leer wirkt weil viele Bestellungen Legacy sind.
    let ordersWithoutModelCount = 0;
    open.forEach(o => {
        const hasModel = (o.measures || []).some(m => !!m.modelId);
        if (!hasModel) ordersWithoutModelCount++;
    });

    return {
        aggregation: agg,
        orderCount: open.length,
        usedModels: usedModels.map(m => ({ id: m.id, name: m.name })),
        modelDetails,
        missingMaterials,
        ordersWithoutModelCount,
        totalModelsInSystem: (cachedModels || []).length
    };
}

function _populateForecastFilialeSelect() {
    const sel = document.getElementById('forecastFilialeSelect');
    if (!sel || !Array.isArray(filialen)) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">' + escHtml(t('Alle Filialen')) + '</option>' +
        filialen.map(f => `<option value="${escHtml(f.id)}">${escHtml(f.name)}</option>`).join('');
    if (prev) sel.value = prev;
}

async function loadMatForecast() {
    const contentEl = document.getElementById('matForecastContent');
    if (!contentEl) return;
    _populateForecastFilialeSelect();
    contentEl.innerHTML = '<div class="loading" style="padding:12px">' + escHtml(t('Wird geladen...')) + '</div>';

    try {
        const filialeId = document.getElementById('forecastFilialeSelect')?.value || '';
        const { aggregation, orderCount, usedModels, modelDetails, missingMaterials, ordersWithoutModelCount, totalModelsInSystem } = await computeMaterialForecast(filialeId);

        const mats = Object.values(aggregation).sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
            return (a.name || '').localeCompare(b.name || '');
        });

        if (!mats.length) {
            contentEl.innerHTML = `<div class="card" style="text-align:center;color:var(--text-muted);padding:24px">
                ${escHtml(t('Berechnet über'))} <strong>${orderCount}</strong> ${escHtml(t('offene Bestellungen'))}.<br>
                ${escHtml(t('Keine Daten zum Export.'))}
            </div>`;
            return;
        }

        const colorSortMap = new Map();
        (typeof cachedColors !== 'undefined' && Array.isArray(cachedColors) ? cachedColors : [])
            .forEach((c, i) => colorSortMap.set(c.name, c.sortOrder != null ? c.sortOrder : i));

        let html = `<div class="card" style="padding:10px 14px;background:var(--primary-bg);font-size:13px;color:var(--primary);font-weight:600">
            ${escHtml(t('Berechnet über'))} <strong>${orderCount}</strong> ${escHtml(t('offene Bestellungen'))}.
        </div>`;

        html += `<div class="card" style="padding:0;overflow:hidden">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                    <tr style="background:var(--border-light);text-transform:uppercase;font-size:11px;letter-spacing:0.04em;color:var(--text-muted)">
                        <th style="text-align:left;padding:10px 12px">${escHtml(t('Material'))}</th>
                        <th style="text-align:right;padding:10px 12px">${escHtml(t('Gesamt'))}</th>
                    </tr>
                </thead>
                <tbody>`;

        mats.forEach(m => {
            const colorEntries = Object.entries(m.byFarbe).sort((a, b) => {
                const sa = colorSortMap.has(a[0]) ? colorSortMap.get(a[0]) : 999;
                const sb = colorSortMap.has(b[0]) ? colorSortMap.get(b[0]) : 999;
                if (sa !== sb) return sa - sb;
                return a[0].localeCompare(b[0]);
            });

            const stangenSuffixTotal = _formatStangenSuffix(m.totalAll, m.type, m.purchaseLength);
            html += `<tr style="border-top:1px solid var(--border-light)">
                <td style="padding:10px 12px;font-weight:700">${escHtml(m.name)} <span style="font-size:10px;color:var(--text-muted);font-weight:500;text-transform:uppercase;margin-left:6px">${escHtml(m.type)}</span></td>
                <td style="padding:10px 12px;text-align:right;font-weight:700">${escHtml(_formatForecastValue(m.totalAll, m.einheit))}${stangenSuffixTotal}</td>
            </tr>`;

            if (m.byColor && colorEntries.length > 1) {
                colorEntries.forEach(([farbe, val]) => {
                    const stangenSuffix = _formatStangenSuffix(val, m.type, m.purchaseLength);
                    html += `<tr style="background:#fafafa">
                        <td style="padding:6px 12px 6px 28px;font-size:12px;color:var(--text-secondary)">
                            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escHtml(farbeColor(farbe))};vertical-align:middle;margin-right:6px"></span>${escHtml(farbe)}
                        </td>
                        <td style="padding:6px 12px;text-align:right;font-size:12px;color:var(--text-secondary)">${escHtml(_formatForecastValue(val, m.einheit))}${stangenSuffix}</td>
                    </tr>`;
                });
            } else if (m.byColor && colorEntries.length === 1) {
                const [farbe] = colorEntries[0];
                html += `<tr style="background:#fafafa">
                    <td style="padding:6px 12px 6px 28px;font-size:12px;color:var(--text-secondary)">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escHtml(farbeColor(farbe))};vertical-align:middle;margin-right:6px"></span>${escHtml(farbe)}
                    </td>
                    <td style="padding:6px 12px;text-align:right;font-size:12px;color:var(--text-secondary)">—</td>
                </tr>`;
            }
        });

        html += '</tbody></table></div>';

        // v1.19.48d: Diagnose — detailliert pro Modell anzeigen welche Materialien
        // mit Cuts referenziert sind, plus globale Liste der fehlenden Materialien.
        html += `<div class="card" style="margin-top:14px;padding:12px 14px;background:#fefce8;border:1px solid #fcd34d;font-size:12px;color:#78350f">
            <div style="font-weight:700;margin-bottom:6px">🔍 Diagnose</div>`;

        if (ordersWithoutModelCount > 0) {
            html += `<div style="margin-bottom:8px;padding:8px;background:#fef3c7;border-radius:6px">
                <strong>⚠️ ${ordersWithoutModelCount}</strong> offene Bestellungen haben <strong>kein Modell</strong> zugewiesen — diese werden via Material-Fallback gerechnet.
            </div>`;
        }

        if (usedModels && usedModels.length) {
            html += `<div style="margin-bottom:8px"><strong>Verwendete Modelle (${usedModels.length} von ${totalModelsInSystem}):</strong></div>`;
            modelDetails.forEach(md => {
                html += `<details style="margin-bottom:6px;background:rgba(255,255,255,0.6);border-radius:6px;padding:6px 10px">
                    <summary style="cursor:pointer;font-weight:700">${escHtml(md.name)} <span style="font-weight:500;color:var(--text-muted)">(${md.materials.length} Materialien mit Cuts${md.orphans.length ? ', ' + md.orphans.length + ' ohne Cuts/orphan' : ''})</span></summary>
                    ${md.materials.length ? `<div style="margin-top:6px"><strong>Materialien mit Cuts:</strong>
                        <ul style="margin:4px 0 0 18px;padding:0">${md.materials.map(x => `<li>${escHtml(x.name)} <span style="color:var(--text-muted)">(${escHtml(x.type)} · ${x.cuts} cut${x.cuts>1?'s':''})</span></li>`).join('')}</ul></div>` : ''}
                    ${md.orphans.length ? `<div style="margin-top:6px;color:#b45309"><strong>⚠️ Materialien OHNE Cuts oder gelöscht:</strong>
                        <ul style="margin:4px 0 0 18px;padding:0">${md.orphans.map(x => `<li>${escHtml(x.name)}</li>`).join('')}</ul></div>` : ''}
                </details>`;
            });
        } else {
            html += `<div style="margin-bottom:8px;color:#dc2626"><strong>⚠️ Keine offenen Bestellung mit Modell-Zuordnung gefunden.</strong></div>`;
        }

        if (missingMaterials && missingMaterials.length) {
            html += `<div style="margin-top:10px"><strong>Aktive Kategorie-A Materialien NICHT im Forecast</strong> (in keinem verwendeten Modell als Cut referenziert):</div>
                <ul style="margin:6px 0 0 18px;padding:0">${missingMaterials.map(m => `<li>${escHtml(m.name)} <span style="color:var(--text-muted)">(${escHtml(m.type)})</span></li>`).join('')}</ul>
                <div style="margin-top:6px;color:var(--text-muted)">→ Falls relevant: Stammdaten → Modelle → entsprechendes Modell → Schnittliste → Material mit Cuts ergänzen.</div>`;
        } else if (usedModels.length) {
            html += `<div style="margin-top:8px;color:#16a34a">✓ Alle aktiven Kategorie-A Materialien sind in mindestens einem verwendeten Modell referenziert.</div>`;
        }

        html += `</div>`;

        contentEl.innerHTML = html;
        if (typeof applyTranslationsToElement === 'function') applyTranslationsToElement(contentEl);
    } catch (e) {
        console.error('loadMatForecast:', e);
        contentEl.innerHTML = `<div class="card" style="color:var(--red);padding:14px">${escHtml(t('Fehler:'))} ${escHtml(e.message || String(e))}</div>`;
    }
}

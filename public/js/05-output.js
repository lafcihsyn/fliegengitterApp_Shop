// ═══════════════════════════════════════════════════════════════════
// 05-output.js — Ausgabe & Anzeige
//
// Bündelt Funktionen zur Daten-Ausgabe an den Nutzer:
//
//   - PRINT (Etikett-Druck via Brother-App):
//       generateEtikett, druckenDirekt, druckenShare, druckenDownload,
//       cleanTSPL, rechnerToAbholbereit, updateRechnerAbholbereitBtn
//
//   - DASHBOARD (Statistik / Umsatz):
//       renderDashboard
//
//   - PDF EXPORT (Bestellungs-PDF mit Firmendaten):
//       exportOrderPDF
//
// Wird wie 03/04 NACH dem inline-Script geladen. Diese Funktionen werden
// nur durch User-Klick oder andere Funktionen aufgerufen, kein Init-Code.
//
// Globale Abhängigkeiten (im inline script):
//   - showToast, t, hasPerm, currentUser, cachedCompanyData, orders, ...
// ═══════════════════════════════════════════════════════════════════

// ═══ PRINT ═══
// Generate label canvas
function generateEtikett() {
    const canvas = document.getElementById('etikettCanvas');
    if (!canvas) return null;
    canvas.width = 720;
    canvas.height = 430;
    const ctx = canvas.getContext('2d');

    // kunde/telefon Inputs gibt's seit v1.15.0-p7 nicht mehr — Daten aus aktueller Slide nehmen
    const currentS = summarySlides && summarySlides[currentSlide];
    const k = (document.getElementById('kunde')?.value) || (currentS && currentS.kunde) || '';
    const t = (document.getElementById('telefon')?.value) || '';
    const b = document.getElementById('breite').value || '0';
    const h = document.getElementById('hoehe').value || '0';
    // v1.18.22: Auf dem Etikett die ursprüngliche Maß-Stückzahl anzeigen
    // (jede Slide ist 1 Stück, aber das Etikett soll "Stk: 2" zeigen wenn das Maß 2x bestellt wurde).
    const s = (currentS && currentS.displayTotalStueck != null)
        ? String(currentS.displayTotalStueck)
        : (document.getElementById('stueckzahl').value || '1');
    const fil = rechnerFiliale || currentUserFiliale || '';

    // v1.18.11: Firmendaten werden für das Etikett nicht mehr benötigt
    // (Logo und Firmenname werden vom TSPL-Drucker nicht gedruckt).

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 720, 430);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    ctx.font = 'bold 72px sans-serif';
    ctx.fillText(k || '-', 36, 20);

    let y = 100;
    if (t) {
        ctx.font = '42px sans-serif';
        ctx.fillText('Tel: ' + t, 36, y);
        y += 55;
    }

    y += 10;
    ctx.beginPath();
    ctx.moveTo(36, y);
    ctx.lineTo(684, y);
    ctx.lineWidth = 2;
    ctx.stroke();
    y += 25;

    ctx.font = 'bold 68px sans-serif';
    ctx.fillText(b + ' \u00D7 ' + h + ' cm', 36, y);

    // v1.16.8-p5: Firmenname entfernt — Logo (rechts unten) und Filiale reichen
    y += 80;

    ctx.font = '42px sans-serif';
    ctx.fillText(selectedColor + '  /  Stk: ' + s, 36, y);

    // Order number links unten + Datum
    const orderNrCanvas = summarySlides[currentSlide]?.orderNumber || '';
    const dateStr = new Date().toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'});
    if (orderNrCanvas) {
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('Best: ' + dateStr, 36, 350);
        ctx.fillText(orderNrCanvas, 36, 385);
    } else {
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('Best: ' + dateStr, 36, 385);
    }

    // v1.16.8-p3/p5: Stk-Position rechts oben — immer (auch 1/1)
    let totalStkAllSlides = 0;
    let stkIndexCurrent = 0;
    if (summarySlides && summarySlides.length > 0) {
        summarySlides.forEach((sl, idx) => {
            const slStk = sl.stueck || 1;
            if (idx < currentSlide) stkIndexCurrent += slStk;
            totalStkAllSlides += slStk;
        });
        stkIndexCurrent += 1;
    } else {
        totalStkAllSlides = 1; stkIndexCurrent = 1;
    }
    // v1.18.10: Stk-Position von rechts oben (y=30) nach rechts mittig (y=285)
    // verschoben — direkt unter der Filiale-Anzeige. Lange Kundennamen oben
    // links überdecken die Stückzahl-Anzeige nicht mehr, und der Logo-Bereich
    // unten rechts (y=300+) wird nicht berührt.
    ctx.font = 'bold 36px sans-serif';
    const stkText = stkIndexCurrent + '/' + totalStkAllSlides;
    const sw = ctx.measureText(stkText).width;
    ctx.fillStyle = '#534AB7'; // primary color
    ctx.fillText(stkText, 684 - sw, 285);
    ctx.fillStyle = '#000000';

    // v1.16.8-p5: Filiale rechts mittig — immer anzeigen
    if (fil) {
        ctx.font = 'bold 36px sans-serif';
        const tw = ctx.measureText(fil).width;
        ctx.fillText(fil, 684 - tw, 240);
    }

    // v1.18.11: Logo aus dem Etikett-Canvas entfernt.
    // Der ARTDEV AL-D460 (TSPL-Thermo-Drucker) druckt nur Text/Linien,
    // also war das Logo nur in der Bildschirm-Vorschau zu sehen und hat verwirrt.
    // Die Vorschau zeigt jetzt 1:1 was gedruckt wird.

    return canvas;
}

// Update preview when inputs change
const origRenderAll = renderAll;
renderAll = function() {
    origRenderAll.call ? origRenderAll() : (renderSummary(), renderTable(), renderAbstand(),
        (() => { const bVal = parseFloat(document.getElementById('breite').value)||0; const hVal = parseFloat(document.getElementById('hoehe').value)||0; if(bVal && hVal) checkBWare(bVal, hVal, selectedColor); })());
    generateEtikett();
};

// ARTDEV Print Server URL (Termux on Tablet)
const PRINT_SERVER = 'http://192.168.0.190:8150';

// Direct print via ARTDEV AL-D460 (TSPL)
async function druckenDirekt() {
    if (!hasPerm('rechner_print')) { showToast('Keine Berechtigung.', 'warning'); return; }

    // kunde/telefon Inputs gibt's seit v1.15.0-p7 nicht mehr — Daten aus aktueller Slide nehmen
    const currentS = summarySlides && summarySlides[currentSlide];
    const k = (document.getElementById('kunde')?.value) || (currentS && currentS.kunde) || '-';
    const t = (document.getElementById('telefon')?.value) || '';
    const b = document.getElementById('breite').value || '0';
    const h = document.getElementById('hoehe').value || '0';
    // v1.18.22: Stk auf Etikett = ursprüngliche Maß-Stückzahl der Bestellung (z.B. "Stk: 2"),
    // copies = 1 (jede Slide = 1 Etikett, der User druckt jede Slide separat).
    // Vorher: copies = s (z.B. 2 bei "Stk: 2") — funktioniert nicht mehr, weil jede Slide eh nur 1 Stk hat
    // und sonst 2x2=4 Etiketten gedruckt würden.
    const sDisplay = (currentS && currentS.displayTotalStueck != null)
        ? String(currentS.displayTotalStueck)
        : (document.getElementById('stueckzahl').value || '1');
    const fil = rechnerFiliale || currentUserFiliale || '';
    const copies = 1;

    // Build TSPL command for 100mm x 50mm label
    let tspl = 'SIZE 100 mm, 50 mm\n';
    tspl += 'GAP 3 mm, 0 mm\n';
    tspl += 'CODEPAGE 1254\n'; // Windows-Turkish (deckt auch alle deutschen Umlaute ab) v1.17.2
    tspl += 'CLS\n';
    tspl += `TEXT 40,15,"5",0,1,1,"${cleanTSPL(k)}"\n`;
    // v1.16.8-p3/p5: Stk-Position rechts oben (z.B. "1/5") — immer drucken, auch 1/1
    let totalStkAll = 0, stkIdx = 0;
    if (summarySlides && summarySlides.length > 0) {
        summarySlides.forEach((sl, idx) => {
            const slStk = sl.stueck || 1;
            if (idx < currentSlide) stkIdx += slStk;
            totalStkAll += slStk;
        });
        stkIdx += 1;
    } else {
        totalStkAll = 1; stkIdx = 1;
    }
    // v1.18.10: Stk-Position von rechts oben (580,15) nach rechts mittig (650,260)
    // verschoben — direkt unter der Filiale (450,290). Lange Kundennamen
    // überdecken die "1/5"-Anzeige nicht mehr.
    tspl += `TEXT 650,260,"3",0,1,1,"${stkIdx}/${totalStkAll}"\n`;
    if (t) tspl += `TEXT 40,75,"3",0,1,1,"Tel: ${cleanTSPL(t)}"\n`;
    tspl += 'BAR 40,120,720,3\n';
    tspl += `TEXT 40,140,"5",0,1,1,"${b} x ${h} cm"\n`;
    // v1.16.8-p5: Firmenname entfernt — wird durch Logo (PDF/Canvas) und Filiale (rechts unten) abgedeckt
    tspl += `TEXT 40,215,"4",0,1,1,"${cleanTSPL(selectedColor)}  /  Stk: ${sDisplay}"\n`;
    const heute = new Date().toLocaleDateString('de-AT');
    const orderNr = summarySlides[currentSlide]?.orderNumber || '';
    const bestellDatum = summarySlides[currentSlide]?.bestelldatum || '';
    const fristDatum = summarySlides[currentSlide]?.frist || '';
    let datumLine = heute;
    if (bestellDatum) datumLine = 'Best: ' + bestellDatum.split('-').reverse().join('.');
    if (fristDatum) datumLine += '  Frist: ' + fristDatum.split('-').reverse().join('.');
    tspl += `TEXT 40,260,"2",0,1,1,"${datumLine}"\n`;
    if (orderNr) tspl += `TEXT 40,290,"3",0,1,1,"${cleanTSPL(orderNr)}"\n`;
    if (fil) tspl += `TEXT 450,290,"3",0,1,1,"${cleanTSPL(fil)}"\n`;
    tspl += `PRINT ${copies},1\n`;

    // Open print server in new window (bypasses mixed content)
    const printUrl = PRINT_SERVER + '?tspl=' + encodeURIComponent(tspl);
    const printWin = window.open(printUrl, 'printwin', 'width=300,height=200');
    if (printWin) {
        showToast(`${copies > 1 ? copies + ' Etiketten' : 'Etikett'} gedruckt!`, 'success');
        setTimeout(() => { try { printWin.close(); } catch(e) {} }, 2500);
    } else {
        showToast('Popup-Blocker deaktivieren!', 'warning');
    }
}

// Clean string for TSPL (remove quotes, transliterate Turkish special chars)
// v1.18.10: Türkische Buchstaben die der ARTDEV-Drucker nicht kann werden
// auf ihre lateinischen Entsprechungen abgebildet (vorher wurden sie als '?' gedruckt).
// ü, ö, ß bleiben — werden via CODEPAGE 1254 korrekt unterstützt.
function cleanTSPL(str) {
    if (!str) return '';
    return String(str)
        .replace(/İ/g, 'I')
        .replace(/ı/g, 'i')
        .replace(/Ş/g, 'S').replace(/ş/g, 's')
        .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
        .replace(/Ç/g, 'C').replace(/ç/g, 'c')
        .replace(/"/g, "'")
        .replace(/\\/g, '');
}

// Move order directly to Abholbereit from Rechner
async function rechnerToAbholbereit() {
    if (!rechnerOrderId) { showToast('Keine Bestellung geladen.', 'warning'); return; }
    const o = orders.find(x => x.id === rechnerOrderId);
    if (!o) return;
    showConfirm('Direkt → Abholbereit', 'Bestellung von "' + o.column + '" direkt nach "Abholbereit" verschieben?', 'Verschieben', async () => {
        await quickMove(rechnerOrderId, 'Abholbereit');
        showToast('Bestellung nach Abholbereit verschoben!', 'success');
    }, false);
}

// Update Abholbereit button visibility
function updateRechnerAbholbereitBtn() {
    const btn = document.getElementById('rechnerAbholbereitBtn');
    if (btn) btn.style.display = rechnerOrderId ? 'flex' : 'none';
}

// Share button: use Web Share API, fallback to download
function druckenShare() {
    if (!hasPerm('rechner_print')) { showToast('Keine Berechtigung.', 'warning'); return; }
    const canvas = generateEtikett();
    if (!canvas) return;

    canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], 'etikett.png', { type: 'image/png' });

        if (navigator.share) {
            navigator.share({
                title: 'Etikett drucken',
                text: 'Etikett zum Drucken',
                files: navigator.canShare && navigator.canShare({ files: [file] }) ? [file] : undefined
            }).then(() => {
                showToast('Etikett geteilt', 'success');
            }).catch(e => {
                if (e.name !== 'AbortError') druckenDownload();
            });
        } else {
            druckenDownload();
        }
    }, 'image/png');
}

// Download button: save image directly
function druckenDownload() {
    if (!hasPerm('rechner_print')) { showToast('Keine Berechtigung.', 'warning'); return; }
    const canvas = generateEtikett();
    if (!canvas) return;

    canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'etikett_' + ((document.getElementById('kunde')?.value) || (summarySlides[currentSlide]?.kunde) || 'label').replace(/\s+/g, '_') + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Etikett gespeichert — in Brother App öffnen zum Drucken', 'success', 4000);
    }, 'image/png');
}

// ═══ DASHBOARD ═══
async function renderDashboard() {
    const el = document.getElementById('dashContent');
    if (!el) return;
    const period = document.getElementById('dashPeriod').value;

    const now = new Date();
    let startDate;
    if (period === 'week') {
        startDate = new Date(now); startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0,0,0,0);
    } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
    } else {
        startDate = new Date(2020, 0, 1);
    }

    // Filter orders by period
    const periodOrders = orders.filter(o => {
        if (!o.createdAt) return false;
        const d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        return d >= startDate;
    });

    // Exclude B-Ware and Gelöscht
    const activeOrders = periodOrders.filter(o => o.column !== 'B-Ware' && o.column !== 'Gelöscht');
    // Trennung: normale Bestellungen vs. Reparaturen (v1.13.1)
    const normalOrders = activeOrders.filter(o => !o.isReparatur);
    const reparaturOrders = activeOrders.filter(o => o.isReparatur);

    // Reparatur-Statistik berechnen
    let repRevenue = 0, repPaid = 0, repOpen = 0;
    reparaturOrders.forEach(o => {
        const paid = (o.payments||[]).reduce((s,p) => s + (p.amount||0), 0);
        repPaid += paid;
        const total = o.totalPrice || 0;
        repRevenue += total;
        repOpen += (total - paid);
    });

    // Revenue (actually paid) — nur Normal-Bestellungen
    let totalRevenue = 0;
    let totalPaid = 0;
    let totalOpen = 0;
    let totalSqm = 0;
    let orderCount = normalOrders.length;
    const colorStats = {};
    const materialStats = {};

    normalOrders.forEach(o => {
        // Paid amount
        const paid = (o.payments||[]).reduce((s,p) => s + (p.amount||0), 0);
        totalPaid += paid;

        // Calculate total with min 1m²
        let orderTotal = 0;
        (o.measures||[]).forEach(m => {
            const b = parseFloat(m.breite)||0, h = parseFloat(m.hoehe)||0, s = m.stueck||1;
            const p = m.sqmPrice || sqmPrice;
            const rawSqm = (b/100)*(h/100)*s;
            const billSqm = Math.max(rawSqm, 1*s);
            orderTotal += billSqm * p;
            totalSqm += rawSqm;

            // Color stats
            const farbe = m.farbe || o.farbe || 'Unbekannt';
            if (!colorStats[farbe]) colorStats[farbe] = { sqm: 0, count: 0 };
            colorStats[farbe].sqm += rawSqm;
            colorStats[farbe].count += s;

            // Material stats per color per profile
            const breite = b, hoehe = h;
            abzuege.forEach(ab => {
                if (ab.basis === 'tuel_adet') return;
                const basis = ab.basis === 'breite' ? breite : hoehe;
                const mass = basis - ab.abzug;
                const totalLen = mass * ab.stueck * s / 100; // in meters
                const key = ab.name;
                if (!materialStats[key]) materialStats[key] = {};
                if (!materialStats[key][farbe]) materialStats[key][farbe] = 0;
                materialStats[key][farbe] += totalLen;
            });
            // Tül Adet berechnen
            const enIdx2 = abzuege.findIndex(a => a.name === 'Profil En');
            if (enIdx2 >= 0) {
                const enMass = breite - abzuege[enIdx2].abzug;
                const tuelAdet = enMass / 2;
                if (!materialStats['Tül Adet']) materialStats['Tül Adet'] = {};
                if (!materialStats['Tül Adet']['_count']) materialStats['Tül Adet']['_count'] = 0;
                materialStats['Tül Adet']['_count'] += tuelAdet * s;
            }
        });

        const savedTotal = o.totalPrice || 0;
        const total = (savedTotal && Math.abs(savedTotal - orderTotal) > 0.02) ? savedTotal : (orderTotal || savedTotal);
        totalRevenue += total;
        totalOpen += (total - paid);
    });

    // Monthly revenue chart (last 6 months)
    const chartMonths = period === 'week' ? 1 : (period === 'month' ? 3 : (period === 'year' ? 12 : 12));
    const monthlyData = [];
    for (let i = chartMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        const mOrders = orders.filter(o => {
            if (!o.createdAt || o.column === 'B-Ware' || o.column === 'Gelöscht') return false;
            const od = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
            return od >= d && od <= mEnd;
        });
        const mRev = mOrders.reduce((s, o) => s + (o.totalPrice || 0), 0);
        monthlyData.push({ label: d.toLocaleDateString('de-AT', {month:'short'}), value: mRev, count: mOrders.length });
    }
    const maxRev = Math.max(...monthlyData.map(m => m.value), 1);

    // Status counts
    const statusCounts = {};
    periodOrders.forEach(o => {
        const col = o.column || 'Unbekannt';
        statusCounts[col] = (statusCounts[col]||0) + 1;
    });

    let html = '';

    // v1.18.12: Produktion-Statistik & Lieferzeit-Prognose (ganz oben)
    if (typeof getProductionStatsCardHTML === 'function') {
        html += getProductionStatsCardHTML();
    }

    // Revenue cards
    html += `<div class="card" style="text-align:center;margin-bottom:10px">
        <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Gesamt Umsatz</div>
        <div style="font-size:28px;font-weight:700;color:var(--primary);margin-top:4px">€ ${(totalPaid + totalOpen).toFixed(2)}</div>
    </div>`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div class="card" style="text-align:center;margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Bezahlt</div>
            <div style="font-size:24px;font-weight:700;color:var(--green);margin-top:4px">€ ${totalPaid.toFixed(2)}</div>
        </div>
        <div class="card" style="text-align:center;margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Offen</div>
            <div style="font-size:24px;font-weight:700;color:${totalOpen>0?'var(--red)':'var(--green)'};margin-top:4px">€ ${totalOpen.toFixed(2)}</div>
        </div>
    </div>`;

    // Reparatur-Umsatz separat (v1.13.1)
    if (reparaturOrders.length > 0) {
        html += `<div class="card" style="margin-bottom:10px;border-left:4px solid #2563eb">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:18px">🔧</span>
                <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Reparatur-Umsatz (separat)</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                <div style="text-align:center"><div style="font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Gesamt</div><div style="font-size:18px;font-weight:700;color:#2563eb;margin-top:2px">€ ${repRevenue.toFixed(2)}</div></div>
                <div style="text-align:center"><div style="font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Bezahlt</div><div style="font-size:18px;font-weight:700;color:var(--green);margin-top:2px">€ ${repPaid.toFixed(2)}</div></div>
                <div style="text-align:center"><div style="font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Anzahl</div><div style="font-size:18px;font-weight:700;color:#2563eb;margin-top:2px">${reparaturOrders.length}</div></div>
            </div>
        </div>`;
    }

    // v1.18.12: Umsatz-Chart als horizontale Balken-Liste sortiert nach Wert.
    // Klarer als Linien-Chart bei wenig Datenpunkten, kein Überdecken.
    const chartLabel = chartMonths === 1 ? 'Diese Woche' : (chartMonths === 3 ? 'Letzte 3 Monate' : 'Letzte 12 Monate');

    // Sortierte Kopie nach Wert (höchste zuerst)
    const sortedData = [...monthlyData].sort((a, b) => b.value - a.value);
    const maxV = Math.max(...sortedData.map(m => m.value), 1);

    // Mittelwert für Info-Zeile (nur über Monate mit Umsatz > 0)
    const monthsWithRev = monthlyData.filter(m => m.value > 0);
    const avgRev = monthsWithRev.length > 0
        ? monthsWithRev.reduce((s, m) => s + m.value, 0) / monthsWithRev.length
        : 0;
    const bestMonth = sortedData[0];

    // Aktueller Monat erkennen
    const currentMonthLabel = new Date().toLocaleDateString('de-AT', {month:'short'});

    // SVG-Icons
    const SVG_STAR_FILLED = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round" style="flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

    html += `<div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
            <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Umsatz-Entwicklung</div>
            <div style="font-size:10px;color:var(--text-muted);font-weight:600">${chartLabel}</div>
        </div>`;

    // Horizontale Balken
    sortedData.forEach((m, idx) => {
        const pct = maxV > 0 ? Math.max((m.value / maxV) * 100, 2) : 2;
        const isBest = idx === 0 && m.value > 0;
        const isCurrent = m.label === currentMonthLabel;
        const barColor = isBest ? '#534AB7' : (isCurrent ? '#8b82d8' : '#c4bef0');
        const labelExtra = isCurrent ? ' <span style="font-size:9px;font-weight:600;color:var(--text-muted);letter-spacing:0.04em">(aktuell)</span>' : '';
        html += `<div style="display:flex;align-items:center;gap:10px;padding:6px 0">
            <div style="width:60px;font-size:12px;font-weight:700;color:var(--text);flex-shrink:0">${m.label}${labelExtra}</div>
            <div style="flex:1;height:22px;background:#f3f4f6;border-radius:6px;overflow:hidden;position:relative">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:6px;transition:width 0.4s ease"></div>
            </div>
            <div style="min-width:75px;text-align:right;font-size:13px;font-weight:700;color:${isBest?'var(--primary)':'var(--text)'};display:flex;align-items:center;gap:4px;justify-content:flex-end">
                ${isBest ? SVG_STAR_FILLED : ''}
                € ${Math.round(m.value).toLocaleString('de-AT')}
            </div>
        </div>`;
    });

    // Info-Zeile unten
    if (monthsWithRev.length > 0) {
        html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-light);font-size:11px;color:var(--text-muted);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <span>Höchster: <strong style="color:var(--primary)">${bestMonth.label} (€ ${Math.round(bestMonth.value).toLocaleString('de-AT')})</strong></span>
            <span>Ø/Monat: <strong style="color:var(--text)">€ ${Math.round(avgRev).toLocaleString('de-AT')}</strong></span>
        </div>`;
    }

    html += `</div>`;

    html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
        <div class="card" style="text-align:center;margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Bestellungen</div>
            <div style="font-size:22px;font-weight:700;color:var(--primary);margin-top:4px">${orderCount}</div>
        </div>
        <div class="card" style="text-align:center;margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Gesamt m²</div>
            <div style="font-size:22px;font-weight:700;color:var(--primary);margin-top:4px">${totalSqm.toFixed(1)}</div>
        </div>
        <div class="card" style="text-align:center;margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Ø Bestellung</div>
            <div style="font-size:22px;font-weight:700;color:var(--primary);margin-top:4px">€ ${orderCount ? (totalPaid/orderCount).toFixed(0) : '0'}</div>
        </div>
    </div>`;

    // Status overview
    html += `<div class="card"><div class="card-label">Status-Übersicht</div>`;
    const statusColors = {'Reparatur':'#2563eb','Bestellung':'var(--primary)','In Produktion':'var(--amber)','Abholbereit':'#2563eb','Abgeholt':'var(--green)','B-Ware':'#8B4513','Gelöscht':'var(--text-muted)'};
    Object.entries(statusCounts).forEach(([col, count]) => {
        const pct = orderCount > 0 ? Math.round(count/periodOrders.length*100) : 0;
        html += `<div style="display:flex;align-items:center;gap:10px;padding:6px 0">
            <span style="font-size:13px;font-weight:600;width:120px">${col}</span>
            <div style="flex:1;background:var(--border-light);border-radius:4px;height:20px;overflow:hidden">
                <div style="background:${statusColors[col]||'var(--primary)'};height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s"></div>
            </div>
            <span style="font-size:14px;font-weight:700;min-width:30px;text-align:right">${count}</span>
        </div>`;
    });
    html += `</div>`;

    // Color breakdown
    html += `<div class="card"><div class="card-label">Fläche nach Farbe</div>`;
    Object.entries(colorStats).sort((a,b) => b[1].sqm - a[1].sqm).forEach(([farbe, data]) => {
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light)">
            <div style="display:flex;align-items:center;gap:8px">
                <span style="width:14px;height:14px;border-radius:50%;background:${farbeColor(farbe)};display:inline-block"></span>
                <span style="font-size:14px;font-weight:600">${farbe}</span>
                <span style="font-size:12px;color:var(--text-muted)">${data.count} Stk</span>
            </div>
            <span style="font-size:16px;font-weight:700">${data.sqm.toFixed(2)} m²</span>
        </div>`;
    });
    html += `</div>`;

    // Material stats - merge groups
    const profilLaenge = 6; // 1 Profil = 6 Meter

    // Merge material groups
    function mergeStats(names) {
        const merged = {};
        names.forEach(n => {
            const colors = materialStats[n];
            if (!colors) return;
            Object.entries(colors).forEach(([farbe, len]) => {
                merged[farbe] = (merged[farbe]||0) + len;
            });
        });
        return merged;
    }

    const profileGroups = [
        { name: 'Profil En/Boy', colors: mergeStats(['Profil En', 'Profil Boy']) },
        { name: 'Profil 2', colors: materialStats['Profil 2'] || {} }
    ];

    // Profiles (with color breakdown + Stückzahl)
    html += `<div class="card"><div class="card-label">Profile (nach Farbe)</div>`;
    profileGroups.forEach(group => {
        const colors = group.colors;
        if (!Object.keys(colors).length) return;
        const totalLen = Object.values(colors).reduce((s,v) => s+v, 0);
        const stueck = totalLen / profilLaenge;
        html += `<div style="padding:12px 0;border-bottom:1px solid var(--border-light)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:15px;font-weight:700">${group.name}</span>
                <div style="text-align:right">
                    <span style="font-size:15px;font-weight:700">${totalLen.toFixed(1)} m</span>
                    <span style="font-size:12px;color:var(--text-muted);margin-left:6px">≈ ${stueck.toFixed(1)} Stk</span>
                </div>
            </div>`;
        Object.entries(colors).sort((a,b) => b[1]-a[1]).forEach(([farbe, len]) => {
            const fStueck = len / profilLaenge;
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 4px 12px">
                <div style="display:flex;align-items:center;gap:6px">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${farbeColor(farbe)}"></span>
                    <span style="font-size:13px;font-weight:600">${farbe}</span>
                </div>
                <div style="font-size:13px">
                    <span style="font-weight:600">${len.toFixed(1)} m</span>
                    <span style="color:var(--text-muted);margin-left:4px">≈ ${fStueck.toFixed(1)} Stk</span>
                </div>
            </div>`;
        });
        html += `</div>`;
    });
    html += `</div>`;

    // Other materials - merge Plastik groups, no color breakdown
    const mergedOther = {};
    const profileRaw = ['Profil En', 'Profil Boy', 'Profil 2'];
    const plastikMerge = ['Plastik', 'Plastik Kisa'];
    Object.entries(materialStats).forEach(([name, colors]) => {
        if (profileRaw.includes(name) || name === 'Tül Adet') return;
        const displayName = plastikMerge.includes(name) ? 'Plastik (gesamt)' : name;
        const totalLen = Object.values(colors).reduce((s,v) => s+v, 0);
        mergedOther[displayName] = (mergedOther[displayName]||0) + totalLen;
    });
    const tuelAdetData = materialStats['Tül Adet'];
    if (Object.keys(mergedOther).length || tuelAdetData) {
        html += `<div class="card"><div class="card-label">Sonstige Materialien</div>`;
        Object.entries(mergedOther).forEach(([name, totalLen]) => {
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light)">
                <span style="font-size:14px;font-weight:700">${name}</span>
                <span style="font-size:15px;font-weight:700">${totalLen.toFixed(1)} m</span>
            </div>`;
        });
        if (tuelAdetData && tuelAdetData['_count']) {
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light)">
                <span style="font-size:14px;font-weight:700">Tül Adet (Gitterfalten)</span>
                <span style="font-size:15px;font-weight:700">${tuelAdetData['_count'].toFixed(0)} Stk</span>
            </div>`;
        }
        html += `</div>`;
    }

    // Mitarbeiter-Statistik — use member names from Firestore
    const maStats = {};
    activeOrders.forEach(o => {
        const by = (o.createdBy || 'Unbekannt').toLowerCase().trim();
        if (!maStats[by]) maStats[by] = { email: by, count: 0, produced: 0, filiale: '' };
        maStats[by].count++;
    });

    // Count productions per user (orders that were in Produktion)
    orders.forEach(o => {
        if (!o.log) return;
        o.log.forEach(l => {
            if (l.text && l.text.includes('nach In Produktion verschoben')) {
                const userName = l.text.split(' hat ')[0].toLowerCase().trim();
                Object.values(maStats).forEach(ma => {
                    ma._prodCount = ma._prodCount || 0;
                });
            }
        });
    });
    // Count from log entries matching member names
    const prodCounts = {};
    orders.forEach(o => {
        if (!o.log) return;
        o.log.forEach(l => {
            if (l.text && l.text.includes('nach In Produktion verschoben')) {
                const who = l.text.split(' hat ')[0].trim();
                prodCounts[who] = (prodCounts[who] || 0) + 1;
            }
        });
    });

    // Load member names
    const maEntries = Object.values(maStats);
    if (maEntries.length) {
        try {
            const membersSnap = await db.collection('members').get();
            const memberMap = {};
            membersSnap.forEach(d => {
                const m = d.data();
                if (m.email) memberMap[m.email.toLowerCase().trim()] = m.name || m.email.split('@')[0];
            });
            maEntries.forEach(ma => {
                const name = memberMap[ma.email] || ma.email.split('@')[0] || 'Unbekannt';
                ma.displayName = name.charAt(0).toUpperCase() + name.slice(1);
                ma.produced = prodCounts[ma.displayName] || prodCounts[name] || 0;
            });
        } catch(e) {
            maEntries.forEach(ma => {
                const name = ma.email.split('@')[0] || 'Unbekannt';
                ma.displayName = name.charAt(0).toUpperCase() + name.slice(1);
                ma.produced = prodCounts[ma.displayName] || prodCounts[name] || 0;
            });
        }

        // Sort by count (highest first)
        maEntries.sort((a, b) => b.count - a.count);

        const medals = ['🥇', '🥈', '🥉'];
        html += `<div class="card"><div class="card-label">Mitarbeiter-Leistung</div>`;
        maEntries.forEach((data, i) => {
            const rank = i < 3 ? medals[i] : `${i + 1}.`;
            const barWidth = maEntries[0].count > 0 ? Math.round((data.count / maEntries[0].count) * 100) : 0;
            html += `<div style="padding:12px 0;border-bottom:1px solid var(--border-light)">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <span style="font-size:${i<3?'18':'14'}px;min-width:28px;text-align:center">${rank}</span>
                    <div style="flex:1">
                        <div style="font-size:15px;font-weight:700">${data.displayName}</div>
                    </div>
                    <div style="text-align:right;display:flex;gap:8px;align-items:baseline">
                        <div><span style="font-size:18px;font-weight:700;color:var(--primary)">${data.count}</span><span style="font-size:10px;color:var(--text-muted)"> Best.</span></div>
                        <div><span style="font-size:16px;font-weight:700;color:#d97706">${data.produced||0}</span><span style="font-size:10px;color:var(--text-muted)"> Prod.</span></div>
                    </div>
                </div>
                <div style="background:var(--border-light);border-radius:4px;height:6px;overflow:hidden">
                    <div style="background:var(--primary);height:100%;width:${barWidth}%;border-radius:4px"></div>
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    el.innerHTML = html;
}

// ═══ PDF EXPORT (v1.16.3 — mit Firmen-Daten, Logo, Skizzen) ═══
function exportOrderPDF(id) {
    if (!hasPerm('orders_pdf')) { showToast('Keine Berechtigung.','warning'); return; }
    const o = orders.find(x => x.id === id);
    if (!o) return;
    const total = o.totalPrice || 0;
    const payments = o.payments || [];
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const rest = total - totalPaid;
    const measures = o.measures || [];

    // Firmendaten aus Cache (v1.16.2/.3)
    const cd = cachedCompanyData || {};
    const logoSrc = cd.logoBase64 || '';

    const measuresRows = measures.map((m, i) => {
        const rawSqm = ((m.breite / 100) * (m.hoehe / 100) * (m.stueck || 1));
        const sqm = Math.max(rawSqm, 1 * (m.stueck || 1));
        const price = sqm * (m.sqmPrice || sqmPrice);
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
        const variantStr = variantHints.length ? `<div style="font-size:11px;color:#534AB7;margin-top:2px;font-weight:600">${variantHints.map(escHtml).join(' · ')}</div>` : '';
        return `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">${i + 1}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">Fliegengitter ${m.farbe || o.farbe || ''}${variantStr}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">${m.breite} × ${m.hoehe} cm${m.doppeltuer ? ' DT' : ''}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">${m.stueck || 1}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${sqm.toFixed(2)} m²</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">€ ${price.toFixed(2)}</td>
        </tr>`;
    }).join('');

    // Skizzen pro Maß (v1.16.3) - kompakter Block am Ende
    const sketchesHtml = measures.map((m, i) => {
        const hasBP = m.variants && (m.variants.schwellenlos === 'ja' || m.variants.bodenprofil === 'ja');
        const svg = renderMasseSvg(m.breite, m.hoehe, !!m.doppeltuer, true, false, hasBP);
        const pills = renderMeasureVariantPills(m, {compact:true});
        return `<div class="sketch-item">
            <div class="sketch-num">${i + 1}</div>
            <div class="sketch-svg">${svg}</div>
            ${pills}
        </div>`;
    }).join('');

    const paymentsRows = payments.map(p => {
        const d = p.date ? (p.date.toDate ? p.date.toDate() : new Date(p.date)) : null;
        const ds = d ? d.toLocaleDateString('de-AT') : '';
        return `<tr><td style="padding:6px 0;color:#666">${p.label || 'Zahlung'} ${ds ? '(' + ds + ')' : ''}</td><td style="padding:6px 0;text-align:right;color:#16a34a;font-weight:600">- € ${(p.amount || 0).toFixed(2)}</td></tr>`;
    }).join('');

    const dateStr = o.bestelldatum
        ? o.bestelldatum.split('-').reverse().join('.')
        : (o.createdAt ? formatDate(o.createdAt) : new Date().toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'}));

    // Bestellnummer: bevorzugt orderNumber, sonst aus ID
    const orderNr = o.orderNumber || ('#' + (id.replace(/[^0-9]/g, '').substring(0, 8) || '00000000'));

    // Firmen-Header-Block
    const companyHeaderHtml = `
        <div class="company-header">
            ${logoSrc ? `<img src="${logoSrc}" class="company-logo" alt="Logo">` : `<div class="brand">${escHtml(cd.name || 'Fliegengitter')}</div>`}
            <div class="company-info">
                ${cd.name && logoSrc ? `<div class="company-name">${escHtml(cd.name)}</div>` : ''}
                ${cd.address ? `<div class="company-line">${escHtml(cd.address)}</div>` : ''}
                <div class="company-line">${cd.phone ? '📞 ' + escHtml(cd.phone) : ''}${cd.phone && cd.email ? ' · ' : ''}${cd.email ? '✉ ' + escHtml(cd.email) : ''}</div>
                ${cd.website ? `<div class="company-line">🌐 ${escHtml(cd.website)}</div>` : ''}
            </div>
            <div class="doc-meta">
                <div class="doc-type">Bestellübersicht</div>
                <div class="doc-nr">${escHtml(orderNr)}</div>
                <div class="doc-date">${dateStr}</div>
            </div>
        </div>`;

    // Footer mit IBAN
    const footerHtml = `
        <div class="footer">
            ${cd.iban ? `<div style="margin-bottom:6px"><strong>Bankverbindung:</strong> ${escHtml(cd.iban)}</div>` : ''}
            <div>${escHtml(cd.name || 'Fliegengitter')} · ${cd.phone ? escHtml(cd.phone) + ' · ' : ''}${cd.email ? escHtml(cd.email) : ''}</div>
        </div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Bestellung ${escHtml(o.vorname)} ${escHtml(o.nachname)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'DM Sans',sans-serif; color:#1a1a2e; padding:40px; max-width:800px; margin:0 auto; padding-top:80px; }
        .pdf-toolbar { position:fixed; top:0; left:0; right:0; background:#534AB7; color:white; padding:10px 16px; display:flex; align-items:center; gap:8px; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:1000; }
        .pdf-toolbar button { background:white; color:#534AB7; border:none; border-radius:8px; padding:8px 16px; font-size:14px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; display:flex; align-items:center; gap:6px; }
        .pdf-toolbar button:hover { background:#f0f0ff; }
        .pdf-toolbar .spacer { flex:1; }
        .pdf-toolbar .title { font-size:14px; font-weight:600; }

        /* v1.16.3 - Firmen-Header */
        .company-header { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:30px; padding-bottom:18px; border-bottom:3px solid #534AB7; }
        .company-logo { max-width:120px; max-height:80px; object-fit:contain; flex-shrink:0; }
        .brand { font-size:24px; font-weight:700; color:#534AB7; flex-shrink:0; }
        .company-info { flex:1; font-size:11px; color:#6b7280; line-height:1.6; min-width:0; }
        .company-name { font-size:14px; font-weight:700; color:#1a1a2e; margin-bottom:4px; }
        .company-line { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .doc-meta { text-align:right; flex-shrink:0; }
        .doc-type { font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.1em; }
        .doc-nr { font-size:18px; font-weight:700; color:#1a1a2e; margin-top:4px; }
        .doc-date { font-size:13px; color:#6b7280; margin-top:2px; }

        .customer { background:#f7f7ff; border-radius:12px; padding:20px; margin-bottom:24px; }
        .customer-label { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#9ca3af; font-weight:700; margin-bottom:8px; }
        .customer-name { font-size:22px; font-weight:700; }
        .customer-detail { font-size:14px; color:#6b7280; margin-top:4px; }

        table { width:100%; border-collapse:collapse; margin-bottom:24px; }
        thead th { background:#f0f2f5; padding:10px 12px; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; font-weight:700; text-align:left; }
        .totals { margin-left:auto; width:280px; }
        .totals tr td { padding:8px 0; }
        .totals .total-row td { font-size:20px; font-weight:700; border-top:2px solid #1a1a2e; padding-top:12px; }
        .totals .rest-row td { color:${rest <= 0 ? '#16a34a' : '#dc2626'}; font-weight:600; }

        /* v1.16.3 - Skizzen-Block */
        .sketches { margin-top:30px; padding-top:20px; border-top:1px solid #e5e7eb; }
        .sketches-label { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#9ca3af; font-weight:700; margin-bottom:12px; }
        .sketches-grid { display:flex; flex-wrap:wrap; gap:14px; }
        .sketch-item { display:flex; flex-direction:column; align-items:center; padding:8px; border:1px solid #e5e7eb; border-radius:10px; background:#fafafa; }
        .sketch-num { font-size:11px; font-weight:700; color:#534AB7; margin-bottom:4px; }
        .sketch-svg { display:flex; align-items:center; justify-content:center; }
        .sketch-svg svg { display:block; max-width:160px; height:auto; }

        .footer { margin-top:30px; padding-top:14px; border-top:1px solid #e5e7eb; font-size:11px; color:#6b7280; text-align:center; line-height:1.6; }
        ${o.frist ? `.frist { display:inline-block; background:#fef3c7; color:#92400e; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; margin-top:8px; }` : ''}
        @media print { body { padding:20px; padding-top:20px; } @page { size:A4; margin:15mm; } .pdf-toolbar { display:none !important; } .sketch-svg svg { max-width:140px; } }
    </style></head><body>
    <div class="pdf-toolbar no-print">
        <button onclick="window.history.length > 1 ? window.history.back() : window.close()" title="Zurück zur Bestellung">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
            Zurück
        </button>
        <div class="spacer"></div>
        <div class="title">Bestellung ${escHtml(orderNr)}</div>
        <div class="spacer"></div>
        <button onclick="window.print()" title="Drucken / Als PDF speichern">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Drucken
        </button>
    </div>
    ${companyHeaderHtml}
    <div class="customer">
        <div class="customer-label">Kunde</div>
        <div class="customer-name">${escHtml(o.vorname || '')} ${escHtml(o.nachname || '')}</div>
        ${o.telefon ? `<div class="customer-detail">📞 ${escHtml(o.telefon)}</div>` : ''}
        ${o.frist ? `<div class="frist">⏰ Frist: ${o.frist.split('-').reverse().join('.')}</div>` : ''}
    </div>
    <table>
        <thead><tr><th>#</th><th>Artikel</th><th style="text-align:center">Maße</th><th style="text-align:center">Stk</th><th style="text-align:right">Fläche</th><th style="text-align:right">Preis</th></tr></thead>
        <tbody>${measuresRows}</tbody>
    </table>
    <table class="totals">
        <tr><td>Gesamt</td><td style="text-align:right;font-weight:600">€ ${total.toFixed(2)}</td></tr>
        ${paymentsRows}
        <tr class="rest-row"><td>${rest <= 0 ? 'Bezahlt' : 'Offener Betrag'}</td><td style="text-align:right">€ ${rest.toFixed(2)}</td></tr>
    </table>
    ${o.bemerkung ? `<div style="margin-top:20px;padding:14px;background:#f0f2f5;border-radius:10px;font-size:13px;color:#6b7280"><strong>Bemerkung:</strong> ${escHtml(o.bemerkung)}</div>` : ''}
    <div class="sketches">
        <div class="sketches-label">Skizzen</div>
        <div class="sketches-grid">${sketchesHtml}</div>
    </div>
    ${footerHtml}
    </body></html>`;

    // Im selben Fenster öffnen, kein neues Tab/Popup mehr
    // Bestellungs-Modal vorher schließen, damit "Zurück" wieder dort hin führt
    const modal = document.querySelector('.confirm-overlay');
    if (modal) modal.remove();

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.location.href = url;
}

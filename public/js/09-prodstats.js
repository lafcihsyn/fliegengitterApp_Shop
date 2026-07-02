// ═══════════════════════════════════════════════════════════════════
// 09-prodstats.js — Produktion-Statistik & Lieferzeit-Prognose
//
// Berechnet Tageskapazität und schlägt Liefertermine vor.
//
// ALGORITHMUS:
//   1. Sammle Bestellungen die in den letzten 60 Tagen in "Abholbereit"
//      verschoben wurden (aus o.log)
//   2. Summiere die Stk pro Bestellung → Total produziert
//   3. Zähle Werktage WO mindestens 1 Stk fertig wurde (= aktive Tage)
//   4. Tagesdurchschnitt = Total / aktive Tage
//
// LIEFERZEIT:
//   Offene Stk = Spalten "Bestellung" + "In Produktion" + "Reparatur"
//   Werktage = Offene Stk / Tagesdurchschnitt
//   Frist = heute + Werktage + 2 Puffer-Werktage (Feiertage übersprungen)
//   Spanne = Frist ± 3 Werktage (also 6 Werktage gesamt)
//
// API:
//   - getProductionStats()    → { avgPerDay, openStk, ... }
//   - getProposedFristRange() → { from: Date, to: Date, mid: Date }
//   - renderProductionBanner()→ befüllt #productionBanner im Board
//   - renderProductionCard()  → befüllt Auswertungs-Karte
//
// Lädt NACH dem inline-Script. Greift auf orders[] aus inline zu.
// ═══════════════════════════════════════════════════════════════════

// ─── Konstanten ─────────────────────────────────────────────────────

const PRODSTATS_DAYS = 60;           // Auswertungs-Zeitraum
const PRODSTATS_PUFFER_DAYS = 2;     // Puffer-Werktage zum berechneten Datum
const PRODSTATS_SPAN_DAYS = 2;       // v1.20.4: ± KALENDERtage (= 5-Tage-Fenster), vorher 3 Werktage

// Österreichische Feiertage 2026 + 2027 (hartcodiert)
// Erweitern wenn nötig — fixed date Feiertage + Pfingsten/Fronleichnam abhängig von Ostern
const PRODSTATS_FEIERTAGE_AT = [
    // 2026
    '2026-01-01', // Neujahr
    '2026-01-06', // Heilige Drei Könige
    '2026-04-06', // Ostermontag (Ostern 2026: 5. April)
    '2026-05-01', // Staatsfeiertag
    '2026-05-14', // Christi Himmelfahrt
    '2026-05-25', // Pfingstmontag
    '2026-06-04', // Fronleichnam
    '2026-08-15', // Mariä Himmelfahrt
    '2026-10-26', // Nationalfeiertag
    '2026-11-01', // Allerheiligen
    '2026-12-08', // Mariä Empfängnis
    '2026-12-25', // Weihnachten
    '2026-12-26', // Stefanitag
    // 2027 (Ostern 2027: 28. März)
    '2027-01-01',
    '2027-01-06',
    '2027-03-29', // Ostermontag
    '2027-05-01',
    '2027-05-06', // Christi Himmelfahrt
    '2027-05-17', // Pfingstmontag
    '2027-05-27', // Fronleichnam
    '2027-08-15',
    '2027-10-26',
    '2027-11-01',
    '2027-12-08',
    '2027-12-25',
    '2027-12-26',
];

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * YYYY-MM-DD String aus einem Date.
 */
function _prodstats_dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Ist dieser Tag ein Werktag (Mo-Fr und kein Feiertag)?
 */
function _prodstats_isWerktag(d) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false; // So oder Sa
    if (PRODSTATS_FEIERTAGE_AT.includes(_prodstats_dateKey(d))) return false;
    return true;
}

/**
 * Wieviele Werktage liegen zwischen 2 Daten? (start inkl., end exkl.)
 */
function _prodstats_countWerktage(start, end) {
    let n = 0;
    const cur = new Date(start);
    cur.setHours(0,0,0,0);
    const stop = new Date(end);
    stop.setHours(0,0,0,0);
    while (cur < stop) {
        if (_prodstats_isWerktag(cur)) n++;
        cur.setDate(cur.getDate() + 1);
    }
    return n;
}

/**
 * Addiert N Werktage zu einem Datum (überspringt Sa/So/Feiertage).
 */
function _prodstats_addWerktage(date, n) {
    const d = new Date(date);
    let added = 0;
    while (added < n) {
        d.setDate(d.getDate() + 1);
        if (_prodstats_isWerktag(d)) added++;
    }
    return d;
}

/**
 * Stk-Summe einer Bestellung berechnen.
 */
function _prodstats_orderStk(o) {
    if (!o || !o.measures) return 0;
    return o.measures.reduce((s, m) => s + (parseInt(m.stueck) || 1), 0);
}

/**
 * Datum aus Log-Eintrag extrahieren.
 * In der DB heißt das Feld `time` (Firestore Timestamp).
 */
function _prodstats_logDate(l) {
    if (!l || !l.time) return null;
    if (l.time.toDate) return l.time.toDate();
    if (l.time.seconds) return new Date(l.time.seconds * 1000);
    if (typeof l.time === 'string') return new Date(l.time);
    if (l.time instanceof Date) return l.time;
    return null;
}

// ─── Hauptfunktion: Produktion-Statistik berechnen ──────────────────

/**
 * Liefert: {
 *   avgPerDay:        Ø Stk/Werktag (gerundet auf 1 Stelle)
 *   totalProduced:    Stk gesamt in 60 Tagen
 *   activeDays:       Werktage mit Produktion > 0
 *   workdaysInPeriod: Werktage in 60 Tagen (für Anzeige)
 *   last7days:        [letzteStk, ...] für Mini-Chart
 *   openStk:          Stk in Warteschlange (Bestellung + In Produktion + Reparatur)
 *   openOrders:       Anzahl Bestellungen in Warteschlange
 *   estimatedDays:    Geschätzte Werktage zum Abarbeiten
 * }
 */
function getProductionStats() {
    if (typeof orders === 'undefined' || !Array.isArray(orders)) {
        return { avgPerDay: 0, totalProduced: 0, activeDays: 0, workdaysInPeriod: 0,
                 last7days: [], openStk: 0, openOrders: 0, estimatedDays: 0 };
    }

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - PRODSTATS_DAYS);
    cutoff.setHours(0,0,0,0);

    // Stk pro Tag sammeln (nur "Abholbereit"-Verschiebungen)
    const stkPerDay = {};  // { 'YYYY-MM-DD': total Stk }

    orders.forEach(o => {
        if (!o.log || !Array.isArray(o.log)) return;
        // Produktions-Abschluss = erstes "nach Transport verschoben" (Inegöl) ODER "nach Abholbereit verschoben" (Wien).
        // .find liefert den chronologisch ersten Treffer → jede Bestellung wird genau EINMAL gezählt
        // (kein Doppel bei Transport→Abholbereit; Inegöl-Produktion zählt am Produktionstag, nicht erst bei Ankunft).
        const abhEntry = o.log.find(l => l.text && (l.text.includes('nach Transport verschoben') || l.text.includes('nach Abholbereit verschoben')));
        if (!abhEntry) return;
        const d = _prodstats_logDate(abhEntry);
        if (!d || d < cutoff) return;
        const stk = _prodstats_orderStk(o);
        if (stk === 0) return;
        const key = _prodstats_dateKey(d);
        stkPerDay[key] = (stkPerDay[key] || 0) + stk;
    });

    // Aktive Tage zählen (Werktage mit > 0 Stk Produktion)
    let totalProduced = 0;
    let activeDays = 0;
    Object.entries(stkPerDay).forEach(([dateStr, stk]) => {
        const d = new Date(dateStr + 'T12:00:00');  // Mittag um Zeitzonen-Issues zu vermeiden
        // Auch wenn Sa oder Feiertag: wenn produziert, dann zählt es
        if (stk > 0) {
            totalProduced += stk;
            activeDays++;
        }
    });

    const avgPerDay = activeDays > 0 ? totalProduced / activeDays : 0;

    // Werktage in Zeitraum (für Info-Anzeige)
    const workdaysInPeriod = _prodstats_countWerktage(cutoff, now);

    // Last 7 days Mini-Chart
    const last7days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0,0,0,0);
        const key = _prodstats_dateKey(d);
        last7days.push({
            date: d,
            stk: stkPerDay[key] || 0,
            isWerktag: _prodstats_isWerktag(d)
        });
    }

    // Aktuelle Warteschlange (Spalte: Bestellung, In Produktion, Reparatur)
    const warteSpalten = ['Bestellung', 'In Produktion', 'Reparatur'];
    let openStk = 0, openOrders = 0;
    orders.forEach(o => {
        if (!warteSpalten.includes(o.column)) return;
        openStk += _prodstats_orderStk(o);
        openOrders++;
    });

    // Schätzung: wieviele Werktage zum Abarbeiten
    const estimatedDays = avgPerDay > 0 ? Math.ceil(openStk / avgPerDay) : 0;

    return {
        avgPerDay: Math.round(avgPerDay * 10) / 10,
        totalProduced,
        activeDays,
        workdaysInPeriod,
        last7days,
        openStk,
        openOrders,
        estimatedDays
    };
}

// ─── Frist-Vorschlag berechnen ──────────────────────────────────────

/**
 * Liefert: {
 *   mid:   Date     (mittleres Datum = berechnet + Puffer)
 *   from:  Date     (mid - 3 Werktage)
 *   to:    Date     (mid + 3 Werktage)
 *   days:  Number   (Werktage von heute bis mid)
 *   valid: Boolean  (false wenn keine Daten für Berechnung)
 * }
 *
 * @param {Number} additionalStk - zusätzliche Stk für neue Bestellung (optional)
 */
function getProposedFristRange(additionalStk = 0) {
    // v1.20.8: Manueller Modus — feste Wochen-Spanne (z.B. bei Urlaub), überschreibt die Auto-Berechnung.
    if (typeof fristMode !== 'undefined' && fristMode === 'manual') {
        const a = Math.max(0, parseFloat(typeof fristFromWeeks !== 'undefined' ? fristFromWeeks : 2) || 0);
        const b = Math.max(a, parseFloat(typeof fristToWeeks !== 'undefined' ? fristToWeeks : 4) || 0);
        const today = new Date(); today.setHours(0,0,0,0);
        const mk = w => { const d = new Date(today); d.setDate(d.getDate() + Math.round(w * 7)); return d; };
        let from = mk(a), to = mk(b), mid = mk((a + b) / 2);
        const minFrom = new Date(today); minFrom.setDate(minFrom.getDate() + 1);
        if (from < minFrom) from = minFrom;
        return { mid, from, to, days: Math.round(((a + b) / 2) * 7), valid: true, manual: true };
    }
    const stats = getProductionStats();
    if (stats.avgPerDay <= 0) {
        return { mid: null, from: null, to: null, days: 0, valid: false };
    }

    const totalNeeded = stats.openStk + (additionalStk || 0);
    const productionDays = Math.ceil(totalNeeded / stats.avgPerDay);
    const totalDays = productionDays + PRODSTATS_PUFFER_DAYS;

    const today = new Date();
    today.setHours(0,0,0,0);
    const mid = _prodstats_addWerktage(today, totalDays);
    // v1.20.4: Spanne in KALENDERtagen (±2 = 5-Tage-Fenster), Mitte unverändert.
    let from = new Date(mid); from.setDate(from.getDate() - PRODSTATS_SPAN_DAYS);
    const to = new Date(mid); to.setDate(to.getDate() + PRODSTATS_SPAN_DAYS);
    const minFrom = new Date(today); minFrom.setDate(minFrom.getDate() + 1);
    if (from < minFrom) from = minFrom;

    return { mid, from, to, days: totalDays, valid: true };
}

/**
 * Formatiert ein Datum als TT.MM.YYYY
 */
function _prodstats_formatDate(d) {
    if (!d) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${m}.${d.getFullYear()}`;
}

/**
 * Date → "YYYY-MM-DD" (für <input type="date">)
 */
function _prodstats_dateInputValue(d) {
    if (!d) return '';
    return _prodstats_dateKey(d);
}

// ─── Board-Banner (oben auf dem Board) ──────────────────────────────

/**
 * Befüllt #productionBanner mit aktueller Statistik.
 * Wird beim Render des Boards aufgerufen.
 */
function renderProductionBanner() {
    const el = document.getElementById('productionBanner');
    if (!el) return;

    const stats = getProductionStats();
    if (stats.avgPerDay <= 0 || stats.openStk === 0) {
        el.style.display = 'none';
        return;
    }

    const prop = getProposedFristRange();
    el.style.display = 'block';
    // Helper für SVG-Icons (Lucide-Stil, weiß, stroke-basiert)
    const ICON_CHART = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
    const ICON_PACKAGE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
    const ICON_CLOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    const ICON_CALENDAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

    el.innerHTML = `
        <div style="background:linear-gradient(135deg, #534AB7 0%, #6c63d4 100%); color:white; border-radius:12px; padding:10px 14px; margin-bottom:8px; font-size:12px; font-weight:600; box-shadow:0 2px 8px rgba(83,74,183,0.25)">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
                <span style="display:flex; align-items:center; gap:5px">
                    ${ICON_CHART} <strong style="font-size:14px">Ø ${stats.avgPerDay} Stk/Tag</strong>
                </span>
                <span style="opacity:0.6">·</span>
                <span style="display:flex; align-items:center; gap:5px">
                    ${ICON_PACKAGE} Offen: <strong>${stats.openStk} Stk</strong>
                </span>
                <span style="opacity:0.6">·</span>
                <span style="display:flex; align-items:center; gap:5px">
                    ${ICON_CLOCK} <strong>${stats.estimatedDays} Werktage</strong>
                </span>
            </div>
            ${prop.valid ? `<div style="margin-top:6px; opacity:0.9; font-size:11px; font-weight:500; display:flex; align-items:center; gap:5px">
                ${ICON_CALENDAR} Neue Bestellung → Frist: ${_prodstats_formatDate(prop.from)} bis ${_prodstats_formatDate(prop.to)}
            </div>` : ''}
        </div>
    `;
}

// ─── Frist-Vorschlag bei "Neue Bestellung" ──────────────────────────

/**
 * Trägt die vorgeschlagene Frist-Spanne direkt in die Felder „Von" + „Bis" ein.
 * Wird beim Render des Neue-Bestellung-Forms aufgerufen, und immer wenn
 * sich die Stk ändern (live). Der frühere lila Hint-Banner ist entfernt —
 * die Spanne ist direkt im Doppelt-Date-Feld sichtbar.
 *
 * Manuelle Änderungen am Datum bleiben erhalten: wenn der Mitarbeiter das
 * Feld selbst angefasst hat (data-touched="1"), schreiben wir nichts mehr rein.
 */
function renderFristVorschlag() {
    const hint = document.getElementById('fristVorschlagHint');
    const bisEl = document.getElementById('newFrist');
    if (!bisEl) return;

    let newStk = 0;
    try {
        if (typeof measureFields !== 'undefined' && Array.isArray(measureFields)) {
            newStk = measureFields.reduce((s, m) => s + (parseInt(m.stueck) || 0), 0);
        }
    } catch(e) { /* ignore */ }

    const prop = getProposedFristRange(newStk);
    if (!prop.valid) {
        if (hint) hint.textContent = '';
        return;
    }

    // Single-Feld-Variante: das eigentliche Frist-Feld trägt das BIS-Datum.
    // Die volle Spanne (Von–Bis) erscheint als kleine Info darunter.
    if (!bisEl.dataset.touched) bisEl.value = _prodstats_dateInputValue(prop.to);
    if (hint) hint.textContent = `Spanne: ${_prodstats_formatDate(prop.from)} – ${_prodstats_formatDate(prop.to)}`;
}

/**
 * Übernimmt den mittleren Vorschlags-Wert ins Fristdatum-Feld.
 */
function applyFristVorschlag() {
    let newStk = 0;
    try {
        if (typeof measureFields !== 'undefined' && Array.isArray(measureFields)) {
            newStk = measureFields.reduce((s, m) => s + (parseInt(m.stueck) || 0), 0);
        }
    } catch(e) {}
    const prop = getProposedFristRange(newStk);
    if (!prop.valid) return;
    const fristEl = document.getElementById('newFrist');
    if (fristEl) {
        fristEl.value = _prodstats_dateInputValue(prop.mid);
        if (typeof showToast === 'function') {
            showToast('Frist übernommen: ' + _prodstats_formatDate(prop.mid), 'success', 2000);
        }
    }
}

// ─── Auswertung-Karte (Detail-Ansicht) ───────────────────────────────

/**
 * Liefert HTML für eine Detail-Karte in der Auswertung.
 * Wird in renderDashboard() (05-output.js) aufgerufen.
 */
function getProductionStatsCardHTML() {
    const stats = getProductionStats();
    const prop = getProposedFristRange();

    if (stats.avgPerDay <= 0) {
        return `<div class="card">
            <div class="card-label">Tageskapazität</div>
            <div style="padding:12px; color:var(--text-muted); font-size:13px; text-align:center">
                Noch nicht genug Produktions-Daten in den letzten ${PRODSTATS_DAYS} Tagen.
            </div>
        </div>`;
    }

    // Mini-Chart der letzten 7 Tage
    const maxStk = Math.max(...stats.last7days.map(d => d.stk), 1);
    const chartHTML = stats.last7days.map(d => {
        const h = Math.max(2, (d.stk / maxStk) * 50);
        const dayLabel = ['So','Mo','Di','Mi','Do','Fr','Sa'][d.date.getDay()];
        const opacity = d.isWerktag ? '1' : '0.4';
        return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; opacity:${opacity}">
            <div style="font-size:9px; font-weight:600; color:var(--text-muted)">${d.stk || '·'}</div>
            <div style="width:100%; background:#534AB7; border-radius:3px 3px 0 0; height:${h}px; min-height:2px"></div>
            <div style="font-size:9px; color:var(--text-muted)">${dayLabel}</div>
        </div>`;
    }).join('');

    return `<div class="card">
        <div class="card-label">Tageskapazität & Lieferzeit</div>

        <div style="padding:10px 0; text-align:center">
            <div style="font-size:36px; font-weight:800; color:var(--primary); line-height:1">
                Ø ${stats.avgPerDay}
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px">
                Stk pro Werktag (letzte ${PRODSTATS_DAYS} Tage, ${stats.activeDays} aktive Tage)
            </div>
        </div>

        <div style="display:flex; align-items:flex-end; gap:4px; height:75px; padding:0 4px; margin:8px 0">
            ${chartHTML}
        </div>
        <div style="font-size:10px; color:var(--text-muted); text-align:center; margin-bottom:12px">
            Letzte 7 Tage
        </div>

        <div style="border-top:1px solid var(--border-light); padding-top:10px; margin-top:8px">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">
                Aktuelle Warteschlange
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; padding:4px 0">
                <span>Offene Stk gesamt:</span>
                <strong style="font-size:16px">${stats.openStk} Stk</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; padding:4px 0; color:var(--text-muted)">
                <span>In ${stats.openOrders} Bestellungen</span>
                <span>~ ${stats.estimatedDays} Werktage</span>
            </div>
        </div>

        ${prop.valid ? `
        <div style="border-top:1px solid var(--border-light); padding-top:10px; margin-top:8px">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">
                Lieferzeit-Prognose
            </div>
            <div style="background:#f0eeff; border-radius:10px; padding:12px; text-align:center">
                <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px">Spanne (5-Tage-Fenster):</div>
                <div style="font-size:15px; font-weight:700; color:var(--primary)">
                    ${_prodstats_formatDate(prop.from)} – ${_prodstats_formatDate(prop.to)}
                </div>
            </div>
        </div>` : ''}
    </div>`;
}

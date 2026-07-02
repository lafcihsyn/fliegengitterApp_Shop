// ═══════════════════════════════════════════════════════════════════
// 11-buchhaltung.js — Buchhaltung > Online Zahlungen
//
// Listet alle Stripe-Zahlungen aus dem Webshop mit Filter (Tag/Woche/
// Monat/Jahr/Custom), Netto/Brutto/MwSt-Aufstellung, CSV/PDF-Export
// und Rechnung-Drucken pro Zeile.
//
// Daten kommen aus dem globalen `orders[]` Array (subscribeOrders).
// Es wird NICHT extra geladen — alles ist im Memory.
//
// Globale Abhängigkeiten:
//   - orders[], hasPerm(), isAdmin(), showToast(), firebase
// ═══════════════════════════════════════════════════════════════════

const VAT_RATE = 0.20; // 20 % MwSt Österreich
const COMPANY_NAME_BUCHHALTUNG = 'Bella Home GmbH';

function initBuchhaltung() {
    // Default: aktueller Monat, Live-only
    const periodEl = document.getElementById('buchhaltungPeriod');
    const testToggleEl = document.getElementById('buchhaltungShowTest');
    if (periodEl) periodEl.value = 'month';
    if (testToggleEl) testToggleEl.checked = false;
    // Custom-Range-Felder verstecken
    const customWrap = document.getElementById('buchhaltungCustomRange');
    if (customWrap) customWrap.style.display = 'none';
    renderBuchhaltung();
}

function onBuchhaltungPeriodChange() {
    const period = document.getElementById('buchhaltungPeriod')?.value || 'month';
    const customWrap = document.getElementById('buchhaltungCustomRange');
    if (customWrap) customWrap.style.display = (period === 'custom') ? 'flex' : 'none';
    if (period === 'custom') {
        // Default-Werte setzen: Monatsanfang bis heute
        const fromEl = document.getElementById('buchhaltungFrom');
        const toEl = document.getElementById('buchhaltungTo');
        if (fromEl && !fromEl.value) {
            const d = new Date(); d.setDate(1);
            fromEl.value = d.toISOString().slice(0, 10);
        }
        if (toEl && !toEl.value) {
            toEl.value = new Date().toISOString().slice(0, 10);
        }
    }
    renderBuchhaltung();
}

// Liefert {from, to, label} für die aktuell gewählte Periode.
function getBuchhaltungRange() {
    const period = document.getElementById('buchhaltungPeriod')?.value || 'month';
    const now = new Date();
    let from, to, label;

    if (period === 'day') {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        label = now.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } else if (period === 'week') {
        // Montag als Wochenanfang
        const day = now.getDay() || 7; // Sonntag=0 → 7
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1, 0, 0, 0);
        to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
        const kw = getISOWeek(from);
        const fmt = d => d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        label = `KW ${kw} (${fmt(from)}–${fmt(to)})`;
    } else if (period === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
        label = `${months[now.getMonth()]} ${now.getFullYear()}`;
    } else if (period === 'year') {
        from = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        to = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        label = `Jahr ${now.getFullYear()} (01.01.–31.12.${now.getFullYear()})`;
    } else if (period === 'custom') {
        const fromStr = document.getElementById('buchhaltungFrom')?.value;
        const toStr = document.getElementById('buchhaltungTo')?.value;
        if (!fromStr || !toStr) {
            return { from: new Date(2020,0,1), to: new Date(), label: 'Alle Zeit' };
        }
        from = new Date(fromStr + 'T00:00:00');
        to = new Date(toStr + 'T23:59:59');
        const fmt = d => d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        label = `${fmt(from)} – ${fmt(to)}`;
    } else {
        from = new Date(2020, 0, 1);
        to = new Date();
        label = 'Alle Zeit';
    }

    return { from, to, label };
}

function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Wandelt diverse Datumsformate (Firestore-Timestamp, JS-Date, ISO-String) in Date um.
function toDate(v) {
    if (!v) return null;
    if (v.toDate && typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v === 'string' || typeof v === 'number') return new Date(v);
    if (v.seconds != null) return new Date(v.seconds * 1000);
    return null;
}

// Hauptdatenfunktion — gibt Array von Rows zurück (eine Zeile pro Zahlung
// + eine pro Refund). Wird vom Render UND vom Export wiederverwendet.
function buildPaymentRows(allOrders, range, includeTest) {
    const rows = [];
    for (const o of (allOrders || [])) {
        if (o.source !== 'online') continue;
        const payments = Array.isArray(o.payments) ? o.payments : [];
        // Eine Row pro Stripe-Zahlung
        for (const p of payments) {
            if (p.source !== 'stripe') continue;
            const datum = toDate(p.receivedAt);
            if (!datum) continue;
            if (datum < range.from || datum > range.to) continue;
            const live = (p.livemode !== false);
            if (!includeTest && !live) continue;

            const brutto = Number(p.amountGross) || 0;
            const netto = brutto / (1 + VAT_RATE);
            const mwst = brutto - netto;
            rows.push({
                datum,
                orderNumber: o.orderNumber || '—',
                kunde: `${o.vorname || ''} ${o.nachname || ''}`.trim() || '—',
                email: o.email || '',
                bruttoBetrag: round2(brutto),
                nettoBetrag: round2(netto),
                mwstBetrag: round2(mwst),
                methode: p.paymentMethod || 'card',
                status: o.paymentStatus || 'paid',
                livemode: live,
                paymentIntentId: p.paymentIntentId || null,
                sessionId: p.sessionId || null,
                isRefund: false,
                orderId: o.id,
                depositInvoiceNumber: o.depositInvoiceNumber || null,
                finalInvoiceNumber: o.finalInvoiceNumber || null
            });
        }
        // Refund-Zeile falls zutreffend
        if (o.refundedAmount && o.refundedAmount > 0) {
            const refundDate = toDate(o.lastRefundAt)
                || extractRefundDateFromLog(o)
                || toDate(o.lastPaymentAt)
                || null;
            if (!refundDate) continue;
            if (refundDate < range.from || refundDate > range.to) continue;
            const live = (o.livemode !== false);
            if (!includeTest && !live) continue;

            const brutto = -Math.abs(Number(o.refundedAmount) || 0);
            const netto = brutto / (1 + VAT_RATE);
            const mwst = brutto - netto;
            rows.push({
                datum: refundDate,
                orderNumber: o.orderNumber || '—',
                kunde: `${o.vorname || ''} ${o.nachname || ''}`.trim() || '—',
                email: o.email || '',
                bruttoBetrag: round2(brutto),
                nettoBetrag: round2(netto),
                mwstBetrag: round2(mwst),
                methode: 'Refund',
                status: o.paymentStatus || 'refunded',
                livemode: live,
                paymentIntentId: (payments[0] && payments[0].paymentIntentId) || null,
                sessionId: null,
                isRefund: true,
                orderId: o.id,
                depositInvoiceNumber: o.depositInvoiceNumber || null,
                finalInvoiceNumber: o.finalInvoiceNumber || null
            });
        }
    }
    // Neueste zuerst
    rows.sort((a, b) => b.datum - a.datum);
    return rows;
}

function extractRefundDateFromLog(order) {
    const log = Array.isArray(order.log) ? order.log : [];
    for (let i = log.length - 1; i >= 0; i--) {
        if (/Rückerstattung/i.test(log[i].text || '')) {
            return toDate(log[i].time);
        }
    }
    return null;
}

function round2(n) { return Math.round(n * 100) / 100; }

function eur(n) {
    const v = Number(n) || 0;
    return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(v);
}

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function methodLabel(m) {
    const map = {
        // Wallets (höchste Priorität — werden vom Webhook erkannt seit Juni 2026)
        apple_pay:   'Apple Pay',
        google_pay:  'Google Pay',
        samsung_pay: 'Samsung Pay',
        // Plain-Karten (Brand)
        visa:        'Visa',
        mastercard:  'Mastercard',
        amex:        'American Express',
        diners:      'Diners Club',
        discover:    'Discover',
        jcb:         'JCB',
        unionpay:    'UnionPay',
        // Generischer Karten-Fallback (alte Zahlungen vor Webhook-Update)
        card:        'Karte',
        // Andere Zahlungsmethoden
        eps:         'EPS',
        klarna:      'Klarna',
        sepa_debit:  'SEPA',
        sofort:      'Sofort',
        bancontact:  'Bancontact',
        ideal:       'iDEAL',
        giropay:     'Giropay',
        Refund:      'Refund'
    };
    return map[m] || m || '—';
}

function statusBadge(status, isRefund) {
    if (isRefund) return '<span style="color:#dc2626;font-weight:600">Rückerstattung</span>';
    const map = {
        paid: '<span style="color:#059669;font-weight:600">bezahlt</span>',
        refunded: '<span style="color:#dc2626;font-weight:600">erstattet</span>',
        partial_refund: '<span style="color:#d97706;font-weight:600">teil-erstattet</span>',
        pending: '<span style="color:#6b7280;font-weight:600">offen</span>',
        expired: '<span style="color:#6b7280;font-weight:600">abgelaufen</span>',
        failed: '<span style="color:#dc2626;font-weight:600">fehlgeschlagen</span>'
    };
    return map[status] || `<span>${escapeHtml(status)}</span>`;
}

function renderBuchhaltung() {
    if (!hasPerm('buchhaltung_view') && !isAdmin()) {
        showToast('Keine Berechtigung.', 'warning'); return;
    }
    const range = getBuchhaltungRange();
    const includeTest = !!document.getElementById('buchhaltungShowTest')?.checked;
    const rows = buildPaymentRows(orders || [], range, includeTest);

    // Summen-Berechnung
    const bruttoSum = rows.filter(r => !r.isRefund).reduce((s, r) => s + r.bruttoBetrag, 0);
    const refundSum = rows.filter(r => r.isRefund).reduce((s, r) => s + r.bruttoBetrag, 0); // bereits negativ
    const nettoBrutto = bruttoSum + refundSum;
    const netto = nettoBrutto / (1 + VAT_RATE);
    const mwst = nettoBrutto - netto;
    const txCount = rows.filter(r => !r.isRefund).length;

    // Methoden-Aufteilung (nur Zahlungen, keine Refunds)
    const byMethod = {};
    rows.filter(r => !r.isRefund).forEach(r => {
        byMethod[r.methode] = (byMethod[r.methode] || 0) + r.bruttoBetrag;
    });
    const methodList = Object.entries(byMethod).sort((a, b) => b[1] - a[1])
        .map(([m, v]) => `<span style="display:inline-block;margin-right:10px"><strong>${methodLabel(m)}:</strong> ${eur(v)}</span>`).join('');

    // Summary-Kacheln
    const summaryEl = document.getElementById('buchhaltungSummary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px">
                <div style="background:var(--card);padding:12px;border-radius:10px;border:1px solid var(--border)">
                    <div style="font-size:11px;color:var(--text-muted);font-weight:600">BRUTTO-UMSATZ</div>
                    <div style="font-size:18px;font-weight:700;color:#059669">${eur(bruttoSum)}</div>
                </div>
                <div style="background:var(--card);padding:12px;border-radius:10px;border:1px solid var(--border)">
                    <div style="font-size:11px;color:var(--text-muted);font-weight:600">RÜCKERSTATTUNGEN</div>
                    <div style="font-size:18px;font-weight:700;color:#dc2626">${eur(refundSum)}</div>
                </div>
                <div style="background:var(--card);padding:12px;border-radius:10px;border:2px solid var(--primary)">
                    <div style="font-size:11px;color:var(--text-muted);font-weight:600">NETTO-BRUTTO</div>
                    <div style="font-size:18px;font-weight:700">${eur(nettoBrutto)}</div>
                </div>
                <div style="background:var(--card);padding:12px;border-radius:10px;border:1px solid var(--border)">
                    <div style="font-size:11px;color:var(--text-muted);font-weight:600">NETTO (ohne MwSt)</div>
                    <div style="font-size:18px;font-weight:700">${eur(netto)}</div>
                </div>
                <div style="background:var(--card);padding:12px;border-radius:10px;border:1px solid var(--border)">
                    <div style="font-size:11px;color:var(--text-muted);font-weight:600">MWST-ANTEIL (20%)</div>
                    <div style="font-size:18px;font-weight:700">${eur(mwst)}</div>
                </div>
                <div style="background:var(--card);padding:12px;border-radius:10px;border:1px solid var(--border)">
                    <div style="font-size:11px;color:var(--text-muted);font-weight:600">TRANSAKTIONEN</div>
                    <div style="font-size:18px;font-weight:700">${txCount}</div>
                </div>
            </div>
            ${methodList ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">${methodList}</div>` : ''}
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px"><strong>Zeitraum:</strong> ${escapeHtml(range.label)}</div>
        `;
    }

    // Tabelle
    const tableEl = document.getElementById('buchhaltungTable');
    if (!tableEl) return;
    if (rows.length === 0) {
        tableEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">Keine Online-Zahlungen in diesem Zeitraum.</div>`;
        return;
    }

    const fmtDateTime = d => d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })
        + ' ' + d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });

    const rowsHtml = rows.map(r => {
        const rowStyle = r.isRefund ? 'background:#fef2f2' : '';
        const valStyle = r.isRefund ? 'color:#dc2626;font-weight:600' : '';
        const svgAttrs = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"';
        const linkSvg = `<svg ${svgAttrs}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
        const printerSvg = `<svg ${svgAttrs}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;

        const stripeLink = r.paymentIntentId
            ? `<a href="https://dashboard.stripe.com/${r.livemode ? '' : 'test/'}payments/${escapeHtml(r.paymentIntentId)}" target="_blank" title="Im Stripe ansehen" style="text-decoration:none;color:var(--primary);padding:5px 6px;border-radius:6px">${linkSvg}</a>`
            : '';
        // „Rechnung drucken" — bei Refund-Zeile Anzahlungsrechnung verwenden, sonst je nach Status
        const invType = r.finalInvoiceNumber ? 'final' : (r.depositInvoiceNumber ? 'deposit' : null);
        const hasInvoice = !!invType;
        const printBtn = hasInvoice
            ? `<button onclick="openInvoicePDF('${escapeHtml(r.orderId)}','${invType}')" title="Rechnung drucken" style="background:none;border:none;cursor:pointer;padding:5px 6px;border-radius:6px;color:var(--primary)">${printerSvg}</button>`
            : `<span title="Rechnung noch nicht erstellt" style="opacity:0.3;padding:5px 6px;color:var(--text-muted);display:inline-flex">${printerSvg}</span>`;
        const testBadge = !r.livemode
            ? '<span style="display:inline-block;background:#fbbf24;color:#78350f;font-size:9px;padding:1px 5px;border-radius:4px;margin-left:4px;font-weight:700">TEST</span>'
            : '';

        const invoiceNr = r.finalInvoiceNumber || r.depositInvoiceNumber || '—';
        return `<tr style="${rowStyle}">
            <td style="padding:8px 10px;font-size:12px;white-space:nowrap">${fmtDateTime(r.datum)}${testBadge}</td>
            <td style="padding:8px 10px;font-size:12px;white-space:nowrap">${escapeHtml(invoiceNr)}</td>
            <td style="padding:8px 10px;font-size:12px;white-space:nowrap">${escapeHtml(r.orderNumber)}</td>
            <td style="padding:8px 10px;font-size:12px">${escapeHtml(r.kunde)}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:right;${valStyle}">${eur(r.bruttoBetrag)}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:right;${valStyle}">${eur(r.nettoBetrag)}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:right;${valStyle}">${eur(r.mwstBetrag)}</td>
            <td style="padding:8px 10px;font-size:12px">${methodLabel(r.methode)}</td>
            <td style="padding:8px 10px;font-size:12px">${statusBadge(r.status, r.isRefund)}</td>
            <td style="padding:8px 10px;font-size:12px;white-space:nowrap">
                <div style="display:flex;flex-direction:row;justify-content:flex-end;align-items:center;gap:4px;flex-wrap:nowrap">${stripeLink}${printBtn}</div>
            </td>
        </tr>`;
    }).join('');

    tableEl.innerHTML = `
        <div style="overflow-x:auto;background:var(--card);border-radius:10px;border:1px solid var(--border)">
            <table style="width:100%;border-collapse:collapse">
                <thead>
                    <tr style="background:var(--bg-secondary,#f9fafb);border-bottom:1px solid var(--border)">
                        <th style="padding:10px;font-size:11px;text-align:left;color:var(--text-muted);font-weight:700">DATUM</th>
                        <th style="padding:10px;font-size:11px;text-align:left;color:var(--text-muted);font-weight:700">RECHNUNG</th>
                        <th style="padding:10px;font-size:11px;text-align:left;color:var(--text-muted);font-weight:700">BEST.-NR.</th>
                        <th style="padding:10px;font-size:11px;text-align:left;color:var(--text-muted);font-weight:700">KUNDE</th>
                        <th style="padding:10px;font-size:11px;text-align:right;color:var(--text-muted);font-weight:700">BRUTTO</th>
                        <th style="padding:10px;font-size:11px;text-align:right;color:var(--text-muted);font-weight:700">NETTO</th>
                        <th style="padding:10px;font-size:11px;text-align:right;color:var(--text-muted);font-weight:700">MWST</th>
                        <th style="padding:10px;font-size:11px;text-align:left;color:var(--text-muted);font-weight:700">METHODE</th>
                        <th style="padding:10px;font-size:11px;text-align:left;color:var(--text-muted);font-weight:700">STATUS</th>
                        <th style="padding:10px;font-size:11px;text-align:right;color:var(--text-muted);font-weight:700">AKTIONEN</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

// Rechnung-PDF aus Cloud Storage öffnen.
async function openInvoicePDF(orderId, type) {
    const o = (orders || []).find(x => x.id === orderId);
    if (!o) { showToast('Bestellung nicht gefunden.', 'warning'); return; }
    const invNumber = (type === 'final') ? o.finalInvoiceNumber : o.depositInvoiceNumber;
    if (!invNumber) { showToast('Rechnung wurde noch nicht erstellt.', 'info'); return; }

    if (!firebase.storage) {
        showToast('Storage SDK nicht geladen.', 'error'); return;
    }
    try {
        const path = `invoices/${invNumber}.pdf`;
        const url = await firebase.storage().ref(path).getDownloadURL();
        window.open(url, '_blank');
    } catch (e) {
        console.error('[openInvoicePDF]', e);
        showToast('Rechnung konnte nicht geöffnet werden.', 'error');
    }
}

// CSV-Export (deutsches Format, UTF-8 BOM für Excel).
function exportBuchhaltungCSV() {
    if (!hasPerm('buchhaltung_export') && !isAdmin()) {
        showToast('Keine Berechtigung.', 'warning'); return;
    }
    const range = getBuchhaltungRange();
    const includeTest = !!document.getElementById('buchhaltungShowTest')?.checked;
    const rows = buildPaymentRows(orders || [], range, includeTest);
    if (rows.length === 0) { showToast('Keine Daten zum Export.', 'info'); return; }

    const fmtNum = n => (Number(n) || 0).toFixed(2).replace('.', ',');
    const fmtDate = d => {
        const pad = x => String(x).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const escapeCsv = v => {
        const s = String(v == null ? '' : v);
        return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    let csv = 'Datum;Rechnungsnummer;Bestellnummer;Kunde;Email;Brutto;Netto;MwSt;Methode;Status;Test/Live;StripeID\n';
    for (const r of rows) {
        csv += [
            fmtDate(r.datum),
            r.finalInvoiceNumber || r.depositInvoiceNumber || '',
            r.orderNumber,
            r.kunde,
            r.email,
            fmtNum(r.bruttoBetrag),
            fmtNum(r.nettoBetrag),
            fmtNum(r.mwstBetrag),
            methodLabel(r.methode),
            r.isRefund ? 'Rückerstattung' : (r.status || ''),
            r.livemode ? 'Live' : 'Test',
            r.paymentIntentId || ''
        ].map(escapeCsv).join(';') + '\n';
    }

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `online-zahlungen_${slugifyLabel(range.label)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`CSV exportiert: ${rows.length} Zeilen`, 'success');
}

function slugifyLabel(s) {
    return String(s || '').toLowerCase()
        .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

// PDF-Export via neues Druck-Fenster.
function exportBuchhaltungPDF() {
    if (!hasPerm('buchhaltung_export') && !isAdmin()) {
        showToast('Keine Berechtigung.', 'warning'); return;
    }
    const range = getBuchhaltungRange();
    const includeTest = !!document.getElementById('buchhaltungShowTest')?.checked;
    const rows = buildPaymentRows(orders || [], range, includeTest);
    if (rows.length === 0) { showToast('Keine Daten zum Export.', 'info'); return; }

    const bruttoSum = rows.filter(r => !r.isRefund).reduce((s, r) => s + r.bruttoBetrag, 0);
    const refundSum = rows.filter(r => r.isRefund).reduce((s, r) => s + r.bruttoBetrag, 0);
    const nettoBrutto = bruttoSum + refundSum;
    const netto = nettoBrutto / (1 + VAT_RATE);
    const mwst = nettoBrutto - netto;

    const fmtDateTime = d => d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });

    const rowsHtml = rows.map(r => {
        const style = r.isRefund ? 'color:#dc2626;' : '';
        const invoiceNr = r.finalInvoiceNumber || r.depositInvoiceNumber || '—';
        return `<tr style="${style}">
            <td>${fmtDateTime(r.datum)}${!r.livemode ? ' <span style="font-size:9px;color:#92400e">[TEST]</span>' : ''}</td>
            <td>${escapeHtml(invoiceNr)}</td>
            <td>${escapeHtml(r.orderNumber)}</td>
            <td>${escapeHtml(r.kunde)}</td>
            <td style="text-align:right">${eur(r.bruttoBetrag)}</td>
            <td style="text-align:right">${eur(r.nettoBetrag)}</td>
            <td style="text-align:right">${eur(r.mwstBetrag)}</td>
            <td>${methodLabel(r.methode)}</td>
            <td>${r.isRefund ? 'Rückerstattung' : (r.status || '')}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Online Zahlungen — ${escapeHtml(range.label)}</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system,Helvetica,Arial,sans-serif; padding: 25px; color: #1a1a2e; font-size: 12px; }
            .head { display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:10px;margin-bottom:18px }
            .head .firm { font-size:18px;font-weight:700 }
            .head .period { font-size:13px;color:#374151 }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { text-align: left; font-size: 10px; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid #1a1a2e; }
            td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
            tfoot td { font-weight: 700; border-top: 2px solid #1a1a2e; border-bottom: none; padding-top: 10px; }
            .summary { margin-top: 20px; display:grid;grid-template-columns:repeat(2,1fr);gap:6px 30px;max-width:480px;margin-left:auto }
            .summary .row { display:flex;justify-content:space-between;border-bottom:1px dotted #ccc;padding:4px 0 }
            .summary .row.big { border-bottom:2px solid #1a1a2e;font-weight:700;font-size:13px }
            @media print { .noprint { display: none; } body { padding: 12mm; } }
        </style></head><body>
        <div class="head">
            <div class="firm">${escapeHtml(COMPANY_NAME_BUCHHALTUNG)}</div>
            <div class="period">Online Zahlungen — <strong>${escapeHtml(range.label)}</strong></div>
        </div>
        <table>
            <thead>
                <tr><th>Datum</th><th>Rechnung</th><th>Best.-Nr.</th><th>Kunde</th><th style="text-align:right">Brutto</th><th style="text-align:right">Netto</th><th style="text-align:right">MwSt</th><th>Methode</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
        <div class="summary">
            <div class="row"><span>Brutto-Umsatz</span><span>${eur(bruttoSum)}</span></div>
            <div class="row"><span>Rückerstattungen</span><span style="color:#dc2626">${eur(refundSum)}</span></div>
            <div class="row big"><span>Netto-Brutto (Bemessungsgrundlage)</span><span>${eur(nettoBrutto)}</span></div>
            <div class="row"><span>Netto (ohne MwSt)</span><span>${eur(netto)}</span></div>
            <div class="row"><span>MwSt-Anteil (20 %)</span><span>${eur(mwst)}</span></div>
        </div>
        <div style="margin-top:30px;font-size:10px;color:#6b7280">
            Erstellt am ${new Date().toLocaleString('de-AT')} — ${rows.length} Buchungszeile(n)
        </div>
        <div class="noprint" style="margin-top:20px;text-align:center">
            <button onclick="window.print()" style="padding:10px 20px;font-size:14px;background:#534AB7;color:#fff;border:none;border-radius:6px;cursor:pointer">Drucken / Als PDF speichern</button>
        </div>
        <script>setTimeout(()=>window.print(),300);<\/script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { showToast('Popup-Blocker deaktivieren!', 'warning'); return; }
    w.document.write(html);
    w.document.close();
}

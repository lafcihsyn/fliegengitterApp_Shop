// ═══════════════════════════════════════════════════════════════════
// 03-auth.js — Authentifizierung & Berechtigungen
//
// Stellt bereit (alle global, da kein Modul-System):
//   - SUPERADMIN_EMAIL, DEFAULT_PERMS — Konfiguration
//   - currentUserRole, currentUserPerms — Status (gefüllt nach Login)
//   - auth.onAuthStateChanged Listener — reagiert auf Login/Logout
//   - togglePwVisibility() — Augensymbol im Login
//   - doLogin() — Login-Button-Handler
//   - doLogout() — Logout-Button-Handler
//
// WICHTIG: Diese Datei MUSS ZULETZT geladen werden (nach inline script),
// weil onAuthStateChanged-Listener viele Funktionen aufruft, die im 
// inline script definiert sind: loadSettings, subscribeOrders, renderAll, 
// applyRoleRestrictions, initBackupCard, loadFilialen, loadColors, ...
//
// Globale Abhängigkeiten (im inline script definiert):
//   - auth, db (Firebase)
//   - APP_VERSION
//   - showToast, showConfirm (aus 01-helpers.js)
//   - setLanguage, t, currentLanguage, TRANSLATIONS_TR (aus 02-i18n.js)
//   - viele weitere Funktionen (siehe oben)
// ═══════════════════════════════════════════════════════════════════

// Auth persistence based on "remember me" setting
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// HINWEIS: currentUserRole und currentUserPerms werden im inline-Script in
// index.html vorausdeklariert (mit Default 'mitarbeiter' / {}). Hier werden
// sie nur noch verwendet/zugewiesen, NICHT erneut deklariert.
const SUPERADMIN_EMAIL = 'lafci.hsyn@gmail.com';

// All available permissions
const PERM_GROUPS = {
    'Bestellungen': {
        'orders_create': 'Neue Bestellungen erstellen',
        'orders_edit': 'Bestellungen bearbeiten',
        'orders_delete': 'Bestellungen löschen',
        'orders_payment': 'Zahlungen eintragen',
        'order_price_edit': 'Bestellpreis ändern (Gesamtpreis einzelner Bestellung)',
        'price_edit': 'm²-Preis ändern (global, in Einstellungen)',
        'orders_pdf': 'PDF exportieren',
        'orders_rechner': 'In Schnittliste öffnen',
        'reparatur_handle': 'Reparaturen erfassen & sehen',
        'view_all_filialen': 'Alle Filialen sehen (auch fremde)'
    },
    'Verschieben': {
        'move_to_warteliste': '→ Warteliste',
        'move_to_produktion': '→ In Produktion',
        'move_to_transport': '→ Transport (Inegöl-Lieferung)',
        'move_to_abholbereit': '→ Abholbereit',
        'move_to_abgeholt': '→ Abgeholt',
        'bware_move': '→ B-Ware'
    },
    'Kunden': {
        'customer_notify': 'Benachrichtigen (WhatsApp)',
        'bware_check': 'B-Ware Vorschläge sehen'
    },
    'Lager': {
        'lager_view': 'Lager anzeigen',
        'lager_eingang': 'Wareneingang buchen',
        'lager_inventur': 'Inventur durchführen'
    },
    'Sonstiges': {
        'dashboard_view': 'Statistik anzeigen',
        'rechner_use': 'Schnittliste verwenden',
        'rechner_print': 'Etiketten drucken',
        'settings_view': 'Einstellungen anzeigen',
        'prices_view': 'Preise sehen (Beträge, Summen, €-Werte)',
        'members_invite': 'Mitarbeiter einladen',
        'members_roles': 'Rollen verwalten',
        'mitarbeiter_leistung_view': 'Mitarbeiter-Leistung sehen (Produktions-Drill-down)',
        'columns_manage': 'Spalten verwalten',
        'transport_view': 'Transport-Spalte sehen'
    },
    'Buchhaltung': {
        'buchhaltung_view':   'Online-Zahlungen einsehen',
        'buchhaltung_export': 'Zahlungen als CSV/PDF exportieren'
    }
};
const ALL_PERMISSIONS = {};
Object.values(PERM_GROUPS).forEach(g => Object.assign(ALL_PERMISSIONS, g));

// Default permissions per role
const DEFAULT_PERMS = {
    admin: Object.keys(ALL_PERMISSIONS).reduce((o,k) => { o[k]=true; return o; }, {}),
    mitarbeiter: {
        orders_create: true, orders_edit: true, orders_delete: false,
        move_to_warteliste: true, move_to_produktion: true, move_to_abholbereit: true, move_to_abgeholt: true, orders_payment: true, orders_pdf: true,
        // Transport-Rechte: Default AN für alle (auch via DEFAULT_ALLOW_PERMISSIONS für bestehende Mitarbeiter).
        // Owner hakt in „Rollen verwalten" gezielt ab, wer NICHT sehen/verschieben darf.
        move_to_transport: true, transport_view: true,
        orders_rechner: false,
        reparatur_handle: false,
        customer_notify: false,
        bware_check: false,
        bware_move: false,
        lager_view: false, lager_eingang: false, lager_inventur: false,
        dashboard_view: false,
        rechner_use: true, rechner_print: true,
        // v1.19.14: prices_view standardmäßig true → kein Bruch für bestehende Mitarbeiter
        // Admin kann gezielt abhaken um Preise für einzelne Mitarbeiter zu verstecken.
        prices_view: true,
        settings_view: false, price_edit: false, order_price_edit: false, members_invite: false,
        members_roles: false, mitarbeiter_leistung_view: false, columns_manage: false,
        buchhaltung_view: false, buchhaltung_export: false
    }
};

// ═══ Number-Input-Komfort: Inhalt beim Fokus markieren (v1.15.0-p5) ═══
// Sobald der Mitarbeiter ein Number-Feld betippt, wird der bestehende Wert
// automatisch markiert. So überschreibt die nächste Tasteneingabe einfach.
// Verhindert das Problem dass "0" im Feld stehen bleibt und Eingaben "060" werden.
document.addEventListener('focusin', e => {
    const el = e.target;
    if (el && el.tagName === 'INPUT' && (el.type === 'number' || el.type === 'text')) {
        // Nur bei Number-Inputs oder Text-Inputs mit inputmode="decimal"/"numeric"
        if (el.type === 'number' || el.inputMode === 'decimal' || el.inputMode === 'numeric') {
            // Kurze Verzögerung damit native Caret-Setzung uns nicht überholt
            setTimeout(() => {
                try { el.select(); } catch(_) {}
            }, 10);
        }
    }
});


auth.onAuthStateChanged(async user => {
    currentUser = user;
    if (user) {
        // Load user role and permissions
        try {
            const memberDoc = await db.collection('members').doc(user.uid).get();
            // v1.19.61: Deaktivierte Mitarbeiter aussperren (Zugang gesperrt, Historie bleibt).
            // Superadmin kann nie ausgesperrt werden. Nur explizit active:false blockiert —
            // neue/Bestands-Mitarbeiter ohne Flag bleiben erlaubt.
            if (memberDoc.exists && memberDoc.data().active === false && user.email !== SUPERADMIN_EMAIL) {
                await auth.signOut();
                const le = document.getElementById('loginError');
                if (le) le.textContent = 'Dein Zugang wurde deaktiviert. Bitte wende dich an die Geschäftsleitung.';
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('appScreen').classList.remove('active');
                return;
            }
            if (memberDoc.exists) {
                const data = memberDoc.data();
                currentUserRole = data.role || 'mitarbeiter';
                if (user.email === SUPERADMIN_EMAIL) currentUserRole = 'superadmin';
                currentUserFilialeId = data.filialeId || '';
                currentUserFiliale = data.filialeName || '';
                currentUserPerms = data.permissions || DEFAULT_PERMS[currentUserRole] || DEFAULT_PERMS.mitarbeiter;
                // v1.18.2-phase1: localStorage hat VORRANG (User-Klick gewinnt)
                // Firestore wird nur als Fallback genutzt wenn localStorage leer ist.
                // Wenn beide unterschiedlich sind: Firestore wird zum localStorage-Wert synchronisiert.
                let localLang = null;
                try { localLang = localStorage.getItem('app_language'); } catch(e) {}
                const fsLang = (data.language === 'tr' || data.language === 'de') ? data.language : null;
                if (localLang === 'tr' || localLang === 'de') {
                    // localStorage gewinnt
                    currentLanguage = localLang;
                    // Wenn Firestore abweicht: Firestore nachziehen
                    if (fsLang && fsLang !== localLang) {
                        try { db.collection('members').doc(user.uid).update({ language: localLang }); } catch(e) {}
                    }
                } else if (fsLang) {
                    // Kein localStorage → Firestore-Wert übernehmen
                    currentLanguage = fsLang;
                    try { localStorage.setItem('app_language', fsLang); } catch(e) {}
                }
            }
        } catch(e) { console.log('Role load:', e); }
        // Admin always has all permissions
        if (currentUserRole === 'admin') currentUserPerms = DEFAULT_PERMS.admin;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').classList.add('active');
        document.getElementById('headerUser').textContent = user.email;
        applyRoleRestrictions();
        // Register/update member in Firestore
        db.collection('members').doc(user.uid).set({
            email: user.email,
            name: user.email.split('@')[0] || 'Unbekannt',
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(console.error);
        loadSettings();
        loadRechnerMaterials();
        // v1.18.12-fix: subscribeOrders, renderAll, renderNewForm und renderBoardColumns
        // liegen in externen JS-Dateien (07-board.js, 08-order.js). Bei restorter
        // Firebase-Session kann dieser Auth-Listener feuern bevor die Scripts geladen
        // sind. Daher: Funktionen die nicht geladen sind, verzögern wir auf window.load.
        const doRender = () => {
            if (typeof subscribeOrders === 'function') subscribeOrders();
            if (typeof renderAll === 'function') {
                try { renderAll(); } catch(e) { console.error('renderAll:', e); }
            }
            if (typeof renderNewForm === 'function') renderNewForm();
            if (typeof renderBoardColumns === 'function') renderBoardColumns();
        };
        if (document.readyState === 'complete') {
            doRender();
        } else {
            window.addEventListener('load', doRender, { once: true });
        }
        // v1.18.0: i18n-Observer starten (übersetzt alles automatisch wenn currentLanguage='tr')
        startI18nObserver();
        // Backup system
        setTimeout(() => { initBackupCard(); checkBackupReminder(); loadFilialen(); loadColors(); loadPlisseeColors(); loadNetzColors(); loadNetzBreiten(); loadMaterialDimensions(); loadVariants(); loadModels(); loadCompanyData(); }, 2000);
        // v1.20.0: FCM-Token nach Login sicherstellen (falls Push schon erlaubt ist)
        if (typeof initPushNotifications === 'function') { try { initPushNotifications(); } catch(e) { console.warn('initPushNotifications:', e); } }
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appScreen').classList.remove('active');
        if (unsubOrders) { unsubOrders(); unsubOrders = null; }
    }
});

function togglePwVisibility() {
    const inp = document.getElementById('loginPassword');
    const btn = document.getElementById('pwToggle');
    if (inp.type === 'password') {
        inp.type = 'text';
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    } else {
        inp.type = 'password';
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
}

function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const pw = document.getElementById('loginPassword').value;
    const remember = document.getElementById('rememberMe').checked;
    document.getElementById('loginError').textContent = '';
    if (!email || !pw) { document.getElementById('loginError').textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
    // Set persistence based on checkbox
    const persistence = remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
    auth.setPersistence(persistence).then(() => {
        return auth.signInWithEmailAndPassword(email, pw);
    }).catch(e => {
        const msgs = { 'auth/user-not-found': 'Ungültige Anmeldedaten.', 'auth/wrong-password': 'Ungültige Anmeldedaten.', 'auth/invalid-credential': 'Ungültige Anmeldedaten.', 'auth/too-many-requests': 'Zu viele Versuche.' };
        document.getElementById('loginError').textContent = msgs[e.code] || 'Anmeldung fehlgeschlagen.';
    });
}
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('loginVersion').textContent = 'Version ' + APP_VERSION;
const _menuV = document.getElementById('menuVersion');
if (_menuV) _menuV.textContent = 'Fliegengitter App · Version ' + APP_VERSION;
function doLogout() { auth.signOut(); }

// v1.18.21: Passwort-Reset Modal
function openPasswordResetModal() {
    const modal = document.getElementById('pwResetModal');
    if (!modal) return;
    modal.style.display = 'flex';
    // Email aus Login-Feld vorausfüllen (falls bereits eingegeben)
    const loginEmail = document.getElementById('loginEmail')?.value.trim();
    const resetEmail = document.getElementById('pwResetEmail');
    if (resetEmail) {
        resetEmail.value = loginEmail || '';
        // Enter-Taste = Senden
        resetEmail.onkeydown = function(e) {
            if (e.key === 'Enter') { e.preventDefault(); sendPasswordResetEmail(); }
            else if (e.key === 'Escape') { e.preventDefault(); closePasswordResetModal(); }
        };
    }
    // Message zurücksetzen
    const msg = document.getElementById('pwResetMessage');
    if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
    // Fokus
    setTimeout(() => { if (resetEmail) resetEmail.focus(); }, 50);
}

function closePasswordResetModal() {
    const modal = document.getElementById('pwResetModal');
    if (modal) modal.style.display = 'none';
}

async function sendPasswordResetEmail() {
    const emailEl = document.getElementById('pwResetEmail');
    const msg = document.getElementById('pwResetMessage');
    const btn = document.getElementById('pwResetBtn');
    if (!emailEl || !msg || !btn) return;

    const email = emailEl.value.trim();
    if (!email) {
        msg.textContent = 'Bitte Email-Adresse eingeben.';
        msg.style.cssText = 'display:block;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:12px;background:#fef3c7;color:#78350f;border:1px solid #f59e0b';
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = 'Bitte gültige Email-Adresse eingeben.';
        msg.style.cssText = 'display:block;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:12px;background:#fef3c7;color:#78350f;border:1px solid #f59e0b';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Wird gesendet…';
    btn.style.opacity = '0.7';

    try {
        await auth.sendPasswordResetEmail(email);
        msg.textContent = '✓ Email gesendet! Bitte Postfach (auch Spam) prüfen.';
        msg.style.cssText = 'display:block;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:12px;background:#d1fae5;color:#065f46;border:1px solid #10b981';
        btn.textContent = 'Email gesendet';
        // Nach 3s auto-close
        setTimeout(() => {
            closePasswordResetModal();
            btn.disabled = false;
            btn.textContent = 'Email senden';
            btn.style.opacity = '1';
        }, 3000);
    } catch (e) {
        // Aus Sicherheitsgründen NICHT verraten ob Email existiert oder nicht.
        // Firebase gibt 'auth/user-not-found' wenn Email nicht registriert, was wir
        // dem User nicht zeigen — wir geben immer dieselbe "Erfolg"-Nachricht.
        // Aber bei echten Fehlern (z.B. Netzwerk) zeigen wir die Fehler-Message.
        const isUserNotFound = e.code === 'auth/user-not-found' || e.code === 'auth/invalid-email';
        if (isUserNotFound) {
            msg.textContent = '✓ Falls die Email-Adresse bei uns registriert ist, wurde ein Link versendet. Bitte Postfach prüfen.';
            msg.style.cssText = 'display:block;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:12px;background:#d1fae5;color:#065f46;border:1px solid #10b981';
            btn.textContent = 'Email gesendet';
            setTimeout(() => {
                closePasswordResetModal();
                btn.disabled = false;
                btn.textContent = 'Email senden';
                btn.style.opacity = '1';
            }, 3000);
        } else {
            msg.textContent = 'Fehler: ' + (e.message || 'Unbekannter Fehler');
            msg.style.cssText = 'display:block;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:12px;background:#fee2e2;color:#991b1b;border:1px solid #dc2626';
            btn.disabled = false;
            btn.textContent = 'Email senden';
            btn.style.opacity = '1';
        }
    }
}

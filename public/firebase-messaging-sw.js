// ╔══════════════════════════════════════════════════════════════╗
// ║  Firebase Cloud Messaging — Service Worker (Hintergrund-Push)  ║
// ║  v1.20.0                                                       ║
// ║                                                                ║
// ║  Eigener SW nur für Push (Scope: firebase-cloud-messaging-...).║
// ║  Der App-Cache-SW (/sw.js) bleibt davon unberührt.            ║
// ╚══════════════════════════════════════════════════════════════╝

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAWnVmmesRYiQmXIQBu-zIR73fsr9BkYyc",
  authDomain: "fliegengitter-3486c.firebaseapp.com",
  projectId: "fliegengitter-3486c",
  storageBucket: "fliegengitter-3486c.firebasestorage.app",
  messagingSenderId: "816787100278",
  appId: "1:816787100278:web:79bce66d6900b827524557"
});

// Initialisiert FCM in diesem SW. Nachrichten mit `notification`-Block werden im
// Hintergrund automatisch angezeigt (Android + iOS-PWA). Kein eigener
// onBackgroundMessage nötig — würde die Auto-Anzeige sonst überschreiben.
firebase.messaging();

// Klick auf die Benachrichtigung → App öffnen/fokussieren
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

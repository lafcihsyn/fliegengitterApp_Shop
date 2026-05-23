# Sineklik Web-App – Deployment Anleitung

## Was ist drin?
```
sineklik-web/
├── firebase.json          ← Hosting-Konfiguration
├── .firebaserc            ← Projekt-ID (fliegengitter-3486c)
├── public/
│   ├── index.html         ← Die App (angepasst für Browser)
│   ├── manifest.json      ← PWA-Manifest (installierbar auf Handy)
│   ├── sw.js              ← Service Worker (Offline-Support)
│   └── icons/
│       ├── icon-192.png   ← App-Icon klein
│       └── icon-512.png   ← App-Icon groß
```

## Einmalig einrichten (10 Minuten)

### 1. Node.js installieren
→ https://nodejs.org herunterladen & installieren (LTS Version)

### 2. Firebase CLI installieren
Terminal/CMD öffnen und eingeben:
```bash
npm install -g firebase-tools
```

### 3. Einloggen
Mit dem Google-Account, der Zugang zum Firebase-Projekt hat:
```bash
firebase login
```

### 4. Deployen
In den `sineklik-web` Ordner navigieren und deployen:
```bash
cd sineklik-web
firebase deploy --only hosting
```

### 5. Fertig!
Die App ist jetzt live unter:
**https://fliegengitter-3486c.web.app**

## Auf dem Handy installieren (PWA)

1. Die URL im Chrome-Browser öffnen
2. Chrome zeigt ein Banner "Zum Startbildschirm hinzufügen" 
   (oder Menü → "App installieren")
3. Fertig – die App ist jetzt wie eine native App auf dem Handy

## Updates deployen

Einfach die Dateien im `public/` Ordner bearbeiten und dann:
```bash
firebase deploy --only hosting
```

## Eigene Domain (optional)

1. Firebase Console öffnen → Hosting → Domain hinzufügen
2. z.B. `app.sineklik.at` eingeben
3. DNS-Einträge beim Domain-Anbieter setzen (wird angezeigt)

## Hinweise

- **Drucken**: Im Browser öffnet sich ein Druck-Dialog statt 
  direkt an den Brother-Drucker zu senden. In der Android-App 
  funktioniert der Brother-Druck weiterhin wie bisher.
- **Kosten**: Spark-Plan (kostenlos) reicht für eure Nutzung.
- **Daten**: Gleiche Firebase-Datenbank wie die Android-App – 
  alle Bestellungen sind sofort synchron.

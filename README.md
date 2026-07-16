# Stadt Land Fluss

Das klassische Wortspiel als Multiplayer-Spiel im lokalen Netzwerk (WLAN) — jeder spielt auf seinem eigenen Gerät (Handy, Tablet, Laptop).

## Starten

Voraussetzung: [Node.js](https://nodejs.org) (Version 18 oder neuer).

```bash
npm install
npm start
```

Der Server zeigt beim Start die Adresse an, z. B.:

```
Stadt Land Fluss läuft!

Mitspieler im gleichen WLAN öffnen im Browser:
  http://192.168.1.42:3000
```

Alle Mitspieler öffnen diese Adresse im Browser — sie müssen nur im **gleichen WLAN** sein. Nichts installieren, keine App nötig.

Anderer Port: `PORT=8080 npm start`

## Spielablauf

1. **Beitreten:** Jeder gibt seinen Namen ein. Wer zuerst beitritt, ist Spielleiter (👑) und legt Kategorien, Rundenzeit und Rundenzahl fest. Standardkategorien: Stadt, Land, Fluss, Name, Tier, Beruf.
2. **Buchstabe ziehen:** Jede Runde wird ein zufälliger Buchstabe gezogen (ohne Q, X, Y; keine Wiederholungen, solange Buchstaben übrig sind).
3. **Antworten:** Alle tippen **gleichzeitig** auf ihren eigenen Geräten. Der Timer läuft — und wer zuerst alle Felder füllt und **„Fertig!"** drückt, beendet die Runde für alle. Wie beim Original.
4. **Auswertung:** Alle Antworten werden nebeneinander angezeigt und automatisch verglichen. Der Spielleiter kann zweifelhafte Antworten per Klick als ungültig markieren.
5. **Punkte** (klassische Regeln):
   - **20** — einzige gültige Antwort in der Kategorie
   - **10** — gültige Antwort, die kein anderer hat
   - **5** — Antwort, die auch ein anderer Spieler hat
   - **0** — leer, ungültig oder falscher Anfangsbuchstabe

Nach der letzten Runde gibt es eine Siegerehrung mit Endstand.

## Details

- 1–8 Spieler, 2–12 Kategorien, Rundenzeit 10–600 Sekunden.
- Wer die Verbindung verliert (z. B. Handy gesperrt), kann einfach neu laden und mit demselben Namen wieder beitreten — Punkte bleiben erhalten.
- Wer mitten in einer Runde dazukommt, spielt ab der nächsten Runde mit.

## Technik

Node.js-Server (`server.js`) mit WebSockets ([ws](https://github.com/websockets/ws)) als einziger Abhängigkeit. Der Client (`public/index.html`) ist eine einzelne HTML-Datei mit Vanilla-JavaScript — kein Build-Schritt, kein Framework. Der Server hält den kompletten Spielzustand und verteilt ihn an alle Clients.

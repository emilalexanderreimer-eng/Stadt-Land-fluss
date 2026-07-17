# Stadt Land Fluss

Das klassische Wortspiel als Multiplayer-Spiel — jeder spielt auf seinem eigenen Gerät (Handy, Tablet, Laptop).

Es gibt zwei Varianten:

| | Peer-to-Peer (GitHub Pages) | Eigener Server (WLAN) |
|---|---|---|
| Wo? | **https://emilalexanderreimer-eng.github.io/Stadt-Land-fluss/** | `npm start` auf einem Rechner |
| Host | Der Browser eines Spielers | Node.js-Prozess |
| Installation | keine | Node.js auf einem Gerät |
| Verbindung | Raum-Code, Spieldaten laufen direkt zwischen den Geräten (WebRTC) | alle verbinden sich zur IP des Servers |

## Variante 1: Peer-to-Peer — einfach im Browser (empfohlen)

Seite öffnen: **https://emilalexanderreimer-eng.github.io/Stadt-Land-fluss/**

1. Ein Spieler klickt **„Spiel erstellen"** — sein Browser ist der Host. Die Seite muss bei ihm offen bleiben.
2. Er teilt den angezeigten **Raum-Code** (oder den Link) mit den anderen.
3. Alle anderen geben Code und Namen ein und spielen mit — egal ob im gleichen WLAN oder woanders.

Technik: Die Spieldaten laufen per WebRTC direkt zwischen den Geräten (PeerJS). Nur für den Verbindungsaufbau wird kurz die öffentliche PeerJS-Cloud als Vermittler genutzt — danach ist alles Peer-to-Peer. Der Quellcode liegt in `p2p/`.

## Variante 2: Eigener Server im WLAN

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

Alle Mitspieler öffnen diese Adresse im Browser — sie müssen nur im **gleichen WLAN** sein. Nichts installieren, keine App nötig. Diese Variante braucht kein Internet, nur das lokale Netz.

Anderer Port: `PORT=8080 npm start`

## Spielablauf

1. **Beitreten:** Jeder gibt seinen Namen ein. Wer zuerst beitritt, ist Spielleiter (👑) und legt Kategorien, Rundenzeit und Rundenzahl fest. Standardkategorien: Stadt, Land, Fluss, Name, Tier, Beruf.
2. **Buchstabe ziehen:** Jede Runde wird ein zufälliger Buchstabe gezogen (ohne Q, X, Y; keine Wiederholungen, solange Buchstaben übrig sind).
3. **Antworten:** Alle tippen **gleichzeitig** auf ihren eigenen Geräten. Der Timer läuft — und wer zuerst alle Felder füllt und **„Fertig!"** drückt, beendet die Runde für alle. Wie beim Original.
4. **Auswertung:** Alle Antworten werden nebeneinander angezeigt und automatisch verglichen. Zusätzlich prüft das Spiel bei bekannten Kategorien automatisch über [Wikidata](https://www.wikidata.org), ob die Antwort stimmt — ob z. B. die genannte Stadt wirklich eine Stadt ist („Japan" zählt nicht als Stadt!). Nicht gefundene Antworten werden automatisch als ungültig markiert; der Spielleiter kann jede Entscheidung per Klick überstimmen.
   Automatisch geprüft werden u. a.: Stadt, Land, Fluss, See, Berg, Insel, Name/Vorname/Nachname, Tier, Pflanze, Beruf, Essen, Getränk, Farbe, Sportart, Musikinstrument, Sprache, Marke, Band, Film. Eigene Kategorien ohne Prüfregel wertet weiterhin der Spielleiter.
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

Beide Varianten teilen sich dieselbe Spiellogik und dasselbe Nachrichtenprotokoll; der Host hält den kompletten Spielzustand und verteilt ihn an alle Clients. Kein Build-Schritt, kein Framework — nur Vanilla-JavaScript.

- **Peer-to-Peer** (`p2p/index.html`): Die Spiellogik läuft im Browser des Spielleiters, Transport per WebRTC-Datenkanälen ([PeerJS](https://peerjs.com), als `p2p/peerjs.min.js` eingebunden). Wird über den `gh-pages`-Branch auf GitHub Pages veröffentlicht.
- **Eigener Server** (`server.js` + `public/index.html`): Node.js mit WebSockets ([ws](https://github.com/websockets/ws)) als einziger Abhängigkeit.

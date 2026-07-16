# Stadt Land Fluss

Das klassische Wortspiel als Web-App — läuft komplett im Browser, ohne Server, ohne Abhängigkeiten.

## Spielen

Einfach `index.html` im Browser öffnen. Fertig.

Alternativ lokal hosten:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Spielablauf

1. **Setup:** Spieler (1–8) und Kategorien (2–12) anlegen. Standardkategorien: Stadt, Land, Fluss, Name, Tier, Beruf. Zeit pro Runde und Rundenzahl sind einstellbar.
2. **Buchstabe ziehen:** Jede Runde wird ein zufälliger Buchstabe gezogen (ohne Q, X, Y; keine Wiederholungen, solange Buchstaben übrig sind).
3. **Antworten:** Hot-Seat-Modus — die Spieler geben nacheinander am selben Gerät ihre Antworten ein. Der Timer läuft; wer zuerst alle Felder füllt und „Fertig!" drückt, beendet die Runde.
4. **Auswertung:** Antworten werden automatisch verglichen. Zweifelhafte Antworten können per Klick als ungültig markiert werden.
5. **Punkte** (klassische Regeln):
   - **20** — einzige gültige Antwort in der Kategorie
   - **10** — gültige Antwort, die kein anderer hat
   - **5** — Antwort, die auch ein anderer Spieler hat
   - **0** — leer, ungültig oder falscher Anfangsbuchstabe

Nach der letzten Runde gibt es eine Siegerehrung mit Endstand.

## Technik

Eine einzelne HTML-Datei mit Vanilla-JavaScript und CSS — kein Build-Schritt, keine externen Bibliotheken.

# ADR-004: Zentraler Server statt lokaler Installation

**Status:** Akzeptiert
**Datum:** 2026-04
**Autoren:** KOOS-Projektteam

## Kontext

Frühe KOOS-Prototypen nutzten die Browser-eigene File System Access API, bei der jeder Nutzer eine HTML-Datei lokal öffnete und direkt auf seinen Dateien arbeitete. Dies führte zu mehreren Problemen:

1. Die File System Access API funktioniert nicht auf `file://`-URLs — Chrome blockiert sie aus Sicherheitsgründen. Nutzer mussten einen lokalen HTTP-Server starten.
2. Es gab keinen gemeinsamen, konsistenten Datenstand. Jeder Nutzer sah potenziell andere Daten.
3. Eingebettete Fallback-Daten in preview.html waren irreführend — Nutzer hielten veraltete Demo-Daten für aktuelle Verwaltungsdaten.
4. Git-Audit-Trail war ohne gemeinsamen Server nicht praktikabel.

## Entscheidung

KOOS wird zentral auf einem Linux-Server der Gemeinde betrieben. Nutzer greifen per Browser auf `http://koos.gemeinde.intern` zu. Es gibt eine einzige Instanz, einen einzigen Datenstand.

## Begründung

- **Ein Datenstand:** Kein Synchronisationsproblem, kein Fallback-Dilemma.
- **Audit-Trail möglich:** Server kontrolliert alle Schreibzugriffe, kann jeden Commit mit Nutzeridentität versehen.
- **Kein Client-Setup:** Nutzer brauchen nur einen Browser. Kein Python, kein Ordner öffnen.
- **LDAP-Integration:** Zentrale Authentifizierung ist nur mit zentralem Server sinnvoll umsetzbar.
- **Sicherheit:** Datenzugriff kann serverseitig kontrolliert werden (Berechtigungen nach OE-Zuständigkeit).

## Konsequenzen

- preview.html wird durch den FastAPI-Server ausgeliefert; die File System Access API wird abgelöst durch REST-API-Aufrufe.
- preview.html benötigt eine API-Schicht statt der bisherigen `dateienLaden()`-Logik — dies ist die nächste Entwicklungsaufgabe.
- Ein Linux-Server mit Python 3.11+, git und Netzwerkzugang ist Voraussetzung für den Betrieb.
- Für Hochverfügbarkeit ist später ein Reverse-Proxy (nginx) vor dem Uvicorn-Prozess empfohlen.

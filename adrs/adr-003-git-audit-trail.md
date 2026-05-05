# ADR-003: Git als Audit-Trail

**Status:** Akzeptiert
**Datum:** 2026-04
**Autoren:** KOOS-Projektteam

## Kontext

Kommunale Verwaltungen unterliegen gesetzlichen Anforderungen zur Nachvollziehbarkeit von Datenänderungen (NKomVG, allgemeines Verwaltungsrecht). Es muss dokumentiert sein, wer wann was geändert hat.

## Entscheidung

Jede schreibende API-Operation (PUT, DELETE) erstellt automatisch einen Git-Commit im Datenverzeichnis. Der Commit-Autor enthält Name und E-Mail des handelnden Nutzers (später: aus LDAP-Session). Die Commit-Nachricht folgt dem Schema `koos: <Aktion> <ID>`.

```
koos: Prozess proc-33-008 aktualisiert
koos: Datenart dtype-33-001 gelöscht
koos: orga.yaml aktualisiert
```

Der vollständige Audit-Trail ist über `GET /api/audit` abrufbar.

## Begründung

- Git ist ein etabliertes, gut verstandenes Werkzeug mit hoher Zuverlässigkeit.
- Der Audit-Trail ist ohne KOOS einsehbar (Standard-Git-Werkzeuge).
- Kein eigenes Audit-Datenbank-Schema erforderlich.
- Rollback einzelner Änderungen ist mit Standard-Git möglich.
- Git ist kostenlos und in jeder Linux-Distribution verfügbar.

## Konsequenzen

- Git muss auf dem Server installiert sein (`apt install git`).
- Bei nicht initialisierten Repos läuft die API trotzdem — Git ist optional beim ersten Start (wird automatisch initialisiert).
- Die Commit-Autorenschaft hängt später an der Authentifizierung; bis zur LDAP-Anbindung wird `KOOS-Server <koos@localhost>` als Platzhalter genutzt.
- Repository-Größe wächst mit der Zeit; periodische `git gc`-Läufe werden empfohlen.

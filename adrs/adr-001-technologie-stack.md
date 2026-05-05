# ADR-001: Technologie-Stack

**Status:** Akzeptiert
**Datum:** 2026-04
**Autoren:** KOOS-Projektteam

## Kontext

KOOS (Kern-Organisations-Operations-System) braucht eine serverseitige Laufzeitumgebung, die:
- von IT-affinen Verwaltungsmitarbeitenden ohne Spezialkenntnisse betrieben werden kann,
- auf einem Standard-Linux-Server im kommunalen Netz läuft,
- eine einfache API für die Verwaltung von YAML- und Markdown-Dateien bereitstellt,
- wartbar und lesbar für zukünftige Entwickler ist.

## Entscheidung

**Backend:** Python 3.11+ mit FastAPI und Uvicorn
**Datenhaltung:** Dateisystem (YAML, Markdown) — keine Datenbank
**Audit-Trail:** Git (über GitPython)
**Frontend:** Statisches HTML/CSS/JS (preview.html), ausgeliefert durch den FastAPI-Server

## Begründung

Python ist in deutschen Behörden und kommunalen IT-Abteilungen verbreitet und gut verstanden. FastAPI bietet automatische OpenAPI-Dokumentation, Typ-Validierung und eine sehr geringe Einstiegshürde. Kein Node.js, kein Build-Schritt, keine Datenbank-Administration.

Die Entscheidung gegen eine Datenbank (PostgreSQL, SQLite) zugunsten des Dateisystems folgt dem KOOS-Grundprinzip: Daten sollen direkt lesbar, versionierbar und mit Standard-Werkzeugen (Texteditor, git) bearbeitbar sein.

## Konsequenzen

- Die API ist bewusst schlank gehalten (kein ORM, kein Schema-Framework).
- Horizontale Skalierung ist eingeschränkt — für kommunale Nutzerzahlen (< 100 gleichzeitige Nutzer) ausreichend.
- File-Locking bei konkurrierenden Schreibzugriffen ist derzeit nicht implementiert; bei hohem Schreibaufkommen nachzurüsten.

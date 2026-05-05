# KOOS-Server — Referenzimplementierung und Browser-Oberfläche

KOOS-Server ist die **Referenzimplementierung des KOOS-Datenformats**: ein schlanker FastAPI-Server, der KOOS-Datenpakete als REST-API bereitstellt und `index.html` als Single-Page-Anwendung ausliefert.

> Datenstruktur, Dateiformate und Designprinzipien beschreibt: **[koos-daten](https://github.com/dsgvo-dev/koos-daten)**

---

## Schnellstart

```bash
# 1. Server-Repository klonen
git clone https://github.com/dsgvo-dev/koos-server

# 2. Daten-Repository klonen
git clone https://github.com/dsgvo-dev/koos-daten meine-verwaltung
# koos.yaml anpassen → Organisation, Gemeindeschlüssel, Ansprechpartner
# orga.yaml anpassen → eigene Hierarchie

# 3. Abhängigkeiten installieren (einmalig)
bash koos-server/install.sh

# 4. Server starten
KOOS_DATA_DIR=/pfad/zu/meine-verwaltung bash koos-server/start.sh
# → http://localhost:8090
```

---

## Inhalt

- [Voraussetzungen](#voraussetzungen)
- [Installation](#installation)
- [Server starten](#server-starten)
  - [Entwicklungsmodus](#entwicklungsmodus)
  - [Produktionsmodus](#produktionsmodus)
  - [Umgebungsvariablen](#umgebungsvariablen)
  - [Häufige Fehler](#häufige-fehler)
- [Konfiguration: koos.yaml](#konfiguration-koosyaml)
  - [Organisation](#organisation)
  - [Nutzer und Passwörter](#nutzer-und-passwörter)
  - [Vokabular](#vokabular)
- [Browser-Oberfläche](#browser-oberfläche)
  - [Navigation](#navigation)
  - [OE-Tab: Organisationsbaum](#oe-tab-organisationsbaum)
  - [Prozess-Tab: Suche](#prozess-tab-suche)
  - [Direktlinks und Browser-History](#direktlinks-und-browser-history)
  - [Quernavigation zwischen Tabs](#quernavigation-zwischen-tabs)
  - [Globale Suche](#globale-suche)
- [Inhalte bearbeiten](#inhalte-bearbeiten)
  - [Bearbeitungsrollen und Zugriff](#bearbeitungsrollen-und-zugriff)
  - [Bearbeitungsmodus](#bearbeitungsmodus)
  - [Neue Einträge anlegen](#neue-einträge-anlegen)
  - [Ausloggen](#ausloggen)
- [Admin-Panel](#admin-panel)
  - [Systemübersicht](#systemübersicht)
  - [Datenqualität](#datenqualität)
  - [Änderungshistorie](#änderungshistorie)
  - [Änderungen rückgängig machen](#änderungen-rückgängig-machen)
  - [Diff-Viewer](#diff-viewer)
- [Änderungsdokumentation (ADR)](#änderungsdokumentation-adr)
- [KI-Assistent](#ki-assistent)
- [API-Endpunkte](#api-endpunkte)
- [Serverstruktur](#serverstruktur)
- [Lizenz](#lizenz)

---

## Voraussetzungen

- **Python 3.11** oder neuer (`python3 --version`)
- **git** (`git --version`) — für den automatischen Audit-Trail
- Optional: **Ollama** (`ollama serve`) — für den KI-Assistenten

---

## Installation

```bash
# Im Datenverzeichnis oder einem beliebigen Arbeitsordner:
bash koos-server/install.sh
```

`install.sh` prüft Python 3.11+, git, legt eine virtuelle Umgebung unter `koos-server/.venv` an und installiert alle Abhängigkeiten aus `requirements.txt`. Die Erstinstallation ist einmalig.

---

## Server starten

### Entwicklungsmodus

```bash
KOOS_DATA_DIR=/pfad/zum/datenordner bash koos-server/start.sh
```

- **Auto-Reload:** Dateiänderungen im Servercode werden sofort übernommen — kein Neustart nötig.
- **Single Worker:** Geeignet für lokalen Betrieb und Entwicklung.
- Die Oberfläche ist erreichbar unter: `http://localhost:8090`
- Die interaktive API-Dokumentation ist erreichbar unter: `http://localhost:8090/api/docs`

Wenn `KOOS_DATA_DIR` nicht gesetzt ist, versucht der Server einen relativen Standardpfad. Für produktiven Einsatz immer explizit setzen.

### Produktionsmodus

```bash
KOOS_DATA_DIR=/pfad/zum/datenordner bash koos-server/start.sh --prod
```

- **Kein Auto-Reload:** Stabiler Dauerbetrieb.
- **Mehrere Worker:** Anzahl richtet sich nach CPU-Kernen (bis zu 4), für parallele Anfragen.

### Umgebungsvariablen

| Variable | Standard | Beschreibung |
|---|---|---|
| `KOOS_DATA_DIR` | `../koos-daten` (relativ) | Pfad zum Datenordner (Pflicht für produktiven Einsatz) |
| `KOOS_HOST` | `0.0.0.0` | Netzwerk-Interface, auf dem der Server lauscht |
| `KOOS_PORT` | `8090` | TCP-Port |
| `KOOS_GUI_PATH` | `koos-server/index.html` | Pfad zur `index.html` (SPA-Einstiegspunkt) |
| `KOOS_CORS_ORIGINS` | `*` | Erlaubte CORS-Origins (kommagetrennt) |
| `KOOS_GIT_AUTHOR_NAME` | `KOOS` | Git-Autorenname für Audit-Commits |
| `KOOS_GIT_AUTHOR_EMAIL` | `koos@localhost` | Git-Autoren-E-Mail für Audit-Commits |

Beispiele:

```bash
# Anderen Port verwenden
KOOS_PORT=8081 KOOS_DATA_DIR=/pfad/zu/daten bash koos-server/start.sh

# Nur auf localhost lauschen (kein Zugriff von außen)
KOOS_HOST=127.0.0.1 KOOS_DATA_DIR=/pfad/zu/daten bash koos-server/start.sh

# Produktion auf Port 80 (benötigt ggf. Root oder Reverse-Proxy)
KOOS_PORT=80 KOOS_DATA_DIR=/pfad/zu/daten bash koos-server/start.sh --prod

# Eigene index.html verwenden (z. B. angepasste Oberfläche)
KOOS_GUI_PATH=/opt/koos-ui/index.html KOOS_DATA_DIR=/pfad/zu/daten bash koos-server/start.sh
```

### Server stoppen

`Strg+C` im Terminal, in dem der Server läuft.

### Häufige Fehler

| Problem | Ursache | Lösung |
|---|---|---|
| `Address already in use` | Port belegt | `KOOS_PORT=8081 bash koos-server/start.sh` oder `lsof -ti :8090 \| xargs kill -9` |
| `Virtuelle Umgebung fehlt` | install.sh noch nicht ausgeführt | `bash koos-server/install.sh` |
| `DATA_DIR nicht gefunden` | `KOOS_DATA_DIR` nicht gesetzt oder falscher Pfad | Pfad prüfen und Umgebungsvariable setzen |
| Daten nicht aktuell im Browser | Browser-Cache | Button **⟳ Neu laden** oben rechts klicken |
| API nicht erreichbar | Browser öffnet Datei direkt | Browser auf `http://localhost:8090` öffnen |

---

## Konfiguration: koos.yaml

Die Datei `koos.yaml` im Datenordner ist die zentrale Steuerdatei der KOOS-Instanz. Sie enthält acht Abschnitte:

| Abschnitt | Zweck |
|---|---|
| `organisation` | Identität der Verwaltung (Name, Rechtsform, Ansprechpartner) |
| `module` | Pfade zu den vier Informationsdimensionen |
| `id-praefixe` | Stabile ID-Konvention (nach Inbetriebnahme nicht ändern) |
| `vorschau` | Konfiguration der Browser-App (Tabs, Variante) |
| `variante` | Betriebsmodus (`vereinfacht` / `vollstaendig`) |
| `versionierung` | Git-Tag-Schema für Generationen |
| `vokabular` | Kontrollierte Wertelisten für Formularfelder |
| `bearbeitung` | Nutzer, Passwort-Hashes, Formular-Schema |

### Organisation

```yaml
organisation:
  id: gemeinde-musterstadt
  name: Gemeindeverwaltung Musterstadt
  kurzname: Musterstadt
  rechtsform: Gemeinde
  rechtsgrundlage: NKomVG §10
  gemeindeschluessel: "03000000"
  bundesland: Niedersachsen
  ansprechpartner:
    name: Stabsstelle Organisation und Digitalisierung
    oe-id: oe-stabsstelle
    email: organisation@musterstadt.de
```

### Nutzer und Passwörter

```yaml
bearbeitung:
  superadmin:
    passwort-hash: "<SHA-256-Hash>"
    # Vollzugriff: alle OE, alle Einträge, Admin-Panel, OE-Editor

  subadmins:
    - id: sub-fb1
      name: Fachbereich 1 – Personal & IT
      passwort-hash: "<SHA-256-Hash>"
      zustaendig-fuer:
        - oe-fb1-personal
        - oe-fb1-it
        - oe-fb1               # Fachbereichsebene einschließen
```

**Passwort-Hash erzeugen** (in der Browser-Konsole, F12):

```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode("meinPasswort"))
  .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("")))
```

Vor Produktiveinsatz die Standardpasswörter unbedingt ändern. Der Hash in `koos.yaml` und der entsprechende Eintrag in `index.html` (Abschnitt `CONFIG`) müssen übereinstimmen.

### Vokabular

Der Abschnitt `vokabular` definiert die erlaubten Werte für Dropdown-Felder in der Browser-Oberfläche. Neue Werte hier eintragen — die App liest das Vokabular automatisch beim nächsten Laden aus, kein Server-Neustart erforderlich. Vollständige Dokumentation der Wertelisten: [koos-daten → Vokabular](https://github.com/dsgvo-dev/koos-daten#vokabular--kontrollierte-wertelisten).

---

## Browser-Oberfläche

Die Web-Oberfläche (`http://localhost:8090`) ist eine Single-Page-Anwendung (SPA). Der Server liefert `index.html` aus dem Verzeichnis, das über `KOOS_GUI_PATH` konfiguriert ist — standardmäßig `koos-server/index.html`.

### Navigation

Die Oberfläche besteht aus:

- **Startseite** (Klick auf den Organisationsnamen oben links): Gesamtübersicht mit Kennzahlen und direkten Links zu allen Bereichen.
- **Vier Inhaltstabs**: OE, Prozesse, Daten, Regelungen — jeder Tab zeigt beim Öffnen eine Übersichtsseite mit Statistiken. Klick auf ein Element in der linken Liste öffnet die Detailansicht rechts.
- **Globale Suche** (Lupensymbol / Suchfeld oben): durchsucht OE, Prozesse, Datenspeicher und Regelungen gleichzeitig; Ergebnisse werden nach Typ gruppiert angezeigt.
- **KI-Assistent** (Tab „Chat"): stellt Fragen über die Organisation und beantwortet sie auf Basis der KOOS-Daten.
- **⟳ Neu laden**: lädt alle Daten frisch vom Server und aktualisiert gleichzeitig alle Listen, die Startseiten-Statistiken und (falls geöffnet) das Admin-Dashboard.

### OE-Tab: Organisationsbaum

Der OE-Tab zeigt die Organisationsstruktur als aufklappbaren Baum. Einheiten mit Untereinheiten können per Klick auf das Dreieck-Symbol auf- und zugeklappt werden.

Tastaturnavigation: **↑ / ↓** bewegt den Fokus durch alle sichtbaren Einheiten, **→** klappt auf, **←** klappt zu oder springt zur übergeordneten Einheit.

### Prozess-Tab: Suche

Der Prozesse-Tab hat ein eigenes Suchfeld direkt über der Liste, das die angezeigte Liste in Echtzeit filtert — unabhängig von der globalen Suche oben.

### Direktlinks und Browser-History

Jeder geöffnete Eintrag erzeugt automatisch einen URL-Hash, z. B.:

```
http://localhost:8090/#prozesse:proc-baugenehmigung-beantragen
http://localhost:8090/#oe:oe-stabsstelle
http://localhost:8090/#daten:dstore-personalakte
```

Diese URLs können als Lesezeichen gespeichert oder direkt geteilt werden. Jeder Navigationsschritt schreibt einen Eintrag in die Browserhistorie (`history.pushState`) — der Zurück-Button des Browsers springt damit zur vorherigen Ansicht, auch über Tab-Wechsel hinweg.

Das gilt für alle Navigationsarten:

- Klick auf Tab-Leiste
- Klick auf Eintrag in der OE-/Prozess-/Daten-Liste
- Klick auf verknüpfte OE im Prozess- oder Daten-Detail
- Klick auf Prozess-Chip im OE-Detail oder Daten-Detail
- Klick auf Suchergebnis

Beim direkten Aufruf einer Deep-Link-URL (z. B. aus einem Lesezeichen) stellt `index.html` den Zustand automatisch wieder her — inklusive Aufklappen des Baum-Pfades zur gewünschten OE.

### Quernavigation zwischen Tabs

Verknüpfte Einträge sind in der Detailansicht direkt anklickbar:

| Klick auf … | Wechselt nach … |
|---|---|
| OE-Chip im Prozess-Detail | OE-Tab, Einheit aufgeklappt |
| OE-Chip im Daten-Detail | OE-Tab, Einheit aufgeklappt |
| Prozess-Chip im OE-Detail | Prozesse-Tab, Prozess geöffnet |
| Daten-Chip im Prozess-Detail | Daten-Tab, Datenart geöffnet |
| Prozess-Chip im Daten-Detail | Prozesse-Tab, Prozess geöffnet |

Jeder dieser Sprünge erzeugt einen Historieeintrag — der Zurück-Button kehrt stets zum Ausgangspunkt zurück.

### Globale Suche

Die globale Suche durchsucht alle vier Dimensionen gleichzeitig und gruppiert die Ergebnisse nach Typ. Auch anklickbar sind verknüpfte Einträge in der Detailansicht (OE-Chips, Datenarten-Chips, Prozess-Chips) — jeder Sprung erzeugt einen Historieeintrag.

---

## Inhalte bearbeiten

### Bearbeitungsrollen und Zugriff

KOOS unterscheidet drei Nutzerklassen:

| Rolle | Kann bearbeiten | Besonderheiten |
|---|---|---|
| **Leser** (nicht eingeloggt) | — | Alle Inhalte lesbar, KI-Assistent nutzbar |
| **Subadmin** | Prozesse und Datenarten der eigenen OEs; alle Regelungen | Zuständigkeitsbereich in `koos.yaml` konfiguriert |
| **Superadmin** | Alles — inkl. OE-Struktur | Zugriff auf Admin-Panel und OE-Editor |

Die Zuständigkeit von Subadmins wird in `koos.yaml` unter `bearbeitung.subadmins[].zustaendig-fuer` als Liste von OE-IDs hinterlegt. Prozesse und Datenarten außerhalb dieses Bereichs werden im Bearbeitungsmodus schreibgeschützt angezeigt. **Regelungen** sind für alle eingeloggten Nutzer bearbeitbar, da sie organisationsweit gelten — keine OE-Einschränkung.

**OE-Editor (Superadmin):** Im Bearbeitungsmodus kann der Superadmin eine Organisationseinheit aus dem OE-Baum auswählen und direkt im Detailbereich bearbeiten — Name, übergeordnete OE, Rollen, Sonderfunktionen und Hinweis. Neue OEs können über den **+ Neu**-Button im OE-Tab angelegt werden.

### Bearbeitungsmodus

1. **✏ Bearbeiten** klicken und Passwort eingeben.
2. Eintrag in der linken Liste auswählen — der Detailbereich wechselt in den Bearbeitungsmodus (gelber Rahmen).
3. Felder direkt im Formular ändern.
4. Optional: **Begründung der Änderung** eintragen — wird im Audit-Log gespeichert (ADR-Prinzip).
5. **💾 Speichern** klicken — Änderung wird sofort auf dem Server gespeichert und als Git-Commit festgehalten. Eine grüne Toast-Meldung bestätigt den Erfolg.

### Neue Einträge anlegen

Im Bearbeitungsmodus erscheinen **+ Neu**-Buttons in den Tabs (Prozesse, Daten, Regelungen, OE). Der Formular-Assistent schlägt automatisch eine ID aus dem eingetippten Titel vor (Umlaute werden ausgeschrieben, Leerzeichen durch `-` ersetzt).

### Ausloggen

Nach dem Einloggen erscheint in der Topbar neben dem Nutzernamen ein **⏏ Ausloggen**-Button. Ein Klick beendet den Bearbeitungsmodus, blendet den Admin-Tab aus und setzt die Sitzung zurück.

---

## Admin-Panel

Das Admin-Panel (Tab **⚙ Admin**, nur für Superadmins sichtbar) enthält vier Bereiche.

### Systemübersicht

Kacheln mit Gesamtzahlen für Prozesse (aktiv/gesamt), Datenarten, Organisationseinheiten und Regelungen.

### Datenqualität

Automatisch berechnete Qualitätsampeln für bekannte Pflegelücken:

**Datenarten:**
- Ohne Prozesszuordnung (verwaiste Datenarten)
- Ohne Schutzstufe / Schutzbedarf / Vertraulichkeit
- Ohne Aufbewahrungsfrist

**Prozesse:**
- Ohne zuständige OE
- Ohne Datenarten-Referenz
- Ohne Rechtsgrundlagen

Jede Kachel zeigt Anzahl, Prozentsatz und bis zu 5 Beispiele — direkt anklickbar, um zum betreffenden Eintrag zu springen.

### Änderungshistorie

Tabelle der letzten Git-Commits mit Datum, Autor, Änderungsbeschreibung und Begründung (wenn angegeben). Wird beim Öffnen des Admin-Tabs immer frisch vom Server geladen; nach jedem Speichervorgang sofort aktualisiert, falls der Tab geöffnet ist.

### Änderungen rückgängig machen

Jede Zeile der Änderungshistorie enthält einen **↩ Rückgängig**-Button. Ein Klick:

1. Zeigt einen Bestätigungsdialog mit der Beschreibung der Änderung.
2. Stellt die betroffenen Dateien auf den Zustand des Vorgänger-Commits zurück.
3. Erstellt einen neuen Git-Commit `koos: Rückgängig: <original> [abc1234]` — die bisherige Historie bleibt vollständig erhalten.
4. Aktualisiert sofort alle Listen und die Änderungshistorie.

Der Revert ist **nicht-destruktiv**: Ein versehentlicher Revert kann selbst wieder rückgängig gemacht werden. Bereits rückgängig gemachte Einträge werden kursiv und in Goldton dargestellt.

### Diff-Viewer

Jede Zeile der Änderungshistorie enthält einen **🔍 Diff**-Button. Er öffnet ein Modal mit dem vollständigen `git show`-Diff des Commits: hinzugefügte Zeilen grün, entfernte Zeilen rot, Metadaten grau. Das Modal schließt sich per Klick auf **× Schließen**, Klick auf den Hintergrund oder die **Esc**-Taste.

---

## Änderungsdokumentation (ADR)

Jede Speicheroperation wird als Git-Commit protokolliert. In der Web-Oberfläche kann zusätzlich eine **Begründung** angegeben werden:

```
┌─────────────────────────────────────────────────────────┐
│  📝 Begründung der Änderung (ADR)                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Rechtsgrundlage nach aktueller DSGVO-Prüfung     │   │
│  │ ergänzt; Aufbewahrungsfrist korrigiert.           │   │
│  └──────────────────────────────────────────────────┘   │
│  Wird im Audit-Log festgehalten — optional, empfohlen.  │
└─────────────────────────────────────────────────────────┘
```

Die Begründung wird als Commit-Body gespeichert (`Begründung: <text>`) und ist in der **Änderungshistorie** des Admin-Panels einsehbar.

Das Begründungsfeld ist optional — disziplinierte Nutzung setzt eine redaktionelle Vereinbarung im Team voraus. Das ADR-Prinzip überträgt sich so auf die Verwaltungspraxis: Nicht nur *was* geändert wurde ist dokumentiert, sondern auch *warum*.

Architekturentscheidungen für den Server selbst sind im Verzeichnis `adrs/` dokumentiert — als Markdown-Dateien nach dem Architecture Decision Record-Muster.

---

## KI-Assistent

Der Chat-Tab verbindet sich mit einem lokal laufenden Sprachmodell (Ollama). Das Modell erhält automatisch Kontext aus den KOOS-Daten:

- Relevante Organisationseinheiten
- Passende Prozesse (Volltextsuche über Titel, Felder, Beschreibungstext)
- Passende Datenarten mit Klassifizierungsdetails
- Passende Regelungen (inklusive Volltext bis 1.500 Zeichen)

**Voraussetzung:** Ollama muss lokal laufen (`ollama serve`). Modell in `koos.yaml` konfigurierbar:

```yaml
llm:
  model: llama3
  base-url: http://localhost:11434
```

Der Assistent kennt Zuständigkeiten, Datenschutzklassifizierungen und Rechtsgrundlagen aus den KOOS-Daten und kann bei gezielten Fragen (z. B. „Welche Datenarten nutzt Amt 32?" oder „Was gilt für Aufbewahrungsfristen nach DSGVO?") belastbare Antworten geben. Antwortqualität hängt vom installierten Modell und der Datenvollständigkeit ab.

---

## API-Endpunkte

Vollständige interaktive Dokumentation: `http://localhost:8090/api/docs`

### Inhaltsdaten

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `/api/orga` | GET, PUT | Organisationsstruktur (geparst) lesen/schreiben |
| `/api/orga/raw` | GET, PUT | `orga.yaml` als Rohtext lesen/schreiben |
| `/api/prozesse` | GET | Alle Prozesse als JSON-Liste |
| `/api/prozesse/{id}` | GET, PUT, DELETE | Einzelner Prozess |
| `/api/prozesse/{id}/raw` | GET | Rohtext der `.md`-Datei |
| `/api/daten` | GET | Alle Datenarten als JSON-Liste |
| `/api/daten/{id}` | GET, PUT, DELETE | Einzelne Datenart |
| `/api/daten/{id}/raw` | GET | Rohtext der `.md`-Datei |
| `/api/regelungen` | GET | Alle Regelungen als JSON-Liste |
| `/api/regelungen/{id}` | GET, PUT, DELETE | Einzelne Regelung |
| `/api/regelungen/{id}/raw` | GET | Rohtext der `.md`-Datei |

### Suche und Querverweise

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `/api/search?q=…&in=alle` | GET | Volltext-Suche; `in` = `prozesse` \| `daten` \| `regelungen` \| `alle` |
| `/api/querverweise/{id}` | GET | Alle Prozesse, die eine Datenart referenzieren |

### Statistik und Qualität

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `/api/config/dashboard` | GET | Aggregierte Qualitätskennzahlen (Vollständigkeitsprüfung) |
| `/api/stats/prozesse` | GET | Detailstatistiken Prozesse |
| `/api/stats/daten` | GET | Detailstatistiken Datenarten |
| `/api/stats/ohne-prozess` | GET | Datenarten ohne Prozesszuordnung |

### KI-Assistent

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `/api/chat` | POST | Synchrone Chat-Anfrage `{frage, verlauf, modell}` |
| `/api/chat/stream` | POST | Streaming-Antwort als Server-Sent Events (SSE) |
| `/api/chat/status` | GET | Ollama-Verfügbarkeit und verfügbare Modelle |
| `/api/context` | GET | Systemüberblick für LLM-Einstieg (Zahlen, Einheiten, Endpunkte) |

### System und Audit

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `/api/config` | GET | Auth-Konfiguration aus `koos.yaml` |
| `/api/audit` | GET | Git-Änderungshistorie (letzten n Commits, max. 500) |
| `/api/audit/{hash}/diff` | GET | Unified diff eines einzelnen Commits |
| `/api/audit/{hash}/revert` | POST | Commit rückgängig machen (neuer Revert-Commit) |
| `/api/health` | GET | Server-Status und Verzeichnis-Prüfung |
| `/api/docs` | GET | Interaktive API-Dokumentation (Swagger UI) |

---

## Serverstruktur

```
koos-server/
├── main.py                   ← App-Einstiegspunkt, API-Routen-Registrierung, Audit-Endpunkte
├── config.py                 ← Pfade und Umgebungsvariablen (KOOS_DATA_DIR etc.)
├── requirements.txt          ← Python-Abhängigkeiten
├── install.sh                ← Erstinstallation (venv + pip)
├── start.sh                  ← Server starten (dev: --reload, prod: --prod)
├── index.html                ← Browser-Oberfläche (SPA, via KOOS_GUI_PATH konfigurierbar)
├── adrs/                     ← Architekturentscheidungen (ADR-Muster)
│   ├── adr-001-dateiformat.md
│   ├── adr-002-id-prinzip.md
│   ├── adr-003-resolver.md
│   └── adr-004-git-audit.md
├── routers/
│   ├── orga.py               ← GET/PUT /api/orga, /api/orga/raw
│   ├── prozesse.py           ← GET/PUT/DELETE /api/prozesse/{id}
│   ├── daten.py              ← GET/PUT/DELETE /api/daten/{id}
│   ├── regelungen.py         ← GET/PUT/DELETE /api/regelungen/{id}
│   ├── koos_config.py        ← GET /api/config, /api/config/dashboard
│   ├── stats.py              ← GET /api/stats/*
│   ├── llm.py                ← POST /api/llm/*
│   └── chat.py               ← POST /api/chat, /api/chat/stream, GET /api/chat/status
└── services/
    ├── parser.py             ← Markdown/YAML-Parser und Serialisierer (mit explizitem Cache)
    ├── git_service.py        ← Git-Commit-Wrapper mit Revert- und Diff-Support
    └── ollama_service.py     ← RAG-lite Kontext-Aufbereitung für LLM
```

### git_service.py — Funktionen im Überblick

| Funktion | Beschreibung |
|---|---|
| `git_init_wenn_noetig()` | Initialisiert Git-Repo beim Serverstart, falls noch keines vorhanden |
| `commit(pfade, nachricht, begruendung)` | Staged Dateien und erstellt Commit mit optionaler Begründung im Body |
| `log_lesen(n)` | Gibt die letzten n Commits als Liste zurück (Hash, Autor, Datum, Nachricht, Begründung) |
| `diff_lesen(commit_hash)` | Gibt den unified diff eines Commits als Text zurück (`git show --stat -p`) |
| `commit_dateien(commit_hash)` | Listet die in einem Commit geänderten Dateien auf |
| `revert_commit(commit_hash)` | Setzt Dateien auf den Vorgänger-Stand zurück und erstellt Revert-Commit |

Git ist optional: Schlägt `git init` fehl (kein `git` installiert), läuft die API trotzdem weiter — lediglich der Audit-Trail entfällt.

---

## Lizenz

MIT License

Copyright (c) 2026 dsgvo-dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

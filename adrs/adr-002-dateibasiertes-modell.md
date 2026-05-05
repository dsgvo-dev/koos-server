# ADR-002: Dateibasiertes Datenmodell

**Status:** Akzeptiert
**Datum:** 2026-04
**Autoren:** KOOS-Projektteam

## Kontext

Für die Speicherung der KOOS-Kernobjekte (Organisationseinheiten, Prozesse, Datenarten) war zu entscheiden, ob eine relationale Datenbank, ein Document-Store oder das Dateisystem genutzt wird.

## Entscheidung

Alle KOOS-Daten werden als menschenlesbare Textdateien gespeichert:

- `orga.yaml` — Organisationsstruktur (eine Datei, alle Einheiten)
- `prozesse/proc-XX-NNN.md` — ein Prozess pro Datei, YAML-Frontmatter
- `daten/dtype-XX-NNN.md` — eine Datenart pro Datei, YAML-Frontmatter

Dateinamen folgen einem festen ID-Schema (`oe-amt-33`, `proc-33-008`) und sind gleichzeitig die primären Schlüssel.

## Begründung

- **Transparenz:** Jeder Mitarbeitende kann die Daten in einem Texteditor lesen, ohne Datenbank-Client oder Abfragesprache.
- **Versionierung:** Git kann die Dateien direkt versionieren — keine Dump/Restore-Prozeduren.
- **Portabilität:** Kein Datenbankserver erforderlich. Backup = Kopie des Ordners.
- **Spiegelung:** Der kommunale Prozesskatalog (Quelle: Celle/Springe) ist ebenfalls in diesem Format gehalten.

## Konsequenzen

- Komplexe Abfragen (JOIN-ähnlich) sind serverseitig im Python-Code zu implementieren, nicht per SQL.
- Bei sehr großen Datenmengen (> 10.000 Prozesse) könnte die Ladezeit relevant werden; dann wäre ein In-Memory-Cache nachzurüsten.
- Gleichzeitige Schreibzugriffe auf dieselbe Datei können zu Race Conditions führen — derzeit durch organisatorische Konventionen (Bearbeitung nach OE-Zuständigkeit) gemindert.

#!/usr/bin/env python3
"""
koos_mcp.py — MCP-Server für KOOS-Stammdaten
=============================================
Stellt die strukturierten KOOS-Daten (Organisationseinheiten,
Prozesse, Datenarten, Regelungen) als MCP-Tools für den Agenten
bereit. Parallel zum bestehenden KOOS-FastAPI-Server.

Start (stdio — für Hermes Agent):
    python3 koos_mcp.py --mandant gemeinde-musterstadt

Start (SSE — für Mattermost/OpenWebUI):
    python3 koos_mcp.py --mandant gemeinde-musterstadt --transport sse

Datenquelle: KOOS_DATA_DIR oder _input/koos-daten/<mandant>/
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import yaml
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

try:
    import koos_embed
except Exception:
    koos_embed = None

# ══════════════════════════════════════════════════════════════════════════════
# KONFIGURATION — Umgebungsvariablen für den produktiven Betrieb
# ══════════════════════════════════════════════════════════════════════════════

BASE_DIR     = Path(__file__).parent.resolve()
# koos_mcp.py liegt seit 11.07.2026 in _server/ (zusammen mit koos_embed.py),
# nicht mehr in koos-knowledge/ direkt — die echten Daten (_daten/) liegen
# daher eine Ebene höher als BASE_DIR, nicht direkt darunter.
KOOS_ROOT    = BASE_DIR.parent
KOOS_MANDANT = os.environ.get("KOOS_MANDANT", "blueprint")
KOOS_DATA_DIR = os.environ.get(
    "KOOS_DATA_DIR",
    str(KOOS_ROOT / "_input" / "koos-daten"),
)

# ══════════════════════════════════════════════════════════════════════════════
# DATEN-LADER
# ══════════════════════════════════════════════════════════════════════════════

class KoosLoader:
    """Lädt und hält KOOS-Daten für einen Mandanten."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.koos_config: dict[str, Any] = {}
        self.orga: dict[str, Any] = {}
        self.prozesse: list[dict[str, Any]] = []
        self.daten: list[dict[str, Any]] = []
        self.regelungen: list[dict[str, Any]] = []
        self.vvt: list[dict[str, Any]] = []

    def load_all(self) -> None:
        """Alle KOOS-Module laden."""
        self._load_config()
        self._load_orga()
        self._load_prozesse()
        self._load_daten()
        self._load_regelungen()
        self._load_vvt()

    def _load_config(self) -> None:
        path = self.data_dir / "koos.yaml"
        if path.exists():
            with open(path) as f:
                self.koos_config = yaml.safe_load(f) or {}

    def _load_orga(self) -> None:
        path = self.data_dir / "orga.yaml"
        if path.exists():
            with open(path) as f:
                raw = yaml.safe_load(f) or {}
                self.orga = raw.get("organisationseinheiten") or raw.get("einheiten") or []
                if isinstance(self.orga, dict):
                    self.orga = [self.orga]

    def _load_prozesse(self) -> None:
        proz_dir = self.data_dir / "prozesse"
        self.prozesse = self._load_markdown_dir(proz_dir)

    def _load_daten(self) -> None:
        daten_dir = self.data_dir / "daten"
        self.daten = self._load_markdown_dir(daten_dir)

    def _load_regelungen(self) -> None:
        regel_dir = self.data_dir / "regelungen"
        self.regelungen = self._load_markdown_dir(regel_dir)

    def _load_vvt(self) -> None:
        """VVT-Einträge laden (koos-knowledge/_daten/vvt/vvt-*.md).

        War bislang gar nicht angebunden — die 213 VVT-Einträge waren über
        koos_mcp.py nicht auffindbar, obwohl sie seit der Migration (ADR 001)
        hier liegen. Nachgezogen im Rahmen der Suche-Erweiterung (Juli 2026).
        """
        vvt_dir = self.data_dir / "vvt"
        self.vvt = self._load_markdown_dir(vvt_dir)

    @staticmethod
    def _load_markdown_dir(directory: Path) -> list[dict[str, Any]]:
        """Liest Markdown-Dateien mit YAML-Frontmatter."""
        result = []
        if not directory.is_dir():
            return result
        for f in sorted(directory.glob("*.md")):
            content = f.read_text()
            frontmatter = {}
            body = content
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    try:
                        frontmatter = yaml.safe_load(parts[1]) or {}
                    except yaml.YAMLError:
                        frontmatter = {}
                    body = parts[2].strip()
            # Cap bewusst großzügig (20000 statt vormals 500 Zeichen): Für
            # Regelungen (Dienstanweisungen etc.) steckt der eigentliche
            # Inhalt (z. B. eine Verschlüsselungspflichten-Tabelle) oft erst
            # nach den ersten Absätzen im body — bei 500 Zeichen war er für
            # _text_regelung() (Embedding-Text) und _format_regelung()
            # (Such-Auszug) schlicht nicht erreichbar. Nachgezogen 20.07.2026,
            # nachdem ein realer Test zeigte, dass koos_search_regelung die
            # richtige Regelung fand, aber der Auszug die relevante Tabelle
            # gar nicht enthalten konnte.
            entry = {"id": f.stem, "datei": str(f), "body": body[:20000]}
            entry.update(frontmatter)
            result.append(entry)
        return result

    # ── Such-Funktionen ──────────────────────────────────────────────────────

    def search_oe(self, query: str = "",
                  parent_id: str | None = None) -> list[dict[str, Any]]:
        """OE suchen."""
        results = []
        for oe in self.orga if isinstance(self.orga, list) else [self.orga]:
            name = str(oe.get("name", "")).lower()
            oid = str(oe.get("id", "")).lower()
            q = query.lower()
            if q and q not in name and q not in oid:
                continue
            if parent_id and oe.get("parent") != parent_id:
                continue
            results.append({
                "id": oe.get("id"),
                "name": oe.get("name"),
                "parent": oe.get("parent"),
                "rollen": oe.get("rollen", []),
                # sonderfunktionen (7/50 OEs) und hinweis (1/50) fehlten
                # bislang; 'ebene' entfernt — dieses Feld existiert in
                # orga.yaml nie, lieferte also immer None (totes Feld).
                "sonderfunktionen": oe.get("sonderfunktionen", []),
                "hinweis": oe.get("hinweis"),
            })
        return results

    def get_oe_tree(self, root_id: str | None = None) -> list[dict[str, Any]]:
        """OE-Baum aufbauen."""
        # Vereinfachte Version: flache Liste zurückgeben
        return self.search_oe(parent_id=root_id)

    @staticmethod
    def _datenspeicher_ids(prozess: dict[str, Any]) -> list[str]:
        """Liest die dstore-*-IDs eines Prozesses aus dem verschachtelten
        daten.datenspeicher-Feld (aktuelles Schema, seit Juli 2026)."""
        daten_feld = prozess.get("daten") or {}
        if not isinstance(daten_feld, dict):
            return []
        ds = daten_feld.get("datenspeicher") or []
        ids = []
        for entry in ds:
            if isinstance(entry, dict):
                ids.append(entry.get("id"))
            elif isinstance(entry, str):
                ids.append(entry)
        # Manche proc-*.md führen in derselben Liste zusätzlich freie
        # Rechtsgrundlagen-Strings (z. B. "WoGG (Wohngeldgesetz)") statt nur
        # dstore-*-Referenzen — vorhandene Altdaten-Unschärfe, hier
        # herausgefiltert statt sie als Datenspeicher misszuverstehen.
        return [i for i in ids if i and i.startswith("dstore-")]

    def _format_prozess(self, p: dict[str, Any]) -> dict[str, Any]:
        # Nachgezogen 20.07.2026: zustaendigeRolle (in 650/650 Dateien
        # vorhanden), daten.input/daten.output (welche Daten fließen rein/
        # raus) und regelungen (prozessspezifische Rechtsgrundlagen-Liste)
        # fehlten bislang komplett — Systematische Prüfung aller Formatter
        # gegen die tatsächlich vorhandenen Frontmatter-Felder.
        daten_feld = p.get("daten") or {}
        if not isinstance(daten_feld, dict):
            daten_feld = {}
        return {
            "id": p.get("id"),
            "titel": p.get("titel"),
            "status": p.get("status"),
            "zustaendigeEinheit": p.get("zustaendigeEinheit"),
            "zustaendigeRolle": p.get("zustaendigeRolle"),
            "beteiligte": p.get("beteiligte", []),
            "datenInput": daten_feld.get("input", []),
            "datenOutput": daten_feld.get("output", []),
            "datenspeicher": self._datenspeicher_ids(p),
            "regelungen": p.get("regelungen", []),
            "leika_id": p.get("leika_id"),
            "ozg_id": p.get("ozg_id"),
            "letzteAktualisierung": p.get("letzte-aktualisierung"),
        }

    def _format_vvt(self, v: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": v.get("id"),
            "uid": v.get("uid"),
            "titel": v.get("titel"),
            "status": v.get("status"),
            "organisationseinheit": v.get("organisationseinheit"),
            # Nachgezogen 20.07.2026: 'zweck' wurde bei der Suche als
            # Match-Kriterium genutzt (siehe search_vvt), aber nie im
            # Ergebnis zurückgegeben — jetzt sichtbar.
            "zweck": v.get("zweck"),
            "rechtsgrundlage": v.get("rechtsgrundlage"),
            # kategorien_betroffener und transfer_drittland sind nach
            # Art. 30 Abs. 1 DSGVO gesetzlich vorgeschriebene VVT-Angaben —
            # fehlten bislang komplett im Tool-Output.
            "kategorien_betroffener": v.get("kategorien_betroffener"),
            "kategorien_daten": v.get("kategorien_daten"),
            "transfer_drittland": v.get("transfer_drittland"),
            "datenspeicher": [
                e.get("id") if isinstance(e, dict) else e
                for e in (v.get("datenspeicher") or [])
            ],
            "loeschfrist": v.get("loeschfrist"),
            "prozesse": v.get("prozesse", []),
            "software_verarbeitungsmittel": v.get("software_verarbeitungsmittel"),
            "leika_id": v.get("leika_id"),
            "ozg_id": v.get("ozg_id"),
            "letzteAktualisierung": v.get("letzte-aktualisierung"),
            # tom/empfaenger: bereits am 20.07.2026 nachgezogen (waren im
            # Rohdatensatz längst vorhanden, wurden aber von diesem
            # Formatter verschluckt).
            "tom": v.get("tom", []),
            "empfaenger": v.get("empfaenger"),
        }

    def _format_daten(self, d: dict[str, Any]) -> dict[str, Any]:
        # Aktuelles Schema führt Schutzstufe/-bedarf/Vertraulichkeit/
        # Rechtsgrundlagen/Aufbewahrung verschachtelt unter "klassifizierung";
        # flaches Altschema als Fallback erhalten.
        klass = d.get("klassifizierung") or {}
        if not isinstance(klass, dict):
            klass = {}
        aufbewahrung = klass.get("aufbewahrung") or {}
        if not isinstance(aufbewahrung, dict):
            aufbewahrung = {}
        return {
            "id": d.get("id"),
            "name": d.get("name"),
            "datenkategorie": d.get("datenkategorie"),
            # zuständige-einheit fehlte bislang — wer für diese Datenart
            # verantwortlich ist, war über dieses Tool nicht erkennbar.
            "zustaendigeEinheit": d.get("zuständige-einheit"),
            "system": d.get("system"),
            "tags": d.get("tags", []),
            "schutzstufe": klass.get("schutzstufe", d.get("schutzstufe")),
            "schutzbedarf": klass.get("schutzbedarf", d.get("schutzbedarf")),
            "vertraulichkeit": klass.get("vertraulichkeit", d.get("vertraulichkeit")),
            "rechtsgrundlagen": klass.get("rechtsgrundlagen", d.get("rechtsgrundlagen")),
            "aufbewahrungFrist": aufbewahrung.get("frist", d.get("aufbewahrungFrist")),
            "aufbewahrungBeginn": aufbewahrung.get("beginn"),
            # aufbewahrung.hinweis enthält oft Datenqualitäts-Caveats (z. B.
            # "Frist und Beginn fachlich zu validieren") — bislang
            # unterschlagen, wodurch Antworten sicherer wirkten als die
            # zugrundeliegende Datenlage tatsächlich ist.
            "aufbewahrungHinweis": aufbewahrung.get("hinweis"),
        }

    def by_id(self, typ: str, iid: str) -> dict[str, Any] | None:
        """Direkter ID-Lookup für einen Item-Typ ('proc', 'vvt', 'dstore', 'reg') —
        genutzt vom semantischen Suchpfad, um Embedding-Treffer (nur IDs)
        wieder in vollständige Datensätze aufzulösen."""
        quelle, formatter = {
            "proc": (self.prozesse, self._format_prozess),
            "vvt": (self.vvt, self._format_vvt),
            "dstore": (self.daten, self._format_daten),
            "reg": (self.regelungen, self._format_regelung),
        }.get(typ, (None, None))
        if quelle is None:
            return None
        for entry in quelle:
            if entry.get("id") == iid:
                return formatter(entry)
        return None

    def search_prozess(self, query: str = "",
                       oe_id: str | None = None,
                       datenart_id: str | None = None) -> list[dict[str, Any]]:
        """Prozesse suchen."""
        results = []
        q = query.lower()
        for p in self.prozesse:
            titel = str(p.get("titel", "")).lower()
            oid = str(p.get("id", "")).lower()
            if q and q not in titel and q not in oid:
                continue
            if oe_id and p.get("zustaendigeEinheit") != oe_id:
                continue
            if datenart_id:
                # Aktuelles Schema: daten.datenspeicher ist eine Liste von
                # dstore-*-IDs, kein flaches "datenarten"-Feld (Altschema).
                if datenart_id not in self._datenspeicher_ids(p):
                    continue
            results.append(self._format_prozess(p))
        return results

    def search_vvt(self, query: str = "",
                   oe_id: str | None = None,
                   prozess_id: str | None = None) -> list[dict[str, Any]]:
        """VVT-Einträge (Verzeichnis von Verarbeitungstätigkeiten) suchen."""
        results = []
        q = query.lower()
        for v in self.vvt:
            titel = str(v.get("titel", "")).lower()
            zweck = str(v.get("zweck", "")).lower()
            oid = str(v.get("id", "")).lower()
            if q and q not in titel and q not in zweck and q not in oid:
                continue
            if oe_id and v.get("organisationseinheit") != oe_id:
                continue
            if prozess_id and prozess_id not in (v.get("prozesse") or []):
                continue
            results.append(self._format_vvt(v))
        return results

    def search_daten(self, query: str = "",
                     schutzstufe: str | None = None) -> list[dict[str, Any]]:
        """Datenarten suchen."""
        results = []
        q = query.lower()
        for d in self.daten:
            name = str(d.get("name", "")).lower()
            oid = str(d.get("id", "")).lower()
            kat = str(d.get("datenkategorie", "")).lower()
            if q and q not in name and q not in oid and q not in kat:
                continue
            formatted = self._format_daten(d)
            if schutzstufe and formatted["schutzstufe"] != schutzstufe:
                continue
            results.append(formatted)
        return results

    def _format_regelung(self, r: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": r.get("id"),
            "name": r.get("name"),
            "typ": r.get("typ"),
            "status": r.get("status", "aktiv"),
            "datum": str(r["datum"]) if r.get("datum") else None,
            "zustaendigeEinheit": r.get("zustaendigeEinheit") or r.get("zuständige-einheit"),
            "entscheidendesGremium": r.get("entscheidendesGremium") or r.get("entscheidendes-gremium"),
            "ersetzt": r.get("ersetzt"),
            "kontext": r.get("kontext"),
            "entscheidung": r.get("entscheidung"),
            # alternativen (in 2/5 Regelungen vorhanden) fehlte bislang —
            # dokumentiert erwogene, aber verworfene Optionen.
            "alternativen": r.get("alternativen", []),
            "auszug": (r.get("body") or "")[:500],
        }

    def search_regelung(self, query: str = "", typ: str | None = None,
                        zustaendige_einheit: str | None = None) -> list[dict[str, Any]]:
        """Regelungen (Dienstanweisungen, Satzungen, Geschäftsordnungen) suchen.

        Bislang nicht als MCP-Tool angebunden, obwohl der Loader die Daten
        schon lädt (self.regelungen) und eine eigene REST-Route existiert
        (_server/routers/regelungen.py) — nachgezogen am 20.07.2026, nachdem
        ein realer Test zeigte, dass z. B. die Dienstanweisung zur
        E-Mail-Nutzung (reg-da-e-mail-001) über MCP nicht auffindbar war.
        """
        results = []
        q = query.lower()
        for r in self.regelungen:
            name = str(r.get("name", "")).lower()
            rid = str(r.get("id", "")).lower()
            kontext = str(r.get("kontext", "")).lower()
            entscheidung = str(r.get("entscheidung", "")).lower()
            body = str(r.get("body", "")).lower()
            if q and not any(
                q in feld for feld in (name, rid, kontext, entscheidung, body)
            ):
                continue
            formatted = self._format_regelung(r)
            if typ and (formatted["typ"] or "").lower() != typ.lower():
                continue
            if zustaendige_einheit and formatted["zustaendigeEinheit"] != zustaendige_einheit:
                continue
            results.append(formatted)
        return results

    def get_regelung_volltext(self, reg_id: str) -> dict[str, Any] | None:
        """Vollständiger, ungekürzter Text einer Regelung — liest die
        .md-Datei frisch von der Platte (nicht aus self.regelungen, das über
        _load_markdown_dir() gecappt ist), damit die Volltext-Ausgabe
        unabhängig von jedem Lade-Cap immer wirklich vollständig ist.
        Ergänzt koos_search_regelung, deren 'auszug'-Feld bewusst kurz
        bleibt (Übersicht) — für den kompletten Text (z. B. eine vollständige
        Verschlüsselungspflichten-Tabelle) dieses Tool mit der von
        koos_search_regelung gelieferten id aufrufen. Nachgezogen 20.07.2026."""
        treffer = next((r for r in self.regelungen if r.get("id") == reg_id), None)
        if treffer is None:
            return None
        datei = Path(treffer["datei"])
        try:
            content = datei.read_text(encoding="utf-8")
        except OSError:
            return None
        body = content
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                body = parts[2].strip()
        formatted = self._format_regelung(treffer)
        formatted["volltext"] = body
        formatted.pop("auszug", None)
        return formatted

    def get_context(self, oe_id: str) -> dict[str, Any]:
        """Gesamtkontext einer OE."""
        oes = self.search_oe(query=oe_id)
        proz = self.search_prozess(oe_id=oe_id)
        vvt = self.search_vvt(oe_id=oe_id)
        # Datenarten der OE über die tatsächlichen Prozess-/VVT-Verknüpfungen
        # (daten.datenspeicher / vvt.datenspeicher) ermitteln — die vorherige
        # Heuristik (dstore-ID beginnt mit OE-ID) traf auf das reale Schema
        # nie zu, da dstore-IDs fachlich benannt sind (z. B. dstore-wohngeld),
        # nicht OE-präfigiert.
        relevante_ids = set()
        for p in proz:
            relevante_ids.update(p.get("datenspeicher") or [])
        for v in vvt:
            relevante_ids.update(v.get("datenspeicher") or [])
        alle_daten = self.search_daten(query="")
        oe_daten = [d for d in alle_daten if d.get("id") in relevante_ids]
        return {
            "organisationseinheit": oes[0] if oes else None,
            "prozesse": proz,
            "vvt": vvt,
            "datenarten": oe_daten,
        }


# ══════════════════════════════════════════════════════════════════════════════
# MCP-SERVER — korrigierte API (Decorator-Pattern)
# ══════════════════════════════════════════════════════════════════════════════

def _hybrid_erweitern(loader: "KoosLoader", typ: str, ergebnisse: list[dict],
                      query: str, min_treffer: int = 3) -> list[dict]:
    """Ergänzt Keyword-Treffer um semantische Treffer aus koos_embed, wenn
    die Keyword-Suche wenige/keine Treffer liefert. Markiert die Herkunft
    jedes Treffers (_quelle: keyword/semantisch). Kein harter Ollama-Zwang:
    liefert bei fehlendem Index, fehlendem Modul oder nicht erreichbarem
    Ollama einfach die reinen Keyword-Treffer zurück — die Basissuche
    funktioniert immer, die semantische Erweiterung ist optional."""
    for r in ergebnisse:
        r["_quelle"] = "keyword"
    if not query or koos_embed is None or len(ergebnisse) >= min_treffer:
        return ergebnisse
    bekannte_ids = {r["id"] for r in ergebnisse}
    for treffer in koos_embed.search_semantic(query, typ=typ):
        if treffer["id"] in bekannte_ids:
            continue
        voll = loader.by_id(typ, treffer["id"])
        if voll:
            voll["_quelle"] = "semantisch"
            voll["_score"] = treffer["score"]
            ergebnisse.append(voll)
            bekannte_ids.add(treffer["id"])
    return ergebnisse


server = Server("koos-mcp")

# ══════════════════════════════════════════════════════════════════════════════
# TOOL-DEFINITIONEN
# ══════════════════════════════════════════════════════════════════════════════

_loader: KoosLoader | None = None

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="koos_search_oe",
            description="Suche Organisationseinheiten nach Name oder ID. "
                        "Optional filter nach parent_id.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Name oder ID der OE"},
                    "parent_id": {
                        "type": "string",
                        "description": "Filter: nur Kinder dieser OE",
                    },
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="koos_get_oe_tree",
            description="Organigramm abrufen. Ohne root_id: alle OEs.",
            inputSchema={
                "type": "object",
                "properties": {
                    "root_id": {
                        "type": "string",
                        "description": "Start-OE (optional)",
                    },
                },
            },
        ),
        types.Tool(
            name="koos_search_prozess",
            description="Suche konkrete Verwaltungsprozesse dieser Verwaltung nach "
                        "Name, OE oder Datenart (z. B. 'Wohngeld beantragen', "
                        "'Kfz-Zulassung'). Liefert die für DIESEN Prozess bereits "
                        "geprüfte, verbindliche Zuordnung (OE, Datenarten). "
                        "Bei Fragen zu einem konkreten Prozess maßgeblicher als die "
                        "allgemeine Rechtslage aus dsms-knowledge/search_knowledge — "
                        "beide Server ergänzen sich, bei Prozessfragen zusätzlich hier "
                        "nachsehen, nicht nur allgemein herleiten. Enthält KEINE "
                        "Rechtsgrundlage, Löschfrist, Empfänger oder TOM — dafür "
                        "zusätzlich koos_search_vvt mit prozess_id=<hier gefundene id> "
                        "aufrufen (oder koos_get_context mit der zustaendigeEinheit).",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Name, ID oder Schlagwort"},
                    "oe_id": {
                        "type": "string",
                        "description": "Filter: Prozesse einer bestimmten OE",
                    },
                    "datenart_id": {
                        "type": "string",
                        "description": "Filter: Prozesse mit bestimmter Datenart",
                    },
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="koos_search_daten",
            description="Suche Datenarten nach Name, Kategorie oder Schutzstufe. "
                        "Liefert die für diese Verwaltung bereits fachlich geprüfte, "
                        "verbindliche Schutzstufen-Klassifizierung (A-E) konkreter "
                        "Datenarten inkl. Rechtsgrundlage und Löschfrist — das ist "
                        "die maßgebliche, projektspezifische Einstufung. Kann von "
                        "einer allgemeinen Herleitung aus dem abstrakten "
                        "Schutzstufenkonzept (dsms-knowledge) abweichen; bei Fragen "
                        "zu konkreten Datenarten (z. B. 'Wohngeld-Einkommensdaten') "
                        "diesem Tool den Vorrang geben. Für die daraus folgenden "
                        "Verhaltensvorgaben (z. B. Verschlüsselungspflichten): "
                        "zusätzlich koos_search_regelung nutzen.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Name oder Kategorie"},
                    "schutzstufe": {
                        "type": "string",
                        "description": "Filter: A/B/C/D/E",
                    },
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="koos_search_vvt",
            description="Suche VVT-Einträge (Verzeichnis von Verarbeitungs"
                        "tätigkeiten, Art. 30 DSGVO) nach Titel/Zweck, OE oder "
                        "verknüpftem Prozess (Filter prozess_id). Liefert die "
                        "bereits dokumentierte, verbindliche Rechtsgrundlage, "
                        "Kategorien betroffener Personen, Datenkategorien, "
                        "Empfänger, Drittlandtransfer, Löschfrist, TOM (technische "
                        "und organisatorische Maßnahmen) und Leika-/OZG-ID für "
                        "einen konkreten Verwaltungsprozess. Bei Fragen zu einem "
                        "konkreten Prozess (z. B. Wohngeld) maßgeblicher als eine "
                        "allgemeine Herleitung aus dsms-knowledge — insbesondere "
                        "bei Fragen nach Rechtsgrundlage, Empfängerkreis oder "
                        "getroffenen Sicherheitsmaßnahmen (TOM) für einen "
                        "konkreten Prozess IMMER hier nachsehen, das liefert "
                        "koos_search_prozess allein nicht.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Titel, Zweck oder ID"},
                    "oe_id": {
                        "type": "string",
                        "description": "Filter: VVT-Einträge einer bestimmten OE",
                    },
                    "prozess_id": {
                        "type": "string",
                        "description": "Filter: VVT-Einträge, die diesen Prozess referenzieren",
                    },
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="koos_search_regelung",
            description="Suche interne Regelungen dieser Verwaltung — Dienst"
                        "anweisungen, Satzungen, Geschäftsordnungen (z. B. "
                        "'E-Mail', 'Cloud-Nutzung'). Liefert die bereits erlassene, "
                        "verbindliche Regelung inkl. Kontext, Entscheidung und "
                        "Auszug aus dem Volltext. Ergänzt koos_search_daten: "
                        "Während koos_search_daten die Schutzstufen-Klassifizierung "
                        "einer Datenart liefert, liefert dieses Tool die konkreten "
                        "Verhaltensvorgaben dazu (z. B. welche Verschlüsselung bei "
                        "welcher Schutzstufe für den E-Mail-Versand vorgeschrieben "
                        "ist). Bei Fragen zu erlaubten Übertragungswegen, internen "
                        "Verfahren oder organisatorischen Vorgaben dieses Tool "
                        "nutzen — dsms-knowledge kennt nur die allgemeine "
                        "Rechtslage, nicht die hausinterne Regelung. Der 'auszug' "
                        "ist bewusst kurz; für Details, die weiter hinten im "
                        "Dokument stehen (z. B. eine vollständige Tabelle), "
                        "zusätzlich koos_get_regelung_volltext mit der "
                        "gefundenen id aufrufen.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Name, Thema oder Stichwort (z. B. 'E-Mail', 'Cloud')"
                    },
                    "typ": {
                        "type": "string",
                        "description": "Filter: Regelungstyp (z. B. 'Dienstanweisung', 'Satzung', 'Geschäftsordnung')",
                    },
                    "zustaendige_einheit": {
                        "type": "string",
                        "description": "Filter: OE-ID der zuständigen Einheit",
                    },
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="koos_get_regelung_volltext",
            description="Vollständiger, ungekürzter Text einer Regelung "
                        "(Dienstanweisung, Satzung, Geschäftsordnung). "
                        "koos_search_regelung liefert bewusst nur einen kurzen "
                        "Auszug zur Übersicht — Details, die weiter hinten im "
                        "Dokument stehen (z. B. eine vollständige "
                        "Verschlüsselungspflichten- oder Fristentabelle), sind "
                        "darin nicht enthalten. Nach einem Treffer bei "
                        "koos_search_regelung dieses Tool mit der dort "
                        "gelieferten id aufrufen, um den kompletten Text zu "
                        "erhalten, bevor eine Frage zu internen Verfahrens"
                        "vorgaben abschließend beantwortet wird.",
            inputSchema={
                "type": "object",
                "properties": {
                    "reg_id": {
                        "type": "string",
                        "description": "id der Regelung, wie von koos_search_regelung geliefert (z. B. 'reg-da-e-mail-001')",
                    },
                },
                "required": ["reg_id"],
            },
        ),
        types.Tool(
            name="koos_get_context",
            description="Gesamtkontext einer Organisationseinheit: OE-Daten, "
                        "Prozesse, VVT-Einträge (inkl. Rechtsgrundlage, "
                        "Empfänger, Löschfrist, TOM) und Datenarten in einem "
                        "Aufruf. Praktisch, wenn zu einem Prozess bereits die "
                        "zuständige OE bekannt ist (z. B. aus koos_search_prozess) "
                        "und zusätzlich die zugehörigen VVT-/TOM-Angaben benötigt "
                        "werden, ohne koos_search_vvt separat aufzurufen.",
            inputSchema={
                "type": "object",
                "properties": {
                    "oe_id": {
                        "type": "string",
                        "description": "OE-ID (z. B. oe-fb1-personal)",
                    },
                },
                "required": ["oe_id"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    assert _loader is not None, "Loader nicht initialisiert"

    if name == "koos_search_oe":
        query = arguments.get("query", "")
        parent_id = arguments.get("parent_id")
        results = _loader.search_oe(query=query, parent_id=parent_id)
        return [types.TextContent(
            type="text",
            text=json.dumps(results, ensure_ascii=False, indent=2)
        )]

    elif name == "koos_get_oe_tree":
        root_id = arguments.get("root_id")
        results = _loader.get_oe_tree(root_id=root_id)
        return [types.TextContent(
            type="text",
            text=json.dumps(results, ensure_ascii=False, indent=2)
        )]

    elif name == "koos_search_prozess":
        query = arguments.get("query", "")
        oe_id = arguments.get("oe_id")
        datenart_id = arguments.get("datenart_id")
        results = _loader.search_prozess(
            query=query, oe_id=oe_id, datenart_id=datenart_id
        )
        results = _hybrid_erweitern(_loader, "proc", results, query)
        return [types.TextContent(
            type="text",
            text=json.dumps(results, ensure_ascii=False, indent=2)
        )]

    elif name == "koos_search_daten":
        query = arguments.get("query", "")
        schutzstufe = arguments.get("schutzstufe")
        results = _loader.search_daten(query=query, schutzstufe=schutzstufe)
        results = _hybrid_erweitern(_loader, "dstore", results, query)
        return [types.TextContent(
            type="text",
            text=json.dumps(results, ensure_ascii=False, indent=2)
        )]

    elif name == "koos_search_vvt":
        query = arguments.get("query", "")
        oe_id = arguments.get("oe_id")
        prozess_id = arguments.get("prozess_id")
        results = _loader.search_vvt(query=query, oe_id=oe_id, prozess_id=prozess_id)
        results = _hybrid_erweitern(_loader, "vvt", results, query)
        return [types.TextContent(
            type="text",
            text=json.dumps(results, ensure_ascii=False, indent=2)
        )]

    elif name == "koos_search_regelung":
        query = arguments.get("query", "")
        typ = arguments.get("typ")
        zustaendige_einheit = arguments.get("zustaendige_einheit")
        results = _loader.search_regelung(
            query=query, typ=typ, zustaendige_einheit=zustaendige_einheit
        )
        results = _hybrid_erweitern(_loader, "reg", results, query)
        return [types.TextContent(
            type="text",
            text=json.dumps(results, ensure_ascii=False, indent=2)
        )]

    elif name == "koos_get_regelung_volltext":
        reg_id = arguments.get("reg_id", "")
        if not reg_id:
            return [types.TextContent(
                type="text", text="Fehler: reg_id erforderlich."
            )]
        result = _loader.get_regelung_volltext(reg_id=reg_id)
        if result is None:
            return [types.TextContent(
                type="text",
                text=f"⚠ Regelung '{reg_id}' nicht gefunden."
            )]
        return [types.TextContent(
            type="text",
            text=json.dumps(result, ensure_ascii=False, indent=2)
        )]

    elif name == "koos_get_context":
        oe_id = arguments.get("oe_id", "")
        if not oe_id:
            return [types.TextContent(
                type="text", text="Fehler: oe_id erforderlich."
            )]
        context = _loader.get_context(oe_id=oe_id)
        return [types.TextContent(
            type="text",
            text=json.dumps(context, ensure_ascii=False, indent=2)
        )]

    else:
        return [types.TextContent(
            type="text", text=f"Unbekanntes Tool: {name}"
        )]


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    global _loader

    parser = argparse.ArgumentParser(description="KOOS-MCP-Server")
    parser.add_argument(
        "--mandant", default=KOOS_MANDANT,
        help="Mandanten-Name (z. B. gemeinde-musterstadt)"
    )
    parser.add_argument(
        "--data-dir", default=KOOS_DATA_DIR,
        help="KOOS-Datenverzeichnis (überschreibt automatische Suche)"
    )
    parser.add_argument(
        "--transport", choices=["stdio", "sse"], default="stdio",
        help="Transport-Protokoll (default: stdio)"
    )
    parser.add_argument("--port", type=int, default=8200, help="Port für SSE")
    args = parser.parse_args()

    # Datenverzeichnis bestimmen
    if args.data_dir:
        data_root = Path(args.data_dir)
    else:
        data_root = BASE_DIR / "_input" / "koos-daten"

    mandant_dir = data_root / args.mandant
    if not mandant_dir.is_dir():
        # Fallback: direktes Datenverzeichnis (kein Mandanten-Ordner)
        if args.mandant == "blueprint":
            mandant_dir = data_root
        else:
            print(f"Fehler: Mandanten-Verzeichnis nicht gefunden: {mandant_dir}",
                  file=sys.stderr)
            print(f"Erwartet: {data_root}/{args.mandant}/ oder {data_root}/",
                  file=sys.stderr)
            sys.exit(1)

    # Zweiter Fallback: das eigentliche Produktivverzeichnis der KOOS-Daten
    # (koos-knowledge/_daten/) statt des ursprünglich vorgesehenen, aber nie
    # befüllten _input/koos-daten/<mandant>/-Layouts. Ohne diesen Fallback
    # lädt der Server bei fehlender KOOS_DATA_DIR-Env-Var still und leise
    # 0 Prozesse/0 VVT/0 Datenarten, statt auf die echten Dateien zu treffen.
    if not any(mandant_dir.glob("*.md")) and not (mandant_dir / "prozesse").is_dir():
        alt_dir = KOOS_ROOT / "_daten"
        if alt_dir.is_dir():
            print(f"Hinweis: {mandant_dir} leer/nicht gefunden — "
                  f"verwende {alt_dir}", file=sys.stderr)
            mandant_dir = alt_dir

    # Daten laden
    loader = KoosLoader(mandant_dir)
    loader.load_all()
    _loader = loader
    print(
        f"KOOS-MCP: {args.mandant} geladen "
        f"({len(loader.prozesse)} Prozesse, {len(loader.vvt)} VVT-Einträge, "
        f"{len(loader.daten)} Datenarten)",
        file=sys.stderr,
    )

    if args.transport == "sse":
        from mcp.server.sse import SseServerTransport
        from starlette.applications import Starlette
        from starlette.routing import Mount, Route
        import uvicorn

        sse = SseServerTransport("/messages/")

        async def handle_sse(request):
            async with sse.connect_sse(
                request.scope, request.receive, request._send
            ) as streams:
                await server.run(
                    streams[0], streams[1],
                    server.create_initialization_options()
                )

        app = Starlette(
            routes=[
                Route("/sse", endpoint=handle_sse),
                Mount("/messages/", app=sse.handle_post_message),
            ],
        )
        print(f"KOOS-MCP SSE auf Port {args.port}", file=sys.stderr)
        uvicorn.run(app, host="0.0.0.0", port=args.port)
    else:
        async def run_stdio():
            from mcp.server.stdio import stdio_server
            async with stdio_server() as (read_stream, write_stream):
                await server.run(
                    read_stream, write_stream,
                    server.create_initialization_options(),
                )
        import asyncio
        asyncio.run(run_stdio())


if __name__ == "__main__":
    main()
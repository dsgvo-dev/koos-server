"""
KOOS – Ollama-Service
Baut den Kontext-Prompt aus KOOS-Daten und ruft Ollama auf.

Strategie: kein Tool-Use, stattdessen RAG-lite.
  1. Nutzerfrage analysieren (dstore-IDs, Suchbegriffe)
  2. Passende KOOS-Daten laden
  3. Als Kontext in den System-Prompt injizieren
  4. Ollama aufrufen
"""
from __future__ import annotations
import json
import re
import logging
from pathlib import Path

try:
    import httpx
    _HTTPX_OK = True
except ImportError:
    _HTTPX_OK = False

import config
from services import parser

log = logging.getLogger("koos.ollama")

# Regex für explizite IDs in der Frage
_DSTORE_RE  = re.compile(r"\bdstore-[a-z0-9\-]+\b")
_PROC_RE    = re.compile(r"\bproc-[a-z0-9\-]+\b")
_REG_RE     = re.compile(r"\breg-[a-z0-9\-]+\b")


# ── Kontext-Aufbau ────────────────────────────────────────────────────────────

def _orga_einheiten() -> list[dict]:
    if config.ORGA_FILE.exists():
        return parser.parse_orga_yaml(config.ORGA_FILE.read_text(encoding="utf-8"))
    return []


def _oe_namen() -> dict[str, str]:
    """Gibt ein Dict {oe-id: lesbarer Name} zurück, gecacht."""
    return {e["id"]: e["name"] for e in _orga_einheiten()}


def _oe_name(oe_id: str, namen: dict[str, str]) -> str:
    """Gibt den lesbaren Namen einer OE zurück, oder den ID-Rest als Fallback."""
    if not oe_id:
        return "nicht zugeordnet"
    if oe_id in namen:
        return namen[oe_id]
    # Fallback: oe-amt-63 → Amt 63
    return oe_id.replace("oe-amt-", "Amt ").replace("oe-", "").replace("-", " ").title()


def _system_prompt(kontext_blöcke: list[str]) -> str:
    """Baut den System-Prompt aus statischem Rahmen + dynamischen Kontext-Blöcken."""
    einheiten = _orga_einheiten()
    oe_liste  = ", ".join(f"{e['id']} ({e['name']})" for e in einheiten)

    basis = f"""Du bist ein freundlicher Wissensassistent für Beschäftigte der Gemeindeverwaltung.
Du hilfst bei Fragen zu Verwaltungsprozessen, Zuständigkeiten, Daten und Regelungen.

Die Verwaltung hat:
- {len(parser.lade_alle_prozesse(config.PROZESSE_DIR))} dokumentierte Verwaltungsprozesse
- {len(parser.lade_alle_daten(config.DATEN_DIR))} Datenspeicher
- {len(parser.lade_alle_regelungen(config.REGELUNGEN_DIR))} Regelungen (Satzungen, Dienstanweisungen, Geschäftsordnungen)
- Organisationseinheiten: {oe_liste}

DEINE ANTWORTEN:
- Schreibe in verständlichem Deutsch für Verwaltungsmitarbeiter ohne IT-Kenntnisse.
- Nenne Prozesse und Datenspeicher bei ihrem Namen, nicht bei technischen IDs.
  Statt "proc-baugenehmigung-beantragen" schreibe "Baugenehmigung beantragen".
  Statt "dstore-meldedaten" schreibe "Meldedaten".
- Keine Erwähnungen von API-Endpunkten, JSON, Datenbankbegriffen oder technischen IDs.
- Keine Hinweise auf technische Hintergründe oder interne Systemstrukturen.
- Antworte direkt und konkret auf die Frage.
- Wenn du eine Information nicht hast, sage das einfach — ohne technische Erklärungen.
- Verwende nur Daten die dir im Kontext bereitgestellt werden. Erfinde nichts."""

    if kontext_blöcke:
        basis += "\n\n== Relevante KOOS-Daten ==\n" + "\n\n".join(kontext_blöcke)

    return basis


def _lade_kontext(frage: str) -> list[str]:
    """
    Analysiert die Frage und lädt passende KOOS-Daten als Kontext-Blöcke.
    Gibt eine Liste von Textblöcken zurück die in den System-Prompt injiziert werden.
    """
    blöcke: list[str] = []
    namen = _oe_namen()  # einmal laden, mehrfach nutzen

    # 1. Explizit genannte dstore-IDs → Querverweise laden
    for dstore_id in _DSTORE_RE.findall(frage):
        datei = config.DATEN_DIR / f"{dstore_id}.md"
        if datei.exists():
            d = parser.parse_daten_md(dstore_id, datei.read_text(encoding="utf-8"))
            # Prozesse die diesen Datenspeicher nutzen
            alle_p = parser.lade_alle_prozesse(config.PROZESSE_DIR)
            nutzende = [
                f"  - {p['titel']}"
                for p in alle_p
                if dstore_id in _ds_ids(p)
            ]
            rg = ", ".join(
                f"{r.get('gesetz','')} {r.get('artikel','')}".strip()
                for r in (d.get("rechtsgrundlagen") or [])
            )
            blöcke.append(
                f"Datenspeicher: {d['name']}\n"
                f"  Zuständig: {_oe_name(d.get('zustaendigeEinheit',''), namen)}\n"
                f"  Schutzstufe: {d.get('schutzstufe','')}  "
                f"Schutzbedarf: {d.get('schutzbedarf','')}  "
                f"Vertraulichkeit: {d.get('vertraulichkeit','')}\n"
                f"  Rechtsgrundlagen: {rg or '—'}\n"
                f"  Genutzt in {len(nutzende)} Prozessen:\n"
                + ("\n".join(nutzende) if nutzende else "  (keine)")
            )

    # 2. Explizit genannte proc-IDs → Prozess laden
    for proc_id in _PROC_RE.findall(frage):
        datei = config.PROZESSE_DIR / f"{proc_id}.md"
        if datei.exists():
            p = parser.parse_prozess_md(proc_id, datei.read_text(encoding="utf-8"))
            ds_ids = _ds_ids(p)
            blöcke.append(
                f"Prozess: {p['titel']} ({proc_id})\n"
                f"  Status: {p['status']}  Einheit: {p.get('zustaendigeEinheit','')}\n"
                f"  Datenspeicher: {', '.join(ds_ids) or '—'}\n"
                f"  Regelungen: {', '.join(p.get('regelungen') or []) or '—'}"
            )

    # 2b. Explizit genannte reg-IDs → Regelung laden
    for reg_id in _REG_RE.findall(frage):
        datei = config.REGELUNGEN_DIR / f"{reg_id}.md"
        if datei.exists():
            r = parser.parse_regelung_md(reg_id, datei.read_text(encoding="utf-8"))
            blöcke.append(_regelung_block(r))

    # 3. Aggregationsfragen → Stats-Endpunkt direkt laden
    frage_lower = frage.lower()
    if not blöcke and any(w in frage_lower for w in [
        "ohne prozess", "kein prozess", "nicht zugeordnet", "verwaist",
        "ohne zuordnung", "keinen prozess", "keinem prozess",
        "zugeordnet sind", "zugeordnet werden", "nicht zugewiesen",
        "unzugeordnet", "fehlende zuordnung"
    ]):
        from routers.stats import get_ohne_prozess
        daten = get_ohne_prozess()
        zeilen = "\n".join(
            f"  - {d['name']} ({d.get('datenkategorie','')}, "
            f"zuständig: {_oe_name(d.get('zustaendigeEinheit',''), namen)})"
            for d in daten["ohne_prozess"][:30]
        )
        blöcke.append(
            f"Von {daten['gesamt_datenspeicher']} Datenspeichern sind "
            f"{daten['ohne_prozess_anzahl']} keinem Verwaltungsprozess zugeordnet:\n{zeilen}"
        )

    # 4. Allgemeine Suche wenn keine IDs aber Schlüsselwörter vorhanden
    if not blöcke:
        treffer_d = _suche_daten(frage)
        treffer_p = _suche_prozesse(frage)
        treffer_r = _suche_regelungen(frage)
        if treffer_d:
            zeilen = "\n".join(
                f"  - {d['name']} ({d.get('datenkategorie','')}, "
                f"zuständig: {_oe_name(d.get('zustaendigeEinheit',''), namen)})"
                for d in treffer_d[:10]
            )
            blöcke.append(f"Gefundene Datenspeicher ({len(treffer_d)}):\n{zeilen}")
        if treffer_p:
            for p in treffer_p[:5]:
                blöcke.append(_prozess_block(p, namen))
        # Regelungen vollständig einbinden (Inhalt ist wichtig für Antworten)
        for r in treffer_r[:3]:
            blöcke.append(_regelung_block(r))

    return blöcke


def _prozess_block(p: dict, namen: dict) -> str:
    """Formatiert einen Prozess als lesbaren Kontext-Block für das LLM."""
    zeile  = f"Prozess: {p['titel']}"
    zuständig = _oe_name(p.get("zustaendigeEinheit", ""), namen)
    lines = [
        zeile,
        f"  Zuständig: {zuständig}",
        f"  Status: {p.get('status', 'aktiv')}",
    ]
    # Beteiligte Einheiten
    beteiligte = p.get("beteiligte") or []
    if beteiligte:
        bl = ", ".join(
            f"{_oe_name(b.get('einheit',''), namen)}"
            + (f" ({b['aufgabe']})" if b.get("aufgabe") else "")
            for b in beteiligte
        )
        lines.append(f"  Beteiligte: {bl}")
    # Rechtsgrundlagen
    regelungen = p.get("regelungen") or []
    if regelungen:
        lines.append(f"  Rechtsgrundlagen: {'; '.join(regelungen)}")
    # Prozessschritte
    schritte = p.get("schritte") or []
    if schritte:
        lines.append("  Prozessschritte:")
        for i, s in enumerate(schritte, 1):
            beschr = f" — {s['beschreibung']}" if s.get("beschreibung") else ""
            lines.append(f"    {i}. {s['name']}{beschr}")
    return "\n".join(lines)


def _regelung_block(r: dict) -> str:
    """Formatiert eine Regelung als lesbaren Kontext-Block für den LLM."""
    lines = [
        f"Regelung: {r['name']} ({r['id']})",
        f"  Typ: {r.get('typ','')}  |  Status: {r.get('status','')}  |"
        f"  Datum: {r.get('datum','')}",
        f"  Beschlossen durch: {r.get('entscheidendesGremium','—')}",
    ]
    if r.get("kontext"):
        lines.append(f"  Kontext: {r['kontext']}")
    if r.get("entscheidung"):
        lines.append(f"  Inhalt/Entscheidung: {r['entscheidung']}")
    # Ersten Teil des Markdown-Body einbinden (max. 1500 Zeichen)
    if r.get("body"):
        body_kurz = r["body"][:1500]
        if len(r["body"]) > 1500:
            body_kurz += "\n  [...]"
        lines.append(f"\n  Volltext (Auszug):\n{body_kurz}")
    return "\n".join(lines)


def _ds_ids(proc: dict) -> list[str]:
    """Hilfsfunktion: Datenspeicher-IDs aus einem Prozess-Dict."""
    ds = proc.get("daten", {}).get("datenspeicher", [])
    return [
        e.get("id", "") if isinstance(e, dict) else str(e)
        for e in (ds or [])
        if e
    ]


_STOPPWÖRTER = {
    "wie", "wird", "eine", "einen", "einem", "eines", "ein", "der", "die", "das",
    "den", "dem", "des", "und", "oder", "aber", "auch", "sich", "ist", "sind",
    "was", "wer", "wann", "wo", "welche", "welcher", "welches", "welchen",
    "kann", "muss", "soll", "darf", "wird", "werden", "wurde", "haben",
    "beim", "beim", "für", "mit", "von", "aus", "nach", "über", "unter",
    "bitte", "gibt", "gibt", "zuständig", "zuständige", "bearbeitet",
}

def _keywords(q: str) -> list[str]:
    """Extrahiert bedeutsame Schlüsselwörter aus einer Frage."""
    wörter = re.findall(r'[a-züöäß]{4,}', q.lower())
    return [w for w in wörter if w not in _STOPPWÖRTER] or [q.lower()]


def _suche_daten(q: str) -> list[dict]:
    begriffe = _keywords(q)
    return [
        d for d in parser.lade_alle_daten(config.DATEN_DIR)
        if any(
            b in d.get("name", "").lower()
            or b in d.get("id", "").lower()
            or b in d.get("datenkategorie", "").lower()
            for b in begriffe
        )
    ]


def _suche_prozesse(q: str) -> list[dict]:
    begriffe = _keywords(q)
    return [
        p for p in parser.lade_alle_prozesse(config.PROZESSE_DIR)
        if any(
            b in p.get("titel", "").lower()
            or b in p.get("id", "").lower()
            for b in begriffe
        )
    ]


def _suche_regelungen(frage: str) -> list[dict]:
    """Volltextsuche über Regelungen: Name, Typ, kontext, entscheidung, body."""
    q = frage.lower()
    # Suche über mehrere Wörter: alle Treffer aus mind. einem Suchterm
    begriffe = [w for w in q.split() if len(w) > 3]
    if not begriffe:
        begriffe = [q]
    treffer = []
    for r in parser.lade_alle_regelungen(config.REGELUNGEN_DIR):
        text = " ".join([
            r.get("name", ""), r.get("typ", ""),
            r.get("kontext", ""), r.get("entscheidung", ""),
            r.get("body", "")
        ]).lower()
        if any(b in text for b in begriffe):
            treffer.append(r)
    return treffer


# ── Ollama-Aufruf ─────────────────────────────────────────────────────────────

def stream_ollama(frage: str, verlauf: list[dict] | None = None, modell: str | None = None):
    """
    Generator: liefert Token für Token als SSE-Zeilen.
    Yields: strings im Format  'data: {"token": "..."}\n\n'
    oder abschließend:          'data: {"done": true}\n\n'
    """
    import json as _json

    if not _HTTPX_OK:
        yield 'data: {"token": "httpx nicht installiert (pip install httpx)"}\n\n'
        yield 'data: {"done": true}\n\n'
        return

    kontext  = _lade_kontext(frage)
    system   = _system_prompt(kontext)
    nachrichten = [{"role": "system", "content": system}]
    for msg in (verlauf or []):
        nachrichten.append(msg)
    nachrichten.append({"role": "user", "content": frage})

    url = f"{config.OLLAMA_URL.rstrip('/')}/api/chat"
    payload = {
        "model":    modell or config.OLLAMA_MODEL,
        "messages": nachrichten,
        "stream":   True,
    }

    log.info("Ollama-Stream: model=%s, kontext-blöcke=%d", payload["model"], len(kontext))
    try:
        with httpx.stream("POST", url, json=payload, timeout=120.0) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                try:
                    data = _json.loads(line)
                except Exception:
                    continue
                token = data.get("message", {}).get("content", "")
                if token:
                    yield f"data: {_json.dumps({'token': token}, ensure_ascii=False)}\n\n"
                if data.get("done"):
                    yield 'data: {"done": true}\n\n'
                    return
    except httpx.ConnectError:
        msg = f"Ollama nicht erreichbar ({config.OLLAMA_URL}). Bitte: ollama serve"
        yield f"data: {_json.dumps({'token': msg})}\n\n"
        yield 'data: {"done": true}\n\n'
    except Exception as e:
        log.exception("Fehler beim Ollama-Stream")
        yield f"data: {_json.dumps({'token': f'Fehler: {e}'})}\n\n"
        yield 'data: {"done": true}\n\n'


def frage_ollama(frage: str, verlauf: list[dict] | None = None, modell: str | None = None) -> str:
    """
    Stellt eine Frage an Ollama mit KOOS-Kontext.
    verlauf: Liste von {"role": "user"|"assistant", "content": "..."} für Gesprächsgedächtnis.
    Gibt die Antwort als String zurück.
    """
    kontext = _lade_kontext(frage)
    system  = _system_prompt(kontext)

    nachrichten = [{"role": "system", "content": system}]
    for msg in (verlauf or []):
        nachrichten.append(msg)
    nachrichten.append({"role": "user", "content": frage})

    url = f"{config.OLLAMA_URL.rstrip('/')}/api/chat"
    payload = {
        "model":    modell or config.OLLAMA_MODEL,
        "messages": nachrichten,
        "stream":   False,
    }

    if not _HTTPX_OK:
        return "httpx ist nicht installiert. Bitte: pip install httpx"

    log.info("Ollama-Anfrage: model=%s, kontext-blöcke=%d", modell or config.OLLAMA_MODEL, len(kontext))
    try:
        resp = httpx.post(url, json=payload, timeout=120.0)
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"]
    except httpx.ConnectError:
        return (
            f"Ollama ist nicht erreichbar ({config.OLLAMA_URL}). "
            f"Bitte sicherstellen dass Ollama läuft: `ollama serve`"
        )
    except httpx.HTTPStatusError as e:
        log.error("Ollama HTTP-Fehler: %s", e)
        return f"Fehler beim LLM-Aufruf: {e.response.status_code}"
    except Exception as e:
        log.exception("Unerwarteter Fehler bei Ollama-Aufruf")
        return f"Interner Fehler: {e}"


def ollama_verfuegbar() -> dict:
    """Prüft ob Ollama erreichbar ist und welche Modelle vorhanden sind."""
    if not _HTTPX_OK:
        return {"verfuegbar": False, "modelle": [], "aktiv": config.OLLAMA_MODEL,
                "fehler": "httpx nicht installiert (pip install httpx)"}
    try:
        resp = httpx.get(f"{config.OLLAMA_URL.rstrip('/')}/api/tags", timeout=5.0)
        resp.raise_for_status()
        modelle = [m["name"] for m in resp.json().get("models", [])]
        return {"verfuegbar": True, "modelle": modelle, "aktiv": config.OLLAMA_MODEL}
    except Exception:
        return {"verfuegbar": False, "modelle": [], "aktiv": config.OLLAMA_MODEL}

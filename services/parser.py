"""
KOOS Server – Parser
Python-Ports der JavaScript-Parser aus preview.html.
Wandelt YAML- und Markdown-Dateien in strukturierte Dictionaries um.
"""
from __future__ import annotations
import io
import re
from pathlib import Path
from typing import Any
import yaml

# ── Round-Trip-YAML (optional) ────────────────────────────────────────────────
# PyYAML liest YAML und schreibt es neu — Kommentare, Anführungszeichen und die
# Schreibweise von null gehen dabei verloren. Für den Bestand ist das kein
# theoretischer Mangel: alle 303 Datenarten führen im Frontmatter zusammen 604
# Kommentarzeilen, die die Datenschutz-Achse von der BSI-Achse trennen. Jede
# Speicherung über die Oberfläche löschte sie bisher.
#
# ruamel.yaml liest dieselbe Datei als Round-Trip-Struktur und schreibt nur die
# geänderten Werte neu. Ist es nicht installiert, arbeitet alles weiter wie
# bisher — dann fehlen eben die Kommentare.
#
#   Installation:  pip install ruamel.yaml
try:
    from ruamel.yaml import YAML as _RuamelYAML
    from ruamel.yaml.comments import CommentedBase as _CommentedBase
    from ruamel.yaml.representer import RoundTripRepresenter as _RTRepr
    from ruamel.yaml.scalarstring import DoubleQuotedScalarString as _DQ

    class _KoosRepresenter(_RTRepr):
        """Schreibt None als `null` — ruamel ließe das Feld sonst leer."""

    _KoosRepresenter.add_representer(
        type(None),
        lambda self, d: self.represent_scalar("tag:yaml.org,2002:null", "null"),
    )

    class _OrgaRepresenter(_RTRepr):
        """orga.yaml schreibt None als `~` — so steht es dort."""

    _OrgaRepresenter.add_representer(
        type(None),
        lambda self, d: self.represent_scalar("tag:yaml.org,2002:null", "~"),
    )
    RUNDTRIP_VERFUEGBAR = True
except ImportError:                                     # pragma: no cover
    _CommentedBase = ()                                 # type: ignore[assignment]
    RUNDTRIP_VERFUEGBAR = False

# ── In-Memory-Cache ───────────────────────────────────────────────────────────
# Kein TTL — Cache wird ausschließlich nach expliziten Schreiboperationen
# durch cache_invalidieren() geleert. So gibt es keine zeitabhängige Stale-Data.
_CACHE: dict[str, Any] = {}


def _cache_get(key: str) -> Any | None:
    return _CACHE.get(key)


def _cache_set(key: str, val: Any) -> None:
    _CACHE[key] = val


def cache_invalidieren() -> None:
    """Leert den gesamten Cache — nach Schreiboperationen aufrufen."""
    _CACHE.clear()


# ── YAML-Ausgabe ──────────────────────────────────────────────────────────────
# Einzige Stelle, an der Frontmatter serialisiert wird. yaml.dump() bricht ohne
# width-Angabe bei 80 Zeichen um und faltet lange Werte auf Folgezeilen. Der
# Bestand ist unumbrochen geschrieben; ohne width formatiert die erste Speicherung
# über die Oberfläche 433 Prozesse und 293 Datenarten um — semantisch gleich, im
# Diff aber nicht mehr von einer echten Änderung zu unterscheiden.
_YAML_WIDTH = 10 ** 6


_SEQ_RE = re.compile(r"^(\s*)-\s")


def listenstil(frontmatter: str) -> tuple[int, int]:
    """Ermittelt, wie weit Listen in dieser Datei eingerückt sind.

    ruamel kennt nur eine Einrückung für das ganze Dokument, kein Merkmal des
    einzelnen Knotens. Der Bestand ist uneinheitlich: die Generatoren schreiben
    `- eintrag` auf Höhe des Schlüssels, von Hand geschriebene Dateien
    `  - eintrag` darunter. Gemessen wird deshalb je Datei.

    Gezählt wird nur die erste Zeile einer Liste — erkennbar daran, dass die
    Zeile davor mit einem Doppelpunkt endet. Folgezeilen eines Listeneintrags
    ("  aufgabe: …") sind keine Schlüsselzeilen und verfälschen sonst das Bild.

    Rückgabe: (sequence, offset) für ruamels indent().
    """
    zeilen = frontmatter.splitlines()
    treffer: dict[int, int] = {}
    for i, zeile in enumerate(zeilen):
        m = _SEQ_RE.match(zeile)
        if not m:
            continue
        j = i - 1
        while j >= 0 and (not zeilen[j].strip() or zeilen[j].lstrip().startswith("#")):
            j -= 1
        if j < 0:
            continue
        vor = zeilen[j].rstrip()
        if not vor.endswith(":"):
            continue
        abstand = len(m.group(1)) - (len(vor) - len(vor.lstrip()))
        if abstand < 0:
            continue
        treffer[abstand] = treffer.get(abstand, 0) + 1
    if not treffer:
        return (2, 0)
    haeufigster = max(treffer.items(), key=lambda x: (x[1], -x[0]))[0]
    return (haeufigster + 2, haeufigster)


def _rundtrip(stil: tuple[int, int] = (2, 0)):
    """Konfigurierter ruamel-Parser. `stil` kommt aus listenstil() und hält die
    Einrückung der jeweiligen Datei ein."""
    y = _RuamelYAML()
    y.Representer = _KoosRepresenter
    y.preserve_quotes = True
    y.width = _YAML_WIDTH
    y.indent(mapping=2, sequence=stil[0], offset=stil[1])
    return y


def _rundtrip_orga():
    """orga.yaml ist anders geschrieben als die .md-Dateien: Listen eingerückt
    (`  - id:` unter `einheiten:`) und None als `~`. Ein eigener Schreiber, damit
    die Datei bleibt, wie sie ist."""
    y = _RuamelYAML()
    y.Representer = _OrgaRepresenter
    y.preserve_quotes = True
    y.width = _YAML_WIDTH
    y.indent(mapping=2, sequence=4, offset=2)
    return y


def yaml_dump(obj: Any) -> str:
    """Serialisiert ein Dict als YAML — ohne Zeilenumbruch, ohne Umsortierung.

    Stammt das Objekt aus rt_frontmatter(), wird es mit ruamel geschrieben und
    behält Kommentare und Schreibweisen; sonst über PyYAML wie bisher.
    """
    if RUNDTRIP_VERFUEGBAR and isinstance(obj, _CommentedBase):
        # Der Stil hängt an der Struktur, seit rt_frontmatter() ihn dort vermerkt
        stil = getattr(obj, "_koos_stil", (2, 0))
        puffer = io.StringIO()
        _rundtrip(stil).dump(obj, puffer)
        return puffer.getvalue()
    return yaml.dump(
        obj,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=_YAML_WIDTH,
    )


def body_trenner(text: str) -> str:
    """Gibt die Leerzeilen zurück, die im Original zwischen dem schließenden
    `---` und dem Body stehen. Der Bestand ist darin uneinheitlich — 409
    Prozesse haben keine Leerzeile, 354 eine, die Datenarten durchgehend eine.
    Ohne diese Erhaltung verschöbe jede Speicherung die Trennung."""
    m = _FM_RE.match(text)
    if not m:
        return "\n"
    rest = text[m.end():]
    zeilenumbrueche = len(rest) - len(rest.lstrip("\n"))
    return "\n" * max(0, zeilenumbrueche - 1)


def roh_body(text: str) -> str:
    """Gibt den Body zeichengetreu zurück — anders als parse_frontmatter(), das
    ihn beschneidet. Die Leerzeilen davor liefert body_trenner(), die dahinter
    bleiben hier stehen. 300 Prozesse enden mit Leerzeilen; ohne diese Funktion
    verschwänden sie bei der ersten Speicherung."""
    m = _FM_RE.match(text)
    if not m:
        return text
    return text[m.end():].lstrip("\n")


def rt_frontmatter(text: str) -> tuple[Any, str]:
    """Wie parse_frontmatter(), aber für den Schreibweg: gibt die Metadaten als
    Round-Trip-Struktur zurück, damit Kommentare und Schreibweisen erhalten
    bleiben. Ohne ruamel identisch zu parse_frontmatter()."""
    if not RUNDTRIP_VERFUEGBAR:
        return parse_frontmatter(text)
    m = _FM_RE.match(text)
    if not m:
        return {}, text.strip()
    stil = listenstil(m.group(1))
    try:
        meta = _rundtrip(stil).load(m.group(1))
    except Exception:                                   # defekte Datei
        return parse_frontmatter(text)
    if meta is None:
        return {}, text[m.end():].strip()
    try:
        meta._koos_stil = stil          # yaml_dump() liest ihn dort wieder
    except AttributeError:
        pass
    return meta, text[m.end():].strip()


# ── Frontmatter ───────────────────────────────────────────────────────────────

_FM_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---", re.MULTILINE)


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """
    Trennt YAML-Frontmatter vom Body einer Markdown-Datei.
    Gibt (meta-dict, body-string) zurück.
    """
    m = _FM_RE.match(text)
    if not m:
        return {}, text.strip()
    meta = yaml.safe_load(m.group(1)) or {}
    body = text[m.end():].strip()
    return meta, body


# ── orga.yaml ─────────────────────────────────────────────────────────────────

def parse_orga_yaml(text: str) -> list[dict]:
    """
    Parst orga.yaml und gibt eine Liste von OE-Einheiten zurück.
    Entspricht parseOrgaYaml() in preview.html.
    """
    data = yaml.safe_load(text) or {}
    return [
        {
            "id":               e.get("id", ""),
            "name":             e.get("name", ""),
            "parent":           e.get("parent", None),
            "rollen":           e.get("rollen", []),
            "sonderfunktionen": e.get("sonderfunktionen", []),
            "hinweis":          e.get("hinweis", None),
        }
        for e in (data.get("einheiten") or [])
    ]


def orga_to_yaml(einheiten: list[dict]) -> str:
    """Serialisiert eine Liste von OE-Einheiten zurück nach YAML.

    Ohne Vorlage — erzeugt eine reine einheiten-Liste. Für das Speichern einer
    vorhandenen Datei ist orga_to_yaml_merge() zu verwenden.
    """
    return yaml_dump({"einheiten": einheiten})


def orga_to_yaml_merge(einheiten: list[dict], existing_path: "Path | None" = None) -> str:
    """Schreibt orga.yaml zurück, ohne den nicht-strukturierten Teil zu verlieren.

    orga_to_yaml() allein ersetzt die gesamte Datei durch die einheiten-Liste.
    Verloren gingen dabei:
      - der Kommentarkopf (17 Zeilen: Bedeutung von id, name, parent, rollen,
        sonderfunktionen, Rollenmodell, Hinweis zur Reorganisation)
      - der Schlüssel `name` auf oberster Ebene (Name der Verwaltung)
      - alle weiteren Schlüssel, die der Parser nicht führt

    Mit ruamel wird die Datei als Ganzes gelesen und nur die geänderte Einheit
    ersetzt. Dann bleiben auch die Trennkommentare INNERHALB der Liste stehen
    (Abschnitte wie "VERWALTUNGSLEITUNG" — 24 der 41 Kommentarzeilen).

    Ohne ruamel bleibt nur alles bis zur ersten Nicht-Kommentarzeile und jeder
    Schlüssel außer `einheiten`; die Trennkommentare gehen dann verloren.
    """
    if existing_path and existing_path.exists() and RUNDTRIP_VERFUEGBAR:
        text = existing_path.read_text(encoding="utf-8")
        rt = _rundtrip_orga()
        doc = rt.load(text)
        if isinstance(doc, dict) and isinstance(doc.get("einheiten"), list):
            liste = doc["einheiten"]
            nach_id = {e.get("id"): i for i, e in enumerate(liste)
                       if isinstance(e, dict)}
            for eintrag in einheiten:
                i = nach_id.get(eintrag.get("id"))
                if i is None:
                    liste.append(eintrag)
                    continue
                vorlage = liste[i]
                for k, v in eintrag.items():
                    _setze(vorlage, k, v)
                for k in [k for k in vorlage if k not in eintrag]:
                    del vorlage[k]
            behalten = {e.get("id") for e in einheiten}
            for i in range(len(liste) - 1, -1, -1):
                if isinstance(liste[i], dict) and liste[i].get("id") not in behalten:
                    del liste[i]
            puffer = io.StringIO()
            rt.dump(doc, puffer)
            return puffer.getvalue()

    # Rückfall ohne ruamel: Kommentarkopf und Fremdschlüssel retten
    kopf = ""
    rest: dict = {}
    if existing_path and existing_path.exists():
        text = existing_path.read_text(encoding="utf-8")
        zeilen = text.splitlines(keepends=True)
        i = 0
        while i < len(zeilen) and (zeilen[i].lstrip().startswith("#") or not zeilen[i].strip()):
            i += 1
        kopf = "".join(zeilen[:i])
        vorhanden = yaml.safe_load(text) or {}
        if isinstance(vorhanden, dict):
            rest = {k: v for k, v in vorhanden.items() if k != "einheiten"}

    ausgabe = kopf
    if rest:
        ausgabe += yaml_dump(rest) + "\n"
    ausgabe += yaml_dump({"einheiten": einheiten})
    return ausgabe


# ── prozesse/*.md ─────────────────────────────────────────────────────────────

def _parse_schritte_aus_body(body: str) -> list:
    """
    Parst Prozessschritte aus dem Markdown-Body.
    Format:  **01 Schrittname**
             *Beschreibung*
    """
    import re
    schritte = []
    teile = re.split(r'\n(?=\*\*\d+\s)', body)
    for teil in teile:
        header = re.match(r'^\*\*(\d+)\s+(.+?)\*\*', teil)
        if not header:
            continue
        name = header.group(2).strip()
        beschr_match = re.search(r'\*\*.*?\*\*\s*\n\*([^*]+)\*', teil)
        beschreibung = beschr_match.group(1).strip() if beschr_match else ""
        schritte.append({"name": name, "beschreibung": beschreibung})
    return schritte


def parse_prozess_md(dateiname: str, text: str) -> dict:
    """
    Parst eine Prozess-Markdown-Datei und gibt ein strukturiertes Dict zurück.
    Entspricht parseProzessMd() in preview.html.
    dateiname: Dateiname ohne .md-Endung, z. B. 'proc-33-008'
    """
    meta, body = parse_frontmatter(text)

    # Schritte aus Frontmatter (strukturiertes YAML) oder aus Markdown-Body
    schritte = meta.get("schritte") or []
    if not schritte and body:
        schritte = _parse_schritte_aus_body(body)

    return {
        "id":                 meta.get("id", dateiname),
        "_dateiname":         dateiname,
        "titel":              meta.get("titel", ""),
        "status":             meta.get("status", "aktiv"),
        "zustaendigeEinheit": (
            meta.get("zustaendigeEinheit")
            or meta.get("zuständige-einheit", "")
        ),
        "zustaendigeRolle":   (
            meta.get("zustaendigeRolle")
            or meta.get("zuständige-rolle", "")
        ),
        # Der Bestand führt zwei Formen: {einheit, aufgabe} (354 Dateien) und
        # {rolle, phase, aufgabe} (45 Dateien). Beide werden durchgereicht —
        # wer nur `einheit` liest, bekommt bei der zweiten Form einen leeren Wert,
        # verliert die Angabe aber nicht mehr beim Speichern.
        "beteiligte": [
            {
                "einheit": b.get("einheit", ""),
                "rolle":   b.get("rolle", ""),
                "phase":   str(b.get("phase", "")) if b.get("phase") is not None else "",
                "aufgabe": b.get("aufgabe", ""),
            }
            for b in (meta.get("beteiligte") or [])
        ],
        "daten":       meta.get("daten", {"input": [], "output": [], "datenspeicher": []}),
        "regelungen":  meta.get("regelungen", []),
        "leika_id":    meta.get("leika_id"),
        "ozg_id":      meta.get("ozg_id"),
        "schritte":    schritte,
        "letzte_aktualisierung": meta.get("letzte-aktualisierung", ""),
    }


def parse_prozess_body(text: str) -> str:
    """
    Gibt nur den Markdown-Body einer Prozess-Datei zurück (ohne Frontmatter).
    Nützlich für progressive Disclosure: Inhalt erst laden wenn wirklich benötigt.
    """
    _, body = parse_frontmatter(text)
    return body


def prozess_to_md(prozess: dict) -> str:
    """Serialisiert ein Prozess-Dict zurück als Markdown-Datei mit Frontmatter."""
    # _dateiname und body sind interne/gesondert behandelte Felder, nicht ins Frontmatter.
    # schritte werden ausschließlich im Markdown-Body geführt (## Prozessschritte), nicht
    # zusätzlich im Frontmatter — sonst entsteht eine Dublette bei jedem Round-Trip über
    # parse_prozess_md() (das schritte defensiv aus dem Body nachlädt, wenn im Frontmatter leer).
    _INTERN = {"_dateiname", "body", "schritte"}
    data = {k: v for k, v in prozess.items() if k not in _INTERN and not k.startswith("_")}
    if "letzte_aktualisierung" in data:
        data["letzte-aktualisierung"] = data.pop("letzte_aktualisierung")
    # leika_id/ozg_id sind optional — wenn nicht gesetzt, nicht als "null" ins YAML schreiben,
    # außer sie waren zuvor explizit vorhanden (dann bleibt der leere Zustand nachvollziehbar)
    frontmatter = yaml_dump(data)
    body = prozess.get("body", "")
    result = f"---\n{frontmatter}---\n"
    if body:
        result += f"\n{body}\n"
    return result


def _setze(meta: Any, key: str, val: Any) -> None:
    """Schreibt nur, wenn sich der Wert wirklich ändert.

    Der Grund ist die Schreibweise: Wird ein Feld neu zugewiesen, verliert es
    die Formatierung der Vorlage — Anführungszeichen, Einrückung der Liste,
    Kommentare am Wert. Bei einem unveränderten Feld wäre das eine Änderung
    ohne Anlass. Mit dieser Prüfung bleibt jede Datei, an der die Maske nichts
    ändert, Zeichen für Zeichen dieselbe."""
    if key in meta and meta[key] == val:
        return
    meta[key] = val


def _beteiligt_saeubern(b: dict) -> dict:
    """Bringt einen beteiligte-Eintrag in genau eine der beiden Formen des
    Bestands zurück: {einheit, aufgabe} oder {rolle, phase, aufgabe}.

    `aufgabe` bleibt auch leer erhalten — 343 Prozesse führen sie als leeren
    String; würde sie hier wegfallen, schriebe jede Speicherung diese Dateien
    um, ohne dass sich etwas geändert hätte. Ein Eintrag ohne einheit und ohne
    rolle trägt keine Aussage und fällt heraus."""
    if not isinstance(b, dict):
        return {}
    einheit = b.get("einheit") or ""
    rolle   = b.get("rolle") or ""
    aufgabe = b.get("aufgabe") or ""
    if einheit:
        return {"einheit": einheit, "aufgabe": aufgabe}
    if rolle:
        eintrag = {"rolle": rolle}
        if b.get("phase") not in (None, "", []):
            # phase als Text festschreiben, im Stil des Bestands (doppelte
            # Anführungszeichen). Ohne ruamel bleibt es ein einfacher String —
            # PyYAML quotet eine Einzelziffer ohnehin, damit sie Text bleibt.
            ph = str(b["phase"])
            eintrag["phase"] = _DQ(ph) if RUNDTRIP_VERFUEGBAR else ph
        eintrag["aufgabe"] = aufgabe
        return eintrag
    return {}


def prozess_to_md_merge(incoming: dict, existing_path: "Path | None" = None) -> str:
    """
    Sicherer Rund-Trip für Prozesse — Gegenstück zu daten_to_md_merge().

    Liest die vorhandene Datei und aktualisiert nur die Felder, die im
    incoming-Dict vorhanden sind. Damit bleiben erhalten:
      - body (Zweck, Prozessschritte, Herkunftszeile)
      - letzte-aktualisierung, ersetzt-durch, leika_id, ozg_id
      - alle weiteren Felder, die weder Parser noch Formularmaske kennen

    Hintergrund: prozess_to_md() schreibt genau das, was im Dict steht. Das Dict
    kommt aus formulardatenLesen() und enthält nur die Felder der Maske — alles
    andere fehlt und wäre nach dem Schreiben fort. Betroffen waren im Bestand
    u. a. letzte-aktualisierung (764 Dateien), leika_id (372), ozg_id, der
    Datenblock und der gesamte Markdown-Body.

    incoming: Dict wie es parse_prozess_md() oder das UI-Formular liefert.
    existing_path: Pfad zur vorhandenen .md-Datei (oder None für Neuanlage).
    """
    if existing_path and existing_path.exists():
        _roh = existing_path.read_text(encoding="utf-8")
        orig_meta, _ = rt_frontmatter(_roh)
        trenner = body_trenner(_roh)
        body = roh_body(_roh)          # zeichengetreu, samt Leerzeilen am Ende
    else:
        orig_meta, body, trenner = {}, "", "\n"

    _INTERN = {"_dateiname", "body", "schritte"}

    # Die Maske führt das Feld "datenarten", die Datei führt "daten". Ohne
    # Umsetzung entstünde ein Feld, das kein Parser liest, während "daten"
    # verschwindet. Sobald die Maske auf "daten" umgestellt ist, greift dieser
    # Zweig nicht mehr.
    if "datenarten" in incoming and "daten" not in incoming:
        vorhanden = orig_meta.get("daten") or {}
        orig_meta["daten"] = {
            "input":  vorhanden.get("input", []),
            "output": vorhanden.get("output", []),
            "datenspeicher": [
                x if isinstance(x, dict) else {"id": x}
                for x in (incoming.get("datenarten") or [])
            ],
        }

    for key, val in incoming.items():
        if key in _INTERN or key.startswith("_") or key == "datenarten":
            continue
        if key == "beteiligte":
            # Schutz: eine leere Liste löscht keine vorhandenen Einträge. Solange
            # die Maske eine der beiden Formen nicht anzeigen kann, wäre das kein
            # Löschbefehl, sondern ein Anzeigefehler.
            if not val and orig_meta.get("beteiligte"):
                continue
            val = [_beteiligt_saeubern(b) for b in (val or [])]
            val = [b for b in val if b]
        if key == "letzte_aktualisierung":
            key = "letzte-aktualisierung"
        _setze(orig_meta, key, val)

    # Body nur ersetzen, wenn das Formular ihn tatsächlich mitsendet.
    # Ein fehlendes body-Feld ist eine Nichtberührung, kein Löschbefehl.
    if "body" in incoming:
        # Nur ersetzen, wenn sich der Text wirklich ändert — sonst behält der
        # Body die Leerzeilen und den Zeilenabschluss der Vorlage.
        _neu = incoming["body"] or ""
        if _neu.strip() != body.strip():
            body = _neu + ("\n" if _neu and not _neu.endswith("\n") else "")

    orig_meta.pop("_dateiname", None)

    frontmatter = yaml_dump(orig_meta)
    result = f"---\n{frontmatter}---\n"
    if body:
        result += f"{trenner}{body}"
    return result


# ── Rechtsgrundlagen-Normalisierung ──────────────────────────────────────────

def _normalisiere_rechtsgrundlagen(werte: list) -> list[dict]:
    """
    Normalisiert rechtsgrundlagen – akzeptiert sowohl altes String-Format
    als auch neues Dict-Format und gibt einheitlich Dicts zurück.
    Altes Format:  "NBauO §63 (Baugenehmigungsverfahren)"
    Neues Format:  {"gesetz": "NBauO", "artikel": "§63", "titel": "..."}
    """
    ergebnis = []
    for eintrag in (werte or []):
        if isinstance(eintrag, dict):
            ergebnis.append({
                "gesetz":  eintrag.get("gesetz", ""),
                "artikel": eintrag.get("artikel", ""),
                "titel":   eintrag.get("titel", ""),
            })
        elif isinstance(eintrag, str):
            ergebnis.append({"gesetz": eintrag, "artikel": "", "titel": ""})
    return ergebnis


# ── daten/*.md ────────────────────────────────────────────────────────────────

def parse_daten_md(dateiname: str, text: str) -> dict:
    """
    Parst eine Daten-Markdown-Datei.
    Entspricht parseDatenMd() in preview.html.
    """
    meta, _ = parse_frontmatter(text)
    kl = meta.get("klassifizierung") or {}
    ab = kl.get("aufbewahrung") or {}
    return {
        "id":                 meta.get("id", dateiname),
        "_dateiname":         dateiname,
        "typ":                meta.get("typ", "datenspeicher"),
        "system":             meta.get("system", ""),
        "name":               meta.get("name", ""),
        # datenkategorie am 2026-08-15 entfallen (ADR 013)
        "zustaendigeEinheit": (
            meta.get("zustaendigeEinheit")
            or meta.get("zuständige-einheit", "")
        ),
        "schutzstufe":        kl.get("schutzstufe", ""),
        "schutzbedarf":       kl.get("schutzbedarf", ""),
        # Feld heisst seit dem 2026-08-12 vertraulichkeitsklasse (Vier-Achsen-Modell);
        # der alte Name kommt im Bestand nicht mehr vor. Fallback fuer Altdateien.
        "vertraulichkeit":    kl.get("vertraulichkeitsklasse", kl.get("vertraulichkeit", "")),
        "rechtsgrundlagen":   _normalisiere_rechtsgrundlagen(kl.get("rechtsgrundlagen", [])),
        "aufbewahrung": {
            "frist":   ab.get("frist", ""),
            "beginn":  ab.get("beginn", None),
            "hinweis": ab.get("hinweis", ""),
        },
        "definition": "",
        "inhalte":    [],
    }


def daten_to_md(daten: dict) -> str:
    """
    Serialisiert ein Daten-Dict zurück als Markdown-Datei mit Frontmatter.
    Rekonstruiert klassifizierung: Verschachtelung aus den flachen Feldern.
    Erhält body und alle ursprünglichen Felder (bpmn, tags, etc.) nicht –
    für einen sicheren Rund-Trip bitte daten_to_md_merge() verwenden.
    """
    # Felder die unter klassifizierung: gehören
    _KL_FELDER = {"schutzstufe", "schutzbedarf", "vertraulichkeit",
                  "rechtsgrundlagen", "aufbewahrung"}
    # Intern heisst das Feld weiter "vertraulichkeit"; in der Datei heisst es seit
    # dem 2026-08-12 "vertraulichkeitsklasse" (Vier-Achsen-Modell, ADR-Richtlinie).
    _KL_UMBENENNEN = {"vertraulichkeit": "vertraulichkeitsklasse"}
    # Felder die nur intern sind und nicht in die Datei sollen
    _INTERN = {"_dateiname", "definition", "inhalte"}

    meta: dict = {}
    kl: dict   = {}
    ab: dict   = {}

    for k, v in daten.items():
        if k in _INTERN or k.startswith("_"):
            continue
        elif k in _KL_FELDER:
            kl[_KL_UMBENENNEN.get(k, k)] = v
        elif k in ("aufbewahrungFrist", "aufbewahrungBeginn", "aufbewahrungHinweis"):
            # Flach-Felder aus dem Formular → in aufbewahrung: zusammenführen
            schluessel = k.replace("aufbewahrung", "").lower()  # Frist→frist etc.
            ab[schluessel] = v
        elif k == "zustaendigeEinheit":
            meta["zuständige-einheit"] = v
        else:
            meta[k] = v

    if ab:
        kl["aufbewahrung"] = ab
    if kl:
        # Rechtsgrundlagen normalisieren und leere Einträge bereinigen
        if "rechtsgrundlagen" in kl:
            rg_norm = _normalisiere_rechtsgrundlagen(kl["rechtsgrundlagen"])
            kl["rechtsgrundlagen"] = [
                {k2: v2 for k2, v2 in r.items() if v2}
                for r in rg_norm
            ] or None
        meta["klassifizierung"] = kl

    frontmatter = yaml_dump(meta)
    return f"---\n{frontmatter}---\n"


def daten_to_md_merge(incoming: dict, existing_path: "Path | None" = None) -> str:
    """
    Sicherer Rund-Trip: liest die vorhandene Datei und aktualisiert nur die
    Felder die im incoming-Dict vorhanden sind.  Damit bleiben erhalten:
      - body (Markdown-Text nach dem Frontmatter)
      - bpmn, tags, konvertiert-aus, letzte-aktualisierung
      - alle weiteren Felder die vom Parser nicht geparst werden

    incoming: Dict wie es parse_daten_md() oder das UI-Formular liefert.
    existing_path: Pfad zur vorhandenen .md-Datei (oder None für Neuanlage).
    """
    if existing_path and existing_path.exists():
        _roh = existing_path.read_text(encoding="utf-8")
        orig_meta, _ = rt_frontmatter(_roh)
        trenner = body_trenner(_roh)
        body = roh_body(_roh)          # zeichengetreu, samt Leerzeilen am Ende
    else:
        orig_meta, body, trenner = {}, "", "\n"

    # ── Direkte Top-Level-Felder ─────────────────────────────────────────
    for field in ("id", "typ", "system", "name"):
        val = incoming.get(field)
        if val is not None:
            _setze(orig_meta, field, val)

    # zustaendigeEinheit (camelCase aus Parser) → zuständige-einheit im YAML
    if "zustaendigeEinheit" in incoming:
        # Immer kanonische Schreibweise mit Umlaut verwenden
        _setze(orig_meta, "zuständige-einheit", incoming["zustaendigeEinheit"])
        orig_meta.pop("zustaendigeEinheit", None)  # Duplikat entfernen

    # ── klassifizierung: Block aktualisieren ─────────────────────────────
    kl = orig_meta.get("klassifizierung") or {}

    for field in ("schutzstufe", "schutzbedarf", "vertraulichkeit"):
        val = incoming.get(field)
        if val is not None:
            # Feldname in der Datei: vertraulichkeitsklasse (seit 2026-08-12).
            # Ohne die Umbenennung entstuende beim Speichern ein zweites Feld
            # "vertraulichkeit" neben dem bestehenden -- zwei Wahrheiten in einer Datei.
            _setze(kl, "vertraulichkeitsklasse" if field == "vertraulichkeit" else field, val)
    kl.pop("vertraulichkeit", None)   # Altfeld nicht stehen lassen

    if "rechtsgrundlagen" in incoming:
        rg_norm = _normalisiere_rechtsgrundlagen(incoming["rechtsgrundlagen"])
        _setze(kl, "rechtsgrundlagen", [
            {k: v for k, v in r.items() if v}  # leere Felder weglassen
            for r in rg_norm
        ] or None)

    # Aufbewahrung: entweder als Flat-Felder (aus Formular) oder als Dict
    ab = kl.get("aufbewahrung") or {}
    mapping = {
        "aufbewahrungFrist":   "frist",
        "aufbewahrungBeginn":  "beginn",
        "aufbewahrungHinweis": "hinweis",
    }
    has_flat = any(k in incoming for k in mapping)
    if has_flat:
        for flat_key, yaml_key in mapping.items():
            val = incoming.get(flat_key)
            if val is not None:
                _setze(ab, yaml_key, val)
    elif isinstance(incoming.get("aufbewahrung"), dict):
        for yaml_key in ("frist", "beginn", "hinweis"):
            val = incoming["aufbewahrung"].get(yaml_key)
            if val is not None:
                ab[yaml_key] = val
    # Leere Felder in aufbewahrung weglassen
    ab_clean = {k: v for k, v in ab.items() if v not in (None, "")}
    if ab_clean:
        _setze(kl, "aufbewahrung", ab_clean)
    elif "aufbewahrung" in kl and not kl["aufbewahrung"]:
        # Vorhandene leere aufbewahrung entfernen
        del kl["aufbewahrung"]

    _setze(orig_meta, "klassifizierung", kl)

    # ── Interne und abgeleitete Felder entfernen ──────────────────────────
    for drop in ("_dateiname", "definition", "inhalte",
                 "schutzstufe", "schutzbedarf", "vertraulichkeit",
                 "rechtsgrundlagen", "aufbewahrung",
                 "aufbewahrungFrist", "aufbewahrungBeginn", "aufbewahrungHinweis",
                 "zustaendigeEinheit"):  # camelCase-Duplikat entfernen
        orig_meta.pop(drop, None)

    # ── Ausgabe ───────────────────────────────────────────────────────────
    frontmatter = yaml_dump(orig_meta)
    result = f"---\n{frontmatter}---\n"
    if body:
        result += f"{trenner}{body}"
    return result


# ── vvt/*.md ──────────────────────────────────────────────────────────────────

def _id_liste(werte: list) -> list[str]:
    """Normalisiert eine Liste von {id: x}-Dicts oder rohen Strings zu Strings."""
    ergebnis = []
    for eintrag in (werte or []):
        if isinstance(eintrag, dict):
            eid = eintrag.get("id", "")
            if eid:
                ergebnis.append(eid)
        elif isinstance(eintrag, str) and eintrag:
            ergebnis.append(eintrag)
    return ergebnis


def parse_vvt_md(dateiname: str, text: str) -> dict:
    """
    Parst eine VVT-Markdown-Datei (vvt-<uid>.md) und gibt ein strukturiertes
    Dict zurück. Analog zu parse_daten_md()/parse_prozess_md().
    """
    meta, body = parse_frontmatter(text)
    return {
        "id":                     meta.get("id", dateiname),
        "_dateiname":             dateiname,
        "uid":                    str(meta.get("uid", "")),
        "titel":                  meta.get("titel", ""),
        "status":                 meta.get("status", "aktiv"),
        "organisationseinheit":   meta.get("organisationseinheit", ""),
        "zweck":                  meta.get("zweck", ""),
        "rechtsgrundlage":        meta.get("rechtsgrundlage", ""),
        "kategorien_betroffener": meta.get("kategorien_betroffener", ""),
        "kategorien_daten":       meta.get("kategorien_daten", ""),
        "datenspeicher":          _id_liste(meta.get("datenspeicher")),
        "empfaenger":             meta.get("empfaenger", ""),
        "transfer_drittland":     meta.get("transfer_drittland", ""),
        "loeschfrist":            meta.get("loeschfrist", ""),
        "tom":                    _id_liste(meta.get("tom")),
        "leika_id":               meta.get("leika_id"),
        "ozg_id":                 meta.get("ozg_id"),
        "software_verarbeitungsmittel": meta.get("software_verarbeitungsmittel", ""),
        "prozesse":               _id_liste(meta.get("prozesse")),
        "quelle_basis_id":        meta.get("quelle-basis-id"),
        "letzte_aktualisierung":  meta.get("letzte-aktualisierung", ""),
        "body":                   body,
    }


def lade_alle_vvt(vvt_dir: Path) -> list[dict]:
    """Liest alle *.md-Dateien aus vvt/ und gibt eine sortierte Liste zurück."""
    key = f"vvt:{vvt_dir}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    ergebnisse = []
    if not vvt_dir.is_dir():
        return ergebnisse
    for datei in vvt_dir.glob("*.md"):
        text = datei.read_text(encoding="utf-8")
        ergebnisse.append(parse_vvt_md(datei.stem, text))
    ergebnisse.sort(key=lambda v: v["uid"])
    _cache_set(key, ergebnisse)
    return ergebnisse


# Schutzstufen-Rangfolge nach LfD Niedersachsen (A niedrigste, E höchste)
_SCHUTZSTUFE_RANG = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}


def leite_schutzstufe_ab(vvt_eintrag: dict, alle_daten: list[dict]) -> dict:
    """
    Leitet die Schutzstufe eines VVT-Eintrags aus den verknüpften dstore-*
    ab (Mischbestandsregel 3.5.1 der Richtlinie zur Datenklassifizierung:
    höchste enthaltene Stufe gilt für das gesamte Objekt — Maximum-Regel).
    Liest die Schutzstufe NICHT vom VVT-Eintrag selbst — der VVT-Eintrag
    trägt keine eigene Schutzstufe, sie wird stets abgeleitet.
    """
    daten_by_id = {d["id"]: d for d in alle_daten}
    gefunden: list[dict] = []
    fehlend: list[str] = []
    for ds_id in vvt_eintrag.get("datenspeicher", []):
        d = daten_by_id.get(ds_id)
        if d is None:
            fehlend.append(ds_id)
        else:
            gefunden.append(d)

    stufen = [d.get("schutzstufe") for d in gefunden if d.get("schutzstufe") in _SCHUTZSTUFE_RANG]
    if stufen:
        max_stufe = max(stufen, key=lambda s: _SCHUTZSTUFE_RANG[s])
    else:
        max_stufe = None

    return {
        "schutzstufe_abgeleitet": max_stufe,
        "aus_dstore": [d["id"] for d in gefunden if d.get("schutzstufe") == max_stufe] if max_stufe else [],
        "dstore_ohne_schutzstufe": [d["id"] for d in gefunden if d.get("schutzstufe") not in _SCHUTZSTUFE_RANG],
        "dstore_nicht_gefunden": fehlend,
    }


def validiere_vvt_referenzen(vvt_eintrag: dict, alle_prozesse: list[dict], alle_daten: list[dict]) -> dict:
    """
    Prüft, ob die in prozesse: und datenspeicher: referenzierten IDs
    tatsächlich existierende proc-*/dstore-*-Dateien sind ("verwaiste
    Referenzen"). Reine Prüfung, keine Änderung.
    """
    prozess_ids = {p["id"] for p in alle_prozesse}
    daten_ids   = {d["id"] for d in alle_daten}

    verwaiste_prozesse = [pid for pid in vvt_eintrag.get("prozesse", []) if pid not in prozess_ids]
    verwaiste_daten     = [did for did in vvt_eintrag.get("datenspeicher", []) if did not in daten_ids]

    return {
        "gueltig": not verwaiste_prozesse and not verwaiste_daten,
        "verwaiste_prozesse": verwaiste_prozesse,
        "verwaiste_datenspeicher": verwaiste_daten,
    }


def vvt_to_md(vvt: dict) -> str:
    """Serialisiert ein VVT-Dict zurück als Markdown-Datei mit Frontmatter."""
    _INTERN = {"_dateiname", "body"}
    meta = {k: v for k, v in vvt.items() if k not in _INTERN and not k.startswith("_")}

    if "datenspeicher" in meta:
        meta["datenspeicher"] = [{"id": x} for x in meta["datenspeicher"]]
    if "prozesse" in meta:
        meta["prozesse"] = list(meta["prozesse"])
    if "quelle_basis_id" in meta:
        meta["quelle-basis-id"] = meta.pop("quelle_basis_id")
    if "letzte_aktualisierung" in meta:
        meta["letzte-aktualisierung"] = meta.pop("letzte_aktualisierung")

    frontmatter = yaml_dump(meta)
    body = vvt.get("body", "")
    result = f"---\n{frontmatter}---\n"
    if body:
        result += f"\n{body}\n"
    return result


# ── regelungen/*.md ──────────────────────────────────────────────────────────

def parse_regelung_md(dateiname: str, text: str) -> dict:
    """
    Parst eine Regelungs-Markdown-Datei (reg-*.md).
    Liest Frontmatter + den vollständigen Markdown-Body für die KI-Suche.
    """
    meta, body = parse_frontmatter(text)
    return {
        "id":                 meta.get("id", dateiname),
        "_dateiname":         dateiname,
        "name":               meta.get("name", ""),
        "typ":                meta.get("typ", ""),
        "status":             meta.get("status", "aktiv"),
        "datum":              meta.get("datum", ""),
        "entscheidendesGremium": meta.get("entscheidendes-gremium", ""),
        "zustaendigeEinheit": (
            meta.get("zustaendigeEinheit")
            or meta.get("zuständige-einheit", "")
        ),
        "body":               body,
    }


def regelung_to_md_merge(incoming: dict, existing_path: "Path | None" = None) -> str:
    """
    Sicherer Rund-Trip für Regelungen — Gegenstück zu daten_to_md_merge().

    Der bisherige PUT in routers/regelungen.py hatte keinen Merge: er schrieb
    yaml.dump(clean) + body und ersetzte damit das gesamte Frontmatter durch die
    neun Felder der Formularmaske. Verloren gingen dabei u. a. `ersetzt`, das
    beide Parser lesen, sowie version, stand, reviewed_by, basierend_auf,
    verzahnt_mit, quellen, rechtsgrundlagen und bemerkung.

    Außerdem wird hier die Schreibweise des Gremiums zurückgesetzt: Die Maske
    führt `entscheidendesGremium` (camelCase), alle Parser lesen ausschließlich
    `entscheidendes-gremium`. Ohne diese Umsetzung wäre das Feld nach dem ersten
    Speichern für jeden Leser leer.
    """
    if existing_path and existing_path.exists():
        _roh = existing_path.read_text(encoding="utf-8")
        orig_meta, _ = rt_frontmatter(_roh)
        trenner = body_trenner(_roh)
        body = roh_body(_roh)          # zeichengetreu, samt Leerzeilen am Ende
    else:
        orig_meta, body, trenner = {}, "", "\n"

    _INTERN = {"_dateiname", "body"}
    _UMBENENNEN = {
        "entscheidendesGremium": "entscheidendes-gremium",
        "letzte_aktualisierung": "letzte-aktualisierung",
    }

    for key, val in incoming.items():
        if key in _INTERN or key.startswith("_"):
            continue
        key = _UMBENENNEN.get(key, key)
        _setze(orig_meta, key, val)

    # camelCase-Dublette entfernen, falls sie in der Datei liegt
    orig_meta.pop("entscheidendesGremium", None)

    if "body" in incoming:
        # Nur ersetzen, wenn sich der Text wirklich ändert — sonst behält der
        # Body die Leerzeilen und den Zeilenabschluss der Vorlage.
        _neu = incoming["body"] or ""
        if _neu.strip() != body.strip():
            body = _neu + ("\n" if _neu and not _neu.endswith("\n") else "")

    orig_meta.pop("_dateiname", None)

    frontmatter = yaml_dump(orig_meta)
    result = f"---\n{frontmatter}---\n"
    if body:
        result += f"{trenner}{body}"
    return result


# ── Bulk-Loader ───────────────────────────────────────────────────────────────

def lade_alle_prozesse(prozesse_dir: Path) -> list[dict]:
    """Liest alle *.md-Dateien aus prozesse/ und gibt eine sortierte Liste zurück."""
    key = f"prozesse:{prozesse_dir}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    ergebnisse = []
    if not prozesse_dir.is_dir():
        return ergebnisse
    for datei in prozesse_dir.glob("*.md"):
        text = datei.read_text(encoding="utf-8")
        ergebnisse.append(parse_prozess_md(datei.stem, text))
    ergebnisse.sort(key=lambda p: p["titel"].lower())
    _cache_set(key, ergebnisse)
    return ergebnisse


def filtere_felder(objekte: list[dict], fields: str | None) -> list[dict]:
    """
    Filtert eine Liste von Dicts auf die gewünschten Felder.
    fields: kommagetrennte Feldnamen, z. B. 'id,titel,zustaendigeEinheit'
    Interne Felder (mit _-Präfix) werden immer weggelassen.
    Ohne fields: alle Felder außer internen.
    """
    def _strip_intern(d: dict) -> dict:
        return {k: v for k, v in d.items() if not k.startswith("_")}

    if not fields:
        return [_strip_intern(o) for o in objekte]

    gewuenscht = {f.strip() for f in fields.split(",") if f.strip()}
    return [
        {k: v for k, v in o.items() if k in gewuenscht}
        for o in objekte
    ]


def lade_alle_regelungen(regelungen_dir: Path) -> list[dict]:
    """Liest alle *.md-Dateien aus regelungen/ und gibt eine sortierte Liste zurück."""
    key = f"regelungen:{regelungen_dir}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    ergebnisse = []
    if not regelungen_dir.is_dir():
        return ergebnisse
    for datei in regelungen_dir.glob("*.md"):
        text = datei.read_text(encoding="utf-8")
        ergebnisse.append(parse_regelung_md(datei.stem, text))
    ergebnisse.sort(key=lambda r: r["name"].lower())
    _cache_set(key, ergebnisse)
    return ergebnisse


def lade_alle_daten(daten_dir: Path) -> list[dict]:
    """Liest alle *.md-Dateien aus daten/ und gibt eine sortierte Liste zurück."""
    key = f"daten:{daten_dir}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    ergebnisse = []
    if not daten_dir.is_dir():
        return ergebnisse
    for datei in daten_dir.glob("*.md"):
        text = datei.read_text(encoding="utf-8")
        ergebnisse.append(parse_daten_md(datei.stem, text))
    ergebnisse.sort(key=lambda d: d["name"].lower())
    _cache_set(key, ergebnisse)
    return ergebnisse

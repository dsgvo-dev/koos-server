"""
KOOS Server – Parser
Python-Ports der JavaScript-Parser aus preview.html.
Wandelt YAML- und Markdown-Dateien in strukturierte Dictionaries um.
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Any
import yaml

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
    """Serialisiert eine Liste von OE-Einheiten zurück nach YAML."""
    return yaml.dump(
        {"einheiten": einheiten},
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    )


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
        "beteiligte": [
            {"einheit": b.get("einheit", ""), "aufgabe": b.get("aufgabe", "")}
            for b in (meta.get("beteiligte") or [])
        ],
        "daten":       meta.get("daten", {"input": [], "output": [], "datenspeicher": []}),
        "regelungen":  meta.get("regelungen", []),
        "schritte":    schritte,
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
    # _dateiname ist internes Feld, nicht in die Datei schreiben
    data = {k: v for k, v in prozess.items() if not k.startswith("_")}
    frontmatter = yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)
    return f"---\n{frontmatter}---\n"


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
        "datenkategorie":     meta.get("datenkategorie", ""),
        "zustaendigeEinheit": (
            meta.get("zustaendigeEinheit")
            or meta.get("zuständige-einheit", "")
        ),
        "schutzstufe":        kl.get("schutzstufe", ""),
        "schutzbedarf":       kl.get("schutzbedarf", ""),
        "vertraulichkeit":    kl.get("vertraulichkeit", ""),
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
    # Felder die nur intern sind und nicht in die Datei sollen
    _INTERN = {"_dateiname", "definition", "inhalte"}

    meta: dict = {}
    kl: dict   = {}
    ab: dict   = {}

    for k, v in daten.items():
        if k in _INTERN or k.startswith("_"):
            continue
        elif k in _KL_FELDER:
            kl[k] = v
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

    frontmatter = yaml.dump(meta, allow_unicode=True, default_flow_style=False, sort_keys=False)
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
        orig_meta, body = parse_frontmatter(existing_path.read_text(encoding="utf-8"))
    else:
        orig_meta, body = {}, ""

    # ── Direkte Top-Level-Felder ─────────────────────────────────────────
    for field in ("id", "typ", "system", "name", "datenkategorie"):
        val = incoming.get(field)
        if val is not None:
            orig_meta[field] = val

    # zustaendigeEinheit (camelCase aus Parser) → zuständige-einheit im YAML
    if "zustaendigeEinheit" in incoming:
        # Immer kanonische Schreibweise mit Umlaut verwenden
        orig_meta["zuständige-einheit"] = incoming["zustaendigeEinheit"]
        orig_meta.pop("zustaendigeEinheit", None)  # Duplikat entfernen

    # ── klassifizierung: Block aktualisieren ─────────────────────────────
    kl = orig_meta.get("klassifizierung") or {}

    for field in ("schutzstufe", "schutzbedarf", "vertraulichkeit"):
        val = incoming.get(field)
        if val is not None:
            kl[field] = val

    if "rechtsgrundlagen" in incoming:
        rg_norm = _normalisiere_rechtsgrundlagen(incoming["rechtsgrundlagen"])
        kl["rechtsgrundlagen"] = [
            {k: v for k, v in r.items() if v}  # leere Felder weglassen
            for r in rg_norm
        ] or None

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
                ab[yaml_key] = val
    elif isinstance(incoming.get("aufbewahrung"), dict):
        for yaml_key in ("frist", "beginn", "hinweis"):
            val = incoming["aufbewahrung"].get(yaml_key)
            if val is not None:
                ab[yaml_key] = val
    # Leere Felder in aufbewahrung weglassen
    ab_clean = {k: v for k, v in ab.items() if v not in (None, "")}
    if ab_clean:
        kl["aufbewahrung"] = ab_clean
    elif "aufbewahrung" in kl and not kl["aufbewahrung"]:
        # Vorhandene leere aufbewahrung entfernen
        del kl["aufbewahrung"]

    orig_meta["klassifizierung"] = kl

    # ── Interne und abgeleitete Felder entfernen ──────────────────────────
    for drop in ("_dateiname", "definition", "inhalte",
                 "schutzstufe", "schutzbedarf", "vertraulichkeit",
                 "rechtsgrundlagen", "aufbewahrung",
                 "aufbewahrungFrist", "aufbewahrungBeginn", "aufbewahrungHinweis",
                 "zustaendigeEinheit"):  # camelCase-Duplikat entfernen
        orig_meta.pop(drop, None)

    # ── Ausgabe ───────────────────────────────────────────────────────────
    frontmatter = yaml.dump(
        orig_meta, allow_unicode=True, default_flow_style=False, sort_keys=False
    )
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
        "kontext":            (meta.get("kontext") or "").strip(),
        "entscheidung":       (meta.get("entscheidung") or "").strip(),
        "body":               body,
    }


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

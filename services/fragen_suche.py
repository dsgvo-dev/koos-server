"""
KOOS – Fragen-Suche (Plan 2026-10-02 „Fragen an KOOS ohne KI“, Roadmap B13)

Findet zu einer Frage in natürlicher Sprache die passenden Prozesse,
Datenspeicher und Regelungen — ohne Sprachmodell.

  1. Suchwörter: Wörter ab 4 Buchstaben ohne Frage- und Füllwörter
  2. Wortstamm: häufige Endungen abschneiden („Wohnsitzes“ → „wohnsitz“)
  3. Punktwert: Titel/Name 3, ID 2, Prozessschritte/Datenspeicher 1;
     mindestens ein Treffer in Titel/Name oder ID nötig;
     Bonus, wenn alle Suchwörter getroffen sind
  4. Je Art nur Treffer ab der Hälfte des besten Punktwerts
  5. Nur Prozesse mit Status „aktiv“ (ersetzte erscheinen über ihren Nachfolger)

Wird vom Endpunkt GET /api/fragen und vom KI-Modus (_lade_kontext) genutzt.
"""
from __future__ import annotations
import re

import config
from services import parser

_STOPPWÖRTER = {
    # Fragewörter, Artikel, Füllwörter
    "wie", "wird", "eine", "einen", "einem", "einer", "eines", "ein", "der", "die",
    "das", "den", "dem", "des", "und", "oder", "aber", "auch", "sich", "ist", "sind",
    "was", "wer", "wann", "warum", "wieso", "wo", "welche", "welcher", "welches",
    "welchen", "welchem", "kann", "können", "muss", "müssen", "soll", "sollen",
    "darf", "werden", "wurde", "wurden", "haben", "hat", "hatte", "beim", "für",
    "mit", "von", "aus", "nach", "über", "unter", "bitte", "gibt", "geben", "gibts",
    "zur", "zum", "dazu", "diese", "dieser", "dieses", "diesen", "alle", "allen",
    "mir", "uns", "unser", "unsere", "unseren", "man", "mich", "dort", "hier",
    "etwas", "einmal", "noch", "schon", "denn", "doch", "mal", "dann", "wenn",
    "zeige", "zeig", "zeigen", "finde", "finden", "suche", "suchen", "nenne",
    "nennen", "liste", "erkläre", "erklären", "beschreibe", "beschreiben",
    # Wörter über die Frage statt über den Inhalt
    "prozess", "prozesse", "prozesses", "prozessen", "ablauf", "abläufe",
    "läuft", "abläuft", "funktioniert", "aussehen", "aussieht", "sieht",
    "datenspeicher", "daten", "regelung", "regelungen", "vorgang", "verfahren",
    "zuständig", "zuständige", "zuständigen", "bearbeitet", "bearbeiten",
    "nutzt", "nutzen", "genutzt", "verwendet", "verwenden", "benutzt",
    "kommune", "verwaltung", "gemeinde", "stadt", "musterkommune", "gilt", "gelten",
}

_ENDUNGEN = ("ungen", "ung", "en", "es", "er", "e", "s", "n")
_UMLAUTE = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})


def _stamm(wort: str) -> str:
    for endung in _ENDUNGEN:
        if wort.endswith(endung) and len(wort) - len(endung) >= 4:
            return wort[: -len(endung)]
    return wort


def suchwörter(frage: str) -> list[str]:
    """Wortstämme der bedeutsamen Wörter, ohne Doppelte, in Reihenfolge."""
    stämme: list[str] = []
    for w in re.findall(r"[a-zäöüß0-9]{4,}", frage.lower()):
        if w in _STOPPWÖRTER:
            continue
        s = _stamm(w)
        if s not in stämme:
            stämme.append(s)
    return stämme


def _bewerte(stämme: list[str], felder: list[tuple[str, int]]) -> float:
    """felder: (Text, Gewicht). Je Suchwort zählt das höchste getroffene Gewicht.
    Ohne Treffer in Titel/Name oder ID (Gewicht ≥ 2) ist der Punktwert 0 —
    ein Wort nur irgendwo in den Schritten ist zu unsicher."""
    punkte, getroffen, stark = 0.0, 0, False
    for s in stämme:
        varianten = {s, s.translate(_UMLAUTE)}
        bestes = 0
        for text, gewicht in felder:
            if gewicht > bestes and any(v in text for v in varianten):
                bestes = gewicht
        if bestes:
            punkte += bestes
            getroffen += 1
            stark = stark or bestes >= 2
    if not stark:
        return 0.0
    if getroffen == len(stämme) and len(stämme) > 1:
        punkte += 2
    return punkte


def _beste(liste: list[tuple[float, dict]], anzahl: int) -> list[dict]:
    liste = [t for t in liste if t[0] > 0]
    if not liste:
        return []
    höchster = max(p for p, _ in liste)
    liste = [t for t in liste if t[0] >= höchster / 2]
    liste.sort(key=lambda t: (-t[0], len(t[1].get("titel") or t[1].get("name") or "")))
    return [dict(eintrag, punkte=p) for p, eintrag in liste[:anzahl]]


def _oe_namen() -> dict[str, str]:
    if not config.ORGA_FILE.exists():
        return {}
    return {e["id"]: e["name"]
            for e in parser.parse_orga_yaml(config.ORGA_FILE.read_text(encoding="utf-8"))}


def _ds_ids(p: dict) -> list[str]:
    ds = (p.get("daten") or {}).get("datenspeicher") or []
    return [e.get("id", "") if isinstance(e, dict) else str(e) for e in ds if e]


def suche(frage: str, n_prozesse: int = 5, n_daten: int = 5, n_regelungen: int = 3) -> dict:
    stämme = suchwörter(frage)
    leer = {"frage": frage, "suchwoerter": stämme, "prozesse": [], "daten": [], "regelungen": []}
    if not stämme:
        return leer

    oe = _oe_namen()
    alle_d = parser.lade_alle_daten(config.DATEN_DIR)
    ds_name = {d["id"]: d.get("name", d["id"]) for d in alle_d}

    # Prozesse
    kandidaten = []
    for p in parser.lade_alle_prozesse(config.PROZESSE_DIR):
        # ersetzte und inaktive Prozesse nicht anzeigen — der Nachfolger erscheint selbst
        if p.get("status", "aktiv") != "aktiv":
            continue
        schritte = p.get("schritte") or []
        ids = _ds_ids(p)
        felder = [
            (p.get("titel", "").lower(), 3),
            (p.get("id", "").lower(), 2),
            (" ".join(f"{s.get('name','')} {s.get('beschreibung','')}" for s in schritte).lower(), 1),
            (" ".join(ds_name.get(i, i) for i in ids).lower(), 1),
        ]
        punkte = _bewerte(stämme, felder)
        kandidaten.append((punkte, {
            "id": p["id"],
            "titel": p.get("titel", p["id"]),
            "status": p.get("status", ""),
            "zustaendig": oe.get(p.get("zustaendigeEinheit", ""), p.get("zustaendigeEinheit", "")),
            "schritte": [{"name": s.get("name", ""), "beschreibung": s.get("beschreibung", "")}
                         for s in schritte],
            "datenspeicher": [{"id": i, "name": ds_name.get(i, i)} for i in ids],
        }))
    prozesse = _beste(kandidaten, n_prozesse)

    # Datenspeicher
    kandidaten = [
        (_bewerte(stämme, [(d.get("name", "").lower(), 3), (d.get("id", "").lower(), 2)]),
         {"id": d["id"], "name": d.get("name", d["id"]),
          "zustaendig": oe.get(d.get("zustaendigeEinheit", ""), d.get("zustaendigeEinheit", ""))})
        for d in alle_d
    ]
    daten = _beste(kandidaten, n_daten)

    # Regelungen: Volltext nur, wenn alle Suchwörter darin vorkommen
    kandidaten = []
    for r in parser.lade_alle_regelungen(config.REGELUNGEN_DIR):
        punkte = _bewerte(stämme, [(r.get("name", "").lower(), 3), (r.get("id", "").lower(), 2)])
        if not punkte and all(s in (r.get("body") or "").lower() for s in stämme):
            punkte = 1   # Volltext: nur wenn alle Suchwörter vorkommen
        kandidaten.append((punkte, {"id": r["id"], "name": r.get("name", r["id"]),
                                    "typ": r.get("typ", "")}))
    regelungen = _beste(kandidaten, n_regelungen)

    return {**leer, "prozesse": prozesse, "daten": daten, "regelungen": regelungen}

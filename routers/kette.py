"""
KOOS Server – Router: Datenschutzkette

GET /api/kette             → Übersicht über alle Verarbeitungstätigkeiten
GET /api/kette/{vvt_id}    → alle Ketten-Dateien einer Verarbeitungstätigkeit

Warum es diesen Router gibt: Die Kette liegt seit dem 2026-08-07 als JSON je
Verarbeitungstätigkeit im Datenverzeichnis, erzeugt von den Generatoren der
9-Schritte-Vorgehensweise. Der Server hat sie bisher nicht ausgeliefert. Die
Nexus-Oberfläche musste sich deshalb vom Webserver die Verzeichnisse auflisten
lassen und die Dateien einzeln holen — 1.615 Abrufe und 9,9 MB, und das
funktioniert nur hinter einem einfachen Dateiserver, nicht hinter dieser API.

Zwei Endpunkte statt einem: Die Übersicht trägt nur die Felder, die Listen und
Kennzahlen brauchen (gemessen 219 KB, gepackt 3 KB). Der vollständige Satz einer
Verarbeitungstätigkeit wird erst beim Öffnen geholt (Median 33 KB). Ein einziger
Sammelabruf über alles wäre 9,9 MB — davon allein 4 MB Bedrohungsdateien, die
nur das TOM-Modul einer einzelnen Tätigkeit braucht.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

import config

router = APIRouter(prefix="/api/kette", tags=["Datenschutzkette"])

# Gleiche Prüfung wie in prozesse.py, daten.py, regelungen.py und vvt.py.
# Sie hält Kennungen fern, die zu einem anderen Pfad führen könnten, und
# antwortet mit demselben Fehlerbild wie die übrigen Router.
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,126}$")

# Ordner, Dateipräfix und Name im Ergebnis. Die Reihenfolge entspricht den
# Schritten der Vorgehensweise; `bedrohungen`, `ergaenzend` und `baseline`
# liegen mit im Ordner tom/, tragen aber eigene Präfixe.
GRUPPEN: list[tuple[str, str, str]] = [
    ("besonderheiten", "bes-",         "bes"),
    ("risikoanalyse",  "risiko-",      "risiko"),
    ("schwellwert",    "schwellwert-", "schwellwert"),
    ("tom",            "tom-",         "tom"),
    ("tom",            "bedrohungen-", "bedrohungen"),
    ("tom",            "ergaenzend-",  "ergaenzend"),
    ("dsfa",           "dsfa-",        "dsfa"),
]

BASELINE = ("tom", "baseline-organisation.json")


def _lies(pfad: Path) -> dict | None:
    """Eine JSON-Datei lesen. Eine kaputte Datei darf den ganzen Abruf nicht
    umwerfen — sie fehlt dann in der Antwort, und das ist ein Befund, den die
    Oberfläche als 'keine Datei vorhanden' anzeigt."""
    try:
        return json.loads(pfad.read_text(encoding="utf-8"))
    except Exception:
        return None


def _vvt_id(daten: dict, dateiname: str, praefix: str) -> str:
    """Die Zuordnung steht im Feld vvt_referenz.vvt_id. Fehlt sie, trägt der
    Dateiname sie — so macht es auch die Oberfläche."""
    ref = (daten.get("vvt_referenz") or {}).get("vvt_id")
    return ref or dateiname[len(praefix):]


def _alle(ziel: str) -> dict[str, dict]:
    ordner, praefix = next((o, p) for o, p, z in GRUPPEN if z == ziel)
    verzeichnis = config.DATA_DIR / ordner
    if not verzeichnis.is_dir():
        return {}
    ergebnis: dict[str, dict] = {}
    for datei in sorted(verzeichnis.glob(praefix + "*.json")):
        d = _lies(datei)
        if d is None:
            continue
        ergebnis[_vvt_id(d, datei.stem, praefix)] = d
    return ergebnis


def _stand(o: dict | None) -> str | None:
    """Der Bearbeitungsstand steht je nach Generator unter meta.status oder
    direkt unter status."""
    if not o:
        return None
    return (o.get("meta") or {}).get("status") or o.get("status")


def _ids(liste) -> list[str]:
    """soll und ist führen teils Kennungen, teils {id, name}."""
    out = []
    for x in (liste or []):
        i = x.get("id") if isinstance(x, dict) else x
        if i:
            out.append(i)
    return out


@router.get("", summary="Übersicht der Datenschutzkette über alle Verarbeitungstätigkeiten")
def get_uebersicht() -> dict:
    """Nur die Felder, die Listen, Kettenanzeige und Kennzahlen brauchen —
    aber in der Verschachtelung der Quelldateien. Datei und Schnittstelle
    sprechen damit dieselbe Sprache: die Oberfläche liest denselben Pfad,
    gleich ob sie die Datei oder diesen Endpunkt vor sich hat. Wer den
    vollen Satz braucht, holt ihn je Verarbeitungstätigkeit."""
    roh = {z: _alle(z) for _, _, z in GRUPPEN}
    ids = sorted(set().union(*[set(v) for v in roh.values()])) if roh else []

    ueber: dict[str, dict] = {}
    for vid in ids:
        b, s, r = roh["bes"].get(vid), roh["schwellwert"].get(vid), roh["risiko"].get(vid)
        t, d = roh["tom"].get(vid), roh["dsfa"].get(vid)
        bd, e = roh["bedrohungen"].get(vid), roh["ergaenzend"].get(vid)
        eintrag: dict = {}
        if b:
            eintrag["bes"] = {
                "meta":   {"status": _stand(b)},
                "gesamt": {"schadenshoehe": (b.get("gesamt") or {}).get("schadenshoehe")},
            }
        if s:
            eintrag["schwellwert"] = {
                "meta": {"status": _stand(s)},
                "dsfa_pflicht_gesamt": s.get("dsfa_pflicht_gesamt"),
            }
        if r:
            eintrag["risiko"] = {
                "meta":                    {"status": _stand(r)},
                "basis_risiko":            r.get("basis_risiko"),
                "besonderheiten_referenz": r.get("besonderheiten_referenz"),
            }
        if t:
            eintrag["tom"] = {
                "status": t.get("status"),
                "delta":  t.get("delta"),
                "soll":   _ids(t.get("soll")),
                "ist":    _ids(t.get("ist")),
            }
        if d:
            eintrag["dsfa"] = {
                "meta":     {"status": _stand(d)},
                "ergebnis": {"bewertung": (d.get("ergebnis") or {}).get("bewertung")},
            }
        if bd:
            eintrag["bedrohungen"] = {
                "threats_anzahl": len(bd.get("threats") or []),
                "gb_immer":       bd.get("gb_immer"),
                "vb_bedingt":     bd.get("vb_bedingt"),
            }
        if e:
            eintrag["ergaenzend"] = {
                "anzahl_zusatz": e.get("anzahl_zusatz"),
                "restrisiko":    {"bewertung": (e.get("restrisiko") or {}).get("bewertung")},
            }
        ueber[vid] = eintrag
    return ueber


@router.get("/{vvt_id}", summary="Vollständige Datenschutzkette einer Verarbeitungstätigkeit")
def get_kette(vvt_id: str) -> dict:
    if not _ID_RE.match(vvt_id):
        raise HTTPException(400, detail=f"Ungültige Kennung: {vvt_id!r}")

    ergebnis: dict = {}
    for ordner, praefix, ziel in GRUPPEN:
        datei = config.DATA_DIR / ordner / f"{praefix}{vvt_id}.json"
        ergebnis[ziel] = _lies(datei) if datei.exists() else None

    bl = config.DATA_DIR / BASELINE[0] / BASELINE[1]
    ergebnis["baseline"] = _lies(bl) if bl.exists() else None

    if not any(ergebnis.get(z) for _, _, z in GRUPPEN):
        raise HTTPException(
            404,
            detail=f"Keine Ketten-Datei zu '{vvt_id}' gefunden. "
                   f"Erwartet werden bes-{vvt_id}.json, risiko-{vvt_id}.json und weitere.",
        )
    return ergebnis

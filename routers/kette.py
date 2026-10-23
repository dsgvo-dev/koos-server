"""
KOOS Server – Router: Datenschutzkette

GET /api/kette             → Übersicht über alle Verarbeitungstätigkeiten
GET /api/kette/{vvt_id}    → alle Ketten-Dateien einer Verarbeitungstätigkeit
PUT /api/kette/{vvt_id}/tom/umsetzung → Umsetzungsstand der Maßnahmen einer VVT
PUT /api/kette/_baseline/umsetzung    → Umsetzungsstand der organisationsweiten Maßnahmen

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

from datetime import date

from fastapi import APIRouter, HTTPException, Request

import config
from services import git_service, parser

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
                "bearbeitet": bool(t.get("bearbeitet")),
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


# ── Umsetzungsstand der Maßnahmen (PLAN-2026-10-23, Stufe 4, TOM) ─────────────
# Je Maßnahme: status (offen | in_bearbeitung | umgesetzt | nicht_anwendbar)
# und notiz — die Planung aus DS-TOM. Daraus gerechnet: ist, delta, status
# (tom-vvt) bzw. umsetzungsstatus (Baseline). Dieselbe Rechnung steht in
# dsms-knowledge/scripts/kette_schutz.py; die Generatoren übernehmen den
# Stand damit bei jedem Lauf. Das Feld `bearbeitet` markiert die Datei als in
# Nexus gepflegt (Entscheidung „Bearbeitet = gesperrt“, Plan § 13).
_UMSETZUNG_STATUS = ("offen", "in_bearbeitung", "umgesetzt", "nicht_anwendbar")


def _umsetzung_uebernehmen(daten: dict, eingabe, erlaubt: list[str]) -> None:
    if not isinstance(eingabe, dict) or not eingabe:
        raise HTTPException(422, detail="massnahmen fehlt: {Maßnahmen-ID: {status, notiz}}")
    unbekannt = [i for i in eingabe if i not in erlaubt]
    if unbekannt:
        raise HTTPException(422, detail=f"Nicht im Plan dieser Datei: {', '.join(unbekannt[:10])}")
    um = dict(daten.get("umsetzung") or {})
    for mid, e in eingabe.items():
        if not isinstance(e, dict):
            raise HTTPException(422, detail=f"{mid}: erwartet {{status, notiz}}")
        st = e.get("status", "offen")
        if st not in _UMSETZUNG_STATUS:
            raise HTTPException(422, detail=f"{mid}: Status {st!r} unbekannt (erlaubt: {', '.join(_UMSETZUNG_STATUS)})")
        notiz = (e.get("notiz") or "").strip()
        if len(notiz) > 2000:
            raise HTTPException(422, detail=f"{mid}: Notiz länger als 2000 Zeichen")
        alt = um.get(mid) or {}
        if st == "offen" and not notiz:
            um.pop(mid, None)
        elif alt.get("status") != st or (alt.get("notiz") or "") != notiz:
            um[mid] = {"status": st, **({"notiz": notiz} if notiz else {}), "am": date.today().isoformat()}
    daten["umsetzung"] = um


def _tom_rechnen(daten: dict) -> None:
    soll = _ids(daten.get("soll"))
    um = daten.get("umsetzung") or {}
    st = lambda i: (um.get(i) or {}).get("status", "offen")
    daten["ist"] = [i for i in soll if st(i) == "umgesetzt"]
    daten["delta"] = sum(1 for i in soll if st(i) not in ("umgesetzt", "nicht_anwendbar"))
    # status: in Arbeit, sobald irgendeine Planzeile nicht mehr offen ist —
    # auch eine zusätzlich empfohlene Maßnahme (ergänzende Analyse)
    if not any((e or {}).get("status", "offen") != "offen" for e in um.values()):
        daten["status"] = "offen"
    else:
        daten["status"] = "abgeschlossen" if daten["delta"] == 0 else "in_bearbeitung"


def _baseline_rechnen(daten: dict) -> None:
    ids = _ids(daten.get("toms"))
    um = daten.get("umsetzung") or {}
    st = lambda i: (um.get(i) or {}).get("status", "offen")
    if not any(st(i) != "offen" for i in ids):
        daten["umsetzungsstatus"] = "zu_pruefen"
    elif all(st(i) in ("umgesetzt", "nicht_anwendbar") for i in ids):
        daten["umsetzungsstatus"] = "umgesetzt"
    else:
        daten["umsetzungsstatus"] = "in_bearbeitung"


def _bearbeitet(request: Request, vvt_id: str | None = None) -> dict:
    """Wer, wann, und auf welchem Stand der VVT — damit Nexus später
    erkennen kann, dass die Ableitung veraltet sein könnte."""
    wer = request.headers.get("x-forwarded-user", "").strip() or \
        ("lokal" if config.AUTH_MODUS == "aus" else "unbekannt")
    b = {"am": date.today().isoformat(), "durch": wer}
    if vvt_id:
        vdatei = config.VVT_DIR / f"{vvt_id}.md"
        if vdatei.exists():
            v = parser.parse_vvt_md(vvt_id, vdatei.read_text(encoding="utf-8"))
            b["vvt_stand"] = str(v.get("letzte_aktualisierung") or "")
    return b


def _umsetzung_speichern(datei: Path, daten: dict, eingabe, erlaubt, rechnen,
                         request: Request, vvt_id: str | None, nachricht: str,
                         begruendung: str | None) -> dict:
    vorher = json.dumps(daten, ensure_ascii=False, sort_keys=True)
    _umsetzung_uebernehmen(daten, eingabe, erlaubt)
    rechnen(daten)
    if json.dumps(daten, ensure_ascii=False, sort_keys=True) == vorher:
        return {"ok": True, "gespeichert": False, "datei": daten}
    daten["bearbeitet"] = _bearbeitet(request, vvt_id)
    # Schreibweise wie die Generatoren (json.dump, indent 2, ohne Zeilenende)
    datei.write_text(json.dumps(daten, indent=2, ensure_ascii=False), encoding="utf-8")
    git_service.commit([datei], nachricht, begruendung=begruendung)
    return {"ok": True, "gespeichert": True, "datei": daten}


def _koerper_begruendung(koerper: dict) -> str | None:
    b = koerper.get("_begruendung")
    return b.strip() if isinstance(b, str) and b.strip() else None


@router.put("/_baseline/umsetzung", summary="Umsetzungsstand der organisationsweiten Maßnahmen")
async def put_baseline_umsetzung(request: Request) -> dict:
    datei = config.DATA_DIR / BASELINE[0] / BASELINE[1]
    daten = _lies(datei) if datei.exists() else None
    if daten is None:
        raise HTTPException(404, detail="baseline-organisation.json nicht gefunden")
    koerper = await request.json()
    return _umsetzung_speichern(datei, daten, koerper.get("massnahmen"), _ids(daten.get("toms")),
                                _baseline_rechnen, request, None,
                                "Baseline: Umsetzung organisationsweiter Maßnahmen aktualisiert",
                                _koerper_begruendung(koerper))


@router.put("/{vvt_id}/tom/umsetzung", summary="Umsetzungsstand der Maßnahmen einer VVT")
async def put_tom_umsetzung(vvt_id: str, request: Request) -> dict:
    if not _ID_RE.match(vvt_id):
        raise HTTPException(400, detail=f"Ungültige Kennung: {vvt_id!r}")
    datei = config.DATA_DIR / "tom" / f"tom-{vvt_id}.json"
    daten = _lies(datei) if datei.exists() else None
    if daten is None:
        raise HTTPException(404, detail=f"tom-{vvt_id}.json nicht gefunden")
    # Geplant werden die Soll-Maßnahmen und die zusätzlich empfohlenen
    # Maßnahmen der ergänzenden Analyse (Schritt 7).
    erg = config.DATA_DIR / "tom" / f"ergaenzend-{vvt_id}.json"
    zusatz = _ids((_lies(erg) or {}).get("zusatz_toms")) if erg.exists() else []
    erlaubt = _ids(daten.get("soll")) + [i for i in zusatz if i not in _ids(daten.get("soll"))]
    koerper = await request.json()
    return _umsetzung_speichern(datei, daten, koerper.get("massnahmen"), erlaubt,
                                _tom_rechnen, request, vvt_id,
                                f"TOM {vvt_id}: Umsetzung aktualisiert",
                                _koerper_begruendung(koerper))


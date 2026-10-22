"""
koos_auskunft.py — Bestandsauskunft für den KOOS-MCP-Dienst
============================================================
Beantwortet für genau den Mandanten, dem der laufenden Dienst gehört: Welche Daten
liegen in KOOS vor (Anzahl je Bereich), wie sind sie verteilt (Schutzstufen, Typen,
Status), welche Suchwerkzeuge gibt es, und ist der geladene Stand noch aktuell?

Der Dienst lädt die Daten beim Start (siehe KoosLoader.load_all). Was danach im
Web-UI angelegt oder geändert wird, sieht der Chat erst nach einem Neustart. Diese
Auskunft vergleicht deshalb den geladenen Stand mit den Dateien auf der Platte und
sagt es, wenn beides auseinanderläuft.

Aus koos.yaml wird ausschließlich der Organisationsname gelesen (nicht die Nutzer-
und Passwortangaben). Reine Standardbibliothek. Wirft nie.
"""

import datetime
from collections import Counter
from pathlib import Path

# Zeitpunkt des Dienststarts (Modul wird beim Start importiert, vor dem Laden der Daten).
_START = datetime.datetime.now().timestamp()

_ORDNER = ("prozesse", "daten", "regelungen", "vvt")


def _text(v) -> str:
    return "–" if v is None or str(v).strip() == "" else str(v)


def _verteilung(werte) -> str:
    c = Counter(_text(w) for w in werte)
    return ", ".join(f"{k} {n}" for k, n in sorted(c.items(), key=lambda kv: (-kv[1], kv[0])))


def _schutzstufe(datenart: dict):
    k = datenart.get("klassifizierung")
    return k.get("schutzstufe") if isinstance(k, dict) else None


_ABK = {"art", "abs", "nr", "bzw", "ggf", "ca", "vgl", "z", "b", "u", "a", "s", "ff", "evtl", "inkl", "bspw", "usw", "d", "h"}


def _satz(beschreibung: str, maxlen: int = 150) -> str:
    """Erster Satz; Abkürzungen wie „z. B.“ oder „Art.“ beenden ihn nicht."""
    import re
    text = (beschreibung or "").strip()
    ende = len(text)
    for m in re.finditer(r"[.?!]\s", text):
        wort = re.search(r"(\w+)$", text[:m.start()])
        if text[m.start()] == "." and wort and wort.group(1).lower() in _ABK:
            continue
        ende = m.start() + 1
        break
    s = text[:ende].strip()
    return s if len(s) <= maxlen else s[:maxlen - 1].rstrip() + "…"


def _platte(daten_dir: Path):
    """(Anzahl .md je Ordner, Zahl der seit Dienststart geänderten Dateien, jüngste Änderung)."""
    zahlen, geaendert, jung = {}, 0, 0.0
    dateien = []
    for o in _ORDNER:
        d = daten_dir / o
        fs = sorted(d.glob("*.md")) if d.is_dir() else []
        zahlen[o] = len(fs)
        dateien += fs
    for name in ("orga.yaml", "koos.yaml"):
        if (daten_dir / name).is_file():
            dateien.append(daten_dir / name)
    for f in dateien:
        try:
            t = f.stat().st_mtime
        except OSError:
            continue
        jung = max(jung, t)
        if t > _START:
            geaendert += 1
    return zahlen, geaendert, jung


def bestand(loader, tools=(), brand: str = "Nexus") -> str:
    try:
        cfg = loader.koos_config if isinstance(loader.koos_config, dict) else {}
        org = cfg.get("organisation") if isinstance(cfg.get("organisation"), dict) else {}
        name = org.get("name") or "dieser Organisation"
        pro, dat, reg, vvt = loader.prozesse, loader.daten, loader.regelungen, loader.vvt
        oe = loader.orga if isinstance(loader.orga, list) else [loader.orga]
        if not (oe or pro or dat or reg or vvt):
            return f"Für {name} sind in {brand} derzeit keine KOOS-Daten geladen."

        z = [f"**Bestand von {name} in {brand} (KOOS)**", ""]
        z.append(f"- Organisationseinheiten: {len(oe)}")
        z.append(f"- Prozesse: {len(pro)} gesamt")
        z.append(f"  - nach Status: {_verteilung(p.get('status') for p in pro)}")
        z.append(f"  - nach Bereich: {_verteilung(p.get('bereich') for p in pro)}")
        z.append(f"  - mit LeiKa-ID: {sum(1 for p in pro if p.get('leika_id'))} von {len(pro)}")
        z.append(f"  - mit OZG-ID: {sum(1 for p in pro if p.get('ozg_id'))} von {len(pro)}")
        z.append(f"- Datenarten (Datenspeicher): {len(dat)} gesamt")
        z.append(f"  - nach Schutzstufe: {_verteilung(_schutzstufe(d) for d in dat)}")
        z.append(f"- Verarbeitungstätigkeiten (VVT): {len(vvt)} gesamt")
        z.append(f"  - nach Status: {_verteilung(v.get('status') for v in vvt)}")
        z.append(f"- Regelungen: {len(reg)} gesamt")
        z.append(f"  - nach Typ: {_verteilung(r.get('typ') for r in reg)}")
        z.append(f"  - nach Status: {_verteilung(r.get('status') for r in reg)}")
        z.append("Jede Aufteilung ergibt zusammen die Gesamtzahl des Bereichs.")

        zahlen, geaendert, jung = _platte(Path(loader.data_dir))
        geladen = {"prozesse": len(pro), "daten": len(dat), "regelungen": len(reg), "vvt": len(vvt)}
        z.append("")
        start = datetime.datetime.fromtimestamp(_START).strftime("%d.%m.%Y %H:%M")
        z.append(f"**Stand:** Der Chat-Dienst hat diese Daten beim Start am {start} geladen.")
        if jung:
            z.append(f"Letzte Änderung an den Dateien: {datetime.datetime.fromtimestamp(jung).strftime('%d.%m.%Y %H:%M')}.")
        abw = [f"{o}: geladen {geladen[o]}, auf der Platte {zahlen[o]}" for o in _ORDNER if zahlen[o] != geladen[o]]
        if abw or geaendert:
            z.append("**Achtung, nicht aktuell:** "
                     + (f"{geaendert} Datei(en) wurden seit dem Start geändert. " if geaendert else "")
                     + (("Abweichende Anzahl (" + "; ".join(abw) + "). ") if abw else "")
                     + "Änderungen aus dem Web-UI erscheinen im Chat erst nach einem Neustart des KOOS-Chat-Dienstes.")
        else:
            z.append("Die Dateien auf der Platte entsprechen dem geladenen Stand.")

        if tools:
            z.append("")
            z.append("**Suchwerkzeuge für diese Daten:**")
            for t in tools:
                n = getattr(t, "name", "")
                if n.startswith("koos_") and n != "koos_bestand":
                    z.append(f"- `{n}`: {_satz(getattr(t, 'description', ''))}")
        z.append("")
        z.append("Hinweis: Diese Zahlen stammen aus den geladenen KOOS-Daten. Zahlen unverändert und vollständig wiedergeben, nichts umrechnen oder weglassen; darüber hinaus nichts über den Bestand behaupten.")
        return "\n".join(z)
    except Exception as ex:  # nie den Dienst stören
        return f"Die Bestandsauskunft ist gerade nicht verfügbar ({type(ex).__name__})."

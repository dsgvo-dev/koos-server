#!/usr/bin/env python3
"""
koos_embed.py — Eigenständiger Embedding-Index für KOOS-Stammdaten
====================================================================
Baut/aktualisiert einen semantischen Suchindex über proc-*, vvt-*, dstore-*,
reg-* (koos-knowledge/_daten/). Bewusst getrennt von dsms-knowledge/chroma_index.py
(reine DSMS-Wissensschicht: Urteile, Gesetze, Wiki — kennt KOOS nicht) und
von dsms-knowledge/skills/nervensystem-sim/ (reine Simulation, kein
Produktionscode) — damit DSMS und KOOS unabhängig voneinander ausliefer-
und betreibbar bleiben.

Kein neuer Dependency: kein ChromaDB, nur stdlib + die KOOS-eigene
KoosLoader-Ladefunktion (aus koos_mcp.py, keine doppelte Parse-Logik) +
Ollama über HTTP (bge-m3, gleiches Modell wie im übrigen Projekt).

Verwendung:
    python3 koos_embed.py                              # Index bauen
    python3 koos_embed.py --data-dir _daten             # explizites Datenverzeichnis
    python3 koos_embed.py --query "Wohngeld beantragen" # Testabfrage gegen bestehenden Index
    python3 koos_embed.py --query "Umzug" --typ vvt     # Testabfrage, nur VVT

Voraussetzung für den Indexbau: lokal laufendes Ollama mit bge-m3
(ollama pull bge-m3). Ohne laufenden Index liefert search_semantic() eine
leere Liste statt eines Fehlers — koos_mcp.py bleibt so auch ohne gebauten
Embedding-Index voll funktionsfähig (reine Keyword-Suche als Fallback).
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.request
from pathlib import Path

from koos_mcp import KoosLoader

BASE_DIR = Path(__file__).parent.resolve()
# koos_embed.py liegt seit 11.07.2026 in _server/ (zusammen mit koos_mcp.py);
# die echten Daten (_daten/) liegen eine Ebene höher.
KOOS_ROOT = BASE_DIR.parent
INDEX_PATH = BASE_DIR / ".koos-embed" / "index.json"
EMBED_MODEL = "bge-m3"
EMBED_URL = "http://localhost:11434"


# ══════════════════════════════════════════════════════════════════════════════
# EMBEDDING (Ollama)
# ══════════════════════════════════════════════════════════════════════════════

def _embed(text: str, model_url: str = EMBED_URL, model: str = EMBED_MODEL) -> list[float]:
    """Ruft ein Ollama-Embedding ab. Unterstützt sowohl die neuere
    /api/embed- als auch die ältere /api/embeddings-Schnittstelle."""
    payload = json.dumps({"model": model, "input": text}).encode("utf-8")
    req = urllib.request.Request(
        f"{model_url}/api/embed", data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            embs = data.get("embeddings")
            if embs:
                return embs[0]
    except Exception:
        pass

    payload = json.dumps({"model": model, "prompt": text}).encode("utf-8")
    req = urllib.request.Request(
        f"{model_url}/api/embeddings", data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read()).get("embedding", []) or []


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ══════════════════════════════════════════════════════════════════════════════
# EMBEDDING-TEXT je Item-Typ
# ══════════════════════════════════════════════════════════════════════════════

def _vvt_by_prozess(vvt_liste: list[dict]) -> dict[str, list[dict]]:
    """proc-id -> Liste zugehöriger VVT-Einträge (über das prozesse:-Feld)."""
    m: dict[str, list[dict]] = {}
    for v in vvt_liste:
        for pid in (v.get("prozesse") or []):
            m.setdefault(pid, []).append(v)
    return m


def _text_prozess(p: dict, vvt_map: dict[str, list[dict]]) -> str:
    teile = [p.get("titel", ""), p.get("zustaendigeRolle", "") or ""]
    for v in vvt_map.get(p.get("id"), []):
        teile.append(v.get("rechtsgrundlage", "") or "")
        teile.append(v.get("kategorien_daten", "") or "")
        teile.append(v.get("loeschfrist", "") or "")
    return " ".join(t for t in teile if t)


def _text_vvt(v: dict) -> str:
    teile = [
        v.get("titel", ""),
        v.get("zweck", "") or "",
        v.get("rechtsgrundlage", "") or "",
        v.get("kategorien_daten", "") or "",
    ]
    return " ".join(t for t in teile if t)


def _text_dstore(d: dict) -> str:
    tags = d.get("tags", []) or []
    teile = [
        d.get("name", ""),
        d.get("datenkategorie", "") or "",
        " ".join(str(t) for t in tags),
    ]
    return " ".join(t for t in teile if t)


def _text_regelung(r: dict) -> str:
    """Nachgezogen am 20.07.2026 zusammen mit koos_search_regelung: ohne
    diesen Eintrag hätte die Hybrid-Suche (semantische Ergänzung bei wenigen
    Keyword-Treffern) für Regelungen keinen Index, gegen den sie suchen
    kann — ein realer Test zeigte, dass die reine Substring-Keyword-Suche
    bei abweichender Formulierung der Anfrage (z. B. eine ganze Nutzerfrage
    statt eines einzelnen Begriffs) leer läuft, obwohl die passende
    Dienstanweisung (reg-da-e-mail-001) vorhanden ist."""
    # Kein Cap unter 15000: die längsten aktuellen Regelungen (z. B. die
    # ADGA) haben ~13-14 Tausend Zeichen Body — ein 1000-Zeichen-Cap hätte
    # exakt denselben Fehler wiederholt, der gerade erst in
    # _load_markdown_dir() (koos_mcp.py) behoben wurde: der fachlich
    # relevante Teil (z. B. eine Tabelle) steht oft erst weiter hinten im
    # Dokument und wäre sonst für die Embedding-Suche unsichtbar.
    teile = [
        r.get("name", ""),
        r.get("typ", "") or "",
        r.get("kontext", "") or "",
        r.get("entscheidung", "") or "",
        (r.get("body", "") or "")[:15000],
    ]
    return " ".join(t for t in teile if t)


# ══════════════════════════════════════════════════════════════════════════════
# INDEX BAUEN
# ══════════════════════════════════════════════════════════════════════════════

def build_index(data_dir: Path, model_url: str = EMBED_URL,
                 model: str = EMBED_MODEL, out_path: Path = INDEX_PATH) -> list[dict]:
    loader = KoosLoader(data_dir)
    loader.load_all()
    vvt_map = _vvt_by_prozess(loader.vvt)

    quellen: list[tuple[str, str | None, str]] = []
    for p in loader.prozesse:
        quellen.append(("proc", p.get("id"), _text_prozess(p, vvt_map)))
    for v in loader.vvt:
        quellen.append(("vvt", v.get("id"), _text_vvt(v)))
    for d in loader.daten:
        quellen.append(("dstore", d.get("id"), _text_dstore(d)))
    for r in loader.regelungen:
        quellen.append(("reg", r.get("id"), _text_regelung(r)))

    print(f"KOOS-Embedding-Index: {len(quellen)} Items "
          f"({model} via {model_url}) ...")

    index: list[dict] = []
    fehler = 0
    for i, (typ, iid, text) in enumerate(quellen):
        if not iid or not text.strip():
            continue
        try:
            vec = _embed(text, model_url, model)
        except Exception as e:
            fehler += 1
            if fehler <= 3:
                print(f"  ⚠ Embedding-Fehler bei {iid}: {e}", file=sys.stderr)
            continue
        if vec:
            index.append({"id": iid, "typ": typ, "text": text[:300], "vector": vec})
        if (i + 1) % 50 == 0 or i == len(quellen) - 1:
            print(f"  [{i + 1}/{len(quellen)}]", end="\r", flush=True)
    print()

    if fehler:
        print(f"  ⚠ {fehler} Items konnten nicht eingebettet werden "
              f"(Ollama nicht erreichbar? Modell '{model}' nicht gepullt?)",
              file=sys.stderr)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"model": model, "items": index}, f, ensure_ascii=False)
    print(f"Index geschrieben: {out_path} ({len(index)} Einträge, "
          f"davon {sum(1 for it in index if it['typ'] == 'proc')} Prozesse, "
          f"{sum(1 for it in index if it['typ'] == 'vvt')} VVT, "
          f"{sum(1 for it in index if it['typ'] == 'dstore')} Datenarten, "
          f"{sum(1 for it in index if it['typ'] == 'reg')} Regelungen)")
    return index


# ══════════════════════════════════════════════════════════════════════════════
# SEMANTISCHE SUCHE (für koos_mcp.py)
# ══════════════════════════════════════════════════════════════════════════════

_cache: dict | None = None


def _load_index(path: Path = INDEX_PATH) -> dict | None:
    global _cache
    if _cache is not None:
        return _cache
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            _cache = json.load(f)
    except Exception:
        return None
    return _cache


def index_verfuegbar(path: Path = INDEX_PATH) -> bool:
    return path.exists()


def search_semantic(query: str, typ: str | None = None, top_k: int = 10,
                     min_score: float = 0.35, model_url: str = EMBED_URL) -> list[dict]:
    """Semantische Suche gegen den vorgebauten Index.

    Liefert bewusst eine leere Liste statt eines Fehlers, wenn kein Index
    existiert oder Ollama nicht erreichbar ist — koos_mcp.py bleibt dadurch
    auch ohne gebauten Embedding-Index voll funktionsfähig (Keyword-Suche
    als Basis, semantische Suche als optionale Ergänzung, kein harter
    Ollama-Zwang in Produktion, vgl. Nervensystem-Konzept 7.1 "Bring Your
    Own AI").
    """
    idx = _load_index()
    if not idx or not idx.get("items"):
        return []
    try:
        qvec = _embed(query, model_url, idx.get("model", EMBED_MODEL))
    except Exception:
        return []
    if not qvec:
        return []

    kandidaten = idx["items"] if not typ else [it for it in idx["items"] if it["typ"] == typ]
    scored = [(it, _cosine(qvec, it["vector"])) for it in kandidaten]
    scored = [s for s in scored if s[1] >= min_score]
    scored.sort(key=lambda s: s[1], reverse=True)
    return [
        {"id": it["id"], "typ": it["typ"], "score": round(score, 3)}
        for it, score in scored[:top_k]
    ]


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(description="KOOS Embedding-Index")
    ap.add_argument("--data-dir", default=str(KOOS_ROOT / "_daten"),
                     help="KOOS-Datenverzeichnis (Default: koos-knowledge/_daten)")
    ap.add_argument("--query", help="Testabfrage gegen den bestehenden Index, "
                                     "statt den Index neu zu bauen")
    ap.add_argument("--typ", choices=["proc", "vvt", "dstore", "reg"],
                     help="Filter für --query")
    args = ap.parse_args()

    if args.query:
        treffer = search_semantic(args.query, typ=args.typ)
        print(json.dumps(treffer, ensure_ascii=False, indent=2))
        return

    build_index(Path(args.data_dir))


if __name__ == "__main__":
    main()

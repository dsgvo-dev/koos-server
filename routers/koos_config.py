"""
KOOS Server – Router: Konfiguration
GET  /api/config           → Auth-Konfiguration aus koos.yaml (superadminHash, subadmins)
GET  /api/config/dashboard → Kombinierten Stats-Überblick für das Admin-Dashboard
"""
from __future__ import annotations
from collections import Counter
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import yaml

import config
from services import parser

router = APIRouter(prefix="/api/config", tags=["Konfiguration"])


def _lade_koos_yaml() -> dict:
    """Liest koos.yaml und gibt den geparsten Inhalt zurück."""
    if not (config.DATA_DIR / "koos.yaml").exists():
        return {}
    text = (config.DATA_DIR / "koos.yaml").read_text(encoding="utf-8")
    return yaml.safe_load(text) or {}


@router.get("", summary="Auth-Konfiguration aus koos.yaml")
def get_config() -> dict:
    """
    Gibt die für die Browser-App benötigte Auth-Konfiguration zurück.
    Entspricht dem hardcodierten CONFIG-Block in preview.html,
    wird aber live aus koos.yaml gelesen.

    Sicherheitshinweis: Die Passwort-Hashes (SHA-256) sind dieselben
    die ohnehin im HTML-Quelltext stehen — kein zusätzliches Risiko.
    """
    daten = _lade_koos_yaml()
    bear  = daten.get("bearbeitung") or {}
    sa    = bear.get("superadmin") or {}

    superadmin_hash = sa.get("passwort-hash", "")

    subadmins = []
    for sub in (bear.get("subadmins") or []):
        subadmins.append({
            "id":            sub.get("id", ""),
            "name":          sub.get("name", ""),
            "hash":          sub.get("passwort-hash", ""),
            "zustaendigFuer": sub.get("zustaendig-fuer", []),
        })

    # Organisationsinformationen
    org = daten.get("organisation") or {}
    ap  = org.get("ansprechpartner") or {}

    return {
        "superadminHash": superadmin_hash,
        "subadmins":      subadmins,
        "organisation": {
            "name":              org.get("name", ""),
            "kurzname":          org.get("kurzname", ""),
            "rechtsform":        org.get("rechtsform", ""),
            "rechtsgrundlage":   org.get("rechtsgrundlage", ""),
            "gemeindeschluessel":org.get("gemeindeschluessel", ""),
            "bundesland":        org.get("bundesland", ""),
            "kreis":             org.get("kreis", ""),
            "ansprechpartner": {
                "name":  ap.get("name", ""),
                "email": ap.get("email", ""),
            },
        },
    }


@router.get("/dashboard", summary="Kombinierten Stats-Überblick für Admin-Dashboard")
def get_dashboard() -> dict:
    """
    Aggregiert alle Statistik-Endpunkte in einem einzigen Request
    für das Admin-Dashboard.  Enthält Übersicht, Datenqualität und Verteilungen.
    """
    prozesse   = parser.lade_alle_prozesse(config.PROZESSE_DIR)
    daten      = parser.lade_alle_daten(config.DATEN_DIR)
    regelungen = parser.lade_alle_regelungen(config.REGELUNGEN_DIR)

    orga_count = 0
    if config.ORGA_FILE.exists():
        orga_count = len(parser.parse_orga_yaml(
            config.ORGA_FILE.read_text(encoding="utf-8")
        ))

    # ── Prozesse ──────────────────────────────────────────────────────────────
    p_aktiv           = sum(1 for p in prozesse if (p.get("status") or "aktiv") == "aktiv")
    p_ohne_einheit    = [p for p in prozesse if not p.get("zustaendigeEinheit")]
    p_ohne_ds         = [p for p in prozesse
                         if not p.get("daten", {}).get("datenspeicher")]
    p_ohne_regelungen = [p for p in prozesse if not p.get("regelungen")]

    # ── Datenspeicher ─────────────────────────────────────────────────────────
    alle_ds_ids: set[str] = set()
    for p in prozesse:
        for e in (p.get("daten", {}).get("datenspeicher") or []):
            if isinstance(e, dict):
                alle_ds_ids.add(e.get("id", ""))
            elif isinstance(e, str):
                alle_ds_ids.add(e)
    alle_ds_ids.discard("")

    d_ohne_prozess     = [d for d in daten if d["id"] not in alle_ds_ids]
    d_ohne_schutzstufe = [d for d in daten if not d.get("schutzstufe")]
    d_ohne_schutzbedarf= [d for d in daten if not d.get("schutzbedarf")]
    d_ohne_vertraulich = [d for d in daten if not d.get("vertraulichkeit")]
    d_ohne_system      = [d for d in daten if not d.get("system")]
    d_ohne_aufbewahrung= [d for d in daten if not d.get("aufbewahrung", {}).get("frist")]

    def _pct(n, total):
        return round(100 * n / total, 1) if total else 0

    def _top(items, key, n=5):
        return [{"id": d["id"], "name": d[key]} for d in items[:n]]

    return {
        # ── Übersicht ──────────────────────────────────────────────────────
        "uebersicht": {
            "prozesse":   len(prozesse),
            "prozesse_aktiv": p_aktiv,
            "datenspeicher": len(daten),
            "einheiten":  orga_count,
            "regelungen": len(regelungen),
        },

        # ── Prozess-Qualität ───────────────────────────────────────────────
        "prozesse": {
            "ohne_einheit": {
                "anzahl": len(p_ohne_einheit),
                "prozent": _pct(len(p_ohne_einheit), len(prozesse)),
                "beispiele": [{"id": p["id"], "name": p["titel"]} for p in p_ohne_einheit[:5]],
            },
            "ohne_datenspeicher": {
                "anzahl": len(p_ohne_ds),
                "prozent": _pct(len(p_ohne_ds), len(prozesse)),
                "beispiele": [{"id": p["id"], "name": p["titel"]} for p in p_ohne_ds[:5]],
            },
            "ohne_regelungen": {
                "anzahl": len(p_ohne_regelungen),
                "prozent": _pct(len(p_ohne_regelungen), len(prozesse)),
                "beispiele": [{"id": p["id"], "name": p["titel"]} for p in p_ohne_regelungen[:5]],
            },
            "verteilung_status": dict(
                Counter((p.get("status") or "aktiv") for p in prozesse)
            ),
        },

        # ── Datenspeicher-Qualität ─────────────────────────────────────────
        "daten": {
            "ohne_prozess": {
                "anzahl": len(d_ohne_prozess),
                "prozent": _pct(len(d_ohne_prozess), len(daten)),
                "beispiele": _top(d_ohne_prozess, "name"),
            },
            "ohne_schutzstufe": {
                "anzahl": len(d_ohne_schutzstufe),
                "prozent": _pct(len(d_ohne_schutzstufe), len(daten)),
                "beispiele": _top(d_ohne_schutzstufe, "name"),
            },
            "ohne_schutzbedarf": {
                "anzahl": len(d_ohne_schutzbedarf),
                "prozent": _pct(len(d_ohne_schutzbedarf), len(daten)),
                "beispiele": _top(d_ohne_schutzbedarf, "name"),
            },
            "ohne_vertraulichkeit": {
                "anzahl": len(d_ohne_vertraulich),
                "prozent": _pct(len(d_ohne_vertraulich), len(daten)),
                "beispiele": _top(d_ohne_vertraulich, "name"),
            },
            "ohne_system": {
                "anzahl": len(d_ohne_system),
                "prozent": _pct(len(d_ohne_system), len(daten)),
                "beispiele": _top(d_ohne_system, "name"),
            },
            "ohne_aufbewahrung": {
                "anzahl": len(d_ohne_aufbewahrung),
                "prozent": _pct(len(d_ohne_aufbewahrung), len(daten)),
                "beispiele": _top(d_ohne_aufbewahrung, "name"),
            },
            "verteilung_schutzstufe": dict(
                Counter((d.get("schutzstufe") or "—") for d in daten)
            ),
            "verteilung_schutzbedarf": dict(
                Counter((d.get("schutzbedarf") or "—") for d in daten)
            ),
            "verteilung_vertraulichkeit": dict(
                Counter((d.get("vertraulichkeit") or "—") for d in daten)
            ),
            "verteilung_typ": dict(
                Counter((d.get("typ") or "datenspeicher") for d in daten)
            ),
        },
    }

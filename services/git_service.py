"""
KOOS Server – Git-Audit-Trail
Jede Schreiboperation (PUT, DELETE) wird als Git-Commit im DATA_DIR protokolliert.
Schlägt Git fehl (kein Repo, kein git), läuft die API trotzdem weiter — Git ist
optional beim ersten Start und kann nachträglich initialisiert werden.
"""
from __future__ import annotations
import logging
import subprocess
from pathlib import Path

from config import DATA_DIR, GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL

log = logging.getLogger("koos.git")


def _run(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def git_init_wenn_noetig(data_dir: Path = DATA_DIR) -> None:
    """
    Initialisiert ein Git-Repository im data_dir, falls noch keines vorhanden ist.
    Wird beim Start des Servers aufgerufen.
    """
    git_dir = data_dir / ".git"
    if git_dir.is_dir():
        log.info("Git-Repository vorhanden: %s", data_dir)
        return
    result = _run(["git", "init"], cwd=data_dir)
    if result.returncode == 0:
        log.info("Git-Repository initialisiert: %s", data_dir)
        # Initialer Commit mit vorhandenem Stand
        _run(["git", "add", "-A"], cwd=data_dir)
        _run(
            [
                "git", "commit", "--allow-empty", "-m",
                "chore: KOOS-Server initialisiert",
                f"--author={GIT_AUTHOR_NAME} <{GIT_AUTHOR_EMAIL}>",
            ],
            cwd=data_dir,
        )
    else:
        log.warning("Git-Init fehlgeschlagen: %s", result.stderr)


def commit(
    pfade: list[str | Path],
    nachricht: str,
    autor_name: str | None = None,
    autor_email: str | None = None,
    begruendung: str | None = None,
    data_dir: Path = DATA_DIR,
) -> bool:
    """
    Staged die angegebenen Pfade und erstellt einen Commit.
    Gibt True zurück, wenn der Commit erfolgreich war.

    pfade: Dateipfade relativ zu data_dir (oder absolut)
    nachricht: Commit-Nachricht (wird mit Präfix 'koos: ' versehen)
    autor_name/email: überschreiben GIT_AUTHOR_* aus config.py
    begruendung: optionale Begründung — wird als Commit-Body angehängt
    """
    name  = autor_name  or GIT_AUTHOR_NAME
    email = autor_email or GIT_AUTHOR_EMAIL

    # Commit-Nachricht: Titel + optionaler Body
    commit_msg = f"koos: {nachricht}"
    if begruendung and begruendung.strip():
        commit_msg += f"\n\nBegründung: {begruendung.strip()}"

    # Relative Pfade sicherstellen
    rel_pfade = []
    for p in pfade:
        p = Path(p)
        try:
            rel_pfade.append(str(p.relative_to(data_dir)))
        except ValueError:
            rel_pfade.append(str(p))

    # git add
    add_result = _run(["git", "add", "--"] + rel_pfade, cwd=data_dir)
    if add_result.returncode != 0:
        log.warning("git add fehlgeschlagen: %s", add_result.stderr)
        return False

    # git commit
    commit_result = _run(
        [
            "git", "commit",
            "-m", commit_msg,
            f"--author={name} <{email}>",
        ],
        cwd=data_dir,
    )
    if commit_result.returncode != 0:
        # "nothing to commit" ist kein Fehler
        if "nothing to commit" in commit_result.stdout:
            return True
        log.warning("git commit fehlgeschlagen: %s", commit_result.stderr)
        return False

    log.info("Commit: %s", nachricht)
    return True


def log_lesen(n: int = 50, data_dir: Path = DATA_DIR) -> list[dict]:
    """
    Gibt die letzten n Commits als Liste von Dicts zurück.
    Format: [{
        "hash": str, "autor": str, "datum": str,
        "nachricht": str,     # Subject (erste Zeile)
        "begruendung": str,   # Body-Zeile "Begründung: ..." wenn vorhanden
    }]
    """
    # %B = vollständige Commit-Nachricht (Subject + Body)
    result = _run(
        [
            "git", "log",
            f"-{n}",
            "--pretty=format:%H\x1f%an\x1f%ai\x1f%s\x1f%b\x1e",
        ],
        cwd=data_dir,
    )
    if result.returncode != 0:
        return []

    eintraege = []
    for block in result.stdout.split("\x1e"):
        block = block.strip()
        if not block:
            continue
        teile = block.split("\x1f", 4)
        if len(teile) < 4:
            continue
        # Begründung aus dem Body extrahieren
        body = teile[4].strip() if len(teile) > 4 else ""
        begruendung = ""
        for zeile in body.splitlines():
            if zeile.startswith("Begründung:"):
                begruendung = zeile.removeprefix("Begründung:").strip()
                break
        eintraege.append({
            "hash":        teile[0],
            "autor":       teile[1],
            "datum":       teile[2],
            "nachricht":   teile[3],
            "begruendung": begruendung,
        })
    return eintraege


def diff_lesen(commit_hash: str, data_dir: Path = DATA_DIR) -> str:
    """
    Gibt den unified diff eines einzelnen Commits als Text zurück.
    """
    result = _run(
        ["git", "show", "--stat", "-p", "--no-color", commit_hash],
        cwd=data_dir,
    )
    if result.returncode != 0:
        return ""
    return result.stdout


def commit_dateien(commit_hash: str, data_dir: Path = DATA_DIR) -> list[str]:
    """
    Gibt die Liste der in einem Commit geänderten Dateien zurück (relative Pfade).
    """
    result = _run(
        ["git", "diff-tree", "--no-commit-id", "-r", "--name-only", commit_hash],
        cwd=data_dir,
    )
    if result.returncode != 0:
        return []
    return [p.strip() for p in result.stdout.splitlines() if p.strip()]


def revert_commit(
    commit_hash: str,
    autor_name: str | None = None,
    autor_email: str | None = None,
    data_dir: Path = DATA_DIR,
) -> tuple[bool, str]:
    """
    Macht die Änderungen eines einzelnen Commits rückgängig, indem die betroffenen
    Dateien auf den Zustand des Eltern-Commits zurückgesetzt werden.
    Erstellt dabei einen neuen Commit, die Historie bleibt erhalten.

    Gibt (True, "") bei Erfolg oder (False, fehlermeldung) zurück.
    """
    name  = autor_name  or GIT_AUTHOR_NAME
    email = autor_email or GIT_AUTHOR_EMAIL

    # 1. Geänderte Dateien ermitteln
    dateien = commit_dateien(commit_hash, data_dir)
    if not dateien:
        return False, f"Keine Dateien in Commit {commit_hash} gefunden"

    # 2. Eltern-Commit ermitteln
    parent_result = _run(["git", "rev-parse", f"{commit_hash}^"], cwd=data_dir)
    if parent_result.returncode != 0:
        return False, "Initialer Commit kann nicht rückgängig gemacht werden"
    parent_hash = parent_result.stdout.strip()

    # 3. Dateien auf Stand des Eltern-Commits zurücksetzen
    for datei in dateien:
        checkout_result = _run(
            ["git", "checkout", parent_hash, "--", datei],
            cwd=data_dir,
        )
        if checkout_result.returncode != 0:
            # Datei existierte im Eltern-Commit nicht → wurde neu angelegt → löschen
            _run(["git", "rm", "--cached", "--", datei], cwd=data_dir)
            pfad = data_dir / datei
            if pfad.exists():
                pfad.unlink()

    # 4. Original-Nachricht des zurückgesetzten Commits holen
    msg_result = _run(
        ["git", "log", "-1", "--pretty=format:%s", commit_hash],
        cwd=data_dir,
    )
    orig_msg = msg_result.stdout.strip() if msg_result.returncode == 0 else commit_hash[:7]

    # 5. Revert-Commit erstellen
    commit_msg = f"koos: Rückgängig: {orig_msg} [{commit_hash[:7]}]"
    commit_result = _run(
        [
            "git", "commit",
            "-m", commit_msg,
            f"--author={name} <{email}>",
        ],
        cwd=data_dir,
    )
    if commit_result.returncode != 0:
        if "nothing to commit" in commit_result.stdout:
            return True, ""
        log.warning("Revert-Commit fehlgeschlagen: %s", commit_result.stderr)
        return False, commit_result.stderr

    log.info("Revert: %s", orig_msg)
    return True, ""

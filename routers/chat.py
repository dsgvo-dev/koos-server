"""
KOOS Server – Router: Chat / KI-Assistent
POST /api/chat          → Frage stellen, Antwort erhalten
GET  /api/chat/status   → Ollama-Verfügbarkeit prüfen
"""
from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services import ollama_service

router = APIRouter(prefix="/api/chat", tags=["KI-Assistent"])


class ChatAnfrage(BaseModel):
    frage:   str
    verlauf: list[dict] | None = None  # [{"role": "user"|"assistant", "content": "..."}]
    modell:  str | None = None         # Optionales Modell — überschreibt OLLAMA_MODEL


class ChatAntwort(BaseModel):
    antwort: str
    modell:  str


@router.post("", summary="Frage an KOOS-Assistenten stellen")
def post_chat(anfrage: ChatAnfrage) -> ChatAntwort:
    """
    Stellt eine Frage an den KI-Assistenten.
    Der Assistent lädt automatisch relevante KOOS-Daten als Kontext.
    """
    modell  = anfrage.modell or ollama_service.config.OLLAMA_MODEL
    antwort = ollama_service.frage_ollama(
        frage=anfrage.frage,
        verlauf=anfrage.verlauf,
        modell=modell,
    )
    return ChatAntwort(antwort=antwort, modell=modell)


@router.post("/stream", summary="Streaming-Antwort (SSE)")
def post_chat_stream(anfrage: ChatAnfrage) -> StreamingResponse:
    """
    Wie POST /api/chat, aber als Server-Sent Events.
    Tokens werden sofort geliefert sobald Ollama sie generiert.
    """
    modell = anfrage.modell or ollama_service.config.OLLAMA_MODEL
    return StreamingResponse(
        ollama_service.stream_ollama(
            frage=anfrage.frage,
            verlauf=anfrage.verlauf,
            modell=modell,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/status", summary="Ollama-Verfügbarkeit prüfen")
def get_status() -> dict:
    """Prüft ob Ollama läuft und welche Modelle verfügbar sind."""
    return ollama_service.ollama_verfuegbar()

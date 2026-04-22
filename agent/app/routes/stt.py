from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, File, UploadFile
from starlette.responses import JSONResponse

from app.config import settings

log = logging.getLogger(__name__)
router = APIRouter()


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> JSONResponse:
    audio_bytes = await audio.read()
    filename = audio.filename or "recording.webm"
    content_type = audio.content_type or "audio/webm"
    log.info("[STT] POST /transcribe size=%d contentType=%s", len(audio_bytes), content_type)
    async with httpx.AsyncClient(timeout=settings.stt_timeout_seconds) as client:
        r = await client.post(
            f"{settings.openai_base_url}/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            files={"file": (filename, audio_bytes, content_type)},
            data={"model": "whisper-1"},
        )
        r.raise_for_status()
    text = r.json().get("text", "")
    log.info("[STT] /transcribe OK textLen=%d", len(text))
    return JSONResponse({"text": text})
